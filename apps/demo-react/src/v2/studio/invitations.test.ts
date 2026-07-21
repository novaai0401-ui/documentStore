import { describe, it, expect } from 'vitest';
import { INVITATIONS, INVITATION_CATEGORIES } from './invitations.js';

describe('invitation & greeting card gallery', () => {
  it('ships a broad gallery with unique ids', () => {
    expect(INVITATIONS.length).toBeGreaterThanOrEqual(45);
    const ids = INVITATIONS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every card builds a valid, in-bounds Design', () => {
    for (const inv of INVITATIONS) {
      expect(inv.name.length).toBeGreaterThan(0);
      expect(inv.emoji.length).toBeGreaterThan(0);
      const d = inv.make();
      expect(d.w).toBeGreaterThan(0);
      expect(d.h).toBeGreaterThan(0);
      expect(typeof d.background).toBe('string');
      expect(d.elements.length).toBeGreaterThan(2);
      for (const e of d.elements) {
        expect(e.x).toBeLessThan(d.w);
        expect(e.y).toBeLessThan(d.h);
      }
    }
  });

  it('covers the popular Greetings-Island-style occasions', () => {
    const names = INVITATIONS.map((i) => `${i.id} ${i.name}`.toLowerCase()).join(' | ');
    for (const occ of ['sympathy', 'get well', 'thinking of you', 'thank you', 'new home', 'new job', 'sorry', 'mother', 'father', 'easter', 'thanksgiving', 'halloween']) {
      expect(names).toContain(occ);
    }
  });

  it('derives categories starting with All', () => {
    expect(INVITATION_CATEGORIES[0]).toBe('All');
    expect(INVITATION_CATEGORIES).toContain('Sympathy');
    expect(INVITATION_CATEGORIES).toContain('Seasonal');
    expect(new Set(INVITATION_CATEGORIES).size).toBe(INVITATION_CATEGORIES.length);
  });
});
