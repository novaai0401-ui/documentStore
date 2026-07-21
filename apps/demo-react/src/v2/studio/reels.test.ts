import { describe, it, expect } from 'vitest';
import { REEL_TEMPLATES } from './reels.js';
import { BACKGROUND_EFFECTS, effectParticles } from './effects.js';

describe('reels', () => {
  it('ships a library of reels, all in the Reels category', () => {
    expect(REEL_TEMPLATES.length).toBeGreaterThanOrEqual(12);
    for (const t of REEL_TEMPLATES) expect(t.category).toBe('Reels');
  });

  it('has unique ids and non-empty names/icons', () => {
    const ids = REEL_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of REEL_TEMPLATES) {
      expect(t.id).toMatch(/^reel-/);
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.icon.length).toBeGreaterThan(0);
    }
  });

  it('every reel is a vertical 9:16 (1080×1920) animated design that exports as video', () => {
    for (const t of REEL_TEMPLATES) {
      const d = t.make();
      expect(d.w).toBe(1080);
      expect(d.h).toBe(1920);
      expect(d.h).toBeGreaterThan(d.w); // portrait
      // Carries an entrance animation (the exporter defaults to it).
      expect(t.anim).toBeTruthy();
      // Ships "alive" — at least one looping-motion element.
      expect(d.elements.some((e) => 'motion' in e && e.motion)).toBe(true);
      // Every element sits within the canvas bounds (top-left anchor).
      for (const e of d.elements) {
        expect(e.x).toBeLessThan(d.w);
        expect(e.y).toBeLessThan(d.h);
      }
    }
  });

  it('only references real background effects', () => {
    const valid = new Set(BACKGROUND_EFFECTS.map((e) => e.id));
    for (const t of REEL_TEMPLATES) {
      const eff = t.make().effect;
      if (eff) {
        expect(valid.has(eff)).toBe(true);
        expect(effectParticles(eff, 5, 7).length).toBe(5);
      }
    }
  });

  it('covers what people actually post — promos, motivation, shout-outs, food, business, events', () => {
    const names = REEL_TEMPLATES.map((t) => t.name.toLowerCase()).join(' | ');
    for (const kw of ['sale', 'quote', 'birthday', 'recipe', 'countdown', 'listing']) {
      expect(names).toContain(kw);
    }
  });
});
