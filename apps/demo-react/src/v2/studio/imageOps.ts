/**
 * Pure image-editing math for the Image toolkit — no canvas, no DOM, so it's
 * deterministic and unit-testable. The actual pixel work (applying these to an
 * image) lives in imageRender.ts; here we only compute filter strings, target
 * dimensions, rotation bounds, crop clamping, and format/MIME mapping.
 */

export interface Filters {
  brightness: number; // %
  contrast: number;   // %
  saturate: number;   // %
  grayscale: number;  // %
  sepia: number;      // %
  blur: number;       // px
  hue: number;        // deg
}

export const NEUTRAL_FILTERS: Filters = { brightness: 100, contrast: 100, saturate: 100, grayscale: 0, sepia: 0, blur: 0, hue: 0 };

/** A CSS/canvas `filter` value for these settings (also used for live preview). */
export function filterString(f: Filters): string {
  return `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturate}%) grayscale(${f.grayscale}%) sepia(${f.sepia}%) blur(${f.blur}px) hue-rotate(${f.hue}deg)`;
}

export function isNeutral(f: Filters): boolean {
  return (Object.keys(NEUTRAL_FILTERS) as (keyof Filters)[]).every((k) => f[k] === NEUTRAL_FILTERS[k]);
}

export interface Rect { x: number; y: number; w: number; h: number }

/** Scale (w,h) to fit within (maxW,maxH), never upscaling past 1×. */
export function fitDimensions(w: number, h: number, maxW: number, maxH: number): { w: number; h: number } {
  const s = Math.min(maxW / w, maxH / h, 1);
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/** Bounding box of a w×h rectangle rotated by `deg` degrees. */
export function rotatedBounds(w: number, h: number, deg: number): { w: number; h: number } {
  const r = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  return { w: Math.round(w * c + h * s), h: Math.round(w * s + h * c) };
}

/** Clamp a crop rectangle so it stays inside a w×h image (and stays ≥ 1px). */
export function clampCrop(crop: Rect, w: number, h: number): Rect {
  const x = Math.min(Math.max(0, Math.round(crop.x)), w - 1);
  const y = Math.min(Math.max(0, Math.round(crop.y)), h - 1);
  return { x, y, w: Math.max(1, Math.min(Math.round(crop.w), w - x)), h: Math.max(1, Math.min(Math.round(crop.h), h - y)) };
}

export type ImageFormat = 'png' | 'jpeg' | 'webp';
export const mimeFor = (f: ImageFormat): string => (f === 'png' ? 'image/png' : f === 'webp' ? 'image/webp' : 'image/jpeg');
export const extFor = (f: ImageFormat): string => (f === 'jpeg' ? 'jpg' : f);

/** All edits an image op applies, in order: crop → rotate → resize → filter. */
export interface ImageEdit {
  crop?: Rect;
  rotate: number;       // degrees (any)
  scale: number;        // 1 = original size
  filters: Filters;
  format: ImageFormat;
  quality: number;      // 0..1 for jpeg/webp
}

export const defaultEdit = (): ImageEdit => ({ rotate: 0, scale: 1, filters: { ...NEUTRAL_FILTERS }, format: 'png', quality: 0.92 });
