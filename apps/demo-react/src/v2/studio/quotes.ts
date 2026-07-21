/**
 * Quote & motivation posters — the "independent", share-every-day templates
 * (WhatsApp status, Instagram stories, LinkedIn). A single data-driven generator
 * (`makeQuote`) turns a compact spec into a full Design that renders through the
 * same SVG path as everything else, so a new poster is ~8 lines of data.
 *
 * Coverage is deliberately broad and gender-aware — self-love & confidence for
 * women, discipline & hustle for men, plus faith, fitness, students, founders,
 * monthly "Hello <Month>" cards and everyday good-vibes — because these are the
 * posts people repost daily. Everything is a normal, draggable, editable element
 * (tap any word to retype it in any language), and each ships with an entrance
 * `anim` and a gently moving accent so the poster is alive the moment it opens.
 *
 * Dependency-light: imports only the model + the animation/motion enums and the
 * shared `StudioTemplate` *type* (type-only — no runtime import cycle).
 */
import { newElId, type Design, type TextEl, type ElementMotion } from './model.js';
import type { BackgroundEffect } from './effects.js';
import type { AnimPreset } from './animate.js';
import type { StudioTemplate } from './templates.js';

const SCRIPT = "'Segoe Script', 'Comic Sans MS', cursive";
const SERIF = 'Georgia, serif';
const SANS = 'Inter, system-ui, sans-serif';

const text = (o: Partial<TextEl> & { x: number; y: number; w: number; h: number; text: string }): TextEl => ({
  id: newElId(), type: 'text', size: 48, color: '#0f172a', font: SANS, weight: 700, align: 'center', rotation: 0, ...o,
});

const sticker = (emoji: string, x: number, y: number, size: number, motion?: ElementMotion, rotation = 0): TextEl =>
  text({ x, y, w: size * 1.3, h: size * 1.3, text: emoji, size, rotation, ...(motion ? { motion } : {}) });

interface QuoteSpec {
  id: string;
  name: string;
  icon: string;
  w?: number;
  h?: number;
  background: string;
  effect?: BackgroundEffect;
  anim?: AnimPreset;
  /** Concentric decorative rings behind the text (the "mandala"/halo look). */
  rings?: string;
  /** Elegant double border frame colour. */
  border?: string;
  /** Big centred hero emoji near the top. */
  hero?: string;
  heroMotion?: ElementMotion;
  /** Corner/scatter emoji with gentle motion. */
  scatter?: string[];
  eyebrow?: { text: string; color: string };
  /** The main line — the quote/statement. */
  quote: { text: string; color: string; font?: string; size?: number };
  subtitle?: { text: string; color: string };
  /** A small handle/author sign-off at the very bottom. */
  handle?: { text: string; color: string };
}

/** Concentric ring outlines centred behind the text — the soft "halo/mandala"
 *  backdrop that makes aesthetic quote posters feel designed. */
function decorRings(colour: string, w: number, h: number): Design['elements'] {
  const cx = w / 2, cy = h * 0.46;
  return [0, 1, 2].map((i) => {
    const d = Math.min(w, h) * (0.5 + i * 0.16);
    return { id: newElId(), type: 'ellipse' as const, x: cx - d / 2, y: cy - d / 2, w: d, h: d, fill: 'none', stroke: colour, strokeWidth: 2 };
  });
}

function scatterCorners(emojis: string[], w: number, h: number): TextEl[] {
  const motions: ElementMotion[] = ['float', 'wobble', 'pulse', 'float'];
  const spots: [number, number, number][] = [
    [70, 90, -12], [w - 190, 90, 12], [70, h - 210, -8], [w - 190, h - 210, 8],
  ];
  return emojis.slice(0, 4).map((e, i) => sticker(e, spots[i][0], spots[i][1], 96, motions[i % motions.length], spots[i][2]));
}

interface Line { text: string; color: string; size: number; font?: string; weight?: number; gap?: number }

