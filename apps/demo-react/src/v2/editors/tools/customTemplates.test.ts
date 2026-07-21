import { describe, it, expect, beforeEach } from 'vitest';
import { addCustomTemplate, loadCustomTemplates, deleteCustomTemplate, customDocTemplates, customTemplateIdOf, exportTemplatesJson, importTemplatesJson } from './customTemplates.js';
import type { TemplateDoc } from './templates.js';

class MemStore {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStore }).localStorage = new MemStore();
});

const wordSeed: TemplateDoc = { name: 'memo', ext: 'docx', kind: 'word', html: '<h1>Memo</h1>' };
const sheetSeed: TemplateDoc = { name: 'grid', ext: 'xlsx', kind: 'sheet', rows: [['a', 'b']] };

describe('custom templates store', () => {
  it('adds, lists, and exposes as DocTemplates that rebuild the seed', () => {
    expect(loadCustomTemplates()).toEqual([]);
    addCustomTemplate('My memo', wordSeed, 'a memo');
    const docs = customDocTemplates();
    expect(docs).toHaveLength(1);
    expect(docs[0]!.id).toMatch(/^custom:/);
    expect(docs[0]!.name).toBe('My memo');
    expect(docs[0]!.kind).toBe('word');
    const seed = docs[0]!.make();
    expect(seed.html).toBe('<h1>Memo</h1>');
    expect(seed.kind).toBe('word');
  });

  it('round-trips a sheet seed and deletes by id', () => {
    const t = addCustomTemplate('Grid', sheetSeed);
    expect(customDocTemplates()[0]!.make().rows).toEqual([['a', 'b']]);
    deleteCustomTemplate(t.id);
    expect(loadCustomTemplates()).toEqual([]);
  });

  it('customTemplateIdOf parses prefixed ids', () => {
    expect(customTemplateIdOf('custom:xyz')).toBe('xyz');
    expect(customTemplateIdOf('blank-md')).toBeNull();
  });

  it('survives a corrupt payload', () => {
    localStorage.setItem('pdfcraft.customTemplates.v1', 'nope{');
    expect(loadCustomTemplates()).toEqual([]);
  });

  it('captures and restores a theme preset', () => {
    addCustomTemplate('Themed', { ...wordSeed, theme: 'midnight' });
    expect(customDocTemplates()[0]!.make().theme).toBe('midnight');
  });
});

describe('template library import / export', () => {
  it('round-trips and merges with fresh ids', () => {
    addCustomTemplate('A', wordSeed);
    addCustomTemplate('B', sheetSeed);
    const json = exportTemplatesJson();
    expect(JSON.parse(json).format).toBe('pdfcraft-templates');
    const added = importTemplatesJson(json, 'merge');
    expect(added).toBe(2);
    const all = loadCustomTemplates();
    expect(all).toHaveLength(4);
    expect(new Set(all.map((t) => t.id)).size).toBe(4);
  });
  it('replace mode swaps the library; non-libraries throw', () => {
    addCustomTemplate('Old', wordSeed);
    importTemplatesJson(JSON.stringify([{ id: 'x', title: 'New', name: 'n', ext: 'md', kind: 'text', text: 'hi' }]), 'replace');
    expect(loadCustomTemplates()).toHaveLength(1);
    expect(loadCustomTemplates()[0]!.title).toBe('New');
    expect(() => importTemplatesJson('{"nope":1}')).toThrow();
  });
});
