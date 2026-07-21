/**
 * Text extraction over pdf.js — the shared foundation for two features:
 *
 *   1. Word-like editing of "non-editable" PDFs. When the user clicks with
 *      the Edit-text tool, we look up the real text run under the cursor
 *      (its words, font size, and bounding box) so the edit box can be
 *      pre-filled with the actual text — exactly like clicking into a line
 *      in Word or Notepad. The original PDF is never mutated: on save the
 *      run is whited-out and the edited text is redrawn on top via the
 *      existing incremental-update overlay path.
 *
 *   2. AI context. The same per-page text feeds the "Ask AI" panel so the
 *      model can answer questions about the whole document or about a
 *      dragged region ("know any part of the document").
 *
 * All public coordinates are CSS pixels in the page's *current* render
 * space (matching the annotation layer), so callers pass the page's
 * rendered CSS width/height and we scale internally. Internally we cache
 * the raw pdf.js text content at scale = 1.
 */
import { useCallback, useMemo, useRef } from 'react';
import { getPdfjsDocument, type PdfDocumentHandle } from '@pdfcraft/engine';
import { ocrCanvasToRuns } from './ocr.js';

/** One contiguous line-run of text on a page, in scale=1 CSS px,
 *  top-left origin (Y already flipped from PDF's bottom-up space). */
export interface TextRun {
  text: string;
  /** Left edge. */
  x: number;
  /** Top edge (baseline minus font size). */
  y: number;
  width: number;
  /** Approx. cap-to-baseline height ≈ font size. */
  height: number;
  /** Font size in scale=1 px. */
  fontSize: number;
}

/** A text run resolved into the page's *current* render space (CSS px at
 *  the live scale) — ready to drop straight into an annotation. */
export interface TextHit {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

interface PageText {
  /** Viewport dims at scale = 1 — used to map current-scale clicks back. */
  vpWidth: number;
  vpHeight: number;
  runs: TextRun[];
  /** Where `runs` came from: the embedded text layer, OCR, or none yet. */
  source: 'text' | 'ocr' | 'empty';
}

type PdfjsViewport = { width: number; height: number };
type PdfjsPage = {
  getTextContent: () => Promise<{
    items: Array<{ str: string; transform: number[]; width: number; height: number }>;
  }>;
  getViewport: (opts: { scale: number }) => PdfjsViewport;
  render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: PdfjsViewport }) => {
    promise: Promise<void>;
  };
};

type PdfjsDoc = {
  getPage: (n: number) => Promise<PdfjsPage>;
  getMetadata?: () => Promise<{ info?: { Title?: string; Language?: string } }>;
};

// Use the engine's PUBLIC accessor — the handle's internal field is
// property-mangled in the built engine, so `doc._internal` does not exist at
// runtime across the package boundary (that bug made all text extraction
// silently return nothing).
function getPdfjsDoc(doc: PdfDocumentHandle): PdfjsDoc | null {
  try {
    return (getPdfjsDocument(doc) as unknown as PdfjsDoc) ?? null;
  } catch {
    return null;
  }
}

/**
 * Group raw pdf.js text items into line-runs. pdf.js emits text in small
 * fragments (often one per word or style change); merging fragments that
 * share a baseline and sit horizontally adjacent gives a single editable
 * line — the natural unit for "click a line and retype it".
 */
function buildRuns(
  items: Array<{ str: string; transform: number[]; width: number; height: number }>,
  vpHeight: number,
): TextRun[] {
  interface Frag {
    str: string;
    x: number;
    baseline: number; // PDF-space baseline Y (bottom-up)
    width: number;
    fontSize: number;
  }
  const frags: Frag[] = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const t = it.transform;
    const fontSize = Math.hypot(t[2] ?? 0, t[3] ?? t[0] ?? 12) || 12;
    frags.push({ str: it.str, x: t[4] ?? 0, baseline: t[5] ?? 0, width: it.width, fontSize });
  }
  // Sort top-to-bottom (baseline descending in PDF space), then left-to-right.
  frags.sort((a, b) => (b.baseline - a.baseline) || (a.x - b.x));

  const runs: TextRun[] = [];
  let cur: Frag[] = [];
  const flush = () => {
    if (cur.length === 0) return;
    const first = cur[0]!;
    const fontSize = Math.max(...cur.map((f) => f.fontSize));
    const minX = Math.min(...cur.map((f) => f.x));
    const right = Math.max(...cur.map((f) => f.x + f.width));
    // Join fragments, inserting a space when there's a visible gap so words
    // don't run together.
    let text = '';
    let prevRight = first.x;
    for (const f of cur) {
      if (text && f.x - prevRight > f.fontSize * 0.25) text += ' ';
      text += f.str;
      prevRight = f.x + f.width;
    }
    runs.push({
      text: text.replace(/\s+/g, ' ').trim(),
      x: minX,
      y: vpHeight - first.baseline - fontSize,
      width: right - minX,
      height: fontSize,
      fontSize,
    });
    cur = [];
  };
  for (const f of frags) {
    if (cur.length === 0) {
      cur.push(f);
      continue;
    }
    const last = cur[cur.length - 1]!;
    const sameLine = Math.abs(f.baseline - last.baseline) <= last.fontSize * 0.6;
    const adjacent = f.x - (last.x + last.width) <= last.fontSize * 2.5;
    if (sameLine && adjacent) cur.push(f);
    else flush(), cur.push(f);
  }
  flush();
  return runs;
}

