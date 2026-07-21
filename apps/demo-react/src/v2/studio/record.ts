/**
 * Screen & webcam recorder core — capture the screen or camera with the native
 * getDisplayMedia / getUserMedia + MediaRecorder APIs and save a video, 100% in
 * the browser, nothing uploaded. Pure helpers here (mime negotiation, duration
 * formatting); the capture UI lives in RecorderModal.
 */

/** Candidate container/codec strings, best first. */
export const RECORDER_MIMES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm',
  'video/mp4',
];

/** Pick the first MediaRecorder mime the platform supports (injectable for tests). */
export function pickRecorderMime(isSupported: (m: string) => boolean, candidates: string[] = RECORDER_MIMES): string {
  for (const m of candidates) if (isSupported(m)) return m;
  return ''; // let MediaRecorder choose its default
}

/** The file extension for a chosen recorder mime. */
export function extForMime(mime: string): string {
  return /mp4/i.test(mime) ? 'mp4' : 'webm';
}

/** Seconds → m:ss (or h:mm:ss past an hour). */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
}
