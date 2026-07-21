/**
 * Compare two PDF versions and explain what changed.
 *
 * We extract line-level text from each document and run a longest-common-
 * subsequence diff, yielding added / removed / unchanged lines. The diff
 * itself is fully offline; when an AI endpoint is configured, we additionally
 * ask the model for a short "what changed and why it matters" summary.
 *
 * This is a text-level comparison (not pixel/layout) — the pragmatic, robust
 * choice for "did the contract wording change?" style questions.
 */
import { askAi, type AiConfig, type HostAskHook } from '../ai/aiClient.js';

export interface DiffEntry {
  type: 'same' | 'add' | 'del';
  text: string;
}

// Guard against O(n·m) blowups on huge docs.
const MAX_LINES = 1500;

/** Pull ordered line-text out of a PDF file via pdf.js. */
export async function extractFileLines(file: File): Promise<string[]> {
  // Lazy-load the engine (pulls pdf.js) only when a comparison actually runs,
  // so the pure diff helpers stay importable without it.
  const { loadDocument, getPdfjsDocument } = await import('@pdfcraft/engine');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const handle = await loadDocument(bytes);
  // Public accessor — the handle's internal field is property-mangled in the
  // built engine, so reaching for `handle._internal` by name returns undefined.
  const pdfjsDoc = getPdfjsDocument(handle) as unknown as {
    getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string; transform?: number[] }> }> }>;
  };

  const lines: string[] = [];
  for (let p = 1; p <= handle.pageCount; p++) {
    const page = await pdfjsDoc.getPage(p);
    const tc = await page.getTextContent();
    const byY = new Map<number, Array<{ x: number; str: string }>>();
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform?.[5] ?? 0);
      const row = byY.get(y) ?? [];
      row.push({ x: it.transform?.[4] ?? 0, str: it.str });
      byY.set(y, row);
    }
    for (const y of [...byY.keys()].sort((a, b) => b - a)) {
      const text = byY
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .map((f) => f.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) lines.push(text);
    }
  }
  return lines;
}

/** Classic LCS line diff. Inputs are capped for tractability. */
export function diffLines(aIn: string[], bIn: string[]): DiffEntry[] {
  const a = aIn.slice(0, MAX_LINES);
  const b = bIn.slice(0, MAX_LINES);
  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS length of a[i:], b[j:]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: DiffEntry[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ type: 'del', text: a[i]! });
      i++;
    } else {
      out.push({ type: 'add', text: b[j]! });
      j++;
    }
  }
  while (i < n) out.push({ type: 'del', text: a[i++]! });
  while (j < m) out.push({ type: 'add', text: b[j++]! });
  return out;
}

export interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
}

export function diffStats(entries: DiffEntry[]): DiffStats {
  return {
    added: entries.filter((e) => e.type === 'add').length,
    removed: entries.filter((e) => e.type === 'del').length,
    unchanged: entries.filter((e) => e.type === 'same').length,
  };
}

/** Ask the model to summarize the changes. AI-only; the diff list itself
 *  works offline. */
export async function explainDiff(
  entries: DiffEntry[],
  config: AiConfig,
  onAsk?: HostAskHook,
): Promise<string> {
  const changed = entries.filter((e) => e.type !== 'same');
  const sample = changed.slice(0, 200).map((e) => (e.type === 'add' ? '+ ' : '- ') + e.text).join('\n');
  return askAi({
    messages: [
      {
        role: 'user',
        content: `Here is a line-level diff between an OLD and NEW version of a document. Lines starting with "-" were removed, "+" were added.\n\n${sample}\n\nSummarize what changed in 3–6 bullet points, calling out any changes to amounts, dates, names, or obligations.`,
      },
    ],
    context: '',
    system: 'You explain document changes clearly and concisely. Use plain language. Respond with bullet points only.',
    config,
    onAsk,
  });
}
