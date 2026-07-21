import { describe, it, expect } from 'vitest';
import { MEMORY_FRAMES, memoryFrameById, photoRectFor } from './memoryFrames.js';
import { scaleKenBurns, kenBurnsFor } from './slideshow.js';

describe('memoryFrames', () => {
  it('exposes a stable set with a safe default', () => {
    expect(MEMORY_FRAMES[0]!.id).toBe('none');
    expect(memoryFrameById('does-not-exist').id).toBe('none');
    expect(memoryFrameById('polaroid').label).toBe('Polaroid');
  });

  it("full-bleed frames fill the whole canvas", () => {
    for (const id of ['none', 'vignette']) {
      const r = photoRectFor(id, 1080, 1920);
      expect(r).toEqual({ x: 0, y: 0, rw: 1080, rh: 1920, radius: 0 });
    }
  });

  it('matted frames inset the photo and stay inside the canvas', () => {
    for (const id of ['rounded', 'polaroid', 'film']) {
      const r = photoRectFor(id, 1080, 1920);
      expect(r.x).toBeGreaterThan(0);
      expect(r.y).toBeGreaterThan(0);
      expect(r.x + r.rw).toBeLessThanOrEqual(1080);
      expect(r.y + r.rh).toBeLessThanOrEqual(1920);
      expect(r.rw).toBeGreaterThan(0);
      expect(r.rh).toBeGreaterThan(0);
    }
  });

  it('polaroid leaves a wider bottom lip than its top margin', () => {
    const r = photoRectFor('polaroid', 1000, 1000);
    const top = r.y;
    const bottom = 1000 - (r.y + r.rh);
    expect(bottom).toBeGreaterThan(top);
  });
});

describe('scaleKenBurns', () => {
  const kb = kenBurnsFor(0); // a zoom-in move

  it('factor 0 = a perfectly still, centred photo', () => {
    const s = scaleKenBurns(kb, 0);
    expect(s.fromScale).toBe(1);
    expect(s.toScale).toBe(1);
    expect(s.fromCx).toBeCloseTo(0.5);
    expect(s.toCx).toBeCloseTo(0.5);
  });

  it('factor 1 leaves the move unchanged', () => {
    const s = scaleKenBurns(kb, 1);
    expect(s.fromScale).toBeCloseTo(kb.fromScale);
    expect(s.toCx).toBeCloseTo(kb.toCx);
  });

  it('never drops scale below 1 (photo always covers the frame)', () => {
    for (const f of [0, 0.5, 1, 1.7, 3]) {
      const s = scaleKenBurns(kb, f);
      expect(s.fromScale).toBeGreaterThanOrEqual(1);
      expect(s.toScale).toBeGreaterThanOrEqual(1);
    }
  });

  it('a livelier factor zooms/pans more than the authored move', () => {
    const s = scaleKenBurns(kb, 1.7);
    expect(s.toScale).toBeGreaterThan(kb.toScale);
  });
});
