import { describe, it, expect } from 'vitest';
import { designToSvg, elementToSvg, resizeDesign, blankDesign, formatById, imageShadowParams, photoSlot, FORMATS, type Design, type TextEl, type ImageEl } from './model.js';
import { STUDIO_TEMPLATES } from './templates.js';

const sample = (): Design => ({
  w: 1000, h: 1000, background: '#ffffff',
  elements: [
    { id: 'a', type: 'rect', x: 100, y: 100, w: 200, h: 50, fill: '#2e5bff', radius: 8, stroke: '#000', strokeWidth: 4 },
    { id: 'b', type: 'text', x: 100, y: 300, w: 800, h: 80, text: 'Hello\nWorld', size: 40, color: '#111', font: 'Inter', weight: 700, align: 'center' },
  ],
});

describe('designToSvg', () => {
  it('renders a well-formed SVG with background and every element', () => {
    const svg = designToSvg(sample());
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('width="1000"');
    expect(svg).toContain('fill="#ffffff"'); // background
    expect(svg).toContain('<rect');
    expect(svg).toContain('<text');
  });
  it('escapes user text so it cannot inject markup', () => {
    const d: Design = { w: 100, h: 100, background: '#fff', elements: [
      { id: 't', type: 'text', x: 0, y: 0, w: 100, h: 20, text: '<script>&"x"', size: 12, color: '#000', font: 'Inter', weight: 400, align: 'left' },
    ] };
    const svg = designToSvg(d);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });
  it('renders multi-line text as one tspan per line', () => {
    const el: TextEl = { id: 't', type: 'text', x: 0, y: 0, w: 100, h: 40, text: 'one\ntwo\nthree', size: 10, color: '#000', font: 'Inter', weight: 400, align: 'left' };
    const svg = elementToSvg(el);
    expect((svg.match(/<tspan/g) || []).length).toBe(3);
  });
});

describe('resizeDesign', () => {
  it('scales positions and sizes into the new artboard without mutating the input', () => {
    const d = sample();
    const out = resizeDesign(d, 2000, 500); // sx=2, sy=0.5
    expect(out.w).toBe(2000);
    expect(out.h).toBe(500);
    const rect = out.elements[0]!;
    expect(rect.x).toBe(200); // 100 * 2
    expect(rect.y).toBe(50); //  100 * 0.5
    expect(rect.w).toBe(400);
    expect(rect.h).toBe(25);
    // font scales by the smaller factor (0.5) so it stays legible
    expect((out.elements[1] as TextEl).size).toBe(20);
    // input untouched
    expect(d.w).toBe(1000);
    expect(d.elements[0]!.x).toBe(100);
  });
});

describe('formats & templates', () => {
  it('blankDesign matches the chosen format', () => {
    const d = blankDesign(formatById('ig-post'));
    expect(d.w).toBe(1080);
    expect(d.h).toBe(1080);
    expect(d.elements).toHaveLength(0);
  });
  it('every format has positive dimensions', () => {
    for (const f of FORMATS) { expect(f.w).toBeGreaterThan(0); expect(f.h).toBeGreaterThan(0); }
  });
  it('every starter template renders to a valid SVG', () => {
    for (const t of STUDIO_TEMPLATES) {
      const svg = designToSvg(t.make());
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg.length).toBeGreaterThan(100);
    }
  });
});

describe('image shadow', () => {
  const img = (p: Partial<ImageEl>): ImageEl => ({ id: 'i', type: 'image', href: 'data:,x', x: 0, y: 0, w: 100, h: 200, ...p });

  it('imageShadowParams scales with the element and is off by default', () => {
    expect(imageShadowParams(img({}))).toBeUndefined();
    expect(imageShadowParams(img({ shadow: 'soft' }))).toEqual({ dy: 4, blur: 7, opacity: 0.35 });   // h=200
    expect(imageShadowParams(img({ shadow: 'strong' }))).toEqual({ dy: 6, blur: 10, opacity: 0.55 });
  });

  it('elementToSvg wraps a shadowed image in an feDropShadow group AFTER clipping', () => {
    const svg = elementToSvg(img({ shadow: 'soft', shape: 'circle' }));
    expect(svg).toMatch(/^<g filter="url\(#sh-/);
    expect(svg).toContain('feDropShadow');
    // clip stays on the inner image so the shadow follows the clipped shape
    expect(svg).toContain('clip-path: ellipse');
    expect(svg.indexOf('<g')).toBeLessThan(svg.indexOf('<image'));
  });

  it('no shadow → no group wrapper', () => {
    expect(elementToSvg(img({}))).toMatch(/^<image/);
  });
});

describe('photo slots', () => {
  it('photoSlot builds an empty tap-to-fill image element', () => {
    const p = photoSlot(10, 20, 300, 400);
    expect(p.type).toBe('image');
    expect(p.placeholder).toBe(true);
    expect(p.href).toBe('');
    expect(p.w).toBe(300);
  });

  it('an unfilled slot renders a dashed frame, not an <image>', () => {
    const svg = elementToSvg(photoSlot(0, 0, 200, 200));
    expect(svg).toContain('stroke-dasharray');
    expect(svg).toContain('Tap to add photo');
    expect(svg).not.toContain('<image');
  });

  it('a filled slot renders as a normal image again', () => {
    const svg = elementToSvg({ ...photoSlot(0, 0, 200, 200), href: 'data:,x' });
    expect(svg).toContain('<image');
    expect(svg).not.toContain('Tap to add photo');
  });
});
