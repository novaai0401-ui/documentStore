import { describe, it, expect } from 'vitest';
import { clipLength, totalDuration, clampClip, clipAt, clipSourceAt, clipStarts, clipVolume, fadeAlpha, frameSourceTimes, moveItem, overlaysAt, overlayY, textPoint, imageOverlaysAt, imageBox, seamBlend, type EditClip, type TextOverlay, type ImageOverlay } from './videoEdit.js';

const clip = (id: string, duration: number, inS = 0, outS = duration): EditClip => ({ id, name: `${id}.mp4`, duration, inS, outS });

describe('videoEdit timeline', () => {
  it('clipLength is the trim window and never negative', () => {
    expect(clipLength({ inS: 1, outS: 4 })).toBe(3);
    expect(clipLength({ inS: 4, outS: 1 })).toBe(0);
  });

  it('totalDuration sums trimmed clips', () => {
    expect(totalDuration([clip('a', 10, 2, 7), clip('b', 4)])).toBe(9);
    expect(totalDuration([])).toBe(0);
  });

  it('clampClip keeps the window inside the source and in ≤ out', () => {
    const c = clampClip(clip('a', 10, -2, 99));
    expect(c.inS).toBe(0);
    expect(c.outS).toBe(10);
    const d = clampClip(clip('a', 10, 8, 3));
    expect(d.outS).toBeGreaterThanOrEqual(d.inS);
  });

  it('clipAt maps movie time to the right clip and source time', () => {
    const clips = [clip('a', 10, 2, 7), clip('b', 6, 1, 4)]; // lengths 5 + 3
    expect(clipAt(clips, 0)).toEqual({ index: 0, sourceTime: 2 });
    expect(clipAt(clips, 4.5)).toEqual({ index: 0, sourceTime: 6.5 });
    expect(clipAt(clips, 5)).toEqual({ index: 1, sourceTime: 1 }); // seam belongs to the next clip
    const late = clipAt(clips, 7.9)!;
    expect(late.index).toBe(1);
    expect(late.sourceTime).toBeCloseTo(3.9, 10);
    expect(clipAt(clips, 8)).toBeNull(); // past the end
    expect(clipAt(clips, -1)).toBeNull();
    expect(clipAt([], 0)).toBeNull();
  });

  it('speed shortens or stretches the on-screen length', () => {
    expect(clipLength({ inS: 0, outS: 4, speed: 2 })).toBe(2);   // fast-forward
    expect(clipLength({ inS: 0, outS: 4, speed: 0.5 })).toBe(8); // slow motion
    expect(clipLength({ inS: 0, outS: 4 })).toBe(4);             // default 1×
    expect(clipLength({ inS: 0, outS: 4, speed: 0 })).toBe(4);   // guarded
  });

  it('clipAt maps movie time through speed to the right source time', () => {
    const clips = [{ ...clip('a', 10, 2, 6), speed: 2 }, clip('b', 6, 0, 3)]; // on-screen 2s + 3s
    expect(clipAt(clips, 1)).toEqual({ index: 0, sourceTime: 4 });  // 1s × 2× past inS=2
    expect(clipAt(clips, 2)).toEqual({ index: 1, sourceTime: 0 });  // seam at 2s now
    expect(clipAt(clips, 4.5)).toEqual({ index: 1, sourceTime: 2.5 });
    expect(clipAt(clips, 5)).toBeNull();
  });

  it('clipSourceAt tracks the trim window and freezes at its edges', () => {
    const c = clip('a', 10, 2, 6);
    expect(clipSourceAt(c, 5, 6)).toBe(3);           // 1s into the clip
    expect(clipSourceAt(c, 5, 4)).toBe(2);           // before its start → first frame
    expect(clipSourceAt(c, 5, 99)).toBeCloseTo(5.999); // after its end → last frame
    expect(clipSourceAt({ ...c, speed: 2 }, 5, 6)).toBe(4); // speed-aware
  });

  it('seamBlend opens a mix window across each cut and nowhere else', () => {
    const clips = [clip('a', 5, 0, 2), clip('b', 5, 0, 3)]; // seam at t=2
    expect(seamBlend(clips, 1.0, 1)).toBeNull();
    expect(seamBlend(clips, 1.6, 1)).toEqual({ from: 0, to: 1, mix: expect.closeTo(0.1, 5) });
    expect(seamBlend(clips, 2.0, 1)).toEqual({ from: 0, to: 1, mix: expect.closeTo(0.5, 5) });
    expect(seamBlend(clips, 2.4, 1)).toEqual({ from: 0, to: 1, mix: expect.closeTo(0.9, 5) });
    expect(seamBlend(clips, 3.0, 1)).toBeNull();
    expect(seamBlend(clips, 2.0, 0)).toBeNull();      // transitions off
    expect(seamBlend([clips[0]!], 1, 1)).toBeNull();  // single clip → no seams
  });

  it('seamBlend never blends wider than the shorter neighbour', () => {
    const clips = [clip('a', 5, 0, 0.4), clip('b', 5, 0, 4)]; // outgoing only 0.4s long
    // window shrinks to 0.4s: t=0.15 is inside, t=0.05 is before it
    expect(seamBlend(clips, 0.05, 2)).toBeNull();
    expect(seamBlend(clips, 0.3, 2)).not.toBeNull();
  });

  it('clipVolume defaults to full and clamps out-of-range values', () => {
    expect(clipVolume({})).toBe(1);
    expect(clipVolume({ volume: 0 })).toBe(0);
    expect(clipVolume({ volume: 0.4 })).toBe(0.4);
    expect(clipVolume({ volume: 5 })).toBe(1);
    expect(clipVolume({ volume: -1 })).toBe(0);
  });

  it('fadeAlpha darkens the edges and clears the middle', () => {
    expect(fadeAlpha(0, 10, 1)).toBe(1);        // fully dark at frame 0
    expect(fadeAlpha(0.5, 10, 1)).toBeCloseTo(0.5);
    expect(fadeAlpha(5, 10, 1)).toBe(0);        // clear mid-movie
    expect(fadeAlpha(9.5, 10, 1)).toBeCloseTo(0.5);
    expect(fadeAlpha(10, 10, 1)).toBe(1);       // fully dark at the end
    expect(fadeAlpha(3, 10, 0)).toBe(0);        // fade off
    // Movie shorter than two fades: fades shrink instead of overlapping.
    expect(fadeAlpha(0.5, 1, 2)).toBe(0);
  });

  it('clipStarts gives each clip its cumulative movie-time offset', () => {
    expect(clipStarts([clip('a', 10, 2, 7), clip('b', 6, 1, 4), clip('c', 2)])).toEqual([0, 5, 8]);
    expect(clipStarts([])).toEqual([]);
  });

  it('frameSourceTimes samples frame midpoints so the export length is exact', () => {
    const clips = [clip('a', 10, 2, 3), clip('b', 6, 0, 1)]; // 1s + 1s at 4fps → 8 frames
    const times = frameSourceTimes(clips, 4, 8);
    expect(times).toHaveLength(8);
    // Frame 0 samples t=0.125 inside clip a; frame 3 samples t=0.875 (still a).
    expect(times[0]).toEqual({ index: 0, sourceTime: 2.125 });
    expect(times[3]).toEqual({ index: 0, sourceTime: 2.875 });
    // Frame 4 samples t=1.125 → clip b at 0.125; the last frame stays in range.
    expect(times[4]).toEqual({ index: 1, sourceTime: 0.125 });
    expect(times[7]).toEqual({ index: 1, sourceTime: 0.875 });
    expect(times.every(Boolean)).toBe(true); // midpoint sampling never falls off the end
  });

  it('moveItem swaps neighbours and ignores out-of-range moves', () => {
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 2, -1)).toEqual([1, 3, 2]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });
});

