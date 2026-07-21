/**
 * Read-aloud (text-to-speech) over the document, plus a small accessibility
 * report. Uses the browser-native Web Speech API (`speechSynthesis`) — no
 * network, no key, available in every modern browser.
 *
 * We queue one utterance per line so we always know which line is being
 * spoken (for karaoke-style highlighting in the panel) and so pause/resume
 * land on clean boundaries.
 */

export interface ReadSegment {
  page: number;
  text: string;
}

export interface ReadAloudController {
  start: (segments: ReadSegment[], opts: { rate: number; voice: SpeechSynthesisVoice | null }) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return [];
  return window.speechSynthesis.getVoices();
}

/**
 * Create a controller. `onSegment(index)` fires as each line starts (or -1
 * when finished/stopped) so the UI can highlight progress.
 */
export function createReadAloud(onSegment: (index: number) => void): ReadAloudController {
  let cancelled = false;

  const stop = () => {
    cancelled = true;
    if (ttsSupported()) window.speechSynthesis.cancel();
    onSegment(-1);
  };

  const start: ReadAloudController['start'] = (segments, opts) => {
    if (!ttsSupported() || segments.length === 0) return;
    window.speechSynthesis.cancel();
    cancelled = false;
    segments.forEach((seg, i) => {
      const u = new SpeechSynthesisUtterance(seg.text);
      u.rate = opts.rate;
      if (opts.voice) u.voice = opts.voice;
      u.onstart = () => {
        if (!cancelled) onSegment(i);
      };
      if (i === segments.length - 1) {
        u.onend = () => {
          if (!cancelled) onSegment(-1);
        };
      }
      window.speechSynthesis.speak(u);
    });
  };

  return {
    start,
    pause: () => ttsSupported() && window.speechSynthesis.pause(),
    resume: () => ttsSupported() && window.speechSynthesis.resume(),
    stop,
  };
}
