import { describe, it, expect } from 'vitest';
import { RGA } from './rga.js';
import { diffToOps, CrdtText } from './textSync.js';

describe('diffToOps', () => {
  const apply = (start: string, next: string): string => {
    const r = new RGA('A');
    r.insertAt(0, start);
    diffToOps(r, next);
    return r.toString();
  };

  it('handles append, prepend, insert, delete, and replace', () => {
    expect(apply('hello', 'hello world')).toBe('hello world'); // append
    expect(apply('world', 'hello world')).toBe('hello world');  // prepend
    expect(apply('helo', 'hello')).toBe('hello');               // middle insert
    expect(apply('hello', 'helo')).toBe('helo');                // middle delete
    expect(apply('hello', 'hExxo')).toBe('hExxo');              // replace region
    expect(apply('hello', '')).toBe('');                        // clear
    expect(apply('', 'fresh')).toBe('fresh');                   // from empty
  });

  it('produces no ops when text is unchanged', () => {
    const r = new RGA('A');
    r.insertAt(0, 'same');
    expect(diffToOps(r, 'same')).toEqual([]);
  });
});

describe('CrdtText', () => {
  it('two peers converge through setText/applyRemote', () => {
    const alice = new CrdtText('Shared note', 'alice');
    const bob = new CrdtText('', 'bob');
    bob.applyRemote(alice.snapshot()); // bob joins, catches up
    expect(bob.text).toBe('Shared note');

    // Concurrent edits on each peer.
    const aOps = alice.setText('Shared note — A'); // append on alice
    const bOps = bob.setText('B: Shared note');     // prepend on bob

    bob.applyRemote(aOps);
    alice.applyRemote(bOps);
    expect(alice.text).toBe(bob.text);
  });

  it('notifies listeners on remote changes', () => {
    const a = new CrdtText('x', 'a');
    const b = new CrdtText('', 'b');
    b.applyRemote(a.snapshot());
    let seen = '';
    b.onChange((t) => { seen = t; });
    const ops = a.setText('xy');
    b.applyRemote(ops);
    expect(seen).toBe('xy');
    expect(b.text).toBe('xy');
  });
});
