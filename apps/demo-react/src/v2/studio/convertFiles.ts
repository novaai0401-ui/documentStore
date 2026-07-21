/**
 * Universal Converter — change image (and HEIC) formats, and turn images into a
 * PDF, 100% in the browser. HEIC/HEIF (every iPhone photo, undecodable by most
 * browsers) is decoded with a bundled WASM build of libheif (heic2any, lazy
 * loaded — no network), then re-encoded through the shared Canvas pipeline in
 * compress.ts. Pure helpers here are unit-tested; the UI lives in ConvertModal.
 */
import { compressImage, FORMAT_EXT, type CompressedImage } from './compress.js';

export type ImgTarget = 'jpeg' | 'png' | 'webp' | 'avif';
export const IMG_TARGETS: ImgTarget[] = ['jpeg', 'png', 'webp', 'avif'];

/** Detect Apple HEIC/HEIF, which the Canvas can't decode on its own. */
export function isHeic(mime: string, name: string): boolean {
  return /image\/hei[cf]/i.test(mime) || /\.(heic|heif)$/i.test(name);
}

/** Can the Canvas pipeline (after any HEIC decode) handle this as an image? */
export function isConvertibleImage(mime: string, name: string): boolean {
  if (isHeic(mime, name)) return true;
  if (/^image\/(png|jpe?g|webp|avif|gif|bmp)$/i.test(mime)) return true;
  return /\.(png|jpe?g|webp|avif|gif|bmp)$/i.test(name);
}

/** The output extension for a chosen target image format. */
export const targetExt = (t: ImgTarget): string => FORMAT_EXT[t];

/** Decode a HEIC/HEIF blob to a PNG blob using the lazy-loaded WASM decoder. */
export async function decodeHeic(file: Blob): Promise<Blob> {
  const heic2any = (await import('heic2any')).default as (o: { blob: Blob; toType?: string; quality?: number }) => Promise<Blob | Blob[]>;
  const out = await heic2any({ blob: file, toType: 'image/png' });
  return Array.isArray(out) ? out[0]! : out;
}

export interface ConvertOpts { target: ImgTarget; quality?: number; maxDimension?: number }

/** Convert one image file to the target format (handles HEIC decode first). */
export async function convertImage(file: File, opts: ConvertOpts): Promise<CompressedImage> {
  const source: Blob = isHeic(file.type, file.name) ? await decodeHeic(file) : file;
  return compressImage(source, {
    format: opts.target,
    quality: opts.quality ?? 0.92, // high quality by default — conversion, not crunching
    maxDimension: opts.maxDimension ?? 0,
  });
}
