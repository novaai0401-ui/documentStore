import { describe, it, expect } from 'vitest';
import { computeSnap } from './snap.js';

describe('computeSnap', () => {
  const art = { w: 1000, h: 1000 };

  it('snaps an element centre to the artboard centre', () => {
    // 200×100 element whose centre (x+100) is at 503 → should snap centre to 500.
    const r = computeSnap({ x: 403, y: 700, w: 200, h: 100 }, [], art.w, art.h, 8);
    expect(r.x).toBe(400); // centre 500 → left 400
    expect(r.guides).toContainEqual({ axis: 'x', pos: 500 });
  });

  it('snaps a left edge to the artboard left and reports a guide', () => {
    const r = computeSnap({ x: 5, y: 200, w: 100, h: 100 }, [], art.w, art.h, 8);
    expect(r.x).toBe(0);
    expect(r.guides).toContainEqual({ axis: 'x', pos: 0 });
  });

  it('snaps to another element’s edge', () => {
    const other = { x: 600, y: 0, w: 100, h: 100 };
    // Left edge at 596 (Δ4 from other's left 600); far from the artboard centre.
    const r = computeSnap({ x: 596, y: 400, w: 100, h: 100 }, [other], art.w, art.h, 8);
    expect(r.x).toBe(600); // left edge snaps to other's left (600)
    expect(r.guides.some((g) => g.axis === 'x' && g.pos === 600)).toBe(true);
  });

  it('returns no guides when nothing is within the threshold', () => {
    const r = computeSnap({ x: 137, y: 241, w: 60, h: 60 }, [], art.w, art.h, 4);
    expect(r.guides).toHaveLength(0);
    expect(r.x).toBe(137);
    expect(r.y).toBe(241);
  });

  it('picks the closest target when several are in range', () => {
    // left=98 (→100? no target), centre at x+50. Put two targets near: art has 0 and 500.
    const r = computeSnap({ x: 2, y: 0, w: 100, h: 100 }, [{ x: 6, y: 0, w: 10, h: 10 }], art.w, art.h, 12);
    // left edge 2 is closest to 0 (Δ2) vs other's left 6 (Δ4) → snaps to 0
    expect(r.x).toBe(0);
  });
});
