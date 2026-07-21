import { describe, it, expect } from 'vitest';
import { inpaintRect } from './imageInpaint.js';

/** Build a uniform RGBA image, then paint a different-coloured block in the middle. */
function makeImage(w: number, h: number, bg: [number, number, number], block: { x: number; y: number; w: number; h: number; color: [number, number, number] }) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { px[i * 4] = bg[0]; px[i * 4 + 1] = bg[1]; px[i * 4 + 2] = bg[2]; px[i * 4 + 3] = 255; }
  for (let y = block.y; y < block.y + block.h; y++) for (let x = block.x; x < block.x + block.w; x++) {
    const i = y * w + x; px[i * 4] = block.color[0]; px[i * 4 + 1] = block.color[1]; px[i * 4 + 2] = block.color[2];
  }
  return px;
}

describe('imageInpaint', () => {
  it('removes an object, filling it with the surrounding colour', () => {
    const w = 16, h = 16, bg: [number, number, number] = [100, 150, 200];
    const px = makeImage(w, h, bg, { x: 6, y: 6, w: 4, h: 4, color: [10, 20, 30] });
    const out = inpaintRect(px, w, h, { x: 6, y: 6, w: 4, h: 4 }, 120);
    // A pixel in the centre of the erased block should now be ~background.
    const c = (7 * w + 7) * 4;
    expect(Math.abs(out[c]! - bg[0])).toBeLessThan(8);
    expect(Math.abs(out[c + 1]! - bg[1])).toBeLessThan(8);
    expect(Math.abs(out[c + 2]! - bg[2])).toBeLessThan(8);
  });

  it('does not mutate the input and leaves outside pixels untouched', () => {
    const w = 8, h = 8, bg: [number, number, number] = [50, 60, 70];
    const px = makeImage(w, h, bg, { x: 3, y: 3, w: 2, h: 2, color: [200, 200, 200] });
    const before = px.slice();
    const out = inpaintRect(px, w, h, { x: 3, y: 3, w: 2, h: 2 }, 30);
    expect(px).toEqual(before);              // input untouched
    expect(out[0]).toBe(50);                  // a corner (outside) unchanged
  });

  it('is a no-op for an empty/out-of-bounds rectangle', () => {
    const px = new Uint8ClampedArray(4 * 4 * 4).fill(120);
    const out = inpaintRect(px, 4, 4, { x: 10, y: 10, w: 2, h: 2 });
    expect(out).toEqual(px);
  });
});
