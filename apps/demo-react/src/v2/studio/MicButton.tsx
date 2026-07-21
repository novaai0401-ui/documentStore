/**
 * Voice input — a small mic button that dictates into a text field using the
 * browser's Speech Recognition, in the user's chosen Indian language. Huge for
 * low-literacy, elderly and first-time users who'd rather speak than type.
 * Renders nothing where the browser doesn't support it (graceful).
 */
import { useRef, useState } from 'react';
import { getLang } from '../../i18n.js';

// App language → BCP-47 recognition locale (India variants where available).
const SR_LANG: Record<string, string> = {
  en: 'en-IN', hi: 'hi-IN', bn: 'bn-IN', ta: 'ta-IN', te: 'te-IN', mr: 'mr-IN', gu: 'gu-IN',
  kn: 'kn-IN', ml: 'ml-IN', pa: 'pa-IN', or: 'or-IN', as: 'as-IN', ur: 'ur-IN',
};

interface SpeechRec { lang: string; interimResults: boolean; maxAlternatives: number; start(): void; stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null }
type SpeechCtor = new () => SpeechRec;
function getCtor(): SpeechCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
export const micSupported = (): boolean => getCtor() !== null;

/** onText receives the recognised phrase; the caller decides to set or append. */
export function MicButton({ onText, title = 'Speak instead of typing' }: { onText: (text: string) => void; title?: string }) {
  const [on, setOn] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const Ctor = getCtor();
  if (!Ctor) return null;

  const start = () => {
    try {
      const rec = new Ctor();
      rec.lang = SR_LANG[getLang()] ?? 'en-IN';
      rec.interimResults = false; rec.maxAlternatives = 1;
      rec.onresult = (e) => { const t = e.results?.[0]?.[0]?.transcript; if (t) onText(t.trim()); };
      rec.onend = () => setOn(false);
      rec.onerror = () => setOn(false);
      recRef.current = rec; rec.start(); setOn(true);
    } catch { setOn(false); }
  };
  const stop = () => { try { recRef.current?.stop(); } catch { /* */ } setOn(false); };

  return (
    <button type="button" className={'mic-btn' + (on ? ' mic-btn--on' : '')} title={title} aria-label={title} aria-pressed={on} onClick={() => (on ? stop() : start())}>
      {on ? '●' : '🎤'}
    </button>
  );
}
