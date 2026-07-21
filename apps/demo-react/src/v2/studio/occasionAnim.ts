/**
 * Occasion animations — procedural, canvas-drawn "hero" animations for greeting
 * videos: a gift box that opens and pops a cake with confetti, an envelope that
 * releases floating hearts, a trophy that rises, a bouquet that blooms, wedding
 * rings that sparkle, New-Year fireworks… Each occasion draws its decoration for
 * a normalized progress t∈[0,1]; `paintGreetingFrame` composites the hero + an
 * optional photo-in-frame + the wish text so preview and export look identical.
 * Everything is on-device canvas 2D — no assets, no upload. The colour/emoji
 * data is pure; the draws need a CanvasRenderingContext2D.
 */
import { drawCharacter, CHARACTER_STYLES, type CharacterType, type Attire } from './characters.js';

export interface OccasionAnim {
  id: string;
  label: string;
  icon: string;
  /** Background gradient stops. */
  bg: [string, string];
  /** Accent colour (ribbons, sparkles, text glow). */
  accent: string;
  /** Text colour. */
  fg: string;
  /** Default wish headline (editable in the UI). */
  wish: string;
  /** Deity painting featured as the hero (devotional occasions only). */
  sacred?: string;
  /** Draws the animated hero decoration for progress t (0→1). */
  draw: (ctx: CanvasRenderingContext2D, t: number, w: number, h: number, accent: string) => void;
}

const TAU = Math.PI * 2;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (t: number) => 1 - Math.pow(1 - clamp01(t), 3); // easeOutCubic
// Deterministic pseudo-random so bursts are stable frame-to-frame.
const rnd = (i: number) => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };

/** #rgb / #rrggbb → rgba() string at the given alpha (for glows & tints). */
function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16) || 0, g = parseInt(n.slice(2, 4), 16) || 0, b = parseInt(n.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * A rich, always-colourful backdrop drawn entirely with fills (no emoji, so it
 * looks the same on every device — unlike decorative emoji, which some phones
 * render as faint grey fallback glyphs). Layers: the base gradient, a warm
 * accent glow behind the hero for depth, drifting light motes, and a soft
 * vignette so the edges recede and the subject pops.
 */
function paintBackdrop(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, occ: OccasionAnim) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, occ.bg[0]); grad.addColorStop(1, occ.bg[1]);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

  // Warm halo of the accent colour, centred behind the hero — turns a flat dark
  // rectangle into a scene that feels lit.
  const gx = w / 2, gy = h * 0.34, gr = Math.min(w, h) * 0.85;
  const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
  glow.addColorStop(0, hexA(occ.accent, 0.30));
  glow.addColorStop(0.45, hexA(occ.accent, 0.10));
  glow.addColorStop(1, hexA(occ.accent, 0));
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);

  // Drifting light motes rising slowly — lively ambient sparkle that always
  // renders (pure arcs), so the background never looks empty or washed out.
  const motes = 20;
  for (let i = 0; i < motes; i++) {
    const seedx = rnd(i + 1), speed = 0.12 + rnd(i + 11) * 0.22;
    const yy = (1 - ((t * speed + seedx) % 1)) * h;
    const xx = (seedx * 0.94 + 0.03) * w + Math.sin((t + i) * 1.2) * w * 0.02;
    const s = w * (0.005 + rnd(i + 5) * 0.012);
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 2 + i * 1.7));
    ctx.globalAlpha = 0.08 + tw * 0.22;
    ctx.fillStyle = i % 3 === 0 ? occ.accent : '#ffffff';
    ctx.beginPath(); ctx.arc(xx, yy, s, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Soft vignette to frame the composition.
  const vig = ctx.createRadialGradient(w / 2, h * 0.44, Math.min(w, h) * 0.32, w / 2, h * 0.52, Math.max(w, h) * 0.78);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.40)');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Draw an emoji glyph centred at (x,y) at pixel size `size`. */
function glyph(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, size: number, rot = 0, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(ch, 0, 0);
  ctx.restore();
}

const CONFETTI = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];

/** A confetti burst emanating from (cx,cy), progressing after `after`. */
function confetti(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, cx: number, cy: number, after = 0.5) {
  const p = clamp01((t - after) / (1 - after));
  if (p <= 0) return;
  const n = 34;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * TAU + rnd(i) * 0.6;
    const dist = (0.3 + rnd(i + 7) * 0.7) * Math.min(w, h) * 0.55 * ease(p);
    const x = cx + Math.cos(ang) * dist;
    const y = cy + Math.sin(ang) * dist + p * p * h * 0.12; // slight gravity
    const s = Math.max(4, w * 0.012);
    ctx.save();
    ctx.globalAlpha = 1 - p * 0.5;
    ctx.fillStyle = CONFETTI[i % CONFETTI.length]!;
    ctx.translate(x, y); ctx.rotate(ang + p * 6);
    ctx.fillRect(-s / 2, -s, s, s * 2);
    ctx.restore();
  }
}

/** Rising decorations (balloons/hearts/petals) from the bottom. */
function risers(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, chars: string[], count = 7) {
  for (let i = 0; i < count; i++) {
    const speed = 0.6 + rnd(i) * 0.8;
    const yy = h * 1.05 - ((t * speed + rnd(i + 3)) % 1) * h * 1.15;
    const xx = (rnd(i + 1) * 0.9 + 0.05) * w + Math.sin((t * 2 + i) * 1.5) * w * 0.03;
    const s = w * (0.05 + rnd(i + 2) * 0.04);
    glyph(ctx, chars[i % chars.length]!, xx, yy, s * 2, Math.sin(t * 3 + i) * 0.2, 0.9);
  }
}

