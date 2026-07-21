import { describe, it, expect } from 'vitest';
import { addComment, editComment, resolveComment, deleteComment, commentsFor, openCount, annotatedElements, reconcile, type AnchoredComment } from './anchoredComments.js';

const c = (id: string, elementId: string, over: Partial<AnchoredComment> = {}): AnchoredComment => ({ id, page: 0, elementId, author: 'A', text: 't' + id, createdAt: Number(id.replace(/\D/g, '')) || 1, ...over });

describe('anchoredComments', () => {
  it('adds (idempotent by id), edits, resolves and deletes', () => {
    let l = addComment([], c('1', 'e1'));
    l = addComment(l, c('1', 'e1', { text: 'dup' })); // same id replaces, not duplicates
    expect(l).toHaveLength(1);
    l = editComment(l, '1', 'edited');
    expect(l[0]!.text).toBe('edited');
    l = resolveComment(l, '1');
    expect(l[0]!.resolved).toBe(true);
    l = deleteComment(l, '1');
    expect(l).toHaveLength(0);
  });

  it('lists comments for an element oldest-first', () => {
    const l = [c('3', 'e1'), c('1', 'e1'), c('2', 'e2')];
    expect(commentsFor(l, 0, 'e1').map((x) => x.id)).toEqual(['1', '3']);
  });

  it('counts only open, non-orphaned comments', () => {
    const l = [c('1', 'e1'), c('2', 'e1', { resolved: true }), c('3', 'e2', { orphaned: true })];
    expect(openCount(l)).toBe(1);
    expect([...annotatedElements(l, 0)]).toEqual(['e1']);
  });

  it('reconcile orphans threads whose element was deleted, and un-orphans if it returns', () => {
    const l = [c('1', 'e1'), c('2', 'gone')];
    const live = new Map([[0, new Set(['e1'])]]);
    const out = reconcile(l, live);
    expect(out.find((x) => x.id === '1')!.orphaned).toBeFalsy();
    expect(out.find((x) => x.id === '2')!.orphaned).toBe(true);
    // element comes back → un-orphaned
    const back = reconcile(out, new Map([[0, new Set(['e1', 'gone'])]]));
    expect(back.find((x) => x.id === '2')!.orphaned).toBe(false);
  });
});
