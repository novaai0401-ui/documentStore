/**
 * Document scanner core — turn phone-camera shots (or uploaded photos) into a
 * clean multi-page PDF, 100% in the browser. Pure helpers here (enhance filters,
 * rotation geometry, page ordering); the camera/Canvas capture and PDF assembly
 * live in ScannerModal. A privacy-first, no-upload replacement for the scanner
 * apps people use daily (CamScanner / the retiring Microsoft Lens).
 */

/** Visual enhancement applied to a captured page. */
export type ScanMode = 'color' | 'grayscale' | 'bw';

/** CSS/Canvas filter string for a scan mode (brightens + lifts contrast like a scanner). */
export function scanFilter(mode: ScanMode): string {
  switch (mode) {
    case 'grayscale': return 'grayscale(1) contrast(1.25) brightness(1.08)';
    case 'bw': return 'grayscale(1) contrast(1.9) brightness(1.12)';
    case 'color':
    default: return 'contrast(1.12) saturate(1.05) brightness(1.05)';
  }
}

/** Bounding box of a w×h image rotated by a multiple of 90°. */
export function rotatedSize(w: number, h: number, deg: number): { w: number; h: number } {
  return (((deg % 360) + 360) % 360) % 180 === 90 ? { w: h, h: w } : { w, h };
}

/** Move an item within an array (returns a new array); used to reorder pages. */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return arr;
  const next = arr.slice();
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it!);
  return next;
}

/** Normalize a rotation to 0/90/180/270. */
export const normalizeRotation = (deg: number): number => (((deg % 360) + 360) % 360);

/** Otsu's method: the luminance threshold (0–255) that best splits a histogram. */
export function otsuThreshold(hist: number[], total: number): number {
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * (hist[t] || 0);
  let sumB = 0, wB = 0, max = -1, threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t] || 0;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * (hist[t] || 0);
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > max) { max = between; threshold = t; }
  }
  return threshold;
}

export interface Bounds { x: number; y: number; w: number; h: number }

/**
 * Detect the document's content rectangle in RGBA pixel data: split light vs
 * dark by Otsu, then bound the brighter region (a page on a darker surface),
 * with a little padding. Returns the full frame if detection looks unreliable
 * (almost-empty or almost-full result). Pure — no Canvas/DOM.
 */
export function documentBounds(data: Uint8ClampedArray | number[], w: number, h: number, pad = 0.02): Bounds {
  const full: Bounds = { x: 0, y: 0, w, h };
  const hist = new Array(256).fill(0);
  const lum = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    const l = (data[p]! * 0.299 + data[p + 1]! * 0.587 + data[p + 2]! * 0.114) | 0;
    lum[i] = l; hist[l]++;
  }
  const t = otsuThreshold(hist, w * h);
  // Per-row / per-column bright counts → trim to where content density is real.
  const rowCount = new Array(h).fill(0);
  const colCount = new Array(w).fill(0);
  let bright = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (lum[y * w + x]! > t) { rowCount[y]++; colCount[x]++; bright++; }
  if (bright < w * h * 0.05 || bright > w * h * 0.97) return full; // unreliable → keep full frame
  const rowMin = w * 0.15, colMin = h * 0.15; // a row/col counts only if ≥15% bright
  let top = 0; while (top < h && rowCount[top]! < rowMin) top++;
  let bottom = h - 1; while (bottom > top && rowCount[bottom]! < rowMin) bottom--;
  let left = 0; while (left < w && colCount[left]! < colMin) left++;
  let right = w - 1; while (right > left && colCount[right]! < colMin) right--;
  if (right - left < w * 0.1 || bottom - top < h * 0.1) return full;
  const px = Math.round(w * pad), py = Math.round(h * pad);
  const x = Math.max(0, left - px), y = Math.max(0, top - py);
  return { x, y, w: Math.min(w - x, right - left + 1 + px * 2), h: Math.min(h - y, bottom - top + 1 + py * 2) };
}
