import { describe, it, expect } from 'vitest';
import { isHeic, isConvertibleImage, targetExt } from './convertFiles.js';

describe('converter detection', () => {
  it('detects HEIC/HEIF by mime or extension', () => {
    expect(isHeic('image/heic', 'x')).toBe(true);
    expect(isHeic('image/heif', 'x')).toBe(true);
    expect(isHeic('', 'IMG_2034.HEIC')).toBe(true);
    expect(isHeic('image/jpeg', 'a.jpg')).toBe(false);
  });
  it('treats HEIC and common raster types as convertible, vectors not', () => {
    expect(isConvertibleImage('image/heic', 'a.heic')).toBe(true);
    expect(isConvertibleImage('image/png', 'a.png')).toBe(true);
    expect(isConvertibleImage('', 'a.WEBP')).toBe(true);
    expect(isConvertibleImage('image/svg+xml', 'a.svg')).toBe(false);
    expect(isConvertibleImage('application/pdf', 'a.pdf')).toBe(false);
  });
  it('maps targets to extensions', () => {
    expect(targetExt('jpeg')).toBe('jpg');
    expect(targetExt('png')).toBe('png');
    expect(targetExt('webp')).toBe('webp');
    expect(targetExt('avif')).toBe('avif');
  });
});
