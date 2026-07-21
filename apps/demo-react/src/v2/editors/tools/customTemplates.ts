/**
 * User-defined document templates — the personal half of the templates
 * directory (the template analog of custom snippets). Any editor can capture
 * its current document as a reusable starting point; it persists to
 * localStorage and appears in the workspace's template gallery beside the
 * built-ins. One stored seed (text / Word HTML / sheet rows / slides) rebuilds
 * a fresh document on demand.
 */
import type { DocTemplate, TemplateDoc, TemplateKind } from './templates.js';

const KEY = 'pdfcraft.customTemplates.v1';
const ICON: Record<TemplateKind, string> = { text: '📝', word: '📄', sheet: '🔢', slides: '🟧' };

export interface CustomTemplate extends TemplateDoc {
  id: string;
  title: string;
  description?: string;
}

const isTemplate = (t: unknown): t is CustomTemplate => {
  const x = t as CustomTemplate;
  return !!x && typeof x.id === 'string' && typeof x.title === 'string' && typeof x.kind === 'string'
    && ['text', 'word', 'sheet', 'slides'].includes(x.kind);
};

function read(): CustomTemplate[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(isTemplate) : [];
  } catch { return []; }
}

function write(list: CustomTemplate[]): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* quota / disabled — ignore */ }
}

export const loadCustomTemplates = (): CustomTemplate[] => read();

export function addCustomTemplate(title: string, seed: TemplateDoc, description = ''): CustomTemplate {
  const tpl: CustomTemplate = { ...seed, id: Math.random().toString(36).slice(2, 10), title: title.trim() || 'My template', description };
  write([...read(), tpl]);
  return tpl;
}

export function deleteCustomTemplate(id: string): void {
  write(read().filter((t) => t.id !== id));
}

/** Custom templates as DocTemplates for the gallery (ids prefixed `custom:`). */
export function customDocTemplates(): DocTemplate[] {
  return read().map((t) => ({
    id: `custom:${t.id}`,
    name: t.title,
    description: t.description || `Your saved ${t.kind} template`,
    icon: ICON[t.kind] ?? '⭐',
    kind: t.kind,
    make: (): TemplateDoc => ({ name: t.name, ext: t.ext, kind: t.kind, text: t.text, html: t.html, rows: t.rows, slides: t.slides, theme: t.theme }),
  }));
}

/** Strip the `custom:` prefix the gallery uses for custom template ids. */
export const customTemplateIdOf = (id: string): string | null => (id.startsWith('custom:') ? id.slice('custom:'.length) : null);

/** Serialize the saved-template library to portable JSON. */
export function exportTemplatesJson(): string {
  return JSON.stringify({ format: 'pdfcraft-templates', version: 1, templates: read() }, null, 2);
}

/** Import a template library (our envelope or a bare array). Merge adds with
 *  fresh ids; replace swaps the whole library. Returns the count added. */
export function importTemplatesJson(json: string, mode: 'merge' | 'replace' = 'merge'): number {
  const parsed: unknown = JSON.parse(json);
  const raw = Array.isArray(parsed) ? parsed : (parsed as { templates?: unknown })?.templates;
  if (!Array.isArray(raw)) throw new Error('Not a template library');
  const incoming = raw.filter(isTemplate).map((t) => ({ ...t, id: Math.random().toString(36).slice(2, 10) }));
  if (!incoming.length) throw new Error('No valid templates found');
  write(mode === 'replace' ? incoming : [...read(), ...incoming]);
  return incoming.length;
}
