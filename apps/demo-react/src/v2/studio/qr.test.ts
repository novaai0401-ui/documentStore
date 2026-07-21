import { describe, it, expect } from 'vitest';
import { qrMatrix, qrToSvg, qrToDataUrl } from './qr.js';

describe('qr', () => {
  it('produces a square module matrix that grows with payload size', () => {
    const small = qrMatrix('hi');
    expect(small.length).toBeGreaterThanOrEqual(21); // version 1 = 21×21
    expect(small.every((row) => row.length === small.length)).toBe(true);
    const big = qrMatrix('https://pdfcraft.app/this/is/a/longer/url/that/needs/a/bigger/code');
    expect(big.length).toBeGreaterThan(small.length);
  });

  it('places the three finder patterns (dark corners)', () => {
    const m = qrMatrix('test');
    const n = m.length;
    expect(m[0]![0]).toBe(true);          // top-left finder
    expect(m[0]![n - 1]).toBe(true);      // top-right finder
    expect(m[n - 1]![0]).toBe(true);      // bottom-left finder
    // The quiet inner ring of a finder pattern is light at (1,1).
    expect(m[1]![1]).toBe(false);
  });

  it('renders a valid SVG with the chosen colours', () => {
    const svg = qrToSvg('hello', { fg: '#123456', bg: '#fafafa', size: 256 });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('fill="#123456"');
    expect(svg).toContain('fill="#fafafa"');
    expect(svg).toContain('width="256"');
    expect(svg).toContain('<rect'); // at least one module drawn
  });

  it('exposes an svg data URL', () => {
    expect(qrToDataUrl('x')).toMatch(/^data:image\/svg\+xml/);
  });
});
