import { describe, it, expect } from 'vitest';
import { unzipSync } from 'fflate';
import { validatePackage, resolvePart, isWellFormedXml } from './ooxml.js';
import { pagesToPptx } from './pptxExport.js';
import { buildXlsxBytes } from './officeBuild.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const pkg = (bytes: Uint8Array) => unzipSync(bytes) as unknown as Record<string, Uint8Array>;

describe('OOXML primitives', () => {
  it('resolves relationship targets', () => {
    expect(resolvePart('ppt/slides', '../media/image1.png')).toBe('ppt/media/image1.png');
    expect(resolvePart('', 'ppt/presentation.xml')).toBe('ppt/presentation.xml');
  });
  it('detects unbalanced XML', () => {
    expect(isWellFormedXml('<a><b/></a>')).toBe(true);
    expect(isWellFormedXml('<a><b></a>')).toBe(false);
  });
});

describe('generated .pptx is a valid OOXML package', () => {
  it('validates a plain deck', () => {
    const r = validatePackage(pkg(pagesToPptx([{ title: 'A', body: ['one', '\ttwo'] }, { title: 'B', body: ['x'] }])));
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
  });
  it('validates a deck with an embedded image (media part + rel + content type)', () => {
    const r = validatePackage(pkg(pagesToPptx([{ title: 'Img', body: ['b'], image: PNG }])));
    expect(r.issues).toEqual([]);
  });
  it('every layout produces a structurally valid, well-formed package', () => {
    for (const layout of ['titleContent', 'title', 'section', 'imageRight', 'blank'] as const) {
      const r = validatePackage(pkg(pagesToPptx([{ title: 'T', body: ['a', '\tb'], layout }])));
      expect(r.issues, layout).toEqual([]);
    }
  });
  it('catches a dangling relationship', () => {
    const files = pkg(pagesToPptx([{ title: 'A', body: ['x'] }]));
    delete files['ppt/slideLayouts/slideLayout1.xml'];
    const r = validatePackage(files);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => /dangling/.test(i.message))).toBe(true);
  });
});

describe('generated .xlsx is a valid OOXML package', () => {
  it('validates a workbook', async () => {
    const bytes = await buildXlsxBytes([{ name: 'Sheet1', rows: [['A', 'B'], ['1', '2']] }]);
    const r = validatePackage(pkg(bytes));
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
  });
});
