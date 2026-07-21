/**
 * Apply an ImageEdit to a source image, in the browser, via canvas. Order is
 * crop → scale → rotate → filter, mirroring the pure math in imageOps.ts. Output
 * is a Blob / data URL / bytes in the chosen format. Only same-origin or data-URI
 * sources are used, so the canvas never taints and nothing uploads.
 */
import { filterString, mimeFor, rotatedBounds, type ImageEdit } from './imageOps.js';

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

export async function applyEdit(src: string, edit: ImageEdit): Promise<{ blob: Blob; w: number; h: number }> {
  const img = await loadImage(src);
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const cw = edit.crop ? edit.crop.w : iw;
  const ch = edit.crop ? edit.crop.h : ih;
  const cx = edit.crop ? edit.crop.x : 0;
  const cy = edit.crop ? edit.crop.y : 0;
  const sw = Math.max(1, Math.round(cw * edit.scale));
  const sh = Math.max(1, Math.round(ch * edit.scale));
  const bounds = rotatedBounds(sw, sh, edit.rotate);

  const canvas = document.createElement('canvas');
  canvas.width = bounds.w;
  canvas.height = bounds.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  // JPEG has no alpha — paint a white backdrop first (before the filter applies).
  if (edit.format === 'jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, bounds.w, bounds.h); }
  ctx.filter = filterString(edit.filters);
  ctx.translate(bounds.w / 2, bounds.h / 2);
  ctx.rotate((edit.rotate * Math.PI) / 180);
  ctx.drawImage(img, cx, cy, cw, ch, -sw / 2, -sh / 2, sw, sh);

  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode image'))), mimeFor(edit.format), edit.quality));
  return { blob, w: bounds.w, h: bounds.h };
}

const blobToDataUrl = (b: Blob): Promise<string> => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = () => rej(new Error('read failed'));
  r.readAsDataURL(b);
});

export async function editToDataUrl(src: string, edit: ImageEdit): Promise<{ dataUrl: string; w: number; h: number }> {
  const { blob, w, h } = await applyEdit(src, edit);
  return { dataUrl: await blobToDataUrl(blob), w, h };
}

export async function editToBytes(src: string, edit: ImageEdit): Promise<Uint8Array> {
  const { blob } = await applyEdit(src, edit);
  return new Uint8Array(await blob.arrayBuffer());
}

/** Natural pixel size of an image source. */
export async function imageSize(src: string): Promise<{ w: number; h: number }> {
  const img = await loadImage(src);
  return { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
}