export interface UsePageTextResult {
  /** Resolve the text run under a click (current-scale CSS px). */
  getHitAt: (
    page: number,
    xCss: number,
    yCss: number,
    cssWidth: number,
    cssHeight: number,
  ) => Promise<TextHit | null>;
  /** Concatenated text for a region (current-scale CSS px rect). */
  getTextInRect: (
    page: number,
    rect: { x: number; y: number; width: number; height: number },
    cssWidth: number,
    cssHeight: number,
  ) => Promise<string>;
  /** Whole-document text, page by page, for AI context. Truncates each
   *  page so a huge PDF can't blow the request size. */
  getDocText: (perPageLimit?: number) => Promise<Array<{ page: number; text: string }>>;
  /** Run OCR on a page that lacks a usable text layer, populating the run
   *  cache so editing + AI work on scans. Skips pages that already have
   *  embedded text unless `force` is set. */
  ocrPage: (page: number, force?: boolean) => Promise<{ ocr: boolean; count: number; reason?: string }>;
  /** Heuristic: does the document look like an image-only scan? Samples the
   *  first few pages and reports true when almost no text was found. */
  needsOcr: () => Promise<boolean>;
  /** All line-runs for a page in scale = 1 (top-left, ≈ PDF points), plus the
   *  scale-1 viewport dims. The foundation for the Smart Tools — analysis and
   *  annotation generation both work in this scale-independent space. */
  getPageRuns: (
    page: number,
  ) => Promise<{ vpWidth: number; vpHeight: number; source: 'text' | 'ocr' | 'empty'; runs: TextRun[] } | null>;
  /** Document metadata (title/language) for the accessibility audit. */
  getMeta: () => Promise<{ title: string | null; language: string | null }>;
}

/**
 * Hook: lazy, cached per-page text access over a loaded document. Caches
 * are keyed by document identity, so loading a new file resets them.
 */