describe('videoEdit overlays', () => {
  const ov = (id: string, startS: number, endS: number, text = 'Hi'): TextOverlay =>
    ({ id, text, startS, endS, pos: 'bottom', sizeFrac: 0.06, color: '#fff' });

  it('overlaysAt is inclusive of start, exclusive of end, and skips empty text', () => {
    const ovs = [ov('a', 0, 2), ov('b', 1, 3), ov('c', 0, 10, '   ')];
    expect(overlaysAt(ovs, 0).map((o) => o.id)).toEqual(['a']);
    expect(overlaysAt(ovs, 1).map((o) => o.id)).toEqual(['a', 'b']);
    expect(overlaysAt(ovs, 2).map((o) => o.id)).toEqual(['b']);
    expect(overlaysAt(ovs, 3)).toHaveLength(0);
  });

  it('overlayY orders top < middle < bottom within the frame', () => {
    const h = 720, px = 40;
    const top = overlayY('top', h, px), mid = overlayY('middle', h, px), bot = overlayY('bottom', h, px);
    expect(top).toBeLessThan(mid);
    expect(mid).toBeLessThan(bot);
    expect(top).toBeGreaterThan(0);
    expect(bot).toBeLessThan(h);
  });
});

describe('videoEdit image overlays', () => {
  const img = (id: string, startS: number, endS: number, pos: ImageOverlay['pos'] = 'top'): ImageOverlay =>
    ({ id, startS, endS, pos, sizeFrac: 0.4 });

  it('imageOverlaysAt is inclusive of start, exclusive of end', () => {
    const xs = [img('a', 0, 2), img('b', 1, 3)];
    expect(imageOverlaysAt(xs, 0).map((o) => o.id)).toEqual(['a']);
    expect(imageOverlaysAt(xs, 1).map((o) => o.id)).toEqual(['a', 'b']);
    expect(imageOverlaysAt(xs, 3)).toHaveLength(0);
  });

  it('imageBox centres horizontally and stacks top < middle < bottom, staying in-frame', () => {
    const w = 1080, h = 1920, dw = 400, dh = 300;
    const top = imageBox('top', w, h, dw, dh), mid = imageBox('middle', w, h, dw, dh), bot = imageBox('bottom', w, h, dw, dh);
    for (const b of [top, mid, bot]) {
      expect(b.x).toBe(Math.round((w - dw) / 2)); // centred
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y + dh).toBeLessThanOrEqual(h); // fully on-screen
    }
    expect(top.y).toBeLessThan(mid.y);
    expect(mid.y).toBeLessThan(bot.y);
  });

  it('imageBox free placement (fx/fy) centres on the point and clamps in-frame', () => {
    const w = 1000, h = 2000, dw = 400, dh = 300;
    // Centre of frame → box centred there.
    const mid = imageBox('top', w, h, dw, dh, 0.5, 0.5);
    expect(mid.x).toBe(Math.round(0.5 * w - dw / 2));
    expect(mid.y).toBe(Math.round(0.5 * h - dh / 2));
    // Beyond the edge → clamped fully inside.
    const corner = imageBox('top', w, h, dw, dh, 1, 1);
    expect(corner.x).toBe(w - dw);
    expect(corner.y).toBe(h - dh);
    const neg = imageBox('top', w, h, dw, dh, 0, 0);
    expect(neg.x).toBe(0);
    expect(neg.y).toBe(0);
  });
});

describe('videoEdit textPoint', () => {
  it('uses the pos baseline centred horizontally when no free placement', () => {
    const w = 1080, h = 1920, px = 60;
    const p = textPoint({ pos: 'bottom' }, w, h, px);
    expect(p.x).toBe(Math.round(w / 2));
    expect(p.y).toBe(overlayY('bottom', h, px));
  });
  it('honours free fx/fy (clamped) when set', () => {
    const w = 1000, h = 2000, px = 50;
    const p = textPoint({ pos: 'top', fx: 0.25, fy: 0.75 }, w, h, px);
    expect(p.x).toBe(250);
    expect(p.y).toBe(1500);
    const clamped = textPoint({ pos: 'top', fx: 2, fy: -1 }, w, h, px);
    expect(clamped.x).toBe(w);       // clamped to width
    expect(clamped.y).toBe(px);      // clamped to >= fontPx
  });
});
