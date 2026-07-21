/**
 * Greeting cards for every occasion and every age.
 *
 * A single data-driven generator (`makeCard`) turns a compact spec into a full
 * Design that renders through the same SVG path as everything else — so adding a
 * new card is ~10 lines of data, not a hand-laid composition. Cards ship "alive":
 * animated emoji stickers (bounce/float/spin/…) plus a drifting background effect
 * (balloons, flowers, hearts, confetti, snow, sparkles), and an entrance `anim`
 * the Animate export defaults to. Everything is a normal, draggable, editable
 * element — tap any word to retype it in any language.
 *
 * Kept deliberately dependency-light: this module imports only the model + the
 * animation/effect enums and the shared `StudioTemplate` *type* (type-only, so
 * there is no runtime import cycle with templates.ts).
 */
import { newElId, photoSlot, type Design, type TextEl, type ElementMotion, type ImageShape } from './model.js';
import type { BackgroundEffect } from './effects.js';
import type { AnimPreset } from './animate.js';
import type { StudioTemplate } from './templates.js';

const SCRIPT = "'Segoe Script', 'Comic Sans MS', cursive";
const SERIF = 'Georgia, serif';
const SANS = 'Inter, system-ui, sans-serif';

const text = (o: Partial<TextEl> & { x: number; y: number; w: number; h: number; text: string }): TextEl => ({
  id: newElId(), type: 'text', size: 48, color: '#0f172a', font: 'Inter, system-ui, sans-serif', weight: 700, align: 'center', rotation: 0, ...o,
});

/** A big emoji as its own draggable element, optionally with a looping motion. */
const sticker = (emoji: string, x: number, y: number, size: number, motion?: ElementMotion, rotation = 0): TextEl =>
  text({ x, y, w: size * 1.3, h: size * 1.3, text: emoji, size, rotation, ...(motion ? { motion } : {}) });

/** One line in the centered text stack (see makeCard). */
interface Line { text: string; color: string; size: number; font?: string; weight?: number; gap?: number }

interface CardSpec {
  id: string;
  name: string;
  icon: string;
  /** Portrait 4:5 by default (great for phones + WhatsApp). Square/story override via w/h. */
  w?: number;
  h?: number;
  background: string;
  /** Second gradient stop — the card background becomes a linear gradient
   *  (modern aurora/duotone look) instead of a flat colour. */
  bg2?: string;
  bgAngle?: number;
  /** Soft translucent glow blobs layered over the gradient (aurora depth). */
  aurora?: string[];
  /** Film-grain texture over the background (2026 tactile look). */
  grain?: boolean;
  /** Frosted "glass" panel behind the text stack — keeps type legible over a
   *  busy aurora/gradient background (glassmorphism approximation). */
  panel?: boolean;
  /** Drifting particle layer; `balloons` and `flowers`-style effects make cards feel festive. */
  effect?: BackgroundEffect;
  /** Entrance animation the GIF/video export defaults to. */
  anim?: AnimPreset;
  /** Big centered hero emoji near the top third. */
  hero: string;
  heroMotion?: ElementMotion;
  /** Hero size in px (default 168) and vertical position as a fraction of the
   *  card height (default 0.14) — so a sun can sit at the very top (Chhath) or
   *  a hero can loom large (kids' cards) without a new layout engine. */
  heroSize?: number;
  heroY?: number;
  /** How the scatter emoji are arranged: the classic four corners (default),
   *  a garland row across the top (marigold torans), or a row along the bottom
   *  (a line of diyas). Breaks the every-card-looks-the-same monotony. */
  scatterLayout?: 'corners' | 'top-garland' | 'bottom-row';
  /** Soft circle behind the hero (subtle depth). */
  halo?: string;
  /** Double border frame colour (elegant cards). */
  border?: string;
  /** Corner/scatter emoji — auto-placed at the four corners with gentle motion. */
  scatter?: string[];
  /** A tap-to-add photo slot (circle/heart/arch-ish) — personalised photo
   *  cards. Rendered as the card's centrepiece instead of the hero emoji. */
  photo?: { shape: ImageShape; size?: number };
  /** The centered text block, top to bottom. `title.style: '3d'` renders the
   *  faux-3D "balloon text" look via layered offset copies (`depth` colour). */
  eyebrow?: { text: string; color: string };
  title: { text: string; color: string; font?: string; size?: number; style?: '3d'; depth?: string };
  subtitle?: { text: string; color: string };
  message?: { text: string; color: string };
  signoff?: { text: string; color: string };
}

/** Auto-place scatter emoji at the four corners, each with a lively looping motion
 *  so the decorations move the moment the card opens. */
function scatterCorners(emojis: string[], w: number, h: number): TextEl[] {
  const motions: ElementMotion[] = ['float', 'wobble', 'float', 'pulse'];
  const spots: [number, number, number][] = [
    [70, 90, -12], [w - 190, 90, 12], [70, h - 210, -8], [w - 190, h - 210, 8],
  ];
  return emojis.slice(0, 4).map((e, i) => sticker(e, spots[i][0], spots[i][1], 104, motions[i % motions.length], spots[i][2]));
}

/** A row of five emojis across the top (toran/garland) or along the bottom
 *  (a line of diyas), cycling through the given emojis. */
function scatterRow(emojis: string[], w: number, h: number, where: 'top' | 'bottom'): TextEl[] {
  const motions: ElementMotion[] = ['float', 'pulse', 'wobble', 'pulse', 'float'];
  const size = 88;
  const y = where === 'top' ? 84 : h - 200;
  const n = 5;
  const step = (w - 160) / (n - 1);
  return Array.from({ length: n }, (_, i) =>
    sticker(emojis[i % emojis.length] ?? '✨', 80 + step * i - (size * 1.3) / 2, y, size, motions[i % motions.length], i % 2 ? 8 : -8));
}

function makeCard(spec: CardSpec): Design {
  const w = spec.w ?? 1080;
  const h = spec.h ?? 1350;
  const cx = 80;
  const cw = w - 160;
  const els: Design['elements'] = [];

  if (spec.border) {
    els.push({ id: newElId(), type: 'rect', x: 50, y: 50, w: w - 100, h: h - 100, fill: 'none', stroke: spec.border, strokeWidth: 3, radius: 14 });
    els.push({ id: newElId(), type: 'rect', x: 66, y: 66, w: w - 132, h: h - 132, fill: 'none', stroke: spec.border, strokeWidth: 1.5, radius: 12 });
  }
  if (spec.aurora?.length) {
    // Soft translucent blobs over the gradient — the aurora/mesh-gradient look.
    const spots: [number, number, number][] = [[-0.18, -0.08, 0.85], [0.55, 0.28, 0.7], [0.1, 0.62, 0.8]];
    spec.aurora.slice(0, 3).forEach((c, i) => {
      const [fx, fy, fs] = spots[i]!;
      const d = w * fs;
      els.push({ id: newElId(), type: 'ellipse', x: w * fx, y: h * fy, w: d, h: d, fill: c, opacity: 0.35 });
    });
  }
  if (spec.halo) {
    const d = Math.min(cw, 760);
    els.push({ id: newElId(), type: 'ellipse', x: (w - d) / 2, y: h * 0.11, w: d, h: d, fill: spec.halo });
  }
  if (spec.scatter?.length) {
    els.push(...(spec.scatterLayout === 'top-garland' ? scatterRow(spec.scatter, w, h, 'top')
      : spec.scatterLayout === 'bottom-row' ? scatterRow(spec.scatter, w, h, 'bottom')
      : scatterCorners(spec.scatter, w, h)));
  }

  // Centrepiece: a tap-to-add photo slot (personalised cards), else the hero
  // emoji near the top third (position/size overridable per spec).
  if (spec.photo) {
    const ps = spec.photo.size ?? Math.min(cw, 620);
    els.push({ ...photoSlot((w - ps) / 2, h * (spec.heroY ?? 0.1), ps, ps), shape: spec.photo.shape, shadow: 'soft' });
    // The hero emoji shrinks into a corner accent beside the photo.
    els.push(sticker(spec.hero, w - 250, h * 0.06, 110, spec.heroMotion, 10));
  } else {
    const heroSize = spec.heroSize ?? 168;
    els.push(sticker(spec.hero, (w - heroSize * 1.3) / 2, h * (spec.heroY ?? 0.14), heroSize, spec.heroMotion));
  }

  // Centered text stack — positions computed sequentially so any field can be omitted.
  const lines: Line[] = [];
  if (spec.eyebrow) lines.push({ text: spec.eyebrow.text, color: spec.eyebrow.color, size: 34, weight: 700, gap: 18 });
  lines.push({ text: spec.title.text, color: spec.title.color, size: spec.title.size ?? 84, weight: 900, font: spec.title.font ?? SERIF, gap: 26 });
  if (spec.subtitle) lines.push({ text: spec.subtitle.text, color: spec.subtitle.color, size: 42, weight: 700, font: SCRIPT, gap: 22 });
  if (spec.message) lines.push({ text: spec.message.text, color: spec.message.color, size: 32, weight: 500, gap: 30 });
  if (spec.signoff) lines.push({ text: spec.signoff.text, color: spec.signoff.color, size: 30, weight: 600, font: SCRIPT, gap: 0 });

  const stackTop = h * (spec.photo ? 0.52 : 0.42);
  if (spec.panel) {
    // Frosted panel: translucent white fill + hairline white stroke, rounded.
    els.push({ id: newElId(), type: 'rect', x: cx - 30, y: stackTop - 50, w: cw + 60, h: h * 0.42, fill: '#ffffff22', stroke: '#ffffff55', strokeWidth: 1.5, radius: 28 });
  }
  let y = stackTop;
  const isTitle = (ln: Line) => ln.text === spec.title.text;
  lines.forEach((ln) => {
    const rows = ln.text.split('\n').length;
    const lineH = ln.size * 1.18;
    const boxH = Math.max(lineH * rows, ln.size + 8);
    if (isTitle(ln) && spec.title.style === '3d') {
      // Faux-3D "balloon text": stacked offset copies build the extrusion, the
      // face colour sits on top. Pure layered <text>, renders everywhere.
      const depth = spec.title.depth ?? '#00000055';
      for (const off of [10, 7, 4]) {
        els.push(text({ x: cx + off, y: y + off, w: cw, h: boxH, text: ln.text, size: ln.size, color: depth, weight: ln.weight ?? 900, font: ln.font ?? SERIF }));
      }
    }
    els.push(text({ x: cx, y, w: cw, h: boxH, text: ln.text, size: ln.size, color: ln.color, weight: ln.weight ?? 700, font: ln.font ?? 'Inter, system-ui, sans-serif' }));
    y += boxH + (ln.gap ?? 20);
  });

  return {
    w, h, background: spec.background,
    ...(spec.bg2 ? { bg2: spec.bg2, ...(spec.bgAngle !== undefined ? { bgAngle: spec.bgAngle } : {}) } : {}),
    ...(spec.grain ? { grain: true } : {}),
    ...(spec.effect ? { effect: spec.effect } : {}),
    elements: els,
  };
}

/** The occasion library. Grouped by life-stage so it's easy to see the coverage —
 *  birthdays & kids, love & family, festivals & faith, milestones, seasons, and
 *  the "sent every day on WhatsApp" cards older users love. */
