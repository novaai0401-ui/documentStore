/**
 * Video Studio core — trim, compress/convert, extract audio and make GIFs from
 * a local video, 100% in the browser. Uses native <video> + captureStream +
 * MediaRecorder for clips/audio (real-time re-encode, no server, no heavy wasm)
 * and the bundled gifenc for GIFs. Pure helpers here (trim/scale/frame-timing);
 * the capture pipeline + UI live in VideoStudioModal.
 */
import { scaledDimensions } from './compress.js';

/** Clamp a requested in/out (seconds) to a valid sub-range of [0, duration]. */
export function clampTrim(inS: number, outS: number, duration: number): { in: number; out: number } {
  const d = Number.isFinite(duration) && duration > 0 ? duration : 0;
  let a = Math.max(0, Math.min(inS, d));
  let b = Math.max(0, Math.min(outS, d));
  if (b <= a) b = Math.min(d, a + 0.1);
  return { in: a, out: b };
}

/** Even-numbered output size capped to maxW longest side (encoders prefer even dims). */
export function videoScale(w: number, h: number, maxW: number): { w: number; h: number } {
  const s = scaledDimensions(w, h, maxW);
  return { w: Math.max(2, s.w - (s.w % 2)), h: Math.max(2, s.h - (s.h % 2)) };
}

/** Frame timestamps (seconds) to sample for a GIF over [inS,outS] at fps (capped). */
export function gifFrameTimes(inS: number, outS: number, fps: number, maxFrames = 300): number[] {
  const span = Math.max(0, outS - inS);
  const f = Math.max(1, Math.min(30, fps));
  const count = Math.max(1, Math.min(maxFrames, Math.round(span * f)));
  const step = span / count;
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(inS + i * step);
  return out;
}

/** GIF inter-frame delay in centiseconds (gifenc unit) for a given fps. */
export const gifDelayCs = (fps: number): number => Math.max(2, Math.round(100 / Math.max(1, Math.min(30, fps))));

export type VideoAspect = 'source' | '9:16' | '1:1' | '16:9';

/** Target width/height ratio for an aspect choice. */
export function aspectRatio(a: VideoAspect, srcW: number, srcH: number): number {
  if (a === '9:16') return 9 / 16;
  if (a === '1:1') return 1;
  if (a === '16:9') return 16 / 9;
  return srcH > 0 ? srcW / srcH : 1;
}

/** Even output dimensions for an aspect, longest side capped to maxW. */
export function outputDims(srcW: number, srcH: number, a: VideoAspect, maxW: number): { w: number; h: number } {
  const ratio = aspectRatio(a, srcW, srcH);
  let w: number, h: number;
  if (ratio >= 1) { w = Math.min(maxW, Math.round(srcW)); h = Math.round(w / ratio); }
  else { h = Math.min(maxW, Math.round(srcH)); w = Math.round(h * ratio); }
  const even = (n: number) => Math.max(2, n - (n % 2));
  return { w: even(w), h: even(h) };
}

/** Center cover-crop: the source rect to sample so it fills outW×outH without distortion. */
export function coverSrcRect(srcW: number, srcH: number, outW: number, outH: number): { sx: number; sy: number; sw: number; sh: number } {
  const scale = Math.max(outW / srcW, outH / srcH);
  const sw = outW / scale, sh = outH / scale;
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}
