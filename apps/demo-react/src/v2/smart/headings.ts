/**
 * Auto-generate a clickable outline (table of contents) for PDFs that have
 * no bookmarks of their own.
 *
 * Heuristic: the body text size is the most common run height; runs that are
 * meaningfully larger, reasonably short, and not sentence-like are treated as
 * headings. Distinct heading sizes map to nesting levels (largest = level 1).
 */
import type { PageRuns } from './util.js';

export interface HeadingEntry {
  page: number;
  text: string;
  /** 1-based nesting level. */
  level: number;
  /** Top y in scale-1 space — for ordering and (optionally) precise scroll. */
  y: number;
}

export function detectHeadings(pages: PageRuns[]): HeadingEntry[] {
  // Body size = the modal rounded font size across the document.
  const counts = new Map<number, number>();
  for (const p of pages) {
    for (const r of p.runs) {
      const s = Math.round(r.fontSize);
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return [];
  let bodySize = 12;
  let bodyCount = -1;
  for (const [size, c] of counts) {
    if (c > bodyCount) {
      bodyCount = c;
      bodySize = size;
    }
  }

  // Candidate headings: larger than body, short-ish, not ending mid-sentence.
  const candidates: Array<{ page: number; text: string; size: number; y: number }> = [];
  for (const p of pages) {
    for (const r of p.runs) {
      const text = r.text.trim();
      if (!text) continue;
      const size = Math.round(r.fontSize);
      const big = size >= bodySize + 1;
      const shortEnough = text.length <= 90 && text.split(/\s+/).length <= 14;
      const looksLikeHeading = big && shortEnough && !/[.,;:]$/.test(text);
      if (looksLikeHeading) candidates.push({ page: p.page, text, size, y: r.y });
    }
  }
  if (candidates.length === 0) return [];

  // Map distinct sizes (desc) to levels 1..N (cap at 4).
  const sizes = [...new Set(candidates.map((c) => c.size))].sort((a, b) => b - a);
  const levelOf = new Map(sizes.map((s, i) => [s, Math.min(i + 1, 4)] as const));

  return candidates
    .sort((a, b) => a.page - b.page || a.y - b.y)
    .map((c) => ({ page: c.page, text: c.text, level: levelOf.get(c.size) ?? 1, y: c.y }));
}
