/**
 * Sacred / deity images — REAL classical paintings, not emoji or icons. Every
 * one is a work by Raja Ravi Varma (1848–1906), which is PUBLIC DOMAIN worldwide
 * (author's life + 100 years; published pre-1931), so it's free to use even in a
 * commercial product. We deliberately do NOT use random web-search "god images":
 * those are almost always copyrighted and unsafe to bundle. The files are hosted
 * locally in /public/sacred so the app stays 100% offline and private.
 *
 * To refresh or extend the set legally, see scripts/fetch-sacred-art.mjs.
 */
export interface SacredImage {
  id: string;
  /** Deity / painting name shown under the thumbnail. */
  name: string;
  /** Festival this deity is most associated with (for grouping/hints). */
  festival: string;
  /** Local asset path (served from /public). */
  file: string;
}

export const SACRED_IMAGES: SacredImage[] = [
  { id: 'ganesha', name: 'Ganesha', festival: 'Ganesh Chaturthi', file: '/sacred/ganesha.jpg' },
  { id: 'durga', name: 'Durga', festival: 'Navratri / Dussehra', file: '/sacred/durga.jpg' },
  { id: 'rama', name: 'Ram Darbar', festival: 'Ram Navami / Dussehra', file: '/sacred/rama.jpg' },
  { id: 'radha-krishna', name: 'Radha–Krishna', festival: 'Janmashtami', file: '/sacred/radha-krishna.jpg' },
  { id: 'lakshmi', name: 'Lakshmi', festival: 'Diwali', file: '/sacred/lakshmi.jpg' },
  { id: 'saraswati', name: 'Saraswati', festival: 'Vasant Panchami', file: '/sacred/saraswati.jpg' },
  { id: 'hanuman', name: 'Hanuman', festival: 'Hanuman Jayanti', file: '/sacred/hanuman.jpg' },
  { id: 'shiva', name: 'Shiva', festival: 'Maha Shivratri', file: '/sacred/shiva.jpg' },
  { id: 'kali', name: 'Kali', festival: 'Kali Puja', file: '/sacred/kali.jpg' },
  { id: 'vishnu', name: 'Vishnu', festival: 'Ekadashi', file: '/sacred/vishnu.jpg' },
  { id: 'murugan', name: 'Murugan', festival: 'Thaipusam', file: '/sacred/murugan.jpg' },
  { id: 'sita', name: 'Sita', festival: 'Ram Navami', file: '/sacred/sita.jpg' },
  { id: 'ganga', name: 'Ganga', festival: 'Ganga Dussehra', file: '/sacred/ganga.jpg' },
];

/** Deity painting to feature in an Animated Wish, per occasion id. Only
 *  devotional occasions map here — birthdays and the like stay illustrated. */
export const OCCASION_SACRED: Record<string, string> = {
  ganesh: 'ganesha',
  navratri: 'durga',
  dussehra: 'rama',
  janmashtami: 'radha-krishna',
  diwali: 'lakshmi',
  'saraswati-puja': 'saraswati',
  shivratri: 'shiva',
  'ram-navami': 'rama',
  hanuman: 'hanuman',
  'kali-puja': 'kali',
  onam: 'vishnu',
};

/** The deity image file for an occasion, or undefined if it isn't devotional. */
export const sacredForOccasion = (occasionId: string): SacredImage | undefined => {
  const id = OCCASION_SACRED[occasionId];
  return id ? SACRED_IMAGES.find((s) => s.id === id) : undefined;
};

/** Shown in the picker — public-domain art carries no legal duty to credit, but
 *  naming the artist is respectful and accurate. */
export const SACRED_ATTRIBUTION = 'Classical paintings by Raja Ravi Varma (1848–1906) · public domain';
