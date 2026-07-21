import { describe, it, expect } from 'vitest';
import { kenBurnsFor, kenBurnsAt, slideshowPlan, slideshowDuration, slideshowSeconds } from './slideshow.js';

describe('memory-video slideshow engine', () => {
  it('Ken Burns is a gentle, deterministic move within safe zoom bounds', () => {
    for (let i = 0; i < 8; i++) {
      const kb = kenBurnsFor(i);
      expect(kenBurnsFor(i)).toEqual(kb); // deterministic
      for (const s of [kb.fromScale, kb.toScale]) { expect(s).toBeGreaterThanOrEqual(1); expect(s).toBeLessThanOrEqual(1.2); }
      const a = kenBurnsAt(kb, 0), b = kenBurnsAt(kb, 1);
      expect(a.scale).toBeCloseTo(kb.fromScale, 6);
      expect(b.scale).toBeCloseTo(kb.toScale, 6);
      const mid = kenBurnsAt(kb, 0.5);
      expect(mid.cx).toBeGreaterThanOrEqual(0); expect(mid.cx).toBeLessThanOrEqual(1);
      expect(mid.cy).toBeGreaterThanOrEqual(0); expect(mid.cy).toBeLessThanOrEqual(1);
    }
  });

  it('consecutive photos alternate zoom direction (in vs out) for variety', () => {
    const a = kenBurnsFor(0), b = kenBurnsFor(1);
    expect(a.toScale).toBeGreaterThan(a.fromScale); // zoom in
    expect(b.toScale).toBeLessThan(b.fromScale);    // zoom out
  });

  it('plan holds each photo then crossfades, with exact length', () => {
    const frames = slideshowPlan({ photos: 3, perPhotoSec: 2, fps: 30, transition: 'cross', crossSec: 0.5 });
    const holds = frames.filter((f) => f.kind === 'photo').length;
    const trans = frames.filter((f) => f.kind === 'trans').length;
    expect(holds).toBe(3 * 60);      // 3 photos × 2s × 30fps
    expect(trans).toBe(2 * 15);      // 2 gaps × 0.5s × 30fps
    // first frame is photo 0 at p=0, KB progresses to 1 by end of its hold.
    expect(frames[0]).toMatchObject({ kind: 'photo', index: 0, p: 0 });
    expect(frames[59]).toMatchObject({ kind: 'photo', index: 0, p: 1 });
    // transitions reference adjacent photos and ramp mix strictly inside (0,1).
    const firstTrans = frames.find((f) => f.kind === 'trans')!;
    expect(firstTrans).toMatchObject({ kind: 'trans', from: 0, to: 1 });
    if (firstTrans.kind === 'trans') { expect(firstTrans.mix).toBeGreaterThan(0); expect(firstTrans.mix).toBeLessThan(1); }
  });

  it('cut transition emits no transition frames', () => {
    const frames = slideshowPlan({ photos: 3, perPhotoSec: 1, fps: 30, transition: 'cut' });
    expect(frames.some((f) => f.kind === 'trans')).toBe(false);
    expect(frames.length).toBe(3 * 30);
  });

  it('respects the frame cap so huge albums cannot OOM', () => {
    const frames = slideshowPlan({ photos: 1000, perPhotoSec: 3, fps: 30, transition: 'cross', maxFrames: 900 });
    expect(frames.length).toBeLessThanOrEqual(900);
  });

  it('duration maths match the plan', () => {
    expect(slideshowDuration(3, 2, 'cross', 0.5)).toBe(7); // 3*2 + 2*0.5
    expect(slideshowDuration(3, 2, 'cut')).toBe(6);
    expect(slideshowDuration(0, 2, 'cross')).toBe(0);
    expect(slideshowSeconds(90, 30)).toBe(3);
  });
});
