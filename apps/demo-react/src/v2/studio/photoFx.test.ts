import { describe, it, expect } from 'vitest';
import {
  PHOTO_FX, applyPhotoFx, grayscalePlane, boxBlurPlane, sobelEdges, posterize,
  fxSketch, fxCartoon, fxPopart, fxSepia, fxNoir, fxHalftone,
} from './photoFx.js';

/** A tiny synthetic RGBA image: a bright square on a dark field (has edges). */
function makeImage(w: number, h: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inside = x > w / 4 && x < (3 * w) / 4 && y > h / 4 && y < (3 * h) / 4;
    const i = (y * w + x) * 4;
    px[i] = inside ? 220 : 30; px[i + 1] = inside ? 180 : 40; px[i + 2] = inside ? 60 : 90; px[i + 3] = 255;
  }
  return px;
}

const W = 24, H = 24;

describe('on-device photo art filters', () => {
  it('exposes a menu of styles, each with a label + emoji', () => {
    expect(PHOTO_FX.length).toBeGreaterThanOrEqual(6);
    for (const fx of PHOTO_FX) { expect(fx.label.length).toBeGreaterThan(0); expect(fx.emoji.length).toBeGreaterThan(0); }
    expect(PHOTO_FX.map((f) => f.id)).toContain('sketch');
    expect(PHOTO_FX.map((f) => f.id)).toContain('cartoon');
  });

  it('grayscale + blur + sobel are well-formed building blocks', () => {
    const g = grayscalePlane(makeImage(W, H), W, H);
    expect(g.length).toBe(W * H);
    const blur = boxBlurPlane(g, W, H, 3);
    expect(blur.length).toBe(W * H);
    // Blur reduces variance vs the sharp original.
    const varr = (a: Float32Array) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length; };
    expect(varr(blur)).toBeLessThan(varr(g));
    // Sobel lights up on the square's border, ~0 in the flat interior.
    const edges = sobelEdges(g, W, H);
    expect(Math.max(...edges)).toBeGreaterThan(0.1);
    expect(edges[Math.floor(H / 2) * W + Math.floor(W / 2)]).toBeLessThan(0.05);
  });

  it('posterize snaps values into discrete bands', () => {
    const vals = [0, 40, 90, 150, 200, 255].map((v) => posterize(v, 4));
    expect(new Set(vals).size).toBeLessThanOrEqual(4);
    expect(vals.every((v) => v >= 0 && v <= 255)).toBe(true);
  });

  it('every filter returns a same-size RGBA buffer with alpha preserved', () => {
    const src = makeImage(W, H);
    for (const fx of PHOTO_FX) {
      const out = applyPhotoFx(fx.id, src, W, H);
      expect(out.length).toBe(src.length);
      for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(255); // alpha kept
      // Output actually differs from the input (the filter did something).
      let diff = 0; for (let i = 0; i < out.length; i++) if (out[i] !== src[i]) diff++;
      expect(diff).toBeGreaterThan(0);
    }
  });

  it('sketch and noir are grayscale (r=g=b); sepia is warm (r>b)', () => {
    const src = makeImage(W, H);
    for (const fn of [fxSketch, fxNoir]) {
      const out = fn(src, W, H);
      for (let i = 0; i < out.length; i += 4) { expect(out[i]).toBe(out[i + 1]); expect(out[i + 1]).toBe(out[i + 2]); }
    }
    const sep = fxSepia(src, W, H);
    let warmer = 0; for (let i = 0; i < sep.length; i += 4) if (sep[i]! >= sep[i + 2]!) warmer++;
    expect(warmer).toBe(W * H); // red channel always ≥ blue in sepia
  });

  it('cartoon lays black edge lines; popart flattens to few tones', () => {
    const src = makeImage(W, H);
    const cartoon = fxCartoon(src, W, H);
    let black = 0; for (let i = 0; i < cartoon.length; i += 4) if (cartoon[i] === 0 && cartoon[i + 1] === 0 && cartoon[i + 2] === 0) black++;
    expect(black).toBeGreaterThan(0); // edge outline present
    const pop = fxPopart(src, W, H);
    const tones = new Set<number>(); for (let i = 0; i < pop.length; i += 4) tones.add(pop[i]!);
    expect(tones.size).toBeLessThanOrEqual(4); // posterised red channel
  });

  it('halftone renders a two-colour ink-on-paper dot field', () => {
    const out = fxHalftone(makeImage(W, H), W, H);
    const colours = new Set<string>();
    for (let i = 0; i < out.length; i += 4) colours.add(`${out[i]},${out[i + 1]},${out[i + 2]}`);
    expect(colours.size).toBe(2); // exactly paper + ink
  });
});
