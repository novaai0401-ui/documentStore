/**
 * Card variants — a parameterised design library that expands a small set of
 * reusable *styles* (balloon, big-number, floral, photo frame, elegant frame,
 * boho arch, confetti, hearts, rustic, funny-quote) across occasions, sub-types
 * and colourways to produce many ready-to-edit designs without hand-laying each
 * one. Every entry carries an occasion + sub-type so the gallery can offer the
 * two-level navigation (occasion → sub-type) that a real card store has.
 *
 * All designs are plain `Design` objects (the same model invitations.ts uses),
 * so they render through the shared SVG/canvas pipeline and stay fully editable.
 */
import { newElId, photoSlot, type Design, type Element, type TextEl } from './model.js';

export interface CardVariant { id: string; name: string; emoji: string; occasion: string; subtype: string; make: () => Design }

const W = 1500, H = 2100;
const EMO = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const SCRIPT = "'Brush Script MT','Segoe Script','Snell Roundhand',cursive";
const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = 'Inter, system-ui, sans-serif';

const text = (o: Partial<TextEl> & { x: number; y: number; w: number; h: number; text: string }): TextEl => ({
  id: newElId(), type: 'text', size: 48, color: '#0f172a', font: SERIF, weight: 600, align: 'center', rotation: 0, ...o,
});
const rect = (x: number, y: number, w: number, h: number, fill: string, extra: Partial<Element> = {}): Element => ({ id: newElId(), type: 'rect', x, y, w, h, fill, ...extra } as Element);
const line = (x: number, y: number, w: number, stroke: string, strokeWidth = 3): Element => ({ id: newElId(), type: 'line', x, y, w, h: 0, stroke, strokeWidth } as Element);
const ellipse = (x: number, y: number, w: number, h: number, fill: string, extra: Partial<Element> = {}): Element => ({ id: newElId(), type: 'ellipse', x, y, w, h, fill, ...extra } as Element);
const emoji = (x: number, y: number, size: number, ch: string, rotation = 0, opacity = 1): TextEl =>
  text({ x, y, w: size * 1.4, h: size * 1.4, text: ch, size, font: EMO, rotation, opacity });

function dots(n: number, seed: number, colors: string[]): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < n; i++) {
    const r = (k: number) => { const x = Math.sin((i + seed + k) * 12.9898) * 43758.5453; return x - Math.floor(x); };
    const s = 14 + r(1) * 22;
    out.push(ellipse(30 + r(2) * (W - 90), 30 + r(3) * (H - 90), s, s, colors[i % colors.length]!, { opacity: 0.9 }));
  }
  return out;
}

/** A theme parameterises a style: colours + copy + optional accents. */
export interface Theme {
  bg: string; ink: string; accent: string; accent2?: string; soft?: string;
  title: string; sub?: string; eyebrow?: string; number?: string;
  emojis?: string[]; band?: string; scriptTitle?: boolean;
}

type Style = (t: Theme) => Design;

const D = (background: string, elements: Element[]): Design => ({ w: W, h: H, background, elements });

// ── Styles ───────────────────────────────────────────────────────────────────

const balloon: Style = (t) => D(t.bg, [
  ...(t.band ? [rect(0, 0, W, 70, t.band), rect(0, H - 70, W, 70, t.band)] : []),
  ellipse(360, 300, 260, 320, t.accent), ellipse(414, 344, 78, 100, '#ffffff', { opacity: 0.35 }),
  ellipse(700, 240, 260, 320, t.accent2 ?? t.accent), ellipse(754, 284, 78, 100, '#ffffff', { opacity: 0.35 }),
  ellipse(540, 500, 230, 285, t.soft ?? t.accent), ellipse(590, 540, 70, 90, '#ffffff', { opacity: 0.3 }),
  line(490, 620, 20, t.ink, 4), line(830, 560, -18, t.ink, 4), line(655, 785, 8, t.ink, 4),
  text({ x: 100, y: 1080, w: 1300, h: 240, text: t.title, size: t.title.length > 14 ? 130 : 160, color: t.accent, weight: t.scriptTitle ? 700 : 900, font: t.scriptTitle ? SCRIPT : SANS }),
  ...(t.sub ? [text({ x: 150, y: 1600, w: 1200, h: 90, text: t.sub, size: 52, color: t.ink })] : []),
]);

