import { describe, it, expect } from 'vitest';
import { LwwMap, type LwwOp } from './lwwMap.js';

describe('LwwMap', () => {
  it('stores and reads local writes', () => {
    const m = new LwwMap('a');
    m.set('x', '1');
    m.set('y', '2');
    expect(m.get('x')).toBe('1');
    expect(m.entries()).toEqual({ x: '1', y: '2' });
  });

  it('a fresh local write always wins over anything seen', () => {
    const m = new LwwMap('a');
    // Peer wrote x at a high timestamp.
    m.apply({ key: 'x', value: 'remote', t: 99, site: 'b' });
    expect(m.get('x')).toBe('remote');
    // Our subsequent local edit must supersede it.
    m.set('x', 'local');
    expect(m.get('x')).toBe('local');
  });

  it('ignores an older write to the same key', () => {
    const m = new LwwMap('a');
    m.apply({ key: 'x', value: 'new', t: 10, site: 'b' });
    const changed = m.apply({ key: 'x', value: 'old', t: 5, site: 'c' });
    expect(changed).toBe(false);
    expect(m.get('x')).toBe('new');
  });

  it('breaks ties by site id deterministically', () => {
    const m1 = new LwwMap('a');
    const m2 = new LwwMap('a');
    const opB: LwwOp = { key: 'x', value: 'B', t: 7, site: 'b' };
    const opC: LwwOp = { key: 'x', value: 'C', t: 7, site: 'c' };
    // Same timestamp, different sites, applied in opposite orders.
    m1.apply(opB); m1.apply(opC);
    m2.apply(opC); m2.apply(opB);
    expect(m1.get('x')).toBe(m2.get('x'));
    expect(m1.get('x')).toBe('C'); // higher site id wins
  });

  it('converges regardless of op order (commutative + idempotent)', () => {
    const ops: LwwOp[] = [
      { key: 'a', value: '1', t: 1, site: 'x' },
      { key: 'a', value: '2', t: 3, site: 'y' },
      { key: 'b', value: '9', t: 2, site: 'x' },
      { key: 'a', value: '2', t: 3, site: 'y' }, // duplicate
    ];
    const forward = new LwwMap('z');
    forward.applyAll(ops);
    const reverse = new LwwMap('z');
    reverse.applyAll([...ops].reverse());
    expect(forward.entries()).toEqual(reverse.entries());
    expect(forward.get('a')).toBe('2');
    expect(forward.get('b')).toBe('9');
  });

  it('snapshot round-trips into a fresh replica', () => {
    const src = new LwwMap('a');
    src.set('one', 'I');
    src.set('two', 'II');
    const dst = new LwwMap('b');
    dst.applyAll(src.snapshot());
    expect(dst.entries()).toEqual(src.entries());
  });
});
