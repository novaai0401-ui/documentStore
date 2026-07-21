/**
 * Extract searchable plain text from any stored document, per "page" (page =
 * slide / a synthetic section). Pure and synchronous — used to index the library
 * for local semantic search. PDFs are stored as bytes (no text layer here), so
 * they contribute their name only; everything else yields real text.
 */
import type { DocRecord } from './docStore.js';

export interface DocPage {
  page: number;
  text: string;
}

/** Strip HTML tags + decode the few common entities, then collapse whitespace. */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Per-page searchable text for a stored document. */
export function docToText(rec: DocRecord): DocPage[] {
  const c = rec.content;
  if (typeof c.text === 'string' && c.text.trim()) return [{ page: 1, text: c.text }];
  if (typeof c.html === 'string' && c.html.trim()) return [{ page: 1, text: htmlToText(c.html) }];
  if (c.rows?.length) return [{ page: 1, text: c.rows.map((r) => r.join(' ')).join('\n') }];
  if (c.slides?.length) return c.slides.map((s, i) => ({ page: i + 1, text: [s.title, ...s.body].filter(Boolean).join('\n') }));
  if (c.design?.elements?.length) {
    const text = c.design.elements
      .filter((e): e is typeof e & { text: string } => e.type === 'text' && typeof (e as { text?: string }).text === 'string')
      .map((e) => e.text)
      .join('\n');
    return text.trim() ? [{ page: 1, text }] : [];
  }
  return []; // pdf bytes / empty
}

/** All of a document's text as one string (handy for previews/snippets). */
export function docToPlainText(rec: DocRecord): string {
  return docToText(rec).map((p) => p.text).join('\n').replace(/\s+/g, ' ').trim();
}
