/**
 * Text search hook — wraps pdf.js's per-page text content. Builds a flat
 * list of matches across all pages, with a current-index cursor for
 * next/prev. Match rectangles are computed in CSS-pixel coordinates so
 * the search overlay layer can render them at the user's current scale.
 *
 * The hook indexes lazily: getTextContent is only called on the page
 * containing the next/prev requested match, then cached.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getPdfjsDocument, type PdfDocumentHandle } from '@pdfcraft/engine';

export interface SearchMatch {
  /** 1-based page number. */
  page: number;
  /** Match position in CSS-pixel coordinates relative to the page's
   *  top-left, at scale=1.  The page-render layer scales these for
   *  display. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Index in the flat matches list — useful for "current match" lookup. */
  index: number;
}

interface UseTextSearchResult {
  matches: SearchMatch[];
  total: number;
  current: number;
  /** Set the query (case-insensitive). Empty string clears matches. */
  setQuery: (q: string) => void;
  /** Move to the next match (wraps). */
  next: () => void;
  /** Move to the previous match (wraps). */
  prev: () => void;
  /** True while pdf.js is still indexing pages. */
  busy: boolean;
}

export function useTextSearch(doc: PdfDocumentHandle | null): UseTextSearchResult {
  const [query, setQueryState] = useState('');
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);
  // Reset index whenever query changes — current always lands on the
  // first match for the new search.
  const lastQueryRef = useRef('');

  const setQuery = useCallback((q: string) => {
    setQueryState(q);
    if (q !== lastQueryRef.current) {
      setCurrent(0);
      lastQueryRef.current = q;
    }
  }, []);

  useEffect(() => {
    if (!doc || !query.trim()) {
      setMatches([]);
      setBusy(false);
      return;
    }
    let cancelled = false;
    setBusy(true);
    runSearch(doc, query).then((m) => {
      if (cancelled) return;
      setMatches(m);
      setBusy(false);
    });
    return () => { cancelled = true; };
  }, [doc, query]);

  const next = useCallback(() => {
    setCurrent((c) => (matches.length === 0 ? 0 : (c + 1) % matches.length));
  }, [matches.length]);

  const prev = useCallback(() => {
    setCurrent((c) => (matches.length === 0 ? 0 : (c - 1 + matches.length) % matches.length));
  }, [matches.length]);

  return { matches, total: matches.length, current, setQuery, next, prev, busy };
}

/**
 * Concrete search pass. Walks every page in order, gets text content,
 * does a case-insensitive substring search on each item's `.str`. We
 * scope to per-item matches (no cross-item) which is enough for most
 * real PDFs — pdf.js usually emits one word per item.
 */
async function runSearch(doc: PdfDocumentHandle, query: string): Promise<SearchMatch[]> {
  const needle = query.toLowerCase();
  const out: SearchMatch[] = [];
  // Use the engine's PUBLIC accessor — the handle's internal field is
  // property-mangled in the built engine, so `doc._internal` is undefined at
  // runtime across the package boundary.
  const pdfjsDoc = getPdfjsDocument(doc) as unknown as {
    getPage: (n: number) => Promise<unknown>;
  } | null;
  if (!pdfjsDoc) return out;

  for (let p = 1; p <= doc.pageCount; p++) {
    const page = await pdfjsDoc.getPage(p) as {
      getTextContent: () => Promise<{ items: Array<{
        str: string;
        transform: number[];  // [a, b, c, d, e, f]
        width: number;
        height: number;
      }> }>;
      getViewport: (opts: { scale: number }) => { width: number; height: number };
    };
    const tc = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    for (const item of tc.items) {
      const lower = item.str.toLowerCase();
      let from = 0;
      while (true) {
        const at = lower.indexOf(needle, from);
        if (at < 0) break;
        // Compute approximate match rect.
        // item.transform = [a, b, c, d, e, f] in PDF user space.
        // e, f are the baseline position; the page Y-axis is bottom-up.
        const fontSize = Math.hypot(item.transform[2] ?? 0, item.transform[3] ?? item.transform[0] ?? 12);
        const ex = item.transform[4] ?? 0;
        const ey = item.transform[5] ?? 0;
        // Approximate char-width — divide item width by string length.
        const charW = item.str.length > 0 ? item.width / item.str.length : 0;
        const matchX = ex + at * charW;
        const matchW = needle.length * charW;
        // CSS coords: origin top-left, Y flipped from PDF.
        out.push({
          page: p,
          x: matchX,
          y: viewport.height - ey - fontSize,
          width: matchW,
          height: fontSize,
          index: out.length,
        });
        from = at + needle.length;
      }
    }
  }
  return out;
}
