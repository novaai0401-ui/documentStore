/**
 * Verse posters — poems & shayari, plus faith blessings for every religion.
 *
 * Two share-every-day packs built from one data-driven generator (`makeVerse`),
 * rendering through the same SVG path as everything else so a new poster is a
 * few lines of data:
 *
 *   • POEM_TEMPLATES  (category "Poems")     — short poems, shayari, couplets and
 *     dohas people post to WhatsApp/Instagram. Multi-line body, elegant serif.
 *   • BLESSING_TEMPLATES (category "Blessings") — respectful wishing/blessing
 *     cards organised across faiths: Hindu, Muslim, Christian, Sikh, Buddhist,
 *     plus an interfaith card. Native-script salutations with an English line.
 *
 * Every element is a normal, draggable, editable layer (tap any word to retype
 * it in any language) and each ships "alive" with an entrance `anim` and a
 * gently moving accent. Dependency-light: model + enums + the StudioTemplate
 * *type* only (type-only import — no runtime cycle with templates.ts).
 */
import { newElId, type Design, type TextEl, type ElementMotion } from './model.js';
import type { BackgroundEffect } from './effects.js';
import type { AnimPreset } from './animate.js';
import type { StudioTemplate } from './templates.js';

const SCRIPT = "'Segoe Script', 'Comic Sans MS', cursive";
const SERIF = 'Georgia, serif';
const SANS = 'Inter, system-ui, sans-serif';

const text = (o: Partial<TextEl> & { x: number; y: number; w: number; h: number; text: string }): TextEl => ({
  id: newElId(), type: 'text', size: 44, color: '#0f172a', font: SANS, weight: 600, align: 'center', rotation: 0, ...o,
});

const sticker = (emoji: string, x: number, y: number, size: number, motion?: ElementMotion, rotation = 0): TextEl =>
  text({ x, y, w: size * 1.3, h: size * 1.3, text: emoji, size, rotation, ...(motion ? { motion } : {}) });

interface VerseSpec {
  id: string;
  name: string;
  icon: string;
  w?: number;
  h?: number;
  background: string;
  effect?: BackgroundEffect;
  anim?: AnimPreset;
  border?: string;
  hero?: string;
  heroMotion?: ElementMotion;
  scatter?: string[];
  /** Small heading above the verse (occasion / salutation). */
  eyebrow?: { text: string; color: string };
  /** The main verse/blessing body — multiple lines separated by "\n". */
  body: { text: string; color: string; font?: string; size?: number };
  /** A closing line — poet name, "— Anonymous", or an Amen/blessing. */
  signoff?: { text: string; color: string };
}

function scatterCorners(emojis: string[], w: number, h: number): TextEl[] {
  const motions: ElementMotion[] = ['float', 'wobble', 'pulse', 'float'];
  const spots: [number, number, number][] = [
    [70, 90, -10], [w - 190, 90, 10], [70, h - 210, -6], [w - 190, h - 210, 6],
  ];
  return emojis.slice(0, 4).map((e, i) => sticker(e, spots[i][0], spots[i][1], 92, motions[i % motions.length], spots[i][2]));
}

interface Line { text: string; color: string; size: number; font?: string; weight?: number; gap?: number }

function makeVerse(spec: VerseSpec): Design {
  const w = spec.w ?? 1080;
  const h = spec.h ?? 1350;
  const cx = 90;
  const cw = w - 180;
  const els: Design['elements'] = [];

  if (spec.border) {
    els.push({ id: newElId(), type: 'rect', x: 50, y: 50, w: w - 100, h: h - 100, fill: 'none', stroke: spec.border, strokeWidth: 3, radius: 14 });
    els.push({ id: newElId(), type: 'rect', x: 66, y: 66, w: w - 132, h: h - 132, fill: 'none', stroke: spec.border, strokeWidth: 1.5, radius: 12 });
  }
  if (spec.scatter?.length) els.push(...scatterCorners(spec.scatter, w, h));

  if (spec.hero) {
    const heroSize = 138;
    els.push(sticker(spec.hero, (w - heroSize * 1.3) / 2, h * 0.12, heroSize, spec.heroMotion));
  }

  const bodyRows = spec.body.text.split('\n').length;
  const lines: Line[] = [];
  if (spec.eyebrow) lines.push({ text: spec.eyebrow.text, color: spec.eyebrow.color, size: 36, weight: 800, gap: 26 });
  lines.push({ text: spec.body.text, color: spec.body.color, size: spec.body.size ?? (bodyRows > 5 ? 40 : 48), weight: 600, font: spec.body.font ?? SERIF, gap: 26 });
  if (spec.signoff) lines.push({ text: spec.signoff.text, color: spec.signoff.color, size: 32, weight: 600, font: SCRIPT, gap: 0 });

  // Centre the whole stack vertically-ish: start higher when the poem is long.
  let y = spec.hero ? h * 0.34 : (bodyRows > 6 ? h * 0.22 : h * 0.3);
  lines.forEach((ln) => {
    const rows = ln.text.split('\n').length;
    const lineH = ln.size * 1.32;
    const boxH = Math.max(lineH * rows, ln.size + 8);
    els.push(text({ x: cx, y, w: cw, h: boxH, text: ln.text, size: ln.size, color: ln.color, weight: ln.weight ?? 600, font: ln.font ?? SANS }));
    y += boxH + (ln.gap ?? 20);
  });

  return { w, h, background: spec.background, ...(spec.effect ? { effect: spec.effect } : {}), elements: els };
}

