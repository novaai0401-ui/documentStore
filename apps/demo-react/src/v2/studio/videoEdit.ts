/**
 * Video editor logic — the pure timeline maths behind the multi-clip editor:
 * several trimmed clips play back-to-back into one movie, with timed text
 * overlays and optional music. All the browser glue (video elements, canvas,
 * MediaRecorder) lives in the modal; everything here is deterministic and
 * unit-tested.
 */

export type ClipLook = 'none' | 'bw' | 'warm' | 'cool' | 'bright';

/** Canvas-filter string for each look, applied when the clip's frames draw. */
export const LOOK_FILTERS: Record<ClipLook, string> = {
  none: 'none',
  bw: 'grayscale(1)',
  warm: 'sepia(0.35) saturate(1.3)',
  cool: 'hue-rotate(-12deg) saturate(1.15) brightness(1.02)',
  bright: 'brightness(1.15) contrast(1.05)',
};

export interface EditClip {
  id: string;
  name: string;
  /** Full source duration, seconds. */
  duration: number;
  /** Trim window within the source, seconds. */
  inS: number;
  outS: number;
  /** Playback speed (0.5 = slow motion, 2 = fast). Default 1. */
  speed?: number;
  /** Colour treatment applied to this clip's frames. Default 'none'. */
  look?: ClipLook;
  /** This clip's own sound level 0…1 (0 mutes just this clip). Default 1. */
  volume?: number;
}

/** Effective speed — guards zero/negative/missing values. */
export const clipSpeed = (c: Pick<EditClip, 'speed'>): number => (c.speed && c.speed > 0 ? c.speed : 1);

/** Effective volume 0…1 — missing means full volume. */
export const clipVolume = (c: Pick<EditClip, 'volume'>): number =>
  c.volume === undefined ? 1 : Math.max(0, Math.min(1, c.volume));

/** Where a clip's source should sample at movie-time `t` given the clip's
 *  movie `start` — clamped inside the trim window, so a clip can "hold" its
 *  first/last frame while a transition plays across its boundary. */
export function clipSourceAt(c: EditClip, start: number, t: number): number {
  const src = c.inS + (t - start) * clipSpeed(c);
  return Math.max(c.inS, Math.min(Math.max(c.inS, c.outS - 0.001), src));
}

/** Crossfade window at a clip seam: within `fadeSec` around each boundary,
 *  returns the outgoing/incoming clip indices and the blend 0→1 (0 = all
 *  outgoing). Null when `t` is not inside any seam window. */
export function seamBlend(clips: Pick<EditClip, 'inS' | 'outS' | 'speed'>[], t: number, fadeSec: number): { from: number; to: number; mix: number } | null {
  if (fadeSec <= 0 || clips.length < 2) return null;
  const starts = clipStarts(clips);
  for (let i = 1; i < starts.length; i++) {
    const s = starts[i]!;
    // Never blend wider than either neighbour's own length.
    const f = Math.min(fadeSec, clipLength(clips[i - 1]!), clipLength(clips[i]!));
    if (f <= 0) continue;
    if (t >= s - f / 2 && t < s + f / 2) {
      return { from: i - 1, to: i, mix: Math.max(0, Math.min(1, (t - (s - f / 2)) / f)) };
    }
  }
  return null;
}

/** Black-overlay opacity for a fade-in/out at movie-time `t` (0 = no fade).
 *  Fully dark at the very start/end, clear in the middle; degrades sanely
 *  when the movie is shorter than two fades. */
export function fadeAlpha(t: number, total: number, fadeSec: number): number {
  if (fadeSec <= 0 || total <= 0) return 0;
  const f = Math.min(fadeSec, total / 2);
  if (t < f) return Math.max(0, Math.min(1, 1 - t / f));
  if (t > total - f) return Math.max(0, Math.min(1, (t - (total - f)) / f));
  return 0;
}

export type OverlayPos = 'top' | 'middle' | 'bottom';

export interface TextOverlay {
  id: string;
  text: string;
  /** Visible window on the FINAL movie's timeline, seconds. */
  startS: number;
  endS: number;
  pos: OverlayPos;
  /** Free placement (centre of the text) as fractions of width/height, 0–1.
   *  When set (e.g. after a drag), overrides `pos`. */
  fx?: number;
  fy?: number;
  /** Font size as a fraction of the output height (resolution-independent). */
  sizeFrac: number;
  color: string;
}

/** On-screen length of one clip: the trim window divided by its speed. */
export const clipLength = (c: Pick<EditClip, 'inS' | 'outS' | 'speed'>): number =>
  Math.max(0, (c.outS - c.inS) / clipSpeed(c));

/** Total movie length: the trimmed clips back-to-back. */
export const totalDuration = (clips: Pick<EditClip, 'inS' | 'outS' | 'speed'>[]): number =>
  clips.reduce((sum, c) => sum + clipLength(c), 0);

/** Clamp a clip's trim window to its own duration, keeping in ≤ out. */
export function clampClip<T extends EditClip>(c: T): T {
  const inS = Math.min(Math.max(0, c.inS), c.duration);
  const outS = Math.min(Math.max(inS, c.outS), c.duration);
  return { ...c, inS, outS };
}

