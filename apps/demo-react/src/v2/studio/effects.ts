/**
 * Animated background effects — a deterministic particle layer (confetti,
 * snow, hearts, sparkles, balloons) that drifts across the design. Pure and
 * seeded so the same design renders the same particles everywhere: the live
 * editor animates them with CSS, and the Animate export recomputes positions
 * per frame with the same maths (particleAt). Unit-tested.
 */

export type BackgroundEffect =
  | 'confetti' | 'snow' | 'hearts' | 'sparkles' | 'balloons' | 'flowers'
  | 'stars' | 'bubbles' | 'autumn' | 'music' | 'rain' | 'fireflies'
  | 'diyas' | 'lanterns' | 'butterflies' | 'coins' | 'leaves' | 'party'
  | 'ribbons' | 'bats' | 'moon' | 'clover';

/** 22 drifting particle effects — grouped so the picker reads sensibly. */
export const BACKGROUND_EFFECTS: { id: BackgroundEffect; label: string }[] = [
  { id: 'confetti', label: '🎊 Confetti' },
  { id: 'party', label: '🥳 Party' },
  { id: 'balloons', label: '🎈 Balloons' },
  { id: 'ribbons', label: '🎀 Ribbons' },
  { id: 'coins', label: '🪙 Coins' },
  { id: 'hearts', label: '💗 Hearts' },
  { id: 'sparkles', label: '✨ Sparkles' },
  { id: 'stars', label: '⭐ Stars' },
  { id: 'fireflies', label: '🟡 Fireflies' },
  { id: 'moon', label: '🌙 Night sky' },
  { id: 'snow', label: '❄️ Snowfall' },
  { id: 'rain', label: '💧 Rain' },
  { id: 'bubbles', label: '🫧 Bubbles' },
  { id: 'flowers', label: '🌸 Flowers' },
  { id: 'leaves', label: '🍃 Leaves' },
  { id: 'autumn', label: '🍂 Autumn' },
  { id: 'butterflies', label: '🦋 Butterflies' },
  { id: 'music', label: '🎵 Music' },
  { id: 'diyas', label: '🪔 Diyas' },
  { id: 'lanterns', label: '🏮 Lanterns' },
  { id: 'clover', label: '🍀 Lucky clover' },
  { id: 'bats', label: '🦇 Spooky' },
];

const GLYPHS: Record<BackgroundEffect, string[]> = {
  confetti: ['🎊', '🎉', '⭐', '🟡', '🔵'],
  party: ['🥳', '🎉', '🎊', '🪅', '🎈'],
  balloons: ['🎈'],
  ribbons: ['🎀', '🎗️', '✨'],
  coins: ['🪙', '💰', '✨'],
  snow: ['❄️', '❅', '❆'],
  hearts: ['💗', '💖', '💕'],
  sparkles: ['✨', '⭐', '🌟'],
  stars: ['⭐', '🌟', '💫'],
  fireflies: ['✨', '🟡', '🟢'],
  moon: ['🌙', '⭐', '💫'],
  rain: ['💧', '💦'],
  bubbles: ['🫧', '⚪', '◦'],
  flowers: ['🌸', '🌷', '🌼', '🌺', '🍃'],
  leaves: ['🍃', '🌿', '☘️'],
  autumn: ['🍂', '🍁', '🍃'],
  butterflies: ['🦋'],
  music: ['🎵', '🎶', '🎼'],
  diyas: ['🪔', '🔥'],
  lanterns: ['🏮', '🎏'],
  clover: ['🍀', '☘️', '✨'],
  bats: ['🦇', '🕸️', '👻'],
};

/** These drift upward (lighter-than-air / rising things); the rest fall. */
const RISING = new Set<BackgroundEffect>(['balloons', 'bubbles', 'fireflies', 'butterflies', 'music', 'diyas', 'lanterns']);
export const effectRises = (e: BackgroundEffect): boolean => RISING.has(e);

export interface Particle {
  glyph: string;
  /** Horizontal anchor, fraction of the canvas width. */
  fx: number;
  /** Vertical start offset, fraction of one travel loop. */
  fy: number;
  /** Glyph size as a fraction of the canvas' smaller side. */
  sizeFrac: number;
  /** Travel loops per motion cycle (varied so particles don't march in step). */
  speed: number;
  /** Horizontal sway amplitude, fraction of the width. */
  sway: number;
}

/** Small deterministic PRNG (mulberry32) — same seed, same particle field. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The particle field for an effect — deterministic for a given seed. */
export function effectParticles(effect: BackgroundEffect, count = 22, seed = 7): Particle[] {
  const rand = rng(seed);
  const glyphs = GLYPHS[effect];
  return Array.from({ length: count }, () => ({
    glyph: glyphs[Math.floor(rand() * glyphs.length)]!,
    fx: rand(),
    fy: rand(),
    sizeFrac: 0.035 + rand() * 0.045,
    speed: 0.55 + rand() * 0.9,
    sway: 0.015 + rand() * 0.035,
  }));
}

/** Where a particle sits at motion `phase` (in turns) on a w×h canvas.
 *  Travel wraps: each particle enters just off one edge and exits the other. */
export function particleAt(p: Particle, effect: BackgroundEffect, phase: number, w: number, h: number): { x: number; y: number; size: number } {
  const travel = (p.fy + phase * p.speed) % 1;
  const t = travel < 0 ? travel + 1 : travel;
  const y = effectRises(effect)
    ? h * 1.08 - t * h * 1.16   // bottom → top
    : t * h * 1.16 - h * 0.08;  // top → bottom
  const x = p.fx * w + Math.sin(2 * Math.PI * (t * 2 + p.fx)) * p.sway * w;
  return { x, y, size: p.sizeFrac * Math.min(w, h) };
}

/** SVG fragment for the whole effect layer at `phase` — inserted between the
 *  design background and its elements by designToSvg. */
export function effectLayerSvg(effect: BackgroundEffect, phase: number, w: number, h: number, count = 22, seed = 7): string {
  return effectParticles(effect, count, seed).map((p) => {
    const { x, y, size } = particleAt(p, effect, phase, w, h);
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size.toFixed(1)}" text-anchor="middle" opacity="0.9">${p.glyph}</text>`;
  }).join('');
}
