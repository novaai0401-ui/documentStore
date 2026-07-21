/**
 * Starter Design Studio templates — ready-made compositions a user can open and
 * tweak (the Adobe-Express-style "start from a template" flow). Each is a plain
 * Design object built from the model's element types, so they render through the
 * same SVG path as everything else and resize cleanly to other formats.
 */
import { newElId, photoSlot, type Design } from './model.js';
import type { AnimPreset } from './animate.js';
import { GREETING_TEMPLATES } from './greetingCards.js';
import { QUOTE_TEMPLATES } from './quotes.js';
import { POEM_TEMPLATES, BLESSING_TEMPLATES } from './versePosters.js';
import { REEL_TEMPLATES } from './reels.js';

/** A starter template. `anim`, when set, is the entrance animation the Animate
 *  export defaults to — these are the "animated" templates. */
export type TemplateCategory = 'Reels' | 'Greetings' | 'Quotes' | 'Poems' | 'Blessings' | 'Celebrations' | 'Social' | 'Promos' | 'Business' | 'Events';
export const TEMPLATE_CATEGORIES: TemplateCategory[] = ['Reels', 'Greetings', 'Quotes', 'Poems', 'Blessings', 'Celebrations', 'Social', 'Promos', 'Business', 'Events'];
export interface StudioTemplate { id: string; name: string; icon: string; category: TemplateCategory; make: () => Design; anim?: AnimPreset }

const text = (o: Partial<import('./model.js').TextEl> & { x: number; y: number; w: number; h: number; text: string }): import('./model.js').TextEl => ({
  id: newElId(), type: 'text', size: 48, color: '#0f172a', font: 'Inter, system-ui, sans-serif', weight: 700, align: 'left', rotation: 0, ...o,
});

/** Emoji sticker as a draggable element — the playful clip-art layer that makes
 *  kids' templates feel hand-decorated. Rotation keeps the scatter lively. */
const sticker = (emoji: string, x: number, y: number, size = 96, rotation = 0): import('./model.js').TextEl =>
  text({ x, y, w: size * 1.25, h: size * 1.25, text: emoji, size, align: 'center', rotation });

/** An animated sticker — the same emoji with a looping motion (bounce/spin/…),
 *  so these templates are alive the moment you open them. */
const aSticker = (emoji: string, x: number, y: number, size: number, motion: import('./model.js').ElementMotion, rotation = 0): import('./model.js').TextEl =>
  ({ ...sticker(emoji, x, y, size, rotation), motion });