/** Which clip is playing at movie-time `t`, and where within its source.
 *  Returns null past the end (or for an empty timeline). */
export function clipAt(clips: EditClip[], t: number): { index: number; sourceTime: number } | null {
  if (t < 0) return null;
  let acc = 0;
  for (let i = 0; i < clips.length; i++) {
    const len = clipLength(clips[i]!);
    // Movie time advances 1s per second; source time advances `speed` per second.
    if (t < acc + len) return { index: i, sourceTime: clips[i]!.inS + (t - acc) * clipSpeed(clips[i]!) };
    acc += len;
  }
  return null;
}

/** Movie-time at which each clip starts (cumulative trimmed lengths). */
export const clipStarts = (clips: Pick<EditClip, 'inS' | 'outS' | 'speed'>[]): number[] => {
  const out: number[] = []; let acc = 0;
  for (const c of clips) { out.push(acc); acc += clipLength(c); }
  return out;
};

/** Source sampling times for an exact `frameCount`-frame export at `fps`:
 *  each output frame samples the movie at its midpoint, so the file's length
 *  is exactly frameCount/fps with no boundary duplicates. */
export function frameSourceTimes(clips: EditClip[], fps: number, frameCount: number): ({ index: number; sourceTime: number } | null)[] {
  return Array.from({ length: Math.max(0, frameCount) }, (_, i) => clipAt(clips, (i + 0.5) / fps));
}

/** Reorder: move item `i` by `dir` (−1 up / +1 down), returning a new array. */
export function moveItem<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (i < 0 || i >= arr.length || j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/** An image/logo/photo laid over the footage for a time window. The picture
 *  itself (an HTMLImageElement) is held by the modal, keyed by `id`. */
export interface ImageOverlay {
  id: string;
  /** Visible window on the FINAL movie's timeline, seconds. */
  startS: number;
  endS: number;
  /** Vertical placement; always centred horizontally. Overridden by fx/fy. */
  pos: OverlayPos;
  /** Free placement (centre of the image) as fractions of width/height, 0–1.
   *  When set (e.g. after a drag), overrides `pos`. */
  fx?: number;
  fy?: number;
  /** Width as a fraction of the output width (height keeps the image's ratio). */
  sizeFrac: number;
}

/** Overlays visible at movie-time `t` (inclusive start, exclusive end). */
export const overlaysAt = (ovs: TextOverlay[], t: number): TextOverlay[] =>
  ovs.filter((o) => t >= o.startS && t < o.endS && o.text.trim() !== '');

/** Image overlays visible at movie-time `t` (inclusive start, exclusive end).
 *  Generic so callers keep their richer type (e.g. the loaded HTMLImageElement). */
export const imageOverlaysAt = <T extends ImageOverlay>(ovs: T[], t: number): T[] =>
  ovs.filter((o) => t >= o.startS && t < o.endS);

/** Top-left box for an image overlay of `dw×dh` in a `w×h` output. Free
 *  placement (fx/fy = centre fractions) wins; otherwise centred horizontally
 *  with `pos` picking top / middle / bottom. Always clamped inside the frame. */
export function imageBox(pos: OverlayPos, w: number, h: number, dw: number, dh: number, fx?: number, fy?: number): { x: number; y: number } {
  if (fx !== undefined && fy !== undefined) {
    const x = Math.round(fx * w - dw / 2), y = Math.round(fy * h - dh / 2);
    return { x: Math.max(0, Math.min(w - dw, x)), y: Math.max(0, Math.min(h - dh, y)) };
  }
  const margin = Math.round(h * 0.06);
  const x = Math.round((w - dw) / 2);
  if (pos === 'top') return { x, y: margin };
  if (pos === 'bottom') return { x, y: Math.round(h - dh - margin) };
  return { x, y: Math.round((h - dh) / 2) };
}

/** Baseline Y for an overlay position in an output `h` pixels tall. */
export function overlayY(pos: OverlayPos, h: number, fontPx: number): number {
  switch (pos) {
    case 'top': return Math.round(fontPx * 1.4);
    case 'middle': return Math.round(h / 2 + fontPx * 0.35);
    case 'bottom': default: return Math.round(h - fontPx * 0.8);
  }
}

/** Centre point (x,y) for a TEXT overlay: free placement when fx/fy are set,
 *  else horizontally centred at the `pos` baseline. Clamped inside the frame. */
export function textPoint(o: Pick<TextOverlay, 'pos' | 'fx' | 'fy'>, w: number, h: number, fontPx: number): { x: number; y: number } {
  if (o.fx !== undefined && o.fy !== undefined) {
    return { x: Math.max(0, Math.min(w, Math.round(o.fx * w))), y: Math.max(fontPx, Math.min(h, Math.round(o.fy * h))) };
  }
  return { x: Math.round(w / 2), y: overlayY(o.pos, h, fontPx) };
}

let seq = 0;
/** Cheap unique id for clips/overlays within one session. */
export const editId = (): string => `ve${Date.now().toString(36)}${(seq++).toString(36)}`;
