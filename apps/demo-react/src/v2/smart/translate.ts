/**
 * In-place translation.
 *
 * For each line-run we obtain a translation, then white-out the original and
 * redraw the translated text at the same position/size (layout preserved as
 * far as a flat overlay allows). Like AI Edit, this is a plan→preview→apply
 * flow — you see every before→after line and confirm before anything changes.
 *
 * Two translators:
 *   • AI translator — batches a page's lines into one request (numbered in,
 *     numbered out). Highest quality; needs a configured endpoint/key.
 *   • On-device translator — the browser's built-in Translator API
 *     (Chrome's on-device models). No key, no network: the offline path.
 */
import type { Annotation } from '../Annotations.js';
import { askAi, type AiConfig, type HostAskHook } from '../ai/aiClient.js';
import { replacementAnnotations, type PageRuns } from './util.js';

export const LANGUAGES = [
  'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Dutch',
  'Chinese (Simplified)', 'Japanese', 'Korean', 'Arabic', 'Hindi', 'Russian', 'English',
];

/** Display name → BCP-47 code, for the on-device API. */
const LANG_CODE: Record<string, string> = {
  Spanish: 'es', French: 'fr', German: 'de', Italian: 'it', Portuguese: 'pt', Dutch: 'nl',
  'Chinese (Simplified)': 'zh', Japanese: 'ja', Korean: 'ko', Arabic: 'ar', Hindi: 'hi',
  Russian: 'ru', English: 'en',
};

export interface TranslateChange {
  page: number;
  before: string;
  after: string;
  annotations: Annotation[];
}

/** Translate a batch of lines, returning a same-length array. */
export type LineTranslator = (lines: string[]) => Promise<string[]>;

// ── AI translator ───────────────────────────────────────────────────────────

const aiSystem = (lang: string) => `You are a professional translator. Translate each numbered line to ${lang}.
Preserve numbers, names, and punctuation. Respond with ONLY the translated
lines, each prefixed with its original number and a period, one per line, in
the same order. Do not add commentary or merge lines.`;

export function aiTranslator(lang: string, config: AiConfig, onAsk?: HostAskHook): LineTranslator {
  return async (lines) => {
    if (lines.length === 0) return [];
    const numbered = lines.map((l, i) => `${i + 1}. ${l}`).join('\n');
    const reply = await askAi({
      messages: [{ role: 'user', content: numbered }],
      context: '',
      system: aiSystem(lang),
      config,
      onAsk,
    });
    return parseNumbered(reply, lines.length);
  };
}

// ── on-device (offline) translator ────────────────────────────────────────────

interface OnDeviceTranslator { translate: (text: string) => Promise<string> }
interface TranslatorFactory {
  create: (o: { sourceLanguage: string; targetLanguage: string }) => Promise<OnDeviceTranslator>;
  availability?: (o: { sourceLanguage: string; targetLanguage: string }) => Promise<string>;
}

/** Is a built-in on-device translator usable for this target language? */
export function onDeviceTranslationSupported(lang: string): boolean {
  if (!LANG_CODE[lang]) return false;
  const g = globalThis as unknown as { Translator?: unknown; translation?: unknown };
  return !!(g.Translator || g.translation);
}

/** Build an on-device translator, or null if unavailable. Source language is
 *  assumed English (the common case); the API requires an explicit source. */
export async function onDeviceTranslator(lang: string, source = 'en'): Promise<LineTranslator | null> {
  const target = LANG_CODE[lang];
  if (!target || target === source) return null;
  const g = globalThis as unknown as {
    Translator?: TranslatorFactory;
    translation?: { createTranslator?: (o: { sourceLanguage: string; targetLanguage: string }) => Promise<OnDeviceTranslator> };
  };
  try {
    if (g.Translator?.create) {
      if (g.Translator.availability) {
        const a = await g.Translator.availability({ sourceLanguage: source, targetLanguage: target });
        if (a === 'unavailable') return null;
      }
      const t = await g.Translator.create({ sourceLanguage: source, targetLanguage: target });
      return (lines) => Promise.all(lines.map((l) => t.translate(l)));
    }
    if (g.translation?.createTranslator) {
      const t = await g.translation.createTranslator({ sourceLanguage: source, targetLanguage: target });
      return (lines) => Promise.all(lines.map((l) => t.translate(l)));
    }
  } catch {
    return null;
  }
  return null;
}

// ── online translator (opt-in — the one path that leaves the device) ──────────

/** A free, no-key translator (MyMemory). Used ONLY with the user's explicit
 *  consent, because it sends the text to a third-party service. Falls back to
 *  the original line on any error so a card is never left half-translated. */
export function onlineTranslator(lang: string, source = 'en'): LineTranslator | null {
  const target = LANG_CODE[lang];
  if (!target || target === source) return null;
  return async (lines) => Promise.all(lines.map(async (l) => {
    if (!l.trim()) return l;
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(l.slice(0, 480))}&langpair=${source}|${target}`;
      const res = await fetch(url);
      if (!res.ok) return l;
      const j = (await res.json()) as { responseData?: { translatedText?: string }; responseStatus?: number };
      const t = j?.responseData?.translatedText;
      return typeof t === 'string' && t.trim() && j.responseStatus === 200 ? t : l;
    } catch { return l; }
  }));
}

// ── planning ──────────────────────────────────────────────────────────────────

/** Translate every page's lines and produce reviewable changes (no apply). */
export async function planTranslation(
  pages: PageRuns[],
  translate: LineTranslator,
  onProgress?: (done: number, total: number) => void,
): Promise<TranslateChange[]> {
  const changes: TranslateChange[] = [];
  for (let p = 0; p < pages.length; p++) {
    const page = pages[p]!;
    const runs = page.runs.filter((r) => r.text.trim().length > 0);
    if (runs.length > 0) {
      const outs = await translate(runs.map((r) => r.text));
      runs.forEach((run, i) => {
        const t = (outs[i] ?? '').trim();
        if (t && t !== run.text.trim()) {
          changes.push({ page: page.page, before: run.text, after: t, annotations: replacementAnnotations(page, run, t) });
        }
      });
    }
    onProgress?.(p + 1, pages.length);
  }
  return changes;
}

/** Parse a "1. text\n2. text" reply back into an index-aligned array. */
function parseNumbered(reply: string, expected: number): string[] {
  const out = new Array<string>(expected).fill('');
  const lines = reply.split('\n').map((l) => l.trim()).filter(Boolean);
  let fallback = 0;
  for (const line of lines) {
    const m = /^(\d+)[.)]\s*(.*)$/.exec(line);
    if (m) {
      const idx = Number(m[1]) - 1;
      if (idx >= 0 && idx < expected) out[idx] = m[2]!;
      fallback = Number(m[1]);
    } else if (fallback < expected) {
      out[fallback] = line;
      fallback++;
    }
  }
  return out;
}
