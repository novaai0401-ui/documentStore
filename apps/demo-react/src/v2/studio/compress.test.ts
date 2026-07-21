import { describe, it, expect } from 'vitest';
import { formatBytes, percentSaved, scaledDimensions, resolveFormat, isCompressibleImage, searchQualityForTarget } from './compress.js';

describe('compress size math', () => {
  it('formats byte sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
  });
  it('computes percent saved (never negative)', () => {
    expect(percentSaved(1000, 250)).toBe(75);
    expect(percentSaved(1000, 1000)).toBe(0);
    expect(percentSaved(1000, 1200)).toBe(0); // got bigger → 0, not negative
    expect(percentSaved(0, 100)).toBe(0);
  });
});

describe('scaledDimensions', () => {
  it('never upscales and preserves aspect ratio', () => {
    expect(scaledDimensions(800, 600, 0)).toEqual({ w: 800, h: 600 });   // no cap
    expect(scaledDimensions(800, 600, 2000)).toEqual({ w: 800, h: 600 }); // already small
    expect(scaledDimensions(4000, 3000, 2000)).toEqual({ w: 2000, h: 1500 });
    expect(scaledDimensions(3000, 4000, 2000)).toEqual({ w: 1500, h: 2000 });
  });
  it('clamps to at least 1px', () => {
    expect(scaledDimensions(10000, 1, 5).h).toBe(1);
  });
});

describe('resolveFormat', () => {
  it('keeps the source family for "keep", else falls back to jpeg', () => {
    expect(resolveFormat('keep', 'image/png')).toBe('png');
    expect(resolveFormat('keep', 'image/webp')).toBe('webp');
    expect(resolveFormat('keep', 'image/avif')).toBe('avif');
    expect(resolveFormat('keep', 'image/gif')).toBe('jpeg');
    expect(resolveFormat('keep', 'image/bmp')).toBe('jpeg');
  });
  it('honours an explicit format', () => {
    expect(resolveFormat('webp', 'image/png')).toBe('webp');
    expect(resolveFormat('avif', 'image/jpeg')).toBe('avif');
  });
});

describe('isCompressibleImage', () => {
  it('accepts raster images by mime or extension', () => {
    expect(isCompressibleImage('image/png', 'a.png')).toBe(true);
    expect(isCompressibleImage('', 'photo.JPG')).toBe(true);
    expect(isCompressibleImage('image/avif', 'x')).toBe(true);
  });
  it('rejects non-images and vectors/heic', () => {
    expect(isCompressibleImage('application/pdf', 'a.pdf')).toBe(false);
    expect(isCompressibleImage('image/svg+xml', 'a.svg')).toBe(false);
    expect(isCompressibleImage('image/heic', 'a.heic')).toBe(false);
  });
});

describe('searchQualityForTarget', () => {
  // A monotonic encoder: size grows with quality (10KB at q=1).
  const enc = (q: number) => Promise.resolve(Math.round(q * 10000));
  it('returns hi when even max quality fits the target', async () => {
    const r = await searchQualityForTarget(enc, 99999);
    expect(r.quality).toBe(0.95);
    expect(r.size).toBeLessThanOrEqual(99999);
  });
  it('finds the largest quality under the target', async () => {
    const r = await searchQualityForTarget(enc, 5000); // q≈0.5 → 5000 bytes
    expect(r.size).toBeLessThanOrEqual(5000);
    expect(r.quality).toBeGreaterThan(0.3);
    expect(r.quality).toBeLessThanOrEqual(0.52);
  });
  it('returns the lowest quality when the target is unreachable by quality alone', async () => {
    const r = await searchQualityForTarget(enc, 100); // even lo (0.3→3000) exceeds
    expect(r.quality).toBe(0.3);
  });
});