/** Sparkle dots twinkling around a point. */
function sparkles(ctx: CanvasRenderingContext2D, t: number, cx: number, cy: number, r: number, accent: string) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + t;
    const tw = 0.5 + 0.5 * Math.sin(t * 6 + i);
    glyph(ctx, '✨', cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, 20 + tw * 16, 0, 0.5 + tw * 0.5);
  }
  ctx.fillStyle = accent;
}

// ── Hero animations ──────────────────────────────────────────────────────────

/** A ribboned gift box that shakes, its lid lifts off, and a cake pops out. */
function giftUnbox(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, accent: string) {
  const cx = w / 2, boxW = Math.min(w, h) * 0.26, boxH = boxW * 0.82;
  const baseY = h * 0.34;
  const open = ease(clamp01((t - 0.42) / 0.3));
  const pop = ease(clamp01((t - 0.5) / 0.45));
  // Surprise rising out.
  if (pop > 0) glyph(ctx, '🎂', cx, baseY - boxH * 0.2 - pop * boxH * 1.4, boxW * (0.5 + pop * 0.7), Math.sin(t * 6) * 0.1, 1);
  // Box base.
  const shake = t < 0.42 ? Math.sin(t * 40) * boxW * 0.02 : 0;
  ctx.save(); ctx.translate(shake, 0);
  ctx.fillStyle = accent; roundRect(ctx, cx - boxW / 2, baseY, boxW, boxH, boxW * 0.08); ctx.fill();
  // Vertical ribbon.
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(cx - boxW * 0.08, baseY, boxW * 0.16, boxH);
  // Lid (lifts + tilts as it opens).
  ctx.save();
  ctx.translate(cx, baseY - open * boxH * 1.1);
  ctx.rotate(open * 0.35);
  ctx.fillStyle = accent; roundRect(ctx, -boxW * 0.58, -boxH * 0.28, boxW * 1.16, boxH * 0.34, boxW * 0.08); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(-boxW * 0.09, -boxH * 0.28, boxW * 0.18, boxH * 0.34);
  glyph(ctx, '🎀', 0, -boxH * 0.28, boxW * 0.5, 0, 1);
  ctx.restore();
  ctx.restore();
  confetti(ctx, t, w, h, cx, baseY - boxH * 0.5, 0.5);
  risers(ctx, t, w, h, ['🎈', '🎈', '🎉'], 6);
}

/** An envelope that opens and releases floating hearts. */
function loveEnvelope(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, accent: string) {
  const cx = w / 2, eW = Math.min(w, h) * 0.34, eH = eW * 0.66, y = h * 0.3;
  const open = ease(clamp01((t - 0.35) / 0.3));
  const pop = ease(clamp01((t - 0.45) / 0.5));
  if (pop > 0) glyph(ctx, '💖', cx, y + eH * 0.4 - pop * eH * 1.6, eW * (0.35 + pop * 0.5), Math.sin(t * 5) * 0.15, 1);
  ctx.fillStyle = '#fff5f7'; roundRect(ctx, cx - eW / 2, y, eW, eH, eW * 0.05); ctx.fill();
  ctx.strokeStyle = accent; ctx.lineWidth = Math.max(2, eW * 0.02); roundRect(ctx, cx - eW / 2, y, eW, eH, eW * 0.05); ctx.stroke();
  // Flap opening upward.
  ctx.save(); ctx.translate(cx, y); ctx.rotate(-open * Math.PI * 0.9);
  ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(-eW / 2, 0); ctx.lineTo(eW / 2, 0); ctx.lineTo(0, eH * 0.6); ctx.closePath(); ctx.fill();
  ctx.restore();
  risers(ctx, t, w, h, ['❤️', '💕', '💗'], 8);
  sparkles(ctx, t, cx, y + eH * 0.5, eW * 0.6, accent);
}

/** A trophy that rises with a confetti burst — for congratulations. */
function trophyRise(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, _accent: string) {
  const cx = w / 2, y = h * 0.3;
  const rise = ease(clamp01(t / 0.5));
  glyph(ctx, '🏆', cx, y + (1 - rise) * h * 0.4, Math.min(w, h) * 0.3 * (0.6 + rise * 0.4), 0, rise);
  confetti(ctx, t, w, h, cx, y, 0.4);
  risers(ctx, t, w, h, ['⭐', '🎉', '✨'], 6);
}

/** A bouquet that blooms — for thank-you / get-well. */
function bouquetBloom(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, accent: string) {
  const cx = w / 2, y = h * 0.3, R = Math.min(w, h) * 0.13;
  const flowers = ['🌸', '🌷', '🌹', '🌼', '🌻'];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU - Math.PI / 2;
    const grow = ease(clamp01((t - i * 0.05) / 0.5));
    glyph(ctx, flowers[i]!, cx + Math.cos(a) * R * grow, y + Math.sin(a) * R * grow, Math.min(w, h) * 0.12 * grow, 0, grow);
  }
  glyph(ctx, '💐', cx, y + R * 1.1, Math.min(w, h) * 0.14 * ease(clamp01(t / 0.4)), 0, 1);
  sparkles(ctx, t, cx, y, R * 1.8, accent);
}

