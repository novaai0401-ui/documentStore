import { describe, it, expect } from 'vitest';
import { nthWeekdayOfMonth, occasionFor, dailyGreeting } from './occasions.js';
import { STUDIO_TEMPLATES } from './templates.js';

const ids = new Set(STUDIO_TEMPLATES.map((t) => t.id));

describe('today occasions', () => {
  it('nthWeekdayOfMonth finds the right dates', () => {
    // 2nd Sunday of May 2026 is the 10th; 3rd Sunday of June 2026 is the 21st.
    expect(nthWeekdayOfMonth(2026, 5, 0, 2)).toBe(10);
    expect(nthWeekdayOfMonth(2026, 6, 0, 3)).toBe(21);
    // 4th Thursday of Nov 2026 (Thanksgiving) is the 26th.
    expect(nthWeekdayOfMonth(2026, 11, 4, 4)).toBe(26);
  });

  it('recognises fixed-date festivals', () => {
    expect(occasionFor(new Date(2026, 1, 14))?.templateId).toBe('gc-valentine'); // Feb 14
    expect(occasionFor(new Date(2026, 11, 25))?.templateId).toBe('gc-christmas'); // Dec 25
    expect(occasionFor(new Date(2026, 0, 1))?.label).toContain('New Year');
  });

  it('recognises the Indian national days and they map to real templates', () => {
    for (const [m, d, id] of [
      [1, 26, 'gc-republic-day-in'], [8, 15, 'gc-independence-day-in'],
      [10, 2, 'gc-gandhi-jayanti'], [11, 14, 'gc-childrens-day-in'],
    ] as const) {
      const occ = occasionFor(new Date(2026, m - 1, d));
      expect(occ?.templateId).toBe(id);
      expect(ids.has(occ!.templateId)).toBe(true);
    }
  });

  it('recognises computed floating holidays', () => {
    expect(occasionFor(new Date(2026, 4, 10))?.templateId).toBe('gc-mothers-day'); // 2nd Sun May
    expect(occasionFor(new Date(2026, 5, 21))?.templateId).toBe('gc-fathers-day'); // 3rd Sun Jun
  });

  it('returns null on an ordinary day', () => {
    expect(occasionFor(new Date(2026, 2, 3))).toBeNull(); // Mar 3
  });

  it('dailyGreeting always suggests something, and it maps to a real template', () => {
    const morning = dailyGreeting(new Date(2026, 2, 3, 9));
    const night = dailyGreeting(new Date(2026, 2, 3, 22));
    expect(morning.templateId).toBe('gc-good-morning');
    expect(night.templateId).toBe('gc-good-night');
    // Every occasion (fixed, computed, fallback) points at a template that exists.
    for (const day of [[1, 14], [5, 10], [12, 25], [3, 3]] as const) {
      expect(ids.has(dailyGreeting(new Date(2026, day[0] - 1, day[1], 9)).templateId)).toBe(true);
    }
  });
});
