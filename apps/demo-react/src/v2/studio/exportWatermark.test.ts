import { describe, it, expect } from 'vitest';
import { withWatermark } from './exportDesign.js';
import type { Design } from './model.js';

const base: Design = { w: 1080, h: 1350, background: '#fff', elements: [] };

describe('export watermark (free tier)', () => {
  it('adds a brand mark when on, without mutating the original', () => {
    const marked = withWatermark(base, true);
    expect(base.elements.length).toBe(0);           // original untouched
    expect(marked.elements.length).toBe(1);
    const m = marked.elements[0];
    expect(m.type).toBe('text');
    expect(m.type === 'text' && m.text).toContain('Pyntra');
    // sits inside the artboard, bottom area, semi-transparent
    expect(m.y).toBeLessThan(base.h);
    expect(m.opacity).toBeLessThan(1);
  });

  it('is a no-op (same reference) when off — Pro exports are clean', () => {
    expect(withWatermark(base, false)).toBe(base);
  });
});
