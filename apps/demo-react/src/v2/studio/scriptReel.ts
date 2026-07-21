/**
 * Script → reel — turn typed words into a captioned text-video, so "I have no
 * footage" is never a blocker. Pure planning here: split a script into scenes,
 * give each a duration from how long it takes to say, and a colour from the
 * chosen style. Canvas drawing + encoding live in scriptReelEncode.ts.
 */
import { splitScript, speakSeconds } from './captions.js';

/** Decorative background layer drawn behind the caption — hand-drawn doodles,
 *  confetti, ruled paper, soft bokeh — so a reel looks designed, not like a flat
 *  colour block. Rendered procedurally on canvas (no image assets). */
export type ScriptPattern = 'none' | 'doodle' | 'confetti' | 'notebook' | 'bokeh' | 'stars' | 'bubbles';

export interface ScriptStyle {
  id: string;
  label: string;
  icon: string;
  /** Background gradient stops, cycled per scene. */
  colors: [string, string][];
  /** Text colour. */
  fg: string;
  /** Canvas font family. */
  font: string;
  /** Decorative pattern drawn behind the text (default 'none'). */
  pattern?: ScriptPattern;
  /** Stroke/fill colour for the pattern (a translucent tint reads best). */
  patternColor?: string;
}

export const SCRIPT_STYLES: ScriptStyle[] = [
  // 'auto' picks each scene's gradient from what that line is ABOUT (see MOODS),
  // so the background carries the message instead of being one flat colour.
  { id: 'auto', label: 'Auto — match my words', icon: '✨', fg: '#ffffff', font: "'Archivo', 'Inter', system-ui, sans-serif",
    colors: [['#111827', '#1f2937'], ['#4c1d95', '#6d28d9'], ['#0f766e', '#0d9488'], ['#9d174d', '#be185d']], pattern: 'stars', patternColor: 'rgba(255,255,255,0.16)' },
  { id: 'doodle', label: 'Doodle sketch', icon: '✏️', fg: '#1f2937', font: "'Segoe Script', 'Comic Sans MS', 'Bradley Hand', cursive",
    colors: [['#fef9c3', '#fde68a'], ['#dbeafe', '#bfdbfe'], ['#fce7f3', '#fbcfe8'], ['#dcfce7', '#bbf7d0']], pattern: 'doodle', patternColor: 'rgba(31,41,55,0.5)' },
  { id: 'confetti-pop', label: 'Confetti pop', icon: '🎊', fg: '#ffffff', font: "'Archivo', 'Inter', system-ui, sans-serif",
    colors: [['#312e81', '#4338ca'], ['#831843', '#be185d'], ['#134e4a', '#0f766e'], ['#7c2d12', '#c2410c']], pattern: 'confetti', patternColor: 'rgba(255,255,255,0.9)' },
  { id: 'notebook', label: 'Notebook', icon: '📓', fg: '#1e293b', font: "'Segoe Script', 'Comic Sans MS', cursive",
    colors: [['#fffef7', '#fdf6e3'], ['#f8fafc', '#f1f5f9']], pattern: 'notebook', patternColor: 'rgba(59,130,246,0.35)' },
  { id: 'dreamy', label: 'Dreamy bokeh', icon: '🌌', fg: '#ffffff', font: "'Archivo', 'Inter', system-ui, sans-serif",
    colors: [['#1e1b4b', '#4c1d95'], ['#0c4a6e', '#0369a1'], ['#4a044e', '#86198f']], pattern: 'bokeh', patternColor: 'rgba(255,255,255,0.5)' },
  { id: 'bold', label: 'Bold', icon: '⚡', fg: '#ffffff', font: "'Archivo', 'Inter', system-ui, sans-serif",
    colors: [['#111827', '#1f2937'], ['#4c1d95', '#6d28d9'], ['#0f766e', '#0d9488'], ['#9d174d', '#be185d']] },
  { id: 'sunset', label: 'Sunset', icon: '🌅', fg: '#ffffff', font: "'Archivo', 'Inter', system-ui, sans-serif",
    colors: [['#7c2d12', '#c2410c'], ['#9a3412', '#ea580c'], ['#831843', '#be185d'], ['#713f12', '#a16207']], pattern: 'bubbles', patternColor: 'rgba(255,255,255,0.14)' },
  { id: 'calm', label: 'Calm', icon: '🌊', fg: '#0f172a', font: 'Georgia, serif',
    colors: [['#e0f2fe', '#bae6fd'], ['#f0fdf4', '#dcfce7'], ['#faf5ff', '#f3e8ff'], ['#fff7ed', '#ffedd5']], pattern: 'bubbles', patternColor: 'rgba(15,23,42,0.08)' },
  { id: 'mono', label: 'Minimal', icon: '⬛', fg: '#ffffff', font: "'Inter', system-ui, sans-serif",
    colors: [['#000000', '#111111'], ['#111111', '#1c1c1c']] },
];

