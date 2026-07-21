/**
 * Prompt-to-design — describe what you want ("summer sale, 30% off") and get a
 * complete, on-brand Design: a layout archetype chosen from the prompt, headline
 * and subtext written by the copywriter, and colours/fonts pulled from the active
 * brand kit. Pure and deterministic (no model, nothing uploaded) so it's
 * unit-tested; the modal just collects the prompt and opens the result.
 */
import { newElId, photoSlot, type Design, type Element, type Format } from './model.js';
import { hexToRgb } from './brandEnforce.js';
import { headlines, titleCase, fitToLength } from './copywriter.js';
import type { BrandKit } from './brandStore.js';

export type Archetype = 'promo' | 'quote' | 'event' | 'announcement' | 'greeting';

/** A festive occasion the prompt can mention — drives the 'greeting' archetype
 *  so "Diwali card for my family" produces a real festival card (hero motif,
 *  festive palette, ready wish) rather than a generic business poster. */
export interface PromptOccasion { key: string; match: RegExp; hero: string; scatter: [string, string, string, string]; bg: string; accent: string; wish: string; sub: string; message: string }
export const PROMPT_OCCASIONS: PromptOccasion[] = [
  { key: 'diwali', match: /diwali|deepavali|दिवाली|दीपावली/i, hero: '🪔', scatter: ['🪔', '🎆', '🪷', '✨'], bg: '#160a2e', accent: '#fbbf24', wish: 'Happy Diwali', sub: 'शुभ दीपावली', message: 'May the festival of lights fill your\nhome with joy and prosperity' },
  { key: 'ganesh', match: /ganesh|ganpati|bappa|गणपती|गणेश/i, hero: '🕉️', scatter: ['🥁', '🌺', '🚩', '✨'], bg: '#3a1405', accent: '#fbbf24', wish: 'Ganpati Bappa Morya', sub: 'गणपती बाप्पा मोरया', message: 'May Bappa remove every obstacle\nand bless your home' },
  { key: 'durga', match: /durga|pujo|dussehra|navratri|দুর্গা/i, hero: '🌺', scatter: ['🥁', '🪔', '🌾', '✨'], bg: '#3a0d1a', accent: '#fbbf24', wish: 'Shubho Durga Pujo', sub: 'শুভ দুর্গা পূজা', message: 'May Maa Durga bless you with\nstrength, joy and new beginnings' },
  { key: 'chhath', match: /chhath|छठ/i, hero: '🌅', scatter: ['🧺', '🍌', '🥥', '🪔'], bg: '#431407', accent: '#fde047', wish: 'Chhath Mahaparv', sub: 'जय छठी मईया', message: 'May Chhathi Maiya bless your\nfamily with health and happiness' },
  { key: 'holi', match: /holi|होली/i, hero: '🎨', scatter: ['💛', '💚', '❤️', '💜'], bg: '#1e1b4b', accent: '#fde047', wish: 'Happy Holi', sub: 'रंगों की शुभकामनाएँ', message: 'May your life be as colourful\nand joyful as Holi' },
  { key: 'eid', match: /\beid\b|ramadan|ramzan|ईद/i, hero: '🌙', scatter: ['⭐', '🕌', '🏮', '✨'], bg: '#062821', accent: '#d4af37', wish: 'Eid Mubarak', sub: 'ईद मुबारक', message: 'May this blessed day bring peace,\nhappiness and togetherness' },
  { key: 'christmas', match: /christmas|xmas/i, hero: '🎄', scatter: ['🎅', '🎁', '❄️', '🔔'], bg: '#0c2818', accent: '#f8e7c9', wish: 'Merry Christmas', sub: 'joy to your home', message: 'Wishing you warmth, joy and\ntogetherness this season' },
  { key: 'rakhi', match: /rakhi|raksha/i, hero: '🪢', scatter: ['🎁', '🍬', '🌺', '✨'], bg: '#fff1e6', accent: '#b3541e', wish: 'Happy Raksha Bandhan', sub: 'रक्षा बंधन', message: 'A bond of love and protection —\ntoday and always' },
  { key: 'independence', match: /independence|15 ?aug|jai hind/i, hero: '🇮🇳', scatter: ['🎈', '🕊️', '⭐', '🎆'], bg: '#0b1d3a', accent: '#fb923c', wish: 'Happy Independence Day', sub: 'जय हिंद 🇮🇳', message: 'Saluting the spirit of freedom —\nproud to be Indian' },
  { key: 'birthday', match: /birthday|bday|जन्मदिन|वाढदिवस/i, hero: '🎂', scatter: ['🎈', '🎉', '🎁', '⭐'], bg: '#1f2b4d', accent: '#f5d78a', wish: 'Happy Birthday', sub: 'wishing you the very best', message: 'May your year be as bright and\nwonderful as you are' },
  { key: 'anniversary', match: /anniversar|सालगिरह/i, hero: '💞', scatter: ['💐', '🌹', '💕', '✨'], bg: '#3b0a1e', accent: '#ffd166', wish: 'Happy Anniversary', sub: 'to the perfect pair', message: 'Here’s to love that grows\nstronger every year' },
  { key: 'wedding', match: /wedding|shaadi|marriage|विवाह/i, hero: '💍', scatter: ['💐', '🥂', '💞', '✨'], bg: '#fffdf5', accent: '#7c5c1e', wish: 'Happy Wedding Day', sub: 'a lifetime of love', message: 'Wishing you a lifetime of love\nand laughter together' },
  { key: 'newyear', match: /new year|नववर्ष/i, hero: '🎆', scatter: ['🎇', '🥂', '🎉', '✨'], bg: '#050a1f', accent: '#fbbf24', wish: 'Happy New Year', sub: 'new dreams, new wins', message: 'May your year sparkle with\nnew dreams and new wins' },
  { key: 'thanks', match: /thank|धन्यवाद|gratitude/i, hero: '💐', scatter: ['💕', '🌸', '✨', '🙏'], bg: '#fdf2f8', accent: '#9d174d', wish: 'Thank You', sub: 'with heartfelt gratitude', message: 'Your kindness means the world —\nthank you, truly' },
];
export function occasionForPrompt(prompt: string): PromptOccasion | null {
  return PROMPT_OCCASIONS.find((o) => o.match.test(prompt)) ?? null;
}

