import { describe, it, expect } from 'vitest';
import { bestRecorderMime, recorderExt } from './canvasRecord.js';

describe('canvasRecord mime negotiation', () => {
  it('prefers mp4/H.264+AAC first (what iOS Safari needs)', () => {
    // A Safari-like device: only mp4 is supported.
    const safari = bestRecorderMime((m) => m.startsWith('video/mp4'));
    expect(safari).toBe('video/mp4;codecs=avc1.42E01E,mp4a.40.2');
  });

  it('falls back to webm for Chrome/Firefox (no mp4 recording)', () => {
    const chrome = bestRecorderMime((m) => m.startsWith('video/webm'));
    expect(chrome).toBe('video/webm;codecs=vp9,opus');
  });

  it('returns empty string when nothing is supported (UA default)', () => {
    expect(bestRecorderMime(() => false)).toBe('');
  });

  it('recorderExt maps mp4 vs webm', () => {
    expect(recorderExt('video/mp4;codecs=avc1.42E01E,mp4a.40.2')).toBe('mp4');
    expect(recorderExt('video/webm;codecs=vp9,opus')).toBe('webm');
    expect(recorderExt('')).toBe('webm');
  });
});