function makeQuote(spec: QuoteSpec): Design {
  const w = spec.w ?? 1080;
  const h = spec.h ?? 1350;
  const cx = 80;
  const cw = w - 160;
  const els: Design['elements'] = [];

  if (spec.rings) els.push(...decorRings(spec.rings, w, h));
  if (spec.border) {
    els.push({ id: newElId(), type: 'rect', x: 50, y: 50, w: w - 100, h: h - 100, fill: 'none', stroke: spec.border, strokeWidth: 3, radius: 14 });
    els.push({ id: newElId(), type: 'rect', x: 66, y: 66, w: w - 132, h: h - 132, fill: 'none', stroke: spec.border, strokeWidth: 1.5, radius: 12 });
  }
  if (spec.scatter?.length) els.push(...scatterCorners(spec.scatter, w, h));

  if (spec.hero) {
    const heroSize = 150;
    els.push(sticker(spec.hero, (w - heroSize * 1.3) / 2, h * 0.15, heroSize, spec.heroMotion));
  }

  const lines: Line[] = [];
  if (spec.eyebrow) lines.push({ text: spec.eyebrow.text, color: spec.eyebrow.color, size: 34, weight: 800, gap: 20 });
  lines.push({ text: spec.quote.text, color: spec.quote.color, size: spec.quote.size ?? 78, weight: 900, font: spec.quote.font ?? SERIF, gap: 26 });
  if (spec.subtitle) lines.push({ text: spec.subtitle.text, color: spec.subtitle.color, size: 40, weight: 700, font: SCRIPT, gap: 22 });
  if (spec.handle) lines.push({ text: spec.handle.text, color: spec.handle.color, size: 30, weight: 600, gap: 0 });

  let y = spec.hero ? h * 0.4 : h * 0.32;
  lines.forEach((ln) => {
    const rows = ln.text.split('\n').length;
    const lineH = ln.size * 1.18;
    const boxH = Math.max(lineH * rows, ln.size + 8);
    els.push(text({ x: cx, y, w: cw, h: boxH, text: ln.text, size: ln.size, color: ln.color, weight: ln.weight ?? 700, font: ln.font ?? SANS }));
    y += boxH + (ln.gap ?? 20);
  });

  return { w, h, background: spec.background, ...(spec.effect ? { effect: spec.effect } : {}), elements: els };
}

