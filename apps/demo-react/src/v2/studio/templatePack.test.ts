import { describe, it, expect } from 'vitest';
import { exportTemplatePack, parseTemplatePack, isValidDesign, makeTemplatePack, reidPages, TEMPLATE_FORMAT } from './templatePack.js';
import { blankDesign, formatById, type Design } from './model.js';

const sample = (): Design => ({ ...blankDesign(formatById('ig-post')), elements: [
  { id: 'a', type: 'text', x: 10, y: 10, w: 100, h: 40, text: 'Hi', size: 40, color: '#000', font: 'Inter', weight: 700, align: 'left' },
  { id: 'b', type: 'rect', x: 0, y: 0, w: 50, h: 50, fill: '#f00' },
] });

describe('templatePack', () => {
  it('round-trips a design through export → parse', () => {
    const json = exportTemplatePack('My Template', [sample()]);
    const pack = parseTemplatePack(json);
    expect(pack.format).toBe(TEMPLATE_FORMAT);
    expect(pack.name).toBe('My Template');
    expect(pack.pages).toHaveLength(1);
    expect(pack.pages[0]!.elements).toHaveLength(2);
    expect(pack.pages[0]!.w).toBe(1080);
  });

  it('supports multi-page packs', () => {
    const pack = parseTemplatePack(exportTemplatePack('Campaign', [sample(), sample()]));
    expect(pack.pages).toHaveLength(2);
  });

  it('validates Design structure', () => {
    expect(isValidDesign(sample())).toBe(true);
    expect(isValidDesign({ w: 0, h: 1, background: '#fff', elements: [] })).toBe(false);
    expect(isValidDesign({ w: 1, h: 1, background: '#fff', elements: [{ id: 'x', type: 'blob', x: 0, y: 0, w: 1, h: 1 }] })).toBe(false);
    expect(isValidDesign(null)).toBe(false);
  });

  it('rejects malformed or foreign files with clear errors', () => {
    expect(() => parseTemplatePack('not json')).toThrow(/valid JSON/);
    expect(() => parseTemplatePack('{"format":"something-else"}')).toThrow(/Pyntra template/);
    expect(() => parseTemplatePack(JSON.stringify({ format: TEMPLATE_FORMAT, version: 1, pages: [] }))).toThrow(/no valid pages/);
    expect(() => parseTemplatePack(JSON.stringify({ format: TEMPLATE_FORMAT, version: 99, pages: [sample()] }))).toThrow(/newer than/);
  });

  it('re-ids pages so imports do not collide', () => {
    const out = reidPages([sample()], (() => { let n = 0; return () => `n${n++}`; })());
    expect(out[0]!.elements.map((e) => e.id)).toEqual(['n0', 'n1']);
    expect(out[0]!.elements[0]!.x).toBe(10); // everything else preserved
  });

  it('stamps a createdAt in meta', () => {
    expect(makeTemplatePack('x', [sample()]).meta?.createdAt).toBeGreaterThan(0);
  });
});
