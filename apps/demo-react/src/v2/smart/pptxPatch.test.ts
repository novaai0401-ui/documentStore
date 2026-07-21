import { describe, it, expect } from 'vitest';
import { patchSlideXml, patchPptxText, pptxCountsMatch } from './pptxPatch.js';
import { pagesToPptx } from './pptxExport.js';
import { pptxToSlides } from './convert.js';

describe('pptxPatch — slide XML', () => {
  it('replaces non-empty paragraph text in order, preserving structure', () => {
    const xml = '<p:sp><a:p><a:r><a:rPr b="1"/><a:t>Old Title</a:t></a:r></a:p>'
      + '<a:p><a:r><a:t>Line </a:t></a:r><a:r><a:t>one</a:t></a:r></a:p>'
      + '<a:p></a:p></p:sp>';
    const out = patchSlideXml(xml, ['New Title', 'Line two']);
    expect(out).toContain('<a:t>New Title</a:t>');
    expect(out).toContain('<a:rPr b="1"/>');         // run formatting preserved
    expect(out).toContain('<a:t>Line two</a:t>');
    expect(out).toContain('<a:t></a:t>');             // 2nd run of para 2 emptied
    expect(out).not.toContain('Old Title');
    expect(out).not.toContain('>one<');
  });

  it('leaves paragraphs without a replacement untouched, and escapes XML', () => {
    const xml = '<a:p><a:r><a:t>Keep</a:t></a:r></a:p>';
    expect(patchSlideXml(xml, [])).toBe(xml);
    expect(patchSlideXml('<a:p><a:r><a:t>x</a:t></a:r></a:p>', ['A & B <c>'])).toContain('<a:t>A &amp; B &lt;c&gt;</a:t>');
  });
});

describe('pptxPatch — whole file round-trip', () => {
  it('changes only the text, and the reader reads back the new text', async () => {
    const original = pagesToPptx([{ title: 'Hello', body: ['alpha', 'beta'] }, { title: 'Two', body: ['gamma'] }]);
    const patched = await patchPptxText(original, [{ title: 'Bonjour', body: ['un', 'deux'] }, { title: 'Deux', body: ['trois'] }]);
    const slides = await pptxToSlides(patched);
    expect(slides[0]).toEqual({ title: 'Bonjour', body: ['un', 'deux'] });
    expect(slides[1]).toEqual({ title: 'Deux', body: ['trois'] });
  });

  it('re-saving with identical text yields the same text back (open & re-save is safe)', async () => {
    const original = pagesToPptx([{ title: 'Same', body: ['x'] }]);
    const patched = await patchPptxText(original, [{ title: 'Same', body: ['x'] }]);
    expect(await pptxToSlides(patched)).toEqual([{ title: 'Same', body: ['x'] }]);
  });

  it('preserves the non-slide parts (theme, presentation, rels) of the package', async () => {
    const { unzipSync } = await import('fflate');
    const original = pagesToPptx([{ title: 'A', body: [] }]);
    const before = Object.keys(unzipSync(original)).filter((f) => !/slide\d+\.xml$/.test(f)).sort();
    const patched = await patchPptxText(original, [{ title: 'B', body: [] }]);
    const after = Object.keys(unzipSync(patched)).filter((f) => !/slide\d+\.xml$/.test(f)).sort();
    expect(after).toEqual(before);
  });

  it('detects whether slide counts still line up', async () => {
    const original = pagesToPptx([{ title: 'A', body: [] }, { title: 'B', body: [] }]);
    expect(await pptxCountsMatch(original, 2)).toBe(true);
    expect(await pptxCountsMatch(original, 3)).toBe(false);
  });
});