const SPECS: QuoteSpec[] = [
  // ── Self-love & confidence (women) ───────────────────────────────────────
  {
    id: 'q-just-love-yourself', name: 'Just Love Yourself', icon: '💗', anim: 'rise', effect: 'flowers',
    background: '#fdeef2', rings: '#f6cdda', hero: '🎀', heroMotion: 'float', scatter: ['🌸', '💗', '🌷', '✨'],
    eyebrow: { text: 'DAILY REMINDER', color: '#be185d' },
    quote: { text: 'Just Love\nYourself', color: '#9d174d', font: SCRIPT, size: 96 },
    subtitle: { text: 'you are enough, exactly as you are', color: '#be185d' },
    handle: { text: '@yourhandle', color: '#db2777' },
  },
  {
    id: 'q-she-believed', name: 'She Believed She Could', icon: '👑', anim: 'fade', effect: 'sparkles',
    background: '#2a0a2e', rings: '#5a1f5f', hero: '👑', heroMotion: 'pulse', scatter: ['✨', '🌙', '💜', '⭐'],
    eyebrow: { text: 'QUEEN ENERGY', color: '#f0abfc' },
    quote: { text: 'She believed\nshe could,\nso she did', color: '#fce7f3', size: 72 },
    handle: { text: '@yourhandle', color: '#e879f9' },
  },
  {
    id: 'q-soft-strong', name: 'Soft yet Strong', icon: '🪷', anim: 'rise', effect: 'flowers',
    background: '#fff1f6', rings: '#fbcfe0', hero: '🪷', heroMotion: 'float', scatter: ['🌷', '🕊️', '🌸', '💫'],
    quote: { text: 'Soft heart,\nstrong spine', color: '#9d174d', font: SCRIPT, size: 84 },
    subtitle: { text: 'gentle is not weak', color: '#be185d' },
    handle: { text: '@yourhandle', color: '#db2777' },
  },

  // ── Discipline & hustle (men) ────────────────────────────────────────────
  {
    id: 'q-discipline', name: 'Discipline > Motivation', icon: '🔥', anim: 'zoom', effect: 'sparkles',
    background: '#0a0a0a', rings: '#262626', hero: '🔥', heroMotion: 'pulse', scatter: ['💪', '⚡', '🏋️', '⭐'],
    eyebrow: { text: 'NO EXCUSES', color: '#f59e0b' },
    quote: { text: 'Discipline\nbeats\nmotivation', color: '#fafafa', size: 78 },
    subtitle: { text: 'show up every single day', color: '#f59e0b' },
    handle: { text: '@yourhandle', color: '#a3a3a3' },
  },
  {
    id: 'q-grind', name: 'Trust the Grind', icon: '⚙️', anim: 'slide-left', effect: 'sparkles',
    background: '#0b1220', rings: '#1e2a44', hero: '⚙️', heroMotion: 'spin', scatter: ['📈', '💼', '🚀', '⚡'],
    eyebrow: { text: 'STAY HUNGRY', color: '#38bdf8' },
    quote: { text: 'Trust the\ngrind', color: '#e2e8f0', size: 90 },
    subtitle: { text: 'the work always pays off', color: '#38bdf8' },
    handle: { text: '@yourhandle', color: '#64748b' },
  },
  {
    id: 'q-alpha-focus', name: 'Stay Focused', icon: '🎯', anim: 'zoom', effect: 'sparkles',
    background: '#111827', rings: '#374151', hero: '🎯', heroMotion: 'pulse', scatter: ['🦁', '⚡', '🏆', '💯'],
    eyebrow: { text: 'EYES ON THE GOAL', color: '#fbbf24' },
    quote: { text: 'Stay low.\nStay focused.\nGet it done.', color: '#f9fafb', size: 66 },
    handle: { text: '@yourhandle', color: '#9ca3af' },
  },

  // ── Faith & positivity ───────────────────────────────────────────────────
  {
    id: 'q-blessed', name: 'Blessed & Grateful', icon: '🙏', anim: 'fade', effect: 'sparkles',
    background: '#0b1d3a', rings: '#16305a', hero: '🙏', heroMotion: 'pulse', scatter: ['✨', '🌟', '🕊️', '💫'],
    eyebrow: { text: 'GRATITUDE', color: '#fcd34d' },
    quote: { text: 'Blessed &\nGrateful', color: '#fef3c7', font: SERIF, size: 82 },
    subtitle: { text: 'count your blessings today', color: '#fbbf24' },
    handle: { text: '@yourhandle', color: '#93c5fd' },
  },
  {
    id: 'q-good-vibes', name: 'Good Vibes Only', icon: '🌈', anim: 'pop', effect: 'bubbles',
    background: '#ecfeff', rings: '#a5f3fc', hero: '🌈', heroMotion: 'bounce', scatter: ['☀️', '🌻', '🦋', '⭐'],
    quote: { text: 'Good Vibes\nOnly', color: '#0e7490', size: 92 },
    subtitle: { text: 'choose joy every day', color: '#0891b2' },
    handle: { text: '@yourhandle', color: '#06b6d4' },
  },
  {
    id: 'q-positive-mind', name: 'Positive Mind', icon: '🌻', anim: 'rise', effect: 'flowers',
    background: '#fffbeb', rings: '#fde68a', hero: '🌻', heroMotion: 'float', scatter: ['🌼', '☀️', '🐝', '✨'],
    quote: { text: 'Positive mind,\npositive life', color: '#b45309', font: SCRIPT, size: 78 },
    handle: { text: '@yourhandle', color: '#d97706' },
  },

  // ── Fitness & health ─────────────────────────────────────────────────────
  {
    id: 'q-gym', name: 'Gym Motivation', icon: '🏋️', anim: 'zoom', effect: 'sparkles',
    background: '#18181b', rings: '#3f3f46', hero: '🏋️', heroMotion: 'beat', scatter: ['💪', '🔥', '🥇', '⚡'],
    eyebrow: { text: 'NO PAIN NO GAIN', color: '#ef4444' },
    quote: { text: 'Sweat now,\nshine later', color: '#fafafa', size: 78 },
    handle: { text: '@yourhandle', color: '#a1a1aa' },
  },

  // ── Students & study ─────────────────────────────────────────────────────
  {
    id: 'q-study', name: 'Study Motivation', icon: '📚', anim: 'rise', effect: 'stars',
    background: '#0f172a', rings: '#1e293b', hero: '📚', heroMotion: 'float', scatter: ['✏️', '💡', '🎓', '⭐'],
    eyebrow: { text: 'FUTURE TOPPER', color: '#a5b4fc' },
    quote: { text: 'Dream.\nStudy.\nAchieve.', color: '#e0e7ff', size: 80 },
    subtitle: { text: 'one page at a time', color: '#818cf8' },
    handle: { text: '@yourhandle', color: '#64748b' },
  },

  // ── Founders & business ──────────────────────────────────────────────────
  {
    id: 'q-founder', name: 'Build It', icon: '🚀', anim: 'slide-left', effect: 'sparkles',
    background: '#052e2b', rings: '#0b4d47', hero: '🚀', heroMotion: 'float', scatter: ['💡', '📈', '⚡', '🏆'],
    eyebrow: { text: 'FOUNDER MODE', color: '#5eead4' },
    quote: { text: 'Ideas are\ncheap.\nExecution\nis everything.', color: '#ccfbf1', size: 58 },
    handle: { text: '@yourhandle', color: '#2dd4bf' },
  },

  // ── Monthly "Hello <Month>" (aesthetic covers) ───────────────────────────
  {
    id: 'q-hello-month', name: 'Hello New Month', icon: '🗓️', anim: 'rise', effect: 'flowers',
    background: '#fdeef2', rings: '#f6cdda', hero: '🌷', heroMotion: 'float', scatter: ['🌸', '💗', '🦋', '✨'],
    eyebrow: { text: 'A FRESH START', color: '#be185d' },
    quote: { text: 'Hello,\nNew Month', color: '#9d174d', font: SCRIPT, size: 88 },
    subtitle: { text: 'new goals, new blessings', color: '#be185d' },
    handle: { text: '@yourhandle', color: '#db2777' },
  },
  {
    id: 'q-new-week', name: 'New Week, New Goals', icon: '📆', anim: 'pop', effect: 'confetti',
    background: '#eef2ff', rings: '#c7d2fe', hero: '☕', heroMotion: 'wobble', scatter: ['✨', '📈', '💪', '⭐'],
    eyebrow: { text: 'MONDAY MOTIVATION', color: '#4338ca' },
    quote: { text: 'New week,\nnew goals', color: '#3730a3', size: 84 },
    subtitle: { text: 'let’s make it count', color: '#4f46e5' },
    handle: { text: '@yourhandle', color: '#6366f1' },
  },

  // ── Love & everyday ──────────────────────────────────────────────────────
  {
    id: 'q-love-quote', name: 'Love Quote', icon: '❤️', anim: 'fade', effect: 'hearts',
    background: '#4c0519', rings: '#7f1d3a', hero: '💞', heroMotion: 'beat', scatter: ['🌹', '💕', '💌', '✨'],
    quote: { text: 'You are my\nfavourite\nhello', color: '#fecdd3', font: SCRIPT, size: 80 },
    subtitle: { text: 'and my hardest goodbye', color: '#fda4af' },
    handle: { text: '@yourhandle', color: '#fb7185' },
  },
  {
    id: 'q-attitude', name: 'Attitude', icon: '😎', anim: 'zoom', effect: 'sparkles',
    background: '#0a0a0a', rings: '#404040', hero: '😎', heroMotion: 'pulse', scatter: ['🔥', '💯', '⚡', '🖤'],
    eyebrow: { text: 'BE YOU', color: '#facc15' },
    quote: { text: 'Be a voice,\nnot an echo', color: '#fafafa', size: 76 },
    handle: { text: '@yourhandle', color: '#a3a3a3' },
  },
];

/** Studio templates for the "Quotes" category, generated from the specs above. */
export const QUOTE_TEMPLATES: StudioTemplate[] = SPECS.map((spec) => ({
  id: spec.id,
  name: spec.name,
  icon: spec.icon,
  category: 'Quotes',
  anim: spec.anim,
  make: () => makeQuote(spec),
}));
