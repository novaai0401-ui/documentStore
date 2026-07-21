/**
 * Reels — ready-made vertical 9:16 video posts (Instagram Reels / TikTok /
 * YouTube Shorts / WhatsApp Status).
 *
 * A reel here is a normal animated Design at 1080×1920: a bold content stack
 * (kicker → headline → body → call-to-action pill), animated emoji stickers and
 * a drifting background effect, with an entrance `anim` the exporter defaults
 * to. Open one, retype the words in any language, drop a photo on the slot, then
 * hit **Animate → WebM/GIF** to get a looping reel — no video editing, no
 * timeline. Same single SVG render path as every other design.
 *
 * Data-driven like greetingCards.ts, and deliberately dependency-light: it
 * imports only the model + the animation/effect enums and the `StudioTemplate`
 * *type* (type-only, so there's no runtime import cycle with templates.ts).
 */
import { newElId, photoSlot, type Design, type TextEl, type ElementMotion } from './model.js';
import type { BackgroundEffect } from './effects.js';
import type { AnimPreset } from './animate.js';
import type { StudioTemplate } from './templates.js';

const W = 1080;
const H = 1920;
const SANS = 'Inter, system-ui, sans-serif';
const COND = "'Archivo', 'Inter', system-ui, sans-serif";

const text = (o: Partial<TextEl> & { x: number; y: number; w: number; h: number; text: string }): TextEl => ({
  id: newElId(), type: 'text', size: 56, color: '#ffffff', font: SANS, weight: 800, align: 'center', rotation: 0, ...o,
});

const sticker = (emoji: string, x: number, y: number, size: number, motion?: ElementMotion, rotation = 0): TextEl =>
  text({ x, y, w: size * 1.3, h: size * 1.3, text: emoji, size, rotation, ...(motion ? { motion } : {}) });

interface ReelSpec {
  id: string;
  name: string;
  icon: string;
  background: string;
  effect?: BackgroundEffect;
  anim?: AnimPreset;
  /** Small label above the headline (category / hook). */
  kicker?: { text: string; color: string };
  /** The big headline — the whole point of the reel. */
  headline: { text: string; color: string; size?: number; font?: string };
  /** Supporting line(s). */
  body?: { text: string; color: string };
  /** Bottom call-to-action pill (e.g. "Link in bio", "50% OFF"). */
  cta?: { text: string; fill: string; color: string };
  /** A framed photo slot — set to place a tap-to-replace image. */
  photo?: { y: number; h: number };
  /** Corner/scatter emoji with gentle looping motion. */
  scatter?: string[];
  /** Big hero emoji under the headline area (skip when a photo is used). */
  hero?: string;
  heroMotion?: ElementMotion;
  /** Handle / footer line at the very bottom (e.g. @yourbrand). */
  handle?: { text: string; color: string };
}

/** Scatter emoji along the top and bottom margins, lively from frame one. */
function scatterEdges(emojis: string[]): TextEl[] {
  const motions: ElementMotion[] = ['float', 'wobble', 'pulse', 'float'];
  const spots: [number, number, number][] = [
    [70, 120, -12], [W - 200, 120, 12], [70, H - 320, -8], [W - 200, H - 320, 8],
  ];
  return emojis.slice(0, 4).map((e, i) => sticker(e, spots[i][0], spots[i][1], 110, motions[i % motions.length], spots[i][2]));
}

function makeReel(spec: ReelSpec): Design {
  const els: Design['elements'] = [];
  const cx = 90;
  const cw = W - 180;

  if (spec.scatter?.length) els.push(...scatterEdges(spec.scatter));

  // Optional framed photo (top half), tap the slot to drop a picture on top.
  if (spec.photo) {
    els.push({ id: newElId(), type: 'rect', x: 80, y: spec.photo.y - 16, w: W - 160, h: spec.photo.h + 32, fill: '#ffffff', radius: 28 });
    els.push(photoSlot(96, spec.photo.y, W - 192, spec.photo.h));
  }

  // Content stack, laid out top → bottom so any field can be omitted.
  let y = spec.photo ? spec.photo.y + spec.photo.h + 80 : H * 0.24;

  if (spec.kicker) {
    els.push(text({ x: cx, y, w: cw, h: 70, text: spec.kicker.text, size: 40, color: spec.kicker.color, weight: 800, font: COND }));
    y += 96;
  }
  if (spec.hero && !spec.photo) {
    els.push(sticker(spec.hero, (W - 200 * 1.3) / 2, y, 200, spec.heroMotion));
    y += 300;
  }

  const hl = spec.headline;
  const hSize = hl.size ?? 120;
  const rows = hl.text.split('\n').length;
  const hBox = Math.max(hSize * 1.12 * rows, hSize + 10);
  els.push(text({ x: cx, y, w: cw, h: hBox, text: hl.text, size: hSize, color: hl.color, weight: 900, font: hl.font ?? COND }));
  y += hBox + 40;

  if (spec.body) {
    const bRows = spec.body.text.split('\n').length;
    const bBox = Math.max(48 * 1.3 * bRows, 60);
    els.push(text({ x: cx, y, w: cw, h: bBox, text: spec.body.text, size: 46, color: spec.body.color, weight: 600, font: SANS }));
    y += bBox + 48;
  }

  if (spec.cta) {
    const pillW = Math.min(cw, 640);
    els.push({ id: newElId(), type: 'rect', x: (W - pillW) / 2, y, w: pillW, h: 132, fill: spec.cta.fill, radius: 66 });
    els.push(text({ x: (W - pillW) / 2, y: y + 34, w: pillW, h: 70, text: spec.cta.text, size: 54, color: spec.cta.color, weight: 900, font: COND, motion: 'pulse' }));
  }

  if (spec.handle) {
    els.push(text({ x: cx, y: H - 150, w: cw, h: 60, text: spec.handle.text, size: 40, color: spec.handle.color, weight: 700, font: SANS }));
  }

  return { w: W, h: H, background: spec.background, ...(spec.effect ? { effect: spec.effect } : {}), elements: els };
}