export function usePageText(doc: PdfDocumentHandle | null): UsePageTextResult {
  const cache = useRef<Map<number, PageText>>(new Map());
  const lastDoc = useRef<PdfDocumentHandle | null>(null);

  // Reset the cache when the document changes.
  if (lastDoc.current !== doc) {
    cache.current = new Map();
    lastDoc.current = doc;
  }

  const loadPage = useCallback(
    async (page: number): Promise<PageText | null> => {
      if (!doc) return null;
      const cached = cache.current.get(page);
      if (cached) return cached;
      const pdfjsDoc = getPdfjsDoc(doc);
      if (!pdfjsDoc) return null;
      const p = await pdfjsDoc.getPage(page);
      const vp = p.getViewport({ scale: 1 });
      const tc = await p.getTextContent();
      const runs = buildRuns(tc.items, vp.height);
      const built: PageText = {
        vpWidth: vp.width,
        vpHeight: vp.height,
        runs,
        source: runs.length > 0 ? 'text' : 'empty',
      };
      cache.current.set(page, built);
      return built;
    },
    [doc],
  );

  const getHitAt = useCallback<UsePageTextResult['getHitAt']>(
    async (page, xCss, yCss, cssWidth) => {
      const pt = await loadPage(page);
      if (!pt || pt.vpWidth === 0) return null;
      const scale = cssWidth / pt.vpWidth;
      const x1 = xCss / scale;
      const y1 = yCss / scale;
      // Prefer a run whose box contains the point; otherwise take the
      // nearest run on the same line within a small vertical tolerance.
      let best: TextRun | null = null;
      let bestDist = Infinity;
      for (const r of pt.runs) {
        const within =
          x1 >= r.x - 2 && x1 <= r.x + r.width + 2 && y1 >= r.y - 2 && y1 <= r.y + r.height + 2;
        if (within) {
          best = r;
          break;
        }
        const cy = r.y + r.height / 2;
        const dy = Math.abs(y1 - cy);
        if (dy < r.height && dy < bestDist) {
          bestDist = dy;
          best = r;
        }
      }
      if (!best) return null;
      return {
        text: best.text,
        x: best.x * scale,
        y: best.y * scale,
        width: best.width * scale,
        height: best.height * scale,
        fontSize: best.fontSize * scale,
      };
    },
    [loadPage],
  );

  const getTextInRect = useCallback<UsePageTextResult['getTextInRect']>(
    async (page, rect, cssWidth) => {
      const pt = await loadPage(page);
      if (!pt || pt.vpWidth === 0) return '';
      const scale = cssWidth / pt.vpWidth;
      const x0 = rect.x / scale;
      const y0 = rect.y / scale;
      const x1 = (rect.x + rect.width) / scale;
      const y1 = (rect.y + rect.height) / scale;
      const lines = pt.runs
        .filter((r) => {
          const cx = r.x + r.width / 2;
          const cy = r.y + r.height / 2;
          return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
        })
        .map((r) => r.text);
      return lines.join('\n').trim();
    },
    [loadPage],
  );

  const getDocText = useCallback<UsePageTextResult['getDocText']>(
    async (perPageLimit = 6000) => {
      if (!doc) return [];
      const out: Array<{ page: number; text: string }> = [];
      for (let p = 1; p <= doc.pageCount; p++) {
        const pt = await loadPage(p);
        if (!pt) continue;
        let text = pt.runs.map((r) => r.text).join('\n');
        if (text.length > perPageLimit) text = text.slice(0, perPageLimit) + '…';
        out.push({ page: p, text });
      }
      return out;
    },
    [doc, loadPage],
  );

  const ocrPage = useCallback<UsePageTextResult['ocrPage']>(
    async (page, force = false) => {
      if (!doc) return { ocr: false, count: 0, reason: 'no-doc' };
      const pt = await loadPage(page);
      if (!pt) return { ocr: false, count: 0, reason: 'no-doc' };
      if (pt.source === 'text' && !force) return { ocr: false, count: pt.runs.length, reason: 'has-text' };
      if (pt.source === 'ocr' && !force) return { ocr: true, count: pt.runs.length, reason: 'already-ocr' };
      const pdfjsDoc = getPdfjsDoc(doc);
      if (!pdfjsDoc) return { ocr: false, count: 0, reason: 'no-doc' };
      const p = await pdfjsDoc.getPage(page);
      // Render at 2× the scale-1 viewport for legible glyphs, then OCR.
      const ocrScale = 2;
      const vp = p.getViewport({ scale: ocrScale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return { ocr: false, count: 0, reason: 'no-canvas' };
      await p.render({ canvasContext: ctx, viewport: vp }).promise;
      const runs = await ocrCanvasToRuns(canvas, ocrScale);
      pt.runs = runs;
      pt.source = 'ocr';
      return { ocr: true, count: runs.length };
    },
    [doc, loadPage],
  );

  const needsOcr = useCallback<UsePageTextResult['needsOcr']>(async () => {
    if (!doc) return false;
    const sample = Math.min(doc.pageCount, 3);
    let chars = 0;
    for (let p = 1; p <= sample; p++) {
      const pt = await loadPage(p);
      if (pt) chars += pt.runs.reduce((n, r) => n + r.text.length, 0);
    }
    // Fewer than ~40 characters across the first pages → very likely a scan.
    return chars < 40 * sample;
  }, [doc, loadPage]);

  const getPageRuns = useCallback<UsePageTextResult['getPageRuns']>(
    async (page) => {
      const pt = await loadPage(page);
      if (!pt) return null;
      return { vpWidth: pt.vpWidth, vpHeight: pt.vpHeight, source: pt.source, runs: pt.runs };
    },
    [loadPage],
  );

  const getMeta = useCallback<UsePageTextResult['getMeta']>(async () => {
    if (!doc) return { title: null, language: null };
    const pdfjsDoc = getPdfjsDoc(doc);
    try {
      const md = await pdfjsDoc?.getMetadata?.();
      const title = md?.info?.Title?.trim() || null;
      const language = md?.info?.Language?.trim() || null;
      return { title, language };
    } catch {
      return { title: null, language: null };
    }
  }, [doc]);

  return useMemo(
    () => ({ getHitAt, getTextInRect, getDocText, ocrPage, needsOcr, getPageRuns, getMeta }),
    [getHitAt, getTextInRect, getDocText, ocrPage, needsOcr, getPageRuns, getMeta],
  );
}
