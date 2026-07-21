import { describe, it, expect } from 'vitest';
import { POEM_TEMPLATES, BLESSING_TEMPLATES } from './versePosters.js';
import { BACKGROUND_EFFECTS, effectParticles } from './effects.js';

const ALL = [...POEM_TEMPLATES, ...BLESSING_TEMPLATES];

describe('verse posters (poems + blessings)', () => {
  it('ships poems and blessings in their own categories', () => {
    expect(POEM_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    expect(BLESSING_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    for (const t of POEM_TEMPLATES) expect(t.category).toBe('Poems');
    for (const t of BLESSING_TEMPLATES) expect(t.category).toBe('Blessings');
  });

  it('has unique prefixed ids and non-empty names/icons', () => {
    const ids = ALL.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of POEM_TEMPLATES) expect(t.id).toMatch(/^pm-/);
    for (const t of BLESSING_TEMPLATES) expect(t.id).toMatch(/^bl-/);
    for (const t of ALL) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.icon.length).toBeGreaterThan(0);
    }
  });

  it('every poster builds a valid, in-bounds Design with a moving accent', () => {
    for (const t of ALL) {
      const d = t.make();
      expect(d.w).toBeGreaterThan(0);
      expect(d.h).toBeGreaterThan(0);
      expect(typeof d.background).toBe('string');
      expect(d.elements.length).toBeGreaterThan(2);
      expect(d.elements.some((e) => 'motion' in e && e.motion)).toBe(true);
      for (const e of d.elements) {
        expect(e.x).toBeLessThan(d.w);
        expect(e.y).toBeLessThan(d.h);
      }
    }
  });

  it('only references real background effects', () => {
    const valid = new Set(BACKGROUND_EFFECTS.map((e) => e.id));
    for (const t of ALL) {
      const eff = t.make().effect;
      if (eff) {
        expect(valid.has(eff)).toBe(true);
        expect(effectParticles(eff, 5, 7).length).toBe(5);
      }
    }
  });

  it('covers the major faiths in the blessings pack', () => {
    const blob = BLESSING_TEMPLATES.map((t) => t.id).join(' ');
    for (const faith of ['hindu', 'muslim', 'christian', 'sikh', 'buddhist', 'interfaith']) {
      expect(blob).toContain(faith);
    }
  });
});