const bigNumber: Style = (t) => D(t.bg, [
  rect(80, 80, W - 160, H - 160, 'none', { stroke: t.accent, strokeWidth: 3 }),
  ...(t.eyebrow ? [text({ x: 150, y: 340, w: 1200, h: 80, text: t.eyebrow, size: 40, color: t.accent, weight: 700, font: SANS })] : []),
  text({ x: 100, y: 520, w: 1300, h: 420, text: t.number ?? '30', size: 400, color: t.accent, weight: 900, font: SANS }),
  text({ x: 100, y: 1080, w: 1300, h: 120, text: t.title, size: 84, color: t.ink, weight: 700, font: SANS }),
  line(560, 1300, 380, t.accent, 2),
  ...(t.sub ? [text({ x: 150, y: 1400, w: 1200, h: 80, text: t.sub, size: 50, color: t.ink })] : []),
]);

const funnyQuote: Style = (t) => D(t.bg, [
  ...(t.emojis ?? ['⭐', '✨', '🎉', '💫']).map((e, i) => emoji(i % 2 ? 1200 - i * 30 : 120 + i * 20, 260 + i * 430, 84, e, (i % 2 ? 1 : -1) * 10, 0.95)),
  text({ x: 120, y: 560, w: 1260, h: 900, text: t.title, size: t.title.length > 40 ? 108 : 132, color: t.accent, weight: 900, font: SANS }),
  ...(t.sub ? [text({ x: 150, y: 1640, w: 1200, h: 80, text: t.sub, size: 56, color: t.accent2 ?? t.ink, weight: 700, font: SCRIPT })] : []),
]);

const floral: Style = (t) => D(t.bg, [
  rect(70, 70, W - 140, H - 140, 'none', { stroke: t.soft ?? t.accent, strokeWidth: 2, radius: 18 }),
  ...([['a', 560, 360], ['b', 820, 300], ['c', 700, 520], ['d', 470, 470], ['e', 940, 470]] as const)
    .flatMap(([, cx, cy], idx) => {
      const pc = [t.accent, t.accent2 ?? t.accent, t.soft ?? t.accent][idx % 3]!;
      return Array.from({ length: 6 }, (_, k) => { const a = (k / 6) * Math.PI * 2; return ellipse(cx + Math.cos(a) * 70 - 70, cy + Math.sin(a) * 70 - 45, 140, 90, pc, { opacity: 0.6, rotation: (a * 180) / Math.PI }); })
        .concat([ellipse(cx - 34, cy - 34, 68, 68, '#fde68a', { opacity: 0.9 })]);
    }),
  ...([[520, 760], [700, 800], [880, 760]] as const).map(([x, y]) => ellipse(x, y, 40, 120, '#a7d0a0', { opacity: 0.5, rotation: (x - 700) / 12 })),
  text({ x: 100, y: 1180, w: 1300, h: 200, text: t.title, size: 128, color: t.ink, weight: 600, font: SCRIPT }),
  line(560, 1440, 380, t.soft ?? t.accent, 2),
  ...(t.sub ? [text({ x: 200, y: 1520, w: 1100, h: 120, text: t.sub, size: 50, color: t.ink })] : []),
]);

const photoFrame: Style = (t) => D(t.bg, [
  ...(t.emojis ?? ['🎉', '✨', '🎈', '🎁']).map((e, i) => emoji([120, 1240, 1200, 150][i]!, [300, 300, 720, 780][i]!, 96, e, i % 2 ? 8 : -10, 0.9)),
  rect(360, 420, 780, 900, '#ffffff', { stroke: t.soft ?? '#e7ddc9', strokeWidth: 5, radius: 16, rotation: -2 }),
  photoSlot(408, 470, 684, 690),
  ...(t.eyebrow ? [text({ x: 150, y: 300, w: 1200, h: 120, text: t.eyebrow, size: 86, color: t.ink, weight: 600, font: SCRIPT })] : []),
  text({ x: 150, y: 1500, w: 1200, h: 130, text: t.title, size: 116, color: t.accent, weight: 700, font: SERIF }),
  ...(t.sub ? [text({ x: 150, y: 1720, w: 1200, h: 70, text: t.sub, size: 44, color: t.ink })] : []),
]);

