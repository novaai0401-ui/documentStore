/**
 * Universal compressor — shrink images, PDFs and video entirely in the browser.
 * Nothing leaves the device. Images re-encode through a Canvas to JPEG/WebP/AVIF
 * (visually-lossless lossy) or optimise PNG; PDFs reuse our page-rasterising
 * compressPdf; video is handed to the WebCodecs/ffmpeg pipeline. This module is
 * the pure, framework-free core (size math + the Canvas image encoder); the UI
 * lives in CompressModal.tsx.
 */

/** Output format choice. "keep" preserves the source's family where it can. */
export type OutFormat = 'keep' | 'jpeg' | 'webp' | 'avif' | 'png';

export const FORMAT_MIME: Record<Exclude<OutFormat, 'keep'>, string> = {
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  png: 'image/png',
};
export const FORMAT_EXT: Record<Exclude<OutFormat, 'keep'>, string> = {
  jpeg: 'jpg', webp: 'webp', avif: 'avif', png: 'png',
};

/** Human-readable byte size, e.g. 1536 → "1.5 KB". */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / Math.pow(1024, i);
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** Percentage saved going from `orig` to `out` (0 if it got bigger). */
export function percentSaved(orig: number, out: number): number {
  if (orig <= 0) return 0;
  return Math.max(0, Math.round((1 - out / orig) * 100));
}

/**
 * Scale (w,h) so the longest side is at most `maxDim`, preserving aspect ratio.
 * Never upscales. maxDim ≤ 0 means "don't resize".
 */
export function scaledDimensions(w: number, h: number, maxDim: number): { w: number; h: number } {
  if (maxDim <= 0 || (w <= maxDim && h <= maxDim)) return { w, h };
  const longest = Math.max(w, h);
  const k = maxDim / longest;
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Resolve a "keep" choice to a concrete encoder format given the source mime. */
export function resolveFormat(format: OutFormat, sourceMime: string): Exclude<OutFormat, 'keep'> {
  if (format !== 'keep') return format;
  if (/png/i.test(sourceMime)) return 'png';
  if (/webp/i.test(sourceMime)) return 'webp';
  if (/avif/i.test(sourceMime)) return 'avif';
  return 'jpeg'; // jpeg/gif/bmp/tiff/unknown → jpeg
}

/** Is this a raster image type the Canvas pipeline can re-encode? */
export function isCompressibleImage(mime: string, name: string): boolean {
  if (/^image\/(png|jpe?g|webp|avif|gif|bmp)$/i.test(mime)) return true;
  return /\.(png|jpe?g|webp|avif|gif|bmp)$/i.test(name);
}

export interface ImageCompressOpts {
  format: OutFormat;
  /** 0–1 lossy quality (ignored for PNG, which is lossless). */
  quality: number;
  /** Longest-side cap in px; 0 = original size. */
  maxDimension?: number;
}

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  mime: string;
  ext: string;
}

// Feature-detect which lossy formats the running browser can actually encode.
let _encodeCache: Record<string, boolean> | null = null;
export function canEncode(mime: string): boolean {
  if (typeof document === 'undefined') return mime === 'image/jpeg' || mime === 'image/png';
  if (!_encodeCache) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    _encodeCache = {};
    for (const m of ['image/jpeg', 'image/png', 'image/webp', 'image/avif']) {
      _encodeCache[m] = c.toDataURL(m).startsWith(`data:${m}`);
    }
  }
  return _encodeCache[mime] ?? false;
}

/** Decode a file to an ImageBitmap/Image without leaving the device. */
async function loadBitmap(file: Blob): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(file);
    return { width: bmp.width, height: bmp.height, draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h), close: () => bmp.close() };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = () => rej(new Error('decode failed'));
      el.src = url;
    });
    return { width: img.naturalWidth, height: img.naturalHeight, draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h), close: () => {} };
  } finally {
    // url is revoked after draw by the caller via close-style timing; keep simple:
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/** Compress a single raster image fully in-browser. Accepts any Blob so already-
 *  decoded sources (e.g. HEIC → PNG) flow through the same encoder. */
export async function compressImage(file: Blob, opts: ImageCompressOpts): Promise<CompressedImage> {
  const target = resolveFormat(opts.format, file.type);
  let mime = FORMAT_MIME[target];
  // Fall back gracefully if the browser can't encode the requested lossy format.
  if (!canEncode(mime)) mime = canEncode('image/webp') && target !== 'png' ? 'image/webp' : 'image/jpeg';

  const bmp = await loadBitmap(file);
  try {
    const { w, h } = scaledDimensions(bmp.width, bmp.height, opts.maxDimension ?? 0);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    if (mime === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); } // flatten alpha for JPEG
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    bmp.draw(ctx, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, mime, mime === 'image/png' ? undefined : opts.quality));
    if (!blob) throw new Error('encode failed');
    const ext = (Object.entries(FORMAT_MIME).find(([, m]) => m === mime)?.[0] ?? 'jpeg') as Exclude<OutFormat, 'keep'>;
    return { blob, width: w, height: h, mime, ext: FORMAT_EXT[ext] };
  } finally {
    bmp.close();
  }
}

/**
 * Find the largest lossy quality whose encoded size is ≤ targetBytes, by binary
 * search over an injected encoder (so the search itself is testable without a
 * Canvas). Returns the best quality found and its size; if even the lowest
 * quality exceeds the target, returns that lowest result.
 */
export async function searchQualityForTarget(
  encodeSize: (q: number) => Promise<number>,
  targetBytes: number,
  lo = 0.3,
  hi = 0.95,
  iters = 7,
): Promise<{ quality: number; size: number }> {
  const hiSize = await encodeSize(hi);
  if (hiSize <= targetBytes) return { quality: hi, size: hiSize };
  const loSize = await encodeSize(lo);
  let best = { quality: lo, size: loSize };
  if (loSize > targetBytes) return best; // can't reach target by quality alone
  let a = lo, b = hi;
  for (let i = 0; i < iters; i++) {
    const mid = (a + b) / 2;
    const s = await encodeSize(mid);
    if (s <= targetBytes) { best = { quality: mid, size: s }; a = mid; } else { b = mid; }
  }
  return best;
}

/**
 * Compress an image to approximately a target byte size: search quality, then —
 * if still too big — progressively cap the longest side and search again. Fully
 * in-browser.
 */
export async function compressImageToTarget(file: File, opts: { format: OutFormat; targetBytes: number; maxDimension?: number }): Promise<CompressedImage> {
  const caps = [opts.maxDimension && opts.maxDimension > 0 ? opts.maxDimension : 0, 2000, 1600, 1280, 1024, 800, 640]
    .filter((v, i, a) => a.indexOf(v) === i);
  let last: CompressedImage | null = null;
  for (const cap of caps) {
    const fmt = resolveFormat(opts.format, file.type);
    if (fmt === 'png') { // PNG is lossless — quality search is meaningless; just resize
      const out = await compressImage(file, { format: 'jpeg', quality: 0.9, maxDimension: cap });
      last = out; if (out.blob.size <= opts.targetBytes) return out; continue;
    }
    const { quality } = await searchQualityForTarget(
      async (q) => (await compressImage(file, { format: opts.format, quality: q, maxDimension: cap })).blob.size,
      opts.targetBytes,
    );
    const out = await compressImage(file, { format: opts.format, quality, maxDimension: cap });
    last = out;
    if (out.blob.size <= opts.targetBytes) return out;
  }
  return last!; // best effort (smallest we could produce)
}