/** Wedding rings with a sparkle and falling petals. */
function weddingRings(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, accent: string) {
  const cx = w / 2, y = h * 0.32;
  const s = ease(clamp01(t / 0.4));
  glyph(ctx, '💍', cx, y, Math.min(w, h) * 0.3 * (0.6 + s * 0.4), 0, s);
  sparkles(ctx, t, cx, y, Math.min(w, h) * 0.22, accent);
  risers(ctx, t, w, h, ['🌸', '🕊️', '💗'], 7);
}

/** New-Year fireworks — staggered bursts. */
function fireworks(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, _accent: string) {
  for (let b = 0; b < 3; b++) {
    const cx = (0.25 + b * 0.25) * w, cy = (0.2 + rnd(b) * 0.18) * h;
    const local = (t + b * 0.33) % 1;
    confetti(ctx, local, w, h, cx, cy, 0.0);
  }
  glyph(ctx, '🎆', w / 2, h * 0.3, Math.min(w, h) * 0.24, 0, 0.9);
}

/** A row of diyas (oil lamps) whose flames flicker to life — for Diwali. */
function diyaGlow(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, accent: string) {
  const cx = w / 2, y = h * 0.34, big = Math.min(w, h) * 0.26;
  // Central diya rises and its glow swells.
  const rise = ease(clamp01(t / 0.4));
  const flicker = 0.85 + 0.15 * Math.sin(t * 18);
  ctx.save();
  ctx.shadowColor = accent; ctx.shadowBlur = big * 0.5 * rise * flicker;
  glyph(ctx, '🪔', cx, y + (1 - rise) * h * 0.2, big * (0.6 + rise * 0.4), 0, rise);
  ctx.restore();
  // Flanking diyas fade in a touch later.
  for (const [i, dx] of [-1, 1].entries()) {
    const g = ease(clamp01((t - 0.25 - i * 0.05) / 0.4));
    glyph(ctx, '🪔', cx + dx * big * 1.5, y + big * 0.35, big * 0.55 * g, 0, g);
  }
  sparkles(ctx, t, cx, y, big * 1.2, accent);
  risers(ctx, t, w, h, ['🪔', '✨', '🎆'], 6);
}


/** A character (person emoji) with a lively WhatsApp-GIF bounce + gentle sway —
 *  gives greetings a human "someone is celebrating for you" feel. */
function person(ctx: CanvasRenderingContext2D, emoji: string, cx: number, cy: number, size: number, t: number, delay = 0) {
  const p = ease(clamp01((t - delay) / 0.4));
  if (p <= 0) return;
  const bounce = Math.abs(Math.sin(t * 4)) * size * 0.06;
  const sway = Math.sin(t * 2.4) * 0.12;
  glyph(ctx, emoji, cx, cy - bounce, size * (0.6 + p * 0.4), sway, p);
}

/** An illustrated character (real vector figure, not an emoji) with a pop-in. */
function figure(ctx: CanvasRenderingContext2D, type: CharacterType, styleKey: string, cx: number, cy: number, size: number, t: number, delay = 0, attire: Attire = 'western') {
  drawCharacter(ctx, { x: cx, y: cy, size, t, type, attire, style: CHARACTER_STYLES[styleKey], reveal: ease(clamp01((t - delay) / 0.4)) });
}

/** Two waving kids (illustrated) with a cake + balloons + confetti — the classic
 *  WhatsApp birthday moment, drawn on-device as real characters. */
function birthdayKids(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, accent: string) {
  const cx = w / 2, y = h * 0.34, big = Math.min(w, h) * 0.44;
  risers(ctx, t, w, h, ['🎈', '🎈', '🎈', '🎉'], 7);
  figure(ctx, 'girl', 'girl', cx - big * 0.5, y, big, t, 0.1);
  figure(ctx, 'boy', 'boy', cx + big * 0.5, y, big, t, 0.2);
  const pop = ease(clamp01((t - 0.35) / 0.4));
  glyph(ctx, '🎂', cx, y + big * 0.28 - pop * big * 0.12, big * 0.34 * (0.7 + pop * 0.5), Math.sin(t * 5) * 0.06, 1);
  confetti(ctx, t, w, h, cx, y - big * 0.2, 0.4);
  sparkles(ctx, t, cx, y - big * 0.2, big * 0.7, accent);
}

/** Two dancers (garba/party) with confetti — celebration, Navratri, sangeet. */
function partyDancers(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, accent: string) {
  const cx = w / 2, y = h * 0.32, big = Math.min(w, h) * 0.2;
  const swing = Math.sin(t * 3) * 0.25;
  glyph(ctx, '🪘', cx - big * 0.9, y + Math.sin(t * 4) * big * 0.08, big * 1.3, swing, ease(clamp01(t / 0.3)));
  glyph(ctx, '🕺', cx + big * 0.9, y + Math.cos(t * 4) * big * 0.08, big * 1.3, -swing, ease(clamp01((t - 0.1) / 0.3)));
  confetti(ctx, t, w, h, cx, y, 0.25);
  risers(ctx, t, w, h, ['🎉', '✨', '🪩', '🎊'], 6);
  sparkles(ctx, t, cx, y, big * 1.6, accent);
}

