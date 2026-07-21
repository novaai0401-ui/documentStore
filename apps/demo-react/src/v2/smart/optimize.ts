/**
 * Track 3 — PDF power-tools that optimize or unpack a document, all in the
 * browser:
 *
 *   • compressPdf        — rasterize each page to JPEG at a chosen DPI/quality
 *                          and rebuild, shrinking image-heavy or bloated PDFs.
 *                          Honest trade-off: the result is image-only, so
 *                          selectable text is lost (the UI says so).
 *   • flattenPdf         — bake interactive form fields into static page
 *                          content (pdf-lib form.flatten) so values can't be
 *                          changed and render identically everywhere.
 *   • extractImages      — pull the embedded raster images out of a PDF via
 *                          pdf.js's operator list, as PNGs.
 */

// ── compress ────────────────────────────────────────────────────────────────────

interface PdfRenderDoc {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (o: { scale: number }) => { width: number; height: number };
    render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
    getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[] }>;
    objs: { get: (name: string, cb?: (v: unknown) => void) => unknown; has?: (name: string) => boolean };
    commonObjs: { get: (name: string, cb?: (v: unknown) => void) => unknown; has?: (name: string) => boolean };
  }>;
}

async function loadRenderDoc(bytes: Uint8Array): Promise<PdfRenderDoc> {
  const { loadDocument, getPdfjsDocument } = await import('@pdfcraft/engine');
  const handle = await loadDocument(bytes);
  return getPdfjsDocument(handle) as unknown as PdfRenderDoc;
}

async function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', quality));
  return new Uint8Array(await blob.arrayBuffer());
}

export interface CompressResult {
  bytes: Uint8Array;
  originalSize: number;
  newSize: number;
  pageCount: number;
}

/**
 * Rasterize each page and rebuild at the original page geometry (points), so
 * the document looks the same and just gets lighter. DPI and JPEG quality are
 * the two knobs; lower = smaller. Image-only output (no text layer).
 */
export async function compressPdf(
  bytes: Uint8Array,
  opts: { dpi?: number; quality?: number } = {},
): Promise<CompressResult> {
  const { dpi = 120, quality = 0.6 } = opts;
  const { PDFDocument } = await import('pdf-lib');
  const src = await loadRenderDoc(bytes);
  const out = await PDFDocument.create();
  const scale = dpi / 72;

  for (let p = 1; p <= src.numPages; p++) {
    const page = await src.getPage(p);
    const ptVp = page.getViewport({ scale: 1 }); // page size in points
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const jpeg = await canvasToJpeg(canvas, quality);
    const embed = await out.embedJpg(jpeg);
    const newPage = out.addPage([ptVp.width, ptVp.height]);
    newPage.drawImage(embed, { x: 0, y: 0, width: ptVp.width, height: ptVp.height });
  }

  const result = await out.save();
  return { bytes: result, originalSize: bytes.length, newSize: result.length, pageCount: src.numPages };
}

// ── flatten ─────────────────────────────────────────────────────────────────────

export interface FlattenResult {
  bytes: Uint8Array;
  hadForm: boolean;
  fieldCount: number;
}

/**
 * Flatten interactive form fields into static page content. After this the
 * form values are painted permanently and can no longer be edited — what you
 * see is what every viewer renders.
 */
export async function flattenPdf(bytes: Uint8Array): Promise<FlattenResult> {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  let hadForm = false;
  let fieldCount = 0;
  try {
    const form = pdf.getForm();
    fieldCount = form.getFields().length;
    hadForm = fieldCount > 0;
    if (hadForm) form.flatten();
  } catch {
    hadForm = false;
  }
  return { bytes: await pdf.save(), hadForm, fieldCount };
}

// ── extract embedded images ─────────────────────────────────────────────────────

export interface ExtractedImage {
  page: number;
  index: number;
  width: number;
  height: number;
  bytes: Uint8Array; // PNG
}