// ── Poems & shayari ──────────────────────────────────────────────────────────
const POEMS: VerseSpec[] = [
  {
    id: 'pm-shayari-dosti', name: 'Dosti Shayari', icon: '🤝', anim: 'fade', effect: 'sparkles',
    background: '#0b1226', border: '#38bdf8', hero: '🫶', heroMotion: 'beat', scatter: ['⭐', '✨', '🌙', '💫'],
    eyebrow: { text: 'दोस्ती', color: '#7dd3fc' },
    body: { text: 'हर खुशी है लोगों के दामन में,\nपर एक हँसी तेरे नाम की है।\nदोस्त तू है तो जहाँ अपना है,\nवरना ये दुनिया बेगानी है।', color: '#e0f2fe', font: SERIF, size: 38 },
    signoff: { text: '— यारी ज़िंदाबाद', color: '#38bdf8' },
  },
  {
    id: 'pm-love-shayari', name: 'Love Shayari', icon: '❤️', anim: 'rise', effect: 'hearts',
    background: '#3b0a1e', border: '#fb7185', hero: '🌹', heroMotion: 'float', scatter: ['💕', '🌹', '💌', '✨'],
    eyebrow: { text: 'मोहब्बत', color: '#fda4af' },
    body: { text: 'तेरी आँखों में जो बसती है,\nवो मेरी दुनिया है।\nतू पास हो या दूर कहीं,\nहर धड़कन तेरी सुनाई देती है।', color: '#fecdd3', font: SERIF, size: 40 },
    signoff: { text: '— सिर्फ़ तेरा', color: '#fb7185' },
  },
  {
    id: 'pm-motivation-doha', name: 'Motivational Doha', icon: '🌅', anim: 'rise', effect: 'sparkles',
    background: '#fffaf0', border: '#d97706', hero: '🌄', heroMotion: 'pulse', scatter: ['🌾', '🪷', '☀️', '✨'],
    eyebrow: { text: 'प्रेरणा', color: '#b45309' },
    body: { text: 'करत करत अभ्यास के,\nजड़मति होत सुजान।\nरसरी आवत जात ते,\nसिल पर परत निसान।', color: '#7c2d12', font: SERIF, size: 44 },
    signoff: { text: '— वृंद', color: '#d97706' },
  },
  {
    id: 'pm-english-poem', name: 'English Poem', icon: '📜', anim: 'fade', effect: 'leaves',
    background: '#0f2027', border: '#5eead4', hero: '🍃', heroMotion: 'float', scatter: ['🌿', '✨', '🕊️', '🌙'],
    eyebrow: { text: 'A LITTLE POEM', color: '#5eead4' },
    body: { text: 'Be like the river —\nsoft enough to bend,\nstrong enough to carve\na canyon from the stone.\nKeep flowing, my friend.', color: '#ccfbf1', font: SERIF, size: 40 },
    signoff: { text: '— anonymous', color: '#2dd4bf' },
  },
  {
    id: 'pm-maa-poem', name: 'Maa / Mother Poem', icon: '🌸', anim: 'rise', effect: 'flowers',
    background: '#fdf2f8', border: '#db2777', hero: '💐', heroMotion: 'float', scatter: ['🌸', '💗', '🌷', '✨'],
    eyebrow: { text: 'माँ', color: '#be185d' },
    body: { text: 'लबों पे उसके कभी बद्दुआ नहीं होती,\nबस एक माँ है जो कभी ख़फ़ा नहीं होती।', color: '#9d174d', font: SERIF, size: 42 },
    signoff: { text: '— मुनव्वर राना', color: '#db2777' },
  },
  {
    id: 'pm-birthday-poem', name: 'Birthday Poem', icon: '🎂', anim: 'pop', effect: 'balloons',
    background: '#eef7ff', border: '#2563eb', hero: '🎂', heroMotion: 'bounce', scatter: ['🎈', '🎉', '⭐', '🎁'],
    eyebrow: { text: 'HAPPY BIRTHDAY', color: '#1d4ed8' },
    body: { text: 'Another year, another page,\na brighter, bolder, kinder stage.\nMay all your dreams take gentle flight\nand every day feel just as bright.', color: '#1e3a8a', font: SERIF, size: 40 },
    signoff: { text: 'with love, always', color: '#2563eb' },
  },
  {
    id: 'pm-good-morning-poem', name: 'Good Morning Poem', icon: '🌞', anim: 'rise', effect: 'flowers',
    background: '#fff7e0', border: '#d97706', hero: '🌞', heroMotion: 'pulse', scatter: ['🌻', '🐦', '🍵', '🌼'],
    eyebrow: { text: 'GOOD MORNING', color: '#b45309' },
    body: { text: 'A brand-new sun, a brand-new sky,\na chance to spread your wings and fly.\nBreathe in the light, let worries go —\ntoday is yours to bloom and grow.', color: '#92400e', font: SERIF, size: 40 },
    signoff: { text: 'have a beautiful day', color: '#d97706' },
  },
  {
    id: 'pm-attitude-shayari', name: 'Attitude Shayari', icon: '😎', anim: 'zoom', effect: 'sparkles',
    background: '#0a0a0a', border: '#facc15', hero: '🦅', heroMotion: 'float', scatter: ['🔥', '💯', '⚡', '🖤'],
    eyebrow: { text: 'ATTITUDE', color: '#facc15' },
    body: { text: 'मंज़िलें उन्हीं को मिलती हैं,\nजिनके सपनों में जान होती है।\nपंख से कुछ नहीं होता,\nहौसलों से उड़ान होती है।', color: '#fafafa', font: SERIF, size: 40 },
    signoff: { text: '— खुद पे यक़ीन', color: '#facc15' },
  },
];

