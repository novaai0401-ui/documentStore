import { describe, it, expect } from 'vitest';
import { hexToRgb, colorDistance, nearestBrandColor, brandAudit, applyBrand } from './brandEnforce.js';
import { blankDesign, formatById, type Design } from './model.js';
import type { BrandKit } from './brandStore.js';

const brand: BrandKit = { id: 'b', name: 'Acme', colors: ['#2e5bff', '#0f172a', '#ffffff'], fonts: { heading: 'Poppins', body: 'Inter' } };

const design = (): Design => ({ ...blankDesign(formatById('ig-post')), elements: [
  { id: 't', type: 'text', x: 0, y: 0, w: 10, h: 10, text: 'Hi', size: 40, color: '#0f1730', font: 'Comic Sans', weight: 700, align: 'left' },
  { id: 'r', type: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#2f5cff' },
] });

describe('brandEnforce', () => {
  it('parses hex (6- and 3-digit)', () => {
    expect(hexToRgb('#ffffff')).toEqual([255, 255, 255]);
    expect(hexToRgb('#000')).toEqual([0, 0, 0]);
    expect(hexToRgb('nope')).toBeNull();
  });

  it('measures colour distance and finds the nearest brand colour', () => {
    expect(colorDistance('#000000', '#000000')).toBe(0);
    expect(colorDistance('#000000', 'zzz')).toBe(Infinity); // not hex
    expect(nearestBrandColor('#2f5cff', brand.colors)).toBe('#2e5bff'); // close to brand blue
    expect(nearestBrandColor('#f8f8f8', brand.colors)).toBe('#ffffff');
  });

  it('audits off-brand colours and fonts', () => {
    const a = brandAudit(design(), brand);
    expect(a.offColors).toContain('#0f1730'); // not exactly a brand colour
    expect(a.offColors).toContain('#2f5cff');
    expect(a.offFonts).toContain('Comic Sans');
    expect(a.total).toBe(3);
  });

  it('reports zero when everything is already on-brand', () => {
    const d: Design = { ...blankDesign(formatById('ig-post')), elements: [
      { id: 't', type: 'text', x: 0, y: 0, w: 10, h: 10, text: 'Hi', size: 40, color: '#0f172a', font: 'Poppins', weight: 700, align: 'left' },
    ] };
    expect(brandAudit(d, brand).total).toBe(0);
  });

  it('applyBrand snaps colours to nearest and fonts to brand (by weight)', () => {
    const out = applyBrand(design(), brand);
    const t = out.elements[0] as { color: string; font: string };
    const r = out.elements[1] as { fill: string };
    expect(t.color).toBe('#0f172a');  // snapped to nearest brand dark
    expect(t.font).toBe('Poppins');   // weight 700 → heading font
    expect(r.fill).toBe('#2e5bff');   // snapped to brand blue
    expect(brandAudit(out, brand).total).toBe(0); // fully on-brand afterwards
  });
});
