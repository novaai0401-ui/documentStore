import { describe, it, expect } from 'vitest';
import { concatFloat32 } from './voiceOver.js';
import { wavEncode } from './audioWav.js';

describe('voice-over PCM capture', () => {
  it('concatFloat32 joins captured blocks in order, preserving samples', () => {
    const a = new Float32Array([0.1, 0.2]);
    const b = new Float32Array([0.3]);
    const c = new Float32Array([0.4, 0.5, 0.6]);
    const out = concatFloat32([a, b, c]);
    expect(out).toHaveLength(6);
    expect(Array.from(out)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map((x) => Math.fround(x)));
  });

  it('empty capture yields an empty buffer (caller rejects before making a file)', () => {
    expect(concatFloat32([])).toHaveLength(0);
  });

  it('captured PCM encodes to a valid WAV the exporter can decode (RIFF/WAVE header)', () => {
    // Recording produces PCM → wavEncode → a real .wav (which decodeAudioData
    // always decodes, unlike the old MediaRecorder WebM/Opus blob).
    const pcm = concatFloat32([new Float32Array([0, 0.5, -0.5, 1, -1])]);
    const wav = new Uint8Array(wavEncode([pcm], 48000));
    const tag = (o: number) => String.fromCharCode(wav[o]!, wav[o + 1]!, wav[o + 2]!, wav[o + 3]!);
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(wav.length).toBeGreaterThan(44); // header + samples
  });
});
