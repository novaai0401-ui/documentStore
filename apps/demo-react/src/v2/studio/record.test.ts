import { describe, it, expect } from 'vitest';
import { pickRecorderMime, extForMime, formatDuration, RECORDER_MIMES } from './record.js';

describe('recorder helpers', () => {
  it('picks the first supported mime, best first', () => {
    expect(pickRecorderMime((m) => m === 'video/webm')).toBe('video/webm');
    expect(pickRecorderMime(() => true)).toBe(RECORDER_MIMES[0]);
    expect(pickRecorderMime(() => false)).toBe(''); // none → recorder default
    expect(pickRecorderMime((m) => m.includes('vp8'))).toBe('video/webm;codecs=vp8,opus');
  });
  it('maps mime to extension', () => {
    expect(extForMime('video/webm;codecs=vp9,opus')).toBe('webm');
    expect(extForMime('video/mp4')).toBe('mp4');
    expect(extForMime('')).toBe('webm');
  });
  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(3661)).toBe('1:01:01');
  });
});