const elegantFrame: Style = (t) => D(t.bg, [
  rect(90, 90, W - 180, H - 180, 'none', { stroke: t.accent, strokeWidth: 3 }),
  rect(112, 112, W - 224, H - 224, 'none', { stroke: t.soft ?? t.accent, strokeWidth: 1 }),
  ...(t.eyebrow ? [text({ x: 200, y: 360, w: 1100, h: 70, text: t.eyebrow, size: 36, color: t.accent, weight: 500, font: SANS })] : []),
  text({ x: 120, y: 560, w: 1260, h: 260, text: t.title, size: 150, color: t.ink, font: SERIF }),
  ...(t.sub ? [text({ x: 200, y: 1120, w: 1100, h: 90, text: t.sub, size: 46, color: t.ink })] : []),
  line(560, 1360, 380, t.accent, 2),
]);

const bohoArch: Style = (t) => D(t.bg, [
  ellipse(300, 200, 900, 1400, t.soft ?? '#efe6da'),
  emoji(260, 360, 150, '🌾', -12, 0.9), emoji(1090, 360, 150, '🌾', 12, 0.9),
  emoji(300, 1300, 120, '🌿', 0, 0.8), emoji(1080, 1300, 120, '🪶', 0, 0.85),
  ...(t.eyebrow ? [text({ x: 200, y: 560, w: 1100, h: 80, text: t.eyebrow, size: 40, color: t.accent, weight: 600, font: SANS })] : []),
  text({ x: 120, y: 780, w: 1260, h: 240, text: t.title, size: 140, color: t.ink, weight: 700, font: SCRIPT }),
  ...(t.sub ? [text({ x: 200, y: 1240, w: 1100, h: 80, text: t.sub, size: 48, color: t.accent })] : []),
]);

const confetti: Style = (t) => D(t.bg, [
  ...dots(30, 5, [t.accent, t.accent2 ?? '#f59e0b', t.soft ?? '#22c55e', '#3b82f6', '#ec4899']),
  ...(t.emojis ?? ['🎉', '🎊']).map((e, i) => emoji(i % 2 ? 1180 : 160, i % 2 ? 320 : 300, 150, e, i % 2 ? 12 : -14)),
  text({ x: 100, y: 900, w: 1300, h: 260, text: t.title, size: t.title.length > 16 ? 120 : 150, color: t.accent, weight: 900, font: SANS }),
  ...(t.sub ? [text({ x: 150, y: 1500, w: 1200, h: 90, text: t.sub, size: 54, color: t.ink, weight: 700, font: SCRIPT })] : []),
]);

const hearts: Style = (t) => D(t.bg, [
  ...['❤️', '🤍', '💗', '🩷', '❤️', '🤍'].map((e, i) => emoji(i % 2 ? 1230 : 130, 260 + Math.floor(i / 2) * 470, 84, e, i % 2 ? 8 : -8, 0.55 + (i % 3) * 0.15)),
  emoji(560, 620, 360, t.emojis?.[0] ?? '💞'),
  text({ x: 100, y: 1180, w: 1300, h: 200, text: t.title, size: 140, color: t.accent, weight: 700, font: SCRIPT }),
  ...(t.sub ? [text({ x: 200, y: 1560, w: 1100, h: 90, text: t.sub, size: 50, color: t.ink })] : []),
]);

const rustic: Style = (t) => D(t.bg, [
  rect(0, 0, W, 24, t.accent), rect(0, H - 24, W, 24, t.accent),
  emoji(160, 320, 120, '🌿', -20, 0.85), emoji(1220, 320, 120, '🌿', 20, 0.85),
  emoji(160, 1620, 120, '🌾', 10, 0.85), emoji(1220, 1620, 120, '🌾', -10, 0.85),
  ...(t.eyebrow ? [text({ x: 200, y: 520, w: 1100, h: 70, text: t.eyebrow, size: 38, color: t.accent, weight: 600, font: SANS })] : []),
  text({ x: 120, y: 720, w: 1260, h: 240, text: t.title, size: 150, color: t.ink, weight: 700, font: SERIF }),
  ...(t.sub ? [text({ x: 200, y: 1200, w: 1100, h: 80, text: t.sub, size: 48, color: t.accent })] : []),
]);

const STYLES: Record<string, Style> = { balloon, bigNumber, funnyQuote, floral, photoFrame, elegantFrame, bohoArch, confetti, hearts, rustic };

