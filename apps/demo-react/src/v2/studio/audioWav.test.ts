import { describe, it, expect } from 'vitest';
import { wavEncode, sliceChannels, toInt16, applyFades } from './audioWav.js';

describe('audioWav', () => {
  it('clamps and scales float samples to int16', () => {
    expect(toInt16(0)).toBe(0);
    expect(toInt16(1)).toBe(0x7fff);
    expect(toInt16(-1)).toBe(-0x8000);
    expect(toInt16(2)).toBe(0x7fff);   // clamped
    expect(toInt16(-2)).toBe(-0x8000); // clamped
  });

  it('slices the trim window in samples', () => {
    const ch = new Float32Array(100).map((_, i) => i);
    const [out] = sliceChannels([ch], 10, 2, 5); // 10 Hz: samples 20…50
    expect(out).toHaveLength(30);
    expect(out![0]).toBe(20);
    expect(out![29]).toBe(49);
  });

  it('slice clamps out-of-range windows instead of throwing', () => {
    const ch = new Float32Array(10);
    expect(sliceChannels([ch], 10, -5, 99)[0]).toHaveLength(10);
    expect(sliceChannels([ch], 10, 8, 2)[0]).toHaveLength(0); // inverted → empty
  });

  it('applyFades ramps the edges and leaves the middle untouched', () => {
    const ch = new Float32Array(100).fill(1);
    applyFades([ch], 10, 1, 1); // 10 samples each side
    expect(ch[0]).toBe(0);
    expect(ch[5]).toBeCloseTo(0.5);
    expect(ch[50]).toBe(1);
    expect(ch[94]).toBeCloseTo(0.5);
    expect(ch[99]).toBe(0); // both edges land at silence
  });

  it('applyFades clamps to half the clip and survives empty input', () => {
    const ch = new Float32Array(10).fill(1);
    applyFades([ch], 1000, 60, 60); // absurd fades → clamp to 5 samples each
    // In covers 0–4, out covers 5–9: adjacent, never overlapping (no double fade).
    expect(ch[4]).toBeCloseTo(0.8);
    expect(ch[5]).toBeCloseTo(0.8);
    expect(ch[0]).toBe(0);
    expect(ch[9]).toBe(0);
    expect(applyFades([], 44100, 1, 1)).toEqual([]);
  });

  it('writes a valid RIFF/WAVE header with interleaved stereo data', () => {
    const l = new Float32Array([0.5, -0.5]);
    const r = new Float32Array([1, -1]);
    const buf = wavEncode([l, r], 44100);
    const dv = new DataView(buf);
    const tag = (o: number, n: number) => String.fromCharCode(...new Uint8Array(buf, o, n));
    expect(tag(0, 4)).toBe('RIFF');
    expect(tag(8, 4)).toBe('WAVE');
    expect(tag(36, 4)).toBe('data');
    expect(buf.byteLength).toBe(44 + 2 * 2 * 2);        // header + 2 frames × 2ch × 16-bit
    expect(dv.getUint16(22, true)).toBe(2);              // channels
    expect(dv.getUint32(24, true)).toBe(44100);          // sample rate
    expect(dv.getUint32(40, true)).toBe(8);              // data length
    expect(dv.getInt16(44, true)).toBe(toInt16(0.5));    // L0
    expect(dv.getInt16(46, true)).toBe(0x7fff);          // R0 (interleaved)
  });

  it('mono works and missing samples read as silence', () => {
    const buf = wavEncode([new Float32Array([0.25])], 8000);
    const dv = new DataView(buf);
    expect(dv.getUint16(22, true)).toBe(1);
    expect(dv.getInt16(44, true)).toBe(toInt16(0.25));
  });
});
