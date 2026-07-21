/**
 * Family Occasion Studio — "everyone in one picture."
 *
 * A family picks an occasion/theme (Diwali portrait, 90s Bollywood poster,
 * wedding, "us in 1975"…). Each member contributes ONE photo from wherever
 * they are; the app composites everyone into a single themed scene. Kids pick
 * the costumes, elders just send a photo and react. Variants are generated for
 * the family to vote on; the winner becomes the WhatsApp DP or a print.
 *
 * Everything here is PURE (scene building, layouts, themes, persistence
 * codecs) so it's unit-tested; the modal owns file handling and rendering.
 * Photos never leave the device — composition is local, like everything else.
 *
 * Memorial members ("remember them") let a family include a late relative in
 * this year's portrait: their photo gets a soft golden halo and a marigold
 * garland — present, honoured, part of the picture.
 */
import { newElId, photoSlot, type Design, type Element, type TextEl, type ImageEl } from './model.js';
import type { BackgroundEffect } from './effects.js';

export interface FamilyMember {
  id: string;
  name: string;
  /** Data-URI photo (empty = tap-to-add slot stays open for them). */
  photo: string;
  /** Costume/prop emoji the kids picked for this member ('' = none). */
  costume: string;
  /** True for a late loved one — honoured with a halo + garland, never a costume. */
  memorial?: boolean;
}

export interface FamilyTheme {
  id: string;
  name: string;
  emoji: string;
  /** Scene styling. */
  bg: string; bg2: string; grain?: boolean;
  aurora?: string[];
  effect?: BackgroundEffect;
  accent: string; ink: string;
  /** Big scene title + small eyebrow line. */
  title: string; eyebrow: string;
  titleStyle?: '3d' | 'serif' | 'sans';
  /** Decoration emojis (corners / garland). */
  decor: string[];
  /** Costume/prop emojis the kids choose from for each member. */
  costumes: string[];
}

/** The occasion themes — India's dense festival calendar is the re-engagement
 *  loop, plus the evergreen family moments. */