/** An illustrated couple with floating hearts — anniversary / love. */
function coupleHearts(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, accent: string) {
  const cx = w / 2, y = h * 0.34, big = Math.min(w, h) * 0.44;
  figure(ctx, 'girl', 'girl2', cx - big * 0.34, y, big, t, 0.05);
  figure(ctx, 'boy', 'boy', cx + big * 0.34, y, big, t, 0.12);
  const pop = ease(clamp01((t - 0.3) / 0.4));
  glyph(ctx, '❤️', cx, y - big * 0.42, big * 0.24 * pop, Math.sin(t * 4) * 0.15, pop);
  risers(ctx, t, w, h, ['❤️', '💕', '💖', '💗'], 8);
  sparkles(ctx, t, cx, y - big * 0.2, big * 0.7, accent);
}

/** A child flying a kite across the sky — Makar Sankranti / Uttarayan. */
function kiteFlyer(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, accent: string) {
  const cx = w / 2, y = h * 0.5, big = Math.min(w, h) * 0.2;
  glyph(ctx, '🌞', w * 0.8, h * 0.18, big * 0.9, 0, 0.9);
  figure(ctx, 'boy', 'boy', cx - big * 0.6, y - big * 0.4, big * 2.2, t, 0.1);
  // Kite sweeps up-right on a string.
  const kp = ease(clamp01(t / 0.6));
  const kx = cx + big * (0.4 + kp * 1.4), ky = y - big * (0.6 + kp * 1.4) + Math.sin(t * 3) * big * 0.15;
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = Math.max(2, big * 0.02);
  ctx.beginPath(); ctx.moveTo(cx - big * 0.3, y - big * 0.4); ctx.lineTo(kx, ky); ctx.stroke(); ctx.restore();
  glyph(ctx, '🪁', kx, ky, big * 0.8, Math.sin(t * 4) * 0.3, 1);
  risers(ctx, t, w, h, ['🪁', '🌾', '☀️'], 5);
  sparkles(ctx, t, cx, y, big, accent);
}

/** A harvest pot overflowing (Pongal) / flower-carpet (Onam). */
function harvestJoy(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, accent: string) {
  const cx = w / 2, y = h * 0.32, big = Math.min(w, h) * 0.22;
  const bloom = ['🌼', '🌺', '🌸', '🌻', '🪔'];
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - Math.PI / 2; const g = ease(clamp01((t - i * 0.05) / 0.5)); glyph(ctx, bloom[i]!, cx + Math.cos(a) * big * g, y + Math.sin(a) * big * g, big * 0.55 * g, 0, g); }
  glyph(ctx, '🍚', cx, y, big * (0.7 + 0.3 * ease(clamp01(t / 0.4))), 0, 1);
  sparkles(ctx, t, cx, y, big * 1.6, accent);
  risers(ctx, t, w, h, ['🌾', '🌺', '✨'], 6);
}

/** Santa with a tree and falling snow — Christmas. */
function santaScene(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, accent: string) {
  const cx = w / 2, y = h * 0.34, big = Math.min(w, h) * 0.2;
  glyph(ctx, '🎄', cx + big * 1.1, y + big * 0.2, big * 1.2, Math.sin(t * 2) * 0.04, ease(clamp01(t / 0.4)));
  person(ctx, '🎅', cx - big * 0.8, y + big * 0.3, big * 1.2, t, 0.1);
  glyph(ctx, '🎁', cx - big * 0.2, y + big, big * 0.7, 0, ease(clamp01((t - 0.3) / 0.4)));
  // Snow.
  for (let i = 0; i < 22; i++) { const sx = (rnd(i) * 1.05) * w; const sy = ((t * (0.3 + rnd(i + 2) * 0.5) + rnd(i + 1)) % 1) * h; glyph(ctx, '❄️', sx, sy, big * (0.12 + rnd(i + 3) * 0.1), 0, 0.8); }
  sparkles(ctx, t, cx, y, big * 1.5, accent);
}

/** Sunshine + a hug + flowers — Get Well Soon. */
function getWellSun(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, accent: string) {
  const cx = w / 2, y = h * 0.3, big = Math.min(w, h) * 0.22;
  const spin = t * 0.5;
  glyph(ctx, '🌞', cx, y, big * (0.7 + 0.3 * ease(clamp01(t / 0.4))), spin * 0.2, 1);
  figure(ctx, 'girl', 'girl2', cx, y + big * 1.5, big * 2, t, 0.25);
  risers(ctx, t, w, h, ['🌻', '🌼', '🦋', '💐'], 6);
  sparkles(ctx, t, cx, y, big * 1.4, accent);
}

/** A graduate tossing the cap — graduation / congratulations. */
function gradToss(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, accent: string) {
  const cx = w / 2, y = h * 0.34, big = Math.min(w, h) * 0.22;
  person(ctx, '🧑‍🎓', cx, y + big * 0.3, big * 1.3, t, 0.1);
  const toss = ease(clamp01((t - 0.2) / 0.5));
  glyph(ctx, '🎓', cx, y - big * (0.2 + toss * 1.1) + Math.sin(t * 3) * big * 0.1, big * 0.7, Math.sin(t * 6) * 0.3, 1);
  confetti(ctx, t, w, h, cx, y, 0.35);
  risers(ctx, t, w, h, ['🎉', '📜', '⭐'], 6);
  sparkles(ctx, t, cx, y, big * 1.5, accent);
}

