import { describe, it, expect } from 'vitest';
import { parseCsv, fillTemplate, templateFields, mergeDesign, mergeDesigns, designFields } from './mailMerge.js';
import type { Design } from './model.js';

describe('parseCsv', () => {
  it('parses headers and rows', () => {
    const d = parseCsv('name,email\nAda,ada@x.io\nGrace,grace@y.io');
    expect(d.headers).toEqual(['name', 'email']);
    expect(d.rows).toEqual([
      { name: 'Ada', email: 'ada@x.io' },
      { name: 'Grace', email: 'grace@y.io' },
    ]);
  });

  it('handles quoted fields with commas, newlines and escaped quotes', () => {
    const d = parseCsv('name,note\n"Smith, Ada","line1\nline2"\n"She said ""hi""",ok');
    expect(d.rows[0]).toEqual({ name: 'Smith, Ada', note: 'line1\nline2' });
    expect(d.rows[1]!.name).toBe('She said "hi"');
  });

  it('skips blank lines and trims a missing trailing newline', () => {
    const d = parseCsv('a,b\n1,2\n\n3,4');
    expect(d.rows).toHaveLength(2);
  });

  it('returns empty for empty input', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] });
  });
});

describe('fillTemplate', () => {
  it('replaces tokens and tolerates spaces; unknown → empty', () => {
    expect(fillTemplate('Hi {{name}} <{{ email }}>{{missing}}', { name: 'Ada', email: 'a@x.io' }))
      .toBe('Hi Ada <a@x.io>');
  });

  it('lists unique field names', () => {
    expect(templateFields('{{a}} {{b}} {{a}}').sort()).toEqual(['a', 'b']);
  });
});

const design: Design = {
  w: 100, h: 100, background: '#fff',
  elements: [
    { id: 't1', type: 'text', x: 0, y: 0, w: 80, h: 20, text: 'Dear {{name}},', size: 12, color: '#000', font: 'Inter', weight: 400, align: 'left' },
    { id: 'r1', type: 'rect', x: 0, y: 30, w: 80, h: 5, fill: '#eee' },
    { id: 't2', type: 'text', x: 0, y: 40, w: 80, h: 20, text: 'Code: {{code}}', size: 12, color: '#000', font: 'Inter', weight: 400, align: 'left' },
  ],
};

describe('mergeDesign', () => {
  it('fills text elements, leaves non-text untouched, and does not mutate the source', () => {
    const merged = mergeDesign(design, { name: 'Ada', code: 'X1' });
    expect((merged.elements[0] as { text: string }).text).toBe('Dear Ada,');
    expect((merged.elements[2] as { text: string }).text).toBe('Code: X1');
    expect(merged.elements[1]).toEqual(design.elements[1]); // rect unchanged
    expect((design.elements[0] as { text: string }).text).toBe('Dear {{name}},'); // source intact
  });

  it('designFields collects placeholders across text elements', () => {
    expect(designFields(design).sort()).toEqual(['code', 'name']);
  });

  it('mergeDesigns yields one design per CSV row', () => {
    const data = parseCsv('name,code\nAda,A1\nGrace,G2');
    const out = mergeDesigns(design, data);
    expect(out).toHaveLength(2);
    expect((out[1]!.elements[0] as { text: string }).text).toBe('Dear Grace,');
  });
});
