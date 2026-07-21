import { describe, it, expect } from 'vitest';
import { easeOutCubic, elementProgress, presetDelta, frameDesign, motionDelta, progressSamples } from './animate.js';
import { blankDesign, formatById, type Design } from './model.js';

const design = (): Design => ({ ...blankDesign(formatById('ig-post')), elements: [
  { id: 'a', type: 'text', x: 100, y: 100, w: 200, h: 80, text: 'A', size: 40, color: '#000', font: 'Inter', weight: 700, align: 'left' },
  { id: 'b', type: 'rect', x: 0, y: 0, w: 100, h: 100, fill: '#000' },
] });

describe('animate', () => {
  it('eases out within [0,1] and clamps', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(2)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5); // ease-out is ahead at the midpoint
  });

  it('staggers element starts and clamps local progress', () => {
    expect(elementProgress(0, 0, 2)).toBe(0);
    expect(elementProgress(1, 0, 2)).toBe(1);
    // The second element starts later, so at the same global g it's less far along.
    expect(elementProgress(0.3, 1, 2)).toBeLessThan(elementProgress(0.3, 0, 2));
  });

  it('presetDelta is fully revealed at p=1 and hidden/offset at p=0', () => {
    expect(presetDelta('fade', 1, 100, 100)).toEqual({ opacity: 1, dx: 0, dy: 0, scale: 1 });
    expect(presetDelta('rise', 0, 100, 100).dy).toBeGreaterThan(0);
    expect(presetDelta('slide-left', 0, 100, 100).dx).toBeGreaterThan(0);
    expect(presetDelta('pop', 0, 100, 100).scale).toBeCloseTo(0.6);
    expect(presetDelta('fade', 0, 100, 100).opacity).toBe(0);
  });

  it('zoom settles from oversized to exact size (cinematic push-in)', () => {
    expect(presetDelta('zoom', 0, 100, 100).scale).toBeCloseTo(1.18, 5);
    expect(presetDelta('zoom', 1, 100, 100).scale).toBeCloseTo(1, 5);
    expect(presetDelta('zoom', 1, 100, 100).opacity).toBe(1);
  });

  it('frameDesign at g=1 restores original layout and full opacity', () => {
    const f = frameDesign(design(), 1, 'pop');
    expect(f.elements[0]!.x).toBeCloseTo(100);
    expect(f.elements[0]!.w).toBeCloseTo(200);
    expect(f.elements[0]!.opacity).toBeCloseTo(1);
  });

  it('frameDesign at g=0 starts the first element transparent', () => {
    const f = frameDesign(design(), 0, 'fade');
    expect(f.elements[0]!.opacity).toBe(0);
  });

  it('progressSamples spans 0..1 inclusive', () => {
    expect(progressSamples(1)).toEqual([1]);
    const s = progressSamples(5);
    expect(s[0]).toBe(0);
    expect(s[s.length - 1]).toBe(1);
    expect(s).toHaveLength(5);
  });
});

describe('motionDelta (looping element motion)', () => {
  it('no motion is the identity', () => {
    expect(motionDelta(undefined, 0.37, 100, 100)).toEqual({ dx: 0, dy: 0, scale: 1, rot: 0 });
  });

  it('is periodic — phase and phase+1 match (a full loop)', () => {
    for (const m of ['bounce', 'float', 'pulse', 'wobble', 'shake', 'beat'] as const) {
      const a = motionDelta(m, 0.31, 200, 200);
      const b = motionDelta(m, 1.31, 200, 200);
      expect(b.dx).toBeCloseTo(a.dx, 6);
      expect(b.dy).toBeCloseTo(a.dy, 6);
      expect(b.scale).toBeCloseTo(a.scale, 6);
    }
  });

  it('spin sweeps a full turn across one phase and wraps', () => {
    expect(motionDelta('spin', 0, 10, 10).rot).toBe(0);
    expect(motionDelta('spin', 0.5, 10, 10).rot).toBeCloseTo(180);
    expect(motionDelta('spin', 0.999, 10, 10).rot).toBeGreaterThan(359);
    expect(motionDelta('spin', 2, 10, 10).rot).toBeCloseTo(0); // wrapped
  });

  it('bounce only lifts (never sinks) and returns to rest at whole phases', () => {
    expect(motionDelta('bounce', 0, 100, 100).dy).toBeCloseTo(0);
    expect(motionDelta('bounce', 0.5, 100, 100).dy).toBeLessThan(0);
    expect(motionDelta('bounce', 1, 100, 100).dy).toBeCloseTo(0);
  });

  it('pulse and beat only ever enlarge (scale >= 1)', () => {
    for (let p = 0; p < 1; p += 0.1) {
      expect(motionDelta('pulse', p, 50, 50).scale).toBeGreaterThanOrEqual(1);
      expect(motionDelta('beat', p, 50, 50).scale).toBeGreaterThanOrEqual(1);
    }
  });

  it('frameDesign advances motion independently of entrance (moves during the hold)', () => {
    const d: Design = { ...blankDesign(formatById('ig-post')), elements: [
      { id: 's', type: 'text', x: 100, y: 100, w: 100, h: 100, text: '🎈', size: 60, color: '#000', font: 'Inter', weight: 700, align: 'center', motion: 'bounce' },
    ] };
    // Entrance finished (g=1) but two different motion phases → different y.
    const a = frameDesign(d, 1, 'fade', 0.4, 0.25).elements[0]!;
    const b = frameDesign(d, 1, 'fade', 0.4, 0.5).elements[0]!;
    expect(a.y).not.toBeCloseTo(b.y, 2);
  });
});

describe('motionSpeed', () => {
  it('speed multiplies the motion phase — fast at p equals normal at 2p', () => {
    const base: Design = { ...blankDesign(formatById('ig-post')), elements: [
      { id: 'a', type: 'text', x: 100, y: 100, w: 100, h: 100, text: '🎈', size: 60, color: '#000', font: 'Inter', weight: 700, align: 'center', motion: 'float' },
    ] };
    const fast: Design = { ...base, elements: [{ ...base.elements[0]!, motionSpeed: 2 }] };
    const yFast = frameDesign(fast, 1, 'fade', 0.4, 0.2).elements[0]!.y;
    const yNorm2x = frameDesign(base, 1, 'fade', 0.4, 0.4).elements[0]!.y;
    expect(yFast).toBeCloseTo(yNorm2x, 6);
    // and zero/absent speed is guarded to 1×
    const zero: Design = { ...base, elements: [{ ...base.elements[0]!, motionSpeed: 0 }] };
    expect(frameDesign(zero, 1, 'fade', 0.4, 0.2).elements[0]!.y).toBeCloseTo(frameDesign(base, 1, 'fade', 0.4, 0.2).elements[0]!.y, 6);
  });
});
