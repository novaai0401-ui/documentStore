import { describe, it, expect } from 'vitest';
import { fontFormat, familyFromFilename, usedFontFamilies, fontFaceCss, type CustomFont } from './fontStore.js';
import { blankDesign, formatById, designToSvg, type Design } from './model.js';

describe('fontStore helpers', () => {
  it('maps extensions to CSS format tokens', () => {
    expect(fontFormat('A.woff2')).toBe('woff2');
    expect(fontFormat('A.WOFF')).toBe('woff');
    expect(fontFormat('A.otf')).toBe('opentype');
    expect(fontFormat('A.ttf')).toBe('truetype');
    expect(fontFormat('noext')).toBe('truetype');
  });

  it('derives readable family names from file names', () => {
    expect(familyFromFilename('Roboto-BoldItalic.ttf')).toBe('Roboto Bold Italic');
    expect(familyFromFilename('my_cool_font.woff2')).toBe('my cool font');
    expect(familyFromFilename('.woff2')).toBe('Custom font');
  });

  it('lists the distinct families used by a design', () => {
    const d: Design = { ...blankDesign(formatById('ig-post')), elements: [
      { id: '1', type: 'text', x: 0, y: 0, w: 1, h: 1, text: 'a', size: 10, color: '#000', font: "'Acme'", weight: 400, align: 'left' },
      { id: '2', type: 'text', x: 0, y: 0, w: 1, h: 1, text: 'b', size: 10, color: '#000', font: "'Acme'", weight: 400, align: 'left' },
      { id: '3', type: 'rect', x: 0, y: 0, w: 1, h: 1, fill: '#000' },
    ] };
    expect(usedFontFamilies(d)).toEqual(["'Acme'"]);
  });

  const fonts: CustomFont[] = [
    { id: 'a', family: 'Acme', format: 'woff2', dataUri: 'data:font/woff2;base64,AAA' },
    { id: 'b', family: 'Other', format: 'truetype', dataUri: 'data:font/ttf;base64,BBB' },
  ];

  it('builds @font-face CSS, optionally filtered to used families', () => {
    const all = fontFaceCss(fonts);
    expect(all).toContain("font-family:'Acme'");
    expect(all).toContain("format('woff2')");
    expect(all).toContain("font-family:'Other'");
    const only = fontFaceCss(fonts, ["'Acme'"]);
    expect(only).toContain('Acme');
    expect(only).not.toContain('Other');
  });

  it('embeds the style block into exported SVG', () => {
    const d = blankDesign(formatById('ig-post'));
    const css = "@font-face{font-family:'Acme';src:url(data:x) format('woff2');}";
    const svg = designToSvg(d, css);
    expect(svg).toContain('<style>');
    expect(svg).toContain("font-family:'Acme'");
    // No style block when none is supplied.
    expect(designToSvg(d)).not.toContain('<style>');
  });
});
