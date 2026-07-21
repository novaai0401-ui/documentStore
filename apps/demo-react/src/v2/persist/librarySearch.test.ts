import { describe, it, expect, beforeEach } from 'vitest';
import { memKv } from './kv.js';
import { configureDocStore, saveDoc, type DocRecord } from './docStore.js';
import { searchLibrary } from './librarySearch.js';

beforeEach(() => { configureDocStore(memKv()); });

const save = (id: string, name: string, kind: DocRecord['kind'], content: DocRecord['content']) =>
  saveDoc({ id, name, ext: 'x', kind, updatedAt: Date.now(), content });

describe('searchLibrary', () => {
  it('finds the most relevant document across the library', async () => {
    await save('a', 'Sales report', 'text', { text: 'Quarterly revenue rose twenty percent on strong enterprise sales.' });
    await save('b', 'Recipe', 'text', { text: 'Combine flour, sugar and butter, then bake for thirty minutes.' });
    await save('c', 'Trip notes', 'text', { text: 'The mountain trail was steep and covered in fresh snow.' });

    const hits = await searchLibrary('how did revenue and sales perform', 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.docId).toBe('a');
    expect(hits[0]!.name).toBe('Sales report');
    expect(hits[0]!.snippet).toContain('revenue');
  });

  it('returns nothing for an empty query or empty library', async () => {
    expect(await searchLibrary('   ')).toEqual([]);
    expect(await searchLibrary('anything')).toEqual([]);
  });
});
