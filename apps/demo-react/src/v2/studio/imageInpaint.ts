/**
 * Magic eraser — remove an object by inpainting a rectangular region, on-device
 * and dependency-free. Masked pixels are filled by diffusing the surrounding
 * colours inward (Jacobi relaxation of the 4-neighbour average), which cleanly
 * removes a subject sitting on a roughly uniform/soft area (the common case) with
 * no ML model or network. Pure (operates on an RGBA array) so it's unit-tested;
 * the editor supplies the region (it reuses the crop selection) and canvas glue.
 */

export interface Rect { x: number; y: number; w: number; h: number }

/** Clamp a rectangle to the image bounds and return integer pixel ranges. */
function clampRect(r: Rect, w: number, h: number): { x0: number; y0: number; x1: number; y1: number } {
  const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(w, Math.ceil(r.x + r.w)), y1 = Math.min(h, Math.ceil(r.y + r.h));
  return { x0, y0, x1, y1 };
}

/**
 * Return a new RGBA array with the rectangle inpainted (the object removed).
 * `iterations` controls fill smoothness/cost. The input is not mutated.
 */
export function inpaintRect(px: Uint8ClampedArray, w: number, h: number, rect: Rect, iterations = 80): Uint8ClampedArray {
  const out = new Uint8ClampedArray(px);
  const { x0, y0, x1, y1 } = clampRect(rect, w, h);
  if (x1 <= x0 || y1 <= y0) return out;

  const mask = new Uint8Array(w * h);
  const masked: number[] = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * w + x; mask[i] = 1; masked.push(i); }
  if (!masked.length) return out;

  // Seed masked pixels with the mean colour of the region's immediate border so
  // relaxation starts from something sensible and converges fast.
  let sr = 0, sg = 0, sb = 0, n = 0;
  const sample = (x: number, y: number) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = y * w + x; if (mask[i]) return; sr += px[i * 4]!; sg += px[i * 4 + 1]!; sb += px[i * 4 + 2]!; n++; };
  for (let x = x0 - 1; x <= x1; x++) { sample(x, y0 - 1); sample(x, y1); }
  for (let y = y0 - 1; y <= y1; y++) { sample(x0 - 1, y); sample(x1, y); }
  if (n) { const mr = sr / n, mg = sg / n, mb = sb / n; for (const i of masked) { out[i * 4] = mr; out[i * 4 + 1] = mg; out[i * 4 + 2] = mb; out[i * 4 + 3] = 255; } }

  // Jacobi relaxation: each masked pixel becomes the average of its 4 neighbours,
  // read from a per-iteration snapshot so the diffusion is stable/deterministic.
  for (let it = 0; it < iterations; it++) {
    const buf = out.slice();
    for (const i of masked) {
      const x = i % w, y = (i / w) | 0;
      let r = 0, g = 0, b = 0, c = 0;
      const add = (xx: number, yy: number) => { if (xx < 0 || yy < 0 || xx >= w || yy >= h) return; const j = (yy * w + xx) * 4; r += buf[j]!; g += buf[j + 1]!; b += buf[j + 2]!; c++; };
      add(x - 1, y); add(x + 1, y); add(x, y - 1); add(x, y + 1);
      if (c) { out[i * 4] = r / c; out[i * 4 + 1] = g / c; out[i * 4 + 2] = b / c; }
    }
  }
  return out;
}
