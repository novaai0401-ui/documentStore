/**
 * Translate a design — swap every text element's copy into another language while
 * keeping the exact layout, colours and fonts. Reuses the app's LineTranslator
 * (on-device browser Translator API when available, else a configured AI endpoint),
 * so it stays private and works offline where the platform supports it. Pure
 * orchestration here (unit-tested with a mock translator); the modal wires the UI.
 */
import type { Design, Element, TextEl } from './model.js';
import type { LineTranslator } from '../smart/translate.js';

/** The text strings of a design's text elements, with their element ids (in order). */
export function collectTexts(d: Design): { ids: string[]; texts: string[] } {
  const ids: string[] = [], texts: string[] = [];
  for (const el of d.elements) if (el.type === 'text' && el.text.trim()) { ids.push(el.id); texts.push(el.text); }
  return { ids, texts };
}

/** Return a new Design with the given per-id text replacements applied. */
export function applyTexts(d: Design, ids: string[], texts: string[]): Design {
  const map = new Map(ids.map((id, i) => [id, texts[i]!]));
  const elements = d.elements.map((el): Element => (el.type === 'text' && map.has(el.id) ? { ...el, text: map.get(el.id)! } as TextEl : el));
  return { ...d, elements };
}

/** Translate every text element of a design, preserving layout. Returns a new
 *  Design; the input is untouched. A no-text design comes back unchanged. */
export async function translateDesign(d: Design, translate: LineTranslator): Promise<Design> {
  const { ids, texts } = collectTexts(d);
  if (!texts.length) return d;
  const out = await translate(texts);
  // Defensive: keep the original line if the translator dropped one.
  const safe = ids.map((_, i) => out[i] ?? texts[i]!);
  return applyTexts(d, ids, safe);
}