export const STUDIO_TEMPLATES: StudioTemplate[] = [
  // Greeting cards for every occasion & age — the data-driven pack in
  // greetingCards.ts (animated balloons/flowers/hearts, all ages). Listed first
  // so the "Greetings" tab leads the gallery.
  // Vertical 9:16 animated reels (Instagram/TikTok/Shorts/Status) — the pack in
  // reels.ts. Listed first so "Reels" leads the gallery, matching how people
  // now start: with a short video post.
  ...REEL_TEMPLATES,
  ...GREETING_TEMPLATES,
  // Share-every-day quote & motivation posters (self-love, discipline, faith,
  // monthly covers) — the data-driven pack in quotes.ts.
  ...QUOTE_TEMPLATES,
  // Poems & shayari, plus respectful faith blessings for every religion —
  // the data-driven packs in versePosters.ts.
  ...POEM_TEMPLATES,
  ...BLESSING_TEMPLATES,
  // ── Trending photo + message cards (drop in your own photo, edit the words) ──
  {
    id: 'bday-photo-wish', category: 'Celebrations', name: 'Birthday · Photo & Wish', icon: '🎂', anim: 'rise',
    make: () => ({
      w: 1080, h: 1920, background: '#fbe9ec',
      elements: [
        { id: newElId(), type: 'ellipse', x: -160, y: -160, w: 460, h: 460, fill: '#f7cdd6' },
        { id: newElId(), type: 'ellipse', x: 820, y: 1560, w: 480, h: 480, fill: '#f7cdd6' },
        sticker('🌸', 40, 60, 120, -10), sticker('🌷', 900, 90, 110, 12), sticker('🌹', 60, 1500, 120, 8), sticker('💐', 880, 1560, 120, -8),
        sticker('🎈', 720, 40, 120, 8), sticker('🎈', 840, 20, 100, -6),
        text({ x: 90, y: 120, w: 900, h: 90, text: 'HAPPY', size: 64, color: '#9d174d', align: 'center', weight: 800 }),
        text({ x: 90, y: 190, w: 900, h: 170, text: 'Birthday', size: 150, color: '#be185d', align: 'center', weight: 900, font: 'Georgia, serif' }),
        text({ x: 90, y: 385, w: 900, h: 60, text: 'TO MY DEAR SISTER', size: 40, color: '#7c2d3a', align: 'center', weight: 600 }),
        { id: newElId(), type: 'rect', x: 220, y: 470, w: 640, h: 820, fill: '#ffffff', stroke: '#e7a3b5', strokeWidth: 6, radius: 24 },
        photoSlot(244, 494, 592, 772),
        text({ x: 120, y: 1350, w: 840, h: 260, text: "You're not just my sister,\nyou're my best friend and my\nforever support. Wishing you\nendless happiness and health. ♥", size: 40, color: '#5b1f2b', align: 'center', weight: 600, font: 'Georgia, serif' }),
        text({ x: 120, y: 1660, w: 840, h: 120, text: 'Stay blessed, stay happy always! 🎉', size: 44, color: '#be185d', align: 'center', weight: 700, font: "'Segoe Script', 'Comic Sans MS', cursive" }),
      ],
    }),
  },
  {
    id: 'bday-photo-bold', category: 'Celebrations', name: 'Birthday · Bold Frame', icon: '🎉', anim: 'pop',
    make: () => ({
      w: 1080, h: 1920, background: '#3a0d12',
      elements: [
        { id: newElId(), type: 'ellipse', x: 140, y: 360, w: 800, h: 800, fill: 'none', stroke: '#e0a94e', strokeWidth: 10 },
        photoSlot(220, 440, 640, 640),
        sticker('🎈', 60, 120, 130, -10), sticker('🎈', 150, 60, 110, 8), sticker('🎈', 40, 260, 100, 14),
        sticker('🎂', 820, 1180, 150, -6), sticker('🎉', 60, 1180, 120, 10), sticker('🎊', 940, 300, 100, 10),
        text({ x: 90, y: 1170, w: 900, h: 160, text: 'Happy Birthday', size: 118, color: '#ffd27a', align: 'center', weight: 900, font: 'Georgia, serif' }),
        text({ x: 90, y: 1345, w: 900, h: 100, text: 'Bharti', size: 84, color: '#ffffff', align: 'center', weight: 800, font: "'Segoe Script', 'Comic Sans MS', cursive" }),
        { id: newElId(), type: 'line', x: 340, y: 1475, w: 400, h: 0, stroke: '#e0a94e', strokeWidth: 3 },
        text({ x: 120, y: 1520, w: 840, h: 220, text: 'Wishing you a day full of love,\nlaughter and cake. May all your\ndreams come true this year! 🎂', size: 40, color: '#f6dede', align: 'center', weight: 500 }),
      ],
    }),
  },
  {
    id: 'collage-message', category: 'Celebrations', name: 'Photo Collage · Message', icon: '🖼️', anim: 'fade',
    make: () => ({
      w: 1080, h: 1350, background: '#0f172a',
      elements: [
        text({ x: 60, y: 40, w: 960, h: 90, text: 'Our Favourite Memories', size: 60, color: '#ffffff', align: 'center', weight: 800, font: 'Georgia, serif' }),
        photoSlot(40, 170, 480, 420), photoSlot(560, 170, 480, 420),
        photoSlot(40, 610, 480, 420), photoSlot(560, 610, 480, 420),
        { id: newElId(), type: 'rect', x: 60, y: 1070, w: 960, h: 220, fill: '#1e293b', radius: 20 },
        text({ x: 100, y: 1115, w: 880, h: 150, text: "So many moments, so much love —\nhere's to many more together. ❤️", size: 44, color: '#e2e8f0', align: 'center', weight: 600, font: 'Georgia, serif' }),
        sticker('✨', 24, 84, 60, -10), sticker('✨', 996, 84, 60, 10),
      ],
    }),
  },
  {
    id: 'bday-photo-modern', category: 'Celebrations', name: 'Birthday · Modern Photo', icon: '🥳', anim: 'rise',
    make: () => ({
      w: 1080, h: 1350, background: '#faf5ff',
      elements: [
        { id: newElId(), type: 'rect', x: 8, y: 8, w: 1064, h: 1334, fill: 'none', stroke: '#c084fc', strokeWidth: 10 },
        photoSlot(90, 90, 900, 780),
        text({ x: 90, y: 905, w: 900, h: 140, text: 'Happy Birthday!', size: 108, color: '#7c3aed', align: 'center', weight: 900, font: 'Georgia, serif' }),
        text({ x: 90, y: 1060, w: 900, h: 200, text: 'Wishing you health, happiness and\nall the success you deserve. Have\nthe most wonderful year! 🎉', size: 42, color: '#4c1d95', align: 'center', weight: 500 }),
        sticker('🎂', 60, 60, 90, -8), sticker('🎈', 940, 60, 90, 8), sticker('🥳', 60, 1220, 90, 8), sticker('🎁', 940, 1220, 90, -8),
      ],
    }),
  },
  {
    id: 'kids-birthday', category: 'Celebrations', name: 'Birthday Invite', icon: '🎂', anim: 'pop',
    make: () => ({
      w: 1080, h: 1440, background: '#fdf7e4',
      elements: [
        // Photo frame — tap the placeholder, then use 🖼 Image to drop the child's photo on top.
        { id: newElId(), type: 'rect', x: 84, y: 200, w: 520, h: 700, fill: '#ffffff', stroke: '#d4a94e', strokeWidth: 5, radius: 18 },
        photoSlot(104, 220, 480, 660),
        // Sticker scatter (every one is its own draggable element)
        sticker('🎈', 640, 60, 130, -8), sticker('🎈', 760, 30, 110, 6), sticker('🎈', 880, 70, 120, 10),
        sticker('🧸', 40, 40, 100, -10), sticker('🦁', 320, 30, 96, 6), sticker('🐰', 500, 50, 84, 12),
        sticker('🐘', 920, 190, 96, -6), sticker('🦊', 700, 170, 84, 8),
        sticker('🌸', 560, 780, 110, -12), sticker('🌼', 640, 860, 90, 10), sticker('⭐', 600, 130, 72, 20),
        sticker('🚂', 700, 1210, 120, 0), sticker('🐯', 830, 1180, 96, -8), sticker('🧸', 940, 1210, 96, 8),
        sticker('🎂', 560, 1160, 110, -6), sticker('🦁', 460, 1180, 90, 8),
        sticker('⭐', 60, 950, 64, -15), sticker('🌟', 980, 620, 64, 15), sticker('🎉', 40, 1300, 90, -10), sticker('🎊', 950, 1320, 90, 10),
        // Date / time / venue block
        text({ x: 620, y: 300, w: 400, h: 220, text: 'Thursday,\n9th July\n2026', size: 64, color: '#5b2c0e', align: 'center', weight: 800, font: 'Georgia, serif' }),
        text({ x: 620, y: 560, w: 400, h: 60, text: '7:00 PM onwards', size: 40, color: '#7c3f12', align: 'center', weight: 700, font: 'Georgia, serif' }),
        text({ x: 620, y: 640, w: 400, h: 160, text: 'Venue:\n2408, Tower 2,\nKharadi, Pune', size: 34, color: '#5b2c0e', align: 'center', weight: 600, font: 'Georgia, serif' }),
        // Invitation lines
        text({ x: 90, y: 950, w: 520, h: 90, text: 'You are cordially\ninvited to celebrate', size: 38, color: '#6b3410', align: 'center', weight: 700, font: 'Georgia, serif' }),
        text({ x: 90, y: 1060, w: 300, h: 90, text: 'IRA’s', size: 84, color: '#e0559a', align: 'center', weight: 900 }),
        text({ x: 320, y: 1080, w: 180, h: 80, text: '3rd', size: 72, color: '#8b5cf6', align: 'center', weight: 900 }),
        text({ x: 90, y: 1160, w: 460, h: 80, text: 'Birthday!', size: 64, color: '#5b2c0e', align: 'center', weight: 900, font: 'Georgia, serif' }),
        text({ x: 140, y: 1330, w: 800, h: 60, text: 'Join us for fun, laughter, and cake!', size: 40, color: '#7c3f12', align: 'center', weight: 700, font: "'Segoe Script', 'Comic Sans MS', cursive" }),
      ],
    }),
  },
  {
    id: 'wedding-invite', category: 'Celebrations', name: 'Wedding Invite', icon: '💍', anim: 'fade',
    make: () => ({
      w: 1080, h: 1440, background: '#fffdf5',
      elements: [
        { id: newElId(), type: 'rect', x: 60, y: 60, w: 960, h: 1320, fill: 'none', stroke: '#c9a34e', strokeWidth: 3, radius: 8 },
        { id: newElId(), type: 'rect', x: 84, y: 84, w: 912, h: 1272, fill: 'none', stroke: '#e6d3a3', strokeWidth: 1.5, radius: 6 },
        sticker('💐', 90, 100, 110, -10), sticker('💐', 880, 100, 110, 10),
        sticker('🕊️', 300, 130, 72, -6), sticker('🕊️', 710, 130, 72, 6), sticker('💍', 505, 110, 88),
        text({ x: 140, y: 300, w: 800, h: 60, text: 'TOGETHER WITH THEIR FAMILIES', size: 28, color: '#a08339', align: 'center', weight: 600 }),
        text({ x: 140, y: 400, w: 800, h: 110, text: 'Aisha', size: 96, color: '#7c5c1e', align: 'center', weight: 700, font: 'Georgia, serif' }),
        text({ x: 140, y: 530, w: 800, h: 60, text: '&', size: 52, color: '#c9a34e', align: 'center', weight: 600, font: 'Georgia, serif' }),
        text({ x: 140, y: 610, w: 800, h: 110, text: 'Rohan', size: 96, color: '#7c5c1e', align: 'center', weight: 700, font: 'Georgia, serif' }),
        text({ x: 140, y: 780, w: 800, h: 60, text: 'request the pleasure of your company', size: 32, color: '#8a6d2f', align: 'center', weight: 500, font: 'Georgia, serif' }),
        { id: newElId(), type: 'line', x: 380, y: 880, w: 320, h: 0, stroke: '#c9a34e', strokeWidth: 2 },
        text({ x: 140, y: 920, w: 800, h: 60, text: 'Saturday, 14th November 2026', size: 40, color: '#5c4614', align: 'center', weight: 700, font: 'Georgia, serif' }),
        text({ x: 140, y: 1000, w: 800, h: 50, text: '6:00 PM onwards', size: 32, color: '#8a6d2f', align: 'center', weight: 600, font: 'Georgia, serif' }),
        text({ x: 140, y: 1080, w: 800, h: 100, text: 'The Rose Garden, Lakeside Road,\nYour City', size: 32, color: '#8a6d2f', align: 'center', weight: 500, font: 'Georgia, serif' }),
        sticker('🌿', 120, 1220, 90, -14), sticker('🌹', 220, 1270, 80, 8), sticker('🌿', 870, 1220, 90, 14), sticker('🌹', 790, 1270, 80, -8),
        text({ x: 240, y: 1290, w: 600, h: 50, text: 'Dinner & celebrations to follow', size: 30, color: '#a08339', align: 'center', weight: 500, font: "'Segoe Script', 'Comic Sans MS', cursive" }),
      ],
    }),
  },
  {
    id: 'anniversary', category: 'Celebrations', name: 'Anniversary', icon: '💞', anim: 'rise',
    make: () => ({
      w: 1080, h: 1080, background: '#3b0a1e',
      elements: [
        { id: newElId(), type: 'ellipse', x: -180, y: -180, w: 500, h: 500, fill: '#5c1230' },
        { id: newElId(), type: 'ellipse', x: 780, y: 760, w: 500, h: 500, fill: '#5c1230' },
        sticker('💞', 470, 90, 130), sticker('🌹', 120, 160, 90, -12), sticker('🌹', 860, 160, 90, 12),
        sticker('✨', 250, 80, 60, 10), sticker('✨', 760, 90, 60, -10),
        text({ x: 140, y: 300, w: 800, h: 70, text: 'CELEBRATING', size: 40, color: '#f5c6d8', align: 'center', weight: 600 }),
        text({ x: 140, y: 390, w: 800, h: 170, text: '25 Years', size: 140, color: '#ffd166', align: 'center', weight: 900, font: 'Georgia, serif' }),
        text({ x: 140, y: 590, w: 800, h: 70, text: 'of Love & Laughter', size: 48, color: '#fde8ef', align: 'center', weight: 600, font: "'Segoe Script', 'Comic Sans MS', cursive" }),
        { id: newElId(), type: 'line', x: 390, y: 720, w: 300, h: 0, stroke: '#ffd166', strokeWidth: 2 },
        text({ x: 140, y: 760, w: 800, h: 60, text: 'Meera & Arjun', size: 52, color: '#ffffff', align: 'center', weight: 800, font: 'Georgia, serif' }),
        text({ x: 140, y: 860, w: 800, h: 90, text: 'Join us · Sunday, 20th Sept · 7 PM\nThe Terrace, Hotel Grand', size: 32, color: '#f5c6d8', align: 'center', weight: 500 }),
      ],
    }),
  },
  {
    id: 'baby-shower', category: 'Celebrations', name: 'Baby Shower', icon: '🍼', anim: 'pop',
    make: () => ({
      w: 1080, h: 1350, background: '#eef6ff',
      elements: [
        { id: newElId(), type: 'ellipse', x: 90, y: 90, w: 260, h: 140, fill: '#ffffff' },
        { id: newElId(), type: 'ellipse', x: 740, y: 140, w: 260, h: 140, fill: '#ffffff' },
        { id: newElId(), type: 'ellipse', x: 420, y: 50, w: 300, h: 150, fill: '#ffffff' },
        sticker('🍼', 480, 210, 130), sticker('👶', 180, 300, 100, -8), sticker('🧸', 790, 300, 100, 8),
        sticker('🦆', 120, 1080, 90, -10), sticker('⭐', 940, 1050, 70, 14), sticker('🌙', 60, 620, 80, -12),
        sticker('🎈', 930, 560, 96, 8), sticker('☁️', 500, 1180, 110), sticker('🌟', 350, 120, 60, -14),
        text({ x: 140, y: 480, w: 800, h: 70, text: 'A little star is on the way!', size: 44, color: '#3b82c4', align: 'center', weight: 700, font: "'Segoe Script', 'Comic Sans MS', cursive" }),
        text({ x: 140, y: 580, w: 800, h: 140, text: 'Baby Shower', size: 110, color: '#1d4e89', align: 'center', weight: 900, font: 'Georgia, serif' }),
        text({ x: 140, y: 770, w: 800, h: 60, text: 'in honour of Priya', size: 44, color: '#e07a9e', align: 'center', weight: 700, font: 'Georgia, serif' }),
        { id: newElId(), type: 'line', x: 390, y: 880, w: 300, h: 0, stroke: '#9cc3e5', strokeWidth: 2 },
        text({ x: 140, y: 920, w: 800, h: 110, text: 'Saturday, 8th August · 11 AM\n12 Bloom Street, Your City', size: 36, color: '#35618e', align: 'center', weight: 600 }),
        text({ x: 140, y: 1250, w: 800, h: 50, text: 'Games, gifts & lots of giggles', size: 32, color: '#6fa3cf', align: 'center', weight: 600, font: "'Segoe Script', 'Comic Sans MS', cursive" }),
      ],
    }),
  },
  {
    id: 'graduation', category: 'Celebrations', name: 'Graduation', icon: '🎓', anim: 'rise',
    make: () => ({
      w: 1080, h: 1080, background: '#0c1b3a',
      elements: [
        { id: newElId(), type: 'rect', x: 0, y: 880, w: 1080, h: 200, fill: '#13284f' },
        sticker('🎓', 460, 70, 150), sticker('🎉', 130, 130, 96, -12), sticker('🎊', 850, 130, 96, 12),
        sticker('⭐', 260, 60, 60, 10), sticker('⭐', 760, 70, 60, -10), sticker('📜', 90, 900, 100, -8), sticker('🥳', 890, 900, 100, 8),
        text({ x: 140, y: 300, w: 800, h: 70, text: 'CONGRATULATIONS', size: 52, color: '#ffd166', align: 'center', weight: 900 }),
        text({ x: 140, y: 400, w: 800, h: 130, text: 'Class of 2026', size: 100, color: '#ffffff', align: 'center', weight: 900, font: 'Georgia, serif' }),
        { id: newElId(), type: 'line', x: 390, y: 580, w: 300, h: 0, stroke: '#ffd166', strokeWidth: 3 },
        text({ x: 140, y: 630, w: 800, h: 60, text: 'You did it, Dev!', size: 48, color: '#bcd2ff', align: 'center', weight: 700, font: "'Segoe Script', 'Comic Sans MS', cursive" }),
        text({ x: 140, y: 730, w: 800, h: 90, text: 'Graduation party · Friday 26th June · 6 PM\nBackyard, 21 Hill View Lane', size: 32, color: '#8fb0e8', align: 'center', weight: 500 }),
        text({ x: 140, y: 930, w: 800, h: 60, text: 'The tassel was worth the hassle 🎓', size: 34, color: '#ffd166', align: 'center', weight: 600 }),
      ],
    }),
  },
  {
    id: 'housewarming', category: 'Celebrations', name: 'Housewarming (Griha Pravesh)', icon: '🏡', anim: 'zoom',
    make: () => ({
      w: 1080, h: 1350, background: '#fdf3e3',
      elements: [
        { id: newElId(), type: 'rect', x: 0, y: 0, w: 1080, h: 260, fill: '#b45309' },
        { id: newElId(), type: 'rect', x: 0, y: 1160, w: 1080, h: 190, fill: '#b45309' },
        { id: newElId(), type: 'rect', x: 70, y: 320, w: 940, h: 780, fill: '#fffaf0', stroke: '#d97706', strokeWidth: 4, radius: 20 },
        sticker('🏡', 460, 100, 140), sticker('🪔', 120, 120, 100, -8), sticker('🪔', 860, 120, 100, 8),
        sticker('🌺', 40, 360, 90, -14), sticker('🌺', 950, 360, 90, 14), sticker('🙏', 490, 340, 100),
        sticker('🧿', 120, 1020, 80, -10), sticker('🥥', 880, 1020, 80, 10), sticker('🌼', 500, 1180, 90),
        text({ x: 140, y: 470, w: 800, h: 70, text: 'गृह प्रवेश', size: 72, color: '#b45309', align: 'center', weight: 900, font: 'Georgia, serif' }),
        text({ x: 140, y: 580, w: 800, h: 60, text: 'Join us as we warm our new home', size: 38, color: '#7c3f12', align: 'center', weight: 600, font: 'Georgia, serif' }),
        { id: newElId(), type: 'line', x: 390, y: 690, w: 300, h: 0, stroke: '#d97706', strokeWidth: 2 },
        text({ x: 140, y: 730, w: 800, h: 60, text: 'Sunday, 30th August · 10 AM', size: 42, color: '#5b2c0e', align: 'center', weight: 800, font: 'Georgia, serif' }),
        text({ x: 140, y: 820, w: 800, h: 100, text: 'Flat 402, Shanti Residency,\nBaner Road, Pune', size: 34, color: '#7c3f12', align: 'center', weight: 500, font: 'Georgia, serif' }),
        text({ x: 140, y: 960, w: 800, h: 50, text: 'Lunch & aashirwad to follow', size: 32, color: '#a16207', align: 'center', weight: 600, font: "'Segoe Script', 'Comic Sans MS', cursive" }),
        text({ x: 140, y: 1230, w: 800, h: 50, text: 'The Sharma Family', size: 38, color: '#fffaf0', align: 'center', weight: 800, font: 'Georgia, serif' }),
      ],
    }),
  },
  {
    id: 'navratri-night', category: 'Events', name: 'Dandiya Night', icon: '🪘', anim: 'pop',
    make: () => ({
      w: 1080, h: 1527, background: '#2a0a4a',
      elements: [
        { id: newElId(), type: 'ellipse', x: -220, y: -220, w: 640, h: 640, fill: '#4c1d95' },
        { id: newElId(), type: 'ellipse', x: 700, y: 1150, w: 640, h: 640, fill: '#4c1d95' },
        { id: newElId(), type: 'ellipse', x: 240, y: 130, w: 600, h: 600, fill: '#f59e0b' },
        { id: newElId(), type: 'ellipse', x: 280, y: 170, w: 520, h: 520, fill: '#fbbf24' },
        sticker('🪘', 440, 260, 190), sticker('🥁', 180, 120, 110, -12), sticker('🪘', 800, 130, 100, 12),
        sticker('✨', 150, 700, 80, 10), sticker('✨', 860, 680, 80, -10), sticker('🪔', 100, 1320, 100, -8), sticker('🪔', 890, 1320, 100, 8),
        text({ x: 90, y: 800, w: 900, h: 150, text: 'DANDIYA NIGHT', size: 100, color: '#fbbf24', align: 'center', weight: 900 }),
        text({ x: 90, y: 970, w: 900, h: 60, text: 'नवरात्रि उत्सव 2026', size: 48, color: '#f5d0fe', align: 'center', weight: 700, font: 'Georgia, serif' }),
        { id: newElId(), type: 'line', x: 390, y: 1090, w: 300, h: 0, stroke: '#f59e0b', strokeWidth: 3 },
        text({ x: 90, y: 1130, w: 900, h: 60, text: 'Saturday · 7 PM till late', size: 44, color: '#ffffff', align: 'center', weight: 700 }),
        text({ x: 90, y: 1210, w: 900, h: 60, text: 'Sunshine Grounds · Live dhol · Prizes', size: 34, color: '#d8b4fe', align: 'center', weight: 500 }),
        text({ x: 90, y: 1380, w: 900, h: 50, text: 'Garba workshop for beginners at 6 PM', size: 30, color: '#f5d0fe', align: 'center', weight: 500, font: "'Segoe Script', 'Comic Sans MS', cursive" }),
      ],
    }),
  },
  {
    id: 'independence-day', category: 'Events', name: 'Independence Day', icon: '🇮🇳', anim: 'rise',
    make: () => ({
      w: 1080, h: 1080, background: '#fffdf7',
      elements: [
        { id: newElId(), type: 'rect', x: 0, y: 0, w: 1080, h: 240, fill: '#f97316' },
        { id: newElId(), type: 'rect', x: 0, y: 840, w: 1080, h: 240, fill: '#16a34a' },
        { id: newElId(), type: 'ellipse', x: 460, y: 460, w: 160, h: 160, fill: 'none', stroke: '#1e3a8a', strokeWidth: 6 },
        sticker('🇮🇳', 480, 80, 110), sticker('🎆', 120, 300, 90, -10), sticker('🎇', 870, 300, 90, 10),
        sticker('🕊️', 180, 880, 90, -6), sticker('🪁', 820, 880, 90, 6),
        text({ x: 90, y: 320, w: 900, h: 80, text: 'HAPPY', size: 64, color: '#1e3a8a', align: 'center', weight: 900 }),
        text({ x: 90, y: 410, w: 900, h: 130, text: 'Independence Day', size: 88, color: '#0f172a', align: 'center', weight: 900, font: 'Georgia, serif' }),
        text({ x: 90, y: 660, w: 900, h: 60, text: 'स्वतंत्रता दिवस की शुभकामनाएँ', size: 42, color: '#b45309', align: 'center', weight: 700, font: 'Georgia, serif' }),
        text({ x: 90, y: 750, w: 900, h: 50, text: '15th August · Jai Hind 🙏', size: 36, color: '#166534', align: 'center', weight: 700 }),
      ],
    }),
  },
  {
    id: 'podcast-episode', category: 'Social', name: 'Podcast Episode', icon: '🎙️', anim: 'slide-left',
    make: () => ({
      w: 1080, h: 1080, background: '#0b0f1e',
      elements: [
        { id: newElId(), type: 'ellipse', x: 620, y: -220, w: 720, h: 720, fill: '#1d2445' },
        { id: newElId(), type: 'ellipse', x: 700, y: -140, w: 560, h: 560, fill: '#28305c' },
        { id: newElId(), type: 'rect', x: 80, y: 80, w: 220, h: 66, fill: '#f43f5e', radius: 33 },
        text({ x: 80, y: 96, w: 220, h: 40, text: 'EP. 12', size: 34, color: '#ffffff', align: 'center', weight: 900 }),
        sticker('🎙️', 720, 140, 190),
        text({ x: 80, y: 320, w: 720, h: 240, text: 'How to build\nin public', size: 96, color: '#f8fafc', weight: 900 }),
        text({ x: 80, y: 620, w: 800, h: 60, text: 'with guest Ananya Rao', size: 40, color: '#94a3b8', weight: 600 }),
        { id: newElId(), type: 'line', x: 80, y: 740, w: 380, h: 0, stroke: '#f43f5e', strokeWidth: 4 },
        text({ x: 80, y: 790, w: 800, h: 50, text: '▶ New episode every Friday', size: 34, color: '#e2e8f0', weight: 600 }),
        text({ x: 80, y: 900, w: 800, h: 44, text: 'Spotify · Apple Podcasts · YouTube', size: 28, color: '#64748b', weight: 500 }),
      ],
    }),
  },
  {
    id: 'mega-sale', category: 'Promos', name: 'Mega Sale Burst', icon: '⚡', anim: 'zoom',
    make: () => ({
      w: 1080, h: 1080, background: '#7f1d1d',
      elements: [
        { id: newElId(), type: 'ellipse', x: 90, y: 90, w: 900, h: 900, fill: '#991b1b' },
        { id: newElId(), type: 'ellipse', x: 170, y: 170, w: 740, h: 740, fill: '#b91c1c' },
        { id: newElId(), type: 'ellipse', x: 250, y: 250, w: 580, h: 580, fill: '#fbbf24' },
        sticker('⚡', 130, 120, 110, -14), sticker('🔥', 850, 120, 110, 14), sticker('🛍️', 120, 850, 110, 10), sticker('💥', 850, 850, 110, -10),
        text({ x: 240, y: 360, w: 600, h: 90, text: 'MEGA SALE', size: 72, color: '#7f1d1d', align: 'center', weight: 900 }),
        text({ x: 240, y: 460, w: 600, h: 170, text: '70% OFF', size: 140, color: '#991b1b', align: 'center', weight: 900 }),
        text({ x: 240, y: 660, w: 600, h: 50, text: 'This weekend only', size: 38, color: '#7c2d12', align: 'center', weight: 700 }),
        { id: newElId(), type: 'rect', x: 360, y: 950, w: 360, h: 84, fill: '#fbbf24', radius: 42 },
        text({ x: 360, y: 972, w: 360, h: 50, text: 'Grab it now →', size: 34, color: '#7f1d1d', align: 'center', weight: 900 }),
      ],
    }),
  },
  {
    id: 'hiring-post', category: 'Business', name: "We're Hiring", icon: '🧑‍💻', anim: 'rise',
    make: () => ({
      w: 1080, h: 1080, background: '#f0f6ff',
      elements: [
        { id: newElId(), type: 'rect', x: 0, y: 0, w: 1080, h: 14, fill: '#2e5bff' },
        { id: newElId(), type: 'ellipse', x: 740, y: 640, w: 520, h: 520, fill: '#dbeafe' },
        sticker('🧑‍💻', 760, 700, 170), sticker('🚀', 120, 100, 90, -10),
        text({ x: 90, y: 200, w: 900, h: 150, text: "We're hiring!", size: 110, color: '#0f172a', weight: 900 }),
        text({ x: 90, y: 400, w: 800, h: 60, text: 'Come build the future with us', size: 40, color: '#475569', weight: 600 }),
        { id: newElId(), type: 'rect', x: 90, y: 520, w: 400, h: 70, fill: '#ffffff', stroke: '#bfdbfe', strokeWidth: 2, radius: 35 },
        text({ x: 90, y: 538, w: 400, h: 40, text: '⚛️ Frontend Engineer', size: 28, color: '#1d4ed8', align: 'center', weight: 700 }),
        { id: newElId(), type: 'rect', x: 90, y: 610, w: 400, h: 70, fill: '#ffffff', stroke: '#bfdbfe', strokeWidth: 2, radius: 35 },
        text({ x: 90, y: 628, w: 400, h: 40, text: '🎨 Product Designer', size: 28, color: '#1d4ed8', align: 'center', weight: 700 }),
        { id: newElId(), type: 'rect', x: 90, y: 700, w: 400, h: 70, fill: '#ffffff', stroke: '#bfdbfe', strokeWidth: 2, radius: 35 },
        text({ x: 90, y: 718, w: 400, h: 40, text: '📊 Data Analyst', size: 28, color: '#1d4ed8', align: 'center', weight: 700 }),
        text({ x: 90, y: 920, w: 900, h: 44, text: 'Apply at careers.yourcompany.com', size: 32, color: '#2e5bff', weight: 800 }),
      ],
    }),
  },
  {
    id: 'diwali-greeting', category: 'Celebrations', name: 'Diwali Greeting', icon: '🪔', anim: 'zoom',
    make: () => ({
      w: 1080, h: 1080, background: '#160a2e',
      elements: [
        { id: newElId(), type: 'ellipse', x: 190, y: 190, w: 700, h: 700, fill: 'none', stroke: '#f59e0b', strokeWidth: 3 },
        { id: newElId(), type: 'ellipse', x: 240, y: 240, w: 600, h: 600, fill: 'none', stroke: '#b45309', strokeWidth: 2 },
        sticker('🪔', 470, 100, 130), sticker('🪔', 150, 480, 110, -8), sticker('🪔', 830, 480, 110, 8),
        sticker('✨', 260, 200, 70, 12), sticker('✨', 750, 200, 70, -12), sticker('🎆', 90, 90, 100, -10), sticker('🎆', 890, 90, 100, 10),
        sticker('🪷', 200, 830, 100, -8), sticker('🪷', 790, 830, 100, 8),
        text({ x: 190, y: 400, w: 700, h: 90, text: 'शुभ दीपावली', size: 84, color: '#fbbf24', align: 'center', weight: 900, font: 'Georgia, serif' }),
        text({ x: 190, y: 530, w: 700, h: 60, text: 'Happy Diwali', size: 48, color: '#fde68a', align: 'center', weight: 700, font: 'Georgia, serif' }),
        text({ x: 190, y: 630, w: 700, h: 90, text: 'May the festival of lights fill your\nhome with joy and prosperity', size: 30, color: '#e9d5ff', align: 'center', weight: 500 }),
        text({ x: 190, y: 900, w: 700, h: 50, text: '— The Kapoor Family', size: 32, color: '#f59e0b', align: 'center', weight: 600, font: "'Segoe Script', 'Comic Sans MS', cursive" }),
      ],
    }),
  },
  {
    id: 'eid-greeting', category: 'Celebrations', name: 'Eid Mubarak', icon: '🌙', anim: 'fade',
    make: () => ({
      w: 1080, h: 1080, background: '#062821',
      elements: [
        { id: newElId(), type: 'rect', x: 70, y: 70, w: 940, h: 940, fill: 'none', stroke: '#d4af37', strokeWidth: 3, radius: 24 },
        sticker('🌙', 440, 120, 170), sticker('⭐', 640, 150, 70, 15), sticker('✨', 340, 190, 60, -10),
        sticker('🕌', 130, 800, 130, 0), sticker('🏮', 880, 180, 96, 8), sticker('🏮', 120, 180, 96, -8), sticker('🌙', 880, 820, 90, 10),
        text({ x: 190, y: 420, w: 700, h: 100, text: 'ईद मुबारक', size: 88, color: '#d4af37', align: 'center', weight: 900, font: 'Georgia, serif' }),
        text({ x: 190, y: 560, w: 700, h: 60, text: 'Eid Mubarak', size: 50, color: '#f0e6c8', align: 'center', weight: 700, font: 'Georgia, serif' }),
        { id: newElId(), type: 'line', x: 390, y: 670, w: 300, h: 0, stroke: '#d4af37', strokeWidth: 2 },
        text({ x: 190, y: 710, w: 700, h: 90, text: 'May this blessed day bring peace,\nhappiness and togetherness', size: 30, color: '#c7f9ec', align: 'center', weight: 500 }),
      ],
    }),
  },
  {
    id: 'save-the-date', category: 'Celebrations', name: 'Save the Date', icon: '📆', anim: 'rise',
    make: () => ({
      w: 1080, h: 1350, background: '#f7f3ee',
      elements: [
        { id: newElId(), type: 'rect', x: 90, y: 90, w: 900, h: 1170, fill: '#ffffff', stroke: '#d6c7b2', strokeWidth: 2, radius: 6 },
        sticker('🌿', 120, 110, 110, -18), sticker('🌿', 850, 110, 110, 18), sticker('🌿', 120, 1150, 110, 198), sticker('🌿', 850, 1150, 110, 162),
        text({ x: 190, y: 260, w: 700, h: 50, text: 'SAVE THE DATE', size: 36, color: '#a18a68', align: 'center', weight: 600 }),
        text({ x: 190, y: 380, w: 700, h: 200, text: 'Priya\n&\nKaran', size: 76, color: '#4a3f2f', align: 'center', weight: 700, font: 'Georgia, serif' }),
        { id: newElId(), type: 'line', x: 420, y: 700, w: 240, h: 0, stroke: '#d6c7b2', strokeWidth: 2 },
        text({ x: 190, y: 750, w: 700, h: 80, text: '12 · 12 · 2026', size: 64, color: '#8b6f47', align: 'center', weight: 800, font: 'Georgia, serif' }),
        text({ x: 190, y: 880, w: 700, h: 50, text: 'Udaipur, Rajasthan', size: 36, color: '#6b5c45', align: 'center', weight: 500, font: 'Georgia, serif' }),
        text({ x: 190, y: 1050, w: 700, h: 50, text: 'Formal invitation to follow', size: 28, color: '#a18a68', align: 'center', weight: 500, font: "'Segoe Script', 'Comic Sans MS', cursive" }),
      ],
    }),
  },
  {
    id: 'restaurant-menu', category: 'Business', name: 'Menu Card', icon: '🍽️',
    make: () => ({
      w: 1080, h: 1527, background: '#fffbf2',
      elements: [
        { id: newElId(), type: 'rect', x: 0, y: 0, w: 1080, h: 300, fill: '#7c2d12' },
        sticker('🍽️', 480, 60, 110), sticker('🌶️', 120, 90, 80, -10), sticker('🍛', 870, 90, 80, 10),
        text({ x: 140, y: 190, w: 800, h: 70, text: 'SPICE GARDEN', size: 60, color: '#fed7aa', align: 'center', weight: 900, font: 'Georgia, serif' }),
        text({ x: 140, y: 360, w: 800, h: 50, text: '— TODAY’S SPECIALS —', size: 34, color: '#9a3412', align: 'center', weight: 800 }),
        text({ x: 140, y: 470, w: 560, h: 44, text: 'Paneer Tikka Masala', size: 36, color: '#431407', weight: 700 }),
        text({ x: 740, y: 470, w: 200, h: 44, text: '₹280', size: 36, color: '#9a3412', align: 'right', weight: 800 }),
        text({ x: 140, y: 560, w: 560, h: 44, text: 'Hyderabadi Biryani', size: 36, color: '#431407', weight: 700 }),
        text({ x: 740, y: 560, w: 200, h: 44, text: '₹320', size: 36, color: '#9a3412', align: 'right', weight: 800 }),
        text({ x: 140, y: 650, w: 560, h: 44, text: 'Masala Dosa', size: 36, color: '#431407', weight: 700 }),
        text({ x: 740, y: 650, w: 200, h: 44, text: '₹150', size: 36, color: '#9a3412', align: 'right', weight: 800 }),
        text({ x: 140, y: 740, w: 560, h: 44, text: 'Gulab Jamun (2 pc)', size: 36, color: '#431407', weight: 700 }),
        text({ x: 740, y: 740, w: 200, h: 44, text: '₹90', size: 36, color: '#9a3412', align: 'right', weight: 800 }),
        { id: newElId(), type: 'line', x: 140, y: 860, w: 800, h: 0, stroke: '#fdba74', strokeWidth: 2 },
        text({ x: 140, y: 910, w: 800, h: 44, text: '🫖 Chai & filter coffee all day · ₹40', size: 30, color: '#7c2d12', align: 'center', weight: 600 }),
        { id: newElId(), type: 'rect', x: 290, y: 1050, w: 500, h: 90, fill: '#7c2d12', radius: 45 },
        text({ x: 290, y: 1074, w: 500, h: 50, text: '📞 Order: 98765 43210', size: 32, color: '#fed7aa', align: 'center', weight: 800 }),
        text({ x: 140, y: 1350, w: 800, h: 40, text: 'Open 11 AM – 11 PM · MG Road, Bengaluru', size: 26, color: '#9a3412', align: 'center', weight: 500 }),
      ],
    }),
  },
  {
    id: 'match-day', category: 'Events', name: 'Match Day', icon: '🏏', anim: 'pop',
    make: () => ({
      w: 1080, h: 1080, background: '#052e16',
      elements: [
        { id: newElId(), type: 'ellipse', x: -160, y: 700, w: 560, h: 560, fill: '#14532d' },
        { id: newElId(), type: 'ellipse', x: 720, y: -180, w: 560, h: 560, fill: '#14532d' },
        sticker('🏏', 460, 90, 150), sticker('🏆', 130, 130, 100, -10), sticker('🎉', 860, 140, 90, 10), sticker('📣', 100, 850, 100, -8),
        text({ x: 140, y: 320, w: 800, h: 70, text: 'SUNDAY MEGA MATCH', size: 48, color: '#86efac', align: 'center', weight: 900 }),
        text({ x: 140, y: 420, w: 800, h: 220, text: 'Titans\nvs\nRoyals', size: 84, color: '#ffffff', align: 'center', weight: 900 }),
        { id: newElId(), type: 'line', x: 390, y: 740, w: 300, h: 0, stroke: '#22c55e', strokeWidth: 3 },
        text({ x: 140, y: 790, w: 800, h: 50, text: 'Sunday · 4 PM · Community Ground', size: 36, color: '#bbf7d0', align: 'center', weight: 700 }),
        text({ x: 140, y: 900, w: 800, h: 44, text: 'Entry free · Chai & snacks stall · Bring the family!', size: 28, color: '#86efac', align: 'center', weight: 500 }),
      ],
    }),
  },
  {
    id: 'travel-sale', category: 'Promos', name: 'Travel Deal', icon: '✈️', anim: 'slide-left',
    make: () => ({
      w: 1080, h: 1080, background: '#082f49',
      elements: [
        { id: newElId(), type: 'ellipse', x: 560, y: 80, w: 440, h: 440, fill: '#fbbf24' },
        sticker('✈️', 640, 160, 170, -12), sticker('☁️', 140, 120, 110, 0), sticker('☁️', 340, 240, 84, 0), sticker('🧳', 120, 840, 110, -8), sticker('🗺️', 880, 850, 100, 8),
        text({ x: 90, y: 400, w: 700, h: 90, text: 'GOA CALLING', size: 76, color: '#ffffff', weight: 900 }),
        text({ x: 90, y: 520, w: 700, h: 130, text: '₹4,999', size: 120, color: '#fbbf24', weight: 900 }),
        text({ x: 90, y: 690, w: 700, h: 50, text: '3 nights · flights + hotel · per person', size: 34, color: '#bae6fd', weight: 600 }),
        { id: newElId(), type: 'rect', x: 90, y: 800, w: 420, h: 90, fill: '#fbbf24', radius: 45 },
        text({ x: 90, y: 824, w: 420, h: 50, text: 'Book before Sunday →', size: 32, color: '#082f49', align: 'center', weight: 900 }),
      ],
    }),
  },
  {
    id: 'christmas-card', category: 'Celebrations', name: 'Christmas Card', icon: '🎄', anim: 'pop',
    make: () => ({
      w: 1080, h: 1350, background: '#0c2818', effect: 'snow',
      elements: [
        { id: newElId(), type: 'rect', x: 70, y: 70, w: 940, h: 1210, fill: 'none', stroke: '#d4af37', strokeWidth: 3, radius: 18 },
        sticker('🎄', 450, 130, 180), sticker('⭐', 500, 90, 70), sticker('🎅', 140, 160, 110, -8), sticker('🦌', 830, 160, 100, 8),
        sticker('🎁', 180, 1080, 100, -10), sticker('🎁', 800, 1080, 100, 10), sticker('❄️', 120, 600, 70, 0), sticker('❄️', 890, 640, 70, 0), sticker('🔔', 500, 1120, 90, 0),
        text({ x: 190, y: 520, w: 700, h: 90, text: 'Merry Christmas', size: 76, color: '#f8e7c9', align: 'center', weight: 900, font: 'Georgia, serif' }),
        text({ x: 190, y: 650, w: 700, h: 60, text: '& a Happy New Year', size: 44, color: '#d4af37', align: 'center', weight: 700, font: "'Segoe Script', 'Comic Sans MS', cursive" }),
        { id: newElId(), type: 'line', x: 390, y: 780, w: 300, h: 0, stroke: '#d4af37', strokeWidth: 2 },
        text({ x: 190, y: 830, w: 700, h: 90, text: 'Wishing you warmth, joy and\ntogetherness this season', size: 32, color: '#cde8d5', align: 'center', weight: 500 }),
      ],
    }),
  },
  {
    id: 'certificate', category: 'Business', name: 'Certificate', icon: '🏅',
    make: () => ({
      w: 1123, h: 794, background: '#fffdf6',
      elements: [
        { id: newElId(), type: 'rect', x: 40, y: 40, w: 1043, h: 714, fill: 'none', stroke: '#b7952e', strokeWidth: 4 },
        { id: newElId(), type: 'rect', x: 56, y: 56, w: 1011, h: 682, fill: 'none', stroke: '#e2cf8f', strokeWidth: 1.5 },
        sticker('🏅', 500, 80, 110),
        text({ x: 160, y: 220, w: 800, h: 60, text: 'CERTIFICATE OF ACHIEVEMENT', size: 40, color: '#8a6d1e', align: 'center', weight: 800 }),
        text({ x: 160, y: 310, w: 800, h: 40, text: 'proudly presented to', size: 24, color: '#8a7a54', align: 'center', weight: 500, font: 'Georgia, serif' }),
        text({ x: 160, y: 370, w: 800, h: 90, text: 'Ananya Sharma', size: 68, color: '#3f3320', align: 'center', weight: 800, font: 'Georgia, serif' }),
        { id: newElId(), type: 'line', x: 360, y: 490, w: 400, h: 0, stroke: '#b7952e', strokeWidth: 2 },
        text({ x: 160, y: 520, w: 800, h: 70, text: 'for outstanding performance in the\nAnnual Science Fair 2026', size: 26, color: '#6b5d3d', align: 'center', weight: 500, font: 'Georgia, serif' }),
        text({ x: 140, y: 660, w: 300, h: 40, text: 'Date: 20 · 07 · 2026', size: 22, color: '#8a7a54', align: 'center', weight: 600 }),
        text({ x: 660, y: 660, w: 300, h: 40, text: 'Signature', size: 22, color: '#8a7a54', align: 'center', weight: 600 }),
      ],
    }),
  },
  {
    id: 'yt-thumbnail', category: 'Social', name: 'YouTube Thumbnail', icon: '▶️',
    make: () => ({
      w: 1280, h: 720, background: '#101014',
      elements: [
        { id: newElId(), type: 'ellipse', x: 820, y: -160, w: 700, h: 700, fill: '#dc2626' },
        { id: newElId(), type: 'rect', x: 60, y: 60, w: 240, h: 64, fill: '#dc2626', radius: 32 },
        text({ x: 60, y: 76, w: 240, h: 40, text: 'NEW VIDEO', size: 28, color: '#ffffff', align: 'center', weight: 900 }),
        text({ x: 60, y: 220, w: 780, h: 260, text: 'I TRIED THIS\nFOR 30 DAYS', size: 100, color: '#ffffff', weight: 900 }),
        text({ x: 60, y: 540, w: 700, h: 60, text: '…and here’s what happened', size: 40, color: '#fca5a5', weight: 700 }),
        sticker('😱', 1000, 340, 190), sticker('👉', 850, 560, 110, -10),
      ],
    }),
  },
  {
    id: 'rakhi-greeting', category: 'Celebrations', name: 'Raksha Bandhan', icon: '🪢', anim: 'rise',
    make: () => ({
      w: 1080, h: 1080, background: '#fff1e6',
      elements: [
        { id: newElId(), type: 'ellipse', x: 290, y: 120, w: 500, h: 500, fill: '#ffe0c2' },
        sticker('🪢', 460, 220, 150), sticker('🎁', 150, 180, 100, -10), sticker('🍬', 830, 180, 90, 10),
        sticker('🌺', 120, 800, 100, -8), sticker('🌺', 860, 800, 100, 8), sticker('✨', 250, 640, 70, 12), sticker('✨', 760, 640, 70, -12),
        text({ x: 140, y: 620, w: 800, h: 90, text: 'रक्षा बंधन', size: 80, color: '#b3541e', align: 'center', weight: 900, font: 'Georgia, serif' }),
        text({ x: 140, y: 740, w: 800, h: 50, text: 'Happy Raksha Bandhan', size: 40, color: '#8a4117', align: 'center', weight: 700, font: 'Georgia, serif' }),
        text({ x: 140, y: 830, w: 800, h: 80, text: 'To the world’s best brother —\nthis thread carries all my love', size: 30, color: '#a05c2e', align: 'center', weight: 500, font: "'Segoe Script', 'Comic Sans MS', cursive" }),
      ],
    }),
  },
  {
    id: 'new-year', category: 'Celebrations', name: 'New Year Wish', icon: '🎆', anim: 'zoom',
    make: () => ({
      w: 1080, h: 1920, background: '#050a1f',
      elements: [
        sticker('🎆', 140, 120, 150, -8), sticker('🎇', 800, 100, 140, 8), sticker('🎆', 480, 60, 120),
        sticker('🥂', 200, 1500, 130, -10), sticker('🎉', 760, 1500, 130, 10), sticker('✨', 120, 700, 80, 14), sticker('✨', 880, 760, 80, -14),
        text({ x: 90, y: 620, w: 900, h: 70, text: 'HAPPY NEW YEAR', size: 62, color: '#93c5fd', align: 'center', weight: 800 }),
        text({ x: 90, y: 740, w: 900, h: 260, text: '2027', size: 240, color: '#fbbf24', align: 'center', weight: 900, font: 'Georgia, serif' }),
        { id: newElId(), type: 'line', x: 390, y: 1120, w: 300, h: 0, stroke: '#fbbf24', strokeWidth: 3 },
        text({ x: 90, y: 1170, w: 900, h: 90, text: 'May your year sparkle with\nnew dreams and new wins', size: 38, color: '#e0e7ff', align: 'center', weight: 500, font: "'Segoe Script', 'Comic Sans MS', cursive" }),
      ],
    }),
  },
  {
    id: 'grand-opening', category: 'Promos', name: 'Grand Opening', icon: '🎀', anim: 'pop',
    make: () => ({
      w: 1080, h: 1350, background: '#4a044e',
      elements: [
        { id: newElId(), type: 'ellipse', x: 190, y: 130, w: 700, h: 700, fill: '#701a75' },
        { id: newElId(), type: 'ellipse', x: 240, y: 180, w: 600, h: 600, fill: '#86198f' },
        sticker('🎀', 460, 100, 160), sticker('🎊', 140, 160, 110, -10), sticker('🎉', 830, 160, 110, 10), sticker('🛍️', 150, 1120, 110, -8), sticker('🥳', 830, 1120, 110, 8),
        text({ x: 190, y: 380, w: 700, h: 60, text: 'WE ARE OPEN!', size: 48, color: '#f5d0fe', align: 'center', weight: 800 }),
        text({ x: 190, y: 460, w: 700, h: 160, text: 'GRAND\nOPENING', size: 92, color: '#ffffff', align: 'center', weight: 900 }),
        text({ x: 190, y: 680, w: 700, h: 50, text: 'Sunday, 2nd August · 10 AM', size: 36, color: '#f0abfc', align: 'center', weight: 700 }),
        { id: newElId(), type: 'rect', x: 290, y: 900, w: 500, h: 92, fill: '#fbbf24', radius: 46 },
        text({ x: 290, y: 925, w: 500, h: 50, text: 'First 50 customers: 50% off', size: 30, color: '#4a044e', align: 'center', weight: 900 }),
        text({ x: 190, y: 1250, w: 700, h: 40, text: 'Shop 4, Market Road · Free cake & balloons for kids', size: 26, color: '#e9d5ff', align: 'center', weight: 500 }),
      ],
    }),
  },
  {
    id: 'blood-camp', category: 'Events', name: 'Donation Camp', icon: '🩸', anim: 'rise',
    make: () => ({
      w: 1080, h: 1350, background: '#fef2f2',
      elements: [
        { id: newElId(), type: 'rect', x: 0, y: 0, w: 1080, h: 320, fill: '#b91c1c' },
        sticker('🩸', 480, 80, 140), sticker('❤️', 140, 110, 100, -10), sticker('🏥', 850, 110, 100, 10),
        text({ x: 140, y: 400, w: 800, h: 140, text: 'BLOOD DONATION\nCAMP', size: 64, color: '#7f1d1d', align: 'center', weight: 900 }),
        text({ x: 140, y: 610, w: 800, h: 50, text: 'One donation can save three lives', size: 34, color: '#b91c1c', align: 'center', weight: 700 }),
        { id: newElId(), type: 'line', x: 390, y: 720, w: 300, h: 0, stroke: '#fca5a5', strokeWidth: 3 },
        text({ x: 140, y: 770, w: 800, h: 110, text: 'Sunday, 9th August · 9 AM – 3 PM\nCommunity Hall, Sector 12', size: 36, color: '#450a0a', align: 'center', weight: 600 }),
        { id: newElId(), type: 'rect', x: 290, y: 960, w: 500, h: 90, fill: '#b91c1c', radius: 45 },
        text({ x: 290, y: 984, w: 500, h: 50, text: 'Register: 98200 12345', size: 32, color: '#fef2f2', align: 'center', weight: 800 }),
        text({ x: 140, y: 1150, w: 800, h: 80, text: 'Free health check-up for every donor ·\nRefreshments provided 🙏', size: 28, color: '#991b1b', align: 'center', weight: 500 }),
      ],
    }),
  },
  {
    id: 'birthday-wish', category: 'Celebrations', name: 'Birthday Wish Card', icon: '🥳', anim: 'pop',
    make: () => ({
      w: 1080, h: 1080, background: '#fdf2f8',
      elements: [
        { id: newElId(), type: 'ellipse', x: 140, y: 140, w: 800, h: 800, fill: '#fce7f3' },
        sticker('🎂', 460, 180, 150), sticker('🎈', 180, 160, 110, -12), sticker('🎈', 800, 150, 110, 12),
        sticker('🎉', 130, 760, 100, -10), sticker('🎊', 850, 760, 100, 10), sticker('⭐', 300, 90, 60, 15), sticker('✨', 720, 100, 60, -15),
        text({ x: 140, y: 430, w: 800, h: 130, text: 'Happy\nBirthday!', size: 96, color: '#be185d', align: 'center', weight: 900, font: 'Georgia, serif' }),
        text({ x: 140, y: 650, w: 800, h: 60, text: 'To someone truly special', size: 40, color: '#9d174d', align: 'center', weight: 600, font: "'Segoe Script', 'Comic Sans MS', cursive" }),
        text({ x: 140, y: 760, w: 800, h: 80, text: 'May your day be full of cake,\nlaughter and love', size: 32, color: '#a855a0', align: 'center', weight: 500 }),
        text({ x: 140, y: 940, w: 800, h: 40, text: '— with love, from all of us', size: 28, color: '#be185d', align: 'center', weight: 600 }),
      ],
    }),
  },
  {
    id: 'anniversary-wish', category: 'Celebrations', name: 'Anniversary Wish', icon: '💑', anim: 'fade',
    make: () => ({
      w: 1080, h: 1080, background: '#1c0a14',
      elements: [
        { id: newElId(), type: 'ellipse', x: 240, y: 130, w: 600, h: 600, fill: 'none', stroke: '#e8b4c8', strokeWidth: 2 },
        sticker('💑', 470, 240, 140), sticker('💐', 150, 170, 100, -10), sticker('💐', 830, 170, 100, 10),
        sticker('💞', 300, 120, 70, -8), sticker('💞', 720, 120, 70, 8), sticker('✨', 180, 640, 60, 12), sticker('✨', 840, 640, 60, -12),
        text({ x: 140, y: 500, w: 800, h: 80, text: 'Happy Anniversary', size: 72, color: '#f9d6e5', align: 'center', weight: 900, font: 'Georgia, serif' }),
        text({ x: 140, y: 620, w: 800, h: 50, text: 'Mummy & Papa', size: 44, color: '#e8b4c8', align: 'center', weight: 700, font: "'Segoe Script', 'Comic Sans MS', cursive" }),
        { id: newElId(), type: 'line', x: 390, y: 730, w: 300, h: 0, stroke: '#a56688', strokeWidth: 2 },
        text({ x: 140, y: 780, w: 800, h: 90, text: 'Your love story is our favourite —\nhere’s to many more years together', size: 30, color: '#d8b4c8', align: 'center', weight: 500 }),
      ],
    }),
  },
  {
    id: 'good-morning', category: 'Celebrations', name: 'Good Morning', icon: '🌞', anim: 'rise',
    make: () => ({
      w: 1080, h: 1080, background: '#fff7e0',
      elements: [
        { id: newElId(), type: 'ellipse', x: 340, y: 120, w: 400, h: 400, fill: '#fde68a' },
        sticker('🌞', 460, 190, 160), sticker('🌻', 130, 720, 110, -10), sticker('🌻', 840, 720, 110, 10),
        sticker('🐦', 250, 150, 70, -8), sticker('☁️', 780, 140, 90, 0), sticker('🍵', 500, 880, 90, 0),
        text({ x: 140, y: 560, w: 800, h: 90, text: 'Good Morning!', size: 84, color: '#b45309', align: 'center', weight: 900, font: 'Georgia, serif' }),
        text({ x: 140, y: 680, w: 800, h: 50, text: 'शुभ प्रभात', size: 44, color: '#d97706', align: 'center', weight: 700, font: 'Georgia, serif' }),
        text({ x: 140, y: 770, w: 800, h: 80, text: 'May your day be as bright\nas the morning sun', size: 32, color: '#92610e', align: 'center', weight: 500, font: "'Segoe Script', 'Comic Sans MS', cursive" }),
      ],
    }),
  },
  {
    id: 'get-well', category: 'Celebrations', name: 'Get Well Soon', icon: '🌻', anim: 'fade',
    make: () => ({
      w: 1080, h: 1080, background: '#f0fdf4',
      elements: [
        { id: newElId(), type: 'ellipse', x: 190, y: 160, w: 700, h: 700, fill: '#dcfce7' },
        sticker('🌻', 470, 220, 140), sticker('🍀', 220, 260, 80, -10), sticker('🍀', 790, 260, 80, 10),
        sticker('☀️', 160, 120, 90, 0), sticker('🦋', 830, 130, 80, 10), sticker('💐', 500, 830, 100, 0),
        text({ x: 140, y: 470, w: 800, h: 90, text: 'Get Well Soon', size: 80, color: '#166534', align: 'center', weight: 900, font: 'Georgia, serif' }),
        text({ x: 140, y: 600, w: 800, h: 90, text: 'Sending you sunshine, soup\nand lots of good wishes', size: 32, color: '#15803d', align: 'center', weight: 500, font: "'Segoe Script', 'Comic Sans MS', cursive" }),
        text({ x: 140, y: 740, w: 800, h: 40, text: 'Rest up — we miss you already!', size: 30, color: '#4d7c0f', align: 'center', weight: 600 }),
      ],
    }),
  },
  {
    id: 'anim-birthday-wish', category: 'Celebrations', name: 'Happy Birthday (animated)', icon: '🎉', anim: 'pop',
    make: () => ({
      w: 1080, h: 1080, background: '#12083a', effect: 'confetti',
      elements: [
        { id: newElId(), type: 'ellipse', x: 240, y: 200, w: 600, h: 600, fill: 'none', stroke: '#f472b6', strokeWidth: 3 },
        aSticker('🎂', 470, 150, 150, 'bounce'), aSticker('🎈', 150, 130, 120, 'float', -8), aSticker('🎈', 830, 120, 120, 'float', 8),
        aSticker('⭐', 300, 120, 70, 'spin', 0), aSticker('⭐', 720, 130, 70, 'spin', 0), aSticker('✨', 180, 720, 64, 'pulse'), aSticker('✨', 850, 720, 64, 'pulse'),
        aSticker('🎉', 120, 860, 100, 'shake', -10), aSticker('🎊', 860, 860, 100, 'shake', 10), aSticker('🥳', 490, 840, 110, 'beat'),
        text({ x: 140, y: 430, w: 800, h: 130, text: 'Happy Birthday!', size: 92, color: '#fde68a', align: 'center', weight: 900, font: 'Georgia, serif' }),
        text({ x: 140, y: 600, w: 800, h: 60, text: 'Wishing you a day full of joy', size: 38, color: '#f9a8d4', align: 'center', weight: 600, font: "'Segoe Script', 'Comic Sans MS', cursive" }),
      ],
    }),
  },
  {
    id: 'anim-congrats', category: 'Celebrations', name: 'Congratulations (animated)', icon: '🏆', anim: 'rise',
    make: () => ({
      w: 1080, h: 1080, background: '#0b3d2e', effect: 'confetti',
      elements: [
        aSticker('🏆', 470, 150, 160, 'beat'), aSticker('🎉', 130, 150, 110, 'shake', -10), aSticker('🎊', 840, 150, 110, 'shake', 10),
        aSticker('⭐', 250, 120, 64, 'spin'), aSticker('⭐', 760, 130, 64, 'spin'), aSticker('✨', 160, 820, 60, 'pulse'), aSticker('✨', 860, 820, 60, 'pulse'),
        text({ x: 140, y: 460, w: 800, h: 130, text: 'Congratulations!', size: 84, color: '#fcd34d', align: 'center', weight: 900, font: 'Georgia, serif' }),
        text({ x: 140, y: 620, w: 800, h: 90, text: 'So proud of you —\nhere’s to your success', size: 36, color: '#a7f3d0', align: 'center', weight: 500, font: "'Segoe Script', 'Comic Sans MS', cursive" }),
      ],
    }),
  },
  {
    id: 'anim-love', category: 'Celebrations', name: 'Love You (animated)', icon: '💖', anim: 'zoom',
    make: () => ({
      w: 1080, h: 1080, background: '#3b0a1e', effect: 'hearts',
      elements: [
        aSticker('💖', 470, 170, 170, 'beat'), aSticker('💕', 150, 200, 100, 'float', -8), aSticker('💕', 840, 200, 100, 'float', 8),
        aSticker('🌹', 130, 800, 100, 'wobble', -8), aSticker('🌹', 850, 800, 100, 'wobble', 8), aSticker('✨', 300, 150, 60, 'pulse'), aSticker('✨', 720, 150, 60, 'pulse'),
        text({ x: 140, y: 480, w: 800, h: 120, text: 'I Love You', size: 96, color: '#fecdd3', align: 'center', weight: 900, font: 'Georgia, serif' }),
        text({ x: 140, y: 640, w: 800, h: 60, text: 'today, tomorrow, always', size: 40, color: '#fda4af', align: 'center', weight: 600, font: "'Segoe Script', 'Comic Sans MS', cursive" }),
      ],
    }),
  },
  {
    id: 'social-quote', category: 'Social', name: 'Quote Post', icon: '❝',
    make: () => ({
      w: 1080, h: 1080, background: '#0f172a',
      elements: [
        { id: newElId(), type: 'rect', x: 80, y: 80, w: 920, h: 920, fill: 'none', stroke: '#38bdf8', strokeWidth: 4, radius: 16 },
        text({ x: 140, y: 360, w: 800, h: 300, text: '“Design is intelligence\nmade visible.”', size: 72, color: '#f8fafc', align: 'center', weight: 800 }),
        text({ x: 140, y: 760, w: 800, h: 60, text: '— Pyntra studio', size: 32, color: '#38bdf8', align: 'center', weight: 600 }),
      ],
    }),
  },
  {
    id: 'social-promo', category: 'Promos', name: 'Sale Promo', icon: '🏷️',
    make: () => ({
      w: 1080, h: 1080, background: '#fff7ed',
      elements: [
        { id: newElId(), type: 'ellipse', x: 620, y: -140, w: 600, h: 600, fill: '#fb923c' },
        text({ x: 90, y: 300, w: 700, h: 200, text: 'BIG\nSALE', size: 150, color: '#7c2d12', weight: 900 }),
        text({ x: 90, y: 640, w: 700, h: 80, text: 'Up to 50% off — this week only', size: 40, color: '#9a3412', weight: 600 }),
        { id: newElId(), type: 'rect', x: 90, y: 760, w: 360, h: 96, fill: '#ea580c', radius: 48 },
        text({ x: 90, y: 788, w: 360, h: 60, text: 'Shop now', size: 38, color: '#ffffff', align: 'center', weight: 700 }),
      ],
    }),
  },
  {
    id: 'poster-event', category: 'Events', name: 'Event Poster', icon: '📅',
    make: () => ({
      w: 1080, h: 1527, background: '#1e1b4b',
      elements: [
        { id: newElId(), type: 'rect', x: 0, y: 0, w: 1080, h: 520, fill: '#4338ca' },
        text({ x: 80, y: 180, w: 920, h: 220, text: 'LIVE\nIN CONCERT', size: 110, color: '#ffffff', weight: 900 }),
        text({ x: 80, y: 700, w: 920, h: 100, text: 'Saturday · 8 PM', size: 64, color: '#c4b5fd', weight: 700 }),
        text({ x: 80, y: 820, w: 920, h: 80, text: 'The Grand Hall, Downtown', size: 40, color: '#e0e7ff', weight: 500 }),
        { id: newElId(), type: 'line', x: 80, y: 960, w: 920, h: 0, stroke: '#6366f1', strokeWidth: 3 },
        text({ x: 80, y: 1020, w: 920, h: 80, text: 'Tickets at pyntra.app', size: 36, color: '#a5b4fc', weight: 500 }),
      ],
    }),
  },
  {
    id: 'business-card', category: 'Business', name: 'Business Card', icon: '💳',
    make: () => ({
      w: 1050, h: 600, background: '#ffffff',
      elements: [
        { id: newElId(), type: 'rect', x: 0, y: 0, w: 18, h: 600, fill: '#2e5bff' },
        text({ x: 70, y: 180, w: 600, h: 70, text: 'Alex Morgan', size: 56, color: '#0f172a', weight: 800 }),
        text({ x: 70, y: 270, w: 600, h: 50, text: 'Product Designer', size: 32, color: '#2e5bff', weight: 600 }),
        { id: newElId(), type: 'line', x: 70, y: 360, w: 380, h: 0, stroke: '#e2e8f0', strokeWidth: 2 },
        text({ x: 70, y: 400, w: 700, h: 40, text: 'alex@studio.com · +1 555 0100', size: 26, color: '#475569', weight: 500 }),
        text({ x: 70, y: 450, w: 700, h: 40, text: 'studio.com · @alexmakes', size: 26, color: '#475569', weight: 500 }),
      ],
    }),
  },
  {
    id: 'webinar-story', category: 'Business', name: 'Webinar Story', icon: '🎤',
    make: () => ({
      w: 1080, h: 1920, background: '#0f172a',
      elements: [
        { id: newElId(), type: 'rect', x: 0, y: 1320, w: 1080, h: 600, fill: '#2e5bff' },
        text({ x: 90, y: 280, w: 900, h: 80, text: 'FREE WEBINAR', size: 48, color: '#38bdf8', weight: 800 }),
        text({ x: 90, y: 420, w: 900, h: 360, text: 'Designing for\nspeed & scale', size: 120, color: '#f8fafc', weight: 900 }),
        text({ x: 90, y: 1440, w: 900, h: 80, text: 'Thursday · 6:00 PM', size: 56, color: '#ffffff', weight: 700 }),
        text({ x: 90, y: 1560, w: 900, h: 60, text: 'Save your seat → pyntra.app/live', size: 40, color: '#dbeafe', weight: 500 }),
      ],
    }),
  },
  {
    id: 'thank-you', category: 'Social', name: 'Thank You', icon: '💌',
    make: () => ({
      w: 1080, h: 1080, background: '#fdf2f8',
      elements: [
        { id: newElId(), type: 'ellipse', x: 340, y: 180, w: 400, h: 400, fill: '#fbcfe8' },
        text({ x: 140, y: 300, w: 800, h: 200, text: 'Thank\nyou!', size: 130, color: '#9d174d', align: 'center', weight: 900 }),
        text({ x: 140, y: 720, w: 800, h: 80, text: 'We appreciate your support 💕', size: 40, color: '#be185d', align: 'center', weight: 500 }),
      ],
    }),
  },
  {
    id: 'discount-coupon', category: 'Promos', name: 'Coupon', icon: '🎟️',
    make: () => ({
      w: 1200, h: 630, background: '#022c22',
      elements: [
        { id: newElId(), type: 'rect', x: 40, y: 40, w: 1120, h: 550, fill: 'none', stroke: '#34d399', strokeWidth: 4, radius: 20 },
        text({ x: 90, y: 200, w: 700, h: 100, text: '25% OFF', size: 130, color: '#34d399', weight: 900 }),
        text({ x: 90, y: 360, w: 700, h: 60, text: 'Your first order with code', size: 36, color: '#d1fae5', weight: 500 }),
        { id: newElId(), type: 'rect', x: 90, y: 430, w: 360, h: 90, fill: '#34d399', radius: 10 },
        text({ x: 90, y: 452, w: 360, h: 60, text: 'WELCOME25', size: 44, color: '#022c22', align: 'center', weight: 800 }),
      ],
    }),
  },
  // ── Social Promo — more, static + animated ────────────────────────────────
  {
    id: 'social-promo-flash', category: 'Promos', name: 'Flash Sale (animated)', icon: '⚡', anim: 'pop',
    make: () => ({
      w: 1080, h: 1080, background: '#0b1020',
      elements: [
        { id: newElId(), type: 'rect', x: 0, y: 0, w: 1080, h: 1080, fill: 'none', stroke: '#facc15', strokeWidth: 10 },
        text({ x: 80, y: 250, w: 920, h: 200, text: '⚡ FLASH', size: 150, color: '#facc15', weight: 900, align: 'center' }),
        text({ x: 80, y: 430, w: 920, h: 220, text: 'SALE', size: 230, color: '#ffffff', weight: 900, align: 'center' }),
        text({ x: 80, y: 720, w: 920, h: 70, text: '48 HOURS ONLY', size: 46, color: '#fef9c3', weight: 700, align: 'center' }),
        { id: newElId(), type: 'rect', x: 340, y: 840, w: 400, h: 110, fill: '#facc15', radius: 55 },
        text({ x: 340, y: 872, w: 400, h: 70, text: 'Grab the deal', size: 42, color: '#0b1020', align: 'center', weight: 800 }),
      ],
    }),
  },
  {
    id: 'social-promo-arrival', category: 'Promos', name: 'New Arrival', icon: '🛍️',
    make: () => ({
      w: 1080, h: 1080, background: '#f0fdfa',
      elements: [
        { id: newElId(), type: 'rect', x: 0, y: 0, w: 1080, h: 240, fill: '#0d9488' },
        text({ x: 90, y: 90, w: 900, h: 80, text: 'JUST DROPPED', size: 54, color: '#ffffff', weight: 800 }),
        text({ x: 90, y: 360, w: 900, h: 280, text: 'New\nArrival', size: 150, color: '#0f766e', weight: 900 }),
        text({ x: 90, y: 720, w: 900, h: 70, text: 'Fresh styles, limited stock', size: 40, color: '#115e59', weight: 500 }),
        { id: newElId(), type: 'rect', x: 90, y: 830, w: 380, h: 96, fill: '#0d9488', radius: 12 },
        text({ x: 90, y: 858, w: 380, h: 60, text: 'Explore now', size: 38, color: '#ffffff', align: 'center', weight: 700 }),
      ],
    }),
  },
  {
    id: 'social-promo-bogo', category: 'Promos', name: 'BOGO Promo (animated)', icon: '🎉', anim: 'slide-left',
    make: () => ({
      w: 1080, h: 1080, background: '#7c3aed',
      elements: [
        { id: newElId(), type: 'ellipse', x: -180, y: 600, w: 700, h: 700, fill: '#a78bfa' },
        text({ x: 80, y: 220, w: 920, h: 300, text: 'BUY 1\nGET 1', size: 170, color: '#ffffff', weight: 900 }),
        text({ x: 80, y: 600, w: 920, h: 90, text: 'FREE', size: 150, color: '#fde047', weight: 900 }),
        text({ x: 80, y: 820, w: 920, h: 70, text: 'On all accessories · this weekend', size: 38, color: '#ede9fe', weight: 500 }),
      ],
    }),
  },
  // ── Quote Post — more, animated ───────────────────────────────────────────
  {
    id: 'social-quote-bold', category: 'Social', name: 'Quote — Bold (animated)', icon: '❞', anim: 'rise',
    make: () => ({
      w: 1080, h: 1080, background: '#2563eb',
      elements: [
        text({ x: 110, y: 180, w: 200, h: 200, text: '“', size: 260, color: '#93c5fd', weight: 900 }),
        text({ x: 130, y: 420, w: 820, h: 320, text: 'Great things\nare done by a\nseries of small\nthings.', size: 84, color: '#ffffff', weight: 800 }),
        { id: newElId(), type: 'rect', x: 130, y: 840, w: 120, h: 8, fill: '#93c5fd' },
        text({ x: 130, y: 880, w: 820, h: 60, text: 'Vincent van Gogh', size: 36, color: '#bfdbfe', weight: 600 }),
      ],
    }),
  },
  {
    id: 'social-quote-serif', category: 'Social', name: 'Quote — Serif', icon: '“',
    make: () => ({
      w: 1080, h: 1080, background: '#faf5ef',
      elements: [
        text({ x: 120, y: 360, w: 840, h: 360, text: 'Simplicity is the\nultimate\nsophistication.', size: 88, color: '#3f3f46', weight: 700, font: 'Georgia, serif', align: 'center' }),
        { id: newElId(), type: 'line', x: 440, y: 760, w: 200, h: 0, stroke: '#a1a1aa', strokeWidth: 3 },
        text({ x: 120, y: 800, w: 840, h: 60, text: 'Leonardo da Vinci', size: 34, color: '#71717a', weight: 500, font: 'Georgia, serif', align: 'center' }),
      ],
    }),
  },
  // ── Coupon — more, animated ───────────────────────────────────────────────
  {
    id: 'coupon-ticket', category: 'Promos', name: 'Coupon — Ticket (animated)', icon: '🎫', anim: 'pop',
    make: () => ({
      w: 1200, h: 630, background: '#fef2f2',
      elements: [
        { id: newElId(), type: 'rect', x: 0, y: 0, w: 760, h: 630, fill: '#dc2626' },
        { id: newElId(), type: 'ellipse', x: 720, y: -40, w: 80, h: 80, fill: '#fef2f2' },
        { id: newElId(), type: 'ellipse', x: 720, y: 590, w: 80, h: 80, fill: '#fef2f2' },
        text({ x: 70, y: 150, w: 620, h: 120, text: '$20 OFF', size: 150, color: '#ffffff', weight: 900 }),
        text({ x: 70, y: 330, w: 620, h: 60, text: 'Orders over $100', size: 38, color: '#fecaca', weight: 500 }),
        text({ x: 70, y: 430, w: 620, h: 60, text: 'Code: SAVE20', size: 46, color: '#ffffff', weight: 800 }),
        text({ x: 820, y: 250, w: 320, h: 140, text: 'SCAN\n& SAVE', size: 60, color: '#dc2626', weight: 900, align: 'center' }),
      ],
    }),
  },
  {
    id: 'coupon-free-ship', category: 'Promos', name: 'Coupon — Free Shipping', icon: '🚚',
    make: () => ({
      w: 1200, h: 630, background: '#0c4a6e',
      elements: [
        { id: newElId(), type: 'rect', x: 50, y: 50, w: 1100, h: 530, fill: 'none', stroke: '#38bdf8', strokeWidth: 4, radius: 24 },
        text({ x: 100, y: 170, w: 1000, h: 120, text: '🚚 FREE SHIPPING', size: 88, color: '#38bdf8', weight: 900 }),
        text({ x: 100, y: 330, w: 1000, h: 60, text: 'No minimum — today only', size: 40, color: '#e0f2fe', weight: 500 }),
        { id: newElId(), type: 'rect', x: 100, y: 420, w: 420, h: 96, fill: '#38bdf8', radius: 12 },
        text({ x: 100, y: 448, w: 420, h: 60, text: 'SHIPFREE', size: 44, color: '#0c4a6e', align: 'center', weight: 800 }),
      ],
    }),
  },
  // ── Invitations — animated + elegant ──────────────────────────────────────
  {
    id: 'invite-birthday', category: 'Celebrations', name: 'Birthday Invite (animated)', icon: '🎂', anim: 'rise',
    make: () => ({
      w: 1080, h: 1350, background: '#fff1f2',
      elements: [
        { id: newElId(), type: 'ellipse', x: 300, y: 120, w: 480, h: 480, fill: '#fecdd3' },
        text({ x: 90, y: 250, w: 900, h: 200, text: '🎂', size: 200, color: '#9f1239', align: 'center' }),
        text({ x: 90, y: 560, w: 900, h: 120, text: "You're Invited!", size: 88, color: '#9f1239', weight: 900, align: 'center' }),
        text({ x: 90, y: 720, w: 900, h: 80, text: "Mia's 7th Birthday", size: 56, color: '#be123c', weight: 700, align: 'center' }),
        { id: newElId(), type: 'line', x: 290, y: 850, w: 500, h: 0, stroke: '#fb7185', strokeWidth: 3 },
        text({ x: 90, y: 900, w: 900, h: 70, text: 'Saturday, June 14 · 3 PM', size: 44, color: '#9f1239', weight: 600, align: 'center' }),
        text({ x: 90, y: 1000, w: 900, h: 70, text: '24 Maple Street, Garden Hall', size: 38, color: '#be123c', weight: 500, align: 'center' }),
        text({ x: 90, y: 1130, w: 900, h: 60, text: 'RSVP: 555-0142', size: 36, color: '#fb7185', weight: 600, align: 'center' }),
      ],
    }),
  },
  {
    id: 'invite-wedding', category: 'Celebrations', name: 'Wedding Invite', icon: '💍',
    make: () => ({
      w: 1080, h: 1350, background: '#1c1917',
      elements: [
        { id: newElId(), type: 'rect', x: 70, y: 70, w: 940, h: 1210, fill: 'none', stroke: '#d6b06a', strokeWidth: 2 },
        text({ x: 90, y: 280, w: 900, h: 60, text: 'TOGETHER WITH THEIR FAMILIES', size: 28, color: '#d6b06a', weight: 500, align: 'center' }),
        text({ x: 90, y: 420, w: 900, h: 220, text: 'Olivia\n& James', size: 130, color: '#fafaf9', weight: 700, align: 'center', font: 'Georgia, serif' }),
        { id: newElId(), type: 'line', x: 390, y: 760, w: 300, h: 0, stroke: '#d6b06a', strokeWidth: 2 },
        text({ x: 90, y: 820, w: 900, h: 70, text: 'request the honour of your presence', size: 32, color: '#e7e5e4', weight: 400, align: 'center', font: 'Georgia, serif' }),
        text({ x: 90, y: 960, w: 900, h: 70, text: 'September 20 · 5 o’clock', size: 44, color: '#d6b06a', weight: 600, align: 'center', font: 'Georgia, serif' }),
        text({ x: 90, y: 1080, w: 900, h: 60, text: 'The Rosewood Estate', size: 34, color: '#fafaf9', weight: 400, align: 'center', font: 'Georgia, serif' }),
      ],
    }),
  },
];

export const studioTemplateById = (id: string): StudioTemplate | undefined => STUDIO_TEMPLATES.find((t) => t.id === id);
