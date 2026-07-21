import { describe, it, expect } from 'vitest';
import { homography, applyH, outputSize, warpToRect, warpRectToQuad, tiltQuad, type Pt } from './perspective.js';

const RECT = (w: number, h: number): Pt[] => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];

describe('homography', () => {
  it('maps each source corner exactly onto its destination corner', () => {
    const from = RECT(100, 100);
    const to: Pt[] = [{ x: 10, y: 20 }, { x: 90, y: 5 }, { x: 95, y: 110 }, { x: 5, y: 95 }]; // a quad
    const H = homography(from, to);
    for (let i = 0; i < 4; i++) {
      const p = applyH(H, from[i]!.x, from[i]!.y);
      expect(p.x).toBeCloseTo(to[i]!.x, 4);
      expect(p.y).toBeCloseTo(to[i]!.y, 4);
    }
  });
  it('identity quad is the identity transform', () => {
    const H = homography(RECT(50, 40), RECT(50, 40));
    const p = applyH(H, 17, 23);
    expect(p.x).toBeCloseTo(17, 6);
    expect(p.y).toBeCloseTo(23, 6);
  });
});

describe('outputSize', () => {
  it('averages opposite edges of the quad', () => {
    expect(outputSize([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }])).toEqual({ w: 200, h: 100 });
  });
});

describe('warpToRect', () => {
  // Build a 4×4 source: left column black, right column white (a vertical split).
  function split(): { data: Uint8ClampedArray; w: number; h: number } {
    const w = 4, h = 4; const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; const v = x < 2 ? 0 : 255;
      data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
    }
    return { data, w, h };
  }
  it('identity warp reproduces the source split', () => {
    const { data, w, h } = split();
    const out = warpToRect(data, w, h, RECT(w, h), w, h);
    // left side dark, right side light (sampled near the column centers)
    const at = (x: number, y: number) => out[(y * w + x) * 4]!;
    expect(at(0, 1)).toBeLessThan(80);
    expect(at(3, 1)).toBeGreaterThan(180);
  });
  it('cropping a sub-quad rescales it to fill the output', () => {
    const { data, w, h } = split();
    // Warp only the right (white) half → output should be all white-ish.
    const rightHalf: Pt[] = [{ x: 2, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 2, y: 4 }];
    const out = warpToRect(data, w, h, rightHalf, 8, 8);
    let sum = 0; for (let i = 0; i < out.length; i += 4) sum += out[i]!;
    expect(sum / (out.length / 4)).toBeGreaterThan(180); // mostly white
  });
});

describe('tiltQuad + warpRectToQuad (3D tilt)', () => {
  it('tiltQuad shrinks only the receding edge and clamps the amount', () => {
    const q = tiltQuad(100, 100, 'right', 0.2);
    expect(q[0]).toEqual({ x: 0, y: 0 });           // left edge untouched
    expect(q[3]).toEqual({ x: 0, y: 100 });
    expect(q[1]!.y).toBeCloseTo(20);                // right edge inset top…
    expect(q[2]!.y).toBeCloseTo(80);                // …and bottom
    expect(tiltQuad(100, 100, 'up', 9)[0]!.x).toBeCloseTo(35); // amount clamped to 0.35
  });

  it('identity quad reproduces the source, alpha included', () => {
    const w = 4, h = 4;
    const data = new Uint8ClampedArray(w * h * 4).fill(200);
    const out = warpRectToQuad(data, w, h, [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], w, h);
    expect(out[(1 * w + 1) * 4]).toBeGreaterThan(150);
    expect(out[(1 * w + 1) * 4 + 3]).toBeGreaterThan(150);
  });

  it('a tilted image has transparent corners where the quad receded', () => {
    const w = 20, h = 20;
    const data = new Uint8ClampedArray(w * h * 4).fill(255); // opaque white
    const out = warpRectToQuad(data, w, h, tiltQuad(w, h, 'right', 0.3), w, h);
    const alphaAt = (x: number, y: number) => out[(y * w + x) * 4 + 3]!;
    expect(alphaAt(w - 1, 0)).toBe(0);        // top-right corner receded → transparent
    expect(alphaAt(w - 1, h - 1)).toBe(0);    // bottom-right too
    expect(alphaAt(2, Math.floor(h / 2))).toBeGreaterThan(200); // left mid still solid
    expect(alphaAt(0, 0)).toBeGreaterThan(200);                 // non-receding corner intact
  });
});
