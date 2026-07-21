import { describe, it, expect } from 'vitest';
import { QUOTE_TEMPLATES } from './quotes.js';
import { BACKGROUND_EFFECTS, effectParticles } from './effects.js';

describe('quote & motivation posters', () => {
  it('ships a broad pack, all in the Quotes category', () => {
    expect(QUOTE_TEMPLATES.length).toBeGreaterThanOrEqual(12);
    for (const t of QUOTE_TEMPLATES) expect(t.category).toBe('Quotes');
  });

  it('has unique q- ids and non-empty names/icons', () => {
    const ids = QUOTE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of QUOTE_TEMPLATES) {
      expect(t.id).toMatch(/^q-/);
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.icon.length).toBeGreaterThan(0);
    }
  });

  it('every poster builds a valid, in-bounds Design with a moving accent', () => {
    for (const t of QUOTE_TEMPLATES) {
      const d = t.make();
      expect(d.w).toBeGreaterThan(0);
      expect(d.h).toBeGreaterThan(0);
      expect(typeof d.background).toBe('string');
      expect(d.elements.length).toBeGreaterThan(2);
      // Ships "alive" — at least one element carries a looping motion.
      expect(d.elements.some((e) => 'motion' in e && e.motion)).toBe(true);
      for (const e of d.elements) {
        expect(e.x).toBeLessThan(d.w);
        expect(e.y).toBeLessThan(d.h);
      }
    }
  });

  it('only references real background effects', () => {
    const valid = new Set(BACKGROUND_EFFECTS.map((e) => e.id));
    for (const t of QUOTE_TEMPLATES) {
      const eff = t.make().effect;
      if (eff) {
        expect(valid.has(eff)).toBe(true);
        expect(effectParticles(eff, 5, 7).length).toBe(5);
      }
    }
  });

  it('covers both self-love and hustle audiences', () => {
    const blob = QUOTE_TEMPLATES.map((t) => `${t.id} ${t.name}`.toLowerCase()).join(' | ');
    for (const needle of ['love yourself', 'discipline', 'grind', 'grateful', 'good vibes', 'study', 'hello']) {
      expect(blob).toContain(needle);
    }
  });
});
