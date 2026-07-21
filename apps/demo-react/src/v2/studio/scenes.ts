/**
 * Multi-scene animation plan — turn a multi-page design into a short video
 * where every page is a scene: elements animate in, the page holds, then it
 * hands over to the next page (crossfade or hard cut). Pure timing maths —
 * frameDesign/rasterizing/encoding glue stays in the modal. Unit-tested.
 */

export type SceneTransition = 'cross' | 'cut' | 'slide' | 'wipe' | 'zoom';

export type SceneFrame =
  /** Render page `page` at entrance progress 0→1 (1 = fully revealed). */
  | { kind: 'page'; page: number; progress: number }
  /** Crossfade: page `from` at rest blended with page `to`'s first frame. */
  | { kind: 'cross'; from: number; to: number; mix: number };

export interface ScenePlanOpts {
  /** Number of scenes (pages). */
  pages: number;
  fps: number;
  /** Entrance animation length per scene, seconds. */
  enterSec: number;
  /** Pause on the finished scene, seconds (default 1). */
  holdSec?: number;
  transition: SceneTransition;
  /** Crossfade length, seconds (default 0.6; ignored for 'cut'). */
  crossSec?: number;
  /** Safety cap so huge documents can't OOM the tab (default 3600 frames —
   *  4 minutes at 15fps, so multi-minute music videos fit comfortably). */
  maxFrames?: number;
}

/** Frame-by-frame plan for the whole multi-scene clip, in order. */
export function scenePlan(o: ScenePlanOpts): SceneFrame[] {
  const fps = Math.max(1, o.fps);
  const enter = Math.max(2, Math.round(o.enterSec * fps));
  const hold = Math.max(0, Math.round((o.holdSec ?? 1) * fps));
  // Every animated hand-over (crossfade, slide, wipe, zoom…) uses the same
  // mix ramp — HOW the two scenes combine at each mix is the compositor's job.
  const cross = o.transition !== 'cut' ? Math.max(1, Math.round((o.crossSec ?? 0.6) * fps)) : 0;
  const cap = Math.max(1, o.maxFrames ?? 3600);
  const out: SceneFrame[] = [];
  for (let p = 0; p < Math.max(0, o.pages); p++) {
    for (let i = 0; i < enter; i++) out.push({ kind: 'page', page: p, progress: i / (enter - 1) });
    for (let i = 0; i < hold; i++) out.push({ kind: 'page', page: p, progress: 1 });
    // Mixes stay strictly inside (0,1): the endpoints are already covered by the
    // hold frame before and the next scene's first entrance frame after.
    if (p < o.pages - 1 && cross > 0) {
      for (let i = 0; i < cross; i++) out.push({ kind: 'cross', from: p, to: p + 1, mix: (i + 1) / (cross + 1) });
    }
  }
  return out.length > cap ? out.slice(0, cap) : out;
}

/** Wall-clock length of a plan, seconds. */
export const planSeconds = (frames: number, fps: number): number => frames / Math.max(1, fps);
