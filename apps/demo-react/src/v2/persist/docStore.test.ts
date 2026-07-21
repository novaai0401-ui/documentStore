import { describe, it, expect, beforeEach } from 'vitest';
import { memKv } from './kv.js';
import {
  configureDocStore, saveDoc, loadDoc, listRecent, deleteDoc, setLastOpen, getLastOpen, clearLastOpen, newDocId,
  type DocRecord,
} from './docStore.js';

const rec = (id: string, name: string, updatedAt: number): DocRecord => ({
  id, name, ext: 'md', kind: 'text', updatedAt, content: { text: `body ${name}` },
});

beforeEach(() => { configureDocStore(memKv()); });

describe('docStore', () => {
  it('saves and loads a record with its content', async () => {
    await saveDoc(rec('a', 'A', 100));
    const got = await loadDoc('a');
    expect(got?.name).toBe('A');
    expect(got?.content.text).toBe('body A');
    expect(await loadDoc('missing')).toBeUndefined();
  });

  it('lists recents newest-first and updates in place', async () => {
    await saveDoc(rec('a', 'A', 100));
    await saveDoc(rec('b', 'B', 300));
    await saveDoc(rec('c', 'C', 200));
    expect((await listRecent()).map((m) => m.id)).toEqual(['b', 'c', 'a']);
    // Re-saving 'a' newer moves it to the front without duplicating.
    await saveDoc(rec('a', 'A2', 400));
    const recents = await listRecent();
    expect(recents.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(recents.filter((m) => m.id === 'a')).toHaveLength(1);
    expect(recents[0]!.name).toBe('A2');
  });

  it('evicts the oldest documents past the cap', async () => {
    for (let i = 0; i < 55; i++) await saveDoc(rec(`d${i}`, `D${i}`, i));
    const recents = await listRecent(100);
    expect(recents.length).toBe(50);
    // d0..d4 are the oldest 5 and should have been evicted.
    expect(await loadDoc('d0')).toBeUndefined();
    expect(await loadDoc('d54')).toBeDefined();
  });

  it('deletes a record and drops it from the index + last-open', async () => {
    await saveDoc(rec('a', 'A', 100));
    await setLastOpen('a');
    await deleteDoc('a');
    expect(await loadDoc('a')).toBeUndefined();
    expect(await listRecent()).toEqual([]);
    expect(await getLastOpen()).toBeUndefined();
  });

  it('tracks and clears the last-open document', async () => {
    await setLastOpen('x');
    expect(await getLastOpen()).toBe('x');
    await clearLastOpen();
    expect(await getLastOpen()).toBeUndefined();
  });

  it('generates distinct ids', () => {
    expect(newDocId()).not.toBe(newDocId());
  });

  it('round-trips binary content (PDF bytes)', async () => {
    const bytes = new Uint8Array([1, 2, 3, 255]);
    await saveDoc({ id: 'p', name: 'P', ext: 'pdf', kind: 'pdf', updatedAt: 1, content: { bytes } });
    const got = await loadDoc('p');
    expect(Array.from(got!.content.bytes!)).toEqual([1, 2, 3, 255]);
  });
});
