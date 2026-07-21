/**
 * Background removal — dependency-free and on-device. It flood-fills inward from
 * the image edges, turning every pixel that's connected to the border and close
 * (within `tolerance`) to the corner background colour transparent. This nails the
 * common case (a subject on a solid / near-solid background: logos, product shots,
 * headshots on a plain wall) without any ML model or network. Pure (operates on a
 * pixel array) so it's unit-testable; the canvas glue lives in the editor.
 *
 * It is intentionally honest about its limits: busy/gradient photo backgrounds are
 * a job for an ML matting model, which can be added later as an opt-in.
 */

/** Average RGB of the four corner pixels — our background reference colour. */
export function cornerReference(px: Uint8ClampedArray, w: number, h: number): [number, number, number] {
  const corners = [0, (w - 1), (h - 1) * w, h * w - 1];
  let r = 0, g = 0, b = 0;
  for (const i of corners) { r += px[i * 4]!; g += px[i * 4 + 1]!; b += px[i * 4 + 2]!; }
  return [r / 4, g / 4, b / 4];
}

const dist2 = (px: Uint8ClampedArray, i: number, ref: [number, number, number]): number => {
  const dr = px[i * 4]! - ref[0], dg = px[i * 4 + 1]! - ref[1], db = px[i * 4 + 2]! - ref[2];
  return dr * dr + dg * dg + db * db;
};

/**
 * Return a new RGBA array with the connected edge background made transparent.
 * `tolerance` is a colour distance budget. With `feather` on (default), pixels in
 * the outer band of the tolerance get *partial* transparency proportional to how
 * close they are to the background colour, which softens the cut-out edge instead
 * of leaving a hard, aliased outline.
 */
export function removeBackground(px: Uint8ClampedArray, w: number, h: number, tolerance = 48, feather = true): Uint8ClampedArray {
  const out = new Uint8ClampedArray(px);
  const ref = cornerReference(px, w, h);
  const t1 = tolerance;                 // outer: connectivity / partial edge
  const t0 = feather ? tolerance * 0.6 : tolerance; // inner: fully transparent
  const t1sq = t1 * t1;
  const t0sq = t0 * t0;
  const span = t1 - t0;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];

  const consider = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (seen[i] || dist2(px, i, ref) > t1sq) return;
    seen[i] = 1;
    stack.push(i);
  };
  // Seed from the entire border.
  for (let x = 0; x < w; x++) { consider(x, 0); consider(x, h - 1); }
  for (let y = 0; y < h; y++) { consider(0, y); consider(w - 1, y); }

  while (stack.length) {
    const i = stack.pop()!;
    const d2 = dist2(px, i, ref);
    if (d2 <= t0sq || span <= 0) out[i * 4 + 3] = 0;
    else out[i * 4 + 3] = Math.round(255 * ((Math.sqrt(d2) - t0) / span)); // feathered edge
    const x = i % w, y = (i / w) | 0;
    consider(x - 1, y); consider(x + 1, y); consider(x, y - 1); consider(x, y + 1);
  }
  return out;
}
