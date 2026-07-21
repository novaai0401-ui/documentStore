/**
 * Festival calendar — upcoming Indian festivals so people can plan and be
 * reminded, and jump straight to a matching card.
 *
 * IMPORTANT on accuracy: fixed-date observances (Republic Day, Independence Day,
 * Makar Sankranti, Christmas…) are dependable and listed with real dates.
 * Lunar/lunisolar festivals (Diwali, Holi, Eid, Raksha Bandhan…) shift every
 * year and DIFFER BY STATE/almanac — we do NOT hard-code guessed dates for them
 * (a wrong reminder is worse than none). They live in `LUNAR` with per-year
 * dates that get filled from a verified Panchang source; until a year is filled
 * they simply don't appear as dated entries. `festivalSlug` links each to its
 * card in the gallery so "Make a card" works regardless of dates.
 */
import { occasionSlug } from './cardCatalog.js';
import { istToday } from './reminders.js';

export interface Festival { key: string; name: string; emoji: string; cardOccasion: string; fixed?: { m: number; d: number }; perYear?: Record<string, { m: number; d: number }>; states?: string[] }

/** Fixed / near-fixed Gregorian-date festivals — reliable every year. */
export const FIXED_FESTIVALS: Festival[] = [
  { key: 'new-year', name: 'New Year', emoji: '🎆', cardOccasion: 'Seasonal', fixed: { m: 1, d: 1 } },
  { key: 'makar-sankranti', name: 'Makar Sankranti', emoji: '🪁', cardOccasion: 'Festivals', fixed: { m: 1, d: 14 } },
  { key: 'pongal', name: 'Pongal', emoji: '🌾', cardOccasion: 'Festivals', fixed: { m: 1, d: 14 }, states: ['Tamil Nadu'] },
  { key: 'republic-day', name: 'Republic Day', emoji: '🇮🇳', cardOccasion: 'Festivals', fixed: { m: 1, d: 26 } },
  { key: 'baisakhi', name: 'Baisakhi', emoji: '🌾', cardOccasion: 'Festivals', fixed: { m: 4, d: 14 }, states: ['Punjab'] },
  { key: 'independence-day', name: 'Independence Day', emoji: '🇮🇳', cardOccasion: 'Festivals', fixed: { m: 8, d: 15 } },
  { key: 'gandhi-jayanti', name: 'Gandhi Jayanti', emoji: '🕊️', cardOccasion: 'Festivals', fixed: { m: 10, d: 2 } },
  { key: 'childrens-day', name: "Children's Day", emoji: '🎈', cardOccasion: 'Festivals', fixed: { m: 11, d: 14 } },
  { key: 'christmas', name: 'Christmas', emoji: '🎄', cardOccasion: 'Festivals', fixed: { m: 12, d: 25 } },
];

/**
 * Lunar/lunisolar festivals — dates vary yearly and by region. These follow the
 * widely-published Drik-Panchang calendar; regional almanacs can differ by a
 * day, and Islamic dates depend on local moon-sighting (marked approx). Keep
 * these updated each year — a year with no entry simply shows "date varies"
 * rather than a wrong date. Verified against the standard 2026/2027 calendar.
 */
