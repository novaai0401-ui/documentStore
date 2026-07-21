import { describe, it, expect, beforeEach } from 'vitest';
import { memKv } from './kv.js';
import { configureComments, addComment, listComments, setResolved, deleteComment, openCount } from './comments.js';

beforeEach(() => { configureComments(memKv()); });

describe('comments', () => {
  it('adds and lists comments chronologically, scoped per document', async () => {
    await addComment('d1', 'Ada', 'first');
    await addComment('d1', 'Grace', 'second');
    await addComment('d2', 'X', 'other');
    const list = await listComments('d1');
    expect(list.map((c) => c.text)).toEqual(['first', 'second']);
    expect(list[0]!.author).toBe('Ada');
    expect(await listComments('d2')).toHaveLength(1);
  });

  it('rejects empty text and defaults a blank author', async () => {
    expect(await addComment('d1', 'A', '   ')).toBeNull();
    const c = await addComment('d1', '  ', 'hi');
    expect(c!.author).toBe('You');
  });

  it('resolves / reopens and tracks the open count', async () => {
    const a = await addComment('d1', 'A', 'one');
    await addComment('d1', 'A', 'two');
    expect(await openCount('d1')).toBe(2);
    await setResolved('d1', a!.id, true);
    expect(await openCount('d1')).toBe(1);
    expect((await listComments('d1')).find((c) => c.id === a!.id)!.resolved).toBe(true);
  });

  it('deletes a comment', async () => {
    const a = await addComment('d1', 'A', 'one');
    await deleteComment('d1', a!.id);
    expect(await listComments('d1')).toEqual([]);
  });
});