export const FAMILY_THEMES: FamilyTheme[] = [
  {
    id: 'diwali', name: 'Diwali Portrait', emoji: '🪔', bg: '#2a0a2e', bg2: '#7c2d12', grain: true,
    aurora: ['#f59e0b', '#e11d48'], effect: 'sparkles', accent: '#fbbf24', ink: '#fde68a',
    eyebrow: 'शुभ दीपावली', title: 'The Family Sparkle', titleStyle: 'serif',
    decor: ['🪔', '🪔', '🪔', '🪔', '🪔'], costumes: ['👑', '🎩', '🕶️', '🌺', '📿', '🧣'],
  },
  {
    id: 'bollywood-90s', name: '90s Bollywood Poster', emoji: '🎬', bg: '#31071c', bg2: '#b8121b', grain: true,
    aurora: ['#f59e0b', '#7c3aed'], effect: 'sparkles', accent: '#ffd166', ink: '#ffe8c2',
    eyebrow: 'NOW SHOWING · HOUSEFULL', title: 'FAMILY No.1', titleStyle: '3d',
    decor: ['⭐', '🎬', '🌟', '🎞️'], costumes: ['🕶️', '🎸', '💃', '👑', '🧢', '🌹'],
  },
  {
    id: 'retro-1975', name: 'Us in 1975', emoji: '📻', bg: '#3f2d1d', bg2: '#8a6a45', grain: true,
    accent: '#f4e3c1', ink: '#e8d5b5',
    eyebrow: 'A FAMILY ALBUM', title: 'EST. 1975', titleStyle: 'serif',
    decor: ['📻', '📷', '☎️', '🕰️'], costumes: ['🕶️', '🎩', '🌼', '📿', '🧣', '👒'],
  },
  {
    id: 'wedding', name: 'Wedding Squad', emoji: '💍', bg: '#fffdf5', bg2: '#f5e6c8',
    aurora: ['#f9a8d4', '#fde68a'], effect: 'flowers', accent: '#7c5c1e', ink: '#8a6d2f',
    eyebrow: 'THE BARAAT IS READY', title: 'Shaadi Season!', titleStyle: 'serif',
    decor: ['💐', '🥂', '💞', '✨'], costumes: ['👑', '🎩', '💐', '🕶️', '🌺', '📿'],
  },
  {
    id: 'birthday', name: 'Birthday Gang', emoji: '🎂', bg: '#1f2b4d', bg2: '#4c1d95', grain: true,
    aurora: ['#f472b6', '#38bdf8'], effect: 'balloons', accent: '#f5d78a', ink: '#c7d2fe',
    eyebrow: 'IT’S PARTY TIME', title: 'Happy Birthday!', titleStyle: '3d',
    decor: ['🎈', '🎉', '🎁', '⭐'], costumes: ['🥳', '🎩', '👑', '🕶️', '🤡', '🦸'],
  },
  {
    id: 'holi', name: 'Holi Colours', emoji: '🎨', bg: '#fff8ee', bg2: '#ffe3f1',
    aurora: ['#e91e8c', '#38bdf8', '#fde047'], effect: 'confetti', accent: '#e91e8c', ink: '#8c3a6b',
    eyebrow: 'बुरा ना मानो होली है', title: 'Rang Barse!', titleStyle: 'sans',
    decor: ['💥', '🌈', '🩷', '💚'], costumes: ['🕶️', '🎯', '💦', '🌈', '🧢', '🎨'],
  },
  {
    id: 'eid', name: 'Eid Together', emoji: '🌙', bg: '#022c22', bg2: '#155e75', grain: true,
    aurora: ['#34d399', '#0ea5e9'], effect: 'moon', accent: '#d9b45b', ink: '#a7f3d0',
    eyebrow: 'ईद मुबारक', title: 'Eid Mubarak', titleStyle: 'serif',
    decor: ['🌙', '⭐', '🕌', '✨'], costumes: ['🧕', '🎩', '📿', '🌙', '🕶️', '🌹'],
  },
  {
    id: 'onam', name: 'Onam Sadhya', emoji: '🌸', bg: '#12330f', bg2: '#1d4d18',
    aurora: ['#fde047', '#fb923c'], effect: 'flowers', accent: '#fde047', ink: '#d9f99d',
    eyebrow: 'ഓണാശംസകൾ', title: 'Onam Ashamsakal', titleStyle: 'serif',
    decor: ['🌸', '🌼', '🚣', '🌺'], costumes: ['🌼', '👑', '🥁', '🌺', '🕶️', '🪷'],
  },
  {
    id: 'independence', name: 'Proud Family', emoji: '🇮🇳', bg: '#0b1d3a', bg2: '#134e4a', grain: true,
    aurora: ['#fb923c', '#4ade80'], effect: 'sparkles', accent: '#ffffff', ink: '#bae6fd',
    eyebrow: 'जय हिंद', title: 'One Family, One India', titleStyle: 'sans',
    decor: ['🇮🇳', '🕊️', '⭐', '🎆'], costumes: ['🎖️', '🧢', '🕶️', '🪁', '🥁', '🎗️'],
  },
  {
    id: 'christmas', name: 'Christmas Crew', emoji: '🎄', bg: '#0c2818', bg2: '#14532d', grain: true,
    aurora: ['#f87171', '#fde68a'], effect: 'snow', accent: '#f8e7c9', ink: '#cde8d5',
    eyebrow: 'MERRY EVERYTHING', title: 'The Christmas Crew', titleStyle: 'serif',
    decor: ['🎄', '🎅', '❄️', '🔔'], costumes: ['🎅', '🦌', '🎁', '⛄', '🧣', '🔔'],
  },
];

