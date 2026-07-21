/**
 * Unified card catalog — ONE place that gathers every kind of card the app can
 * make, so the "Cards" gallery browses like a real card store (Greetings-Island
 * style): pick an occasion, see animated + static designs together, open in the
 * studio to edit and download.
 *
 * Sources merged here:
 *   • invitations.ts   — hand-laid invitations & greeting cards (static)
 *   • greetingCards.ts — animated greeting cards (balloons/hearts/confetti…)
 *   • quotes.ts        — quote & motivation posters
 *   • versePosters.ts  — poems / shayari and faith blessings
 *
 * Every entry is normalised to a `CardEntry` with an OCCASION category (so the
 * gallery groups by moment, not by which file it came from) and an `animated`
 * flag + `anim` preset so animated cards open with their entrance motion.
 */
import type { Design } from './model.js';
import type { AnimPreset } from './animate.js';
import { INVITATIONS } from './invitations.js';
import { GREETING_TEMPLATES } from './greetingCards.js';
import { QUOTE_TEMPLATES } from './quotes.js';
import { POEM_TEMPLATES, BLESSING_TEMPLATES } from './versePosters.js';
import { CARD_VARIANTS } from './cardVariants.js';
import { STUDIO_TEMPLATES } from './templates.js';
import { REGIONAL_CARDS } from './regionalCards.js';

export interface CardEntry {
  id: string;
  name: string;
  emoji: string;
  /** Occasion group shown as a filter tab. */
  category: string;
  /** Optional sub-type within the occasion (e.g. Birthday → Kids/Milestone),
   *  used for the two-level occasion → sub-type navigation. */
  subtype?: string;
  /** Set for regional-language cards (e.g. 'ta' Pongal): the gallery shows a
   *  card only when its lang matches the user's language, so people see cards in
   *  their own language. Undefined = language-neutral, always shown. */
  lang?: string;
  /** True for cards that ship with entrance motion (shown with an ✨ badge). */
  animated: boolean;
  anim?: AnimPreset;
  make: () => Design;
}

/** The occasion tabs, ordered the way people browse (most-wanted first). */
export const CARD_OCCASIONS = [
  'All', 'Animated', 'Trending', 'Birthday', 'Wedding', 'Anniversary', 'Baby', 'Love',
  'Thank You', 'Congratulations', 'Get Well', 'Sympathy', 'Party',
  'Festivals', 'Seasonal', 'Quotes', 'Business',
  // Ready-made design packs (reels & social/promo/event templates) surfaced here
  // too, so the hub is the single place for every ready-made design.
  'Reels', 'Social', 'Promos', 'Events',
] as const;

