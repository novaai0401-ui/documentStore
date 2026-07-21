import { describe, it, expect } from 'vitest';
import { GREETING_TEMPLATES } from './greetingCards.js';
import { BACKGROUND_EFFECTS, effectParticles } from './effects.js';

describe('greeting cards', () => {
  it('ships a broad occasion library, all in the Greetings category', () => {
    expect(GREETING_TEMPLATES.length).toBeGreaterThanOrEqual(30);
    for (const t of GREETING_TEMPLATES) expect(t.category).toBe('Greetings');
  });

  it('has unique ids and non-empty names/icons', () => {
    const ids = GREETING_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of GREETING_TEMPLATES) {
      expect(t.id).toMatch(/^gc-/);
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.icon.length).toBeGreaterThan(0);
    }
  });

  it('every card builds a valid Design with a title and decorative stickers', () => {
    for (const t of GREETING_TEMPLATES) {
      const d = t.make();
      expect(d.w).toBeGreaterThan(0);
      expect(d.h).toBeGreaterThan(0);
      expect(typeof d.background).toBe('string');
      expect(d.elements.length).toBeGreaterThan(2);
      // At least one animated element (moving sticker) — cards ship "alive".
      expect(d.elements.some((e) => 'motion' in e && e.motion)).toBe(true);
      // Every element sits within the canvas bounds (top-left anchor).
      for (const e of d.elements) {
        expect(e.x).toBeLessThan(d.w);
        expect(e.y).toBeLessThan(d.h);
      }
    }
  });

  it('only references real background effects (incl. the new flowers effect)', () => {
    const valid = new Set(BACKGROUND_EFFECTS.map((e) => e.id));
    for (const t of GREETING_TEMPLATES) {
      const eff = t.make().effect;
      if (eff) {
        expect(valid.has(eff)).toBe(true);
        // The effect renderer can produce a particle field for it.
        expect(effectParticles(eff, 5, 7).length).toBe(5);
      }
    }
  });

  it('varies the layout formula — hero position/size and scatter patterns differ', () => {
    const byId = new Map(GREETING_TEMPLATES.map((t) => [t.id, t]));
    const heroY = (id: string) => {
      const d = byId.get(id)!.make();
      // Hero = the biggest single-emoji text element.
      const heroes = d.elements.filter((e) => e.type === 'text' && (e as { size: number }).size >= 120) as { y: number; size: number }[];
      return Math.min(...heroes.map((h) => h.y)) / d.h;
    };
    // The Chhath sun sits near the very top; the default hero sits lower.
    expect(heroY('gc-chhath-usha-arghya')).toBeLessThan(0.1);
    expect(heroY('gc-birthday-kids')).toBeGreaterThan(0.1);
    // Garland/row scatter produces 5 decorations instead of the 4 corners.
    const count = (id: string, min: number) => {
      const d = byId.get(id)!.make();
      const deco = d.elements.filter((e) => e.type === 'text' && (e as { size: number }).size <= 104 && (e as { size: number }).size >= 80);
      expect(deco.length).toBeGreaterThanOrEqual(min);
    };
    count('gc-diwali', 5);         // bottom diya row
    count('gc-ganpati-aagman', 5); // top marigold garland
  });

  it('festival cards avoid culturally wrong emoji (elephant-as-Ganesha, dancing girl)', () => {
    for (const t of GREETING_TEMPLATES) {
      const texts = t.make().elements.filter((e) => e.type === 'text') as { text: string }[];
      const all = texts.map((x) => x.text).join('');
      // No card depicts Ganesha as a plain elephant animal.
      if (/ganesh|ganpati|bappa/i.test(t.id + t.name)) expect(all).not.toContain('🐘');
      // No festival card uses the dancing-girl emoji.
      expect(all).not.toContain('💃');
    }
  });

  it('ships the fresh 2025-26 collection: light palettes, bold type, witty copy', () => {
    const byId = new Map(GREETING_TEMPLATES.map((t) => [t.id, t]));
    const fresh = ['gc-bday-butter', 'gc-bday-minimal-luxe', 'gc-bday-witty', 'gc-bday-lilac', 'gc-bday-retro',
      'gc-bday-milestone-editorial', 'gc-belated-late', 'gc-thanks-botanical', 'gc-congrats-pastel', 'gc-newjob-witty',
      'gc-baby-sage', 'gc-anniv-foil', 'gc-getwell-softblue', 'gc-thinking-hug', 'gc-just-because', 'gc-wedding-serif',
      'gc-diwali-modern', 'gc-holi-colorpop', 'gc-eid-emerald'];
    for (const id of fresh) expect(byId.has(id), id).toBe(true);
    // The collection breaks the old serif-on-dark mould: most cards sit on
    // light grounds (cream/butter/lilac/sage), not dark backgrounds.
    const light = fresh.filter((id) => {
      const bg = byId.get(id)!.make().background;
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
      return 0.299 * r! + 0.587 * g! + 0.114 * b! > 140;
    });
    expect(light.length).toBeGreaterThanOrEqual(13);
  });

  it('ships next-gen visual cards: gradients, grain, 3D titles, photo slots', () => {
    const byId = new Map(GREETING_TEMPLATES.map((t) => [t.id, t]));
    // Gradient + grain backgrounds (no longer flat colour).
    const glass = byId.get('gc-glass-diwali')!.make();
    expect(glass.bg2).toBeTruthy();
    expect(glass.grain).toBe(true);
    // Faux-3D balloon title = layered offset copies of the headline.
    const bday = byId.get('gc-3d-birthday')!.make();
    const copies = bday.elements.filter((e) => e.type === 'text' && (e as { text: string }).text.includes('HAPPY')).length;
    expect(copies).toBeGreaterThanOrEqual(4); // 3 depth layers + face
    // Photo cards carry a tap-to-add placeholder slot with a shaped mask.
    const anniv = byId.get('gc-photo-anniversary')!.make();
    const slot = anniv.elements.find((e) => e.type === 'image' && (e as { placeholder?: boolean }).placeholder) as { shape?: string } | undefined;
    expect(slot).toBeTruthy();
    expect(slot!.shape).toBe('heart');
    // Aurora depth blobs render as translucent ellipses.
    const ny = byId.get('gc-aurora-newyear')!.make();
    expect(ny.elements.filter((e) => e.type === 'ellipse' && (e.opacity ?? 1) < 0.5).length).toBeGreaterThanOrEqual(2);
  });

  it('includes cards spanning all age groups & major occasions', () => {
    const names = GREETING_TEMPLATES.map((t) => t.name.toLowerCase()).join(' | ');
    for (const occ of ['birthday', 'anniversary', "mother", "father", 'diwali', 'eid', 'christmas', 'thank you', 'good morning', 'get well']) {
      expect(names).toContain(occ);
    }
  });
});
