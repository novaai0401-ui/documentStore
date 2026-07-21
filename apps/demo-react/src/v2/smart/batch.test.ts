import { describe, it, expect } from 'vitest';
import { runBatch, chain, summarize } from './batch.js';

describe('runBatch', () => {
  it('applies the op to every item and reports progress', async () => {
    const progress: Array<[number, number]> = [];
    const res = await runBatch([1, 2, 3], (n) => Promise.resolve(n * 10), (n) => `i${n}`, (d, t) => progress.push([d, t]));
    expect(res.map((r) => r.output)).toEqual([10, 20, 30]);
    expect(res.every((r) => r.ok)).toBe(true);
    expect(res[0]!.name).toBe('i1');
    expect(progress).toEqual([[1, 3], [2, 3], [3, 3]]);
  });

  it('isolates per-item errors without aborting the rest', async () => {
    const res = await runBatch([1, 2, 3], (n) => (n === 2 ? Promise.reject(new Error('boom')) : Promise.resolve(n)), (n) => `i${n}`);
    expect(res.map((r) => r.ok)).toEqual([true, false, true]);
    expect(res[1]!.error).toBe('boom');
  });
});

describe('chain', () => {
  it('composes async steps left-to-right', async () => {
    const f = chain((x: number) => Promise.resolve(x + 1), (x) => Promise.resolve(x * 2));
    expect(await f(3)).toBe(8); // (3+1)*2
  });
  it('is identity with no steps', async () => {
    expect(await chain<number>()(5)).toBe(5);
  });
  it('works as a batch op (chained recipe)', async () => {
    const recipe = chain((s: string) => Promise.resolve(s.trim()), (s) => Promise.resolve(s.toUpperCase()));
    const res = await runBatch(['  a ', ' b'], recipe, (s) => s);
    expect(res.map((r) => r.output)).toEqual(['A', 'B']);
  });
});

describe('summarize', () => {
  it('counts successes and failures', () => {
    expect(summarize([{ name: 'a', ok: true }, { name: 'b', ok: false }, { name: 'c', ok: true }]))
      .toMatchObject({ ok: 2, failed: 1, total: 3 });
  });
});