/** Soft golden halo behind a central sacred symbol. */
function halo(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, alpha: number) {
  ctx.save();
  const grd = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
  grd.addColorStop(0, 'rgba(251,191,36,0.40)');
  grd.addColorStop(1, 'rgba(251,191,36,0)');
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
  ctx.restore();
}

/**
 * Symbol-only devotional scene — a haloed sacred SYMBOL (Om, trishul, flute…)
 * with flanking diyas and marigold risers. Kept as the fallback for devotional
 * occasions that have no painting yet: never substitute an animal or a dancer
 * for a deity, which is exactly what causes offence. Occasions WITH artwork use
 * sacredScene() above, which shows a real public-domain deity painting.
 */
/* ── Real deity paintings ──────────────────────────────────────────────────
 * Devotional occasions now show an ACTUAL public-domain painting (Raja Ravi
 * Varma, 1848–1906) instead of a symbol. Canvas draws are synchronous, so the
 * images are preloaded into this cache first (see preloadSacred); if one hasn't
 * loaded the draw falls back to the symbol so a frame is never blank.      */
const sacredCache = new Map<string, HTMLImageElement>();

/** Preload a deity painting so the synchronous frame draws can use it. */
export async function preloadSacred(file: string): Promise<void> {
  if (sacredCache.has(file)) return;
  await new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => { sacredCache.set(file, img); resolve(); };
    img.onerror = () => resolve(); // leave it uncached — symbol fallback draws
    img.src = file;
  });
}

/** Draw a preloaded painting centred at (cx,cy), contained in `box`, inside a
 *  soft gold frame. Returns false if the image isn't available yet. */
function paintingHero(ctx: CanvasRenderingContext2D, file: string, cx: number, cy: number, box: number, s: number): boolean {
  const img = sacredCache.get(file);
  if (!img || !img.naturalWidth) return false;
  const r = Math.min(box / img.naturalWidth, box / img.naturalHeight) * (0.72 + 0.28 * s);
  const dw = img.naturalWidth * r, dh = img.naturalHeight * r;
  const x = cx - dw / 2, y = cy - dh / 2;
  const rad = Math.min(dw, dh) * 0.06;
  ctx.save();
  ctx.globalAlpha = s;
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + dw, y, x + dw, y + dh, rad);
  ctx.arcTo(x + dw, y + dh, x, y + dh, rad);
  ctx.arcTo(x, y + dh, x, y, rad);
  ctx.arcTo(x, y, x + dw, y, rad);
  ctx.closePath();
  ctx.save(); ctx.clip(); ctx.drawImage(img, x, y, dw, dh); ctx.restore();
  ctx.lineWidth = Math.max(2, box * 0.012);
  ctx.strokeStyle = 'rgba(253, 224, 71, 0.85)';
  ctx.stroke();
  ctx.restore();
  return true;
}

/** A devotional scene built around a REAL deity painting, with the symbol as a
 *  graceful fallback while the image loads (or if it fails to). */
export function sacredScene(file: string, symbol: string, riseGlyphs: string[]) {
  return (ctx: CanvasRenderingContext2D, t: number, w: number, h: number, accent: string) => {
    const cx = w / 2, y = h * 0.32, big = Math.min(w, h) * 0.24;
    const s = ease(clamp01(t / 0.45));
    halo(ctx, cx, y, big * 1.7, s);
    if (!paintingHero(ctx, file, cx, y, big * 2.1, s)) {
      glyph(ctx, symbol, cx, y, big * (0.7 + 0.3 * s) * (1 + Math.sin(t * 2) * 0.02), 0, s);
    }
    glyph(ctx, '🪔', cx - big * 1.35, y + big * 1.05, big * 0.5, 0, ease(clamp01((t - 0.2) / 0.4)));
    glyph(ctx, '🪔', cx + big * 1.35, y + big * 1.05, big * 0.5, 0, ease(clamp01((t - 0.3) / 0.4)));
    risers(ctx, t, w, h, riseGlyphs, 7);
    sparkles(ctx, t, cx, y, big * 1.7, accent);
  };
}

function devotional(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, accent: string, symbol: string, riseGlyphs: string[]) {
  const cx = w / 2, y = h * 0.32, big = Math.min(w, h) * 0.24;
  const s = ease(clamp01(t / 0.45));
  halo(ctx, cx, y, big * 1.6, s);
  glyph(ctx, symbol, cx, y, big * (0.7 + 0.3 * s) * (1 + Math.sin(t * 2) * 0.02), 0, s);
  glyph(ctx, '🪔', cx - big * 1.15, y + big * 0.95, big * 0.5, 0, ease(clamp01((t - 0.2) / 0.4)));
  glyph(ctx, '🪔', cx + big * 1.15, y + big * 0.95, big * 0.5, 0, ease(clamp01((t - 0.3) / 0.4)));
  risers(ctx, t, w, h, riseGlyphs, 7);
  sparkles(ctx, t, cx, y, big * 1.6, accent);
}

/** Dussehra — Lord Ram's bow, an arrow, and the burning of Ravana's effigy
 *  (Ravana Dahan): the victory of dharma over evil, under Om. */
