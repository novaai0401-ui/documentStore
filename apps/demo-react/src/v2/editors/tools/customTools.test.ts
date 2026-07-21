import { describe, it, expect, beforeEach } from 'vitest';
import { contentFromBody, customIdOf, addCustomSnippet, loadCustomSnippets, deleteCustomSnippet, customToolsForKind, exportSnippetsJson, importSnippetsJson } from './customTools.js';

// Minimal in-memory localStorage shim so the store is testable under Node.
class MemStore {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStore }).localStorage = new MemStore();
});

describe('contentFromBody', () => {
  it('derives every surface form from one body', () => {
    const c = contentFromBody('Greeting', 'Hello\nWorld\n\nSecond para');
    expect(c.text).toBe('Hello\nWorld\n\nSecond para');
    expect(c.markdown).toBe('Hello\nWorld\n\nSecond para');
    expect(c.html).toContain('<p>Hello<br>World</p>');
    expect(c.html).toContain('<p>Second para</p>');
    expect(c.slide).toEqual({ title: 'Greeting', body: ['Hello', 'World', 'Second para'] });
    expect(c.rows).toEqual([['Hello'], ['World'], [''], ['Second para']]);
  });
  it('escapes HTML-special characters in the html form', () => {
    expect(contentFromBody('x', 'a < b & c').html).toContain('a &lt; b &amp; c');
  });
  it('splits tab-separated lines into sheet rows', () => {
    expect(contentFromBody('t', 'a\tb\nc\td').rows).toEqual([['a', 'b'], ['c', 'd']]);
  });
});

describe('customIdOf', () => {
  it('extracts the id from a custom tool id, else null', () => {
    expect(customIdOf('custom:abc123')).toBe('abc123');
    expect(customIdOf('heading')).toBeNull();
  });
});

describe('custom snippet persistence', () => {
  it('adds, lists, filters by kind, and deletes', () => {
    expect(loadCustomSnippets()).toEqual([]);
    const a = addCustomSnippet('Sig', 'Signed,\nName', ['markdown', 'pdf']);
    addCustomSnippet('Footer', 'Confidential', ['word']);
    expect(loadCustomSnippets()).toHaveLength(2);

    const mdTools = customToolsForKind('markdown');
    expect(mdTools).toHaveLength(1);
    expect(mdTools[0]!.id).toBe(`custom:${a.id}`);
    expect(mdTools[0]!.label).toBe('Sig');
    expect(mdTools[0]!.content.text).toBe('Signed,\nName');

    expect(customToolsForKind('word')).toHaveLength(1);
    expect(customToolsForKind('slide')).toHaveLength(0); // neither snippet targets slides

    deleteCustomSnippet(a.id);
    expect(loadCustomSnippets()).toHaveLength(1);
    expect(customToolsForKind('markdown')).toHaveLength(0);
  });
  it('survives a corrupt localStorage payload', () => {
    localStorage.setItem('pdfcraft.customTools.v1', '{ not json');
    expect(loadCustomSnippets()).toEqual([]);
  });
});

describe('snippet library import / export', () => {
  it('round-trips through the export envelope (merge adds with fresh ids)', () => {
    addCustomSnippet('A', 'body a', ['markdown']);
    addCustomSnippet('B', 'body b', ['word']);
    const json = exportSnippetsJson();
    expect(JSON.parse(json).format).toBe('pdfcraft-snippets');

    const added = importSnippetsJson(json, 'merge');
    expect(added).toBe(2);
    const all = loadCustomSnippets();
    expect(all).toHaveLength(4); // originals + 2 imported
    expect(new Set(all.map((s) => s.id)).size).toBe(4); // no id collisions
  });
  it('replace mode swaps the whole library', () => {
    addCustomSnippet('Old', 'old', ['markdown']);
    importSnippetsJson(JSON.stringify([{ label: 'New', body: 'new', kinds: ['word'] }]), 'replace');
    const all = loadCustomSnippets();
    expect(all).toHaveLength(1);
    expect(all[0]!.label).toBe('New');
  });
  it('accepts a bare array and rejects non-libraries', () => {
    expect(importSnippetsJson('[{"label":"X","body":"y","kinds":["pdf"]}]')).toBe(1);
    expect(() => importSnippetsJson('{"foo":1}')).toThrow();
    expect(() => importSnippetsJson('[{"nope":true}]')).toThrow(/No valid snippets/);
  });
});