// ── Data: occasion → sub-type → designs ──────────────────────────────────────
// Each row expands into one CardVariant. Kept compact; the styles do the work.
interface Row { name: string; emoji: string; style: keyof typeof STYLES; theme: Theme }
interface Pack { occasion: string; subtype: string; rows: Row[] }

const PACKS: Pack[] = [
  // ── Birthday ──
  { occasion: 'Birthday', subtype: 'Kids', rows: [
    { name: 'Balloon Party', emoji: '🎈', style: 'balloon', theme: { bg: '#eaf4ff', ink: '#0369a1', accent: '#ef476f', accent2: '#ffd166', soft: '#06d6a0', title: 'Happy Birthday!', sub: 'Cake, games & lots of fun', scriptTitle: false } },
    { name: 'Party Animals', emoji: '🦁', style: 'confetti', theme: { bg: '#fff7ed', ink: '#7c2d12', accent: '#f97316', accent2: '#22c55e', title: "Let's Party!", sub: 'You’re invited', emojis: ['🦁', '🐵'] } },
    { name: 'Dino Roar', emoji: '🦖', style: 'confetti', theme: { bg: '#ecfdf5', ink: '#065f46', accent: '#10b981', accent2: '#f59e0b', title: 'Roar! You’re 5', sub: 'A dino-mite day', emojis: ['🦖', '🌿'] } },
  ] },
  { occasion: 'Birthday', subtype: 'Milestone', rows: [
    { name: '30 & Fabulous', emoji: '🥂', style: 'bigNumber', theme: { bg: '#0b1020', ink: '#ffffff', accent: '#d4af37', number: '30', eyebrow: "YOU'RE INVITED TO CELEBRATE", title: '30 & Fabulous', sub: 'Cocktails · 8 PM' } },
    { name: 'Golden 50', emoji: '✨', style: 'bigNumber', theme: { bg: '#111827', ink: '#f8fafc', accent: '#fbbf24', number: '50', eyebrow: 'HALF A CENTURY', title: 'Fifty & Fine', sub: 'Join the celebration' } },
    { name: 'Sweet 16', emoji: '💖', style: 'bigNumber', theme: { bg: '#4a044e', ink: '#fce7f3', accent: '#f472b6', number: '16', eyebrow: 'SWEET SIXTEEN', title: 'Sweet Sixteen', sub: 'Party of the year' } },
  ] },
  { occasion: 'Birthday', subtype: 'Funny', rows: [
    { name: 'Older & Bolder', emoji: '😜', style: 'funnyQuote', theme: { bg: '#0f1836', ink: '#fff', accent: '#fde68a', accent2: '#f472b6', title: 'Aged to\nperfection.\nLike wine. 🍷', sub: 'Happy Birthday!' } },
    { name: 'Another Lap', emoji: '🎂', style: 'funnyQuote', theme: { bg: '#1e1b4b', ink: '#fff', accent: '#93c5fd', accent2: '#86efac', title: 'Another lap\naround the\nsun! ☀️', sub: 'Cheers to you' } },
  ] },
  { occasion: 'Birthday', subtype: 'Floral', rows: [
    { name: 'Bloom Day', emoji: '🌸', style: 'floral', theme: { bg: '#fbfaf7', ink: '#6b5b73', accent: '#f9a8d4', accent2: '#c4b5fd', soft: '#cbb8c9', title: 'happy birthday', sub: 'Wishing you a lovely day' } },
    { name: 'Wild Meadow', emoji: '🌼', style: 'floral', theme: { bg: '#fbfdf7', ink: '#4d7c0f', accent: '#fda4af', accent2: '#fcd34d', soft: '#bef264', title: 'happy birthday', sub: 'Bloom bright today' } },
  ] },
  { occasion: 'Birthday', subtype: 'Photo', rows: [
    { name: 'Polaroid Wish', emoji: '📸', style: 'photoFrame', theme: { bg: '#f4efe6', ink: '#7c766a', accent: '#b08d57', eyebrow: 'happy birthday', title: 'CELEBRATE', sub: 'Add your favourite photo' } },
    { name: 'Confetti Photo', emoji: '🖼️', style: 'photoFrame', theme: { bg: '#fef2f4', ink: '#9d174d', accent: '#e11d48', emojis: ['🎉', '✨', '🎈', '🎁'], eyebrow: 'happy birthday', title: 'TO YOU', sub: 'Tap the frame to add a photo' } },
  ] },

  // ── Wedding ──
  { occasion: 'Wedding', subtype: 'Elegant', rows: [
    { name: 'Classic Ivory', emoji: '💍', style: 'elegantFrame', theme: { bg: '#faf7f2', ink: '#2c2c2c', accent: '#b08d57', soft: '#d8c3a5', eyebrow: 'TOGETHER WITH THEIR FAMILIES', title: 'Olivia\n&\nJames', sub: 'request the pleasure of your company' } },
    { name: 'Midnight Gold', emoji: '🥂', style: 'elegantFrame', theme: { bg: '#111827', ink: '#f8fafc', accent: '#d4af37', soft: '#8a6d2f', eyebrow: 'SAVE THE DATE', title: 'We’re\nGetting\nMarried', sub: 'Ceremony & reception to follow' } },
  ] },
  { occasion: 'Wedding', subtype: 'Boho', rows: [
    { name: 'Pampas Arch', emoji: '🌾', style: 'bohoArch', theme: { bg: '#f6efe6', ink: '#5c4a36', accent: '#a9744f', soft: '#eaded0', eyebrow: 'TOGETHER WITH THEIR FAMILIES', title: 'Ava & Noah', sub: 'invite you to celebrate' } },
    { name: 'Desert Bloom', emoji: '🏜️', style: 'bohoArch', theme: { bg: '#efe6da', ink: '#6b4f3a', accent: '#c2703d', soft: '#e3d3c0', eyebrow: 'SAVE THE DATE', title: 'The Wedding', sub: 'of Maya & Leo' } },
  ] },
  { occasion: 'Wedding', subtype: 'Rustic', rows: [
    { name: 'Kraft & Greenery', emoji: '🌿', style: 'rustic', theme: { bg: '#efe7d6', ink: '#3f3a2f', accent: '#6b8e4e', eyebrow: 'YOU’RE INVITED', title: 'Emma & Jack', sub: 'are getting married' } },
    { name: 'Garden Party', emoji: '🍃', style: 'rustic', theme: { bg: '#f2f5ec', ink: '#33402a', accent: '#7a9a5b', eyebrow: 'JOIN US', title: 'A Celebration', sub: 'of love & laughter' } },
  ] },
  { occasion: 'Wedding', subtype: 'Save the Date', rows: [
    { name: 'Photo Save the Date', emoji: '📸', style: 'photoFrame', theme: { bg: '#f7f3ee', ink: '#5b5346', accent: '#9a7b4f', eyebrow: 'save the date', title: 'OLIVIA & JAMES', sub: 'Add your engagement photo' } },
  ] },

  // ── Anniversary ──
  { occasion: 'Anniversary', subtype: 'Romantic', rows: [
    { name: 'Forever Hearts', emoji: '💞', style: 'hearts', theme: { bg: '#4a0519', ink: '#fecdd3', accent: '#fb7185', title: 'Happy\nAnniversary', sub: 'To us', emojis: ['💞'] } },
    { name: 'Still in Love', emoji: '❤️', style: 'hearts', theme: { bg: '#500724', ink: '#fbcfe8', accent: '#f472b6', title: 'Still in Love', sub: 'Year after year', emojis: ['💖'] } },
  ] },
  { occasion: 'Anniversary', subtype: 'Milestone', rows: [
    { name: '25 Years Gold', emoji: '🥂', style: 'bigNumber', theme: { bg: '#1a1205', ink: '#fef3c7', accent: '#d4af37', number: '25', eyebrow: 'CELEBRATING', title: 'Silver Anniversary', sub: '25 wonderful years' } },
  ] },
  { occasion: 'Anniversary', subtype: 'Photo', rows: [
    { name: 'Our Story Photo', emoji: '📸', style: 'photoFrame', theme: { bg: '#faf5f1', ink: '#7c5c52', accent: '#b45f6d', eyebrow: 'happy anniversary', title: 'US', sub: 'Add a photo of you two' } },
  ] },

  // ── Baby ──
  { occasion: 'Baby', subtype: 'Shower', rows: [
    { name: 'Little Arch', emoji: '🍼', style: 'bohoArch', theme: { bg: '#eef6ff', ink: '#1e3a8a', accent: '#3b82f6', soft: '#dbeafe', eyebrow: 'PLEASE JOIN US FOR A', title: 'Baby Shower', sub: 'honouring Emma' } },
    { name: 'Sweet Petals', emoji: '🌸', style: 'floral', theme: { bg: '#fff5f8', ink: '#9d174d', accent: '#f9a8d4', accent2: '#fbcfe8', soft: '#f5d0fe', title: 'baby shower', sub: 'A little one is on the way' } },
  ] },
  { occasion: 'Baby', subtype: 'Gender Reveal', rows: [
    { name: 'Boy or Girl?', emoji: '🎈', style: 'confetti', theme: { bg: '#faf5ff', ink: '#6b21a8', accent: '#ec4899', accent2: '#3b82f6', title: 'Boy or Girl?', sub: 'Come find out!', emojis: ['🎈', '💙'] } },
  ] },
  { occasion: 'Baby', subtype: 'Announcement', rows: [
    { name: 'Hello World Photo', emoji: '📸', style: 'photoFrame', theme: { bg: '#f1f9ff', ink: '#0c4a6e', accent: '#0284c7', eyebrow: 'introducing', title: 'BABY LIAM', sub: 'Add your newborn’s photo' } },
  ] },

  // ── Love ──
  { occasion: 'Love', subtype: 'Valentine', rows: [
    { name: 'Be Mine', emoji: '❤️', style: 'hearts', theme: { bg: '#500724', ink: '#fecdd3', accent: '#fb7185', title: 'Be Mine', sub: 'Happy Valentine’s Day', emojis: ['❤️'] } },
    { name: 'Love Confetti', emoji: '💘', style: 'confetti', theme: { bg: '#831843', ink: '#fbcfe8', accent: '#f9a8d4', accent2: '#fda4af', title: 'I Love You', sub: 'today & always', emojis: ['💘', '💕'] } },
  ] },
  { occasion: 'Love', subtype: 'Miss You', rows: [
    { name: 'Miss You Hearts', emoji: '🩷', style: 'hearts', theme: { bg: '#3b0764', ink: '#f5d0fe', accent: '#e879f9', title: 'Missing You', sub: 'Come back soon', emojis: ['🩷'] } },
  ] },

  // ── Thank You ──
  { occasion: 'Thank You', subtype: 'Botanical', rows: [
    { name: 'Leafy Thanks', emoji: '🌿', style: 'floral', theme: { bg: '#f6faf4', ink: '#3f6212', accent: '#84cc16', accent2: '#bef264', soft: '#a7d0a0', title: 'thank you', sub: 'from the bottom of my heart' } },
  ] },
  { occasion: 'Thank You', subtype: 'Bold', rows: [
    { name: 'Big Thanks', emoji: '🙏', style: 'funnyQuote', theme: { bg: '#0b3d2e', ink: '#fff', accent: '#fcd34d', accent2: '#5eead4', title: 'THANK\nYOU!', sub: 'You’re the best' } },
  ] },
  { occasion: 'Thank You', subtype: 'Photo', rows: [
    { name: 'Grateful Photo', emoji: '📸', style: 'photoFrame', theme: { bg: '#f8fafc', ink: '#334155', accent: '#0ea5e9', eyebrow: 'thank you', title: 'GRATEFUL', sub: 'Add a photo & a note' } },
  ] },

  // ── Congratulations ──
  { occasion: 'Congratulations', subtype: 'Graduation', rows: [
    { name: 'Grad Confetti', emoji: '🎓', style: 'confetti', theme: { bg: '#0c1b3a', ink: '#dbeafe', accent: '#fcd34d', accent2: '#60a5fa', title: 'You Did It!', sub: 'Class of 2026', emojis: ['🎓', '🎉'] } },
    { name: 'Cap Toss Photo', emoji: '📸', style: 'photoFrame', theme: { bg: '#eef2ff', ink: '#1e3a8a', accent: '#4338ca', eyebrow: 'congratulations', title: 'GRADUATE', sub: 'Add your grad photo' } },
  ] },
  { occasion: 'Congratulations', subtype: 'New Job', rows: [
    { name: 'New Job Cheers', emoji: '💼', style: 'confetti', theme: { bg: '#082f49', ink: '#e0f2fe', accent: '#38bdf8', accent2: '#a3e635', title: 'New Job!', sub: 'You earned it', emojis: ['💼', '🎉'] } },
  ] },
  { occasion: 'Congratulations', subtype: 'New Home', rows: [
    { name: 'New Home', emoji: '🏡', style: 'confetti', theme: { bg: '#052e16', ink: '#dcfce7', accent: '#4ade80', accent2: '#fbbf24', title: 'New Home!', sub: 'Congratulations', emojis: ['🏡', '🔑'] } },
  ] },

  // ── Get Well ──
  { occasion: 'Get Well', subtype: 'Cheerful', rows: [
    { name: 'Sunny Wishes', emoji: '🌻', style: 'confetti', theme: { bg: '#14532d', ink: '#fef9c3', accent: '#fde047', accent2: '#fbbf24', title: 'Get Well Soon', sub: 'Sending sunshine', emojis: ['🌻', '☀️'] } },
  ] },
  { occasion: 'Get Well', subtype: 'Floral', rows: [
    { name: 'Feel Better Blooms', emoji: '🌸', style: 'floral', theme: { bg: '#fdf7fb', ink: '#9d174d', accent: '#f9a8d4', accent2: '#fda4af', soft: '#d8b4fe', title: 'get well soon', sub: 'Thinking of you' } },
  ] },

  // ── Festivals ──
  { occasion: 'Festivals', subtype: 'Diwali', rows: [
    { name: 'Diya Glow', emoji: '🪔', style: 'confetti', theme: { bg: '#160a2e', ink: '#fde68a', accent: '#f59e0b', accent2: '#fbbf24', title: 'Happy Diwali', sub: 'Light & prosperity', emojis: ['🪔', '🎆'] } },
  ] },
  { occasion: 'Festivals', subtype: 'Christmas', rows: [
    { name: 'Merry & Bright', emoji: '🎄', style: 'confetti', theme: { bg: '#0c2818', ink: '#f8e7c9', accent: '#e0a94e', accent2: '#ef4444', title: 'Merry Christmas', sub: 'Warm wishes', emojis: ['🎄', '⛄'] } },
  ] },
  { occasion: 'Festivals', subtype: 'Eid', rows: [
    { name: 'Eid Crescent', emoji: '🌙', style: 'confetti', theme: { bg: '#062821', ink: '#f0e6c8', accent: '#d4af37', accent2: '#5eead4', title: 'Eid Mubarak', sub: 'Blessings to you', emojis: ['🌙', '🕌'] } },
  ] },

  // ── Seasonal ──
  { occasion: 'Seasonal', subtype: 'New Year', rows: [
    { name: 'Fireworks Night', emoji: '🎆', style: 'confetti', theme: { bg: '#050a1f', ink: '#dbeafe', accent: '#93c5fd', accent2: '#fbbf24', title: 'Happy New Year', sub: 'Cheers to 2027', emojis: ['🎆', '🥂'] } },
  ] },
  { occasion: 'Seasonal', subtype: "Mother's Day", rows: [
    { name: 'For Mom Blooms', emoji: '💐', style: 'floral', theme: { bg: '#fff5f8', ink: '#9d174d', accent: '#f472b6', accent2: '#fbcfe8', soft: '#f9a8d4', title: 'Happy\nMother’s Day', sub: 'With love' } },
  ] },
  { occasion: 'Seasonal', subtype: "Father's Day", rows: [
    { name: 'Best Dad', emoji: '👔', style: 'bigNumber', theme: { bg: '#0f172a', ink: '#e2e8f0', accent: '#38bdf8', number: '#1', eyebrow: 'HAPPY FATHER’S DAY', title: 'Best Dad Ever', sub: 'Thanks for everything' } },
  ] },
];

/** The generated variants, ready to merge into the catalog. */
export const CARD_VARIANTS: CardVariant[] = PACKS.flatMap((p) =>
  p.rows.map((r, i) => ({
    id: `v-${p.occasion}-${p.subtype}-${i}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: r.name, emoji: r.emoji, occasion: p.occasion, subtype: p.subtype,
    make: () => STYLES[r.style]!(r.theme),
  })),
);

/** occasion → ordered list of its sub-types (only those with designs). */
export function subtypesFromVariants(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const v of CARD_VARIANTS) { (map[v.occasion] ??= []); if (!map[v.occasion]!.includes(v.subtype)) map[v.occasion]!.push(v.subtype); }
  return map;
}
