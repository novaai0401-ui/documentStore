import { describe, it, expect } from 'vitest';
import { MUSIC_MOODS, midiToFreq, moodSpec, moodLoopSeconds } from './musicGen.js';

describe('procedural music generator', () => {
  it('offers a set of moods with unique ids/labels/icons', () => {
    const ids = MUSIC_MOODS.map((m) => m.id);
    expect(ids).toContain('soft-piano');
    expect(ids).toContain('celebration');
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of MUSIC_MOODS) { expect(m.label.length).toBeGreaterThan(0); expect(m.icon.length).toBeGreaterThan(0); }
  });

  it('midiToFreq matches known pitches', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 3);   // A4
    expect(midiToFreq(60)).toBeCloseTo(261.63, 1); // C4
    expect(midiToFreq(81)).toBeCloseTo(880, 1);    // A5
  });

  it('every mood has a valid progression and a sensible loop length', () => {
    for (const m of MUSIC_MOODS) {
      const s = moodSpec(m.id);
      expect(s.bpm).toBeGreaterThan(30); expect(s.bpm).toBeLessThan(200);
      expect(s.chords.length).toBeGreaterThanOrEqual(3);
      for (const c of s.chords) expect(c.length).toBeGreaterThanOrEqual(3);
      const loop = moodLoopSeconds(m.id);
      expect(loop).toBeGreaterThan(4);   // long enough to not feel jumpy
      expect(loop).toBeLessThan(60);
    }
  });

  it('unknown mood falls back to the soft-piano spec', () => {
    expect(moodSpec('nonsense')).toEqual(moodSpec('soft-piano'));
  });
});