function dussehraScene(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, accent: string) {
  const cx = w / 2, y = h * 0.34, big = Math.min(w, h) * 0.2;
  glyph(ctx, '🕉️', cx, h * 0.16, big * 0.7, 0, ease(clamp01(t / 0.4)));
  glyph(ctx, '🏹', cx - big * 1.15, y, big * 1.2, 0.12, ease(clamp01(t / 0.35)));
  const ignite = ease(clamp01((t - 0.3) / 0.5));
  // Ravana's effigy ablaze — flickers once the arrow lands.
  glyph(ctx, '🔥', cx + big * 1.05, y + big * 0.2, big * (0.5 + ignite * 0.8) * (0.85 + 0.15 * Math.abs(Math.sin(t * 9))), 0, ease(clamp01((t - 0.2) / 0.4)));
  risers(ctx, t, w, h, ['🔥', '🪔', '✨'], 6);
  sparkles(ctx, t, cx, y, big * 1.4, accent);
}

/** Krishna Janmashtami — the bansuri (flute) and mor-pankh (peacock feather),
 *  Krishna's own emblems, with makhan (butter) rising; under Om. */
function janmashtamiScene(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, accent: string) {
  const cx = w / 2, y = h * 0.33, big = Math.min(w, h) * 0.22;
  const s = ease(clamp01(t / 0.45));
  halo(ctx, cx, y, big * 1.6, s);
  glyph(ctx, '🕉️', cx, h * 0.15, big * 0.5, 0, s);
  glyph(ctx, '🪶', cx - big * 0.15, y - big * 0.75, big * 0.5, Math.sin(t * 3) * 0.18, ease(clamp01((t - 0.15) / 0.4)));
  glyph(ctx, '🪈', cx, y, big * (0.85 + 0.15 * s), Math.sin(t * 2) * 0.06, s);
  risers(ctx, t, w, h, ['🧈', '🪶', '🌸'], 7);
  sparkles(ctx, t, cx, y, big * 1.6, accent);
}

