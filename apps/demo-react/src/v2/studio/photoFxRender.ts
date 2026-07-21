/**
 * Canvas glue for the on-device photo art filters (photoFx.ts): load a photo,
 * downscale it for speed, run the pure pixel filter, and return a data-URI ready
 * to drop into a card / Family Portrait photo slot. Nothing uploads — the image
 * never leaves the browser.
 */
import { loadImage } from './imageRender.js';
import { applyPhotoFx, type PhotoFxId } from './photoFx.js';

/** Longest edge we process at — big enough for a crisp card, small enough that
 *  the O(r²) painting/halftone filters stay snappy on a phone. */
const MAX_EDGE = 900;

/**
 * Stylise a photo with an on-device art filter. Returns a PNG data-URI.
 * `id` = 'sketch' | 'cartoon' | 'painting' | … (see PHOTO_FX).
 * `maxEdge` caps the processed size — pass a small value (e.g. 180) for the
 * quick preview thumbnails in the picker grid, the default for the real result.
 */
export async function stylizePhoto(src: string, id: PhotoFxId, maxEdge = MAX_EDGE): Promise<string> {
  const img = await loadImage(src);
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const scale = Math.min(1, maxEdge / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(img, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  const out = applyPhotoFx(id, image.data, w, h);
  image.data.set(out); // write back into the existing ImageData buffer
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}
