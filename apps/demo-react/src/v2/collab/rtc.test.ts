import { describe, it, expect } from 'vitest';
import { encodeSignal, decodeSignal, initiatesTo, gridDims, type Signal } from './rtc.js';

describe('rtc signalling helpers', () => {
  it('encodes and decodes signals, rejecting junk', () => {
    const s: Signal = { from: 'a', to: 'b', kind: 'offer', payload: 'x' };
    expect(decodeSignal(encodeSignal(s))).toEqual(s);
    expect(decodeSignal('not json')).toBeNull();
    expect(decodeSignal('{"from":"a"}')).toBeNull(); // missing fields
  });

  it('avoids offer glare deterministically (smaller id initiates)', () => {
    expect(initiatesTo('a', 'b')).toBe(true);
    expect(initiatesTo('b', 'a')).toBe(false);
    // exactly one side of any pair initiates
    expect(initiatesTo('a', 'b')).toBe(!initiatesTo('b', 'a'));
  });

  it('lays out a balanced video grid', () => {
    expect(gridDims(1)).toEqual({ cols: 1, rows: 1 });
    expect(gridDims(2)).toEqual({ cols: 2, rows: 1 });
    expect(gridDims(4)).toEqual({ cols: 2, rows: 2 });
    expect(gridDims(5)).toEqual({ cols: 3, rows: 2 });
    expect(gridDims(9)).toEqual({ cols: 3, rows: 3 });
  });
});