export const OCCASION_ANIMS: OccasionAnim[] = [
  // ── People & milestones (character-led, WhatsApp-GIF feel) ────────────────
  { id: 'birthday', label: 'Birthday', icon: '🎂', bg: ['#1e1b4b', '#4c1d95'], accent: '#f59e0b', fg: '#ffffff', wish: 'Happy Birthday!', draw: giftUnbox },
  { id: 'birthday-kids', label: 'Birthday (kids & fun)', icon: '🧒', bg: ['#0c4a6e', '#0369a1'], accent: '#fbbf24', fg: '#ffffff', wish: 'Happy Birthday!', draw: birthdayKids },
  { id: 'anniversary', label: 'Anniversary', icon: '💞', bg: ['#4c0519', '#831843'], accent: '#fb7185', fg: '#ffffff', wish: 'Happy Anniversary', draw: coupleHearts },
  { id: 'love', label: 'Love / Valentine', icon: '❤️', bg: ['#500724', '#9d174d'], accent: '#fb7185', fg: '#ffffff', wish: 'I Love You', draw: loveEnvelope },
  { id: 'congrats', label: 'Congratulations', icon: '🏆', bg: ['#0b3d2e', '#14532d'], accent: '#fcd34d', fg: '#ffffff', wish: 'Congratulations!', draw: trophyRise },
  { id: 'graduation', label: 'Graduation', icon: '🎓', bg: ['#0c1b3a', '#1e3a8a'], accent: '#fcd34d', fg: '#ffffff', wish: 'You did it!', draw: gradToss },
  { id: 'thankyou', label: 'Thank You', icon: '💐', bg: ['#500724', '#9d174d'], accent: '#f9a8d4', fg: '#ffffff', wish: 'Thank You', draw: bouquetBloom },
  { id: 'getwell', label: 'Get Well Soon', icon: '🌻', bg: ['#14532d', '#166534'], accent: '#fde047', fg: '#ffffff', wish: 'Get Well Soon', draw: getWellSun },
  { id: 'wedding', label: 'Wedding', icon: '💍', bg: ['#3b1d0f', '#7c5c1e'], accent: '#fde68a', fg: '#ffffff', wish: 'Congratulations', draw: weddingRings },
  { id: 'newyear', label: 'New Year', icon: '🎆', bg: ['#050a1f', '#1e1b4b'], accent: '#93c5fd', fg: '#ffffff', wish: 'Happy New Year', draw: fireworks },
  { id: 'celebration', label: 'Celebration / Party', icon: '🎉', bg: ['#2a0a4a', '#4c1d95'], accent: '#fbbf24', fg: '#ffffff', wish: 'Congrats!', draw: partyDancers },
  { id: 'friendship', label: 'Friendship Day', icon: '🫶', bg: ['#052e2b', '#0b4d47'], accent: '#5eead4', fg: '#ffffff', wish: 'Happy Friendship Day', draw: (ctx, t, w, h, accent) => { const cx = w / 2, y = h * 0.32, big = Math.min(w, h) * 0.2; figure(ctx, 'girl', 'girl', cx - big * 0.7, y + big * 0.6, big * 2.2, t, 0.05); figure(ctx, 'boy', 'boy', cx + big * 0.7, y + big * 0.6, big * 2.2, t, 0.15); risers(ctx, t, w, h, ['🫶', '🤝', '⭐'], 6); sparkles(ctx, t, cx, y, big * 1.5, accent); } },

  // ── Indian festivals ──────────────────────────────────────────────────────
  { id: 'diwali', label: 'Diwali', icon: '🪔', bg: ['#160a2e', '#2a1250'], accent: '#f59e0b', fg: '#fde68a', wish: 'Happy Diwali', sacred: '/sacred/lakshmi.jpg', draw: sacredScene('/sacred/lakshmi.jpg', '🪔', ['🪔', '🌺', '✨']) },
  // Deity festivals use reverent devotional SYMBOLS (Om, trishul, flute, bow),
  // not animal/dancer stand-ins — there is no emoji for the deities themselves.
  { id: 'ganesh', label: 'Ganesh Chaturthi', icon: '🕉️', bg: ['#2a0f05', '#5c2c0e'], accent: '#fbbf24', fg: '#fde68a', wish: 'Ganpati Bappa Morya', sacred: '/sacred/ganesha.jpg', draw: sacredScene('/sacred/ganesha.jpg', '🕉️', ['🌺', '🪔', '🙏']) },
  { id: 'navratri', label: 'Navratri / Durga Puja', icon: '🔱', bg: ['#2a0a4a', '#4c1d95'], accent: '#fbbf24', fg: '#f5d0fe', wish: 'Jai Mata Di', sacred: '/sacred/durga.jpg', draw: sacredScene('/sacred/durga.jpg', '🔱', ['🌺', '🪔', '✨']) },
  { id: 'dussehra', label: 'Dussehra', icon: '🏹', bg: ['#3a0d0d', '#5c1a1a'], accent: '#fbbf24', fg: '#fde68a', wish: 'Happy Dussehra', sacred: '/sacred/rama.jpg', draw: sacredScene('/sacred/rama.jpg', '🏹', ['🏹', '🪔', '✨']) },
  { id: 'janmashtami', label: 'Krishna Janmashtami', icon: '🪈', bg: ['#08122e', '#132251'], accent: '#93c5fd', fg: '#dbeafe', wish: 'Happy Janmashtami', sacred: '/sacred/radha-krishna.jpg', draw: sacredScene('/sacred/radha-krishna.jpg', '🪈', ['🦚', '🪈', '✨']) },
  { id: 'holi', label: 'Holi', icon: '🎨', bg: ['#1e1b4b', '#4c1d95'], accent: '#f472b6', fg: '#fef08a', wish: 'Happy Holi', draw: (ctx, t, w, h, accent) => { confetti(ctx, t, w, h, w / 2, h * 0.3, 0.12); person(ctx, '🧑‍🎨', w / 2, h * 0.32, Math.min(w, h) * 0.22, t, 0.05); risers(ctx, t, w, h, ['💛', '💚', '💜', '❤️', '💙'], 9); sparkles(ctx, t, w / 2, h * 0.3, Math.min(w, h) * 0.2, accent); } },
  { id: 'makar-sankranti', label: 'Makar Sankranti / Kite', icon: '🪁', bg: ['#0b2a4a', '#155e75'], accent: '#fbbf24', fg: '#e0f2fe', wish: 'Happy Sankranti', draw: kiteFlyer },
  { id: 'pongal', label: 'Pongal', icon: '🌾', bg: ['#3a2a05', '#7c5c1e'], accent: '#fde047', fg: '#fef9c3', wish: 'Happy Pongal', draw: harvestJoy },
  { id: 'onam', label: 'Onam', icon: '🌺', bg: ['#12330f', '#1f4d10'], accent: '#fde047', fg: '#dcfce7', wish: 'Happy Onam', draw: harvestJoy },
  { id: 'lohri-baisakhi', label: 'Lohri / Baisakhi', icon: '🔥', bg: ['#3a1405', '#5c2408'], accent: '#f59e0b', fg: '#fde68a', wish: 'Happy Lohri', draw: (ctx, t, w, h, accent) => { const cx = w / 2, y = h * 0.34, big = Math.min(w, h) * 0.2; glyph(ctx, '🔥', cx, y + big * 0.4, big * (0.8 + 0.2 * Math.abs(Math.sin(t * 8))), 0, 1); figure(ctx, 'boy', 'boyFestive2', cx - big * 1.1, y + big * 0.6, big * 1.9, t, 0.1, 'indian'); figure(ctx, 'girl', 'girlFestive', cx + big * 1.1, y + big * 0.6, big * 1.9, t, 0.2, 'indian'); risers(ctx, t, w, h, ['🥁', '🌾', '✨'], 6); sparkles(ctx, t, cx, y, big * 1.4, accent); } },
  { id: 'eid', label: 'Eid', icon: '🌙', bg: ['#062821', '#0b3d33'], accent: '#d4af37', fg: '#f0e6c8', wish: 'Eid Mubarak', draw: (ctx, t, w, h, accent) => { const s = ease(clamp01(t / 0.4)); glyph(ctx, '🕌', w / 2, h * 0.3, Math.min(w, h) * 0.26 * (0.6 + s * 0.4), 0, s); glyph(ctx, '🌙', w * 0.7, h * 0.16, Math.min(w, h) * 0.12, 0, s); sparkles(ctx, t, w / 2, h * 0.3, Math.min(w, h) * 0.22, accent); risers(ctx, t, w, h, ['⭐', '🏮', '✨'], 6); } },
  { id: 'rakhi', label: 'Raksha Bandhan', icon: '🪢', bg: ['#3a1405', '#5c2c0e'], accent: '#fbbf24', fg: '#fde68a', wish: 'Happy Raksha Bandhan', draw: (ctx, t, w, h, accent) => { const cx = w / 2, y = h * 0.32, big = Math.min(w, h) * 0.2; figure(ctx, 'boy', 'boyFestive', cx - big * 0.7, y + big * 0.6, big * 2.1, t, 0.05, 'indian'); figure(ctx, 'girl', 'girlFestive', cx + big * 0.7, y + big * 0.6, big * 2.1, t, 0.15, 'indian'); glyph(ctx, '🎀', cx, y - big * 0.1, big * 0.7, Math.sin(t * 4) * 0.2, ease(clamp01((t - 0.3) / 0.4))); risers(ctx, t, w, h, ['🎁', '🍬', '🌺'], 6); sparkles(ctx, t, cx, y, big * 1.4, accent); } },
  { id: 'bhai-dooj', label: 'Bhai Dooj', icon: '🫶', bg: ['#2a1405', '#5c2c0e'], accent: '#fbbf24', fg: '#fde68a', wish: 'Happy Bhai Dooj', draw: (ctx, t, w, h, accent) => { const cx = w / 2, y = h * 0.32, big = Math.min(w, h) * 0.2; figure(ctx, 'girl', 'girlFestive2', cx - big * 0.7, y + big * 0.6, big * 2.1, t, 0.05, 'indian'); figure(ctx, 'boy', 'boyFestive2', cx + big * 0.7, y + big * 0.6, big * 2.1, t, 0.15, 'indian'); glyph(ctx, '🪔', cx, y + big, big * 0.6, 0, ease(clamp01((t - 0.3) / 0.4))); risers(ctx, t, w, h, ['🍬', '🎁', '✨'], 6); sparkles(ctx, t, cx, y, big * 1.4, accent); } },
  { id: 'christmas', label: 'Christmas', icon: '🎄', bg: ['#0c2818', '#14532d'], accent: '#e0a94e', fg: '#f8e7c9', wish: 'Merry Christmas', draw: santaScene },
  { id: 'independence', label: 'Independence / Republic Day', icon: '🇮🇳', bg: ['#0b1d3a', '#132e57'], accent: '#fb923c', fg: '#ffffff', wish: 'Jai Hind 🇮🇳', draw: (ctx, t, w, h, accent) => { const s = ease(clamp01(t / 0.4)); glyph(ctx, '🇮🇳', w / 2, h * 0.3, Math.min(w, h) * 0.28 * (0.6 + s * 0.4), Math.sin(t * 4) * 0.08, s); figure(ctx, 'boy', 'boyFestive', w / 2, h * 0.6, Math.min(w, h) * 0.28, t, 0.3, 'indian'); risers(ctx, t, w, h, ['🎈', '🕊️', '⭐'], 7); sparkles(ctx, t, w / 2, h * 0.3, Math.min(w, h) * 0.2, accent); } },
];

