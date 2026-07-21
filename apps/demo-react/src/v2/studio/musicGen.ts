/**
 * Procedural background music — synthesizes short, gentle, ROYALTY-FREE loops on
 * the device (WebAudio → WAV), so users get a soundtrack for reels and memory
 * videos with zero licensing worries and nothing to download. Each "mood" is a
 * small chord progression rendered as a soft pad + arpeggio + bass; the video
 * encoders loop the clip to length. Note maths are pure/tested; the render needs
 * an OfflineAudioContext.
 */

export interface MusicMood { id: string; label: string; icon: string }

export const MUSIC_MOODS: MusicMood[] = [
  { id: 'soft-piano', label: 'Soft piano', icon: '🎹' },
  { id: 'uplifting', label: 'Uplifting', icon: '☀️' },
  { id: 'calm', label: 'Calm & warm', icon: '🌊' },
  { id: 'celebration', label: 'Celebration', icon: '🎉' },
  { id: 'lofi', label: 'Chill lo-fi', icon: '🌆' },
];

/** MIDI note number → frequency (A4 = 69 = 440Hz). */
export const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

interface MoodSpec { bpm: number; chords: number[][]; arp: boolean; type: OscillatorType; gain: number }

/** Chord progressions (MIDI triads/7ths) + feel per mood. Pure data. */
export function moodSpec(id: string): MoodSpec {
  switch (id) {
    case 'uplifting': return { bpm: 100, type: 'triangle', gain: 0.16, arp: true, chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]] }; // C G Am F
    case 'calm': return { bpm: 56, type: 'sine', gain: 0.18, arp: false, chords: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]] }; // Am F C G
    case 'celebration': return { bpm: 120, type: 'triangle', gain: 0.15, arp: true, chords: [[60, 64, 67], [53, 57, 60], [55, 59, 62]] }; // C F G
    case 'lofi': return { bpm: 72, type: 'sine', gain: 0.17, arp: true, chords: [[57, 60, 64, 67], [50, 53, 57, 60], [55, 59, 62, 65], [53, 57, 60, 64]] }; // Am7 Dm7 G7 Fmaj7
    case 'soft-piano':
    default: return { bpm: 62, type: 'triangle', gain: 0.19, arp: true, chords: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]] }; // Cmaj7 Am7 Fmaj7 G7
  }
}

/** Loop length (seconds) for a mood = its whole-bar progression at 4/4. */
export function moodLoopSeconds(id: string): number {
  const s = moodSpec(id);
  return (60 / s.bpm) * 4 * s.chords.length;
}

const SR = 44100;

/** Render one seamless loop of the mood to a mono WAV File (the encoders loop it). */
export async function generateMusic(moodId: string): Promise<File> {
  const spec = moodSpec(moodId);
  const beat = 60 / spec.bpm;
  const bar = beat * 4;
  const seconds = bar * spec.chords.length;
  const AC = (window as unknown as { OfflineAudioContext: typeof OfflineAudioContext }).OfflineAudioContext
    || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const octx = new AC(1, Math.ceil(seconds * SR), SR);

  const master = octx.createGain(); master.gain.value = 0.85;
  const warm = octx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 3200;
  master.connect(warm); warm.connect(octx.destination);

  const note = (m: number, start: number, dur: number, gain: number, type: OscillatorType) => {
    const o = octx.createOscillator(); o.type = type; o.frequency.value = midiToFreq(m);
    const g = octx.createGain();
    const atk = Math.min(0.04, dur * 0.25), rel = Math.min(0.35, dur * 0.5);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + atk);
    g.gain.setValueAtTime(Math.max(0.0002, gain), Math.max(start + atk, start + dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(master); o.start(start); o.stop(start + dur + 0.02);
  };

  for (let b = 0; b < spec.chords.length; b++) {
    const t0 = b * bar;
    const chord = spec.chords[b]!;
    // Soft pad: hold the chord for the whole bar.
    for (const m of chord) note(m, t0, bar, spec.gain * 0.5, spec.type);
    // Bass: the root, an octave down, on beat 1 (and 3 for lift).
    note(chord[0]! - 12, t0, beat * 2, spec.gain * 0.9, 'sine');
    note(chord[0]! - 12, t0 + beat * 2, beat * 2, spec.gain * 0.7, 'sine');
    // Arpeggio: cycle the chord tones across the beats, an octave up.
    if (spec.arp) {
      for (let i = 0; i < 4; i++) {
        const m = chord[i % chord.length]! + 12;
        note(m, t0 + i * beat, beat * 0.9, spec.gain * 0.7, spec.type);
      }
    }
  }

  const rendered = await octx.startRendering();
  const { wavEncode } = await import('./audioWav.js');
  const buf = wavEncode([rendered.getChannelData(0)], SR);
  return new File([buf], `music-${moodId}.wav`, { type: 'audio/wav' });
}
