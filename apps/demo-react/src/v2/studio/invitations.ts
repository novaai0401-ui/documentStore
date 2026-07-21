/**
 * Invitation & greeting card templates — a gallery of ready-to-edit designs
 * spanning invitations (birthday, wedding, baby shower, party, save-the-date,
 * dinner, graduation, holiday) and greeting/festival cards (New Year, Christmas,
 * Diwali, Eid, Valentine's, Thank You, Anniversary, Congratulations). Each opens
 * in the design studio to customise, download (PNG/PDF) and share. Every entry is
 * a plain Design built from the model's element types, so it renders through the
 * same SVG pipeline and resizes cleanly. 5×7 in portrait (1500×2100 @ 300dpi) is
 * the standard card geometry.
 */
import { newElId, photoSlot, type Design, type Element, type TextEl } from './model.js';

export interface Invitation { id: string; name: string; emoji: string; category: string; make: () => Design }

const W = 1500, H = 2100; // 5×7" card at 300dpi

const text = (o: Partial<TextEl> & { x: number; y: number; w: number; h: number; text: string }): TextEl => ({
  id: newElId(), type: 'text', size: 48, color: '#0f172a', font: 'Georgia, "Times New Roman", serif', weight: 600, align: 'center', rotation: 0, ...o,
});
const rect = (x: number, y: number, w: number, h: number, fill: string, extra: Partial<Element> = {}): Element => ({ id: newElId(), type: 'rect', x, y, w, h, fill, ...extra } as Element);
const line = (x: number, y: number, w: number, stroke: string, strokeWidth = 3): Element => ({ id: newElId(), type: 'line', x, y, w, h: 0, stroke, strokeWidth } as Element);
const ellipse = (x: number, y: number, w: number, h: number, fill: string, extra: Partial<Element> = {}): Element => ({ id: newElId(), type: 'ellipse', x, y, w, h, fill, ...extra } as Element);
const SANS = 'Inter, system-ui, sans-serif';
const SCRIPT = "'Brush Script MT','Segoe Script','Snell Roundhand',cursive";
const EMO = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

/** A big colour-emoji glyph used as an illustration (renders identically in the
 *  SVG thumbnail and the canvas editor). */
const emoji = (x: number, y: number, size: number, ch: string, rotation = 0, opacity = 1): TextEl =>
  text({ x, y, w: size * 1.4, h: size * 1.4, text: ch, size, font: EMO, rotation, opacity });

/** Deterministic confetti-dot scatter (stable across renders) for playful cards. */
const CONFETTI = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6'];
function dots(n: number, seed: number, colors: string[] = CONFETTI): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < n; i++) {
    const r = (k: number) => { const x = Math.sin((i + seed + k) * 12.9898) * 43758.5453; return x - Math.floor(x); };
    const s = 16 + r(1) * 22;
    out.push(ellipse(30 + r(2) * (W - 90), 30 + r(3) * (H - 90), s, s, colors[i % colors.length]!, { opacity: 0.9 }));
  }
  return out;
}

