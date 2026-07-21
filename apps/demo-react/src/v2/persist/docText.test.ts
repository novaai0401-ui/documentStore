import { describe, it, expect } from 'vitest';
import { docToText, docToPlainText } from './docText.js';
import type { DocRecord } from './docStore.js';

const rec = (content: DocRecord['content'], kind: DocRecord['kind'] = 'text'): DocRecord =>
  ({ id: 'x', name: 'n', ext: 'txt', kind, updatedAt: 0, content });

describe('docToText', () => {
  it('reads plain text', () => {
    expect(docToText(rec({ text: 'hello world' }))).toEqual([{ page: 1, text: 'hello world' }]);
  });
  it('strips HTML to text', () => {
    expect(docToPlainText(rec({ html: '<h1>Hi</h1><p>a &amp; b</p>' }, 'word'))).toBe('Hi a & b');
  });
  it('joins spreadsheet rows', () => {
    expect(docToText(rec({ rows: [['a', 'b'], ['c', 'd']] }, 'sheet'))[0]!.text).toBe('a b\nc d');
  });
  it('makes one page per slide', () => {
    const out = docToText(rec({ slides: [{ title: 'T1', body: ['x'] }, { title: 'T2', body: ['y', 'z'] }] }, 'slides'));
    expect(out.map((p) => p.page)).toEqual([1, 2]);
    expect(out[1]!.text).toContain('T2');
  });
  it('reads design text elements', () => {
    const design = { w: 10, h: 10, background: '#fff', elements: [
      { id: 't', type: 'text' as const, x: 0, y: 0, w: 1, h: 1, text: 'Poster headline', size: 12, color: '#000', font: 'Inter', weight: 400, align: 'left' as const },
      { id: 'r', type: 'rect' as const, x: 0, y: 0, w: 1, h: 1, fill: '#eee' },
    ] };
    expect(docToText(rec({ design }, 'design'))[0]!.text).toBe('Poster headline');
  });
  it('returns nothing for a pdf (bytes only) or empty doc', () => {
    expect(docToText(rec({ bytes: new Uint8Array([1, 2]) }, 'pdf'))).toEqual([]);
    expect(docToText(rec({}))).toEqual([]);
  });
});
