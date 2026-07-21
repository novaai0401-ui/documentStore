/**
 * User-defined snippets — the personal half of the content-tools directory.
 * Custom snippets are authored in any text-bearing editor, persisted to
 * localStorage, and surfaced in the Insert palette alongside the built-in
 * catalog. A custom snippet stores one raw body; the right surface form
 * (Markdown / HTML / plain text / slide / sheet rows) is derived on insert, so
 * a single snippet works in every editor it targets.
 */
import type { DocKind, InsertContent, InsertTool } from './insertTools.js';

const KEY = 'pdfcraft.customTools.v1';
/** Kinds a new snippet targets by default — every text-bearing surface. */
export const CUSTOM_KINDS: DocKind[] = ['markdown', 'text', 'html', 'word', 'pdf', 'slide', 'sheet'];

export interface CustomSnippet {
  id: string;
  label: string;
  body: string;
  kinds: DocKind[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Build the per-surface content for a snippet body. Plain text is treated as
 *  Markdown-compatible; HTML wraps paragraphs; slides/sheets split by line. */
export function contentFromBody(label: string, body: string): InsertContent {
  const html = body.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const lines = body.split('\n').filter((l) => l.trim() !== '');
  return {
    markdown: body,
    text: body,
    html,
    slide: { title: label || (lines[0] ?? 'Slide'), body: lines },
    rows: body.split('\n').map((l) => l.split('\t')),
  };
}

function read(): CustomSnippet[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((s): s is CustomSnippet => s && typeof s.id === 'string' && typeof s.label === 'string' && typeof s.body === 'string' && Array.isArray(s.kinds));
  } catch { return []; }
}

function write(list: CustomSnippet[]): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* quota / disabled — ignore */ }
}

export const loadCustomSnippets = (): CustomSnippet[] => read();

/** Custom snippets applicable to a kind, as InsertTools (group 'business' so
 *  they render in a stable place; the palette labels them as Custom). */
export function customToolsForKind(kind: DocKind): InsertTool[] {
  return read().filter((s) => s.kinds.includes(kind)).map((s) => ({
    id: `custom:${s.id}`,
    label: s.label,
    icon: '★',
    group: 'business',
    kinds: s.kinds,
    content: contentFromBody(s.label, s.body),
  }));
}

export function addCustomSnippet(label: string, body: string, kinds: DocKind[] = CUSTOM_KINDS): CustomSnippet {
  const snippet: CustomSnippet = { id: Math.random().toString(36).slice(2, 10), label: label.trim() || 'Snippet', body, kinds };
  write([...read(), snippet]);
  return snippet;
}

export function deleteCustomSnippet(id: string): void {
  write(read().filter((s) => s.id !== id));
}

const isSnippet = (s: unknown): s is CustomSnippet =>
  !!s && typeof (s as CustomSnippet).label === 'string' && typeof (s as CustomSnippet).body === 'string' && Array.isArray((s as CustomSnippet).kinds);

/** Serialize the whole snippet library to a portable JSON string (downloadable
 *  so it survives across browsers and machines). */
export function exportSnippetsJson(): string {
  return JSON.stringify({ format: 'pdfcraft-snippets', version: 1, snippets: read() }, null, 2);
}

/** Import a snippet library. Accepts either our export envelope or a bare array.
 *  In 'merge' mode imported snippets are added with fresh ids (no collisions);
 *  in 'replace' mode they become the entire library. Returns the count added.
 *  Throws if the JSON isn't a recognizable snippet library. */
export function importSnippetsJson(json: string, mode: 'merge' | 'replace' = 'merge'): number {
  const parsed: unknown = JSON.parse(json);
  const raw = Array.isArray(parsed) ? parsed : (parsed as { snippets?: unknown })?.snippets;
  if (!Array.isArray(raw)) throw new Error('Not a snippet library');
  const incoming: CustomSnippet[] = raw.filter(isSnippet).map((s) => ({
    id: Math.random().toString(36).slice(2, 10),
    label: s.label.trim() || 'Snippet',
    body: s.body,
    kinds: s.kinds.length ? s.kinds : CUSTOM_KINDS,
  }));
  if (!incoming.length) throw new Error('No valid snippets found');
  write(mode === 'replace' ? incoming : [...read(), ...incoming]);
  return incoming.length;
}

/** Strip the `custom:` prefix the palette uses for custom tool ids. */
export const customIdOf = (toolId: string): string | null => (toolId.startsWith('custom:') ? toolId.slice('custom:'.length) : null);