/** The reel library — grouped by what people actually post: promos, motivation,
 *  everyday shout-outs, food, business, events, listings. */
const SPECS: ReelSpec[] = [
  // ── Promos & sales ───────────────────────────────────────────────────────
  {
    id: 'reel-sale', name: 'Big Sale', icon: '🔥', anim: 'zoom', effect: 'confetti',
    background: '#0f172a', scatter: ['🔥', '🛍️', '⚡', '✨'],
    kicker: { text: 'LIMITED TIME ONLY', color: '#fbbf24' },
    headline: { text: 'MEGA\nSALE', color: '#ffffff', size: 180 },
    body: { text: 'Everything must go — this\nweekend only', color: '#cbd5e1' },
    cta: { text: '50% OFF', fill: '#ef4444', color: '#ffffff' },
    handle: { text: '@yourbrand', color: '#94a3b8' },
  },
  {
    id: 'reel-new-drop', name: 'New Product Drop', icon: '🚀', anim: 'rise', effect: 'sparkles',
    background: '#111827', photo: { y: 240, h: 900 }, scatter: ['✨', '🚀', '⭐', '🆕'],
    kicker: { text: 'JUST DROPPED', color: '#a5b4fc' },
    headline: { text: 'The wait\nis over', color: '#ffffff', size: 104 },
    cta: { text: 'SHOP NOW', fill: '#6366f1', color: '#ffffff' },
    handle: { text: 'link in bio 👆', color: '#c7d2fe' },
  },
  {
    id: 'reel-discount-code', name: 'Discount Code', icon: '🏷️', anim: 'pop', effect: 'stars',
    background: '#052e2b', hero: '🏷️', heroMotion: 'bounce',
    kicker: { text: 'USE CODE AT CHECKOUT', color: '#5eead4' },
    headline: { text: 'SAVE20', color: '#ccfbf1', size: 160 },
    body: { text: 'Get 20% off your first order', color: '#99f6e4' },
    cta: { text: 'ORDER NOW', fill: '#14b8a6', color: '#042f2e' },
  },

  // ── Motivation & quotes ──────────────────────────────────────────────────
  {
    id: 'reel-quote', name: 'Motivational Quote', icon: '💬', anim: 'fade', effect: 'fireflies',
    background: '#1e1b4b', scatter: ['✨', '💫', '⭐', '🌙'],
    kicker: { text: 'DAILY MOTIVATION', color: '#c4b5fd' },
    headline: { text: '“Dream it.\nDo it.”', color: '#ede9fe', size: 110, font: 'Georgia, serif' },
    body: { text: 'Your only limit is you', color: '#c7d2fe' },
    handle: { text: 'follow for daily quotes', color: '#a5b4fc' },
  },
  {
    id: 'reel-good-morning', name: 'Good Morning Reel', icon: '🌞', anim: 'rise', effect: 'flowers',
    background: '#7c2d12', hero: '🌞', heroMotion: 'pulse', scatter: ['🌻', '🌼', '🐦', '🍵'],
    kicker: { text: 'HAVE A BEAUTIFUL DAY', color: '#fed7aa' },
    headline: { text: 'Good\nMorning', color: '#fff7ed', size: 132, font: 'Georgia, serif' },
    body: { text: 'शुभ प्रभात · Rise & shine ☀️', color: '#fdba74' },
  },
  {
    id: 'reel-affirmation', name: 'Affirmation', icon: '🧘', anim: 'fade', effect: 'bubbles',
    background: '#082f49', hero: '🧘', heroMotion: 'float', scatter: ['🌊', '💙', '✨', '🕊️'],
    kicker: { text: 'BREATHE IN, BREATHE OUT', color: '#7dd3fc' },
    headline: { text: 'I am\nenough', color: '#e0f2fe', size: 128, font: 'Georgia, serif' },
    body: { text: 'Say it. Believe it. Repeat.', color: '#bae6fd' },
  },

  // ── Everyday shout-outs ──────────────────────────────────────────────────
  {
    id: 'reel-birthday', name: 'Birthday Shout-out', icon: '🎉', anim: 'pop', effect: 'balloons',
    background: '#4a044e', photo: { y: 300, h: 820 }, scatter: ['🎈', '🎉', '🎂', '✨'],
    kicker: { text: 'IT’S YOUR DAY', color: '#f0abfc' },
    headline: { text: 'Happy\nBirthday!', color: '#fdf4ff', size: 116 },
    cta: { text: 'TAG THEM 🎂', fill: '#d946ef', color: '#ffffff' },
  },
  {
    id: 'reel-congrats', name: 'Congrats Reel', icon: '🏆', anim: 'zoom', effect: 'confetti',
    background: '#0b3d2e', hero: '🏆', heroMotion: 'beat', scatter: ['🎉', '🎊', '⭐', '🥂'],
    kicker: { text: 'SO PROUD OF YOU', color: '#fcd34d' },
    headline: { text: 'YOU DID\nIT!', color: '#fef3c7', size: 150 },
    body: { text: 'Hard work really does pay off', color: '#a7f3d0' },
  },
  {
    id: 'reel-announcement', name: 'Big Announcement', icon: '📣', anim: 'slide-left', effect: 'ribbons',
    background: '#111827', hero: '📣', heroMotion: 'shake', scatter: ['🎉', '✨', '🔔', '⭐'],
    kicker: { text: 'WE HAVE NEWS', color: '#fca5a5' },
    headline: { text: 'Big\nnews!', color: '#ffffff', size: 150 },
    body: { text: 'Something exciting is coming…', color: '#cbd5e1' },
    cta: { text: 'STAY TUNED', fill: '#f43f5e', color: '#ffffff' },
  },

  // ── Food, business, events, listings ─────────────────────────────────────
  {
    id: 'reel-recipe', name: 'Recipe / How-to', icon: '🍳', anim: 'rise',
    background: '#7c2d12', photo: { y: 220, h: 760 }, scatter: ['🍅', '🧄', '🌿', '🔥'],
    kicker: { text: 'QUICK RECIPE', color: '#fed7aa' },
    headline: { text: '15-min\nPasta', color: '#fff7ed', size: 104 },
    body: { text: 'Save this for later 📌', color: '#fdba74' },
    cta: { text: 'FULL RECIPE ↓', fill: '#ea580c', color: '#ffffff' },
  },
  {
    id: 'reel-service', name: 'Service Promo', icon: '💼', anim: 'fade', effect: 'stars',
    background: '#0c4a6e', hero: '💡', heroMotion: 'pulse', scatter: ['✅', '⭐', '📈', '🤝'],
    kicker: { text: 'BOOK YOUR SPOT', color: '#7dd3fc' },
    headline: { text: 'Grow your\nbusiness', color: '#f0f9ff', size: 96 },
    body: { text: 'Free consultation this week', color: '#bae6fd' },
    cta: { text: 'DM TO BOOK', fill: '#0ea5e9', color: '#ffffff' },
    handle: { text: '@youragency', color: '#7dd3fc' },
  },
  {
    id: 'reel-countdown', name: 'Event Countdown', icon: '⏰', anim: 'zoom', effect: 'party',
    background: '#3b0764', hero: '⏰', heroMotion: 'beat', scatter: ['🎊', '🎉', '✨', '🎈'],
    kicker: { text: 'ONLY', color: '#e9d5ff' },
    headline: { text: '3 DAYS\nTO GO', color: '#faf5ff', size: 128 },
    body: { text: 'You don’t want to miss this', color: '#d8b4fe' },
    cta: { text: 'GET TICKETS', fill: '#a855f7', color: '#ffffff' },
  },
  {
    id: 'reel-listing', name: 'Property Listing', icon: '🏠', anim: 'rise',
    background: '#1c1917', photo: { y: 220, h: 920 }, scatter: ['🏠', '🔑', '⭐', '📍'],
    kicker: { text: 'JUST LISTED', color: '#fbbf24' },
    headline: { text: '3 BHK · ₹95L', color: '#fafaf9', size: 84 },
    body: { text: 'Kharadi, Pune · 1450 sq ft', color: '#d6d3d1' },
    cta: { text: 'BOOK A VISIT', fill: '#f59e0b', color: '#1c1917' },
  },
  {
    id: 'reel-fitness', name: 'Fitness Tip', icon: '💪', anim: 'pop', effect: 'stars',
    background: '#052e16', hero: '💪', heroMotion: 'bounce', scatter: ['🏃', '🥗', '💧', '🔥'],
    kicker: { text: 'TIP OF THE DAY', color: '#86efac' },
    headline: { text: 'Move for\n20 min', color: '#dcfce7', size: 112 },
    body: { text: 'Small steps, big change', color: '#bbf7d0' },
    cta: { text: 'SAVE THIS 💾', fill: '#22c55e', color: '#052e16' },
  },
];

/** Studio templates for the "Reels" category, generated from the specs above. */
export const REEL_TEMPLATES: StudioTemplate[] = SPECS.map((spec) => ({
  id: spec.id,
  name: spec.name,
  icon: spec.icon,
  category: 'Reels',
  anim: spec.anim,
  make: () => makeReel(spec),
}));
