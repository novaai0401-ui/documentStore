import { describe, it, expect } from 'vitest';
import { speakSeconds, splitScript, autoTimeCaptions, scriptSeconds, srtTime, parseSrtTime, toSrt, parseSrt, type Cue } from './captions.js';

describe('captions engine', () => {
  it('splits a script into caption-sized chunks on sentences and word wrap', () => {
    const chunks = splitScript('Hello there. This is a fairly long sentence that should wrap onto multiple caption lines nicely.', 30);
    expect(chunks[0]).toBe('Hello there.');
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(30);
    expect(chunks.length).toBeGreaterThan(2);
    expect(splitScript('')).toEqual([]);
  });

  it('auto-times cues sequentially, non-overlapping, filling the duration exactly', () => {
    const cues = autoTimeCaptions(['one', 'two three four five six seven eight nine', 'five'], 20);
    expect(cues).toHaveLength(3);
    expect(cues[0]!.startS).toBe(0);
    expect(cues[cues.length - 1]!.endS).toBeCloseTo(20, 5);
    for (let i = 1; i < cues.length; i++) expect(cues[i]!.startS).toBeCloseTo(cues[i - 1]!.endS, 5);
    // The much longer chunk gets more time than a short one.
    expect(cues[1]!.endS - cues[1]!.startS).toBeGreaterThan(cues[0]!.endS - cues[0]!.startS);
    expect(autoTimeCaptions([], 10)).toEqual([]);
  });

  it('speakSeconds/scriptSeconds grow with word count and have a floor', () => {
    expect(speakSeconds('hi')).toBe(0.8);
    expect(speakSeconds('one two three four five six seven eight nine ten', 150)).toBeGreaterThan(3);
    expect(scriptSeconds(['a b c', 'd e f'])).toBeCloseTo(speakSeconds('a b c') * 2, 5);
  });

  it('SRT time round-trips', () => {
    expect(srtTime(0)).toBe('00:00:00,000');
    expect(srtTime(3661.5)).toBe('01:01:01,500');
    expect(parseSrtTime('01:01:01,500')).toBeCloseTo(3661.5, 3);
    expect(parseSrtTime('00:00:03.250')).toBeCloseTo(3.25, 3); // tolerates a dot
    expect(Number.isNaN(parseSrtTime('nope'))).toBe(true);
  });

  it('toSrt/parseSrt round-trip a set of cues', () => {
    const cues: Cue[] = [
      { startS: 0, endS: 2.5, text: 'Hello' },
      { startS: 2.5, endS: 5, text: 'Two lines\nof caption' },
    ];
    const srt = toSrt(cues);
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:02,500\nHello');
    const back = parseSrt(srt);
    expect(back).toHaveLength(2);
    expect(back[0]).toMatchObject({ text: 'Hello' });
    expect(back[1]!.text).toBe('Two lines\nof caption');
    expect(back[1]!.startS).toBeCloseTo(2.5, 3);
  });

  it('parseSrt tolerates \\r\\n and blocks without index lines', () => {
    const srt = '00:00:01,000 --> 00:00:02,000\r\nNo index here\r\n\r\n2\r\n00:00:02,000 --> 00:00:03,000\r\nSecond';
    const cues = parseSrt(srt);
    expect(cues).toHaveLength(2);
    expect(cues[0]!.text).toBe('No index here');
  });
});
