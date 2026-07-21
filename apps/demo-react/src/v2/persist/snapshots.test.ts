import { describe, it, expect, beforeEach } from 'vitest';
import { memKv } from './kv.js';
import { configureSnapshots, saveSnapshot, listSnapshots, getSnapshot, deleteSnapshot } from './snapshots.js';

beforeEach(() => { configureSnapshots(memKv()); });

describe('snapshots', () => {
  it('saves, lists newest-first, and restores content', async () => {
    await saveSnapshot('doc1', 'v1', { text: 'first' });
    await saveSnapshot('doc1', 'v2', { text: 'second' });
    const list = await listSnapshots('doc1');
    expect(list.map((s) => s.label)).toEqual(['v2', 'v1']);
    const snap = await getSnapshot(list[0]!.id);
    expect(snap!.content.text).toBe('second');
  });

  it('labels blank saves with a timestamp and scopes per document', async () => {
    const m = await saveSnapshot('doc1', '   ', { text: 'x' });
    expect(m.label).not.toBe('');
    await saveSnapshot('doc2', 'other', { text: 'y' });
    expect(await listSnapshots('doc1')).toHaveLength(1);
    expect(await listSnapshots('doc2')).toHaveLength(1);
  });

  it('deletes a snapshot and its index entry', async () => {
    const m = await saveSnapshot('doc1', 'v1', { text: 'a' });
    await deleteSnapshot('doc1', m.id);
    expect(await listSnapshots('doc1')).toEqual([]);
    expect(await getSnapshot(m.id)).toBeUndefined();
  });

  it('caps history at 25 per document, dropping the oldest', async () => {
    for (let i = 0; i < 30; i++) await saveSnapshot('doc1', `v${i}`, { text: String(i) });
    const list = await listSnapshots('doc1');
    expect(list).toHaveLength(25);
    expect(list[0]!.label).toBe('v29'); // newest kept
    expect(list.some((s) => s.label === 'v0')).toBe(false); // oldest pruned
  });
});