/** Optional decorative frame drawn on top of every scene. Purely canvas-drawn. */
export interface ScriptFrame { id: string; label: string; icon: string }
export const SCRIPT_FRAMES: ScriptFrame[] = [
  { id: 'none', label: 'No frame', icon: '⬜' },
  { id: 'thin', label: 'Thin border', icon: '▫️' },
  { id: 'double', label: 'Double line', icon: '🔲' },
  { id: 'corners', label: 'Corner marks', icon: '⌜' },
  { id: 'tape', label: 'Washi tape', icon: '🎀' },
  { id: 'dashed', label: 'Dashed', icon: '⭏' },
];
export const scriptFrameIds = new Set(SCRIPT_FRAMES.map((f) => f.id));

export const scriptStyleById = (id: string): ScriptStyle => SCRIPT_STYLES.find((s) => s.id === id) ?? SCRIPT_STYLES[0]!;

/**
 * Content-aware background moods. Each line of a script is matched against these
 * so its gradient reflects the words (a love line goes warm-pink, a success line
 * goes deep teal, …). Keeps the reel feeling designed, not templated.
 */
interface ScriptMood { id: string; test: RegExp; grad: [string, string][] }
const MOODS: ScriptMood[] = [
  { id: 'love', test: /\b(love|heart|valentine|romance|forever|dear|darling|kiss|together|soulmate|couple|wedding)\b/i,
    grad: [['#831843', '#be185d'], ['#9d174d', '#db2777'], ['#6d1a3a', '#e11d48']] },
  { id: 'celebrate', test: /\b(birthday|happy\s*b|celebrat|party|congrat|cheers|anniversar|wish|festiv|diwali|christmas|new\s*year)\b/i,
    grad: [['#6d28d9', '#9333ea'], ['#a16207', '#eab308'], ['#7c3aed', '#c026d3']] },
  { id: 'success', test: /\b(success|goal|hustle|win|grow|money|business|boss|dream|achieve|rich|invest|career|productiv)\b/i,
    grad: [['#0f766e', '#0d9488'], ['#111827', '#1f2937'], ['#155e75', '#0e7490']] },
  { id: 'calm', test: /\b(calm|peace|breathe|morning|gratitude|mindful|slow|rest|heal|relax|meditat|sleep|gentle)\b/i,
    grad: [['#0ea5e9', '#38bdf8'], ['#14b8a6', '#5eead4'], ['#3b82f6', '#60a5fa']] },
  { id: 'nature', test: /\b(nature|travel|mountain|ocean|beach|forest|sky|sunset|adventure|trip|explore|wander|road)\b/i,
    grad: [['#c2410c', '#ea580c'], ['#15803d', '#22c55e'], ['#b45309', '#f59e0b']] },
  { id: 'reflect', test: /\b(miss|loss|goodbye|memory|remember|grief|gone|lonely|regret|hard|struggle|fail)\b/i,
    grad: [['#334155', '#475569'], ['#1e293b', '#334155'], ['#3f3f46', '#52525b']] },
];
const DEFAULT_GRAD: [string, string][] = [['#111827', '#1f2937'], ['#4c1d95', '#6d28d9'], ['#0f766e', '#0d9488'], ['#9d174d', '#be185d']];

/** The gradient for a scene, chosen from the FIRST mood its text matches (index
 *  `i` varies the shade so repeats of one mood aren't identical). Pure. */
export function autoGradientFor(text: string, i: number): [string, string] {
  const mood = MOODS.find((m) => m.test.test(text));
  const grad = mood ? mood.grad : DEFAULT_GRAD;
  return grad[i % grad.length]!;
}

export interface ScriptScene {
  text: string;
  startS: number;
  endS: number;
  /** Background gradient for this scene. */
  bg: [string, string];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Break a script into timed scenes. Each caption-sized chunk becomes one scene
 * whose length is how long it takes to read (bounded to a comfortable range),
 * with a gradient cycled from the style. Empty script → [].
 */
export function buildScenes(script: string, styleId: string, opts: { minSec?: number; maxSec?: number; maxChars?: number } = {}): ScriptScene[] {
  const auto = styleId === 'auto';
  const style = scriptStyleById(styleId);
  const chunks = splitScript(script, opts.maxChars ?? 60);
  const minS = opts.minSec ?? 2, maxS = opts.maxSec ?? 6;
  const scenes: ScriptScene[] = [];
  let t = 0;
  chunks.forEach((text, i) => {
    const dur = clamp(speakSeconds(text) + 0.6, minS, maxS);
    const bg = auto ? autoGradientFor(text, i) : style.colors[i % style.colors.length]!;
    scenes.push({ text, startS: t, endS: t + dur, bg });
    t += dur;
  });
  return scenes;
}

/** Total length of the scene list, seconds. */
export const scenesDuration = (scenes: ScriptScene[]): number => (scenes.length ? scenes[scenes.length - 1]!.endS : 0);

/** The scene visible at movie-time `t` (last scene held past the end). */
export function sceneAt(scenes: ScriptScene[], t: number): ScriptScene | null {
  if (!scenes.length) return null;
  for (const s of scenes) if (t >= s.startS && t < s.endS) return s;
  return t >= scenes[scenes.length - 1]!.endS ? scenes[scenes.length - 1]! : scenes[0]!;
}