const SPECS: CardSpec[] = [
  // ── Birthdays (all ages) ────────────────────────────────────────────────
  {
    id: 'gc-birthday-kids', name: 'Happy Birthday — Kids', icon: '🎈', anim: 'pop', effect: 'balloons',
    background: '#eef7ff', halo: '#d5ebff', hero: '🎂', heroMotion: 'bounce', scatter: ['🎈', '🎈', '🧸', '🎁'],
    title: { text: 'Happy Birthday!', color: '#1d4ed8' },
    subtitle: { text: 'Have a super fun day', color: '#2563eb' },
    message: { text: 'Cake, games and lots of\nballoons just for you!', color: '#3b82f6' },
    signoff: { text: '— with love', color: '#1d4ed8' },
  },
  {
    id: 'gc-birthday-her', name: 'Happy Birthday — Elegant', icon: '🌸', anim: 'rise', effect: 'sparkles',
    background: '#fdf2f8', halo: '#fce7f3', hero: '🎀', heroMotion: 'float', scatter: ['🌸', '🌷', '🌸', '🌷'],
    eyebrow: { text: 'HAPPY BIRTHDAY', color: '#be185d' },
    title: { text: 'To someone\nspecial', color: '#9d174d' },
    message: { text: 'May your year be as beautiful\nand bright as you are', color: '#a855a0' },
    signoff: { text: '— always yours', color: '#be185d' },
  },
  {
    id: 'gc-birthday-milestone', name: 'Milestone Birthday', icon: '🎉', anim: 'zoom', effect: 'confetti',
    background: '#12083a', hero: '🥳', heroMotion: 'beat', scatter: ['🎉', '🎊', '✨', '🍾'],
    eyebrow: { text: 'CHEERS TO', color: '#fcd34d' },
    title: { text: '50 & Fabulous', color: '#fde68a' },
    subtitle: { text: 'Happy Birthday!', color: '#f9a8d4' },
    message: { text: 'Half a century of wonderful —\nhere’s to many more', color: '#e9d5ff' },
  },
  {
    id: 'gc-belated-birthday', name: 'Belated Birthday', icon: '🐌', anim: 'fade',
    background: '#fff7ed', halo: '#ffedd5', hero: '🎂', heroMotion: 'wobble', scatter: ['🐌', '🎈', '⭐', '🎁'],
    title: { text: 'Happy (Belated)\nBirthday!', color: '#c2410c', size: 72 },
    message: { text: 'A little late, but wishing you\njust as much', color: '#9a3412' },
    signoff: { text: 'better late than never 😄', color: '#ea580c' },
  },

  // ── Love & family ───────────────────────────────────────────────────────
  {
    id: 'gc-anniversary', name: 'Happy Anniversary', icon: '💞', anim: 'fade', effect: 'hearts',
    background: '#3b0a1e', halo: '#5c1230', hero: '💑', heroMotion: 'beat', scatter: ['💐', '🌹', '💞', '✨'],
    eyebrow: { text: 'HAPPY ANNIVERSARY', color: '#f5c6d8' },
    title: { text: 'To the perfect\npair', color: '#ffd166' },
    message: { text: 'Your love story is our favourite —\nhere’s to forever', color: '#fde8ef' },
  },
  {
    id: 'gc-valentine', name: "Valentine's Day", icon: '❤️', anim: 'zoom', effect: 'hearts',
    background: '#4c0519', halo: '#7f1d3a', hero: '💖', heroMotion: 'beat', scatter: ['🌹', '💕', '💌', '🌹'],
    title: { text: 'Be My Valentine', color: '#fecdd3' },
    subtitle: { text: 'you have my whole heart', color: '#fda4af' },
    signoff: { text: '— forever & always', color: '#fb7185' },
  },
  {
    id: 'gc-mothers-day', name: "Mother's Day", icon: '🌷', anim: 'rise', effect: 'flowers',
    background: '#fdf4ff', halo: '#f5e1ff', hero: '💐', heroMotion: 'float', scatter: ['🌷', '🌸', '🌹', '🌻'],
    eyebrow: { text: 'HAPPY MOTHER’S DAY', color: '#a21caf' },
    title: { text: 'The best Mum\nin the world', color: '#86198f' },
    message: { text: 'Thank you for your endless love,\ncare and warm hugs', color: '#a855a0' },
    signoff: { text: 'love you, Mum 💕', color: '#a21caf' },
  },
  {
    id: 'gc-fathers-day', name: "Father's Day", icon: '👔', anim: 'rise',
    background: '#0f2942', halo: '#173a5c', hero: '🦸', heroMotion: 'float', scatter: ['⭐', '🏆', '🎣', '⚽'],
    eyebrow: { text: 'HAPPY FATHER’S DAY', color: '#7dd3fc' },
    title: { text: 'To my hero,\nDad', color: '#e0f2fe' },
    message: { text: 'Thank you for always being\nmy strength and guide', color: '#bae6fd' },
    signoff: { text: 'the world’s best Dad', color: '#38bdf8' },
  },
  {
    id: 'gc-grandparents', name: 'Grandparents Day', icon: '👵', anim: 'fade', effect: 'hearts',
    background: '#fffaf0', halo: '#fdecc8', hero: '👴', heroMotion: 'float', scatter: ['👵', '🌼', '💛', '🫖'],
    title: { text: 'Happy\nGrandparents Day', color: '#b45309', size: 64 },
    message: { text: 'For all the stories, sweets and\nunconditional love — thank you', color: '#92610e' },
    signoff: { text: 'with all our love', color: '#d97706' },
  },
  {
    id: 'gc-friendship', name: 'Friendship Day', icon: '🤝', anim: 'pop', effect: 'confetti',
    background: '#052e2b', halo: '#0b4d47', hero: '🫶', heroMotion: 'beat', scatter: ['🤗', '🎉', '⭐', '🍀'],
    eyebrow: { text: 'HAPPY FRIENDSHIP DAY', color: '#5eead4' },
    title: { text: 'To my partner\nin crime', color: '#ccfbf1' },
    message: { text: 'Thanks for the laughs, the memes\nand always having my back', color: '#99f6e4' },
    signoff: { text: '— best friends forever', color: '#2dd4bf' },
  },

  // ── Congratulations & milestones ────────────────────────────────────────
  {
    id: 'gc-congrats', name: 'Congratulations', icon: '🎊', anim: 'rise', effect: 'confetti',
    background: '#0b3d2e', hero: '🏆', heroMotion: 'beat', scatter: ['🎉', '🎊', '⭐', '✨'],
    eyebrow: { text: 'CONGRATULATIONS', color: '#fcd34d' },
    title: { text: 'You did it!', color: '#fef3c7' },
    message: { text: 'So proud of you — this is just\nthe beginning', color: '#a7f3d0' },
  },
  {
    id: 'gc-new-job', name: 'New Job', icon: '💼', anim: 'pop', effect: 'confetti',
    background: '#eef2ff', halo: '#e0e7ff', hero: '🎉', heroMotion: 'bounce', scatter: ['💼', '🚀', '⭐', '📈'],
    eyebrow: { text: 'CONGRATS ON THE', color: '#4338ca' },
    title: { text: 'New Job!', color: '#3730a3' },
    message: { text: 'They’re lucky to have you —\ngo show them what you’ve got', color: '#4f46e5' },
    signoff: { text: 'you’ve earned it!', color: '#6366f1' },
  },
  {
    id: 'gc-promotion', name: 'Promotion', icon: '📈', anim: 'rise', effect: 'sparkles',
    background: '#1a2e05', halo: '#2c470a', hero: '🎯', heroMotion: 'pulse', scatter: ['📈', '🏆', '⭐', '🥂'],
    eyebrow: { text: 'CONGRATULATIONS ON YOUR', color: '#bef264' },
    title: { text: 'Promotion!', color: '#ecfccb' },
    message: { text: 'Hard work pays off — well\ndeserved, every bit of it', color: '#d9f99d' },
  },
  {
    id: 'gc-graduation', name: 'Graduation', icon: '🎓', anim: 'rise', effect: 'confetti',
    background: '#0c1b3a', hero: '🎓', heroMotion: 'bounce', scatter: ['🎉', '📜', '⭐', '🥳'],
    eyebrow: { text: 'CONGRATULATIONS, GRADUATE', color: '#ffd166' },
    title: { text: 'You did it!', color: '#ffffff' },
    subtitle: { text: 'the tassel was worth the hassle', color: '#bcd2ff' },
    message: { text: 'Class of 2026 — the world is\nwaiting for you', color: '#8fb0e8' },
  },
  {
    id: 'gc-engagement', name: 'Engagement', icon: '💍', anim: 'fade', effect: 'sparkles',
    background: '#fffdf5', border: '#c9a34e', hero: '💍', heroMotion: 'pulse', scatter: ['💐', '🥂', '💞', '✨'],
    eyebrow: { text: 'CONGRATULATIONS ON YOUR', color: '#a08339' },
    title: { text: 'Engagement', color: '#7c5c1e' },
    message: { text: 'Wishing you a lifetime of love\nand laughter together', color: '#8a6d2f' },
    signoff: { text: 'so happy for you both!', color: '#c9a34e' },
  },
  {
    id: 'gc-new-baby', name: 'New Baby', icon: '🍼', anim: 'pop',
    background: '#eef6ff', halo: '#dbeafe', hero: '👶', heroMotion: 'float', scatter: ['🍼', '🧸', '☁️', '⭐'],
    eyebrow: { text: 'CONGRATULATIONS', color: '#3b82c4' },
    title: { text: 'Welcome,\nlittle one', color: '#1d4e89', size: 76 },
    message: { text: 'A tiny new star has arrived —\nwishing your family joy', color: '#35618e' },
    signoff: { text: 'with love & tiny cuddles', color: '#6fa3cf' },
  },
  {
    id: 'gc-retirement', name: 'Retirement', icon: '🌴', anim: 'rise', effect: 'confetti',
    background: '#062a3a', halo: '#0c4257', hero: '🏖️', heroMotion: 'float', scatter: ['🌴', '⛱️', '🎉', '🥂'],
    eyebrow: { text: 'HAPPY RETIREMENT', color: '#7dd3fc' },
    title: { text: 'The adventure\nbegins', color: '#e0f2fe' },
    message: { text: 'You’ve earned every sunrise —\nenjoy every single one', color: '#bae6fd' },
  },
  {
    id: 'gc-farewell', name: 'Farewell / Good Luck', icon: '👋', anim: 'slide-left',
    background: '#1e1b4b', halo: '#312e81', hero: '🚀', heroMotion: 'float', scatter: ['👋', '⭐', '🍀', '✨'],
    eyebrow: { text: 'FAREWELL & GOOD LUCK', color: '#c4b5fd' },
    title: { text: 'On to great\nthings', color: '#ede9fe' },
    message: { text: 'We’ll miss you here — go be\namazing out there', color: '#c7d2fe' },
    signoff: { text: 'keep in touch! 👋', color: '#a5b4fc' },
  },
  {
    id: 'gc-good-luck', name: 'Good Luck / Exams', icon: '🍀', anim: 'pop', effect: 'sparkles',
    background: '#052e16', halo: '#14532d', hero: '🍀', heroMotion: 'wobble', scatter: ['⭐', '📚', '✏️', '💪'],
    eyebrow: { text: 'ALL THE BEST', color: '#86efac' },
    title: { text: 'You’ve got\nthis!', color: '#dcfce7' },
    message: { text: 'Stay calm, trust yourself and\nshine — good luck!', color: '#bbf7d0' },
  },

  // ── Get well, sympathy, thanks, sorry ───────────────────────────────────
  {
    id: 'gc-get-well', name: 'Get Well Soon', icon: '🌻', anim: 'fade',
    background: '#f0fdf4', halo: '#dcfce7', hero: '🌻', heroMotion: 'float', scatter: ['🍀', '☀️', '🦋', '💐'],
    title: { text: 'Get Well Soon', color: '#166534' },
    message: { text: 'Sending you sunshine, soup\nand lots of good wishes', color: '#15803d' },
    signoff: { text: 'we miss you already!', color: '#4d7c0f' },
  },
  {
    id: 'gc-sympathy', name: 'With Sympathy', icon: '🕊️', anim: 'fade',
    background: '#f8fafc', border: '#cbd5e1', hero: '🕊️', heroMotion: 'float', scatter: ['🤍', '🌿', '🌿', '🤍'],
    eyebrow: { text: 'WITH DEEPEST SYMPATHY', color: '#64748b' },
    title: { text: 'Thinking of\nyou', color: '#334155', size: 72 },
    message: { text: 'May loving memories bring you\ncomfort and peace', color: '#475569' },
    signoff: { text: 'our hearts are with you', color: '#94a3b8' },
  },
  {
    id: 'gc-thank-you', name: 'Thank You', icon: '💌', anim: 'rise', effect: 'hearts',
    background: '#fdf2f8', halo: '#fbcfe8', hero: '💐', heroMotion: 'float', scatter: ['💕', '🌸', '✨', '🙏'],
    title: { text: 'Thank You', color: '#9d174d', size: 96 },
    message: { text: 'Your kindness means the world —\nthank you, truly', color: '#be185d' },
    signoff: { text: 'with heartfelt gratitude', color: '#db2777' },
  },
  {
    id: 'gc-sorry', name: "I'm Sorry", icon: '🥺', anim: 'fade',
    background: '#f5f3ff', halo: '#ede9fe', hero: '🥺', heroMotion: 'wobble', scatter: ['🌷', '💜', '🕊️', '🌷'],
    title: { text: "I'm Sorry", color: '#6d28d9', size: 88 },
    message: { text: 'I never meant to hurt you —\nplease forgive me', color: '#7c3aed' },
    signoff: { text: 'you mean everything to me', color: '#8b5cf6' },
  },
  {
    id: 'gc-miss-you', name: 'Miss You', icon: '🥰', anim: 'fade', effect: 'hearts',
    background: '#2e1065', halo: '#4c1d95', hero: '🫂', heroMotion: 'beat', scatter: ['💜', '✨', '🌙', '💕'],
    title: { text: 'Missing You', color: '#e9d5ff' },
    message: { text: 'Distance means nothing when\nsomeone means everything', color: '#d8b4fe' },
    signoff: { text: 'can’t wait to see you', color: '#c084fc' },
  },
  {
    id: 'gc-teachers-day', name: "Teacher's Day", icon: '🍎', anim: 'rise', effect: 'sparkles',
    background: '#fffbeb', halo: '#fef3c7', hero: '🍎', heroMotion: 'bounce', scatter: ['📚', '✏️', '⭐', '🏫'],
    eyebrow: { text: 'HAPPY TEACHER’S DAY', color: '#b45309' },
    title: { text: 'Thank you,\nteacher', color: '#92400e' },
    message: { text: 'For lighting the way and never\ngiving up on us', color: '#a16207' },
  },

  // ── Festivals & faith ───────────────────────────────────────────────────
  {
    id: 'gc-diwali', name: 'Happy Diwali', icon: '🪔', anim: 'zoom', effect: 'sparkles',
    background: '#160a2e', halo: '#2a1250', border: '#f59e0b', hero: '🪔', heroMotion: 'pulse', scatter: ['🪔', '🪔', '🪔', '🪔', '🪔'], scatterLayout: 'bottom-row',
    title: { text: 'शुभ दीपावली', color: '#fbbf24', font: SERIF },
    subtitle: { text: 'Happy Diwali', color: '#fde68a' },
    message: { text: 'May the festival of lights fill your\nhome with joy and prosperity', color: '#e9d5ff' },
  },
  {
    id: 'gc-holi', name: 'Happy Holi', icon: '🎨', anim: 'pop', effect: 'confetti',
    background: '#1e1b4b', hero: '🎨', heroMotion: 'shake', scatter: ['💛', '💚', '❤️', '💜'],
    title: { text: 'Happy Holi', color: '#fde047', font: SERIF },
    subtitle: { text: 'रंगों की शुभकामनाएँ', color: '#a5f3fc' },
    message: { text: 'May your life be as colourful\nand joyful as Holi', color: '#f0abfc' },
  },
  {
    id: 'gc-eid', name: 'Eid Mubarak', icon: '🌙', anim: 'fade', effect: 'sparkles',
    background: '#062821', border: '#d4af37', hero: '🌙', heroMotion: 'float', scatter: ['⭐', '🕌', '🏮', '✨'],
    title: { text: 'ईद मुबारक', color: '#d4af37', font: SERIF },
    subtitle: { text: 'Eid Mubarak', color: '#f0e6c8' },
    message: { text: 'May this blessed day bring peace,\nhappiness and togetherness', color: '#c7f9ec' },
  },
  {
    id: 'gc-ramadan', name: 'Ramadan Kareem', icon: '🕌', anim: 'fade', effect: 'sparkles',
    background: '#0b1d3a', border: '#d4af37', hero: '🌙', heroMotion: 'float', scatter: ['⭐', '🏮', '🕌', '✨'],
    title: { text: 'Ramadan Kareem', color: '#d4af37', size: 66, font: SERIF },
    message: { text: 'Wishing you a blessed month of\nreflection, peace and prayer', color: '#cbd5e1' },
  },
  {
    id: 'gc-christmas', name: 'Merry Christmas', icon: '🎄', anim: 'pop', effect: 'snow',
    background: '#0c2818', border: '#d4af37', hero: '🎄', heroMotion: 'wobble', scatter: ['🎅', '🎁', '❄️', '🔔'],
    title: { text: 'Merry Christmas', color: '#f8e7c9', font: SERIF },
    subtitle: { text: '& a Happy New Year', color: '#d4af37' },
    message: { text: 'Wishing you warmth, joy and\ntogetherness this season', color: '#cde8d5' },
  },
  {
    id: 'gc-easter', name: 'Happy Easter', icon: '🐰', anim: 'pop', effect: 'flowers',
    background: '#fefce8', halo: '#fef9c3', hero: '🐰', heroMotion: 'bounce', scatter: ['🥚', '🌷', '🐣', '🌼'],
    title: { text: 'Happy Easter', color: '#a16207' },
    message: { text: 'Wishing you a basket full of\njoy, hope and new beginnings', color: '#ca8a04' },
    signoff: { text: 'hoppy Easter! 🐰', color: '#eab308' },
  },
  {
    id: 'gc-hanukkah', name: 'Happy Hanukkah', icon: '🕎', anim: 'fade', effect: 'sparkles',
    background: '#0b1c3a', halo: '#13294f', hero: '🕎', heroMotion: 'pulse', scatter: ['✡️', '🕯️', '⭐', '✨'],
    title: { text: 'Happy Hanukkah', color: '#93c5fd', size: 68, font: SERIF },
    message: { text: 'May the festival of lights bring\nwarmth, joy and blessings', color: '#dbeafe' },
  },
  {
    id: 'gc-new-year', name: 'Happy New Year', icon: '🎆', anim: 'zoom', effect: 'confetti',
    background: '#050a1f', hero: '🎆', heroMotion: 'pulse', scatter: ['🎇', '🥂', '🎉', '✨'],
    eyebrow: { text: 'HAPPY NEW YEAR', color: '#93c5fd' },
    title: { text: '2027', color: '#fbbf24', size: 200, font: SERIF },
    message: { text: 'May your year sparkle with\nnew dreams and new wins', color: '#e0e7ff' },
  },
  {
    id: 'gc-thanksgiving', name: 'Happy Thanksgiving', icon: '🦃', anim: 'rise', effect: 'flowers',
    background: '#3b1a06', halo: '#5c2c0e', hero: '🦃', heroMotion: 'wobble', scatter: ['🍁', '🌽', '🥧', '🍂'],
    eyebrow: { text: 'HAPPY THANKSGIVING', color: '#fdba74' },
    title: { text: 'Grateful\nfor you', color: '#fed7aa' },
    message: { text: 'Wishing you a table full of food\nand a heart full of thanks', color: '#fbbf24' },
  },
  {
    id: 'gc-halloween', name: 'Happy Halloween', icon: '🎃', anim: 'pop',
    background: '#180a2e', halo: '#2c1250', hero: '🎃', heroMotion: 'bounce', scatter: ['👻', '🦇', '🕸️', '🍬'],
    title: { text: 'Happy Halloween', color: '#fb923c', size: 68 },
    subtitle: { text: 'trick or treat!', color: '#c084fc' },
    message: { text: 'Wishing you a spook-tacular\nnight of frights and treats', color: '#e9d5ff' },
  },
  {
    id: 'gc-rakhi', name: 'Raksha Bandhan', icon: '🪢', anim: 'rise', effect: 'flowers',
    background: '#fff1e6', halo: '#ffe0c2', hero: '🪢', heroMotion: 'wobble', scatter: ['🎁', '🍬', '🌺', '✨'],
    title: { text: 'रक्षा बंधन', color: '#b3541e', font: SERIF },
    subtitle: { text: 'Happy Raksha Bandhan', color: '#8a4117' },
    message: { text: 'To the world’s best brother —\nthis thread carries all my love', color: '#a05c2e' },
  },
  {
    id: 'gc-pongal', name: 'Happy Pongal', icon: '🌾', anim: 'rise', effect: 'sparkles',
    background: '#fff8ec', halo: '#fef3c7', hero: '🌾', heroMotion: 'float', scatter: ['🪔', '🐄', '🍚', '🌻'],
    title: { text: 'இனிய பொங்கல்', color: '#b45309', font: SERIF },
    subtitle: { text: 'Happy Pongal', color: '#d97706' },
    message: { text: 'May the harvest bring you\nprosperity and happiness', color: '#92610e' },
  },
  {
    id: 'gc-navratri', name: 'Happy Navratri', icon: '🔱', anim: 'pop', effect: 'sparkles',
    background: '#2a0a4a', halo: '#4c1d95', hero: '🔱', heroMotion: 'pulse', scatter: ['🌺', '🪔', '✨', '🌸'],
    title: { text: 'Happy Navratri', color: '#fbbf24', font: SERIF },
    subtitle: { text: 'नवरात्रि की शुभकामनाएँ', color: '#f5d0fe' },
    message: { text: 'May Maa Durga bless you with\nstrength, joy and prosperity', color: '#d8b4fe' },
  },
  {
    id: 'gc-ganesh', name: 'Ganesh Chaturthi', icon: '🕉️', anim: 'zoom', effect: 'flowers',
    background: '#2a0f05', halo: '#5c2c0e', border: '#f59e0b', hero: '🕉️', heroMotion: 'pulse', scatter: ['🪔', '🌺', '🙏', '✨'],
    title: { text: 'गणपती बाप्पा मोरया', color: '#fbbf24', font: SERIF, size: 66 },
    subtitle: { text: 'Happy Ganesh Chaturthi', color: '#fde68a' },
    message: { text: 'May Lord Ganesha remove every\nobstacle and bless your home', color: '#fed7aa' },
  },
  {
    id: 'gc-dussehra', name: 'Happy Dussehra', icon: '🏹', anim: 'rise', effect: 'sparkles',
    background: '#3a0d0d', halo: '#5c1a1a', border: '#f59e0b', hero: '🏹', heroMotion: 'wobble', scatter: ['🪔', '🔥', '🌼', '✨'],
    title: { text: 'शुभ दशहरा', color: '#fbbf24', font: SERIF },
    subtitle: { text: 'Happy Dussehra', color: '#fde68a' },
    message: { text: 'May good triumph over evil and\nlight fill your life with victory', color: '#fecaca' },
  },
  {
    id: 'gc-janmashtami', name: 'Krishna Janmashtami', icon: '🪈', anim: 'fade', effect: 'flowers',
    background: '#08122e', halo: '#132251', border: '#d4af37', hero: '🪈', heroMotion: 'float', scatter: ['🪶', '🧈', '🌸', '✨'],
    title: { text: 'जय श्री कृष्ण', color: '#93c5fd', font: SERIF },
    subtitle: { text: 'Happy Janmashtami', color: '#dbeafe' },
    message: { text: 'May Kanha fill your life with love,\njoy and endless blessings', color: '#bfdbfe' },
  },
  {
    id: 'gc-makar-sankranti', name: 'Makar Sankranti', icon: '🪁', anim: 'pop', effect: 'sparkles',
    background: '#0b2a4a', hero: '🪁', heroMotion: 'wobble', scatter: ['🪁', '🌞', '🍚', '🌾'],
    title: { text: 'Happy Sankranti', color: '#fbbf24', font: SERIF },
    subtitle: { text: 'तिळगुळ घ्या, गोड गोड बोला', color: '#bae6fd' },
    message: { text: 'May your days be as high and\nfree as the festival kites', color: '#e0f2fe' },
  },
  {
    id: 'gc-pongal-extra', name: 'Uttarayan / Kite', icon: '🌞', anim: 'rise', effect: 'sparkles',
    background: '#fff5e0', halo: '#fde68a', hero: '🪁', heroMotion: 'float', scatter: ['🪁', '🌞', '🌾', '🎈'],
    title: { text: 'Happy Uttarayan', color: '#b45309', font: SERIF },
    message: { text: 'Wishing you clear skies, soaring\nkites and a sweet new season', color: '#92610e' },
    signoff: { text: 'kai po che! 🪁', color: '#d97706' },
  },
  {
    id: 'gc-lohri', name: 'Happy Lohri', icon: '🔥', anim: 'pop', effect: 'sparkles',
    background: '#3a1405', halo: '#5c2408', border: '#f59e0b', hero: '🔥', heroMotion: 'pulse', scatter: ['🥁', '🌾', '🍿', '✨'],
    title: { text: 'Happy Lohri', color: '#fbbf24', font: SERIF },
    subtitle: { text: 'ਲੋਹੜੀ ਦੀਆਂ ਮੁਬਾਰਕਾਂ', color: '#fde68a' },
    message: { text: 'May the Lohri bonfire burn away\nsorrows and bring warmth & cheer', color: '#fed7aa' },
  },
  {
    id: 'gc-baisakhi', name: 'Happy Baisakhi', icon: '🌾', anim: 'rise', effect: 'flowers',
    background: '#14330a', halo: '#1f4d10', hero: '🌾', heroMotion: 'wobble', scatter: ['🥁', '💛', '🌻', '🪘'],
    title: { text: 'Happy Baisakhi', color: '#fde047', font: SERIF },
    subtitle: { text: 'ਵਿਸਾਖੀ ਦੀਆਂ ਵਧਾਈਆਂ', color: '#d9f99d' },
    message: { text: 'May the harvest bring prosperity,\njoy and good fortune your way', color: '#bbf7d0' },
  },
  {
    id: 'gc-ugadi', name: 'Ugadi / Gudi Padwa', icon: '🌿', anim: 'rise', effect: 'flowers',
    background: '#12330f', halo: '#1d4d18', border: '#f59e0b', hero: '🌿', heroMotion: 'float', scatter: ['🪔', '🥭', '🌼', '✨'],
    title: { text: 'शुभ गुढी पाडवा', color: '#fde047', font: SERIF, size: 66 },
    subtitle: { text: 'Happy Ugadi', color: '#d9f99d' },
    message: { text: 'May the new year bring health,\nwealth and sweet new beginnings', color: '#bbf7d0' },
  },
  {
    id: 'gc-onam', name: 'Happy Onam', icon: '🌺', anim: 'pop', effect: 'flowers',
    background: '#12330f', halo: '#1d4d18', border: '#f59e0b', hero: '🌸', heroMotion: 'pulse', scatter: ['🚣', '🌺', '🍛', '🪔'],
    title: { text: 'Happy Onam', color: '#fde047', font: SERIF },
    subtitle: { text: 'ഓണാശംസകൾ', color: '#d9f99d' },
    message: { text: 'May the spirit of Onam fill your\nhome with joy and abundance', color: '#bbf7d0' },
  },
  {
    id: 'gc-vishu', name: 'Happy Vishu', icon: '🌼', anim: 'rise', effect: 'flowers',
    background: '#2a1405', halo: '#5c2c0e', border: '#f59e0b', hero: '🌼', heroMotion: 'float', scatter: ['🪔', '🥭', '🌾', '✨'],
    title: { text: 'Happy Vishu', color: '#fbbf24', font: SERIF },
    subtitle: { text: 'വിഷു ആശംസകൾ', color: '#fde68a' },
    message: { text: 'May the Vishukkani bring a year\nof prosperity and good fortune', color: '#fed7aa' },
  },
  {
    id: 'gc-karva-chauth', name: 'Karva Chauth', icon: '🌝', anim: 'fade', effect: 'moon',
    background: '#2a0a2e', halo: '#4a1250', border: '#d4af37', hero: '🌝', heroMotion: 'float', scatter: ['🪔', '💍', '🌹', '✨'],
    title: { text: 'Happy Karva Chauth', color: '#f5d0fe', font: SERIF, size: 60 },
    subtitle: { text: 'करवा चौथ की शुभकामनाएँ', color: '#e9d5ff' },
    message: { text: 'To love that shines brighter than\nthe moon — happy Karva Chauth', color: '#d8b4fe' },
  },
  {
    id: 'gc-bhai-dooj', name: 'Bhai Dooj', icon: '🪔', anim: 'rise', effect: 'flowers',
    background: '#2a1405', halo: '#5c2c0e', border: '#f59e0b', hero: '🫶', heroMotion: 'beat', scatter: ['🪔', '🍬', '🎁', '🌺'],
    title: { text: 'Happy Bhai Dooj', color: '#fbbf24', font: SERIF },
    subtitle: { text: 'भाई दूज की शुभकामनाएँ', color: '#fde68a' },
    message: { text: 'A bond of love and protection —\nhappy Bhai Dooj, dear brother', color: '#fed7aa' },
  },
  {
    id: 'gc-chhath', name: 'Chhath Puja', icon: '🌅', anim: 'rise', effect: 'sparkles',
    background: '#3a1a05', halo: '#5c2c0e', border: '#f59e0b', hero: '🌅', heroMotion: 'pulse', scatter: ['🪔', '🥥', '🌾', '🌞'],
    title: { text: 'छठ महापर्व की\nहार्दिक शुभकामनाएँ', color: '#fbbf24', font: SERIF, size: 60 },
    subtitle: { text: 'जय छठी मईया', color: '#fde68a' },
    message: { text: 'May Chhathi Maiya bless your\nfamily with health and happiness', color: '#fed7aa' },
  },
  {
    id: 'gc-gurpurab', name: 'Guru Nanak Jayanti', icon: '🙏', anim: 'fade', effect: 'sparkles',
    background: '#0b1d3a', halo: '#13294f', border: '#d4af37', hero: '🪯', heroMotion: 'pulse', scatter: ['🪔', '🌼', '📿', '✨'],
    title: { text: 'Happy Gurpurab', color: '#d4af37', font: SERIF },
    subtitle: { text: 'ਗੁਰੂ ਨਾਨਕ ਜਯੰਤੀ ਦੀਆਂ ਵਧਾਈਆਂ', color: '#e0e7ff', },
    message: { text: 'May Guru Nanak’s teachings guide\nyou to peace, love and light', color: '#cbd5e1' },
  },
  {
    id: 'gc-bihu', name: 'Bihu (Assam)', icon: '🥁', anim: 'pop', effect: 'flowers',
    background: '#2a1405', halo: '#5c2c0e', border: '#f59e0b', hero: '🥁', heroMotion: 'wobble', scatter: ['🪘', '🌾', '🪭', '✨'],
    title: { text: 'ৰঙালী বিহুৰ শুভেচ্ছা', color: '#fbbf24', font: SERIF, size: 62 },
    subtitle: { text: 'Happy Bihu', color: '#fde68a' },
    message: { text: 'May this Bihu bring joy, music\nand a bountiful harvest', color: '#fed7aa' },
  },
  {
    id: 'gc-poila-boishakh', name: 'Poila Boishakh', icon: '🎊', anim: 'zoom', effect: 'confetti',
    background: '#1a1205', halo: '#3a2a0a', border: '#facc15', hero: '🌼', heroMotion: 'float', scatter: ['🎉', '🌼', '🪔', '✨'],
    title: { text: 'শুভ নববর্ষ', color: '#facc15', font: SERIF },
    subtitle: { text: 'Shubho Poila Boishakh', color: '#fef9c3' },
    message: { text: 'Wishing you a Bengali New Year\nfull of happiness and prosperity', color: '#fde68a' },
  },
  {
    id: 'gc-puthandu', name: 'Tamil Puthandu', icon: '🌸', anim: 'rise', effect: 'flowers',
    background: '#12330f', halo: '#1d4d18', border: '#f59e0b', hero: '🌸', heroMotion: 'pulse', scatter: ['🥭', '🌺', '🪔', '✨'],
    title: { text: 'புத்தாண்டு வாழ்த்துக்கள்', color: '#fde047', font: SERIF, size: 56 },
    subtitle: { text: 'Happy Tamil New Year', color: '#d9f99d' },
    message: { text: 'May the Tamil New Year bring\nhealth, wealth and happiness', color: '#bbf7d0' },
  },
  {
    id: 'gc-cheti-chand', name: 'Cheti Chand', icon: '🌊', anim: 'rise', effect: 'sparkles',
    background: '#082f49', halo: '#0c4a6e', border: '#38bdf8', hero: '🪔', heroMotion: 'float', scatter: ['🌊', '🪔', '🌼', '✨'],
    title: { text: 'चेटीचंड जी लख लख वधायूं', color: '#7dd3fc', font: SERIF, size: 56 },
    subtitle: { text: 'Happy Cheti Chand', color: '#e0f2fe' },
    message: { text: 'Jhulelal Sain’s blessings for a\nprosperous Sindhi New Year', color: '#bae6fd' },
  },
  {
    id: 'gc-mahavir-jayanti', name: 'Mahavir Jayanti', icon: '🙏', anim: 'fade', effect: 'sparkles',
    background: '#3a1405', halo: '#5c2c0e', border: '#f59e0b', hero: '🕉️', heroMotion: 'pulse', scatter: ['🪷', '📿', '🌼', '✨'],
    title: { text: 'Mahavir Jayanti', color: '#fbbf24', font: SERIF },
    subtitle: { text: 'महावीर जयंती की शुभकामनाएँ', color: '#fde68a' },
    message: { text: 'May Lord Mahavir’s message of\npeace and non-violence guide you', color: '#fed7aa' },
  },
  {
    id: 'gc-vishwakarma', name: 'Vishwakarma Puja', icon: '🛠️', anim: 'rise', effect: 'sparkles',
    background: '#0b1d3a', halo: '#13294f', border: '#d4af37', hero: '🛠️', heroMotion: 'wobble', scatter: ['⚙️', '🪔', '🌼', '✨'],
    title: { text: 'Vishwakarma Puja', color: '#d4af37', font: SERIF },
    subtitle: { text: 'विश्वकर्मा पूजा की शुभकामनाएँ', color: '#e0e7ff' },
    message: { text: 'Blessings of skill, craft and\nprosperity on Vishwakarma Puja', color: '#cbd5e1' },
  },
  {
    id: 'gc-kali-puja', name: 'Kali Puja', icon: '🪔', anim: 'fade', effect: 'sparkles',
    background: '#160a2e', halo: '#2a1250', border: '#f59e0b', hero: '🪔', heroMotion: 'pulse', scatter: ['🌺', '🪔', '📿', '✨'],
    title: { text: 'শুভ কালী পূজা', color: '#f59e0b', font: SERIF },
    subtitle: { text: 'Happy Kali Puja', color: '#fde68a' },
    message: { text: 'May Maa Kali bless you with\nstrength, courage and protection', color: '#fde68a' },
  },
  {
    id: 'gc-teej', name: 'Hariyali Teej', icon: '🌿', anim: 'rise', effect: 'flowers',
    background: '#12330f', halo: '#1d4d18', border: '#4ade80', hero: '🌿', heroMotion: 'float', scatter: ['🌸', '🌿', '💚', '✨'],
    title: { text: 'तीज की शुभकामनाएँ', color: '#86efac', font: SERIF, size: 66 },
    subtitle: { text: 'Happy Teej', color: '#dcfce7' },
    message: { text: 'May the swings of Teej bring\njoy, love and greenery your way', color: '#bbf7d0' },
  },
  {
    id: 'gc-nag-panchami', name: 'Nag Panchami', icon: '🐍', anim: 'fade', effect: 'sparkles',
    background: '#1a1205', halo: '#3a2a0a', border: '#facc15', hero: '🐍', heroMotion: 'float', scatter: ['🪔', '🌸', '🥛', '✨'],
    title: { text: 'Nag Panchami', color: '#facc15', font: SERIF },
    subtitle: { text: 'नाग पंचमी की शुभकामनाएँ', color: '#fef9c3' },
    message: { text: 'Blessings and protection on the\nauspicious day of Nag Panchami', color: '#fde68a' },
  },
  {
    id: 'gc-akshaya-tritiya', name: 'Akshaya Tritiya', icon: '🪙', anim: 'zoom', effect: 'sparkles',
    background: '#1a1205', halo: '#3a2a0a', border: '#d4af37', hero: '🪙', heroMotion: 'pulse', scatter: ['🪙', '🌼', '🪔', '✨'],
    title: { text: 'Akshaya Tritiya', color: '#d4af37', font: SERIF },
    subtitle: { text: 'अक्षय तृतीया की शुभकामनाएँ', color: '#fde68a' },
    message: { text: 'May this Akshaya Tritiya bring\nnever-ending prosperity and joy', color: '#fef3c7' },
  },
  {
    id: 'gc-milad', name: 'Eid Milad-un-Nabi', icon: '🕌', anim: 'fade', effect: 'sparkles',
    background: '#062821', halo: '#0b3d33', border: '#d4af37', hero: '🕌', heroMotion: 'pulse', scatter: ['🌙', '🏮', '📿', '✨'],
    title: { text: 'عید میلاد النبی', color: '#d4af37', font: SERIF, size: 66 },
    subtitle: { text: 'Eid Milad-un-Nabi Mubarak', color: '#f0e6c8' },
    message: { text: 'Peace and blessings on the\nbirth of the Prophet ﷺ', color: '#e7dcc0' },
  },
  {
    id: 'gc-maha-shivratri', name: 'Maha Shivratri', icon: '🔱', anim: 'fade', effect: 'sparkles',
    background: '#08122e', halo: '#132251', border: '#93c5fd', hero: '🔱', heroMotion: 'pulse', scatter: ['🪔', '🌙', '📿', '✨'],
    title: { text: 'ॐ नमः शिवाय', color: '#93c5fd', font: SERIF },
    subtitle: { text: 'Happy Maha Shivratri', color: '#dbeafe' },
    message: { text: 'May Lord Shiva bless you with\nstrength, peace and prosperity', color: '#bfdbfe' },
  },
  {
    id: 'gc-ram-navami', name: 'Ram Navami', icon: '🏹', anim: 'rise', effect: 'flowers',
    background: '#2a1405', halo: '#5c2c0e', border: '#f59e0b', hero: '🚩', heroMotion: 'float', scatter: ['🪔', '🌼', '🏹', '✨'],
    title: { text: 'जय श्री राम', color: '#fbbf24', font: SERIF },
    subtitle: { text: 'Happy Ram Navami', color: '#fde68a' },
    message: { text: 'May Lord Rama bring virtue, peace\nand happiness to your home', color: '#fed7aa' },
  },
  {
    id: 'gc-hanuman-jayanti', name: 'Hanuman Jayanti', icon: '🚩', anim: 'rise', effect: 'sparkles',
    background: '#3a1405', halo: '#5c2408', border: '#f59e0b', hero: '🙏', heroMotion: 'pulse', scatter: ['🚩', '🪔', '💪', '✨'],
    title: { text: 'जय हनुमान', color: '#fbbf24', font: SERIF },
    subtitle: { text: 'Happy Hanuman Jayanti', color: '#fde68a' },
    message: { text: 'May Bajrangbali bless you with\ncourage, strength and devotion', color: '#fed7aa' },
  },
  {
    id: 'gc-basant-panchami', name: 'Basant Panchami', icon: '📖', anim: 'rise', effect: 'flowers',
    background: '#fff8e0', halo: '#fde68a', hero: '🌼', heroMotion: 'float', scatter: ['📖', '🪈', '🌾', '🦢'],
    title: { text: 'Happy Basant Panchami', color: '#b45309', font: SERIF, size: 58 },
    subtitle: { text: 'सरस्वती पूजा की शुभकामनाएँ', color: '#d97706' },
    message: { text: 'May Maa Saraswati bless you with\nwisdom, knowledge and light', color: '#92610e' },
  },
  {
    id: 'gc-buddha-purnima', name: 'Buddha Purnima', icon: '☸️', anim: 'fade', effect: 'flowers',
    background: '#2a1a05', halo: '#5c3a0e', border: '#f59e0b', hero: '🪷', heroMotion: 'float', scatter: ['☸️', '🪔', '🌸', '✨'],
    title: { text: 'Happy Buddha Purnima', color: '#fbbf24', font: SERIF, size: 60 },
    message: { text: 'May the wisdom of Lord Buddha\nbring you peace and compassion', color: '#fde68a' },
  },
  {
    id: 'gc-bakrid', name: 'Eid al-Adha (Bakrid)', icon: '🕌', anim: 'fade', effect: 'sparkles',
    background: '#062821', border: '#d4af37', hero: '🕌', heroMotion: 'float', scatter: ['🐐', '⭐', '🌙', '✨'],
    title: { text: 'ईद उल-अज़हा मुबारक', color: '#d4af37', font: SERIF, size: 60 },
    subtitle: { text: 'Eid Mubarak', color: '#f0e6c8' },
    message: { text: 'May this Bakrid bring sacrifice,\nblessings and joy to your family', color: '#c7f9ec' },
  },
  {
    id: 'gc-vijayadashami', name: 'Vijayadashami / Vijaya', icon: '🌼', anim: 'rise', effect: 'flowers',
    background: '#2a0f05', halo: '#5c2c0e', border: '#f59e0b', hero: '🌼', heroMotion: 'pulse', scatter: ['🪔', '🌺', '🏹', '✨'],
    title: { text: 'शुभ विजयादशमी', color: '#fbbf24', font: SERIF, size: 64 },
    subtitle: { text: 'Happy Vijayadashami', color: '#fde68a' },
    message: { text: 'May this day of victory bring you\nnew courage and fresh success', color: '#fed7aa' },
  },

  // ── Ganesh Utsav, day by day (Aagman → Chaturthi → Visarjan) ─────────────
  {
    id: 'gc-ganpati-aagman', name: 'Ganpati Aagman (Welcome)', icon: '🥳', anim: 'zoom', effect: 'confetti',
    background: '#3a1405', halo: '#5c2408', border: '#fbbf24', hero: '🕉️', heroMotion: 'bounce', scatter: ['🌺', '🌼', '🌺', '🌼', '🌺'], scatterLayout: 'top-garland',
    eyebrow: { text: 'बाप्पा आले!', color: '#fde68a' },
    title: { text: 'गणपती बाप्पा\nमोरया!', color: '#fbbf24', font: SERIF, size: 76 },
    subtitle: { text: 'Welcome home, Bappa', color: '#fde68a' },
    message: { text: 'ढोल-ताशाच्या गजरात बाप्पाचे\nआगमन — मोदक तयार आहेत!', color: '#fed7aa' },
  },
  {
    id: 'gc-ganpati-visarjan', name: 'Ganpati Visarjan', icon: '🌊', anim: 'fade', effect: 'sparkles',
    background: '#082f49', halo: '#0c4a6e', border: '#fbbf24', hero: '🕉️', heroMotion: 'float', scatter: ['🌊', '🥁', '🌺', '🪔'],
    title: { text: 'पुढच्या वर्षी\nलवकर या!', color: '#fbbf24', font: SERIF, size: 72 },
    subtitle: { text: 'Ganpati Bappa Morya', color: '#bae6fd' },
    message: { text: 'जड अंतःकरणाने निरोप देतो —\nपुन्हा भेटू, बाप्पा!', color: '#e0f2fe' },
  },

  {
    id: 'gc-ganpati-sthapana', name: 'Ganpati Aarti Invitation', icon: '🪔', anim: 'rise', effect: 'sparkles',
    background: '#fffdf5', border: '#c9a34e', hero: '🪔', heroMotion: 'pulse', scatter: ['🪔', '🌺', '🥥', '🌼'],
    eyebrow: { text: 'गणपती स्थापना सोहळा', color: '#a05c2e' },
    title: { text: 'आमच्या घरी\nबाप्पा आले!', color: '#7c3d12', font: SERIF, size: 72 },
    subtitle: { text: 'आरतीला नक्की या', color: '#b3541e' },
    message: { text: '📅 तारीख: __________\n🕖 वेळ: सायं. ७:०० वा.\n🏠 पत्ता: __________', color: '#8a4117' },
    signoff: { text: '— आपले स्नेहांकित', color: '#a05c2e' },
  },
  {
    id: 'gc-eco-ganpati', name: 'Eco-Friendly Bappa', icon: '🌱', anim: 'rise', effect: 'flowers',
    background: '#f2f7ed', halo: '#dcead0', hero: '🪷', heroMotion: 'float', scatter: ['🌱', '🍃', '🪴', '🌿'],
    eyebrow: { text: 'GO GREEN GANESHA', color: '#3f6212' },
    title: { text: 'शाडू मातीचा\nबाप्पा', color: '#365314', font: SERIF, size: 76 },
    subtitle: { text: 'Eco-friendly Ganesha', color: '#4d7c0f' },
    message: { text: 'Bring Bappa home, save the planet —\nclay idols, real devotion 🌍', color: '#3f6212' },
    signoff: { text: 'this year, go eco 🌱', color: '#65a30d' },
  },
  {
    id: 'gc-bal-ganesha', name: 'Bal Ganesha — Kids', icon: '🧒', anim: 'pop', effect: 'balloons',
    background: '#fff1f2', halo: '#ffe4e6', hero: '🕉️', heroMotion: 'bounce', heroSize: 220, heroY: 0.12, scatter: ['🍬', '🎈', '🐭', '⭐'],
    eyebrow: { text: '“माझे मोदक कोणी खाल्ले?” 😋', color: '#be185d' },
    title: { text: 'बाल गणेशा', color: '#9d174d', font: SERIF, size: 84 },
    subtitle: { text: 'Bappa loves you, little one!', color: '#db2777' },
    message: { text: 'Modaks, mushak-rides and magic —\na very happy Ganesh Chaturthi!', color: '#be185d' },
  },
  {
    id: 'gc-ganpati-tribute', name: 'Bappa Salutes — On-Duty Heroes', icon: '🫡', anim: 'rise', effect: 'sparkles',
    background: '#26210f', halo: '#3d351a', border: '#d4af37', hero: '🙏', heroMotion: 'pulse', scatter: ['👮', '🩺', '🎖️', '🇮🇳'],
    eyebrow: { text: 'ON DUTY THIS VISARJAN', color: '#d4af37' },
    title: { text: 'बाप्पा सोबत,\nसेवेत सदैव', color: '#fde68a', font: SERIF, size: 66 },
    subtitle: { text: 'Salute to Police, Doctors & Jawans', color: '#e7dcc0' },
    message: { text: 'While we celebrate, they protect —\nBappa blesses those who serve', color: '#d6cba4' },
  },
  {
    id: 'gc-ganpati-corporate', name: 'Corporate Ganpati — Minimal', icon: '🪷', anim: 'fade',
    background: '#faf7f2', border: '#c9a34e', hero: '🪷', heroMotion: 'float', heroSize: 120, heroY: 0.2, scatter: ['✨', '🪔'],
    eyebrow: { text: 'FROM ALL OF US AT YOUR WORKPLACE', color: '#8a6d2f' },
    title: { text: 'Welcoming\nLord Ganesha', color: '#5c451a', font: SERIF, size: 70 },
    message: { text: 'May new beginnings, clear minds and\nremoved obstacles find every desk', color: '#7c5c1e' },
    signoff: { text: '— team & management', color: '#a08339' },
  },
  {
    id: 'gc-gauri-aavahan', name: 'Gauri Aavahan', icon: '🌺', anim: 'rise', effect: 'flowers',
    background: '#4a0519', halo: '#7a1533', border: '#fbbf24', hero: '👑', heroMotion: 'pulse', scatter: ['🌺', '🪔', '💛', '✨'],
    eyebrow: { text: 'गौरी आगमन', color: '#fda4af' },
    title: { text: 'माहेरवाशीण\nगौराई आली!', color: '#fbbf24', font: SERIF, size: 68 },
    subtitle: { text: 'Gauri Aavahan', color: '#fecdd3' },
    message: { text: 'सोन्याच्या पावलांनी गौराई घरी आली —\nसुख, समृद्धी घेऊन आली', color: '#fed7aa' },
  },

  // ── Durga Puja, day by day (Maa's arrival → Ashtami → Sindoor Khela) ─────
  {
    id: 'gc-durga-puja', name: 'Durga Puja (Maa Aschen)', icon: '🌺', anim: 'rise', effect: 'flowers',
    background: '#3a0d1a', halo: '#5c1a2e', border: '#fbbf24', hero: '🌺', heroMotion: 'pulse', scatter: ['🥁', '🪔', '🌼', '✨'],
    eyebrow: { text: 'মা আসছেন', color: '#fda4af' },
    title: { text: 'শুভ দুর্গা পূজা', color: '#fbbf24', font: SERIF, size: 76 },
    subtitle: { text: 'Shubho Durga Pujo', color: '#fde68a' },
    message: { text: 'May Maa Durga bring strength,\njoy and pandal-hopping evenings', color: '#fecdd3' },
  },
  {
    id: 'gc-durga-ashtami', name: 'Maha Ashtami', icon: '🪔', anim: 'fade', effect: 'sparkles',
    background: '#2a0a2e', halo: '#4a1250', border: '#d4af37', hero: '🙏', heroMotion: 'pulse', scatter: ['🌺', '🪔', '📿', '🥁'],
    eyebrow: { text: 'শুভ মহাষ্টমী', color: '#e9d5ff' },
    title: { text: 'Maha Ashtami', color: '#d4af37', font: SERIF, size: 70 },
    subtitle: { text: 'পুষ্পাঞ্জলি', color: '#f5d0fe' },
    message: { text: 'May the pushpanjali of Ashtami\nfill your home with blessings', color: '#d8b4fe' },
  },
  {
    id: 'gc-sindoor-khela', name: 'Sindoor Khela / Bijoya', icon: '🔴', anim: 'pop', effect: 'confetti',
    background: '#450a0a', halo: '#7f1d1d', border: '#fbbf24', hero: '🌺', heroMotion: 'beat', scatter: ['🪔', '🥁', '🍬', '✨'],
    eyebrow: { text: 'শুভ বিজয়া', color: '#fecaca' },
    title: { text: 'Shubho Bijoya', color: '#fbbf24', font: SERIF, size: 74 },
    subtitle: { text: 'সিঁদুর খেলার শুভেচ্ছা', color: '#fda4af' },
    message: { text: 'Aschhe bochhor abar hobe! Sweets,\nsindoor and love till next year', color: '#fed7aa' },
  },

  {
    id: 'gc-mahalaya', name: 'Mahalaya — Maa Aschen', icon: '👁️', anim: 'fade', effect: 'sparkles',
    background: '#0c4a6e', halo: '#155e83', border: '#fbbf24', hero: '👁️', heroMotion: 'pulse', scatter: ['🌾', '☁️', '🌾', '☁️', '🌾'], scatterLayout: 'top-garland',
    eyebrow: { text: 'মহালয়া', color: '#bae6fd' },
    title: { text: 'মা আসছেন', color: '#fbbf24', font: SERIF, size: 96 },
    subtitle: { text: 'Pujo countdown begins!', color: '#e0f2fe' },
    message: { text: 'ভোরের চণ্ডীপাঠ, কাশফুলের মাঠ —\nআকাশে-বাতাসে পুজো পুজো গন্ধ', color: '#bae6fd' },
  },
  {
    id: 'gc-dhunuchi', name: 'Dhunuchi Naach — Navami', icon: '🔥', anim: 'pop', effect: 'sparkles',
    background: '#1c0a02', halo: '#431407', border: '#fb923c', hero: '🔥', heroMotion: 'shake', scatter: ['🥁', '💨', '🌺', '✨'],
    eyebrow: { text: 'মহানবমী', color: '#fdba74' },
    title: { text: 'ধুনুচি নাচ', color: '#fb923c', font: SERIF, size: 88 },
    subtitle: { text: 'Dhaak beats & dhunuchi smoke', color: '#fed7aa' },
    message: { text: 'ঢাকের তালে, ধুনোর গন্ধে —\nনবমীর রাত জমে উঠুক!', color: '#fdba74' },
  },
  {
    id: 'gc-bijoya-pronam', name: 'Bijoya Pronam — To Elders', icon: '🙏', anim: 'fade', effect: 'flowers',
    background: '#fffbf5', border: '#b91c1c', hero: '🙏', heroMotion: 'pulse', scatter: ['🌺', '🪔', '🍬', '🤍'],
    eyebrow: { text: 'শুভ বিজয়া', color: '#b91c1c' },
    title: { text: 'বিজয়ার প্রণাম\nও শুভেচ্ছা', color: '#7f1d1d', font: SERIF, size: 66 },
    message: { text: 'গুরুজনদের প্রণাম, ছোটদের ভালোবাসা —\nসবার জীবন আনন্দে ভরে উঠুক', color: '#991b1b' },
    signoff: { text: '— আপনার স্নেহের', color: '#b91c1c' },
  },
  {
    id: 'gc-pandal-hopping', name: 'Pandal Hopping — Story', icon: '📿', anim: 'zoom', effect: 'confetti', w: 1080, h: 1920,
    background: '#1e1b4b', hero: '🎪', heroMotion: 'bounce', scatter: ['👗', '🥁', '🌯', '📸'],
    eyebrow: { text: 'OOTD: লাল পাড় সাদা শাড়ি', color: '#f9a8d4' },
    title: { text: 'Pandal Hopping\nLoading…', color: '#ffffff', size: 84 },
    subtitle: { text: 'অষ্টমীর অঞ্জলি ✅ ফুচকা ✅', color: '#c7d2fe' },
    message: { text: 'Anjali by morning, phuchka by night —\nsee you at the pandal! 🫶', color: '#a5b4fc' },
    signoff: { text: '#PujoVibes', color: '#818cf8' },
  },

  // ── Chhath Puja — the Sandhya Arghya evening at the ghat ─────────────────
  {
    id: 'gc-chhath-arghya', name: 'Chhath — Sandhya Arghya', icon: '🌇', anim: 'rise', effect: 'sparkles',
    background: '#431407', halo: '#7c2d12', border: '#fbbf24', hero: '🌇', heroMotion: 'pulse', heroY: 0.06, scatter: ['🧺', '🍌', '🥥', '🪔'], scatterLayout: 'bottom-row',
    eyebrow: { text: 'जय छठी मईया', color: '#fdba74' },
    title: { text: 'छठ महापर्व की\nशुभकामनाएँ', color: '#fbbf24', font: SERIF, size: 68 },
    subtitle: { text: 'Sandhya Arghya', color: '#fde68a' },
    message: { text: 'Standing in the holy water, facing\nthe setting sun — may every wish\nbe granted by Chhathi Maiya', color: '#fed7aa' },
  },
  {
    id: 'gc-chhath-nahay-khay', name: 'Chhath Day 1 — Nahay Khay', icon: '🛁', anim: 'rise', effect: 'flowers',
    background: '#0c3a2e', halo: '#14523f', border: '#fbbf24', hero: '🌊', heroMotion: 'float', scatter: ['🎃', '🍚', '🌿', '🪔'],
    eyebrow: { text: 'छठ महापर्व • पहला दिन', color: '#86efac' },
    title: { text: 'नहाय-खाय', color: '#fbbf24', font: SERIF, size: 88 },
    subtitle: { text: 'कद्दू-भात के परसाद', color: '#dcfce7' },
    message: { text: 'गंगा स्नान आ सात्विक भोजन से\nमहापर्व के सुरुआत — जय छठी मईया', color: '#bbf7d0' },
  },
  {
    id: 'gc-chhath-kharna', name: 'Chhath Day 2 — Kharna', icon: '🍚', anim: 'fade', effect: 'sparkles',
    background: '#3a2405', halo: '#5c3a08', border: '#fbbf24', hero: '🥣', heroMotion: 'pulse', scatter: ['🍚', '🥛', '🌾', '🪔'],
    eyebrow: { text: 'छठ महापर्व • दूसरा दिन', color: '#fdba74' },
    title: { text: 'खरना', color: '#fbbf24', font: SERIF, size: 100 },
    subtitle: { text: 'गुड़ के खीर, रोटी आ केला', color: '#fde68a' },
    message: { text: 'खरना के परसाद ग्रहण करीं —\nछठी मईया के आशीर्वाद मिले', color: '#fed7aa' },
  },
  {
    id: 'gc-chhath-usha-arghya', name: 'Chhath Day 4 — Usha Arghya', icon: '🌅', anim: 'rise', effect: 'sparkles',
    background: '#7c2d12', halo: '#9a3412', border: '#fde047', hero: '🌅', heroMotion: 'pulse', heroY: 0.06, scatter: ['🧺', '🎋', '🥥', '🍌'], scatterLayout: 'bottom-row',
    eyebrow: { text: 'उगऽ हे सुरुज देव', color: '#fde047' },
    title: { text: 'उषा अर्घ्य', color: '#fef08a', font: SERIF, size: 92 },
    subtitle: { text: 'ठेकुआ के परसाद, उगते सूरज के अरघ', color: '#fde68a' },
    message: { text: 'केलवा के पात पर उगेलन सुरुज देव —\nछठी मईया रउआ पर किरपा बरसावें', color: '#fed7aa' },
  },
  {
    id: 'gc-chhath-vratin', name: 'Salute the Vratin — मेरी माँ', icon: '🧡', anim: 'fade', effect: 'sparkles',
    background: '#431407', halo: '#7c2d12', hero: '🙇', heroMotion: 'pulse', scatter: ['🧡', '🌅', '🧺', '🪔'],
    eyebrow: { text: '36 घंटे निर्जला व्रत', color: '#fdba74' },
    title: { text: 'मेरी माँ,\nमेरा गर्व', color: '#fde047', font: SERIF, size: 76 },
    subtitle: { text: 'A salute to every vratin', color: '#fde68a' },
    message: { text: 'जो अपने परिवार खातिर 36 घंटा\nनिर्जला रहेली — उनका के प्रणाम', color: '#fed7aa' },
  },

  // ── National days (India) ────────────────────────────────────────────────
  {
    id: 'gc-independence-day-in', name: 'Independence Day (India)', icon: '🇮🇳', anim: 'rise', effect: 'sparkles',
    background: '#0b1d3a', hero: '🇮🇳', heroMotion: 'wobble', scatter: ['🎈', '🕊️', '⭐', '🎆'],
    eyebrow: { text: '15TH AUGUST', color: '#fb923c' },
    title: { text: 'Happy\nIndependence Day', color: '#ffffff', size: 60 },
    subtitle: { text: 'जय हिंद 🇮🇳', color: '#86efac' },
    message: { text: 'Saluting the spirit of freedom —\nproud to be Indian', color: '#bae6fd' },
  },
  {
    id: 'gc-republic-day-in', name: 'Republic Day (India)', icon: '🇮🇳', anim: 'rise', effect: 'sparkles',
    background: '#0b1d3a', hero: '🇮🇳', heroMotion: 'float', scatter: ['🕊️', '⭐', '🎖️', '🎆'],
    eyebrow: { text: '26TH JANUARY', color: '#fb923c' },
    title: { text: 'Happy\nRepublic Day', color: '#ffffff', size: 66 },
    subtitle: { text: 'जय हिंद 🇮🇳', color: '#86efac' },
    message: { text: 'Honouring our Constitution and\nthe unity of a proud nation', color: '#bae6fd' },
  },
  {
    id: 'gc-gandhi-jayanti', name: 'Gandhi Jayanti', icon: '🕊️', anim: 'fade',
    background: '#f8fafc', border: '#cbd5e1', hero: '🕊️', heroMotion: 'float', scatter: ['🌼', '🇮🇳', '📿', '🤍'],
    eyebrow: { text: '2ND OCTOBER', color: '#64748b' },
    title: { text: 'Gandhi Jayanti', color: '#334155', size: 68 },
    message: { text: '“Be the change you wish to see\nin the world.” — Mahatma Gandhi', color: '#475569' },
    signoff: { text: 'peace & non-violence', color: '#94a3b8' },
  },
  {
    id: 'gc-childrens-day-in', name: "Children's Day (India)", icon: '🧒', anim: 'pop', effect: 'balloons',
    background: '#eef7ff', halo: '#d5ebff', hero: '🧒', heroMotion: 'bounce', scatter: ['🎈', '🖍️', '🧸', '⭐'],
    eyebrow: { text: '14TH NOVEMBER', color: '#2563eb' },
    title: { text: "Happy\nChildren's Day", color: '#1d4ed8', size: 64 },
    message: { text: 'Celebrating little dreamers and\ntheir big, bright futures', color: '#3b82f6' },
    signoff: { text: 'stay curious! ✨', color: '#1d4ed8' },
  },

  {
    id: 'gc-labour-day', name: "Labour Day (1st May)", icon: '🛠️', anim: 'rise', effect: 'sparkles',
    background: '#1c1917', halo: '#292524', border: '#f59e0b', hero: '🛠️', heroMotion: 'wobble', scatter: ['👷', '⚙️', '🌾', '⭐'],
    eyebrow: { text: '1ST MAY • INTERNATIONAL WORKERS’ DAY', color: '#fdba74' },
    title: { text: 'Happy\nLabour Day', color: '#fbbf24', size: 68 },
    subtitle: { text: 'मज़दूर दिवस की शुभकामनाएँ', color: '#fde68a' },
    message: { text: 'Saluting every hand that builds\nour nation, every single day', color: '#fed7aa' },
  },
  {
    id: 'gc-maharashtra-day', name: 'Maharashtra Day (1st May)', icon: '🚩', anim: 'rise', effect: 'confetti',
    background: '#3a1405', halo: '#5c2408', border: '#fbbf24', hero: '🚩', heroMotion: 'float', scatter: ['🏰', '🥁', '🌺', '⭐'],
    eyebrow: { text: '१ मे • महाराष्ट्र दिन', color: '#fdba74' },
    title: { text: 'महाराष्ट्र दिनाच्या\nहार्दिक शुभेच्छा', color: '#fbbf24', font: SERIF, size: 64 },
    subtitle: { text: 'Happy Maharashtra Day', color: '#fde68a' },
    message: { text: 'गर्जा महाराष्ट्र माझा —\nमराठी असल्याचा अभिमान!', color: '#fed7aa' },
  },

  // ── Trending — support / awareness posters people share every day ─────────
  {
    id: 'gc-support-campaign', name: 'I Support — Campaign Poster', icon: '✊', anim: 'zoom', effect: 'sparkles',
    background: '#0c1b3a', hero: '✊', heroMotion: 'beat', scatter: ['🇮🇳', '📢', '⭐', '🕊️'],
    eyebrow: { text: 'ONE VOICE • ONE SUPPORT', color: '#fca5a5' },
    title: { text: 'I Support', color: '#ffffff', size: 96 },
    subtitle: { text: 'add the name of your cause here', color: '#93c5fd' },
    message: { text: 'This is not just their fight —\nit is our fight for a better tomorrow', color: '#bfdbfe' },
    signoff: { text: 'share if you stand with us ✊', color: '#93c5fd' },
  },
  {
    id: 'gc-proud-indian', name: 'Proud Indian', icon: '🇮🇳', anim: 'rise', effect: 'sparkles',
    background: '#0b1d3a', hero: '🇮🇳', heroMotion: 'wobble', scatter: ['🕊️', '⭐', '🎖️', '🪷'],
    eyebrow: { text: 'सारे जहाँ से अच्छा', color: '#fb923c' },
    title: { text: 'Proud to be\nIndian', color: '#ffffff', size: 76 },
    message: { text: 'One nation, a hundred languages,\na billion dreams — जय हिंद', color: '#bae6fd' },
  },
  {
    id: 'gc-team-india', name: 'Team India — Match Day', icon: '🏏', anim: 'pop', effect: 'confetti',
    background: '#052e5c', hero: '🏏', heroMotion: 'bounce', scatter: ['🇮🇳', '🏆', '🎉', '🔥'],
    eyebrow: { text: 'MATCH DAY', color: '#fbbf24' },
    title: { text: 'Come on,\nIndia!', color: '#ffffff', size: 88 },
    message: { text: 'Bleed blue with us today —\nजीतेगा भई जीतेगा! 🏆', color: '#bfdbfe' },
    signoff: { text: '#TeamIndia', color: '#93c5fd' },
  },
  {
    id: 'gc-save-nature', name: 'Save Nature — Awareness', icon: '🌍', anim: 'rise', effect: 'flowers',
    background: '#052e16', halo: '#14532d', hero: '🌍', heroMotion: 'float', scatter: ['🌱', '💧', '🌳', '♻️'],
    eyebrow: { text: 'THERE IS NO PLANET B', color: '#86efac' },
    title: { text: 'Save Nature,\nSave Future', color: '#dcfce7', size: 72 },
    message: { text: 'Plant one tree, save one drop —\nsmall steps, one big tomorrow', color: '#bbf7d0' },
    signoff: { text: 'share to spread the word 🌱', color: '#4ade80' },
  },
  {
    id: 'gc-countdown-bappa', name: 'Bappa Countdown — Story', icon: '⏳', anim: 'zoom', effect: 'sparkles', w: 1080, h: 1920,
    background: '#3a1405', halo: '#5c2408', border: '#fbbf24', hero: '🕉️', heroMotion: 'bounce', scatter: ['🥁', '🌺', '⏳', '✨'],
    eyebrow: { text: 'आतुरता शिगेला!', color: '#fdba74' },
    title: { text: '2 Days\nTo Go!', color: '#fbbf24', size: 130 },
    subtitle: { text: 'बाप्पा येतोय…', color: '#fde68a' },
    message: { text: 'Decoration ✅ Modak order ✅\nDhol practice ✅ Dil ready ✅', color: '#fed7aa' },
    signoff: { text: '#GanpatiBappaMorya', color: '#fb923c' },
  },
  {
    id: 'gc-voted-today', name: 'I Did My Part — Voter', icon: '🗳️', anim: 'pop', effect: 'confetti',
    background: '#0c1b3a', halo: '#13294f', hero: '☝️', heroMotion: 'pulse', scatter: ['🗳️', '🇮🇳', '✅', '⭐'],
    eyebrow: { text: 'मैंने मतदान किया', color: '#93c5fd' },
    title: { text: 'I Did\nMy Part!', color: '#ffffff', size: 92 },
    subtitle: { text: 'proud voter 🖋️', color: '#bfdbfe' },
    message: { text: 'One finger, one ink dot,\none stronger democracy', color: '#93c5fd' },
    signoff: { text: 'have you voted yet?', color: '#60a5fa' },
  },
  {
    id: 'gc-birthday-flex', name: 'Birthday Flex — Fan Style', icon: '🎖️', anim: 'zoom', effect: 'confetti',
    background: '#2a0a2e', halo: '#4a1250', border: '#fbbf24', hero: '🎂', heroMotion: 'beat', scatter: ['🎉', '💐', '🎖️', '📸'],
    eyebrow: { text: 'समस्त शुभचिंतकों की ओर से', color: '#f5d0fe' },
    title: { text: 'जन्मदिन की हार्दिक\nशुभकामनाएं', color: '#fbbf24', font: SERIF, size: 62 },
    subtitle: { text: 'हमारे प्रिय भैया / दीदी को', color: '#e9d5ff' },
    message: { text: 'आपका जीवन यश, कीर्ति और\nसफलता से भरा रहे 🙏', color: '#d8b4fe' },
    signoff: { text: '— आपके अपने', color: '#c084fc' },
  },
  {
    id: 'gc-diet-diwali', name: 'Diet Starts After Diwali', icon: '😅', anim: 'pop', effect: 'confetti',
    background: '#160a2e', halo: '#2a1250', hero: '🍬', heroMotion: 'wobble', scatter: ['🪔', '🍩', '🍫', '😋'],
    eyebrow: { text: 'BREAKING NEWS', color: '#f9a8d4' },
    title: { text: 'Diet starts\nafter Diwali', color: '#fbbf24', size: 80 },
    subtitle: { text: 'kaju katli > calories', color: '#fde68a' },
    message: { text: 'Current status: 4th box of mithai,\nzero regrets ✨', color: '#e9d5ff' },
    signoff: { text: 'tag a mithai lover 😂', color: '#c084fc' },
  },

  // ── Festival offer posters — shops & small businesses ────────────────────
  {
    id: 'gc-dhanteras', name: 'Shubh Dhanteras', icon: '🪙', anim: 'zoom', effect: 'sparkles',
    background: '#1a1205', halo: '#3a2a0a', border: '#d4af37', hero: '🏺', heroMotion: 'pulse', scatter: ['🪙', '💰', '🪔', '✨'],
    title: { text: 'शुभ धनतेरस', color: '#d4af37', font: SERIF },
    subtitle: { text: 'Happy Dhanteras', color: '#fde68a' },
    message: { text: 'May Lord Dhanvantari and Maa\nLakshmi fill your home with wealth', color: '#fef3c7' },
  },
  {
    id: 'gc-dhanteras-offer', name: 'Dhanteras Offer — Shop Poster', icon: '🛍️', anim: 'zoom', effect: 'sparkles',
    background: '#1a1205', halo: '#3a2a0a', border: '#d4af37', hero: '💰', heroMotion: 'pulse', scatter: ['🪙', '💍', '🪔', '🛍️'],
    eyebrow: { text: 'धनतेरस स्पेशल — शुभ मुहूर्त पर खरीदें', color: '#fde68a' },
    title: { text: 'UP TO\n25% OFF', color: '#fbbf24', size: 110 },
    subtitle: { text: 'आपकी दुकान का नाम यहाँ', color: '#fef3c7' },
    message: { text: 'Gold • Silver • Utensils • Electronics\nशुभ मुहूर्त: पूरे दिन', color: '#fde68a' },
    signoff: { text: '📞 98XXX XXXXX • अभी संपर्क करें', color: '#fbbf24' },
  },
  {
    id: 'gc-diwali-sale', name: 'Diwali Dhamaka Sale', icon: '🏷️', anim: 'zoom', effect: 'confetti',
    background: '#2a0a2e', halo: '#4a1250', border: '#fbbf24', hero: '🎇', heroMotion: 'pulse', scatter: ['🏷️', '🛍️', '🪔', '🎁'],
    eyebrow: { text: 'दिवाली धमाका ऑफर', color: '#f5d0fe' },
    title: { text: 'FLAT\n50% OFF', color: '#fbbf24', size: 120 },
    subtitle: { text: 'Your Shop Name Here', color: '#fde68a' },
    message: { text: 'इस दिवाली, पूरे परिवार के लिए —\nकपड़े • ज्वेलरी • इलेक्ट्रॉनिक्स', color: '#e9d5ff' },
    signoff: { text: '📞 98XXX XXXXX • Limited period!', color: '#f0abfc' },
  },
  {
    id: 'gc-ganpati-offer', name: 'Ganpati Special — Shop Poster', icon: '🛒', anim: 'pop', effect: 'sparkles',
    background: '#3a1405', halo: '#5c2408', border: '#fbbf24', hero: '🕉️', heroMotion: 'pulse', scatter: ['🌺', '🏷️', '🪔', '🍬'],
    eyebrow: { text: 'गणेशोत्सव स्पेशल', color: '#fdba74' },
    title: { text: 'उत्सव ऑफर\n20% OFF', color: '#fbbf24', size: 88 },
    subtitle: { text: 'तुमच्या दुकानाचे नाव येथे', color: '#fde68a' },
    message: { text: 'सजावट • मूर्ती • मिठाई • पूजा साहित्य\nसंपूर्ण गणेशोत्सवात', color: '#fed7aa' },
    signoff: { text: '📞 98XXX XXXXX • आजच या!', color: '#fb923c' },
  },

  // ── Fresh & modern (2025-26 trends: butter yellow, lilac, cream neutrals,
  //    big bold type, witty copy, minimal decoration — the Paperless-Post
  //    look, not the glitter-GIF look) ──────────────────────────────────────
  {
    id: 'gc-bday-butter', name: 'Birthday — Butter Yellow Bold', icon: '🍋', anim: 'pop', effect: 'confetti',
    background: '#f7e27a', hero: '🎂', heroMotion: 'bounce', scatter: ['✨', '🍋', '🌼'],
    title: { text: 'ANOTHER YEAR\nOF YOU', color: '#1a1a1a', font: SANS, size: 88 },
    subtitle: { text: 'and honestly, we’re lucky', color: '#3d3d3d' },
    message: { text: 'Happy birthday —\ncelebrate loudly 🎉', color: '#1a1a1a' },
  },
  {
    id: 'gc-bday-minimal-luxe', name: 'Birthday — Minimal Luxe', icon: '🕊️', anim: 'fade',
    background: '#f2f0eb', hero: '🕊️', heroMotion: 'float', heroSize: 130, heroY: 0.18, scatter: ['✨', '🥂'],
    title: { text: 'happy birthday', color: '#c9a24b', font: SERIF, size: 92 },
    subtitle: { text: 'to someone genuinely rare', color: '#6b6154' },
    message: { text: 'Wishing you a soft,\ngolden year ahead', color: '#8a7d6a' },
  },
  {
    id: 'gc-bday-witty', name: 'Birthday — Older, Wiser, Hot', icon: '🔥', anim: 'zoom', effect: 'sparkles',
    background: '#111111', hero: '🔥', heroMotion: 'beat', scatter: ['😎', '⚡', '🎉'],
    title: { text: 'OLDER. WISER.\nSTILL HOT.', color: '#ffe600', font: SANS, size: 84 },
    subtitle: { text: 'the trifecta', color: '#e5e5e5' },
    message: { text: 'Happy birthday, legend.', color: '#a3a3a3' },
  },
  {
    id: 'gc-bday-lilac', name: 'Birthday — Lilac Dream', icon: '🔮', anim: 'rise', effect: 'sparkles',
    background: '#e6daf5', hero: '🔮', heroMotion: 'pulse', scatter: ['🌙', '✨', '💜'],
    title: { text: 'make a wish', color: '#7c5cbf', font: SERIF, size: 96 },
    subtitle: { text: 'then make it happen', color: '#5b4491' },
    message: { text: 'Happy birthday —\nthis year is yours 💜', color: '#6d54a8' },
  },
  {
    id: 'gc-bday-retro', name: 'Birthday — Groovy Retro', icon: '🌞', anim: 'pop', effect: 'flowers',
    background: '#f4e3c1', hero: '🌞', heroMotion: 'wobble', scatter: ['🌈', '🍄', '✌️'],
    title: { text: 'have a groovy\nbirthday', color: '#c75b39', font: SERIF, size: 78 },
    subtitle: { text: 'you timeless thing, you', color: '#8a5a2e' },
    message: { text: 'Peace, love and\na lot of cake ✌️', color: '#a06a3a' },
  },
  {
    id: 'gc-bday-milestone-editorial', name: 'Milestone Birthday — Editorial', icon: '🖤', anim: 'fade',
    background: '#faf7f2', hero: '🥂', heroMotion: 'pulse', heroSize: 130, heroY: 0.18, scatter: ['✨', '🖤'],
    eyebrow: { text: 'CERTIFIED WHOLE ADULT', color: '#0e4d45' },
    title: { text: 'THIRTY', color: '#0e4d45', font: SANS, size: 150 },
    message: { text: 'Here’s to your best\ndecade yet', color: '#3c6b63' },
    signoff: { text: '(edit the number — works at any age)', color: '#7d968f' },
  },
  {
    id: 'gc-belated-late', name: 'Belated Birthday — Fashionably Late', icon: '🐢', anim: 'slide-left',
    background: '#ffefd6', hero: '🐢', heroMotion: 'wobble', scatter: ['⏰', '🎈', '😅'],
    title: { text: 'FASHIONABLY\nLATE', color: '#e86a33', font: SANS, size: 88 },
    subtitle: { text: 'like all great things', color: '#a1522a' },
    message: { text: 'Happy belated birthday —\nthe party continues', color: '#c05f2e' },
  },
  {
    id: 'gc-thanks-botanical', name: 'Thank You — Terracotta Botanical', icon: '🌿', anim: 'rise', effect: 'flowers',
    background: '#f5ede3', hero: '🌿', heroMotion: 'float', heroSize: 140, scatter: ['🍂', '🌾'],
    title: { text: 'thank you, truly', color: '#c4633a', font: SERIF, size: 84 },
    message: { text: 'You showed up\nwhen it mattered', color: '#8a5a3a' },
    signoff: { text: 'with gratitude', color: '#b07a52' },
  },
  {
    id: 'gc-congrats-pastel', name: 'Congrats — You Did The Thing', icon: '🏆', anim: 'pop', effect: 'confetti',
    background: '#ffd9e8', halo: '#d9ebff', hero: '🏆', heroMotion: 'bounce', scatter: ['🎊', '🫶', '⭐'],
    title: { text: 'YOU DID\nTHE THING', color: '#ff4d8d', font: SANS, size: 92 },
    subtitle: { text: 'we never doubted you (much)', color: '#b23367' },
    message: { text: 'Congratulations!', color: '#d13d78' },
  },
  {
    id: 'gc-newjob-witty', name: 'New Job — Who Dis?', icon: '💼', anim: 'zoom', effect: 'confetti',
    background: '#eaf4ef', hero: '💼', heroMotion: 'bounce', scatter: ['🚀', '🎉', '📈'],
    title: { text: 'NEW JOB,\nWHO DIS?', color: '#147d64', font: SANS, size: 92 },
    subtitle: { text: 'they’re lucky to have you', color: '#3d6b5c' },
    message: { text: 'Congratulations on\nthe next chapter', color: '#2a5a4b' },
  },
  {
    id: 'gc-baby-sage', name: 'New Baby — Hello Little One', icon: '🐣', anim: 'fade',
    background: '#e9f0e4', hero: '🐣', heroMotion: 'float', scatter: ['🌱', '🤍', '🧸'],
    title: { text: 'hello, little one', color: '#6f8f6b', font: SERIF, size: 84 },
    subtitle: { text: 'the world just got softer', color: '#5a745a' },
    message: { text: 'Congratulations on\nyour new arrival', color: '#728c6e' },
  },
  {
    id: 'gc-anniv-foil', name: 'Anniversary — Biggest Fan', icon: '💍', anim: 'fade', effect: 'sparkles',
    background: '#fbf6ef', hero: '💍', heroMotion: 'pulse', heroSize: 130, heroY: 0.18, scatter: ['🥂', '✨'],
    title: { text: 'still your\nbiggest fan', color: '#b08d57', font: SERIF, size: 82 },
    subtitle: { text: 'year after year', color: '#8a7a5e' },
    message: { text: 'Happy anniversary 🤍', color: '#9c8a68' },
  },
  {
    id: 'gc-getwell-softblue', name: 'Get Well — Rest Up', icon: '🍵', anim: 'fade',
    background: '#e3eef7', hero: '🍵', heroMotion: 'float', scatter: ['☁️', '💙', '🌤️'],
    title: { text: 'rest up,\nsuperstar', color: '#3e7cb1', font: SERIF, size: 84 },
    subtitle: { text: 'the world can wait', color: '#4b6e8c' },
    message: { text: 'Sending soup-level comfort\nand quick healing', color: '#5a7fa0' },
  },
  {
    id: 'gc-thinking-hug', name: 'Thinking of You — Hug', icon: '🫂', anim: 'rise', effect: 'hearts',
    background: '#fdede3', hero: '🫂', heroMotion: 'beat', scatter: ['🌻', '☀️', '💛'],
    title: { text: 'consider\nyourself hugged', color: '#d96c5f', font: SERIF, size: 76 },
    subtitle: { text: 'from exactly this far away', color: '#a15a4e' },
    message: { text: 'Thinking of you today 💛', color: '#c06a58' },
  },
  {
    id: 'gc-just-because', name: 'Just Because — You’re Great', icon: '🌻', anim: 'pop', effect: 'flowers',
    background: '#fff9e3', hero: '🌻', heroMotion: 'wobble', scatter: ['☀️', '😊', '💛'],
    eyebrow: { text: 'NO OCCASION', color: '#b58218' },
    title: { text: 'you’re just\ngreat', color: '#f5a623', font: SANS, size: 92 },
    message: { text: 'That’s it.\nThat’s the card.', color: '#8f6a1c' },
  },
  {
    id: 'gc-wedding-serif', name: 'Wedding — Modern Serif', icon: '🤍', anim: 'fade', effect: 'sparkles',
    background: '#f7f3ee', hero: '🤍', heroMotion: 'pulse', heroSize: 120, heroY: 0.18, scatter: ['🥂', '💐'],
    title: { text: 'to love, laughter &\nhappily ever after', color: '#9a8873', font: SERIF, size: 68 },
    message: { text: 'Congratulations,\nyou two', color: '#7d6c58' },
  },
  {
    id: 'gc-diwali-modern', name: 'Diwali — Modern Maroon & Gold', icon: '🪔', anim: 'zoom', effect: 'sparkles',
    background: '#4a0e0e', hero: '🪔', heroMotion: 'pulse', scatter: ['🪔', '🪔', '🪔', '🪔', '🪔'], scatterLayout: 'bottom-row',
    title: { text: 'शुभ दीपावली', color: '#f2b237', font: SERIF, size: 88 },
    subtitle: { text: 'may your light outshine everything', color: '#f5d9a0' },
    message: { text: 'Happy Diwali\nto you and yours', color: '#e8c37e' },
  },
  {
    id: 'gc-holi-colorpop', name: 'Holi — Color Pop', icon: '💥', anim: 'pop', effect: 'confetti',
    background: '#fff8ee', hero: '🎨', heroMotion: 'shake', scatter: ['💥', '🌈', '🩷'],
    title: { text: 'HAPPY HOLI', color: '#e91e8c', font: SANS, size: 96 },
    subtitle: { text: 'get gloriously messy', color: '#8c3a6b' },
    message: { text: 'Wishing you a\nriot of color', color: '#b0347a' },
  },
  {
    id: 'gc-eid-emerald', name: 'Eid — Minimal Emerald', icon: '🌙', anim: 'fade', effect: 'moon',
    background: '#0e3b2e', hero: '🌙', heroMotion: 'float', heroSize: 140, scatter: ['✨', '⭐'],
    title: { text: 'Eid Mubarak', color: '#d9b45b', font: SERIF, size: 92 },
    message: { text: 'peace, joy and\neverything sweet', color: '#c9e0d5' },
  },

  // ── Next-gen visual cards (aurora gradients + grain, faux-3D balloon
  //    titles, tap-to-add photo slots, glass panels — the techniques modern
  //    template platforms use, impossible with a forwarded GIF) ─────────────
  {
    id: 'gc-3d-birthday', name: 'Birthday — 3D Balloon Text', icon: '🎈', anim: 'pop', effect: 'balloons',
    background: '#ffd9a0', bg2: '#ff8fab', bgAngle: 160, grain: true, aurora: ['#fff3c4', '#ffb3c6'],
    hero: '🎈', heroMotion: 'float', scatter: ['🎂', '🎁', '🎉'],
    title: { text: 'HAPPY\nBIRTHDAY!', color: '#ffffff', font: SANS, size: 108, style: '3d', depth: '#c2417c' },
    subtitle: { text: 'let’s make it unforgettable', color: '#7c2d55' },
    message: { text: 'Big balloons, bigger wishes —\nthis day is all yours', color: '#8a3a63' },
  },
  {
    id: 'gc-photo-birthday', name: 'Birthday — Add Your Photo', icon: '🖼️', anim: 'zoom', effect: 'confetti',
    background: '#1f2b4d', bg2: '#4c1d95', grain: true,
    hero: '🎂', heroMotion: 'bounce', photo: { shape: 'circle' }, scatter: ['🎈', '⭐'],
    eyebrow: { text: 'LOOK WHO’S CELEBRATING', color: '#f5d78a' },
    title: { text: 'Happy Birthday!', color: '#f5d78a', font: SERIF, size: 76 },
    message: { text: 'Tap the circle, add their photo —\nand make it personal', color: '#c7d2fe' },
  },
  {
    id: 'gc-photo-anniversary', name: 'Anniversary — Photo Heart', icon: '💞', anim: 'fade', effect: 'hearts',
    background: '#3b0a1e', bg2: '#7a1533', grain: true,
    hero: '💞', heroMotion: 'beat', photo: { shape: 'heart' }, scatter: ['🌹', '✨'],
    title: { text: 'Still Us.', color: '#ffd166', font: SERIF, size: 88 },
    subtitle: { text: 'add your favourite photo together', color: '#f5c6d8' },
    message: { text: 'Every year, a better picture —\nhappy anniversary', color: '#fde8ef' },
  },
  {
    id: 'gc-photo-rakhi', name: 'Rakhi — Photo Card', icon: '🪢', anim: 'rise', effect: 'sparkles',
    background: '#fff1e6', bg2: '#ffd9b0', grain: true,
    hero: '🪢', heroMotion: 'wobble', photo: { shape: 'circle' }, scatter: ['🎁', '🌺'],
    title: { text: 'भाई-बहन\nforever', color: '#b3541e', font: SERIF, size: 72 },
    message: { text: 'Add your favourite photo together —\nHappy Raksha Bandhan', color: '#8a4117' },
  },
  {
    id: 'gc-aurora-newyear', name: 'New Year — Aurora Night', icon: '🌌', anim: 'zoom', effect: 'sparkles',
    background: '#050a1f', bg2: '#134e4a', bgAngle: 20, grain: true, aurora: ['#2dd4bf', '#7c3aed', '#0ea5e9'],
    hero: '🎆', heroMotion: 'pulse', scatter: ['🎇', '🥂', '✨'],
    title: { text: 'HELLO,\n2027', color: '#5eead4', font: SANS, size: 130, style: '3d', depth: '#042f2e' },
    message: { text: 'May your year glow like\nthe northern lights', color: '#99f6e4' },
  },
  {
    id: 'gc-glass-diwali', name: 'Diwali — Glass & Glow', icon: '🏮', anim: 'fade', effect: 'sparkles',
    background: '#2a0a2e', bg2: '#7c2d12', bgAngle: 150, grain: true, aurora: ['#f59e0b', '#e11d48'],
    hero: '🪔', heroMotion: 'pulse', panel: true, scatter: ['🪔', '🪔', '🪔', '🪔', '🪔'], scatterLayout: 'bottom-row',
    title: { text: 'शुभ दीपावली', color: '#fbbf24', font: SERIF, size: 84 },
    subtitle: { text: 'the festival of lights', color: '#fde68a' },
    message: { text: 'May every diya you light\nlight something in you', color: '#fed7aa' },
  },
  {
    id: 'gc-glass-eid', name: 'Eid — Emerald Aurora', icon: '🌙', anim: 'fade', effect: 'moon',
    background: '#022c22', bg2: '#155e75', bgAngle: 30, grain: true, aurora: ['#34d399', '#0ea5e9'], panel: true,
    hero: '🌙', heroMotion: 'float', scatter: ['⭐', '🕌', '✨'],
    title: { text: 'Eid Mubarak', color: '#d9b45b', font: SERIF, size: 92 },
    message: { text: 'Peace over everything —\nEid Mubarak to your home', color: '#a7f3d0' },
  },
  {
    id: 'gc-3d-congrats', name: 'Congrats — 3D Bravo', icon: '🏆', anim: 'pop', effect: 'confetti',
    background: '#fef3c7', bg2: '#fdba74', bgAngle: 145, grain: true,
    hero: '🏆', heroMotion: 'bounce', scatter: ['🎊', '⭐', '🎉'],
    title: { text: 'BRAVO!', color: '#ffffff', font: SANS, size: 150, style: '3d', depth: '#b45309' },
    subtitle: { text: 'you absolute star', color: '#92400e' },
    message: { text: 'Knew you’d smash it —\ncongratulations!', color: '#a16207' },
  },

  // ── Everyday / WhatsApp favourites (loved across ages) ───────────────────
  {
    id: 'gc-good-morning', name: 'Good Morning', icon: '🌞', anim: 'rise', effect: 'flowers',
    background: '#fff7e0', halo: '#fde68a', hero: '🌞', heroMotion: 'pulse', scatter: ['🌻', '🐦', '🍵', '🌼'],
    title: { text: 'Good Morning!', color: '#b45309' },
    subtitle: { text: 'शुभ प्रभात', color: '#d97706' },
    message: { text: 'May your day be as bright\nas the morning sun', color: '#92610e' },
  },
  {
    id: 'gc-good-night', name: 'Good Night', icon: '🌙', anim: 'fade', effect: 'sparkles',
    background: '#0b1026', halo: '#1e2547', hero: '🌙', heroMotion: 'float', scatter: ['⭐', '💫', '🌟', '☁️'],
    title: { text: 'Good Night', color: '#c7d2fe' },
    subtitle: { text: 'sweet dreams', color: '#a5b4fc' },
    message: { text: 'Rest well and wake up ready\nto shine tomorrow', color: '#93a4e8' },
  },
  {
    id: 'gc-have-a-nice-day', name: 'Have a Nice Day', icon: '😊', anim: 'pop', effect: 'flowers',
    background: '#ecfeff', halo: '#cffafe', hero: '😊', heroMotion: 'bounce', scatter: ['🌈', '🌻', '⭐', '🦋'],
    title: { text: 'Have a\nNice Day!', color: '#0e7490', size: 88 },
    message: { text: 'Smile, breathe and take it easy —\nyou’ve got this', color: '#0891b2' },
  },
  {
    id: 'gc-happy-weekend', name: 'Happy Weekend', icon: '🎉', anim: 'pop', effect: 'confetti',
    background: '#052e16', halo: '#14532d', hero: '🥳', heroMotion: 'bounce', scatter: ['🎉', '☕', '🌴', '🎈'],
    title: { text: 'Happy Weekend!', color: '#bbf7d0' },
    message: { text: 'Relax, recharge and do more\nof what you love', color: '#86efac' },
    signoff: { text: 'you earned this break', color: '#4ade80' },
  },
  {
    id: 'gc-welcome', name: 'Welcome', icon: '🎊', anim: 'rise', effect: 'confetti',
    background: '#0f172a', halo: '#1e293b', hero: '🎊', heroMotion: 'beat', scatter: ['🎉', '👋', '⭐', '🌟'],
    title: { text: 'Welcome!', color: '#f8fafc', size: 110 },
    message: { text: 'So glad you’re here —\nlet’s make it wonderful', color: '#94a3b8' },
  },
];

/** Studio templates for the "Greetings" category, generated from the specs above. */
export const GREETING_TEMPLATES: StudioTemplate[] = SPECS.map((spec) => ({
  id: spec.id,
  name: spec.name,
  icon: spec.icon,
  category: 'Greetings',
  anim: spec.anim,
  make: () => makeCard(spec),
}));