/** Map any card (by id + name + its own category) to one occasion group. */
function occasionOf(id: string, name: string, ownCategory: string): string {
  const s = `${id} ${name} ${ownCategory}`.toLowerCase();
  if (/wedding|marriage|nikah|haldi|mehndi|sangeet|engage|bridal/.test(s)) return 'Wedding';
  if (/anniversar/.test(s)) return 'Anniversary';
  if (/baby|shower|newborn|new baby|gender reveal|naming|kids|christening/.test(s)) return 'Baby';
  if (/birthday|bday|1st|first birthday|turns/.test(s)) return 'Birthday';
  if (/valentine|love|romant|miss you|forever|heart|sorry|i'm sorry|thinking of you|just because|hug/.test(s)) return 'Love';
  if (/thank/.test(s)) return 'Thank You';
  if (/get well|feel better|recover/.test(s)) return 'Get Well';
  if (/sympath|condolence|grief|memory|memorial|farewell/.test(s)) return 'Sympathy';
  if (/congrat|graduat|promotion|new job|new home|retire|welcome|good luck|encourag|got this|exam/.test(s)) return 'Congratulations';
  if (/diwali|eid|holi|rakhi|raksha|navratri|ganesh|ganpati|pongal|onam|ugadi|lohri|baisakhi|bhai|chhath|janmashtami|dussehra|vijayadashami|gurpurab|shivratri|ram navami|hanuman|basant|vishu|bakrid|karva|republic|independence|gandhi|children|durga|mahalaya|dhunuchi|bijoya|sindoor|kali puja|dhanteras|mahavir|buddha|vishwakarma|teej|akshaya|milad|gauri/.test(s)) return 'Festivals';
  if (/christmas|new year|halloween|thanksgiving|easter|hanukkah|mother|father|good morning|good night|weekend|nice day|season/.test(s)) return 'Seasonal';
  if (/webinar|corporate|business|hiring|sale|promo|podcast/.test(s)) return 'Business';
  if (/quote|motivat|discipline|hustle|blessed|grateful|vibes|poem|shayari|doha|blessing|prayer|faith|om |waheguru|bismillah|metta/.test(s)) return 'Quotes';
  return 'Congratulations';
}

const fromInvitations: CardEntry[] = INVITATIONS.map((inv) => ({
  id: `inv-${inv.id}`, name: inv.name, emoji: inv.emoji,
  category: occasionOf(inv.id, inv.name, inv.category), animated: false, make: inv.make,
}));

// Regional New Year festivals — grouped as a Festivals sub-type so people can
// find their region's new year (Ugadi/Gudi Padwa, Baisakhi, Bihu, Poila
// Boishakh, Puthandu, Vishu, Cheti Chand) together.
const REGIONAL_NEW_YEAR = new Set(['gc-ugadi', 'gc-baisakhi', 'gc-bihu', 'gc-poila-boishakh', 'gc-puthandu', 'gc-vishu', 'gc-cheti-chand']);
// Day-wise festival journeys grouped as Festivals sub-types, so people can send
// the right card for the right day of a multi-day festival.
const GANESH_UTSAV = new Set(['gc-ganesh', 'gc-ganpati-aagman', 'gc-ganpati-sthapana', 'gc-gauri-aavahan', 'gc-ganpati-visarjan', 'gc-eco-ganpati', 'gc-bal-ganesha', 'gc-ganpati-tribute', 'gc-ganpati-corporate']);
const DURGA_PUJA = new Set(['gc-mahalaya', 'gc-durga-puja', 'gc-durga-ashtami', 'gc-dhunuchi', 'gc-sindoor-khela', 'gc-bijoya-pronam', 'gc-kali-puja']);
const CHHATH_PUJA = new Set(['gc-chhath', 'gc-chhath-nahay-khay', 'gc-chhath-kharna', 'gc-chhath-arghya', 'gc-chhath-usha-arghya', 'gc-chhath-vratin']);
// National days (15 Aug, 26 Jan, 1 May, 2 Oct, 14 Nov) as their own sub-type.
const NATIONAL_DAYS = new Set(['gc-independence-day-in', 'gc-republic-day-in', 'gc-gandhi-jayanti', 'gc-childrens-day-in', 'gc-labour-day', 'gc-maharashtra-day']);
// Shareable support/awareness/meme posters surfaced in their own "Trending" tab.
const TRENDING = new Set(['gc-support-campaign', 'gc-proud-indian', 'gc-team-india', 'gc-save-nature', 'gc-countdown-bappa', 'gc-voted-today', 'gc-birthday-flex', 'gc-diet-diwali', 'gc-pandal-hopping']);
// Festival-offer posters for shops — surfaced under Business even though their
// names mention festivals (the festival regex would otherwise claim them).
const FORCE_BUSINESS = new Set(['gc-dhanteras-offer', 'gc-diwali-sale', 'gc-ganpati-offer']);
// New festival cards whose names the occasion heuristic doesn't recognise — pin
// them to Festivals explicitly.
const FORCE_FESTIVAL = new Set([...REGIONAL_NEW_YEAR, ...GANESH_UTSAV, ...DURGA_PUJA, ...CHHATH_PUJA, ...NATIONAL_DAYS, 'gc-mahavir-jayanti', 'gc-vishwakarma', 'gc-teej', 'gc-nag-panchami', 'gc-akshaya-tritiya', 'gc-milad', 'gc-vijayadashami', 'gc-dhanteras']);
const greetingSubtype = (id: string): string | undefined =>
  REGIONAL_NEW_YEAR.has(id) ? 'Regional New Year'
  : GANESH_UTSAV.has(id) ? 'Ganesh Utsav'
  : DURGA_PUJA.has(id) ? 'Durga Puja'
  : CHHATH_PUJA.has(id) ? 'Chhath Puja'
  : NATIONAL_DAYS.has(id) ? 'National Days'
  : undefined;
const fromGreetings: CardEntry[] = GREETING_TEMPLATES.map((t) => ({
  id: `gc-${t.id}`, name: t.name, emoji: t.icon,
  category: TRENDING.has(t.id) ? 'Trending' : FORCE_BUSINESS.has(t.id) ? 'Business' : FORCE_FESTIVAL.has(t.id) ? 'Festivals' : occasionOf(t.id, t.name, 'greeting'),
  subtype: greetingSubtype(t.id),
  animated: true, anim: t.anim, make: t.make,
}));

const fromVerses: CardEntry[] = [...QUOTE_TEMPLATES, ...POEM_TEMPLATES, ...BLESSING_TEMPLATES].map((t) => ({
  id: `q-${t.id}`, name: t.name, emoji: t.icon,
  category: 'Quotes', animated: true, anim: t.anim, make: t.make,
}));

const fromVariants: CardEntry[] = CARD_VARIANTS.map((v) => ({
  id: v.id, name: v.name, emoji: v.emoji, category: v.occasion, subtype: v.subtype, animated: false, make: v.make,
}));

// The "Ready-made designs" pack (STUDIO_TEMPLATES) surfaced in the hub too. The
// greeting/quote/poem/blessing templates are ALREADY in the catalog above, so we
// skip those by id to avoid duplicates and add the rest (reels + social / promo /
// business / event / celebration templates). No design is removed anywhere —
// they still appear in the home "Ready-made designs" grid unchanged.
const CATALOGUED_TPL_IDS = new Set([...GREETING_TEMPLATES, ...QUOTE_TEMPLATES, ...POEM_TEMPLATES, ...BLESSING_TEMPLATES].map((t) => t.id));
function occasionForTemplate(cat: string, id: string, name: string): string {
  if (cat === 'Reels') return 'Reels';
  if (cat === 'Social') return 'Social';
  if (cat === 'Promos') return 'Promos';
  if (cat === 'Business') return 'Business';
  if (cat === 'Events') return 'Events';
  return occasionOf(id, name, cat); // Celebrations & anything else → best occasion
}
const fromStudio: CardEntry[] = STUDIO_TEMPLATES.filter((t) => !CATALOGUED_TPL_IDS.has(t.id)).map((t) => ({
  id: `st-${t.id}`, name: t.name, emoji: t.icon,
  category: occasionForTemplate(t.category, t.id, t.name), animated: !!t.anim, anim: t.anim, make: t.make,
}));

const fromRegional: CardEntry[] = REGIONAL_CARDS.map((r) => ({
  id: r.id, name: r.name, emoji: r.emoji, category: r.occasion, lang: r.lang, animated: false, make: r.make,
}));

/** Everything, animated cards first so the gallery leads with motion. */
export const CARD_CATALOG: CardEntry[] = [...fromGreetings, ...fromVerses, ...fromInvitations, ...fromVariants, ...fromStudio, ...fromRegional];

/** Cards for a chosen occasion tab ('All' = everything, 'Animated' = motion
 *  only), optionally narrowed to a sub-type within that occasion.
 *
 *  `lang` is the user's current UI language: regional-language cards are shown
 *  only when they match it (so an English user isn't shown Tamil-script cards,
 *  and a Tamil user sees Tamil cards), and when a non-English language is
 *  active its cards are surfaced FIRST — "cards in your language" up top. */
export function cardsForOccasion(occasion: string, subtype?: string, lang = 'en'): CardEntry[] {
  let list: CardEntry[];
  if (occasion === 'All') list = CARD_CATALOG;
  else if (occasion === 'Animated') list = CARD_CATALOG.filter((c) => c.animated);
  else list = CARD_CATALOG.filter((c) => c.category === occasion);
  if (subtype && subtype !== 'All') list = list.filter((c) => c.subtype === subtype);
  // Hide regional cards that aren't in the active language.
  list = list.filter((c) => !c.lang || c.lang === lang);
  // When a regional language is active, lead with its cards.
  if (lang !== 'en') list = [...list].sort((a, b) => (a.lang === lang ? 0 : 1) - (b.lang === lang ? 0 : 1));
  return list;
}

/** Sub-types available for an occasion (only those that have designs), for the
 *  occasion → sub-type navigation. Derived from the whole catalog so any source
 *  (variants, or tagged greeting cards like "Regional New Year") contributes. */
const SUBTYPE_MAP = (() => {
  const m: Record<string, string[]> = {};
  for (const c of CARD_CATALOG) {
    if (!c.subtype) continue;
    (m[c.category] ??= []);
    if (!m[c.category]!.includes(c.subtype)) m[c.category]!.push(c.subtype);
  }
  return m;
})();
export function subtypesForOccasion(occasion: string): string[] {
  return SUBTYPE_MAP[occasion] ?? [];
}

/** Occasion tabs that actually have at least one card (keeps the bar tidy). */
export function activeOccasions(): string[] {
  return CARD_OCCASIONS.filter((o) => o === 'All' || o === 'Animated' || CARD_CATALOG.some((c) => c.category === o));
}

/** URL slug for an occasion, e.g. 'Thank You' → 'thank-you' (used for
 *  deep-linkable /cards/<slug> URLs and the ?cards=<slug> app param). */
export const occasionSlug = (occ: string): string => occ.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Reverse of occasionSlug: resolve a slug back to a real occasion tab, or
 *  null if it doesn't match any active occasion. */
export function occasionFromSlug(slug: string): string | null {
  const s = (slug || '').toLowerCase();
  return activeOccasions().find((o) => occasionSlug(o) === s) ?? null;
}