export const LUNAR_FESTIVALS: Festival[] = [
  { key: 'makar-vasant-panchami', name: 'Vasant Panchami', emoji: '📖', cardOccasion: 'Festivals', perYear: { 2026: { m: 1, d: 23 }, 2027: { m: 2, d: 11 } } },
  { key: 'maha-shivratri', name: 'Maha Shivratri', emoji: '🔱', cardOccasion: 'Festivals', perYear: { 2026: { m: 2, d: 15 }, 2027: { m: 3, d: 6 } } },
  { key: 'holi', name: 'Holi', emoji: '🎨', cardOccasion: 'Festivals', perYear: { 2026: { m: 3, d: 4 }, 2027: { m: 3, d: 22 } } },
  { key: 'ugadi', name: 'Ugadi / Gudi Padwa', emoji: '🌿', cardOccasion: 'Festivals', perYear: { 2026: { m: 3, d: 19 }, 2027: { m: 4, d: 7 } } },
  { key: 'eid-ul-fitr', name: 'Eid ul-Fitr (approx)', emoji: '🌙', cardOccasion: 'Festivals', perYear: { 2026: { m: 3, d: 20 }, 2027: { m: 3, d: 10 } } },
  { key: 'ram-navami', name: 'Ram Navami', emoji: '🏹', cardOccasion: 'Festivals', perYear: { 2026: { m: 3, d: 26 }, 2027: { m: 4, d: 15 } } },
  { key: 'akshaya-tritiya', name: 'Akshaya Tritiya', emoji: '🪙', cardOccasion: 'Festivals', perYear: { 2026: { m: 4, d: 19 }, 2027: { m: 5, d: 8 } } },
  { key: 'buddha-purnima', name: 'Buddha Purnima', emoji: '☸️', cardOccasion: 'Festivals', perYear: { 2026: { m: 5, d: 1 }, 2027: { m: 5, d: 20 } } },
  { key: 'bakrid', name: 'Eid al-Adha / Bakrid (approx)', emoji: '🕌', cardOccasion: 'Festivals', perYear: { 2026: { m: 5, d: 27 }, 2027: { m: 5, d: 17 } } },
  { key: 'rath-yatra', name: 'Rath Yatra', emoji: '🛕', cardOccasion: 'Festivals', perYear: { 2026: { m: 7, d: 16 }, 2027: { m: 7, d: 6 } } },
  { key: 'guru-purnima', name: 'Guru Purnima', emoji: '📿', cardOccasion: 'Festivals', perYear: { 2026: { m: 7, d: 29 }, 2027: { m: 7, d: 18 } } },
  { key: 'onam', name: 'Onam', emoji: '🌸', cardOccasion: 'Festivals', states: ['Kerala'], perYear: { 2026: { m: 8, d: 26 }, 2027: { m: 9, d: 14 } } },
  { key: 'raksha-bandhan', name: 'Raksha Bandhan', emoji: '🪢', cardOccasion: 'Festivals', perYear: { 2026: { m: 8, d: 28 }, 2027: { m: 8, d: 17 } } },
  { key: 'janmashtami', name: 'Krishna Janmashtami', emoji: '🪈', cardOccasion: 'Festivals', perYear: { 2026: { m: 9, d: 4 }, 2027: { m: 8, d: 25 } } },
  { key: 'ganesh-chaturthi', name: 'Ganesh Chaturthi', emoji: '🕉️', cardOccasion: 'Festivals', perYear: { 2026: { m: 9, d: 14 }, 2027: { m: 9, d: 4 } } },
  { key: 'navratri', name: 'Navratri (begins)', emoji: '🪘', cardOccasion: 'Festivals', perYear: { 2026: { m: 10, d: 11 }, 2027: { m: 9, d: 30 } } },
  { key: 'dussehra', name: 'Dussehra', emoji: '🏹', cardOccasion: 'Festivals', perYear: { 2026: { m: 10, d: 20 }, 2027: { m: 10, d: 9 } } },
  { key: 'karva-chauth', name: 'Karva Chauth', emoji: '🌝', cardOccasion: 'Festivals', perYear: { 2026: { m: 10, d: 29 }, 2027: { m: 10, d: 17 } } },
  { key: 'dhanteras', name: 'Dhanteras', emoji: '🪙', cardOccasion: 'Festivals', perYear: { 2026: { m: 11, d: 6 }, 2027: { m: 10, d: 27 } } },
  { key: 'diwali', name: 'Diwali', emoji: '🪔', cardOccasion: 'Festivals', perYear: { 2026: { m: 11, d: 8 }, 2027: { m: 10, d: 29 } } },
  { key: 'bhai-dooj', name: 'Bhai Dooj', emoji: '🫶', cardOccasion: 'Festivals', perYear: { 2026: { m: 11, d: 10 }, 2027: { m: 10, d: 31 } } },
  { key: 'chhath', name: 'Chhath Puja', emoji: '🌅', cardOccasion: 'Festivals', perYear: { 2026: { m: 11, d: 15 }, 2027: { m: 11, d: 4 } } },
  { key: 'guru-nanak', name: 'Guru Nanak Jayanti', emoji: '🪯', cardOccasion: 'Festivals', perYear: { 2026: { m: 11, d: 24 }, 2027: { m: 11, d: 14 } } },
];

export const ALL_FESTIVALS: Festival[] = [...FIXED_FESTIVALS, ...LUNAR_FESTIVALS];

/** The gallery URL slug for a festival's occasion (for deep-linking a card). */
export const festivalCardSlug = (f: Festival): string => occasionSlug(f.cardOccasion);

/** The month/day of a festival in a given year, if known (fixed, or a filled
 *  per-year date). Null when a lunar festival has no confirmed date that year. */
function dateInYear(f: Festival, year: number): { m: number; d: number } | null {
  if (f.fixed) return f.fixed;
  return f.perYear?.[String(year)] ?? null;
}

/** Upcoming festivals from `on` (defaults to today IST), soonest first, each
 *  with days-away and the date. Lunar festivals without a confirmed date for the
 *  window are omitted (never shown with a wrong date). */
export function upcomingFestivals(count = 6, on?: { y: number; m: number; d: number }): { f: Festival; inDays: number; m: number; d: number; year: number }[] {
  const t = on ?? istToday();
  const base = Date.UTC(t.y, t.m - 1, t.d);
  const out: { f: Festival; inDays: number; m: number; d: number; year: number }[] = [];
  for (const f of ALL_FESTIVALS) {
    let best: { inDays: number; m: number; d: number; year: number } | null = null;
    for (const yr of [t.y, t.y + 1]) {
      const md = dateInYear(f, yr);
      if (!md) continue;
      const inDays = Math.round((Date.UTC(yr, md.m - 1, md.d) - base) / 86400000);
      if (inDays >= 0 && (!best || inDays < best.inDays)) best = { inDays, m: md.m, d: md.d, year: yr };
    }
    if (best) out.push({ f, ...best });
  }
  return out.sort((a, b) => a.inDays - b.inDays).slice(0, count);
}

/** Festivals whose confirmed date is today (IST). */
export function festivalsToday(on?: { y: number; m: number; d: number }): Festival[] {
  const t = on ?? istToday();
  return ALL_FESTIVALS.filter((f) => { const md = dateInYear(f, t.y); return md && md.m === t.m && md.d === t.d; });
}