export const familyThemeById = (id: string): FamilyTheme => FAMILY_THEMES.find((t) => t.id === id) ?? FAMILY_THEMES[0]!;

export function newMemberId(): string { return 'fm' + Math.random().toString(36).slice(2, 9); }

/** Scene variants the family votes between: same people, different take. */
export interface SceneVariant { label: string; accentSwap?: boolean; arc?: boolean }
export const SCENE_VARIANTS: SceneVariant[] = [
  { label: 'Classic row' },
  { label: 'Front & centre', arc: true },
  { label: 'Colour pop', accentSwap: true },
];

/** Slot geometry for N members on a W×H canvas: up to 4 per row, back rows
 *  slightly smaller/higher (depth). `arc` lifts the outer members (group hug
 *  curve) and enlarges the first member (the "hero" slot). */
export function familyLayout(count: number, W: number, H: number, arc = false): { x: number; y: number; s: number }[] {
  if (count <= 0) return [];
  const rows: number[] = [];
  let left = count;
  while (left > 0) { const take = Math.min(4, Math.ceil(left / Math.ceil(left / 4))); rows.push(take); left -= take; }
  const out: { x: number; y: number; s: number }[] = [];
  const bandTop = H * 0.30, bandH = H * 0.42;
  rows.forEach((n, ri) => {
    const depth = rows.length - 1 - ri; // 0 = front row
    const s = Math.min(W / (n + 0.6), bandH / rows.length) * (depth ? 0.82 : 1);
    const rowY = bandTop + (bandH / rows.length) * ri - depth * s * 0.12;
    const step = W / (n + 1);
    for (let i = 0; i < n; i++) {
      let x = step * (i + 1) - s / 2;
      let y = rowY;
      let size = s;
      if (arc) {
        const t = n === 1 ? 0 : Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
        y -= (1 - t) * s * 0.1; // centre members lifted
        if (ri === rows.length - 1 && i === Math.floor((n - 1) / 2)) size = s * 1.15; // hero slot
      }
      out.push({ x, y, s: size });
    }
  });
  return out;
}

const EMO = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const text = (o: Partial<TextEl> & { x: number; y: number; w: number; h: number; text: string }): TextEl => ({
  id: newElId(), type: 'text', size: 40, color: '#0f172a', font: 'Inter, system-ui, sans-serif', weight: 700, align: 'center', rotation: 0, ...o,
});

