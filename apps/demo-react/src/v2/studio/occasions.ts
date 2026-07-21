/**
 * "Today" occasions — maps a date to the festival/occasion of the day and the
 * greeting-card template that fits it, so the home can nudge "It's Mother's Day →
 * send a card" and turn Pyntra into a daily habit. Pure + deterministic (takes a
 * Date, so it's testable); the template ids point at greetingCards.ts. Lunar
 * festivals (Diwali, Eid, Holi…) aren't fixed on the Gregorian calendar, so they
 * live in the full Greetings gallery rather than being date-guessed here.
 */

export interface Occasion { label: string; icon: string; templateId: string }

/** Day-of-month (1-based) of the `n`-th `weekday` (0=Sun) in `month1` (1-12). */
export function nthWeekdayOfMonth(year: number, month1: number, weekday: number, n: number): number {
  const first = new Date(year, month1 - 1, 1).getDay();
  const offset = (weekday - first + 7) % 7;
  return 1 + offset + (n - 1) * 7;
}

/** Fixed-date occasions, keyed "M-D". */
const FIXED: Record<string, Occasion> = {
  '1-1': { label: 'New Year’s Day', icon: '🎆', templateId: 'gc-new-year' },
  '1-26': { label: 'Republic Day', icon: '🇮🇳', templateId: 'gc-republic-day-in' },
  '2-14': { label: 'Valentine’s Day', icon: '❤️', templateId: 'gc-valentine' },
  '8-15': { label: 'Independence Day', icon: '🇮🇳', templateId: 'gc-independence-day-in' },
  '9-5': { label: 'Teacher’s Day', icon: '🍎', templateId: 'gc-teachers-day' },
  '10-2': { label: 'Gandhi Jayanti', icon: '🕊️', templateId: 'gc-gandhi-jayanti' },
  '10-31': { label: 'Halloween', icon: '🎃', templateId: 'gc-halloween' },
  '11-14': { label: 'Children’s Day', icon: '🧒', templateId: 'gc-childrens-day-in' },
  '12-25': { label: 'Christmas', icon: '🎄', templateId: 'gc-christmas' },
  '12-31': { label: 'New Year’s Eve', icon: '🎆', templateId: 'gc-new-year' },
};

/** The special occasion on `date`, if any (fixed dates + computed US/intl ones). */
export function occasionFor(date: Date): Occasion | null {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  const fixed = FIXED[`${m}-${d}`];
  if (fixed) return fixed;
  // Computed floating holidays.
  if (m === 5 && d === nthWeekdayOfMonth(y, 5, 0, 2)) return { label: 'Mother’s Day', icon: '🌷', templateId: 'gc-mothers-day' };
  if (m === 6 && d === nthWeekdayOfMonth(y, 6, 0, 3)) return { label: 'Father’s Day', icon: '👔', templateId: 'gc-fathers-day' };
  if (m === 8 && d === nthWeekdayOfMonth(y, 8, 0, 1)) return { label: 'Friendship Day', icon: '🤝', templateId: 'gc-friendship' };
  if (m === 11 && d === nthWeekdayOfMonth(y, 11, 4, 4)) return { label: 'Thanksgiving', icon: '🦃', templateId: 'gc-thanksgiving' };
  return null;
}

/** Occasion for the day, or a friendly time-of-day fallback (good morning/night)
 *  so the "Today" nudge is always useful. */
export function dailyGreeting(date: Date): Occasion {
  const occ = occasionFor(date);
  if (occ) return occ;
  const h = date.getHours();
  if (h >= 18 || h < 5) return { label: 'Good night', icon: '🌙', templateId: 'gc-good-night' };
  return { label: 'Good morning', icon: '🌞', templateId: 'gc-good-morning' };
}
