import { describe, it, expect } from 'vitest';
import { sectPr } from './officeWrite.js';
import { isWellFormedXml } from '../smart/ooxml.js';

describe('docx page layout (sectPr)', () => {
  it('defaults to Letter portrait with 1-inch margins and one column', () => {
    const s = sectPr();
    expect(s).toContain('<w:pgSz w:w="12240" w:h="15840"/>');
    expect(s).toContain('w:top="1440"');
    expect(s).toContain('w:left="1440"');
    expect(s).toContain('<w:cols w:space="708"/>');
    expect(isWellFormedXml(s)).toBe(true);
  });
  it('A4 size', () => {
    expect(sectPr({ size: 'a4' })).toContain('<w:pgSz w:w="11906" w:h="16838"/>');
  });
  it('legal size', () => {
    expect(sectPr({ size: 'legal' })).toContain('<w:pgSz w:w="12240" w:h="20160"/>');
  });
  it('landscape swaps width/height and marks orientation', () => {
    const s = sectPr({ size: 'letter', orientation: 'landscape' });
    expect(s).toContain('<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>');
  });
  it('narrow and wide margins', () => {
    expect(sectPr({ margin: 'narrow' })).toContain('w:top="720"');
    expect(sectPr({ margin: 'wide' })).toContain('w:top="1800"');
  });
  it('multi-column layout (clamped to 1-3)', () => {
    expect(sectPr({ columns: 2 })).toContain('<w:cols w:num="2" w:space="708" w:equalWidth="1"/>');
    expect(sectPr({ columns: 9 })).toContain('w:num="3"'); // clamped
    expect(sectPr({ columns: 1 })).toContain('<w:cols w:space="708"/>');
  });
});