/** Build the composed family scene for a theme + members + variant. */
export function familyScene(theme: FamilyTheme, members: FamilyMember[], variant: SceneVariant = SCENE_VARIANTS[0]!, W = 1080, H = 1350): Design {
  const els: Element[] = [];
  const accent = variant.accentSwap ? theme.ink : theme.accent;
  const ink = variant.accentSwap ? theme.accent : theme.ink;

  // Aurora depth blobs.
  (theme.aurora ?? []).slice(0, 3).forEach((c, i) => {
    const spots: [number, number, number][] = [[-0.18, -0.08, 0.85], [0.55, 0.3, 0.7], [0.05, 0.6, 0.8]];
    const [fx, fy, fs] = spots[i]!;
    els.push({ id: newElId(), type: 'ellipse', x: W * fx, y: H * fy, w: W * fs, h: W * fs, fill: c, opacity: 0.3 });
  });
  // Decoration row along the top (garland/marquee).
  const decor = theme.decor;
  const n = 5, step = (W - 160) / (n - 1);
  for (let i = 0; i < n; i++) {
    els.push(text({ x: 80 + step * i - 57, y: 70, w: 114, h: 114, text: decor[i % decor.length]!, size: 88, font: EMO, rotation: i % 2 ? 8 : -8, motion: i % 2 ? 'pulse' : 'float' }));
  }

  // Eyebrow + title block.
  els.push(text({ x: 80, y: H * 0.145, w: W - 160, h: 46, text: theme.eyebrow, size: 34, color: ink, weight: 700 }));
  const titleFont = theme.titleStyle === 'serif' ? 'Georgia, serif' : 'Inter, system-ui, sans-serif';
  const titleSize = theme.titleStyle === '3d' ? 104 : 88;
  const ty = H * 0.175;
  if (theme.titleStyle === '3d') {
    for (const off of [9, 6, 3]) els.push(text({ x: 80 + off, y: ty + off, w: W - 160, h: titleSize * 1.2, text: theme.title, size: titleSize, color: '#00000055', weight: 900, font: titleFont }));
  }
  els.push(text({ x: 80, y: ty, w: W - 160, h: titleSize * 1.2, text: theme.title, size: titleSize, color: accent, weight: 900, font: titleFont }));

  // Member slots — photos, costumes, halos, name labels.
  const slots = familyLayout(members.length, W, H, variant.arc);
  members.forEach((m, i) => {
    const sl = slots[i]!;
    if (m.memorial) {
      // Soft golden halo + marigold garland — present and honoured.
      els.push({ id: newElId(), type: 'ellipse', x: sl.x - sl.s * 0.09, y: sl.y - sl.s * 0.09, w: sl.s * 1.18, h: sl.s * 1.18, fill: '#fbbf24', opacity: 0.4 });
    }
    const slot: ImageEl = { ...photoSlot(sl.x, sl.y, sl.s, sl.s), shape: 'circle', shadow: 'soft', name: m.name || 'Photo' };
    if (m.photo) { slot.href = m.photo; slot.placeholder = false; }
    els.push(slot);
    if (m.memorial) {
      els.push(text({ x: sl.x, y: sl.y + sl.s * 0.82, w: sl.s, h: sl.s * 0.2, text: '🌼🌼🌼', size: sl.s * 0.16, font: EMO }));
    } else if (m.costume) {
      // The kids' pick — perched at the top-right of the portrait.
      els.push(text({ x: sl.x + sl.s * 0.62, y: sl.y - sl.s * 0.16, w: sl.s * 0.44, h: sl.s * 0.44, text: m.costume, size: sl.s * 0.34, font: EMO, rotation: 14, motion: 'wobble' }));
    }
    if (m.name) {
      els.push(text({ x: sl.x - sl.s * 0.25, y: sl.y + sl.s * 1.02, w: sl.s * 1.5, h: 44, text: m.memorial ? `${m.name} 🤍` : m.name, size: 32, color: ink, weight: 700 }));
    }
  });

  // Footer line.
  els.push(text({ x: 80, y: H * 0.93, w: W - 160, h: 44, text: 'एक परिवार · one frame ✨', size: 30, color: ink, weight: 600 }));

  return {
    w: W, h: H, background: theme.bg, bg2: theme.bg2,
    ...(theme.grain ? { grain: true } : {}),
    ...(theme.effect ? { effect: theme.effect } : {}),
    elements: els,
  };
}

// ── Project persistence (on-device, like everything else) ────────────────────
export interface FamilyProject { themeId: string; members: FamilyMember[]; votes: number[] }
const KEY = 'pyntra:familyStudio';
export function loadFamilyProject(): FamilyProject | null {
  try {
    const raw = localStorage.getItem(KEY); if (!raw) return null;
    const p = JSON.parse(raw) as FamilyProject;
    return p && typeof p.themeId === 'string' && Array.isArray(p.members) ? { ...p, votes: Array.isArray(p.votes) ? p.votes : [0, 0, 0] } : null;
  } catch { return null; }
}
export function saveFamilyProject(p: FamilyProject): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage full — non-fatal */ }
}

/** The WhatsApp ask that makes this multiplayer: one tap invites the family. */
export function inviteMessage(themeName: string): string {
  return `हम सब एक फोटो में! 🖼️ We're making a "${themeName}" family portrait on Pyntra. Send me ONE photo of yourself (any photo works) and I'll add you in — then vote for your favourite look! 💛`;
}
