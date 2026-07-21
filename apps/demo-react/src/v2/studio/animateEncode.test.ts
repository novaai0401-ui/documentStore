import { describe, it, expect } from 'vitest';
import { frameTimestampsUs, loopAudioChannel, even, webCodecsSupported } from './animateEncode.js';

describe('animateEncode helpers', () => {
  it('computes per-frame microsecond timestamps', () => {
    expect(frameTimestampsUs(0, 30)).toEqual([]);
    const ts = frameTimestampsUs(3, 30);
    expect(ts[0]).toBe(0);
    expect(ts[1]).toBe(Math.round(1_000_000 / 30));
    expect(ts[2]).toBe(Math.round(2_000_000 / 30));
  });

  it('loops short audio to fill the clip', () => {
    const src = new Float32Array([1, 2, 3]);
    expect(Array.from(loopAudioChannel(src, 7))).toEqual([1, 2, 3, 1, 2, 3, 1]);
  });

  it('truncates audio longer than the clip', () => {
    const src = new Float32Array([1, 2, 3, 4, 5]);
    expect(Array.from(loopAudioChannel(src, 3))).toEqual([1, 2, 3]);
  });

  it('returns silence for empty source', () => {
    expect(Array.from(loopAudioChannel(new Float32Array([]), 3))).toEqual([0, 0, 0]);
  });

  it('rounds dimensions to even numbers ≥ 2', () => {
    expect(even(721)).toBe(722);
    expect(even(720)).toBe(720);
    expect(even(1)).toBe(2);
    expect(even(0)).toBe(2);
  });

  it('reports WebCodecs unsupported in Node (no VideoEncoder)', () => {
    expect(webCodecsSupported()).toBe(false);
  });
});