// ── Faith blessings (respectful, cross-religion) ─────────────────────────────
const BLESSINGS: VerseSpec[] = [
  {
    id: 'bl-hindu-om', name: 'Hindu — Om Shanti', icon: '🕉️', anim: 'fade', effect: 'diyas',
    background: '#2a1405', border: '#f59e0b', hero: '🕉️', heroMotion: 'pulse', scatter: ['🪔', '🌺', '🪷', '✨'],
    eyebrow: { text: 'ॐ शान्ति', color: '#fbbf24' },
    body: { text: 'सर्वे भवन्तु सुखिनः\nसर्वे सन्तु निरामयाः।\nMay all be happy,\nmay all be free from illness.', color: '#fde68a', font: SERIF, size: 42 },
    signoff: { text: 'ॐ शान्ति शान्ति शान्तिः', color: '#f59e0b' },
  },
  {
    id: 'bl-hindu-morning', name: 'Hindu — Shubh Prabhat', icon: '🪔', anim: 'rise', effect: 'flowers',
    background: '#fff7e0', border: '#d97706', hero: '🙏', heroMotion: 'pulse', scatter: ['🪔', '🌸', '🌞', '🪷'],
    eyebrow: { text: 'शुभ प्रभात', color: '#b45309' },
    body: { text: 'कराग्रे वसते लक्ष्मीः\nकरमध्ये सरस्वती।\nMay the divine bless your day\nwith light, wisdom and grace.', color: '#92610e', font: SERIF, size: 40 },
    signoff: { text: 'हर हर महादेव', color: '#d97706' },
  },
  {
    id: 'bl-muslim-jumma', name: 'Muslim — Jumma Mubarak', icon: '🕌', anim: 'fade', effect: 'lanterns',
    background: '#062821', border: '#d4af37', hero: '🕌', heroMotion: 'float', scatter: ['🌙', '⭐', '🏮', '✨'],
    eyebrow: { text: 'جمعہ مبارک', color: '#d4af37' },
    body: { text: 'Jumma Mubarak\nMay Allah accept your prayers,\nforgive your sins and fill your\nheart with peace and barakah.', color: '#f0e6c8', font: SERIF, size: 40 },
    signoff: { text: 'Ameen 🤲', color: '#d4af37' },
  },
  {
    id: 'bl-muslim-bismillah', name: 'Muslim — Bismillah', icon: '🌙', anim: 'fade', effect: 'sparkles',
    background: '#0b1d3a', border: '#d4af37', hero: '🤲', heroMotion: 'pulse', scatter: ['🌙', '⭐', '🕌', '✨'],
    eyebrow: { text: 'بِسْمِ اللَّٰه', color: '#d4af37' },
    body: { text: 'In the name of Allah,\nthe Most Gracious, the Most Merciful.\nMay every step you take today\nbe guided by His mercy.', color: '#dbeafe', font: SERIF, size: 40 },
    signoff: { text: 'Alhamdulillah', color: '#93c5fd' },
  },
  {
    id: 'bl-christian-sunday', name: 'Christian — Sunday Blessings', icon: '✝️', anim: 'rise', effect: 'sparkles',
    background: '#0b1c3a', border: '#93c5fd', hero: '✝️', heroMotion: 'float', scatter: ['🕊️', '🙏', '⭐', '✨'],
    eyebrow: { text: 'BLESSED SUNDAY', color: '#93c5fd' },
    body: { text: '“The Lord bless you and keep you;\nthe Lord make His face shine\nupon you and be gracious to you.”\n— Numbers 6:24-25', color: '#dbeafe', font: SERIF, size: 38 },
    signoff: { text: 'Amen 🙏', color: '#60a5fa' },
  },
  {
    id: 'bl-christian-godbless', name: 'Christian — God Bless You', icon: '🕊️', anim: 'fade', effect: 'flowers',
    background: '#f8fafc', border: '#94a3b8', hero: '🕊️', heroMotion: 'float', scatter: ['🤍', '🌿', '✝️', '✨'],
    eyebrow: { text: 'GOD BLESS YOU', color: '#475569' },
    body: { text: 'May God’s love surround you,\nHis peace fill your heart,\nand His grace light every path\nyou walk today and always.', color: '#334155', font: SERIF, size: 40 },
    signoff: { text: 'with faith & love', color: '#64748b' },
  },
  {
    id: 'bl-sikh-waheguru', name: 'Sikh — Waheguru', icon: '🪯', anim: 'fade', effect: 'sparkles',
    background: '#0b1d3a', border: '#f59e0b', hero: '🪯', heroMotion: 'pulse', scatter: ['🌼', '📿', '🪔', '✨'],
    eyebrow: { text: 'ੴ ਸਤਿ ਨਾਮੁ', color: '#fbbf24' },
    body: { text: 'Waheguru Ji Ka Khalsa,\nWaheguru Ji Ki Fateh.\nMay Waheguru bless you with\nchardi kala and endless grace.', color: '#fde68a', font: SERIF, size: 40 },
    signoff: { text: 'ਵਾਹਿਗੁਰੂ 🙏', color: '#f59e0b' },
  },
  {
    id: 'bl-buddhist-metta', name: 'Buddhist — Metta', icon: '☸️', anim: 'fade', effect: 'flowers',
    background: '#2a1a05', border: '#f59e0b', hero: '🪷', heroMotion: 'float', scatter: ['☸️', '🪔', '🌸', '✨'],
    eyebrow: { text: 'BUDDHAM SHARANAM', color: '#fbbf24' },
    body: { text: 'May you be happy,\nmay you be healthy,\nmay you be safe,\nmay you live with ease.', color: '#fde68a', font: SERIF, size: 44 },
    signoff: { text: 'Namo Buddhaya 🙏', color: '#f59e0b' },
  },
  {
    id: 'bl-interfaith', name: 'Interfaith Blessing', icon: '🙏', anim: 'rise', effect: 'sparkles',
    background: '#111827', border: '#a78bfa', hero: '🙏', heroMotion: 'pulse', scatter: ['🕉️', '☪️', '✝️', '☸️'],
    eyebrow: { text: 'BLESSINGS FOR ALL', color: '#c4b5fd' },
    body: { text: 'Whatever name you call the light,\nmay it guide you, keep you, hold you.\nOne world, many prayers —\nall of them wishing you peace.', color: '#ede9fe', font: SERIF, size: 40 },
    signoff: { text: '— with love & respect', color: '#a78bfa' },
  },
];

export const POEM_TEMPLATES: StudioTemplate[] = POEMS.map((spec) => ({
  id: spec.id, name: spec.name, icon: spec.icon, category: 'Poems', anim: spec.anim, make: () => makeVerse(spec),
}));

export const BLESSING_TEMPLATES: StudioTemplate[] = BLESSINGS.map((spec) => ({
  id: spec.id, name: spec.name, icon: spec.icon, category: 'Blessings', anim: spec.anim, make: () => makeVerse(spec),
}));
