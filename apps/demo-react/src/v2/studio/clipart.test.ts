import { describe, it, expect } from 'vitest';
import { CLIPART, CLIPART_CATEGORIES, clipartByCategory, svgToDataUrl } from './clipart.js';

describe('clipart library', () => {
  it('offers a decent library with unique ids across all categories', () => {
    expect(CLIPART.length).toBeGreaterThanOrEqual(24);
    const ids = CLIPART.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const cat of CLIPART_CATEGORIES) expect(clipartByCategory(cat).length).toBeGreaterThan(0);
  });

  it('every item is a well-formed, self-contained SVG', () => {
    for (const c of CLIPART) {
      expect(c.svg.startsWith('<svg')).toBe(true);
      expect(c.svg.trimEnd().endsWith('</svg>')).toBe(true);
      expect(c.svg).toContain('viewBox="0 0 100 100"');
      // balanced-ish tags — no stray unclosed svg
      expect(c.svg.match(/<svg/g)!.length).toBe(1);
      expect(c.svg.match(/<\/svg>/g)!.length).toBe(1);
    }
  });

  it('svgToDataUrl produces a decodable svg+xml data url', () => {
    const url = svgToDataUrl(CLIPART[0].svg);
    expect(url.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    expect(decodeURIComponent(url.slice('data:image/svg+xml;utf8,'.length))).toBe(CLIPART[0].svg);
  });
});
