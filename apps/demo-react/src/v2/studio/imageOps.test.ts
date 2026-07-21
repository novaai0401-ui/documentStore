import { describe, it, expect } from 'vitest';
import { filterString, isNeutral, NEUTRAL_FILTERS, fitDimensions, rotatedBounds, clampCrop, mimeFor, extFor } from './imageOps.js';

describe('imageOps', () => {
  it('builds a complete filter string', () => {
    const s = filterString({ ...NEUTRAL_FILTERS, brightness: 110, blur: 2, hue: 45 });
    expect(s).toContain('brightness(110%)');
    expect(s).toContain('blur(2px)');
    expect(s).toContain('hue-rotate(45deg)');
  });
  it('detects the neutral (no-op) filter set', () => {
    expect(isNeutral(NEUTRAL_FILTERS)).toBe(true);
    expect(isNeutral({ ...NEUTRAL_FILTERS, sepia: 20 })).toBe(false);
  });
  it('fits within bounds without upscaling', () => {
    expect(fitDimensions(2000, 1000, 800, 800)).toEqual({ w: 800, h: 400 });
    expect(fitDimensions(100, 100, 800, 800)).toEqual({ w: 100, h: 100 }); // no upscale
  });
  it('computes rotated bounding box (90° swaps, 0° unchanged, 180° same)', () => {
    expect(rotatedBounds(400, 200, 0)).toEqual({ w: 400, h: 200 });
    expect(rotatedBounds(400, 200, 90)).toEqual({ w: 200, h: 400 });
    expect(rotatedBounds(400, 200, 180)).toEqual({ w: 400, h: 200 });
  });
  it('clamps a crop rectangle inside the image', () => {
    expect(clampCrop({ x: -10, y: 5, w: 5000, h: 50 }, 1000, 800)).toEqual({ x: 0, y: 5, w: 1000, h: 50 });
    expect(clampCrop({ x: 990, y: 0, w: 100, h: 100 }, 1000, 800)).toEqual({ x: 990, y: 0, w: 10, h: 100 });
  });
  it('maps formats to MIME types and extensions', () => {
    expect(mimeFor('png')).toBe('image/png');
    expect(mimeFor('jpeg')).toBe('image/jpeg');
    expect(mimeFor('webp')).toBe('image/webp');
    expect(extFor('jpeg')).toBe('jpg');
    expect(extFor('png')).toBe('png');
  });
});
