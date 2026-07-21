/**
 * Encoder correctness — our from-scratch QR generator validated against the
 * jsQR reference DECODER: matrix → pixels → decode must round-trip the text.
 * A QR that draws prettily but doesn't scan is worse than none.
 */
import { describe, it, expect } from 'vitest';
import jsQR from 'jsqr';
import { qrMatrix } from './qr.js';

/** Rasterize a QR matrix to RGBA pixels (scale px/module + quiet zone). */
function pixels(m: boolean[][] | number[][], scale = 8, margin = 4) {
  const n = m.length;
  const dim = (n + margin * 2) * scale;
  const data = new Uint8ClampedArray(dim * dim * 4).fill(255);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!m[r]![c]) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const px = ((r + margin) * scale + dy) * dim + (c + margin) * scale + dx;
      data[px * 4] = data[px * 4 + 1] = data[px * 4 + 2] = 0;
    }
  }
  return { data, dim };
}

const roundTrip = (text: string, ec: 'L' | 'M' | 'Q' | 'H') => {
  const { data, dim } = pixels(qrMatrix(text, ec) as never);
  const hit = jsQR(data, dim, dim);
  return hit?.data ?? null;
};

describe('QR encoder scans with a reference decoder', () => {
  it.each([
    ['https://pyntra.app', 'M'],
    ['https://pyntra.app', 'L'],
    ['https://pyntra.app', 'Q'],
    ['https://pyntra.app', 'H'],
    ['Hello Pyntra 123', 'M'],
    ['https://pyntra.tekivex.com/welcome?utm_source=qr&utm_campaign=wedding2026', 'M'],
    ['tel:+919876543210', 'M'],
    ['UPPER lower 0123456789 !@#$%', 'M'],
  ] as const)('decodes %s at EC %s', (text, ec) => {
    expect(roundTrip(text, ec)).toBe(text);
  });
});