export const INVITATIONS: Invitation[] = [
  {
    id: 'birthday-confetti', name: 'Birthday Confetti', emoji: '🎂', category: 'Birthday',
    make: () => ({
      w: W, h: H, background: '#fff7ed',
      elements: [
        rect(0, 0, W, 60, '#fb7185'), rect(0, H - 60, W, 60, '#fb7185'),
        ellipse(180, 260, 70, 70, '#fbbf24'), ellipse(1240, 360, 90, 90, '#34d399'), ellipse(300, 1700, 80, 80, '#60a5fa'), ellipse(1180, 1720, 64, 64, '#f472b6'),
        text({ x: 150, y: 360, w: 1200, h: 90, text: "YOU'RE INVITED", size: 56, color: '#fb7185', weight: 800, font: SANS }),
        text({ x: 100, y: 560, w: 1300, h: 320, text: "Ava's\n7th Birthday", size: 150, color: '#9d174d', weight: 900, font: SANS }),
        line(450, 980, 600, '#fbbf24', 4),
        text({ x: 150, y: 1120, w: 1200, h: 80, text: 'Saturday, July 12 · 3:00 PM', size: 58, color: '#7c2d12' }),
        text({ x: 150, y: 1240, w: 1200, h: 80, text: '24 Maple Street, Springfield', size: 52, color: '#7c2d12' }),
        text({ x: 150, y: 1480, w: 1200, h: 70, text: 'Cake, games & lots of fun!', size: 46, color: '#be123c', weight: 600 }),
        text({ x: 150, y: 1640, w: 1200, h: 60, text: 'RSVP: (555) 010-0143', size: 44, color: '#7c2d12' }),
      ],
    }),
  },
  {
    id: 'wedding-elegant', name: 'Elegant Wedding', emoji: '💍', category: 'Wedding',
    make: () => ({
      w: W, h: H, background: '#faf7f2',
      elements: [
        rect(90, 90, W - 180, H - 180, 'none', { stroke: '#b08d57', strokeWidth: 3 }),
        rect(110, 110, W - 220, H - 220, 'none', { stroke: '#d8c3a5', strokeWidth: 1 }),
        text({ x: 200, y: 320, w: 1100, h: 70, text: 'TOGETHER WITH THEIR FAMILIES', size: 36, color: '#b08d57', weight: 500, font: SANS }),
        text({ x: 150, y: 520, w: 1200, h: 160, text: 'Olivia', size: 150, color: '#2c2c2c' }),
        text({ x: 150, y: 700, w: 1200, h: 90, text: '&', size: 90, color: '#b08d57' }),
        text({ x: 150, y: 820, w: 1200, h: 160, text: 'James', size: 150, color: '#2c2c2c' }),
        text({ x: 250, y: 1080, w: 1000, h: 70, text: 'request the pleasure of your company', size: 44, color: '#555' }),
        text({ x: 250, y: 1180, w: 1000, h: 70, text: 'at the celebration of their marriage', size: 44, color: '#555' }),
        line(550, 1340, 400, '#b08d57', 2),
        text({ x: 150, y: 1420, w: 1200, h: 80, text: 'Saturday, the Ninth of September', size: 52, color: '#2c2c2c', weight: 600 }),
        text({ x: 150, y: 1520, w: 1200, h: 70, text: 'Two Thousand Twenty-Six · Four in the Afternoon', size: 40, color: '#555' }),
        text({ x: 150, y: 1660, w: 1200, h: 70, text: 'The Rosewood Garden, Napa Valley', size: 44, color: '#2c2c2c', weight: 600 }),
        text({ x: 150, y: 1820, w: 1200, h: 60, text: 'Reception to follow', size: 38, color: '#b08d57' }),
      ],
    }),
  },
  {
    id: 'baby-shower', name: 'Baby Shower', emoji: '🍼', category: 'Baby',
    make: () => ({
      w: W, h: H, background: '#eef6ff',
      elements: [
        ellipse(-160, -160, 520, 520, '#bfdbfe'), ellipse(1140, 1640, 520, 520, '#fbcfe8'),
        text({ x: 150, y: 360, w: 1200, h: 80, text: 'PLEASE JOIN US FOR A', size: 40, color: '#60a5fa', weight: 700, font: SANS }),
        text({ x: 100, y: 500, w: 1300, h: 220, text: 'Baby Shower', size: 140, color: '#3b82f6', weight: 800, font: SANS }),
        text({ x: 150, y: 800, w: 1200, h: 80, text: 'honoring', size: 48, color: '#64748b' }),
        text({ x: 150, y: 900, w: 1200, h: 110, text: 'Emma Carter', size: 92, color: '#1e3a8a', weight: 700, font: SANS }),
        line(500, 1120, 500, '#93c5fd', 4),
        text({ x: 150, y: 1240, w: 1200, h: 80, text: 'Sunday, August 18 · 12:00 PM', size: 56, color: '#334155' }),
        text({ x: 150, y: 1360, w: 1200, h: 80, text: '88 Garden Lane, Riverside', size: 50, color: '#334155' }),
        text({ x: 150, y: 1560, w: 1200, h: 70, text: 'Registry at babylist.com/emma', size: 44, color: '#3b82f6', weight: 600 }),
        text({ x: 150, y: 1700, w: 1200, h: 60, text: 'RSVP by August 1 · (555) 010-2255', size: 42, color: '#64748b' }),
      ],
    }),
  },
  {
    id: 'party-neon', name: 'Neon Party', emoji: '🎉', category: 'Party',
    make: () => ({
      w: W, h: H, background: '#0b1020',
      elements: [
        rect(0, 0, W, H, 'none', { stroke: '#a855f7', strokeWidth: 6, radius: 0 }),
        text({ x: 100, y: 320, w: 1300, h: 90, text: "LET'S PARTY", size: 70, color: '#f0abfc', weight: 900, font: SANS }),
        text({ x: 80, y: 520, w: 1340, h: 360, text: 'SUMMER\nBASH', size: 190, color: '#22d3ee', weight: 900, font: SANS }),
        line(350, 1020, 800, '#a855f7', 5),
        text({ x: 100, y: 1140, w: 1300, h: 90, text: 'FRIDAY · 9 PM TILL LATE', size: 64, color: '#fde047', weight: 800, font: SANS }),
        text({ x: 100, y: 1300, w: 1300, h: 80, text: 'Rooftop 22, City Center', size: 54, color: '#e2e8f0', font: SANS }),
        rect(450, 1520, 600, 130, '#a855f7', { radius: 65 }),
        text({ x: 450, y: 1556, w: 600, h: 70, text: 'RSVP @pyntra', size: 52, color: '#ffffff', weight: 800, font: SANS }),
        text({ x: 100, y: 1760, w: 1300, h: 60, text: 'Dress code: neon & glow', size: 44, color: '#67e8f9', font: SANS }),
      ],
    }),
  },
  {
    id: 'save-the-date', name: 'Save the Date', emoji: '📅', category: 'Wedding',
    make: () => ({
      w: W, h: H, background: '#1f2d3d',
      elements: [
        rect(0, 0, W, 760, '#27384c'),
        text({ x: 150, y: 240, w: 1200, h: 90, text: 'SAVE THE DATE', size: 76, color: '#e9c46a', weight: 800, font: SANS }),
        text({ x: 150, y: 430, w: 1200, h: 120, text: 'Mia & Noah', size: 110, color: '#ffffff', weight: 300 }),
        text({ x: 150, y: 900, w: 1200, h: 300, text: '10\n09\n2026', size: 150, color: '#e9c46a', weight: 800, font: SANS }),
        line(550, 1480, 400, '#e9c46a', 2),
        text({ x: 150, y: 1560, w: 1200, h: 80, text: 'Lake Como, Italy', size: 60, color: '#ffffff', weight: 500 }),
        text({ x: 150, y: 1720, w: 1200, h: 70, text: 'Formal invitation to follow', size: 42, color: '#cbd5e1' }),
      ],
    }),
  },
  {
    id: 'dinner-party', name: 'Dinner Party', emoji: '🍽️', category: 'Party',
    make: () => ({
      w: W, h: H, background: '#fdf6ec',
      elements: [
        line(250, 300, 1000, '#7f1d1d', 2), line(250, 320, 1000, '#7f1d1d', 2),
        text({ x: 150, y: 420, w: 1200, h: 90, text: 'YOU ARE INVITED TO', size: 42, color: '#9a3412', weight: 600, font: SANS }),
        text({ x: 100, y: 560, w: 1300, h: 200, text: 'Dinner\n& Drinks', size: 140, color: '#7f1d1d' }),
        text({ x: 150, y: 980, w: 1200, h: 80, text: 'at the home of the Bennetts', size: 50, color: '#57534e' }),
        line(550, 1140, 400, '#b45309', 2),
        text({ x: 150, y: 1240, w: 1200, h: 80, text: 'Friday, October 3 · 7:30 PM', size: 56, color: '#1c1917', weight: 600 }),
        text({ x: 150, y: 1360, w: 1200, h: 80, text: '14 Willow Court', size: 50, color: '#57534e' }),
        text({ x: 150, y: 1620, w: 1200, h: 70, text: 'Kindly reply by September 26', size: 44, color: '#9a3412' }),
      ],
    }),
  },
  {
    id: 'graduation', name: 'Graduation', emoji: '🎓', category: 'Celebration',
    make: () => ({
      w: W, h: H, background: '#0f2440',
      elements: [
        rect(0, 0, W, 70, '#d4af37'), rect(0, H - 70, W, 70, '#d4af37'),
        text({ x: 150, y: 340, w: 1200, h: 80, text: 'CLASS OF 2026', size: 60, color: '#d4af37', weight: 800, font: SANS }),
        text({ x: 100, y: 520, w: 1300, h: 220, text: 'Graduation\nCelebration', size: 120, color: '#ffffff', weight: 800, font: SANS }),
        text({ x: 150, y: 880, w: 1200, h: 100, text: 'in honor of', size: 48, color: '#94a3b8' }),
        text({ x: 150, y: 990, w: 1200, h: 120, text: 'Daniel Reyes', size: 100, color: '#d4af37', weight: 700, font: SANS }),
        line(500, 1240, 500, '#d4af37', 3),
        text({ x: 150, y: 1340, w: 1200, h: 80, text: 'Saturday, June 13 · 5 PM', size: 56, color: '#e2e8f0' }),
        text({ x: 150, y: 1460, w: 1200, h: 80, text: 'The Riverside Pavilion', size: 50, color: '#cbd5e1' }),
        text({ x: 150, y: 1680, w: 1200, h: 60, text: 'RSVP: daniel.grad@pyntra.app', size: 42, color: '#d4af37' }),
      ],
    }),
  },
  {
    id: 'holiday', name: 'Holiday Party', emoji: '❄️', category: 'Holiday',
    make: () => ({
      w: W, h: H, background: '#0b3d2e',
      elements: [
        ellipse(200, 240, 26, 26, '#ffffff'), ellipse(1260, 320, 20, 20, '#ffffff'), ellipse(400, 1760, 22, 22, '#ffffff'), ellipse(1120, 1680, 28, 28, '#ffffff'), ellipse(760, 200, 18, 18, '#ffffff'),
        text({ x: 150, y: 360, w: 1200, h: 90, text: 'PLEASE JOIN US', size: 48, color: '#f0d58c', weight: 700, font: SANS }),
        text({ x: 100, y: 520, w: 1300, h: 320, text: 'Holiday\nCelebration', size: 140, color: '#ffffff', weight: 800, font: SANS }),
        line(450, 1020, 600, '#c0392b', 5),
        text({ x: 150, y: 1140, w: 1200, h: 80, text: 'Saturday, December 20 · 7 PM', size: 56, color: '#f0d58c', weight: 600 }),
        text({ x: 150, y: 1260, w: 1200, h: 80, text: '5 Evergreen Terrace', size: 50, color: '#d1fae5' }),
        text({ x: 150, y: 1480, w: 1200, h: 70, text: 'Food, music & good cheer 🎄', size: 46, color: '#ffffff' }),
        text({ x: 150, y: 1640, w: 1200, h: 60, text: 'RSVP by December 10', size: 44, color: '#f0d58c' }),
      ],
    }),
  },

  // ── More weddings ─────────────────────────────────────────────────────────
  {
    id: 'wedding-floral', name: 'Floral Wedding', emoji: '🌸', category: 'Wedding',
    make: () => ({
      w: W, h: H, background: '#fbf6f4',
      elements: [
        ellipse(-180, -180, 460, 460, '#f6d4d8'), ellipse(1220, -160, 420, 420, '#e7d8ef'),
        ellipse(-160, 1760, 440, 440, '#e7d8ef'), ellipse(1240, 1800, 420, 420, '#f6d4d8'),
        text({ x: 200, y: 420, w: 1100, h: 70, text: 'THE WEDDING OF', size: 38, color: '#b06a82', weight: 600, font: SANS }),
        text({ x: 150, y: 560, w: 1200, h: 150, text: 'Sophia', size: 140, color: '#3f2a32' }),
        text({ x: 150, y: 730, w: 1200, h: 80, text: 'and', size: 64, color: '#b06a82' }),
        text({ x: 150, y: 840, w: 1200, h: 150, text: 'Liam', size: 140, color: '#3f2a32' }),
        line(560, 1100, 380, '#cf9aa9', 2),
        text({ x: 150, y: 1180, w: 1200, h: 80, text: 'Saturday · June 21, 2026 · 4 PM', size: 52, color: '#3f2a32', weight: 600 }),
        text({ x: 150, y: 1310, w: 1200, h: 70, text: 'The Botanical Garden', size: 48, color: '#6b5560' }),
        text({ x: 150, y: 1560, w: 1200, h: 60, text: 'Reception & dinner to follow', size: 40, color: '#b06a82' }),
      ],
    }),
  },
  {
    id: 'wedding-minimal', name: 'Modern Minimal Wedding', emoji: '🤍', category: 'Wedding',
    make: () => ({
      w: W, h: H, background: '#ffffff',
      elements: [
        rect(0, 0, W, 18, '#1f2937'), rect(0, H - 18, W, 18, '#1f2937'),
        text({ x: 200, y: 460, w: 1100, h: 70, text: 'SAVE OUR DATE', size: 40, color: '#9ca3af', weight: 600, font: SANS }),
        text({ x: 150, y: 640, w: 1200, h: 160, text: 'AVA & ETHAN', size: 110, color: '#111827', weight: 300, font: SANS }),
        line(600, 920, 300, '#111827', 2),
        text({ x: 150, y: 1040, w: 1200, h: 120, text: '08 · 15 · 26', size: 120, color: '#111827', weight: 700, font: SANS }),
        text({ x: 150, y: 1340, w: 1200, h: 70, text: 'PORTLAND, OREGON', size: 44, color: '#6b7280', weight: 500, font: SANS }),
        text({ x: 150, y: 1560, w: 1200, h: 60, text: 'Formal invitation to follow', size: 38, color: '#9ca3af', font: SANS }),
      ],
    }),
  },

  // ── More birthdays ────────────────────────────────────────────────────────
  {
    id: 'birthday-kids', name: 'Kids Balloons', emoji: '🎈', category: 'Birthday',
    make: () => ({
      w: W, h: H, background: '#eaf7ff',
      elements: [
        ellipse(180, 220, 150, 190, '#ff6b6b'), ellipse(620, 150, 150, 190, '#ffd166'), ellipse(1060, 230, 150, 190, '#06d6a0'),
        line(255, 410, 0, '#94a3b8', 3), line(695, 340, 0, '#94a3b8', 3),
        text({ x: 100, y: 620, w: 1300, h: 90, text: "IT'S A PARTY!", size: 60, color: '#ef476f', weight: 800, font: SANS }),
        text({ x: 100, y: 760, w: 1300, h: 260, text: 'Leo turns 5!', size: 150, color: '#118ab2', weight: 900, font: SANS }),
        text({ x: 150, y: 1160, w: 1200, h: 80, text: 'Sunday, May 4 · 11 AM', size: 56, color: '#073b4c' }),
        text({ x: 150, y: 1280, w: 1200, h: 80, text: 'Sunnyside Play Park', size: 50, color: '#073b4c' }),
        rect(450, 1500, 600, 120, '#ef476f', { radius: 60 }),
        text({ x: 450, y: 1532, w: 600, h: 60, text: 'RSVP (555) 010-7788', size: 40, color: '#ffffff', weight: 700, font: SANS }),
      ],
    }),
  },
  {
    id: 'birthday-milestone', name: 'Milestone Gold', emoji: '🥂', category: 'Birthday',
    make: () => ({
      w: W, h: H, background: '#141414',
      elements: [
        rect(80, 80, W - 160, H - 160, 'none', { stroke: '#d4af37', strokeWidth: 3 }),
        text({ x: 150, y: 360, w: 1200, h: 80, text: "YOU'RE INVITED TO CELEBRATE", size: 38, color: '#d4af37', weight: 600, font: SANS }),
        text({ x: 100, y: 560, w: 1300, h: 320, text: '30', size: 360, color: '#d4af37', weight: 900, font: SANS }),
        text({ x: 150, y: 1000, w: 1200, h: 100, text: 'Olivia’s 30th Birthday', size: 76, color: '#ffffff', weight: 600, font: SANS }),
        line(560, 1200, 380, '#d4af37', 2),
        text({ x: 150, y: 1300, w: 1200, h: 80, text: 'Saturday, March 8 · 8 PM', size: 52, color: '#e5e5e5' }),
        text({ x: 150, y: 1420, w: 1200, h: 80, text: 'The Skyline Lounge', size: 48, color: '#bdbdbd' }),
        text({ x: 150, y: 1640, w: 1200, h: 60, text: 'Cocktail attire · RSVP by Feb 25', size: 40, color: '#d4af37' }),
      ],
    }),
  },

  // ── Festival & greeting cards ─────────────────────────────────────────────
  {
    id: 'new-year', name: 'Happy New Year', emoji: '🎆', category: 'Festival',
    make: () => ({
      w: W, h: H, background: '#0a0e2a',
      elements: [
        ellipse(220, 300, 12, 12, '#ffd700'), ellipse(1280, 360, 16, 16, '#ffd700'), ellipse(400, 1760, 14, 14, '#ffd700'), ellipse(1120, 1700, 10, 10, '#ffd700'), ellipse(760, 240, 12, 12, '#fff'),
        text({ x: 100, y: 520, w: 1300, h: 90, text: 'CHEERS TO', size: 56, color: '#ffd700', weight: 700, font: SANS }),
        text({ x: 60, y: 680, w: 1380, h: 360, text: '2027', size: 360, color: '#ffffff', weight: 900, font: SANS }),
        text({ x: 100, y: 1120, w: 1300, h: 110, text: 'HAPPY NEW YEAR', size: 92, color: '#ffd700', weight: 800, font: SANS }),
        line(450, 1320, 600, '#c9a227', 3),
        text({ x: 150, y: 1420, w: 1200, h: 80, text: 'Wishing you joy, health & success', size: 46, color: '#e2e8f0' }),
        text({ x: 150, y: 1560, w: 1200, h: 70, text: 'in the year ahead.', size: 46, color: '#e2e8f0' }),
      ],
    }),
  },
  {
    id: 'christmas', name: 'Merry Christmas', emoji: '🎄', category: 'Festival',
    make: () => ({
      w: W, h: H, background: '#0e3b2e',
      elements: [
        ellipse(180, 260, 22, 22, '#fff'), ellipse(1260, 340, 18, 18, '#fff'), ellipse(360, 1740, 20, 20, '#fff'), ellipse(1180, 1700, 16, 16, '#fff'),
        text({ x: 100, y: 480, w: 1300, h: 120, text: 'Merry', size: 150, color: '#f4d35e', font: 'Georgia, serif' }),
        text({ x: 100, y: 660, w: 1300, h: 180, text: 'Christmas', size: 150, color: '#ffffff', font: 'Georgia, serif' }),
        rect(690, 900, 120, 220, '#9c3d2e'), ellipse(640, 860, 220, 120, '#1e6b4f'), ellipse(660, 940, 180, 110, '#1e6b4f'),
        line(450, 1320, 600, '#c0392b', 5),
        text({ x: 150, y: 1420, w: 1200, h: 80, text: 'Wishing you peace, love & joy', size: 50, color: '#f4d35e' }),
        text({ x: 150, y: 1560, w: 1200, h: 70, text: 'this holiday season', size: 46, color: '#dff3ea' }),
      ],
    }),
  },
  {
    id: 'diwali', name: 'Happy Diwali', emoji: '🪔', category: 'Festival',
    make: () => ({
      w: W, h: H, background: '#2a0f3a',
      elements: [
        ellipse(-160, -160, 460, 460, '#7b2d8e'), ellipse(1220, 1800, 460, 460, '#7b2d8e'),
        ellipse(640, 250, 220, 220, '#ffb703'), ellipse(690, 250, 120, 120, '#2a0f3a'),
        text({ x: 100, y: 560, w: 1300, h: 110, text: 'HAPPY', size: 92, color: '#ffd166', weight: 700, font: SANS }),
        text({ x: 60, y: 700, w: 1380, h: 260, text: 'Diwali', size: 200, color: '#ffffff', font: 'Georgia, serif' }),
        rect(620, 1080, 70, 90, '#ff8c00'), ellipse(615, 1040, 80, 60, '#ffd700'),
        line(450, 1280, 600, '#ffb703', 3),
        text({ x: 150, y: 1380, w: 1200, h: 80, text: 'May the festival of lights', size: 50, color: '#ffe8a3' }),
        text({ x: 150, y: 1500, w: 1200, h: 80, text: 'brighten your life with joy', size: 50, color: '#ffe8a3' }),
        text({ x: 150, y: 1660, w: 1200, h: 70, text: '& prosperity ✨', size: 46, color: '#ffd166' }),
      ],
    }),
  },
  {
    id: 'eid', name: 'Eid Mubarak', emoji: '🌙', category: 'Festival',
    make: () => ({
      w: W, h: H, background: '#0b3d4f',
      elements: [
        ellipse(560, 280, 240, 240, '#e9c46a'), ellipse(660, 280, 220, 220, '#0b3d4f'),
        ellipse(900, 320, 14, 14, '#e9c46a'), ellipse(980, 400, 10, 10, '#e9c46a'),
        text({ x: 100, y: 660, w: 1300, h: 260, text: 'Eid', size: 220, color: '#ffffff', font: 'Georgia, serif' }),
        text({ x: 100, y: 940, w: 1300, h: 140, text: 'Mubarak', size: 130, color: '#e9c46a', font: 'Georgia, serif' }),
        line(450, 1260, 600, '#e9c46a', 3),
        text({ x: 150, y: 1360, w: 1200, h: 80, text: 'May this blessed day bring you', size: 48, color: '#d9ecf2' }),
        text({ x: 150, y: 1480, w: 1200, h: 80, text: 'peace, happiness & prosperity', size: 48, color: '#d9ecf2' }),
      ],
    }),
  },
  {
    id: 'valentine', name: "Valentine's Day", emoji: '❤️', category: 'Greeting',
    make: () => ({
      w: W, h: H, background: '#fff0f3',
      elements: [
        ellipse(120, 200, 90, 90, '#ffb3c1'), ellipse(1290, 320, 70, 70, '#ff8fa3'), ellipse(260, 1740, 80, 80, '#ff8fa3'), ellipse(1240, 1680, 60, 60, '#ffb3c1'),
        text({ x: 100, y: 560, w: 1300, h: 200, text: '♥', size: 240, color: '#e5383b', align: 'center' }),
        text({ x: 100, y: 920, w: 1300, h: 110, text: 'Happy', size: 96, color: '#a4133c', font: 'Georgia, serif' }),
        text({ x: 100, y: 1050, w: 1300, h: 150, text: "Valentine's Day", size: 110, color: '#c9184a', font: 'Georgia, serif' }),
        text({ x: 200, y: 1380, w: 1100, h: 80, text: 'To the one who has my heart —', size: 48, color: '#a4133c' }),
        text({ x: 200, y: 1500, w: 1100, h: 80, text: 'today and always.', size: 48, color: '#a4133c' }),
      ],
    }),
  },
  {
    id: 'thank-you', name: 'Thank You', emoji: '💐', category: 'Greeting',
    make: () => ({
      w: W, h: H, background: '#f4f1ea',
      elements: [
        line(300, 320, 900, '#9c8b6b', 2),
        text({ x: 100, y: 700, w: 1300, h: 220, text: 'Thank', size: 190, color: '#3f3a2f', font: 'Georgia, serif' }),
        text({ x: 100, y: 920, w: 1300, h: 220, text: 'You', size: 190, color: '#9c8b6b', font: 'Georgia, serif' }),
        line(300, 1320, 900, '#9c8b6b', 2),
        text({ x: 200, y: 1420, w: 1100, h: 80, text: 'Your kindness means the world.', size: 50, color: '#5b5443' }),
        text({ x: 200, y: 1540, w: 1100, h: 70, text: 'With heartfelt gratitude.', size: 46, color: '#7a715a' }),
      ],
    }),
  },
  {
    id: 'anniversary', name: 'Happy Anniversary', emoji: '💞', category: 'Greeting',
    make: () => ({
      w: W, h: H, background: '#2b1b2e',
      elements: [
        rect(90, 90, W - 180, H - 180, 'none', { stroke: '#d6a4c4', strokeWidth: 2 }),
        text({ x: 150, y: 460, w: 1200, h: 80, text: 'CELEBRATING', size: 40, color: '#d6a4c4', weight: 600, font: SANS }),
        text({ x: 100, y: 620, w: 1300, h: 260, text: 'Happy', size: 150, color: '#ffffff', font: 'Georgia, serif' }),
        text({ x: 100, y: 820, w: 1300, h: 200, text: 'Anniversary', size: 130, color: '#f0c5dd', font: 'Georgia, serif' }),
        text({ x: 150, y: 1120, w: 1200, h: 140, text: '25', size: 150, color: '#d6a4c4', weight: 800, font: SANS }),
        text({ x: 150, y: 1320, w: 1200, h: 80, text: 'years of love & laughter', size: 50, color: '#ead7e6' }),
        text({ x: 150, y: 1520, w: 1200, h: 70, text: "Here's to many more — Mark & Anna", size: 42, color: '#d6a4c4' }),
      ],
    }),
  },
  {
    id: 'congrats', name: 'Congratulations', emoji: '🎊', category: 'Greeting',
    make: () => ({
      w: W, h: H, background: '#0f766e',
      elements: [
        ellipse(180, 240, 60, 60, '#fde047'), ellipse(1240, 320, 80, 80, '#f9a8d4'), ellipse(320, 1720, 70, 70, '#fca5a5'), ellipse(1180, 1700, 60, 60, '#fde047'),
        text({ x: 80, y: 700, w: 1340, h: 360, text: 'Congrats!', size: 170, color: '#ffffff', weight: 900, font: SANS }),
        line(450, 1140, 600, '#fde047', 5),
        text({ x: 150, y: 1260, w: 1200, h: 80, text: 'So proud of all you’ve achieved.', size: 54, color: '#ccfbf1' }),
        text({ x: 150, y: 1420, w: 1200, h: 80, text: "Here's to your next big adventure!", size: 50, color: '#99f6e4' }),
      ],
    }),
  },

  // ── Trending designs (2026) ───────────────────────────────────────────────
  {
    id: 'wedding-boho-arch', name: 'Boho Arch Wedding', emoji: '🏜️', category: 'Wedding',
    make: () => ({
      w: W, h: H, background: '#f3ece3',
      elements: [
        ellipse(250, 200, 1000, 1400, '#e6d5c3'), ellipse(300, 250, 900, 1300, '#f3ece3'),
        text({ x: 250, y: 420, w: 1000, h: 60, text: 'THE WEDDING OF', size: 34, color: '#a3714f', weight: 600, font: SANS }),
        text({ x: 150, y: 560, w: 1200, h: 150, text: 'Maya', size: 140, color: '#6b4226', font: 'Georgia, serif' }),
        text({ x: 150, y: 720, w: 1200, h: 90, text: 'and', size: 64, color: '#a3714f', font: 'Georgia, serif' }),
        text({ x: 150, y: 830, w: 1200, h: 150, text: 'Kabir', size: 140, color: '#6b4226', font: 'Georgia, serif' }),
        line(560, 1080, 380, '#c99a6a', 2),
        text({ x: 200, y: 1160, w: 1100, h: 70, text: 'Saturday · 12 December 2026 · 5 PM', size: 46, color: '#6b4226' }),
        text({ x: 200, y: 1270, w: 1100, h: 70, text: 'Sunset Vineyard, Nashik', size: 44, color: '#8a5a38' }),
        text({ x: 250, y: 1440, w: 1000, h: 60, text: '🌿 Dinner & dancing to follow 🌿', size: 40, color: '#a3714f' }),
      ],
    }),
  },
  {
    id: 'haldi-mehndi', name: 'Haldi / Mehndi', emoji: '🌼', category: 'Wedding',
    make: () => ({
      w: W, h: H, background: '#fff8e1',
      elements: [
        rect(0, 0, W, 220, '#f6a609'), rect(0, H - 220, W, 220, '#3f8f29'),
        ellipse(120, 300, 120, 120, '#f6a609'), ellipse(1260, 360, 100, 100, '#3f8f29'), ellipse(200, 1640, 110, 110, '#3f8f29'), ellipse(1200, 1600, 120, 120, '#f6a609'),
        text({ x: 150, y: 420, w: 1200, h: 80, text: '🌼 HALDI CEREMONY 🌼', size: 52, color: '#b45309', weight: 800, font: SANS }),
        text({ x: 100, y: 640, w: 1300, h: 300, text: 'Priya', size: 200, color: '#3f8f29', weight: 900, font: 'Georgia, serif' }),
        text({ x: 150, y: 980, w: 1200, h: 80, text: 'ki Haldi', size: 70, color: '#b45309', font: 'Georgia, serif' }),
        line(500, 1160, 500, '#f6a609', 5),
        text({ x: 150, y: 1240, w: 1200, h: 80, text: 'Friday, 10 April 2026 · 11 AM', size: 52, color: '#3f6212' }),
        text({ x: 150, y: 1360, w: 1200, h: 80, text: 'Come dressed in yellow & green!', size: 46, color: '#b45309', weight: 600 }),
      ],
    }),
  },
  {
    id: 'sangeet-night', name: 'Sangeet Night', emoji: '🎶', category: 'Wedding',
    make: () => ({
      w: W, h: H, background: '#2a0a4a',
      elements: [
        ellipse(-160, -160, 520, 520, '#7c3aed'), ellipse(1140, 1640, 520, 520, '#db2777'),
        text({ x: 150, y: 420, w: 1200, h: 80, text: '✨ IT’S A SANGEET ✨', size: 50, color: '#fcd34d', weight: 800, font: SANS }),
        text({ x: 100, y: 620, w: 1300, h: 280, text: 'Naach\n& Masti', size: 150, color: '#ffffff', weight: 900, font: SANS }),
        text({ x: 150, y: 1020, w: 1200, h: 80, text: '🎶 Dance · Dhol · Dinner 🎶', size: 54, color: '#f9a8d4' }),
        line(500, 1200, 500, '#fcd34d', 4),
        text({ x: 150, y: 1280, w: 1200, h: 80, text: 'Thursday, 9 April 2026 · 7 PM', size: 50, color: '#e9d5ff' }),
        text({ x: 150, y: 1400, w: 1200, h: 80, text: 'The Grand Ballroom, Jaipur', size: 46, color: '#c4b5fd' }),
      ],
    }),
  },
  {
    id: 'first-birthday', name: 'First Birthday', emoji: '1️⃣', category: 'Birthday',
    make: () => ({
      w: W, h: H, background: '#fff1f5',
      elements: [
        ellipse(180, 260, 90, 90, '#fbcfe8'), ellipse(1230, 340, 110, 110, '#bae6fd'), ellipse(300, 1700, 80, 80, '#fde68a'), ellipse(1180, 1690, 90, 90, '#c7d2fe'),
        text({ x: 150, y: 380, w: 1200, h: 80, text: 'OUR LITTLE ONE TURNS', size: 46, color: '#db2777', weight: 700, font: SANS }),
        text({ x: 150, y: 520, w: 1200, h: 420, text: 'ONE', size: 360, color: '#f472b6', weight: 900, font: SANS }),
        text({ x: 150, y: 1020, w: 1200, h: 120, text: 'Aarav’s 1st Birthday', size: 84, color: '#9d174d', font: 'Georgia, serif' }),
        line(500, 1240, 500, '#f9a8d4', 4),
        text({ x: 150, y: 1320, w: 1200, h: 80, text: 'Sunday, 3 May 2026 · 4 PM', size: 50, color: '#be185d' }),
        text({ x: 150, y: 1440, w: 1200, h: 80, text: 'Cake smash & fun — join us!', size: 46, color: '#db2777', weight: 600 }),
      ],
    }),
  },
  {
    id: 'gender-reveal', name: 'Gender Reveal', emoji: '🎈', category: 'Baby',
    make: () => ({
      w: W, h: H, background: '#faf5ff',
      elements: [
        rect(0, 0, W / 2, H, '#f9a8d4'), rect(W / 2, 0, W / 2, H, '#93c5fd'),
        rect(150, 700, W - 300, 700, '#ffffff', { radius: 40 }),
        text({ x: 200, y: 820, w: 1100, h: 90, text: 'HE or SHE?', size: 80, color: '#334155', weight: 900, font: SANS }),
        text({ x: 200, y: 960, w: 1100, h: 80, text: 'Come find out!', size: 58, color: '#64748b' }),
        line(560, 1080, 380, '#c084fc', 4),
        text({ x: 200, y: 1140, w: 1100, h: 70, text: 'Saturday, 20 June 2026 · 3 PM', size: 46, color: '#334155' }),
        text({ x: 200, y: 1250, w: 1100, h: 70, text: 'Vote pink 💗 or blue 💙 on arrival', size: 42, color: '#64748b' }),
      ],
    }),
  },
  {
    id: 'griha-pravesh', name: 'Housewarming (Griha Pravesh)', emoji: '🏡', category: 'Celebration',
    make: () => ({
      w: W, h: H, background: '#fff7ed',
      elements: [
        rect(90, 90, W - 180, H - 180, 'none', { stroke: '#c2410c', strokeWidth: 3 }),
        ellipse(660, 300, 180, 180, '#fed7aa'),
        text({ x: 150, y: 340, w: 1200, h: 120, text: '🏡', size: 120, color: '#c2410c', font: SANS }),
        text({ x: 150, y: 540, w: 1200, h: 80, text: 'GRIHA PRAVESH', size: 56, color: '#c2410c', weight: 800, font: SANS }),
        text({ x: 100, y: 700, w: 1300, h: 200, text: 'Our New Home', size: 130, color: '#7c2d12', font: 'Georgia, serif' }),
        text({ x: 150, y: 980, w: 1200, h: 80, text: 'With gratitude, we invite you to bless', size: 46, color: '#9a3412' }),
        text({ x: 150, y: 1070, w: 1200, h: 80, text: 'our new beginning 🪔', size: 46, color: '#9a3412' }),
        line(500, 1260, 500, '#f59e0b', 4),
        text({ x: 150, y: 1340, w: 1200, h: 80, text: 'Sunday, 15 March 2026 · 10 AM', size: 50, color: '#7c2d12', weight: 600 }),
        text({ x: 150, y: 1460, w: 1200, h: 80, text: 'Lunch to follow', size: 44, color: '#c2410c' }),
      ],
    }),
  },
  {
    id: 'retro-y2k', name: 'Retro Y2K Party', emoji: '🕺', category: 'Party',
    make: () => ({
      w: W, h: H, background: '#0a0a0a',
      elements: [
        rect(0, 0, W, H, '#0a0a0a'),
        ellipse(120, 200, 300, 300, '#ec4899'), ellipse(1080, 1600, 340, 340, '#22d3ee'), ellipse(1150, 250, 180, 180, '#a3e635'),
        text({ x: 100, y: 560, w: 1300, h: 300, text: "Let's\nParty!", size: 200, color: '#22d3ee', weight: 900, font: SANS }),
        text({ x: 150, y: 1080, w: 1200, h: 90, text: '✦ Y2K THROWBACK NIGHT ✦', size: 56, color: '#ec4899', weight: 800, font: SANS }),
        line(500, 1240, 500, '#a3e635', 5),
        text({ x: 150, y: 1320, w: 1200, h: 80, text: 'Saturday · 9 PM till late', size: 52, color: '#f0abfc' }),
        text({ x: 150, y: 1440, w: 1200, h: 80, text: 'Neon Lounge · Dress: bold & shiny', size: 46, color: '#67e8f9' }),
      ],
    }),
  },
  {
    id: 'bridal-shower', name: 'Bridal Shower', emoji: '👰', category: 'Party',
    make: () => ({
      w: W, h: H, background: '#fdf2f8',
      elements: [
        ellipse(-140, -140, 480, 480, '#fbcfe8'), ellipse(1160, 1660, 480, 480, '#f5d0fe'),
        text({ x: 150, y: 420, w: 1200, h: 70, text: 'SHE SAID YES! LET’S CELEBRATE', size: 40, color: '#be185d', weight: 700, font: SANS }),
        text({ x: 100, y: 600, w: 1300, h: 260, text: 'Bridal\nShower', size: 150, color: '#9d174d', font: 'Georgia, serif' }),
        text({ x: 150, y: 980, w: 1200, h: 80, text: 'in honour of Ananya', size: 60, color: '#db2777', font: "'Segoe Script', cursive" }),
        line(500, 1180, 500, '#f472b6', 3),
        text({ x: 150, y: 1260, w: 1200, h: 80, text: 'Sunday, 24 May 2026 · 12 PM', size: 50, color: '#9d174d' }),
        text({ x: 150, y: 1380, w: 1200, h: 80, text: 'Brunch, games & gifts 💐', size: 46, color: '#be185d' }),
      ],
    }),
  },
  {
    id: 'naming-ceremony', name: 'Naming Ceremony', emoji: '👶', category: 'Baby',
    make: () => ({
      w: W, h: H, background: '#f0fdfa',
      elements: [
        rect(0, 0, W, 160, '#5eead4'), rect(0, H - 160, W, 160, '#5eead4'),
        ellipse(660, 300, 200, 200, '#ccfbf1'),
        text({ x: 150, y: 360, w: 1200, h: 120, text: '👶', size: 120, color: '#0f766e', font: SANS }),
        text({ x: 150, y: 560, w: 1200, h: 70, text: 'NAAMKARAN CEREMONY', size: 48, color: '#0f766e', weight: 800, font: SANS }),
        text({ x: 150, y: 700, w: 1200, h: 90, text: 'We are naming our little blessing', size: 50, color: '#134e4a' }),
        text({ x: 100, y: 860, w: 1300, h: 200, text: 'Baby Vihaan', size: 130, color: '#0d9488', font: 'Georgia, serif' }),
        line(500, 1120, 500, '#2dd4bf', 4),
        text({ x: 150, y: 1200, w: 1200, h: 80, text: 'Saturday, 6 June 2026 · 11 AM', size: 50, color: '#134e4a', weight: 600 }),
        text({ x: 150, y: 1320, w: 1200, h: 80, text: 'Seek your blessings & love', size: 44, color: '#0f766e' }),
      ],
    }),
  },
  {
    id: 'engagement-ring', name: 'Engagement', emoji: '💍', category: 'Wedding',
    make: () => ({
      w: W, h: H, background: '#fffdf5',
      elements: [
        rect(80, 80, W - 160, H - 160, 'none', { stroke: '#c9a34e', strokeWidth: 3 }),
        rect(104, 104, W - 208, H - 208, 'none', { stroke: '#e6d3a3', strokeWidth: 1 }),
        text({ x: 150, y: 380, w: 1200, h: 120, text: '💍', size: 120, color: '#c9a34e', font: SANS }),
        text({ x: 150, y: 560, w: 1200, h: 70, text: 'WE’RE ENGAGED', size: 50, color: '#a08339', weight: 700, font: SANS }),
        text({ x: 150, y: 700, w: 1200, h: 150, text: 'Ishaan', size: 130, color: '#7c5c1e', font: 'Georgia, serif' }),
        text({ x: 150, y: 860, w: 1200, h: 80, text: '&', size: 70, color: '#c9a34e', font: 'Georgia, serif' }),
        text({ x: 150, y: 960, w: 1200, h: 150, text: 'Sara', size: 130, color: '#7c5c1e', font: 'Georgia, serif' }),
        line(560, 1220, 380, '#c9a34e', 2),
        text({ x: 150, y: 1300, w: 1200, h: 80, text: 'Join us for the ring ceremony', size: 48, color: '#8a6d2f' }),
        text({ x: 150, y: 1410, w: 1200, h: 80, text: 'Saturday, 18 July 2026 · 6 PM', size: 48, color: '#7c5c1e', weight: 600 }),
      ],
    }),
  },
  {
    id: 'webinar-modern', name: 'Webinar / Event', emoji: '💻', category: 'Corporate',
    make: () => ({
      w: W, h: H, background: '#0b1120',
      elements: [
        rect(0, 0, W, 12, '#6366f1'), ellipse(1080, 220, 360, 360, '#312e81'), ellipse(200, 1700, 320, 320, '#1e3a8a'),
        text({ x: 150, y: 360, w: 1200, h: 70, text: 'FREE LIVE WEBINAR', size: 48, color: '#818cf8', weight: 800, font: SANS }),
        text({ x: 100, y: 520, w: 1300, h: 360, text: 'Grow Your\nBrand in 2026', size: 130, color: '#ffffff', weight: 900, font: SANS }),
        line(150, 980, 500, '#6366f1', 5),
        text({ x: 150, y: 1060, w: 1200, h: 80, text: '🗓  Thursday, 30 April · 6:00 PM IST', size: 52, color: '#c7d2fe' }),
        text({ x: 150, y: 1180, w: 1200, h: 80, text: '🎤  With Ananya Rao, Growth Lead', size: 48, color: '#a5b4fc' }),
        rect(430, 1360, 640, 130, '#6366f1', { radius: 65 }),
        text({ x: 430, y: 1392, w: 640, h: 80, text: 'Register free →', size: 54, color: '#ffffff', weight: 800, font: SANS }),
        text({ x: 150, y: 1560, w: 1200, h: 60, text: 'yoursite.com/webinar', size: 40, color: '#818cf8' }),
      ],
    }),
  },
  {
    id: 'retirement-party', name: 'Retirement Party', emoji: '🎉', category: 'Celebration',
    make: () => ({
      w: W, h: H, background: '#062a3a',
      elements: [
        ellipse(160, 260, 90, 90, '#7dd3fc'), ellipse(1240, 340, 110, 110, '#fcd34d'), ellipse(300, 1700, 80, 80, '#5eead4'),
        text({ x: 150, y: 420, w: 1200, h: 70, text: 'CHEERS TO', size: 46, color: '#7dd3fc', weight: 700, font: SANS }),
        text({ x: 100, y: 560, w: 1300, h: 220, text: 'Retirement', size: 150, color: '#ffffff', weight: 900, font: 'Georgia, serif' }),
        text({ x: 150, y: 840, w: 1200, h: 80, text: 'Honouring Mr. Sharma’s 35 years 🥂', size: 50, color: '#bae6fd' }),
        line(500, 1060, 500, '#fcd34d', 4),
        text({ x: 150, y: 1140, w: 1200, h: 80, text: 'Friday, 27 March 2026 · 7 PM', size: 50, color: '#e0f2fe' }),
        text({ x: 150, y: 1260, w: 1200, h: 80, text: 'The Terrace, Hotel Grand', size: 46, color: '#7dd3fc' }),
        text({ x: 150, y: 1420, w: 1200, h: 70, text: 'Dinner & speeches to follow', size: 42, color: '#bae6fd' }),
      ],
    }),
  },

  // ── Greeting cards (Greetings-Island style: many occasions & styles) ──────
  {
    id: 'sympathy-watercolor', name: 'With Sympathy', emoji: '🕊️', category: 'Sympathy',
    make: () => ({
      w: W, h: H, background: '#f6f8fa',
      elements: [
        ellipse(-200, -160, 700, 560, '#e2e8f0'), ellipse(900, 1500, 800, 700, '#e6eef5'), ellipse(700, -100, 500, 420, '#eef2f7'),
        text({ x: 150, y: 520, w: 1200, h: 120, text: '🕊️', size: 120, color: '#64748b', font: SANS }),
        text({ x: 150, y: 720, w: 1200, h: 90, text: 'With Deepest', size: 70, color: '#475569' }),
        text({ x: 150, y: 820, w: 1200, h: 130, text: 'Sympathy', size: 130, color: '#334155', weight: 700 }),
        line(560, 1040, 380, '#cbd5e1', 2),
        text({ x: 200, y: 1120, w: 1100, h: 200, text: 'Thinking of you and your family\nduring this difficult time. May loving\nmemories bring you comfort and peace.', size: 46, color: '#64748b' }),
        text({ x: 200, y: 1520, w: 1100, h: 70, text: 'With heartfelt condolences', size: 42, color: '#94a3b8', font: "'Segoe Script', cursive" }),
      ],
    }),
  },
  {
    id: 'get-well-floral', name: 'Get Well Soon', emoji: '🌻', category: 'Greeting',
    make: () => ({
      w: W, h: H, background: '#fffbeb',
      elements: [
        ellipse(-140, -140, 460, 460, '#fef08a'), ellipse(1180, 1620, 480, 480, '#bbf7d0'),
        text({ x: 60, y: 120, w: 200, h: 200, text: '🌻', size: 150, color: '#000', font: SANS }),
        text({ x: 1240, y: 150, w: 200, h: 200, text: '🌿', size: 130, color: '#000', font: SANS }),
        text({ x: 120, y: 1720, w: 200, h: 200, text: '🌼', size: 130, color: '#000', font: SANS }),
        text({ x: 1230, y: 1700, w: 200, h: 200, text: '🍀', size: 120, color: '#000', font: SANS }),
        text({ x: 150, y: 560, w: 1200, h: 90, text: 'HOPE YOU', size: 56, color: '#ca8a04', weight: 800, font: SANS }),
        text({ x: 100, y: 680, w: 1300, h: 320, text: 'Feel Better\nSoon', size: 150, color: '#166534', weight: 900, font: SANS }),
        line(500, 1120, 500, '#facc15', 4),
        text({ x: 200, y: 1200, w: 1100, h: 160, text: 'Sending you sunshine, good vibes\nand a great big get-well hug! 🤗', size: 50, color: '#15803d' }),
      ],
    }),
  },
  {
    id: 'thinking-of-you', name: 'Thinking of You', emoji: '💭', category: 'Greeting',
    make: () => ({
      w: W, h: H, background: '#eef2ff',
      elements: [
        ellipse(-160, 1400, 700, 700, '#c7d2fe'), ellipse(1000, -160, 620, 620, '#ddd6fe'),
        text({ x: 150, y: 620, w: 1200, h: 120, text: '☁️💭', size: 110, color: '#000', font: SANS }),
        text({ x: 100, y: 820, w: 1300, h: 260, text: 'Thinking\nof You', size: 160, color: '#4338ca', weight: 800, font: 'Georgia, serif' }),
        line(550, 1240, 400, '#818cf8', 3),
        text({ x: 200, y: 1320, w: 1100, h: 160, text: 'Just a little note to let you know\nyou crossed my mind today. 💜', size: 52, color: '#4f46e5' }),
      ],
    }),
  },
  {
    id: 'thank-you-botanical', name: 'Thank You · Botanical', emoji: '🌿', category: 'Thank You',
    make: () => ({
      w: W, h: H, background: '#f7f5ef',
      elements: [
        rect(70, 70, W - 140, H - 140, 'none', { stroke: '#b7a06a', strokeWidth: 3 }),
        text({ x: 80, y: 90, w: 260, h: 260, text: '🌿', size: 150, color: '#000', font: SANS }),
        text({ x: 1170, y: 90, w: 260, h: 260, text: '🌸', size: 130, color: '#000', font: SANS }),
        text({ x: 90, y: 1730, w: 260, h: 260, text: '🍃', size: 130, color: '#000', font: SANS }),
        text({ x: 1180, y: 1720, w: 260, h: 260, text: '🌷', size: 130, color: '#000', font: SANS }),
        text({ x: 150, y: 760, w: 1200, h: 90, text: 'A HEARTFELT', size: 48, color: '#a3894f', weight: 600, font: SANS }),
        text({ x: 100, y: 880, w: 1300, h: 240, text: 'Thank You', size: 190, color: '#5c4a22', font: 'Georgia, serif' }),
        line(560, 1180, 380, '#b7a06a', 2),
        text({ x: 200, y: 1260, w: 1100, h: 150, text: 'Your kindness means more\nthan words can say.', size: 52, color: '#7a6531' }),
      ],
    }),
  },
  {
    id: 'thank-you-bold', name: 'Thank You · Bold', emoji: '🙏', category: 'Thank You',
    make: () => ({
      w: W, h: H, background: '#0f766e',
      elements: [
        ellipse(150, 240, 70, 70, '#fde047'), ellipse(1240, 340, 90, 90, '#f9a8d4'), ellipse(320, 1740, 70, 70, '#5eead4'),
        text({ x: 60, y: 620, w: 1380, h: 300, text: 'THANK', size: 260, color: '#ffffff', weight: 900, font: SANS }),
        text({ x: 60, y: 900, w: 1380, h: 300, text: 'YOU', size: 260, color: '#fde047', weight: 900, font: SANS }),
        text({ x: 150, y: 1300, w: 1200, h: 90, text: 'for absolutely everything 💛', size: 58, color: '#ccfbf1', font: "'Segoe Script', cursive" }),
      ],
    }),
  },
  {
    id: 'new-home', name: 'New Home', emoji: '🏡', category: 'Greeting',
    make: () => ({
      w: W, h: H, background: '#fffdf5',
      elements: [
        rect(80, 80, W - 160, H - 160, 'none', { stroke: '#c9a34e', strokeWidth: 3 }),
        rect(104, 104, W - 208, H - 208, 'none', { stroke: '#e6d3a3', strokeWidth: 1 }),
        text({ x: 150, y: 380, w: 1200, h: 160, text: '🏡🔑', size: 140, color: '#000', font: SANS }),
        text({ x: 150, y: 620, w: 1200, h: 80, text: 'CONGRATULATIONS ON YOUR', size: 46, color: '#a08339', weight: 600, font: SANS }),
        text({ x: 100, y: 740, w: 1300, h: 260, text: 'New Home', size: 170, color: '#7c5c1e', font: 'Georgia, serif' }),
        line(560, 1080, 380, '#c9a34e', 2),
        text({ x: 200, y: 1160, w: 1100, h: 200, text: 'May it be filled with love,\nlaughter and wonderful memories.\nWelcome home! 🗝️', size: 50, color: '#8a6d2f' }),
      ],
    }),
  },
  {
    id: 'new-job', name: 'New Job', emoji: '💼', category: 'Greeting',
    make: () => ({
      w: W, h: H, background: '#eef2ff',
      elements: [
        ellipse(180, 260, 70, 70, '#6366f1'), ellipse(1240, 360, 90, 90, '#22d3ee'), ellipse(300, 1720, 80, 80, '#f472b6'), ellipse(1180, 1700, 64, 64, '#facc15'),
        text({ x: 150, y: 420, w: 1200, h: 160, text: '💼🎉', size: 140, color: '#000', font: SANS }),
        text({ x: 150, y: 660, w: 1200, h: 80, text: 'CONGRATS ON THE', size: 50, color: '#4338ca', weight: 800, font: SANS }),
        text({ x: 100, y: 780, w: 1300, h: 260, text: 'New Job!', size: 190, color: '#3730a3', weight: 900, font: SANS }),
        line(500, 1140, 500, '#818cf8', 4),
        text({ x: 200, y: 1220, w: 1100, h: 160, text: 'They’re lucky to have you —\ngo show them what you’ve got! 🚀', size: 52, color: '#4f46e5' }),
      ],
    }),
  },
  {
    id: 'im-sorry', name: "I'm Sorry", emoji: '🥺', category: 'Greeting',
    make: () => ({
      w: W, h: H, background: '#f5f3ff',
      elements: [
        ellipse(-160, -140, 560, 560, '#ede9fe'), ellipse(1100, 1560, 620, 620, '#ddd6fe'),
        text({ x: 150, y: 560, w: 1200, h: 160, text: '🥺🌷', size: 130, color: '#000', font: SANS }),
        text({ x: 100, y: 780, w: 1300, h: 240, text: "I'm Sorry", size: 200, color: '#6d28d9', font: 'Georgia, serif' }),
        line(560, 1120, 380, '#a78bfa', 2),
        text({ x: 200, y: 1200, w: 1100, h: 200, text: 'I never meant to hurt you.\nPlease forgive me — you mean\nthe world to me. 💜', size: 52, color: '#7c3aed' }),
      ],
    }),
  },
  {
    id: 'encouragement', name: "You've Got This", emoji: '💪', category: 'Encouragement',
    make: () => ({
      w: W, h: H, background: '#0a0a0a',
      elements: [
        ellipse(120, 200, 300, 300, '#f59e0b'), ellipse(1080, 1600, 340, 340, '#ef4444'),
        text({ x: 100, y: 620, w: 1300, h: 300, text: "You've", size: 180, color: '#ffffff', weight: 900, font: SANS }),
        text({ x: 100, y: 840, w: 1300, h: 300, text: 'Got This', size: 200, color: '#f59e0b', weight: 900, font: SANS }),
        line(500, 1200, 500, '#ef4444', 6),
        text({ x: 200, y: 1280, w: 1100, h: 160, text: 'Believe in yourself and keep going.\nI’m rooting for you! 💪🔥', size: 52, color: '#e5e7eb' }),
      ],
    }),
  },
  {
    id: 'farewell-goodluck', name: 'Farewell & Good Luck', emoji: '🍀', category: 'Greeting',
    make: () => ({
      w: W, h: H, background: '#1e1b4b',
      elements: [
        ellipse(150, 240, 60, 60, '#a5b4fc'), ellipse(1240, 320, 80, 80, '#c4b5fd'), ellipse(320, 1740, 70, 70, '#818cf8'),
        text({ x: 150, y: 480, w: 1200, h: 160, text: '🚀🍀', size: 140, color: '#000', font: SANS }),
        text({ x: 150, y: 720, w: 1200, h: 80, text: 'FAREWELL & GOOD LUCK', size: 48, color: '#c4b5fd', weight: 700, font: SANS }),
        text({ x: 100, y: 840, w: 1300, h: 260, text: 'On to Great\nThings', size: 140, color: '#ede9fe', weight: 800, font: 'Georgia, serif' }),
        line(560, 1200, 380, '#a5b4fc', 3),
        text({ x: 200, y: 1280, w: 1100, h: 160, text: 'We’ll miss you here — go be\namazing out there. Keep in touch! 👋', size: 50, color: '#c7d2fe' }),
      ],
    }),
  },
  {
    id: 'love-you-romantic', name: 'Love You', emoji: '🌹', category: 'Love',
    make: () => ({
      w: W, h: H, background: '#4c0519',
      elements: [
        ellipse(-160, -160, 520, 520, '#7f1d3a'), ellipse(1140, 1620, 520, 520, '#831843'),
        text({ x: 150, y: 460, w: 1200, h: 160, text: '🌹', size: 150, color: '#000', font: SANS }),
        text({ x: 150, y: 700, w: 1200, h: 80, text: 'JUST FOR YOU', size: 46, color: '#fda4af', weight: 600, font: SANS }),
        text({ x: 100, y: 820, w: 1300, h: 260, text: 'I Love You', size: 180, color: '#fecdd3', font: 'Georgia, serif' }),
        line(560, 1160, 380, '#fb7185', 2),
        text({ x: 200, y: 1240, w: 1100, h: 200, text: 'You are my favourite hello\nand my hardest goodbye.\nForever yours. ❤️', size: 52, color: '#fda4af', font: "'Segoe Script', cursive" }),
      ],
    }),
  },
  {
    id: 'mothers-day-floral', name: "Mother's Day", emoji: '💐', category: 'Seasonal',
    make: () => ({
      w: W, h: H, background: '#fdf2f8',
      elements: [
        ellipse(-140, -140, 460, 460, '#fbcfe8'), ellipse(1180, 1620, 480, 480, '#f5d0fe'),
        text({ x: 90, y: 130, w: 220, h: 220, text: '🌷', size: 140, color: '#000', font: SANS }),
        text({ x: 1200, y: 150, w: 220, h: 220, text: '🌸', size: 130, color: '#000', font: SANS }),
        text({ x: 150, y: 560, w: 1200, h: 90, text: 'HAPPY', size: 60, color: '#be185d', weight: 800, font: SANS }),
        text({ x: 80, y: 680, w: 1340, h: 300, text: "Mother's Day", size: 150, color: '#9d174d', font: 'Georgia, serif' }),
        text({ x: 150, y: 1000, w: 1200, h: 120, text: '💐', size: 110, color: '#000', font: SANS }),
        line(500, 1200, 500, '#f472b6', 3),
        text({ x: 200, y: 1280, w: 1100, h: 200, text: 'Thank you for your endless love,\ncare and warm hugs. Love you, Mum! 💕', size: 52, color: '#be185d' }),
      ],
    }),
  },
  {
    id: 'fathers-day-modern', name: "Father's Day", emoji: '👔', category: 'Seasonal',
    make: () => ({
      w: W, h: H, background: '#0f2942',
      elements: [
        rect(0, 0, W, 24, '#38bdf8'), rect(0, H - 24, W, 24, '#38bdf8'),
        ellipse(1050, 260, 320, 320, '#173a5c'), ellipse(250, 1720, 300, 300, '#173a5c'),
        text({ x: 150, y: 480, w: 1200, h: 160, text: '👔🏆', size: 130, color: '#000', font: SANS }),
        text({ x: 150, y: 700, w: 1200, h: 80, text: 'HAPPY', size: 60, color: '#7dd3fc', weight: 800, font: SANS }),
        text({ x: 80, y: 820, w: 1340, h: 300, text: "Father's Day", size: 150, color: '#e0f2fe', weight: 800, font: SANS }),
        line(500, 1200, 500, '#38bdf8', 4),
        text({ x: 200, y: 1280, w: 1100, h: 200, text: 'Thank you for always being\nmy strength and my guide.\nThe world’s best Dad. 💙', size: 52, color: '#bae6fd' }),
      ],
    }),
  },
  {
    id: 'easter-pastel', name: 'Happy Easter', emoji: '🐰', category: 'Seasonal',
    make: () => ({
      w: W, h: H, background: '#fefce8',
      elements: [
        ellipse(-140, 1500, 560, 560, '#bbf7d0'), ellipse(1120, -160, 560, 560, '#fbcfe8'),
        text({ x: 150, y: 460, w: 1200, h: 200, text: '🐰🥚', size: 170, color: '#000', font: SANS }),
        text({ x: 100, y: 760, w: 1300, h: 260, text: 'Happy Easter', size: 150, color: '#a16207', font: 'Georgia, serif' }),
        text({ x: 150, y: 1080, w: 1200, h: 120, text: '🌷🐣🌼', size: 110, color: '#000', font: SANS }),
        line(500, 1280, 500, '#fbbf24', 3),
        text({ x: 200, y: 1360, w: 1100, h: 160, text: 'Wishing you a basket full of joy,\nhope and new beginnings. 🐰', size: 52, color: '#ca8a04' }),
      ],
    }),
  },
  {
    id: 'welcome-baby-cute', name: 'Welcome Baby', emoji: '🧸', category: 'Baby',
    make: () => ({
      w: W, h: H, background: '#eff6ff',
      elements: [
        ellipse(-160, -160, 520, 520, '#bfdbfe'), ellipse(1140, 1620, 520, 520, '#fbcfe8'),
        text({ x: 150, y: 460, w: 1200, h: 220, text: '🧸', size: 190, color: '#000', font: SANS }),
        text({ x: 150, y: 760, w: 1200, h: 90, text: 'WELCOME TO THE WORLD', size: 50, color: '#60a5fa', weight: 700, font: SANS }),
        text({ x: 100, y: 880, w: 1300, h: 240, text: 'Little One', size: 190, color: '#1d4e89', font: 'Georgia, serif' }),
        text({ x: 150, y: 1160, w: 1200, h: 110, text: '🍼☁️⭐', size: 100, color: '#000', font: SANS }),
        line(500, 1360, 500, '#93c5fd', 3),
        text({ x: 200, y: 1440, w: 1100, h: 160, text: 'A tiny new star has arrived —\nwishing your family endless joy. 💕', size: 50, color: '#35618e' }),
      ],
    }),
  },
  {
    id: 'halloween-spooky', name: 'Happy Halloween', emoji: '🎃', category: 'Seasonal',
    make: () => ({
      w: W, h: H, background: '#180a2e',
      elements: [
        ellipse(1050, 260, 300, 300, '#2c1250'), ellipse(250, 1720, 300, 300, '#2c1250'),
        text({ x: 150, y: 440, w: 1200, h: 220, text: '🎃👻', size: 180, color: '#000', font: SANS }),
        text({ x: 60, y: 760, w: 1380, h: 260, text: 'Happy\nHalloween', size: 150, color: '#fb923c', weight: 900, font: SANS }),
        text({ x: 150, y: 1120, w: 1200, h: 110, text: '🦇🕸️🍬', size: 100, color: '#000', font: SANS }),
        line(500, 1320, 500, '#a855f7', 4),
        text({ x: 200, y: 1400, w: 1100, h: 140, text: 'Wishing you a spook-tacular night\nof frights and treats! 🍬', size: 50, color: '#e9d5ff' }),
      ],
    }),
  },
  {
    id: 'thanksgiving-grateful', name: 'Thanksgiving', emoji: '🍂', category: 'Seasonal',
    make: () => ({
      w: W, h: H, background: '#3b1a06',
      elements: [
        ellipse(-140, -140, 480, 480, '#5c2c0e'), ellipse(1160, 1620, 500, 500, '#5c2c0e'),
        text({ x: 150, y: 440, w: 1200, h: 200, text: '🦃🍁', size: 170, color: '#000', font: SANS }),
        text({ x: 150, y: 720, w: 1200, h: 80, text: 'HAPPY THANKSGIVING', size: 52, color: '#fdba74', weight: 700, font: SANS }),
        text({ x: 100, y: 840, w: 1300, h: 260, text: 'Grateful\nfor You', size: 150, color: '#fed7aa', font: 'Georgia, serif' }),
        text({ x: 150, y: 1200, w: 1200, h: 110, text: '🍂🌽🥧', size: 100, color: '#000', font: SANS }),
        line(500, 1400, 500, '#f59e0b', 3),
        text({ x: 200, y: 1480, w: 1100, h: 140, text: 'A table full of food and a heart\nfull of thanks. 🧡', size: 50, color: '#fbbf24' }),
      ],
    }),
  },
  {
    id: 'thinking-photo', name: 'Thinking of You · Photo', emoji: '📸', category: 'Greeting',
    make: () => ({
      w: W, h: H, background: '#f8fafc',
      elements: [
        rect(150, 180, W - 300, 1180, '#ffffff', { stroke: '#e2e8f0', strokeWidth: 6, radius: 24 }),
        photoSlot(186, 216, W - 372, 1108),
        text({ x: 150, y: 1440, w: 1200, h: 120, text: 'Thinking of You', size: 96, color: '#334155', weight: 700, font: 'Georgia, serif' }),
        line(560, 1600, 380, '#cbd5e1', 3),
        text({ x: 200, y: 1670, w: 1100, h: 140, text: 'Tap the frame to add a photo,\nthen make it yours. 💛', size: 46, color: '#64748b' }),
      ],
    }),
  },

  // ── Illustrated birthday cards (greeting-card gallery styles) ──────────────
  {
    id: 'bday-pink-cheer', name: 'Pink Cheer', emoji: '🎈', category: 'Birthday',
    make: () => ({
      w: W, h: H, background: '#1f2b4d',
      elements: [
        rect(60, 60, W - 120, H - 120, 'none', { stroke: '#c9a24a', strokeWidth: 3, radius: 18 }),
        // Balloon cluster with soft highlights + curling gold strings.
        ellipse(300, 300, 300, 380, '#f9a8d4'), ellipse(360, 350, 90, 120, '#fbcfe8', { opacity: 0.7 }),
        ellipse(640, 220, 300, 380, '#ec4899'), ellipse(700, 270, 90, 120, '#f9a8d4', { opacity: 0.6 }),
        ellipse(500, 520, 260, 330, '#fb7185'), ellipse(552, 562, 80, 105, '#fecdd3', { opacity: 0.6 }),
        line(450, 680, 30, '#c9a24a', 4), line(790, 600, -20, '#c9a24a', 4), line(630, 850, 10, '#c9a24a', 4),
        text({ x: 100, y: 1120, w: 1300, h: 220, text: 'Happy\nBirthday', size: 150, color: '#f5d78a', weight: 700, font: SCRIPT }),
        line(500, 1440, 500, '#c9a24a', 2),
        text({ x: 150, y: 1520, w: 1200, h: 100, text: 'Christopher', size: 84, color: '#ffffff', weight: 600, font: SANS }),
        text({ x: 150, y: 1680, w: 1200, h: 70, text: "Cheers to another amazing year!", size: 46, color: '#c7cbe0' }),
      ],
    }),
  },
  {
    id: 'bday-happy-balloons', name: 'Happy Balloons', emoji: '🎈', category: 'Birthday',
    make: () => ({
      w: W, h: H, background: '#eaf3ee',
      elements: [
        // A cheerful bunch of smiley balloons.
        ...([['#f9a8d4', 470, 300], ['#fcd34d', 720, 250], ['#86efac', 970, 320], ['#fca5a5', 590, 520], ['#93c5fd', 850, 540], ['#fdba74', 350, 540]] as const)
          .flatMap(([c, x, y]) => [
            ellipse(x, y, 200, 240, c),
            ellipse(x + 62, y + 96, 20, 20, '#334155'), ellipse(x + 120, y + 96, 20, 20, '#334155'),
            ellipse(x + 78, y + 138, 46, 24, '#33415522'),
          ]),
        line(760, 760, 0, '#a3b3a8', 3), line(700, 760, 0, '#a3b3a8', 3),
        emoji(690, 740, 120, '🎀'),
        text({ x: 100, y: 1560, w: 1300, h: 180, text: 'Happy Birthday', size: 130, color: '#2f5d50', weight: 700, font: SCRIPT }),
        text({ x: 150, y: 1820, w: 1200, h: 70, text: 'Hope your day is full of joy!', size: 48, color: '#4b7264' }),
      ],
    }),
  },
  {
    id: 'bday-polaroid', name: 'Polaroid', emoji: '📸', category: 'Birthday',
    make: () => ({
      w: W, h: H, background: '#f4efe6',
      elements: [
        emoji(120, 320, 110, '🎉', -12), emoji(1240, 300, 96, '✨'), emoji(1180, 720, 110, '🎁', 10), emoji(150, 780, 96, '🎈'),
        text({ x: 150, y: 250, w: 1200, h: 140, text: 'happy birthday', size: 96, color: '#3f3a33', weight: 600, font: SCRIPT }),
        // Taped polaroid frame, tilted for a scrapbook feel.
        rect(360, 470, 780, 900, '#ffffff', { stroke: '#e7ddc9', strokeWidth: 4, radius: 10, rotation: -3 }),
        photoSlot(408, 520, 684, 690),
        text({ x: 360, y: 1250, w: 780, h: 80, text: 'that smile! 🥳', size: 52, color: '#6b6357', font: SCRIPT, rotation: -3 }),
        text({ x: 150, y: 1560, w: 1200, h: 130, text: 'JAMES', size: 120, color: '#b08d57', weight: 700, font: 'Georgia, serif' }),
        text({ x: 150, y: 1760, w: 1200, h: 70, text: 'Your life is a gift to all who know you.', size: 44, color: '#7c766a' }),
      ],
    }),
  },
  {
    id: 'bday-watercolor-blooms', name: 'Watercolor Blooms', emoji: '🌸', category: 'Birthday',
    make: () => ({
      w: W, h: H, background: '#fbfaf7',
      elements: [
        rect(70, 70, W - 140, H - 140, 'none', { stroke: '#e6ddcf', strokeWidth: 2, radius: 20 }),
        // Soft, layered petals (translucent ellipses) around warm centres — a
        // watercolour-bouquet look built entirely from shapes, with trailing
        // green foliage sprigs beneath the blooms.
        ...([[520, 760], [700, 800], [880, 760]] as const).map(([x, y]) => ellipse(x, y, 40, 120, '#a7d0a0', { opacity: 0.55, rotation: (x - 700) / 12 })),
        ...([['#f9a8d4', 560, 360], ['#c4b5fd', 820, 300], ['#fda4af', 700, 520], ['#fcd34d', 470, 470], ['#a7f3d0', 940, 470]] as const)
          .flatMap(([c, cx, cy]) => Array.from({ length: 6 }, (_, k) => {
            const a = (k / 6) * Math.PI * 2;
            return ellipse(cx + Math.cos(a) * 70 - 70, cy + Math.sin(a) * 70 - 45, 140, 90, c, { opacity: 0.6, rotation: (a * 180) / Math.PI });
          }).concat([ellipse(cx - 34, cy - 34, 68, 68, '#fde68a', { opacity: 0.9 })])),
        text({ x: 100, y: 1220, w: 1300, h: 170, text: 'happy birthday', size: 128, color: '#6b5b73', weight: 600, font: SCRIPT }),
        line(560, 1470, 380, '#cbb8c9', 2),
        text({ x: 200, y: 1560, w: 1100, h: 140, text: 'Wishing you a day as lovely\nas you are.', size: 50, color: '#8a7f88' }),
      ],
    }),
  },
  {
    id: 'bday-older-awesome', name: 'Older & Awesome', emoji: '⭐', category: 'Birthday',
    make: () => ({
      w: W, h: H, background: '#0f1836',
      elements: [
        emoji(150, 250, 90, '⭐', -10), emoji(1230, 340, 80, '🌟'), emoji(1180, 1500, 90, '✨'), emoji(160, 1560, 80, '⭐', 12),
        emoji(1250, 900, 70, '💫'), emoji(120, 950, 70, '✨'),
        text({ x: 120, y: 360, w: 1260, h: 150, text: 'OLDER?', size: 140, color: '#fde68a', weight: 900, font: SANS }),
        text({ x: 120, y: 520, w: 1260, h: 130, text: 'yes.', size: 120, color: '#f9a8d4', weight: 700, font: SCRIPT }),
        text({ x: 120, y: 690, w: 1260, h: 150, text: 'WISER?', size: 140, color: '#93c5fd', weight: 900, font: SANS }),
        text({ x: 120, y: 850, w: 1260, h: 130, text: 'not sure.', size: 116, color: '#86efac', weight: 700, font: SCRIPT }),
        text({ x: 120, y: 1030, w: 1260, h: 150, text: 'STILL', size: 140, color: '#ffffff', weight: 900, font: SANS }),
        text({ x: 120, y: 1180, w: 1260, h: 150, text: 'AWESOME?', size: 132, color: '#fbbf24', weight: 900, font: SANS }),
        text({ x: 120, y: 1360, w: 1260, h: 150, text: 'absolutely.', size: 128, color: '#f472b6', weight: 700, font: SCRIPT }),
        text({ x: 150, y: 1700, w: 1200, h: 70, text: 'Happy Birthday!', size: 56, color: '#c7cbe0', weight: 600, font: SANS }),
      ],
    }),
  },
  {
    id: 'bday-hoppy-frog', name: 'Hoppy Frog', emoji: '🐸', category: 'Birthday',
    make: () => ({
      w: W, h: H, background: '#ffffff',
      elements: [
        text({ x: 120, y: 300, w: 760, h: 90, text: "WE'RE WISHING YOU A", size: 44, color: '#64748b', weight: 700, font: SANS }),
        text({ x: 640, y: 240, w: 760, h: 180, text: 'Hoppy\nBirthday', size: 116, color: '#166534', weight: 700, font: SCRIPT }),
        emoji(1120, 560, 120, '🎈'),
        line(1180, 690, 0, '#ef4444', 4),
        emoji(430, 760, 620, '🐸'),
        emoji(560, 720, 200, '🎉', -18),
        text({ x: 150, y: 1740, w: 1200, h: 80, text: 'Have a wonderful day!', size: 54, color: '#3f6212', weight: 600, font: SANS }),
      ],
    }),
  },
  {
    id: 'bday-chill', name: 'Time to Chill', emoji: '🦥', category: 'Birthday',
    make: () => ({
      w: W, h: H, background: '#ffffff',
      elements: [
        ...dots(30, 3),
        emoji(500, 560, 500, '🦥'),
        emoji(560, 470, 180, '🎉', -14),
        text({ x: 120, y: 1360, w: 1260, h: 150, text: 'TIME TO CHILL OUT', size: 96, color: '#1f2937', weight: 900, font: SANS }),
        text({ x: 150, y: 1560, w: 1200, h: 120, text: "it's your birthday!", size: 96, color: '#7c3aed', weight: 600, font: SCRIPT }),
      ],
    }),
  },
  {
    id: 'bday-hearts-photo', name: 'Birthday Hearts', emoji: '💗', category: 'Birthday',
    make: () => ({
      w: W, h: H, background: '#faf5f1',
      elements: [
        emoji(140, 260, 90, '🤎', -10, 0.85), emoji(1240, 300, 80, '🤍', 8, 0.9), emoji(1230, 760, 90, '❤️', 0, 0.55),
        emoji(150, 720, 80, '🤎', 12, 0.7), emoji(1250, 1200, 90, '🤍', -8, 0.9), emoji(130, 1180, 80, '❤️', 6, 0.5),
        // Arched photo frame.
        rect(360, 360, 780, 900, '#ffffff', { stroke: '#ecd9cf', strokeWidth: 5, radius: 360 }),
        { ...photoSlot(400, 400, 700, 820), radius: 330 } as Element,
        text({ x: 100, y: 1420, w: 1300, h: 150, text: 'happy birthday vangie!', size: 92, color: '#7c5c52', weight: 600, font: SCRIPT }),
        line(560, 1620, 380, '#e2c9bd', 2),
        text({ x: 200, y: 1690, w: 1100, h: 120, text: 'your life is a gift to all\nthose who know you', size: 44, color: '#9a8378' }),
      ],
    }),
  },
];

export const INVITATION_CATEGORIES = ['All', ...Array.from(new Set(INVITATIONS.map((i) => i.category)))];