export const occasionAnimById = (id: string): OccasionAnim => OCCASION_ANIMS.find((o) => o.id === id) ?? OCCASION_ANIMS[0]!;

export interface GreetingContent { wish: string; name: string; message: string; photo?: HTMLImageElement | null }

/** Draw a rounded/circular photo cover-fitted into a circle at (cx,cy,r). */
function drawPhotoCircle(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, r: number, accent: string) {
  const iw = img.naturalWidth || 1, ih = img.naturalHeight || 1;
  const scale = Math.max((2 * r) / iw, (2 * r) / ih);
  const dw = iw * scale, dh = ih * scale;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.closePath(); ctx.clip();
  try { ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh); } catch { /* not decoded */ }
  ctx.restore();
  ctx.lineWidth = Math.max(3, r * 0.06); ctx.strokeStyle = accent;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
}

function drawTextLines(ctx: CanvasRenderingContext2D, lines: { text: string; size: number; weight: number; font: string }[], w: number, startY: number, fg: string) {
  let y = startY;
  for (const ln of lines) {
    if (!ln.text.trim()) continue;
    ctx.font = `${ln.weight} ${ln.size}px ${ln.font}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, ln.size / 8); ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeText(ln.text, w / 2, y); ctx.fillStyle = fg; ctx.fillText(ln.text, w / 2, y);
    y += ln.size * 1.35;
  }
}

/** Composite a full greeting frame: background + animated hero + optional photo
 *  + wish/name/message. Shared by the live preview and the encoder. */
export function paintGreetingFrame(ctx: CanvasRenderingContext2D, occ: OccasionAnim, t: number, w: number, h: number, content: GreetingContent) {
  paintBackdrop(ctx, t, w, h, occ);

  occ.draw(ctx, t, w, h, occ.accent);

  const hasPhoto = !!content.photo;
  if (hasPhoto) drawPhotoCircle(ctx, content.photo!, w / 2, h * 0.58, Math.min(w, h) * 0.16, occ.accent);

  // Text stack fades/scales in after the hero settles.
  const reveal = ease(clamp01((t - 0.25) / 0.4));
  ctx.save();
  ctx.globalAlpha = reveal;
  const textTop = hasPhoto ? h * 0.75 : h * 0.62;
  drawTextLines(ctx, [
    { text: content.wish, size: Math.round(w * (content.wish.length > 16 ? 0.075 : 0.1)), weight: 900, font: "'Archivo','Inter',sans-serif" },
    { text: content.name, size: Math.round(w * 0.06), weight: 800, font: "'Segoe Script','Comic Sans MS',cursive" },
    { text: content.message, size: Math.round(w * 0.04), weight: 600, font: "'Inter',sans-serif" },
  ], w, textTop, occ.fg);
  ctx.restore();
}
