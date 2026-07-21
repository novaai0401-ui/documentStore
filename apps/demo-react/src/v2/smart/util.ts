/**
 * Shared helpers for the Smart Tools.
 *
 * Everything here works in the page's scale = 1 space (top-left origin,
 * ≈ PDF points), which is what `pageText.getPageRuns` returns and what the
 * annotation overlay path expects when `pageCssWidth/Height` are set to the
 * scale-1 viewport dims. That makes generated edits independent of the live
 * zoom level.
 */
import type { Annotation } from '../Annotations.js';
import type { TextRun } from '../pdfText.js';

/** Per-page run bundle as returned by `pageText.getPageRuns`. */
export interface PageRuns {
  page: number;
  vpWidth: number;
  vpHeight: number;
  source: 'text' | 'ocr' | 'empty';
  runs: TextRun[];
}

export function makeId(): string {
  return 'a' + Math.random().toString(36).slice(2, 9);
}

// A reused offscreen canvas context for glyph-width measurement.
let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx) return measureCtx;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  measureCtx = c.getContext('2d');
  return measureCtx;
}

/**
 * A sub-span of a run (e.g. one regex match within a line). We don't have
 * per-glyph boxes from pdf.js, so we *measure* the substring with the canvas
 * text metrics and scale that to the run's real width — far tighter than a
 * character-count estimate on proportional fonts (an "i" no longer claims the
 * same width as a "W"). Falls back to proportional when no canvas is
 * available (non-DOM contexts / tests).
 */
export function spanBox(
  run: TextRun,
  start: number,
  end: number,
): { x: number; y: number; width: number; height: number } {
  const ctx = getMeasureCtx();
  if (ctx && run.text) {
    // Measure with a generic font at the run size, then normalize by the
    // full-line ratio so the (different) real font's width is respected.
    ctx.font = `${run.fontSize}px sans-serif`;
    const full = ctx.measureText(run.text).width;
    if (full > 0) {
      const ratio = run.width / full;
      const preW = ctx.measureText(run.text.slice(0, start)).width * ratio;
      const midW = ctx.measureText(run.text.slice(start, end)).width * ratio;
      return { x: run.x + preW, y: run.y, width: midW, height: run.height };
    }
  }
  const len = Math.max(run.text.length, 1);
  return {
    x: run.x + (start / len) * run.width,
    y: run.y,
    width: ((end - start) / len) * run.width,
    height: run.height,
  };
}

/** Build a redaction annotation covering a box on a page. Padded slightly so
 *  the black bar fully covers glyph ascenders/descenders. */
export function redactionAnnotation(
  page: PageRuns,
  box: { x: number; y: number; width: number; height: number },
  pad = 1.5,
): Annotation {
  return {
    id: makeId(),
    page: page.page,
    pageCssWidth: page.vpWidth,
    pageCssHeight: page.vpHeight,
    kind: 'redact',
    x: box.x - pad,
    y: box.y - pad,
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  };
}

/** Build the white-out + new-text annotation pair that replaces a run's text
 *  in place (same position/size), exactly like the Word-like edit tool does
 *  on commit. */
export function replacementAnnotations(
  page: PageRuns,
  run: TextRun,
  newText: string,
  color = '#1f2933',
): Annotation[] {
  const common = { page: page.page, pageCssWidth: page.vpWidth, pageCssHeight: page.vpHeight };
  const pad = 2;
  return [
    {
      id: makeId(),
      ...common,
      kind: 'eraser',
      x: run.x - pad,
      y: run.y - pad,
      width: run.width + pad * 2,
      height: run.height + pad * 2,
    },
    {
      id: makeId(),
      ...common,
      kind: 'text',
      x: run.x,
      y: run.y,
      width: Math.max(run.width, 40),
      height: Math.max(run.height, 12),
      text: newText,
      fontSize: Math.max(8, Math.round(run.fontSize)),
      color,
    },
  ];
}

/**
 * Build an invisible (render-mode-3) text annotation for each run on a page —
 * a searchable/selectable text layer that lines up with the glyphs of a
 * scanned image. Used to persist OCR results into the saved PDF so the scan
 * becomes real text on reload (not just a one-session overlay).
 */
