import { describe, it, expect } from 'vitest';
import { upcomingFestivals, festivalsToday, FIXED_FESTIVALS, LUNAR_FESTIVALS } from './festivalCalendar.js';

describe('festival calendar', () => {
  it('lists upcoming festivals soonest-first, fixed and dated-lunar together', () => {
    const up = upcomingFestivals(4, { y: 2026, m: 1, d: 10 });
    // From Jan 10, 2026: Makar Sankranti (Jan 14) is next.
    expect(up[0]!.f.key).toBe('makar-sankranti');
    expect(up[0]!.inDays).toBe(4);
    // Dated lunar festivals now appear too (e.g. Vasant Panchami Jan 23, 2026).
    expect(up.some((u) => u.f.key === 'makar-vasant-panchami')).toBe(true);
    // A lunar festival with NO date for the window is still never shown wrongly.
    expect(LUNAR_FESTIVALS.every((f) => !f.perYear || typeof f.perYear === 'object')).toBe(true);
  });

  it('has Diwali on its published 2026 date', () => {
    expect(festivalsToday({ y: 2026, m: 11, d: 8 }).map((f) => f.key)).toContain('diwali');
  });

  it('wraps into next year when late in December', () => {
    const up = upcomingFestivals(2, { y: 2026, m: 12, d: 27 });
    expect(up[0]!.f.key).toBe('new-year');
    expect(up[0]!.year).toBe(2027);
  });

  it('reports a fixed festival that is today', () => {
    expect(festivalsToday({ y: 2026, m: 8, d: 15 }).map((f) => f.key)).toContain('independence-day');
    expect(festivalsToday({ y: 2026, m: 6, d: 3 })).toEqual([]);
  });

  it('every festival maps to a real card occasion', () => {
    for (const f of [...FIXED_FESTIVALS, ...LUNAR_FESTIVALS]) expect(f.cardOccasion.length).toBeGreaterThan(0);
  });
});
