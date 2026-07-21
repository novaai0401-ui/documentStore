import { describe, it, expect } from 'vitest';
import { OCCASION_ANIMS, occasionAnimById } from './occasionAnim.js';

describe('occasion animations', () => {
  it('covers the major occasions with unique ids and valid look data', () => {
    const ids = OCCASION_ANIMS.map((o) => o.id);
    for (const id of ['birthday', 'anniversary', 'love', 'congrats', 'thankyou', 'wedding', 'newyear']) {
      expect(ids).toContain(id);
    }
    expect(new Set(ids).size).toBe(ids.length);
    for (const o of OCCASION_ANIMS) {
      expect(o.label.length).toBeGreaterThan(0);
      expect(o.icon.length).toBeGreaterThan(0);
      expect(o.wish.length).toBeGreaterThan(0);
      expect(o.bg).toHaveLength(2);
      expect(typeof o.draw).toBe('function');
    }
  });

  it('occasionAnimById returns the match or a sensible default', () => {
    expect(occasionAnimById('birthday').id).toBe('birthday');
    expect(occasionAnimById('nonsense')).toBe(OCCASION_ANIMS[0]);
  });
});
