/**
 * Design animation — turn a static design into a short animated clip by giving
 * each element a staggered entrance (fade / rise / slide / pop). Pure and
 * deterministic: `frameDesign` returns the Design as it looks at a given global
 * progress (0→1), which the exporter rasterizes frame-by-frame into a GIF. No
 * model, nothing uploaded. Unit-tested; the canvas/GIF glue lives in the modal.
 */
import type { Design, Element, ElementMotion } from './model.js';

export type AnimPreset = 'fade' | 'rise' | 'slide-left' | 'pop' | 'zoom';
export const ANIM_PRESETS: { id: AnimPreset; label: string }[] = [
  { id: 'fade', label: 'Fade in' },
  { id: 'rise', label: 'Rise up' },
  { id: 'slide-left', label: 'Slide in' },
  { id: 'pop', label: 'Pop' },
  { id: 'zoom', label: 'Zoom (cinematic)' },
];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);

/**
 * Local 0→1 progress for element `i` of `count`, given global progress `g`.
 * `stagger` (0→1) is the fraction of the timeline spent spreading element starts;
 * the rest is each element's own animation window.
 */
export function elementProgress(g: number, i: number, count: number, stagger = 0.4): number {
  const start = count > 1 ? (i / count) * stagger : 0;
  const dur = Math.max(0.0001, 1 - stagger);
  return clamp01((g - start) / dur);
}

export interface FrameDelta { opacity: number; dx: number; dy: number; scale: number }
/** The visual offset for a preset at eased progress `p` (1 = at rest). */
export function presetDelta(preset: AnimPreset, p: number, w: number, h: number): FrameDelta {
  const e = easeOutCubic(p);
  switch (preset) {
    case 'rise': return { opacity: e, dx: 0, dy: (1 - e) * h * 0.08, scale: 1 };
    case 'slide-left': return { opacity: e, dx: (1 - e) * w * 0.14, dy: 0, scale: 1 };
    case 'pop': return { opacity: e, dx: 0, dy: 0, scale: 0.6 + 0.4 * e };
    // Settles from slightly oversized — the slow "Ken Burns" push-in feel.
    case 'zoom': return { opacity: e, dx: 0, dy: 0, scale: 1.18 - 0.18 * e };
    case 'fade': default: return { opacity: e, dx: 0, dy: 0, scale: 1 };
  }
}

export interface MotionDelta { dx: number; dy: number; scale: number; rot: number }
/** Continuous looping motion for one element at raw cycle `phase` (in turns —
 *  integer phase = one full loop). Matches the CSS keyframes in MOTION_CSS so
 *  the editor preview and the baked export agree. */
export function motionDelta(motion: ElementMotion | undefined, phase: number, w: number, h: number): MotionDelta {
  if (!motion) return { dx: 0, dy: 0, scale: 1, rot: 0 };
  const s = Math.sin(2 * Math.PI * phase);
  switch (motion) {
    case 'bounce': return { dx: 0, dy: -h * 0.09 * Math.abs(Math.sin(Math.PI * phase)), scale: 1, rot: 0 };
    case 'float': return { dx: 0, dy: h * 0.04 * s, scale: 1, rot: 0 };
    case 'spin': return { dx: 0, dy: 0, scale: 1, rot: 360 * (phase - Math.floor(phase)) };
    case 'pulse': return { dx: 0, dy: 0, scale: 1 + 0.14 * (0.5 - 0.5 * Math.cos(2 * Math.PI * phase)), rot: 0 };
    case 'wobble': return { dx: 0, dy: 0, scale: 1, rot: 7 * s };
    case 'shake': return { dx: w * 0.03 * Math.sin(2 * Math.PI * phase * 4), dy: 0, scale: 1, rot: 0 };
    case 'beat': { const b = Math.max(0, Math.sin(Math.PI * ((phase * 2) % 1))); return { dx: 0, dy: 0, scale: 1 + 0.16 * b * b, rot: 0 }; }
    default: return { dx: 0, dy: 0, scale: 1, rot: 0 };
  }
}

/** The design as it appears at entrance progress `g` (0→1) under a preset.
 *  `motionPhase` (in turns) drives continuous element motion INDEPENDENTLY of
 *  `g`, so looping emoji keep moving during the entrance-finished "hold". */
export function frameDesign(d: Design, g: number, preset: AnimPreset = 'fade', stagger = 0.4, motionPhase = 0): Design {
  const count = d.elements.length;
  const elements = d.elements.map((el, i): Element => {
    const p = elementProgress(g, i, count, stagger);
    const ent = presetDelta(preset, p, el.w, el.h);
    const mo = motionDelta(el.motion, motionPhase * (el.motionSpeed && el.motionSpeed > 0 ? el.motionSpeed : 1), el.w, el.h);
    const scale = ent.scale * mo.scale;
    const dx = ent.dx + mo.dx, dy = ent.dy + mo.dy;
    const nw = el.w * scale, nh = el.h * scale;
    return { ...el, x: el.x + dx + (el.w - nw) / 2, y: el.y + dy + (el.h - nh) / 2, w: nw, h: nh, opacity: ent.opacity, rotation: (el.rotation ?? 0) + mo.rot } as Element;
  });
  return { ...d, elements };
}

/** Evenly spaced global-progress samples across `frames` (0 … 1 inclusive). */
export function progressSamples(frames: number): number[] {
  if (frames <= 1) return [1];
  return Array.from({ length: frames }, (_, i) => i / (frames - 1));
}