export function invisibleTextLayer(page: PageRuns): Annotation[] {
  const common = { page: page.page, pageCssWidth: page.vpWidth, pageCssHeight: page.vpHeight };
  return page.runs
    .filter((r) => r.text.trim().length > 0)
    .map((run) => ({
      id: makeId(),
      ...common,
      kind: 'text' as const,
      x: run.x,
      y: run.y,
      width: Math.max(run.width, 8),
      height: Math.max(run.height, 8),
      text: run.text,
      fontSize: Math.max(6, Math.round(run.fontSize)),
      color: '#000000',
      invisible: true,
    }));
}

/** Escape a single CSV field per RFC 4180. */
export function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
  return value;
}

/** Trigger a client-side download of text content. */
export function downloadText(filename: string, content: string, mime = 'text/plain'): void {
  void saveBlob(filename, new Blob([content], { type: mime + ';charset=utf-8' }));
}

/** True on a phone/tablet (iOS or Android), incl. iPadOS reporting as "MacIntel". */
function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iP(hone|od|ad)|Mobi/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
}

/**
 * Save a Blob to the device, robustly across browsers. The plain <a download>
 * anchor fails silently on iOS Safari (which ignores the attribute for blob URLs)
 * and inside Android in-app webviews — and an anchor failure can't be caught to
 * retry. So on phones we prefer the Web Share API (the native "Save to
 * Files/Photos/Downloads" sheet) when it can share files, and fall back to a
 * DOM-attached anchor whose object URL is revoked only after the click is handled
 * (revoking synchronously aborts the download on some browsers). On desktop we go
 * straight to the anchor, which gives a direct download.
 */
export async function saveBlob(filename: string, blob: Blob): Promise<void> {
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean; share?: (d: unknown) => Promise<void> };
  if (isMobile() && nav.share && nav.canShare) {
    try {
      const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
      if (nav.canShare({ files: [file] })) { await nav.share({ files: [file], title: filename }); return; }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // user dismissed the sheet
      // otherwise fall through to the anchor method
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener'; a.style.display = 'none';
  // On phones the <a download> attribute is ignored (iOS Safari especially), and
  // clicking it NAVIGATES the current page to the blob — the app is replaced by a
  // raw image/video view and the user "loses" it. Opening in a new tab keeps the
  // app intact; they can long-press there to save. Desktop keeps the direct
  // download (target is ignored when `download` is honoured).
  if (isMobile()) a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
}

/** Trigger a client-side download of binary content (PDF, image, zip, …). */
export function downloadBytes(filename: string, bytes: Uint8Array, mime = 'application/octet-stream'): void {
  void saveBlob(filename, new Blob([bytes as BlobPart], { type: mime }));
}

/**
 * Build a diagonal, translucent watermark text annotation for every page —
 * saved through the normal overlay path (rotation + opacity supported by the
 * text overlay), so it composes with other edits and is undoable.
 */
export function watermarkAnnotations(
  pages: PageRuns[],
  text: string,
  opts: { opacity?: number; color?: string; fontSize?: number } = {},
): Annotation[] {
  const t = text.trim();
  if (!t) return [];
  return pages.map((p) => {
    const fontSize = opts.fontSize ?? Math.max(24, Math.min(p.vpWidth, p.vpHeight) * 0.12);
    return {
      id: makeId(),
      page: p.page,
      pageCssWidth: p.vpWidth,
      pageCssHeight: p.vpHeight,
      kind: 'text' as const,
      x: 0,
      y: 0,
      width: p.vpWidth,
      height: p.vpHeight,
      text: t,
      fontSize,
      color: opts.color ?? '#888888',
      rotate: 45,
      opacity: opts.opacity ?? 0.18,
    };
  });
}

/**
 * Build a footer page-number annotation for every page, e.g. "3 / 12".
 * `format` may use {n} and {total} placeholders (default "{n} / {total}").
 */
export function pageNumberAnnotations(
  pages: PageRuns[],
  opts: { format?: string; color?: string; fontSize?: number } = {},
): Annotation[] {
  const total = pages.length;
  const fmt = opts.format || '{n} / {total}';
  const fontSize = opts.fontSize ?? 10;
  return pages.map((p, i) => {
    const label = fmt.replace('{n}', String(i + 1)).replace('{total}', String(total));
    const w = Math.max(40, label.length * fontSize * 0.6);
    return {
      id: makeId(),
      page: p.page,
      pageCssWidth: p.vpWidth,
      pageCssHeight: p.vpHeight,
      kind: 'text' as const,
      x: (p.vpWidth - w) / 2,
      y: p.vpHeight - fontSize - 14,
      width: w,
      height: fontSize + 4,
      text: label,
      fontSize,
      color: opts.color ?? '#555555',
    };
  });
}
