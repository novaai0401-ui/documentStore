import { describe, it, expect } from 'vitest';
import { removeBackground, cornerReference } from './bgRemove.js';

// Build a w×h RGBA buffer from a per-pixel colour function.
function make(w: number, h: number, color: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const [r, g, b, a] = color(x, y);
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  }
  return px;
}
const alpha = (px: Uint8ClampedArray, w: number, x: number, y: number) => px[(y * w + x) * 4 + 3];

describe('bgRemove', () => {
  it('reads the background reference from the corners', () => {
    const px = make(4, 4, () => [255, 255, 255, 255]);
    expect(cornerReference(px, 4, 4)).toEqual([255, 255, 255]);
  });

  it('makes the connected white border transparent and keeps the subject opaque', () => {
    // 6×6 white field with a solid red 2×2 block in the centre.
    const w = 6, h = 6;
    const px = make(w, h, (x, y) => (x >= 2 && x <= 3 && y >= 2 && y <= 3 ? [220, 30, 30, 255] : [255, 255, 255, 255]));
    const out = removeBackground(px, w, h, 40);
    expect(alpha(out, w, 0, 0)).toBe(0); // corner background → transparent
    expect(alpha(out, w, 5, 5)).toBe(0);
    expect(alpha(out, w, 2, 2)).toBe(255); // subject stays
    expect(alpha(out, w, 3, 3)).toBe(255);
  });

  it('does not remove an interior region that is not connected to the edge', () => {
    // White hole inside a red subject must survive (it's enclosed, not border-connected).
    const w = 6, h = 6;
    const px = make(w, h, (x, y) => {
      const inSubject = x >= 1 && x <= 4 && y >= 1 && y <= 4;
      const inHole = x === 2 && y === 2;
      if (inHole) return [255, 255, 255, 255];
      return inSubject ? [220, 30, 30, 255] : [255, 255, 255, 255];
    });
    const out = removeBackground(px, w, h, 40);
    expect(alpha(out, w, 0, 0)).toBe(0);     // outer background gone
    expect(alpha(out, w, 2, 2)).toBe(255);   // enclosed white hole preserved
  });

  it('feathers an edge pixel to partial alpha (anti-aliasing)', () => {
    // White field with a single light-grey pixel in the centre that's within the
    // outer tolerance but past the inner one → should get partial alpha.
    const w = 3, h = 3;
    const px = make(w, h, (x, y) => (x === 1 && y === 1 ? [220, 220, 220, 255] : [255, 255, 255, 255]));
    const out = removeBackground(px, w, h, 80, true); // dist ≈ 60.6, t0=48, t1=80
    const a = alpha(out, w, 1, 1)!;
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(255);
    expect(alpha(out, w, 0, 0)).toBe(0); // pure-white border fully removed
  });

  it('keeps everything when the tolerance is too low to match the background', () => {
    const w = 4, h = 4;
    const px = make(w, h, () => [120, 120, 120, 255]);
    // A uniform image with tolerance 0 still matches its own corners → all removed.
    expect(alpha(removeBackground(px, w, h, 0), w, 1, 1)).toBe(0);
  });
});
