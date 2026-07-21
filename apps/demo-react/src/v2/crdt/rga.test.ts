import { describe, it, expect } from 'vitest';
import { RGA, type RgaOp } from './rga.js';

const type = (r: RGA, pos: number, s: string) => r.insertAt(pos, s);

describe('RGA — local editing', () => {
  it('builds text by inserting characters', () => {
    const r = new RGA('A');
    type(r, 0, 'helo');
    expect(r.toString()).toBe('helo');
    type(r, 3, 'l'); // 'hel|o' → insert 'l' before 'o'
    expect(r.toString()).toBe('hello');
    expect(r.length).toBe(5);
  });

  it('inserts at the start and middle', () => {
    const r = new RGA('A');
    type(r, 0, 'world');
    type(r, 0, 'hello ');
    expect(r.toString()).toBe('hello world');
  });

  it('deletes characters (tombstones)', () => {
    const r = new RGA('A');
    type(r, 0, 'hello');
    r.deleteAt(0, 1); // drop 'h'
    expect(r.toString()).toBe('ello');
    r.deleteAt(3, 1); // drop 'o'
    expect(r.toString()).toBe('ell');
  });
});

describe('RGA — convergence', () => {
  it('two replicas converge after exchanging concurrent edits', () => {
    const a = new RGA('A');
    const base = type(a, 0, 'hello');
    const b = new RGA('B');
    b.applyAll(base);

    const oa = a.insertAt(5, ' world'); // 'hello world'
    const ob = b.insertAt(0, 'say ');   // 'say hello'
    b.applyAll(oa);
    a.applyAll(ob);

    expect(a.toString()).toBe(b.toString());
    expect(a.toString()).toBe('say hello world');
  });

  it('orders concurrent same-position inserts deterministically', () => {
    const a = new RGA('A');
    const b = new RGA('B');
    const oa = a.insertAt(0, 'A');
    const ob = b.insertAt(0, 'B');
    a.applyAll(ob);
    b.applyAll(oa);
    expect(a.toString()).toBe(b.toString());
    // Equal clocks → tie broken by site id; both replicas agree.
    expect(a.toString()).toBe('BA');
  });

  it('is idempotent — applying the same ops twice changes nothing', () => {
    const a = new RGA('A');
    const ops = type(a, 0, 'abc');
    const b = new RGA('B');
    b.applyAll(ops);
    b.applyAll(ops); // duplicate delivery
    expect(b.toString()).toBe('abc');
  });

  it('converges regardless of op arrival order (incl. out-of-order deps)', () => {
    // Generate a mixed history across three replicas.
    const a = new RGA('A');
    const all: RgaOp[] = [];
    all.push(...a.insertAt(0, 'The quick brown fox'));
    const b = new RGA('B'); b.applyAll(a.snapshot());
    const c = new RGA('C'); c.applyAll(a.snapshot());
    all.push(...a.insertAt(3, ' very'));        // "The very quick..."
    all.push(...b.insertAt(19, ' jumps'));       // end edit on b's view
    all.push(...c.deleteAt(0, 4));               // delete "The "
    all.push(...b.insertAt(0, 'Note: '));
    // Reference result: apply everything in generation order to a fresh replica.
    const ref = new RGA('R'); ref.applyAll(all);
    expect(ref.settled).toBe(true);

    // Now shuffle the op log many times; every order must match the reference.
    for (let trial = 0; trial < 30; trial++) {
      const shuffled = [...all];
      for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]; }
      const r = new RGA('T'); r.applyAll(shuffled);
      expect(r.settled).toBe(true);
      expect(r.toString()).toBe(ref.toString());
    }
  });

  it('buffers a delete that arrives before its insert', () => {
    const a = new RGA('A');
    const ins = a.insertAt(0, 'x');
    const del = a.deleteAt(0, 1);
    const b = new RGA('B');
    b.applyAll(del);  // delete first
    expect(b.toString()).toBe('');
    b.applyAll(ins);  // then the insert — tombstone must apply
    expect(b.toString()).toBe('');
    expect(b.settled).toBe(true);
  });

  it('snapshot/restore reproduces the document', () => {
    const a = new RGA('A');
    type(a, 0, 'hello');
    a.deleteAt(0, 1);
    type(a, 4, '!');
    const restored = RGA.fromSnapshot(a.snapshot(), 'Z');
    expect(restored.toString()).toBe(a.toString());
    expect(restored.toString()).toBe('ello!');
  });
});