// pdf.js operator codes we care about. Resolved from the public OPS map at
// runtime so we don't hard-code numbers that may shift between versions.
async function imageOps(): Promise<Set<number>> {
  const pdfjs = (await import('pdfjs-dist')) as unknown as { OPS: Record<string, number> };
  const ops = pdfjs.OPS;
  return new Set([ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintImageXObjectRepeat].filter((n) => typeof n === 'number'));
}

function imgObjToPng(obj: unknown): { width: number; height: number; bytes: Promise<Uint8Array> } | null {
  const o = obj as { width?: number; height?: number; data?: Uint8Array | Uint8ClampedArray; kind?: number; bitmap?: CanvasImageSource };
  if (!o || !o.width || !o.height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = o.width;
  canvas.height = o.height;
  const ctx = canvas.getContext('2d')!;

  if (o.bitmap) {
    ctx.drawImage(o.bitmap, 0, 0);
  } else if (o.data) {
    const rgba = new Uint8ClampedArray(o.width * o.height * 4);
    const d = o.data;
    // kind: 1 = grayscale-1bpp (rare here), 2 = RGB_24BPP, 3 = RGBA_32BPP.
    if (o.kind === 3 || d.length === o.width * o.height * 4) {
      rgba.set(d.subarray(0, rgba.length));
    } else if (o.kind === 2 || d.length === o.width * o.height * 3) {
      for (let i = 0, j = 0; i < o.width * o.height; i++) {
        rgba[j++] = d[i * 3]!; rgba[j++] = d[i * 3 + 1]!; rgba[j++] = d[i * 3 + 2]!; rgba[j++] = 255;
      }
    } else {
      // grayscale fallback
      for (let i = 0, j = 0; i < o.width * o.height; i++) {
        const v = d[i] ?? 0; rgba[j++] = v; rgba[j++] = v; rgba[j++] = v; rgba[j++] = 255;
      }
    }
    ctx.putImageData(new ImageData(rgba, o.width, o.height), 0, 0);
  } else {
    return null;
  }
  return {
    width: o.width,
    height: o.height,
    bytes: new Promise<Uint8Array>((resolve) =>
      canvas.toBlob(async (b) => resolve(new Uint8Array(await b!.arrayBuffer())), 'image/png'),
    ),
  };
}

function resolveObj(store: { get: (name: string, cb?: (v: unknown) => void) => unknown; has?: (n: string) => boolean }, name: string): Promise<unknown> {
  return new Promise((resolve) => {
    try {
      if (store.has && !store.has(name)) { resolve(undefined); return; }
      // pdf.js resolves synchronously if ready, else via callback.
      const v = store.get(name, (val) => resolve(val));
      if (v !== undefined) resolve(v);
    } catch {
      resolve(undefined);
    }
  });
}

/**
 * Walk each page's operator list and decode the embedded image XObjects to
 * PNG. Images we can't decode (exotic colour spaces, masks) are skipped — the
 * caller is told how many came through.
 */
export async function extractImages(bytes: Uint8Array): Promise<ExtractedImage[]> {
  const doc = await loadRenderDoc(bytes);
  const wanted = await imageOps();
  const out: ExtractedImage[] = [];
  const seen = new Set<string>();

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    let opList: { fnArray: number[]; argsArray: unknown[] };
    try {
      opList = await page.getOperatorList(); // populates page.objs
    } catch {
      continue;
    }
    let idx = 0;
    for (let i = 0; i < opList.fnArray.length; i++) {
      if (!wanted.has(opList.fnArray[i]!)) continue;
      const args = opList.argsArray[i] as unknown[];
      const name = typeof args?.[0] === 'string' ? (args[0] as string) : null;
      const key = `${p}:${name}`;
      if (!name || seen.has(key)) continue;
      seen.add(key);
      const obj = (await resolveObj(page.objs, name)) ?? (await resolveObj(page.commonObjs, name));
      if (!obj) continue;
      const png = imgObjToPng(obj);
      if (!png) continue;
      try {
        out.push({ page: p, index: idx++, width: png.width, height: png.height, bytes: await png.bytes });
      } catch { /* skip undecodable */ }
    }
  }
  return out;
}
