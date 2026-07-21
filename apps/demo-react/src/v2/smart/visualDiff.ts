/**
 * Visual (pixel) diff for the Compare tool.
 *
 * The text diff (compare.ts) catches wording changes but is blind to layout,
 * images, stamps, signatures, and form-field values rendered as appearances.
 * This renders the same page from both versions to canvases at a common
 * scale and flags the regions whose pixels changed — the visual complement.
 *
 * It runs entirely in the browser on rendered bitmaps; the engine (pdf.js) is
 * lazy-imported only when a visual compare is actually requested, so the pure
 * text-diff helpers stay importable without it.
 */

export interface DiffRegion {
  /** Fraction-of-page rectangle (0..1), top-left origin — scale-independent. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PageVisualDiff {
  page: number;
  /** True when this page exists in only one version (added/removed). */
  onlyIn?: 'old' | 'new';
  /** Changed regions (empty when the page is pixel-identical). */
  regions: DiffRegion[];
  /** Share of pixels that differ, 0..1 (0 when identical). */
  changeRatio: number;
}

export interface VisualDiffResult {
  pages: PageVisualDiff[];
  oldPageCount: number;
  newPageCount: number;
}

interface PdfRenderDoc {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (o: { scale: number }) => { width: number; height: number };
    render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
  }>;
}

async function loadRenderDoc(bytes: Uint8Array): Promise<PdfRenderDoc> {
  const { loadDocument, getPdfjsDocument } = await import('@pdfcraft/engine');
  const handle = await loadDocument(bytes);
  return getPdfjsDocument(handle) as unknown as PdfRenderDoc;
}

async function renderToImageData(doc: PdfRenderDoc, pageNo: number, targetW: number): Promise<ImageData> {
  const page = await doc.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const scale = targetW / base.width;
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Compare two rendered pages on a coarse cell grid and return the changed
 * cells merged into fraction-rectangles. A cell counts as changed when enough
 * of its pixels differ beyond a per-channel threshold (robust to AA noise).
 */
export function diffImages(a: ImageData, b: ImageData): { regions: DiffRegion[]; changeRatio: number } {
  // Use the larger canvas dims; out-of-bounds pixels count as "changed".
  const W = Math.max(a.width, b.width);
  const H = Math.max(a.height, b.height);
  const cols = 40;
  const rows = Math.max(1, Math.round((cols * H) / W));
  const cellW = W / cols;
  const cellH = H / rows;
  const changedCells = new Uint8Array(cols * rows);
  const cellDiffCount = new Float32Array(cols * rows);
  const cellTotal = new Float32Array(cols * rows);

  const px = (img: ImageData, x: number, y: number): [number, number, number] => {
    if (x >= img.width || y >= img.height) return [-1, -1, -1];
    const i = (y * img.width + x) * 4;
    return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
  };

  // Sample on a stride for speed on large pages; full pass on small ones.
  const stride = W * H > 1_200_000 ? 2 : 1;
  let changedPixels = 0;
  let sampled = 0;
  for (let y = 0; y < H; y += stride) {
    const cy = Math.min(rows - 1, Math.floor(y / cellH));
    for (let x = 0; x < W; x += stride) {
      const [ar, ag, ab] = px(a, x, y);
      const [br, bg, bb] = px(b, x, y);
      const cx = Math.min(cols - 1, Math.floor(x / cellW));
      const cell = cy * cols + cx;
      cellTotal[cell]! += 1;
      sampled++;
      const diff = Math.abs(ar - br) + Math.abs(ag - bg) + Math.abs(ab - bb);
      if (diff > 60) {
        cellDiffCount[cell]! += 1;
        changedPixels++;
      }
    }
  }
  for (let c = 0; c < changedCells.length; c++) {
    if (cellTotal[c]! > 0 && cellDiffCount[c]! / cellTotal[c]! > 0.02) changedCells[c] = 1;
  }

  // Merge changed cells row-wise into rectangles (cheap, readable overlays).
  const regions: DiffRegion[] = [];
  for (let r = 0; r < rows; r++) {
    let runStart = -1;
    for (let c = 0; c <= cols; c++) {
      const on = c < cols && changedCells[r * cols + c] === 1;
      if (on && runStart < 0) runStart = c;
      else if (!on && runStart >= 0) {
        regions.push({ x: runStart / cols, y: r / rows, w: (c - runStart) / cols, h: 1 / rows });
        runStart = -1;
      }
    }
  }
  return { regions: mergeVertical(regions), changeRatio: sampled ? changedPixels / sampled : 0 };
}

/** Merge vertically-adjacent equal-x rectangles so multi-row changes become
 *  one box instead of a stack of thin strips. */
function mergeVertical(regions: DiffRegion[]): DiffRegion[] {
  const out: DiffRegion[] = [];
  for (const r of regions) {
    const prev = out.find((o) => Math.abs(o.x - r.x) < 1e-6 && Math.abs(o.w - r.w) < 1e-6 && Math.abs(o.y + o.h - r.y) < 1e-6 + 1e-3);
    if (prev) prev.h += r.h;
    else out.push({ ...r });
  }
  return out;
}

/** Render a single page of `bytes` to a PNG data URL at `width` px — for the
 *  diff thumbnails in the UI. */
export async function renderPageDataUrl(bytes: Uint8Array, pageNo: number, width: number): Promise<string> {
  const doc = await loadRenderDoc(bytes);
  if (pageNo > doc.numPages) return '';
  const page = await doc.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: width / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return canvas.toDataURL('image/png');
}

/**
 * Visual-diff two PDFs page by page. `targetW` is the render width in px
 * (higher = more sensitive + slower).
 */
export async function visualDiff(oldBytes: Uint8Array, newBytes: Uint8Array, targetW = 720): Promise<VisualDiffResult> {
  const [oldDoc, newDoc] = await Promise.all([loadRenderDoc(oldBytes), loadRenderDoc(newBytes)]);
  const maxPages = Math.max(oldDoc.numPages, newDoc.numPages);
  const pages: PageVisualDiff[] = [];
  for (let p = 1; p <= maxPages; p++) {
    if (p > oldDoc.numPages) { pages.push({ page: p, onlyIn: 'new', regions: [], changeRatio: 1 }); continue; }
    if (p > newDoc.numPages) { pages.push({ page: p, onlyIn: 'old', regions: [], changeRatio: 1 }); continue; }
    const [ia, ib] = await Promise.all([
      renderToImageData(oldDoc, p, targetW),
      renderToImageData(newDoc, p, targetW),
    ]);
    const { regions, changeRatio } = diffImages(ia, ib);
    pages.push({ page: p, regions, changeRatio });
  }
  return { pages, oldPageCount: oldDoc.numPages, newPageCount: newDoc.numPages };
}
