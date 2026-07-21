import { describe, it, expect } from 'vitest';
import { memeFontSize, wrapText } from './meme.js';

describe('meme helpers', () => {
  it('scales and clamps font size', () => {
    expect(memeFontSize(1000)).toBe(100);
    expect(memeFontSize(100)).toBe(18);   // clamped low
    expect(memeFontSize(5000)).toBe(160); // clamped high
  });
  it('wraps text greedily using an injected measurer', () => {
    const measure = (s: string) => s.length * 10; // 10px per char
    expect(wrapText('one two three', 80, measure)).toEqual(['one two', 'three']); // "one two"=70≤80, +" three"=130>80
    expect(wrapText('', 100, measure)).toEqual([]);
    expect(wrapText('hello', 1000, measure)).toEqual(['hello']);
  });
});
