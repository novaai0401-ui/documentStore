import { describe, it, expect } from 'vitest';
import { LWWRegister, LWWMap } from './lww.js';
import type { OpId } from './id.js';

const id = (c: number, s: string): OpId => ({ c, s });

describe('LWWRegister', () => {
  it('keeps the newest write by clock', () => {
    const r = new LWWRegister<string>();
    expect(r.set('a', id(1, 'A'))).toBe(true);
    expect(r.set('b', id(2, 'A'))).toBe(true);
    expect(r.value).toBe('b');
    expect(r.set('old', id(1, 'A'))).toBe(false); // older — ignored
    expect(r.value).toBe('b');
  });

  it('breaks equal-clock ties by site id deterministically', () => {
    const x = new LWWRegister<string>();
    const y = new LWWRegister<string>();
    // Apply the two concurrent writes in opposite orders on two replicas.
    x.set('fromA', id(5, 'A')); x.set('fromB', id(5, 'B'));
    y.set('fromB', id(5, 'B')); y.set('fromA', id(5, 'A'));
    expect(x.value).toBe(y.value);
    expect(x.value).toBe('fromB'); // site 'B' > 'A'
  });

  it('is idempotent', () => {
    const r = new LWWRegister<number>();
    r.set(7, id(3, 'A'));
    r.set(7, id(3, 'A'));
    expect(r.value).toBe(7);
  });
});

describe('LWWMap', () => {
  it('sets, gets, and lists live entries', () => {
    const m = new LWWMap<string>();
    m.set('1,1', 'hello', id(1, 'A'));
    m.set('2,1', 'world', id(2, 'A'));
    expect(m.get('1,1')).toBe('hello');
    expect(m.size).toBe(2);
    expect(m.entries().sort()).toEqual([['1,1', 'hello'], ['2,1', 'world']]);
  });

  it('deletion is a write of undefined and respects ordering', () => {
    const m = new LWWMap<string>();
    m.set('a', 'v', id(1, 'A'));
    m.delete('a', id(2, 'A'));
    expect(m.has('a')).toBe(false);
    // A late-arriving older set must not resurrect the key.
    expect(m.set('a', 'stale', id(1, 'B'))).toBe(false);
    expect(m.has('a')).toBe(false);
    // A newer set does.
    m.set('a', 'fresh', id(3, 'A'));
    expect(m.get('a')).toBe('fresh');
  });

  it('converges when concurrent writes apply in different orders', () => {
    const m1 = new LWWMap<string>();
    const m2 = new LWWMap<string>();
    const w1: [string, string, OpId] = ['k', 'one', id(4, 'A')];
    const w2: [string, string, OpId] = ['k', 'two', id(4, 'B')];
    m1.set(...w1); m1.set(...w2);
    m2.set(...w2); m2.set(...w1);
    expect(m1.get('k')).toBe(m2.get('k'));
  });
});