/** Pick a layout archetype from the prompt's wording. */
export function archetypeFor(prompt: string): Archetype {
  const p = prompt.toLowerCase();
  if (/\b(sale|discount|% ?off|\d+%|promo|deal|offer|shop|buy)\b/.test(p)) return 'promo';
  if (/\b(quote|inspir|motivat|saying|wisdom)\b/.test(p) || /["“]/.test(prompt)) return 'quote';
  if (/\b(event|webinar|party|invite|invitation|join|rsvp|workshop|meetup|conference|launch)\b/.test(p)) return 'event';
  // A named occasion (or the word card/greeting/wish) → festive greeting card.
  if (occasionForPrompt(prompt) || /\b(card|greeting|wish|wishes)\b/.test(p)) return 'greeting';
  return 'announcement';
}

const lum = (c: string): number => { const r = hexToRgb(c); return r ? 0.299 * r[0] + 0.587 * r[1] + 0.114 * r[2] : 255; };
/** Black or white, whichever reads better on the given background. */
export function contrastText(bg: string): string { return lum(bg) > 140 ? '#0f172a' : '#ffffff'; }

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
/** Shift a hex colour toward white (amt>0) or black (amt<0), 0–1. */
export function shade(hex: string, amt: number): string {
  const r = hexToRgb(hex); if (!r) return hex;
  const t = amt >= 0 ? 255 : 0, k = Math.abs(amt);
  const mix = (v: number) => clamp255(v + (t - v) * k);
  return '#' + [mix(r[0]), mix(r[1]), mix(r[2])].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Curated backgrounds for the "Describe it" tool, so the design isn't stuck on
 *  one auto-picked flat colour. `deco` adds a soft opaque accent shape for depth. */
export interface PromptBg { id: string; label: string; bg: string; deco: boolean }
export const PROMPT_BACKGROUNDS: PromptBg[] = [
  { id: 'auto', label: '✨ Auto (match the words)', bg: '', deco: true },
  { id: 'midnight', label: '🌙 Midnight', bg: '#0f172a', deco: true },
  { id: 'ocean', label: '🌊 Ocean', bg: '#0ea5e9', deco: true },
  { id: 'grape', label: '🍇 Grape', bg: '#7c3aed', deco: true },
  { id: 'sunset', label: '🌅 Sunset', bg: '#f97316', deco: true },
  { id: 'forest', label: '🌿 Forest', bg: '#059669', deco: true },
  { id: 'rose', label: '🌹 Rose', bg: '#e11d48', deco: true },
  { id: 'paper', label: '📄 Clean paper', bg: '#f8fafc', deco: false },
  { id: 'solid-dark', label: '⬛ Plain dark', bg: '#111827', deco: false },
];
export const promptBgById = (id: string): PromptBg => PROMPT_BACKGROUNDS.find((b) => b.id === id) ?? PROMPT_BACKGROUNDS[0]!;

/** Split words into `lineCount` lines balanced by length (greedy to a target). */
function balanceLines(words: string[], lineCount: number): string[] {
  if (lineCount <= 1) return [words.join(' ')];
  const target = words.join(' ').length / lineCount;
  const lines: string[] = [];
  let cur: string[] = [], curLen = 0;
  for (const w of words) {
    const add = (cur.length ? 1 : 0) + w.length;
    if (cur.length && curLen + add > target && lines.length < lineCount - 1) {
      lines.push(cur.join(' ')); cur = [w]; curLen = w.length;
    } else { cur.push(w); curLen += add; }
  }
  if (cur.length) lines.push(cur.join(' '));
  return lines;
}

/**
 * Fit a headline to a box: wraps into up to 3 balanced lines and picks the
 * largest font size (≤ maxSize) whose widest line still fits `maxWidth`, so the
 * text never spills off the canvas. Deterministic — glyph width is estimated at
 * `avgCharW × size` (0.56 suits a bold sans). Returns the lines + chosen size.
 */
export function fitHeadline(title: string, maxWidth: number, maxSize: number, avgCharW = 0.56): { lines: string[]; size: number } {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [title], size: maxSize };
  let best = { lines: [words.join(' ')], size: 0 };
  for (let L = 1; L <= Math.min(3, words.length); L++) {
    const lines = balanceLines(words, L);
    const longest = Math.max(...lines.map((s) => s.length)) || 1;
    const size = Math.min(maxSize, Math.floor(maxWidth / (longest * avgCharW)));
    if (size > best.size) best = { lines, size }; // biggest readable size wins
  }
  return { lines: best.lines, size: Math.max(12, best.size) };
}

/** Optional AI-written copy (from the Groq proxy) that overrides the built-in
 *  deterministic wording. The layout stays local; only the words change. */
export interface PromptCopy { headline?: string; subtitle?: string; message?: string }

/**
 * A full AI-designed card: the model chooses the palette (incl. a gradient),
 * motifs, typography style and layout — not just the words. Rendered locally by
 * `aiCardToDesign`, so the AI output is a compact JSON spec, never raw SVG.
 */
export interface AiCardSpec {
  bg: string; bg2?: string; accent: string; ink: string;
  hero: string; scatter: string[];
  headline: string; subtitle?: string; message?: string;
  style?: 'bold' | 'elegant' | 'cute' | '3d';
  photo?: boolean;
}

/** Render an AI card spec into a Design (gradient bg, aurora glow, optional
 *  faux-3D headline or tap-to-add photo slot, corner motifs). Pure. */
export function aiCardToDesign(spec: AiCardSpec, format: Format): Design {
  const W = format.w, H = format.h;
  const pad = Math.round(W * 0.1);
  const els: Element[] = [];
  const s = Math.min(W, H);
  // Aurora glow blobs give the gradient depth.
  els.push({ id: newElId(), type: 'ellipse', x: -W * 0.18, y: -H * 0.08, w: W * 0.85, h: W * 0.85, fill: shade(spec.bg2 ?? spec.bg, 0.18), opacity: 0.35 });
  els.push({ id: newElId(), type: 'ellipse', x: W * 0.5, y: H * 0.55, w: W * 0.8, h: W * 0.8, fill: shade(spec.bg, 0.12), opacity: 0.3 });
  // Corner motifs.
  const es = Math.round(s * 0.09);
  const spots: [number, number, number][] = [[W * 0.06, H * 0.05, -12], [W * 0.82, H * 0.05, 12], [W * 0.06, H * 0.84, 10], [W * 0.82, H * 0.84, -10]];
  spec.scatter.slice(0, 4).forEach((e, i) => els.push({ id: newElId(), type: 'text', x: spots[i]![0], y: spots[i]![1], w: es * 1.4, h: es * 1.4, text: e, size: es, color: spec.ink, font: EMOJI_FONT, weight: 700, align: 'center', rotation: spots[i]![2], motion: (['float', 'pulse', 'wobble', 'float'] as const)[i] }));
  // Centrepiece: photo slot (personalised) or hero motif.
  if (spec.photo) {
    const ps = Math.min(W - pad * 2, Math.round(s * 0.5));
    els.push({ ...photoSlot((W - ps) / 2, H * 0.12, ps, ps), shape: 'circle', shadow: 'soft' });
  } else {
    const hs = Math.round(s * 0.17);
    els.push({ id: newElId(), type: 'text', x: (W - hs * 1.4) / 2, y: H * 0.15, w: hs * 1.4, h: hs * 1.4, text: spec.hero, size: hs, color: spec.ink, font: EMOJI_FONT, weight: 700, align: 'center', rotation: 0, motion: 'pulse' });
  }
  // Headline in the AI-chosen typographic voice.
  const font = spec.style === 'elegant' ? 'Georgia, serif' : spec.style === 'cute' ? "'Segoe Script', 'Comic Sans MS', cursive" : 'Inter, system-ui, sans-serif';
  const head = fitHeadline(spec.headline, W - pad * 2, Math.round(W * (spec.style === 'bold' || spec.style === '3d' ? 0.14 : 0.12)));
  const headH = head.lines.length * head.size * 1.18;
  const headY = H * 0.47;
  if (spec.style === '3d') {
    for (const off of [Math.round(W * 0.009), Math.round(W * 0.006), Math.round(W * 0.003)]) {
      els.push({ id: newElId(), type: 'text', x: pad + off, y: headY + off, w: W - pad * 2, h: headH, text: head.lines.join('\n'), size: head.size, color: shade(spec.bg, -0.35), font, weight: 900, align: 'center' });
    }
  }
  els.push({ id: newElId(), type: 'text', x: pad, y: headY, w: W - pad * 2, h: headH, text: head.lines.join('\n'), size: head.size, color: spec.accent, font, weight: 900, align: 'center' });
  let y = headY + headH + H * 0.02;
  if (spec.subtitle) {
    els.push({ id: newElId(), type: 'text', x: pad, y, w: W - pad * 2, h: W * 0.05 * 1.4, text: spec.subtitle, size: Math.round(W * 0.045), color: spec.ink, font: 'Inter, system-ui, sans-serif', weight: 600, align: 'center' });
    y += W * 0.045 * 1.4 + H * 0.02;
  }
  if (spec.message) {
    els.push({ id: newElId(), type: 'text', x: pad, y, w: W - pad * 2, h: W * 0.034 * 2.6, text: spec.message, size: Math.round(W * 0.032), color: spec.ink, font: 'Inter, system-ui, sans-serif', weight: 500, align: 'center' });
  }
  return { w: W, h: H, background: spec.bg, ...(spec.bg2 ? { bg2: spec.bg2 } : {}), elements: els };
}

interface Opts { format: Format; brand?: BrandKit; bgId?: string; copy?: PromptCopy }

/** Build a finished Design from a prompt. */
export function promptToDesign(prompt: string, opts: Opts): Design {
  const { format, brand } = opts;
  const W = format.w, H = format.h;
  const arch = archetypeFor(prompt);
  if (arch === 'greeting') return greetingDesign(prompt, opts);
  const headingFont = brand?.fonts.heading ?? 'Inter, system-ui, sans-serif';
  const bodyFont = brand?.fonts.body ?? 'Inter, system-ui, sans-serif';
  // Background: the user's chosen preset wins; else brand primary; else a
  // tasteful default per archetype.
  const bgPreset = opts.bgId ? promptBgById(opts.bgId) : null;
  const bg = (bgPreset && bgPreset.bg) || brand?.colors[0] || { promo: '#ef4444', quote: '#0f172a', event: '#2e5bff', announcement: '#0ea5e9' }[arch];
  const fg = contrastText(bg);
  const accent = brand?.colors.find((c) => c !== bg) ?? (fg === '#ffffff' ? '#ffffff' : '#2e5bff');

  const pad = Math.round(W * 0.08);
  const cx = W / 2;
  const els: Element[] = [];
  // A soft, opaque accent "glow" behind the content gives a designed, non-flat
  // background (the model has no gradients). A shade of the background keeps text
  // contrast intact. Skipped for the deliberately-plain presets.
  const deco = bgPreset ? bgPreset.deco : true;
  if (deco) {
    const tint = shade(bg, fg === '#ffffff' ? 0.14 : -0.08); // lighten on dark, darken on light
    const r = Math.round(W * 0.62);
    els.push({ id: newElId(), type: 'ellipse', x: W - r * 0.55, y: -r * 0.35, w: r, h: r, fill: tint });
    els.push({ id: newElId(), type: 'ellipse', x: -r * 0.5, y: H - r * 0.55, w: r * 0.9, h: r * 0.9, fill: tint });
  }
  const text = (text: string, y: number, size: number, weight: number, color = fg, font = bodyFont): void => {
    els.push({ id: newElId(), type: 'text', x: pad, y, w: W - pad * 2, h: size * 1.4, text, size, color, font, weight, align: 'center' });
  };

  const title = opts.copy?.headline || headlines(prompt, 1)[0] || titleCase(prompt) || 'Your Headline';
  const sub: Record<Archetype, string> = {
    // 'greeting' is handled by greetingDesign() (early return above) and never
    // reaches here, but the record must be exhaustive for the type.
    greeting: 'with love',
    promo: 'Limited time only — don’t miss out.',
    quote: '— add your attribution',
    event: 'Save the date · add details here',
    announcement: fitToLength(`${titleCase(prompt)} — here’s what’s new.`, 80),
  };

  // Headline: wrapped + auto-sized so it always fits the canvas (never clipped),
  // then the accent bar and subtext flow below the actual block height.
  const headY = arch === 'quote' ? H * 0.30 : H * 0.34;
  const head = fitHeadline(title, W - pad * 2, Math.round(W * 0.13));
  const headBlockH = head.lines.length * head.size * 1.18;
  els.push({
    id: newElId(), type: 'text', x: pad, y: headY, w: W - pad * 2, h: headBlockH,
    text: arch === 'quote' ? `“${head.lines.join('\n')}”` : head.lines.join('\n'),
    size: head.size, color: fg, font: headingFont, weight: 800, align: 'center',
  });
  const barY = headY + headBlockH + Math.round(H * 0.02);
  els.push({ id: newElId(), type: 'rect', x: cx - W * 0.08, y: barY, w: W * 0.16, h: Math.max(4, Math.round(H * 0.006)), fill: accent });
  text(opts.copy?.message || sub[arch], barY + Math.round(H * 0.045), Math.round(W * 0.038), 400);

  // Promo/event get a call-to-action pill.
  if (arch === 'promo' || arch === 'event') {
    const label = arch === 'promo' ? 'Shop now' : 'RSVP';
    const pw = W * 0.34, ph = H * 0.08, px = cx - pw / 2, py = H * 0.78;
    els.push({ id: newElId(), type: 'rect', x: px, y: py, w: pw, h: ph, fill: accent, radius: ph / 2 });
    els.push({ id: newElId(), type: 'text', x: px, y: py + ph * 0.28, w: pw, h: ph, text: label, size: Math.round(ph * 0.42), color: contrastText(accent), font: headingFont, weight: 700, align: 'center' });
  }

  return { w: W, h: H, background: bg, elements: els };
}

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

/** The 'greeting' archetype — a festive card, not a business poster: occasion
 *  palette + hero motif + corner decorations + a ready wish, with the user's own
 *  words as the personal line. Deterministic like everything else here. */
function greetingDesign(prompt: string, opts: Opts): Design {
  const { format } = opts;
  const W = format.w, H = format.h;
  const occ = occasionForPrompt(prompt);
  const bgPreset = opts.bgId ? promptBgById(opts.bgId) : null;
  const bg = (bgPreset && bgPreset.bg) || occ?.bg || '#1f2b4d';
  const fg = contrastText(bg);
  const accent = occ && !(bgPreset && bgPreset.bg) ? occ.accent : fg;
  const hero = occ?.hero ?? '💌';
  const scatter = occ?.scatter ?? ['✨', '🎉', '💫', '⭐'];
  const els: Element[] = [];
  const s = Math.min(W, H);

  // Soft halo behind the hero for depth.
  els.push({ id: newElId(), type: 'ellipse', x: W / 2 - s * 0.3, y: H * 0.1, w: s * 0.6, h: s * 0.6, fill: shade(bg, fg === '#ffffff' ? 0.12 : -0.07) });
  // Corner decorations.
  const es = Math.round(s * 0.1);
  const spots: [number, number, number][] = [[W * 0.06, H * 0.05, -12], [W * 0.82, H * 0.05, 12], [W * 0.06, H * 0.82, 10], [W * 0.82, H * 0.82, -10]];
  scatter.slice(0, 4).forEach((e, i) => els.push({ id: newElId(), type: 'text', x: spots[i]![0], y: spots[i]![1], w: es * 1.4, h: es * 1.4, text: e, size: es, color: fg, font: EMOJI_FONT, weight: 700, align: 'center', rotation: spots[i]![2] }));
  // Hero motif.
  const hs = Math.round(s * 0.18);
  els.push({ id: newElId(), type: 'text', x: (W - hs * 1.4) / 2, y: H * 0.16, w: hs * 1.4, h: hs * 1.4, text: hero, size: hs, color: fg, font: EMOJI_FONT, weight: 700, align: 'center', rotation: 0, motion: 'pulse' });

  // Wish headline (auto-fit), native-script subtitle, then a warm message.
  const pad = Math.round(W * 0.1);
  const head = fitHeadline(opts.copy?.headline || (occ?.wish ?? titleCase(prompt)) || 'With Love', W - pad * 2, Math.round(W * 0.12));
  const headH = head.lines.length * head.size * 1.18;
  els.push({ id: newElId(), type: 'text', x: pad, y: H * 0.44, w: W - pad * 2, h: headH, text: head.lines.join('\n'), size: head.size, color: accent, font: 'Georgia, serif', weight: 900, align: 'center' });
  let y = H * 0.44 + headH + H * 0.02;
  const subLine = opts.copy?.subtitle || occ?.sub;
  if (subLine) {
    els.push({ id: newElId(), type: 'text', x: pad, y, w: W - pad * 2, h: W * 0.05 * 1.4, text: subLine, size: Math.round(W * 0.045), color: fg, font: 'Inter, system-ui, sans-serif', weight: 600, align: 'center' });
    y += W * 0.045 * 1.4 + H * 0.025;
  }
  // A warm wish line — AI-written when available, else the occasion's default.
  // (Never echo the user's raw prompt onto the card: "Eco-friendly Ganesh
  // Chaturthi card in Marathi" is an instruction, not a greeting.)
  const message = fitToLength(opts.copy?.message || occ?.message || 'With love and warm wishes', 110);
  els.push({ id: newElId(), type: 'text', x: pad, y, w: W - pad * 2, h: W * 0.034 * 2.6, text: message, size: Math.round(W * 0.032), color: fg, font: 'Inter, system-ui, sans-serif', weight: 500, align: 'center' });

  return { w: W, h: H, background: bg, elements: els };
}
