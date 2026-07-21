import { describe, it, expect } from 'vitest';
import { scanFilter, rotatedSize, moveItem, normalizeRotation, otsuThreshold, documentBounds } from './scan.js';

// Build an RGBA buffer: dark background with a bright rectangle inside it.
function frameWithDoc(w: number, h: number, rx: number, ry: number, rw: number, rh: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const inside = x >= rx && x < rx + rw && y >= ry && y < ry + rh;
    const v = inside ? 240 : 25;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  return d;
}

describe('scanner helpers', () => {
  it('produces distinct enhance filters per mode', () => {
    expect(scanFilter('color')).toContain('contrast');
    expect(scanFilter('grayscale')).toContain('grayscale(1)');
    expect(scanFilter('bw')).toContain('contrast(1.9)');
    expect(scanFilter('grayscale')).not.toBe(scanFilter('bw'));
  });
  it('swaps dimensions only for 90/270', () => {
    expect(rotatedSize(800, 600, 0)).toEqual({ w: 800, h: 600 });
    expect(rotatedSize(800, 600, 90)).toEqual({ w: 600, h: 800 });
    expect(rotatedSize(800, 600, 180)).toEqual({ w: 800, h: 600 });
    expect(rotatedSize(800, 600, 270)).toEqual({ w: 600, h: 800 });
  });
  it('reorders pages immutably', () => {
    const a = [1, 2, 3, 4];
    expect(moveItem(a, 0, 2)).toEqual([2, 3, 1, 4]);
    expect(moveItem(a, 3, 0)).toEqual([4, 1, 2, 3]);
    expect(moveItem(a, 1, 1)).toBe(a); // no-op returns same ref
    expect(a).toEqual([1, 2, 3, 4]);   // original untouched
  });
  it('normalizes rotation into 0..359', () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(0)).toBe(0);
  });

  it('otsu splits a clear bimodal histogram between the two peaks', () => {
    const hist = new Array(256).fill(0);
    hist[25] = 1000; hist[240] = 1000; // dark bg + bright doc
    const t = otsuThreshold(hist, 2000);
    // A valid split: the bright peak (240) is above it, the dark peak (25) is not.
    expect(240 > t).toBe(true);
    expect(25 > t).toBe(false);
  });

  it('finds the document rectangle on a darker background (with padding)', () => {
    const b = documentBounds(frameWithDoc(200, 200, 50, 40, 100, 120), 200, 200, 0.02);
    expect(b.x).toBeGreaterThanOrEqual(45); expect(b.x).toBeLessThanOrEqual(50);
    expect(b.y).toBeGreaterThanOrEqual(35); expect(b.y).toBeLessThanOrEqual(40);
    expect(b.w).toBeGreaterThanOrEqual(100); expect(b.w).toBeLessThanOrEqual(112);
    expect(b.h).toBeGreaterThanOrEqual(120); expect(b.h).toBeLessThanOrEqual(132);
  });

  it('keeps the full frame when there is no clear document', () => {
    const flat = new Uint8ClampedArray(100 * 100 * 4).fill(200); // uniform → unreliable
    expect(documentBounds(flat, 100, 100)).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });
});
