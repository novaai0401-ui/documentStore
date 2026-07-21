import { describe, it, expect } from 'vitest';
import { clampTrim, videoScale, gifFrameTimes, gifDelayCs, aspectRatio, outputDims, coverSrcRect } from './video.js';

describe('video helpers', () => {
  it('clamps trim into a valid sub-range', () => {
    expect(clampTrim(2, 8, 10)).toEqual({ in: 2, out: 8 });
    expect(clampTrim(-5, 99, 10)).toEqual({ in: 0, out: 10 });
    const r = clampTrim(6, 6, 10); // zero/negative span → tiny forward window
    expect(r.in).toBe(6); expect(r.out).toBeGreaterThan(6);
  });
  it('produces even, capped video dimensions', () => {
    expect(videoScale(1920, 1080, 1280)).toEqual({ w: 1280, h: 720 });
    const s = videoScale(1921, 1081, 1280); // never odd
    expect(s.w % 2).toBe(0); expect(s.h % 2).toBe(0);
    expect(videoScale(640, 480, 0)).toEqual({ w: 640, h: 480 }); // no cap
  });
  it('samples GIF frames at fps, capped', () => {
    expect(gifFrameTimes(0, 2, 10).length).toBe(20);
    expect(gifFrameTimes(0, 100, 30, 50).length).toBe(50); // hits the cap
    const t = gifFrameTimes(1, 2, 4);
    expect(t[0]).toBe(1); expect(t.length).toBe(4);
  });
  it('maps fps → centisecond delay', () => {
    expect(gifDelayCs(10)).toBe(10);
    expect(gifDelayCs(25)).toBe(4);
    expect(gifDelayCs(50)).toBe(gifDelayCs(30)); // capped at 30fps
  });
});

describe('video aspect / short crop', () => {
  it('computes aspect ratios', () => {
    expect(aspectRatio('1:1', 100, 50)).toBe(1);
    expect(aspectRatio('9:16', 100, 50)).toBeCloseTo(0.5625);
    expect(aspectRatio('16:9', 100, 50)).toBeCloseTo(16 / 9);
    expect(aspectRatio('source', 100, 50)).toBe(2);
  });
  it('produces even, capped dimensions for a 9:16 short', () => {
    const d = outputDims(1280, 720, '9:16', 1280);
    expect(d.h).toBe(720); expect(d.w).toBe(404); // 720*0.5625=405 → even 404
    expect(d.w % 2).toBe(0); expect(d.h % 2).toBe(0);
  });
  it('cover-crops the source to fill the target without distortion', () => {
    const c = coverSrcRect(1280, 720, 405, 720); // landscape → vertical: crop width
    expect(Math.round(c.sh)).toBe(720);
    expect(Math.round(c.sw)).toBe(405);
    expect(c.sy).toBe(0);
    expect(Math.round(c.sx)).toBe(Math.round((1280 - 405) / 2));
  });
});
