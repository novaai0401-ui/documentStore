import { describe, it, expect } from 'vitest';
import { CARD_CATALOG, cardsForOccasion, activeOccasions, occasionSlug, occasionFromSlug } from './cardCatalog.js';

describe('unified card catalog', () => {
  it('merges every card source into one large gallery with unique ids', () => {
    expect(CARD_CATALOG.length).toBeGreaterThanOrEqual(90);
    const ids = CARD_CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CARD_CATALOG) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.emoji.length).toBeGreaterThan(0);
      expect(typeof c.category).toBe('string');
    }
  });

  it('every card builds a valid Design', () => {
    for (const c of CARD_CATALOG) {
      const d = c.make();
      expect(d.w).toBeGreaterThan(0);
      expect(d.h).toBeGreaterThan(0);
      expect(d.elements.length).toBeGreaterThan(1);
    }
  });

  it('has a healthy number of animated cards, each with an anim preset', () => {
    const animated = CARD_CATALOG.filter((c) => c.animated);
    expect(animated.length).toBeGreaterThanOrEqual(40);
    for (const c of animated) expect(typeof c.anim === 'string' || c.anim === undefined).toBe(true);
  });

  it('occasion filters return the right subsets', () => {
    // 'All' in English = every language-neutral card (regional cards are gated).
    expect(cardsForOccasion('All', undefined, 'en').length).toBe(CARD_CATALOG.filter((c) => !c.lang).length);
    expect(cardsForOccasion('Animated').every((c) => c.animated)).toBe(true);
    for (const occ of ['Birthday', 'Wedding', 'Festivals', 'Thank You']) {
      const list = cardsForOccasion(occ);
      expect(list.length).toBeGreaterThan(0);
      expect(list.every((c) => c.category === occ)).toBe(true);
    }
  });

  it('regional cards are language-gated and surfaced in the active language', () => {
    // A Tamil user sees Tamil cards; an English user does not.
    const ta = cardsForOccasion('Festivals', undefined, 'ta');
    expect(ta.some((c) => c.lang === 'ta')).toBe(true);
    expect(ta.every((c) => !c.lang || c.lang === 'ta')).toBe(true);
    // Tamil cards come first when Tamil is active.
    expect(ta[0]?.lang).toBe('ta');
    const en = cardsForOccasion('Festivals', undefined, 'en');
    expect(en.every((c) => !c.lang)).toBe(true);
  });

  it('every home deep-link occasion is a real, non-empty tab', () => {
    // The occasion shortcut chips on the home deep-link into these tabs.
    const deepLinks = ['Animated', 'Birthday', 'Wedding', 'Anniversary', 'Baby', 'Love', 'Thank You', 'Congratulations', 'Get Well', 'Festivals', 'Seasonal'];
    const active = activeOccasions();
    for (const occ of deepLinks) {
      expect(active).toContain(occ);
      expect(cardsForOccasion(occ).length).toBeGreaterThan(0);
    }
  });

  it('occasion slugs are url-safe and round-trip back to the occasion', () => {
    expect(occasionSlug('Thank You')).toBe('thank-you');
    expect(occasionSlug('Get Well')).toBe('get-well');
    expect(occasionSlug('Birthday')).toBe('birthday');
    for (const occ of activeOccasions()) {
      const slug = occasionSlug(occ);
      expect(slug).toMatch(/^[a-z0-9-]+$/);
      expect(occasionFromSlug(slug)).toBe(occ);
    }
    // Unknown slugs resolve to null (caller falls back to 'All').
    expect(occasionFromSlug('not-a-real-occasion')).toBeNull();
  });

  it('groups regional new years and covers the added festivals', () => {
    const rny = cardsForOccasion('Festivals', 'Regional New Year');
    const names = rny.map((c) => c.name).join(' | ');
    for (const f of ['Baisakhi', 'Ugadi', 'Bihu', 'Poila', 'Puthandu', 'Vishu', 'Cheti']) expect(names).toContain(f);
    // The newly added festivals exist in the catalog.
    const all = CARD_CATALOG.map((c) => c.name).join(' | ');
    for (const f of ['Mahavir', 'Vishwakarma', 'Kali Puja', 'Teej', 'Nag Panchami', 'Akshaya', 'Milad']) expect(all).toContain(f);
  });

  it('covers day-wise Ganesh Utsav / Durga Puja / Chhath journeys and national days', () => {
    const ganesh = cardsForOccasion('Festivals', 'Ganesh Utsav');
    const gNames = ganesh.map((c) => c.name).join(' | ');
    // Day-wise journey + themed variants (eco, kids, profession tribute, corporate).
    for (const n of ['Aagman', 'Visarjan', 'Aarti Invitation', 'Gauri', 'Eco-Friendly', 'Bal Ganesha', 'Heroes', 'Corporate']) expect(gNames).toContain(n);
    const durga = cardsForOccasion('Festivals', 'Durga Puja');
    const dNames = durga.map((c) => c.name).join(' | ');
    for (const n of ['Mahalaya', 'Durga Puja', 'Ashtami', 'Dhunuchi', 'Sindoor', 'Bijoya']) expect(dNames).toContain(n);
    const chhath = cardsForOccasion('Festivals', 'Chhath Puja');
    const cNames = chhath.map((c) => c.name).join(' | ');
    for (const n of ['Nahay Khay', 'Kharna', 'Sandhya Arghya', 'Usha Arghya', 'Vratin']) expect(cNames).toContain(n);
    const national = cardsForOccasion('Festivals', 'National Days');
    for (const n of ['Independence', 'Republic', 'Labour', 'Maharashtra', "Children's"]) expect(national.map((c) => c.name).join(' | ')).toContain(n);
  });

  it('offers festival-commerce posters for shops under Business', () => {
    const business = cardsForOccasion('Business');
    const names = business.map((c) => c.name).join(' | ');
    for (const n of ['Dhanteras Offer', 'Diwali Dhamaka', 'Ganpati Special']) expect(names).toContain(n);
    // Dhanteras greeting itself lives with the festivals.
    expect(cardsForOccasion('Festivals').some((c) => c.id === 'gc-gc-dhanteras')).toBe(true);
  });

  it('has a non-empty Trending tab of animated share posters', () => {
    const trending = cardsForOccasion('Trending');
    expect(trending.length).toBeGreaterThanOrEqual(8);
    expect(trending.every((c) => c.category === 'Trending')).toBe(true);
    const names = trending.map((c) => c.name).join(' | ');
    for (const n of ['I Support', 'Countdown', 'Voter', 'Birthday Flex', 'Diet', 'Pandal']) expect(names).toContain(n);
    expect(activeOccasions()).toContain('Trending');
    // Story-format (9:16) cards exist for status/reels sharing.
    expect(trending.some((c) => { const d = c.make(); return d.h > d.w * 1.5; })).toBe(true);
  });

  it('offers Durga Puja and Chhath in regional languages', () => {
    expect(cardsForOccasion('Festivals', undefined, 'bn').some((c) => c.id === 'rg-durga-bn')).toBe(true);
    expect(cardsForOccasion('Festivals', undefined, 'hi').some((c) => c.id === 'rg-chhath-hi')).toBe(true);
    expect(cardsForOccasion('Festivals', undefined, 'gu').some((c) => c.id === 'rg-navratri-gu')).toBe(true);
  });

  it('active occasions start with All + Animated and only include non-empty groups', () => {
    const occ = activeOccasions();
    expect(occ[0]).toBe('All');
    expect(occ).toContain('Animated');
    for (const o of occ) {
      if (o === 'All' || o === 'Animated') continue;
      expect(CARD_CATALOG.some((c) => c.category === o)).toBe(true);
    }
  });
});
