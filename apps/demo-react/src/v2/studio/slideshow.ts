/**
 * Memory-video (photo slideshow) engine — the pure timing + motion maths behind
 * turning a set of photos into a wedding/birthday-style video: each photo is
 * shown for a beat with a slow "Ken Burns" pan-zoom (so stills feel alive), then
 * crossfades into the next. All deterministic and unit-tested; the canvas
 * drawing, image decoding and encoding live in slideshowEncode.ts / the modal.
 */

export type SlideTransition = 'cross' | 'cut' | 'slide';

/** A photo's Ken Burns move: start/end zoom and pan centre (fractions 0..1). */
export interface KenBurns {
  fromScale: number; toScale: number;
  fromCx: number; toCx: number;
  fromCy: number; toCy: number;
  /** Slide direction for the 'slide' transition INTO this photo (dx in [-1,1]). */
  slideDx: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * A varied-but-deterministic Ken Burns move for photo `i`: alternate zoom-in /
 * zoom-out and pan direction so consecutive photos don't feel repetitive. Kept
 * subtle (≤ ~12% zoom) so faces never crop awkwardly.
 */
export function kenBurnsFor(i: number): KenBurns {
  const zoomIn = i % 2 === 0;
  const panRight = i % 4 < 2;
  const cyLow = i % 3 === 0;
  return {
    fromScale: zoomIn ? 1.0 : 1.12,
    toScale: zoomIn ? 1.12 : 1.0,
    fromCx: panRight ? 0.38 : 0.62,
    toCx: panRight ? 0.62 : 0.38,
    fromCy: 0.5,
    toCy: cyLow ? 0.44 : 0.56,
    slideDx: i % 2 === 0 ? 1 : -1,
  };
}

/**
 * Scale a Ken Burns move's intensity around its neutral (scale 1, centre 0.5):
 * factor 0 → a still, centred photo; 1 → exactly as authored; >1 → livelier.
 * Scales stay ≥ 1 so the photo always covers the frame (no gaps). Pure.
 */
export function scaleKenBurns(kb: KenBurns, factor: number): KenBurns {
  const f = Math.max(0, factor);
  const s = (v: number): number => Math.max(1, 1 + (v - 1) * f);
  const c = (v: number): number => 0.5 + (v - 0.5) * f;
  return {
    fromScale: s(kb.fromScale), toScale: s(kb.toScale),
    fromCx: c(kb.fromCx), toCx: c(kb.toCx),
    fromCy: c(kb.fromCy), toCy: c(kb.toCy),
    slideDx: kb.slideDx,
  };
}

/** The zoom + pan centre at progress `p` (0 = start of the photo, 1 = end). */
export function kenBurnsAt(kb: KenBurns, p: number): { scale: number; cx: number; cy: number } {
  const t = clamp01(p);
  return { scale: lerp(kb.fromScale, kb.toScale, t), cx: lerp(kb.fromCx, kb.toCx, t), cy: lerp(kb.fromCy, kb.toCy, t) };
}

export interface SlideshowPlanOpts {
  /** Number of photos. */
  photos: number;
  /** Seconds each photo is on screen (before the crossfade). */
  perPhotoSec: number;
  fps: number;
  transition: SlideTransition;
  /** Crossfade / slide length between photos, seconds (ignored for 'cut'). */
  crossSec?: number;
  /** Safety cap on total frames (default 5400 = 3 min at 30fps). */
  maxFrames?: number;
}

export type SlideFrame =
  /** Show photo `index` at Ken Burns progress `p` (0..1). */
  | { kind: 'photo'; index: number; p: number }
  /** Transition from `from` (progress ~1) into `to` (progress ~0), blend `mix` 0→1. */
  | { kind: 'trans'; from: number; to: number; mix: number; pFrom: number; pTo: number };

/** Frame-by-frame plan for the whole slideshow, in order. */
export function slideshowPlan(o: SlideshowPlanOpts): SlideFrame[] {
  const fps = Math.max(1, o.fps);
  const hold = Math.max(1, Math.round(o.perPhotoSec * fps));
  const cross = o.transition === 'cut' ? 0 : Math.max(1, Math.round((o.crossSec ?? 0.7) * fps));
  const cap = Math.max(1, o.maxFrames ?? 5400);
  const n = Math.max(0, o.photos);
  const out: SlideFrame[] = [];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < hold; k++) out.push({ kind: 'photo', index: i, p: hold === 1 ? 1 : k / (hold - 1) });
    if (i < n - 1 && cross > 0) {
      for (let k = 0; k < cross; k++) {
        const mix = (k + 1) / (cross + 1);
        out.push({ kind: 'trans', from: i, to: i + 1, mix, pFrom: 1, pTo: mix });
      }
    }
    if (out.length > cap) break;
  }
  return out.length > cap ? out.slice(0, cap) : out;
}

/** Wall-clock length of a plan in seconds. */
export const slideshowSeconds = (frames: number, fps: number): number => frames / Math.max(1, fps);

/** Total length for `photos` at `perPhotoSec` with `crossSec` transitions —
 *  used to size music and show the length before rendering. */
export function slideshowDuration(photos: number, perPhotoSec: number, transition: SlideTransition, crossSec = 0.7): number {
  if (photos <= 0) return 0;
  const cross = transition === 'cut' ? 0 : crossSec;
  return photos * perPhotoSec + (photos - 1) * cross;
}
