import { describe, it, expect } from 'vitest';
import { blankDesign, formatById, type Design } from './model.js';
import { buildVariants, defaultSelection, isCurrentFormat, slugify, variantStem } from './magicResize.js';

const igPost = (): Design => ({ ...blankDesign(formatById('ig-post')), elements: [
  { id: 'a', type: 'text', x: 100, y: 100, w: 400, h: 80, text: 'Hi', size: 48, color: '#000', font: 'Inter', weight: 700, align: 'left' },
] });

describe('magicResize', () => {
  it('isCurrentFormat matches the artboard size', () => {
    const d = igPost();
    expect(isCurrentFormat(d, formatById('ig-post'))).toBe(true);
    expect(isCurrentFormat(d, formatById('ig-story'))).toBe(false);
  });

  it('builds one resized variant per requested format', () => {
    const d = igPost();
    const v = buildVariants(d, ['ig-story', 'fb-link']);
    expect(v.map((x) => x.format.id)).toEqual(['ig-story', 'fb-link']);
    expect(v[0]!.design.w).toBe(1080);
    expect(v[0]!.design.h).toBe(1920);
    // Element composition is scaled, not dropped.
    expect(v[0]!.design.elements).toHaveLength(1);
    expect(v[0]!.design.elements[0]!.x).toBeCloseTo(100); // sx = 1080/1080 = 1
  });

  it('skips the current size, unknowns, and duplicates', () => {
    const d = igPost();
    const v = buildVariants(d, ['ig-post', 'ig-story', 'ig-story', 'not-real']);
    expect(v.map((x) => x.format.id)).toEqual(['ig-story']);
  });

  it('defaultSelection pre-ticks other social sizes, never the current one', () => {
    const sel = defaultSelection(igPost());
    expect(sel).not.toContain('ig-post');
    expect(sel).toContain('ig-story');
    expect(sel.every((id) => formatById(id).group === 'Social')).toBe(true);
  });

  it('makes safe, descriptive filenames', () => {
    expect(slugify('Summer Sale!! 2025')).toBe('summer-sale-2025');
    expect(slugify('')).toBe('design');
    expect(variantStem('My Post', formatById('ig-story'))).toBe('my-post-ig-story-1080x1920');
  });
});
