import { describe, it, expect } from 'vitest';
import { effectParticles, particleAt, effectLayerSvg, effectRises, BACKGROUND_EFFECTS } from './effects.js';

describe('background effects', () => {
  it('offers more than 20 effects, each usable (unique id, non-empty label, renderable)', () => {
    expect(BACKGROUND_EFFECTS.length).toBeGreaterThan(20);
    const ids = BACKGROUND_EFFECTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of BACKGROUND_EFFECTS) {
      expect(e.label.length).toBeGreaterThan(0);
      // every effect produces a positioned particle field (glyphs are defined)
      const svg = effectLayerSvg(e.id, 0.3, 200, 200, 6, 7);
      expect((svg.match(/<text /g) ?? []).length).toBe(6);
    }
  });

  it('particle fields are deterministic per seed and differ across seeds', () => {
    const a = effectParticles('confetti', 10, 7);
    const b = effectParticles('confetti', 10, 7);
    const c = effectParticles('confetti', 10, 8);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a).toHaveLength(10);
    for (const p of a) {
      expect(p.fx).toBeGreaterThanOrEqual(0);
      expect(p.fx).toBeLessThanOrEqual(1);
      expect(p.sizeFrac).toBeGreaterThan(0);
    }
  });

  it('snow falls and balloons rise', () => {
    expect(effectRises('balloons')).toBe(true);
    expect(effectRises('snow')).toBe(false);
    const p = { glyph: '❄️', fx: 0.5, fy: 0, sizeFrac: 0.04, speed: 1, sway: 0 };
    const snow0 = particleAt(p, 'snow', 0, 100, 100);
    const snow1 = particleAt(p, 'snow', 0.25, 100, 100);
    expect(snow1.y).toBeGreaterThan(snow0.y); // downward
    const bal0 = particleAt(p, 'balloons', 0, 100, 100);
    const bal1 = particleAt(p, 'balloons', 0.25, 100, 100);
    expect(bal1.y).toBeLessThan(bal0.y); // upward
  });

  it('travel wraps — a particle re-enters after a full loop', () => {
    const p = { glyph: '🎊', fx: 0.5, fy: 0.4, sizeFrac: 0.04, speed: 1, sway: 0 };
    const a = particleAt(p, 'confetti', 0.1, 200, 200);
    const b = particleAt(p, 'confetti', 1.1, 200, 200); // one loop later
    expect(b.y).toBeCloseTo(a.y, 6);
    expect(b.x).toBeCloseTo(a.x, 6);
  });

  it('effectLayerSvg emits one positioned glyph per particle', () => {
    const svg = effectLayerSvg('hearts', 0.3, 400, 400, 12, 7);
    expect((svg.match(/<text /g) ?? []).length).toBe(12);
    expect(svg).toMatch(/💗|💖|💕/);
  });
});
