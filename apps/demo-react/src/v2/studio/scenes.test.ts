import { describe, it, expect } from 'vitest';
import { scenePlan, planSeconds, type SceneFrame } from './scenes.js';

const pageFrames = (plan: SceneFrame[]) => plan.filter((f) => f.kind === 'page') as Extract<SceneFrame, { kind: 'page' }>[];
const crossFrames = (plan: SceneFrame[]) => plan.filter((f) => f.kind === 'cross') as Extract<SceneFrame, { kind: 'cross' }>[];

describe('scenePlan', () => {
  it('single page has no transitions and runs entrance 0→1 plus a hold', () => {
    const plan = scenePlan({ pages: 1, fps: 10, enterSec: 1, holdSec: 0.5, transition: 'cross' });
    expect(crossFrames(plan)).toHaveLength(0);
    const pf = pageFrames(plan);
    expect(pf[0]).toEqual({ kind: 'page', page: 0, progress: 0 });
    // The entrance ends at exactly 1, then the hold repeats 1.
    expect(pf[pf.length - 1]!.progress).toBe(1);
    expect(pf.filter((f) => f.progress === 1).length).toBeGreaterThanOrEqual(5); // 0.5s hold at 10fps
  });

  it('crossfades sit between consecutive scenes with mixes strictly inside (0,1)', () => {
    const plan = scenePlan({ pages: 3, fps: 10, enterSec: 1, transition: 'cross', crossSec: 0.5 });
    const xs = crossFrames(plan);
    expect(xs.length).toBe(2 * 5); // two seams × 0.5s at 10fps
    for (const x of xs) {
      expect(x.mix).toBeGreaterThan(0);
      expect(x.mix).toBeLessThan(1);
      expect(x.to).toBe(x.from + 1);
    }
    // Mixes ramp up monotonically within one seam.
    const seam = xs.filter((x) => x.from === 0);
    for (let i = 1; i < seam.length; i++) expect(seam[i]!.mix).toBeGreaterThan(seam[i - 1]!.mix);
  });

  it('cut transition produces no cross frames but keeps every scene', () => {
    const plan = scenePlan({ pages: 3, fps: 12, enterSec: 1, transition: 'cut' });
    expect(crossFrames(plan)).toHaveLength(0);
    expect(new Set(pageFrames(plan).map((f) => f.page))).toEqual(new Set([0, 1, 2]));
  });

  it('scenes appear in order and each entrance restarts from 0', () => {
    const plan = scenePlan({ pages: 2, fps: 10, enterSec: 1, transition: 'cut', holdSec: 0 });
    const pf = pageFrames(plan);
    const firstOfPage1 = pf.find((f) => f.page === 1)!;
    expect(firstOfPage1.progress).toBe(0);
    // Every page-0 frame precedes every page-1 frame.
    expect(pf.findIndex((f) => f.page === 1)).toBe(pf.filter((f) => f.page === 0).length);
  });

  it('caps runaway plans at maxFrames', () => {
    const plan = scenePlan({ pages: 50, fps: 30, enterSec: 10, transition: 'cross', maxFrames: 100 });
    expect(plan).toHaveLength(100);
  });

  it('planSeconds converts frames to wall-clock', () => {
    expect(planSeconds(150, 15)).toBe(10);
    expect(planSeconds(10, 0)).toBe(10); // guards divide-by-zero
  });
});
