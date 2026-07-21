/**
 * SVG clipart library — crisp, colourful vector decorations (flowers, balloons,
 * party bits, hearts, nature, frames) that drop onto a design as ordinary image
 * elements. Unlike emoji stickers, these are true vectors: they scale without
 * blur, look identical on every device, and rasterize cleanly in GIF/PNG/video
 * exports (resvg renders the same SVG). Each item is a self-contained
 * `<svg viewBox="0 0 100 100">` string with width/height so it loads with the
 * right aspect ratio; `svgToDataUrl` wraps it for an <image href>.
 *
 * Pure/dependency-free so it's unit-testable and safe to import anywhere.
 */

export type ClipartCategory = 'Flowers' | 'Balloons' | 'Party' | 'Hearts' | 'Nature' | 'Frames' | 'Rangoli';
export const CLIPART_CATEGORIES: ClipartCategory[] = ['Flowers', 'Balloons', 'Party', 'Hearts', 'Nature', 'Frames', 'Rangoli'];

export interface ClipartItem { id: string; name: string; category: ClipartCategory; svg: string }

/** Wrap a 100×100 body in a standalone SVG document. */
const svg = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">${body}</svg>`;

/** Encode an SVG string as a data URL usable in <image href>/<img src>. */
export const svgToDataUrl = (s: string): string => `data:image/svg+xml;utf8,${encodeURIComponent(s)}`;

/** A ring of petals around a centre — the base for several flowers. */
const petalFlower = (petal: string, centre: string, n = 8): string => {
  let out = '';
  for (let i = 0; i < n; i++) {
    const a = (360 / n) * i;
    out += `<ellipse cx="50" cy="26" rx="9" ry="18" fill="${petal}" transform="rotate(${a} 50 50)"/>`;
  }
  return svg(`${out}<circle cx="50" cy="50" r="12" fill="${centre}"/>`);
};

/** Repeat a motif body around the centre (50,50) with `n`-fold rotational
 *  symmetry — the essence of a rangoli / kolam. */
const radial = (motif: string, n: number): string => {
  let out = '';
  for (let i = 0; i < n; i++) out += `<g transform="rotate(${(360 / n) * i} 50 50)">${motif}</g>`;
  return out;
};

export const CLIPART: ClipartItem[] = [
  // ── Flowers ──────────────────────────────────────────────────────────────
  { id: 'cl-daisy', name: 'Daisy', category: 'Flowers', svg: petalFlower('#ffffff', '#f6c445', 10) },
  { id: 'cl-sunflower', name: 'Sunflower', category: 'Flowers', svg: petalFlower('#f6b21b', '#7a4a1e', 12) },
  { id: 'cl-bloom', name: 'Pink bloom', category: 'Flowers', svg: petalFlower('#f9a8d4', '#be185d', 6) },
  { id: 'cl-cornflower', name: 'Cornflower', category: 'Flowers', svg: petalFlower('#8b9bff', '#3b3f8f', 8) },
  {
    id: 'cl-tulip', name: 'Tulip', category: 'Flowers',
    svg: svg('<path d="M50 92 V54" stroke="#3f9d4f" stroke-width="5" fill="none"/><path d="M32 60 q-14 -6 -6 -20" stroke="#3f9d4f" stroke-width="5" fill="none"/><path d="M30 40 q6 -22 20 -22 q14 0 20 22 q-8 12 -20 12 q-12 0 -20 -12Z" fill="#e0559a"/><path d="M50 18 v34" stroke="#c02f78" stroke-width="3"/>'),
  },
  {
    id: 'cl-rose', name: 'Rose', category: 'Flowers',
    svg: svg('<circle cx="50" cy="46" r="30" fill="#e11d48"/><path d="M50 26 a20 20 0 0 1 0 40 a14 14 0 0 1 0 -28 a9 9 0 0 1 0 18" fill="none" stroke="#9f1239" stroke-width="3.5"/><path d="M50 84 V66" stroke="#3f9d4f" stroke-width="5"/><path d="M50 74 q12 2 16 -8" stroke="#3f9d4f" stroke-width="5" fill="none"/>'),
  },
  {
    id: 'cl-lotus', name: 'Lotus', category: 'Flowers',
    svg: svg('<g fill="#f472b6"><path d="M50 78 C35 60 35 40 50 24 C65 40 65 60 50 78Z"/><path d="M50 78 C30 68 24 50 26 34 C46 40 54 58 50 78Z" opacity="0.9"/><path d="M50 78 C70 68 76 50 74 34 C54 40 46 58 50 78Z" opacity="0.9"/></g><path d="M20 78 q30 14 60 0" fill="none" stroke="#22c1a6" stroke-width="4"/>'),
  },

  // ── Balloons ─────────────────────────────────────────────────────────────
  {
    id: 'cl-balloon', name: 'Balloon', category: 'Balloons',
    svg: svg('<path d="M50 66 C34 66 28 48 32 34 C36 20 64 20 68 34 C72 48 66 66 50 66Z" fill="#ef4444"/><path d="M46 62 l8 0 l-4 8Z" fill="#dc2626"/><path d="M50 70 q6 10 -2 22" fill="none" stroke="#94a3b8" stroke-width="2"/>'),
  },
  {
    id: 'cl-balloon-heart', name: 'Heart balloon', category: 'Balloons',
    svg: svg('<path d="M50 60 C30 44 34 24 50 34 C66 24 70 44 50 60Z" fill="#ec4899"/><path d="M48 58 l4 0 l-2 10Z" fill="#db2777"/><path d="M50 66 q6 10 -2 24" fill="none" stroke="#94a3b8" stroke-width="2"/>'),
  },
  {
    id: 'cl-balloons3', name: 'Balloon bunch', category: 'Balloons',
    svg: svg('<path d="M32 52 C22 52 18 38 22 28 C26 18 44 18 44 30 C44 42 42 52 32 52Z" fill="#3b82f6"/><path d="M68 52 C58 52 56 42 56 30 C56 18 74 18 78 28 C82 38 78 52 68 52Z" fill="#f59e0b"/><path d="M50 60 C38 60 34 44 40 32 C46 20 58 24 60 36 C62 50 62 60 50 60Z" fill="#ef4444"/><path d="M32 54 q4 18 18 30 M68 54 q-4 18 -18 30 M50 62 v22" fill="none" stroke="#94a3b8" stroke-width="1.6"/>'),
  },

  // ── Party ────────────────────────────────────────────────────────────────
  {
    id: 'cl-gift', name: 'Gift box', category: 'Party',
    svg: svg('<rect x="24" y="44" width="52" height="40" rx="4" fill="#3b82f6"/><rect x="24" y="34" width="52" height="14" rx="3" fill="#2563eb"/><rect x="45" y="34" width="10" height="50" fill="#f59e0b"/><path d="M50 34 C40 22 24 26 34 34 M50 34 C60 22 76 26 66 34" fill="none" stroke="#f59e0b" stroke-width="5"/>'),
  },
  {
    id: 'cl-party-hat', name: 'Party hat', category: 'Party',
    svg: svg('<path d="M50 16 L70 78 L30 78Z" fill="#a855f7"/><circle cx="50" cy="16" r="6" fill="#f59e0b"/><g fill="#fde047"><circle cx="44" cy="42" r="3"/><circle cx="56" cy="54" r="3"/><circle cx="46" cy="66" r="3"/></g>'),
  },
  {
    id: 'cl-popper', name: 'Party popper', category: 'Party',
    svg: svg('<path d="M22 82 L44 60 L60 76Z" fill="#ef4444"/><g><circle cx="60" cy="34" r="4" fill="#f59e0b"/><circle cx="74" cy="46" r="4" fill="#22c55e"/><circle cx="52" cy="22" r="4" fill="#3b82f6"/><circle cx="78" cy="28" r="4" fill="#ec4899"/><rect x="66" y="58" width="7" height="7" fill="#a855f7" transform="rotate(20 69 61)"/></g>'),
  },
  {
    id: 'cl-bunting', name: 'Bunting flags', category: 'Party',
    svg: svg('<path d="M8 30 q42 22 84 0" fill="none" stroke="#64748b" stroke-width="2"/><g><path d="M16 32 l12 2 l-4 14Z" fill="#ef4444"/><path d="M32 35 l12 1 l-5 14Z" fill="#3b82f6"/><path d="M50 36 l12 0 l-6 14Z" fill="#22c55e"/><path d="M66 35 l12 -1 l-7 13Z" fill="#f59e0b"/></g>'),
  },
  {
    id: 'cl-candle', name: 'Candle', category: 'Party',
    svg: svg('<rect x="42" y="40" width="16" height="46" rx="3" fill="#f472b6"/><rect x="42" y="40" width="16" height="46" rx="3" fill="url(#cs)"/><defs><linearGradient id="cs" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><path d="M50 40 V30" stroke="#0f172a" stroke-width="2"/><path d="M50 14 C44 22 56 22 50 30 C46 24 54 24 50 14Z" fill="#f59e0b"/>'),
  },
  {
    id: 'cl-star-badge', name: 'Star badge', category: 'Party',
    svg: svg('<circle cx="50" cy="50" r="34" fill="#f59e0b"/><circle cx="50" cy="50" r="26" fill="#fbbf24"/><path d="M50 30 l6 13 14 2 -10 10 3 14 -13 -7 -13 7 3 -14 -10 -10 14 -2Z" fill="#fff"/>'),
  },

  // ── Hearts ───────────────────────────────────────────────────────────────
  { id: 'cl-heart', name: 'Heart', category: 'Hearts', svg: svg('<path d="M50 82 C18 58 22 26 50 42 C78 26 82 58 50 82Z" fill="#ef4444"/>') },
  { id: 'cl-heart-pink', name: 'Pink heart', category: 'Hearts', svg: svg('<path d="M50 82 C18 58 22 26 50 42 C78 26 82 58 50 82Z" fill="#f472b6"/><path d="M40 44 q-4 8 4 16" fill="none" stroke="#fff" stroke-width="4" opacity=".6"/>') },
  {
    id: 'cl-hearts2', name: 'Two hearts', category: 'Hearts',
    svg: svg('<path d="M38 64 C16 48 20 26 38 38 C56 26 60 48 38 64Z" fill="#ec4899"/><path d="M66 78 C48 64 52 46 66 56 C80 46 84 64 66 78Z" fill="#ef4444"/>'),
  },
  {
    id: 'cl-heart-arrow', name: 'Heart & arrow', category: 'Hearts',
    svg: svg('<path d="M50 80 C20 58 24 28 50 44 C76 28 80 58 50 80Z" fill="#e11d48"/><path d="M14 40 L86 68" stroke="#7c3aed" stroke-width="4"/><path d="M86 68 l-12 -2 6 -10Z" fill="#7c3aed"/><path d="M14 40 l12 -2 -6 10Z" fill="#7c3aed"/>'),
  },

  // ── Nature ───────────────────────────────────────────────────────────────
  {
    id: 'cl-sun', name: 'Sun', category: 'Nature',
    svg: svg('<g stroke="#f59e0b" stroke-width="5" stroke-linecap="round"><path d="M50 10V22M50 78V90M10 50H22M78 50H90M22 22l8 8M78 22l-8 8M22 78l8-8M78 78l-8-8"/></g><circle cx="50" cy="50" r="20" fill="#fbbf24"/>'),
  },
  {
    id: 'cl-cloud', name: 'Cloud', category: 'Nature',
    svg: svg('<g fill="#bae6fd"><circle cx="38" cy="54" r="16"/><circle cx="58" cy="50" r="20"/><circle cx="70" cy="58" r="13"/><rect x="34" y="56" width="42" height="16" rx="8"/></g>'),
  },
  {
    id: 'cl-rainbow', name: 'Rainbow', category: 'Nature',
    svg: svg('<g fill="none" stroke-width="7"><path d="M14 76 a36 36 0 0 1 72 0" stroke="#ef4444"/><path d="M22 76 a28 28 0 0 1 56 0" stroke="#f59e0b"/><path d="M30 76 a20 20 0 0 1 40 0" stroke="#22c55e"/><path d="M38 76 a12 12 0 0 1 24 0" stroke="#3b82f6"/></g>'),
  },
  {
    id: 'cl-star', name: 'Star', category: 'Nature',
    svg: svg('<path d="M50 12 l10 26 28 2 -22 18 8 27 -24 -15 -24 15 8 -27 -22 -18 28 -2Z" fill="#fbbf24" stroke="#f59e0b" stroke-width="2"/>'),
  },
  {
    id: 'cl-moon', name: 'Crescent moon', category: 'Nature',
    svg: svg('<path d="M64 20 A34 34 0 1 0 64 80 A26 26 0 1 1 64 20Z" fill="#fcd34d"/>'),
  },
  {
    id: 'cl-leaf', name: 'Leaf', category: 'Nature',
    svg: svg('<path d="M22 78 C22 40 50 18 80 22 C80 60 52 82 22 78Z" fill="#34c759"/><path d="M28 74 C44 54 62 40 76 30" fill="none" stroke="#15803d" stroke-width="3"/>'),
  },

  // ── Frames & banners ─────────────────────────────────────────────────────
  {
    id: 'cl-ribbon', name: 'Ribbon banner', category: 'Frames',
    svg: svg('<path d="M12 40 h76 v20 h-76Z" fill="#ef4444"/><path d="M4 44 l10 6 -10 6Z" fill="#b91c1c"/><path d="M96 44 l-10 6 10 6Z" fill="#b91c1c"/><path d="M12 60 l8 8 v-8Z M88 60 l-8 8 v-8Z" fill="#991b1b"/>'),
  },
  {
    id: 'cl-seal', name: 'Award seal', category: 'Frames',
    svg: svg('<g fill="#3b82f6"><path d="M42 62 l-8 24 16 -8 16 8 -8 -24Z"/></g><circle cx="50" cy="42" r="26" fill="#f59e0b"/><circle cx="50" cy="42" r="19" fill="#fbbf24"/><path d="M50 28 l4 9 10 1 -7 7 2 10 -9 -5 -9 5 2 -10 -7 -7 10 -1Z" fill="#fff"/>'),
  },
  {
    id: 'cl-wreath', name: 'Laurel wreath', category: 'Frames',
    svg: svg('<g fill="none" stroke="#3f9d4f" stroke-width="4"><path d="M50 86 C24 74 20 44 34 20"/><path d="M50 86 C76 74 80 44 66 20"/></g><g fill="#4ade80"><ellipse cx="30" cy="34" rx="6" ry="3" transform="rotate(-40 30 34)"/><ellipse cx="26" cy="50" rx="6" ry="3" transform="rotate(-20 26 50)"/><ellipse cx="28" cy="66" rx="6" ry="3"/><ellipse cx="70" cy="34" rx="6" ry="3" transform="rotate(40 70 34)"/><ellipse cx="74" cy="50" rx="6" ry="3" transform="rotate(20 74 50)"/><ellipse cx="72" cy="66" rx="6" ry="3"/></g>'),
  },
  {
    id: 'cl-speech', name: 'Speech bubble', category: 'Frames',
    svg: svg('<path d="M18 22 h64 a8 8 0 0 1 8 8 v30 a8 8 0 0 1 -8 8 H44 l-14 14 v-14 H18 a8 8 0 0 1 -8 -8 V30 a8 8 0 0 1 8 -8Z" fill="#8b5cf6"/><g fill="#fff"><circle cx="34" cy="45" r="4"/><circle cx="50" cy="45" r="4"/><circle cx="66" cy="45" r="4"/></g>'),
  },
  {
    id: 'cl-bow', name: 'Bow', category: 'Frames',
    svg: svg('<path d="M50 50 L22 34 v32Z" fill="#ec4899"/><path d="M50 50 L78 34 v32Z" fill="#ec4899"/><path d="M50 50 L22 34 v32Z M50 50 L78 34 v32Z" fill="url(#bg)"/><defs><linearGradient id="bg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><circle cx="50" cy="50" r="9" fill="#be185d"/>'),
  },
  {
    id: 'cl-sparkle', name: 'Sparkles', category: 'Frames',
    svg: svg('<g fill="#fbbf24"><path d="M50 20 C52 38 56 42 74 44 C56 46 52 50 50 68 C48 50 44 46 26 44 C44 42 48 38 50 20Z"/><path d="M74 62 C75 71 77 73 84 74 C77 75 75 77 74 84 C73 77 71 75 64 74 C71 73 73 71 74 62Z"/><path d="M26 60 C27 67 28 68 34 69 C28 70 27 71 26 78 C25 71 24 70 18 69 C24 68 25 67 26 60Z"/></g>'),
  },

  // ── Rangoli & regional motifs ────────────────────────────────────────────
  // Floor-art of India: rangoli (colourful radial), kolam (looping line-art
  // around dots, Tamil Nadu), warli (tribal figures, Maharashtra), plus the
  // diya, paisley and lotus mandala that decorate festival cards.
  {
    id: 'cl-rangoli', name: 'Rangoli', category: 'Rangoli',
    svg: svg(`${radial('<ellipse cx="50" cy="24" rx="7" ry="16" fill="#f97316"/>', 8)}${radial('<ellipse cx="50" cy="34" rx="4" ry="9" fill="#ec4899"/>', 8)}<circle cx="50" cy="50" r="10" fill="#facc15"/><circle cx="50" cy="50" r="4" fill="#dc2626"/>${radial('<circle cx="50" cy="16" r="2.4" fill="#7c3aed"/>', 8)}`),
  },
  {
    id: 'cl-rangoli-star', name: 'Star rangoli', category: 'Rangoli',
    svg: svg(`${radial('<path d="M50 12 L57 44 L43 44Z" fill="#22c55e"/>', 6)}${radial('<path d="M50 20 L55 46 L45 46Z" fill="#f59e0b"/>', 6)}<circle cx="50" cy="50" r="12" fill="#3b82f6"/><circle cx="50" cy="50" r="6" fill="#fde047"/>${radial('<circle cx="50" cy="14" r="2.2" fill="#ef4444"/>', 12)}`),
  },
  {
    id: 'cl-kolam', name: 'Kolam', category: 'Rangoli',
    svg: svg(`<g fill="none" stroke="#7c3aed" stroke-width="3" stroke-linecap="round">${radial('<path d="M50 50 q18 -10 0 -30 q-18 20 0 30Z"/>', 4)}</g><g fill="#f472b6">${radial('<circle cx="50" cy="18" r="3"/>', 4)}</g><g fill="#0ea5e9"><circle cx="50" cy="50" r="4"/><circle cx="30" cy="30" r="2.4"/><circle cx="70" cy="30" r="2.4"/><circle cx="30" cy="70" r="2.4"/><circle cx="70" cy="70" r="2.4"/></g>`),
  },
  {
    id: 'cl-diya', name: 'Diya lamp', category: 'Rangoli',
    svg: svg('<path d="M22 62 q28 20 56 0 q-8 10 -28 10 q-20 0 -28 -10Z" fill="#b45309"/><path d="M22 62 q28 14 56 0" fill="none" stroke="#f59e0b" stroke-width="3"/><ellipse cx="50" cy="60" rx="9" ry="4" fill="#fde68a"/><path d="M50 56 C44 46 56 44 50 30 C46 42 54 44 50 56Z" fill="#f97316"/><path d="M50 50 C47 44 53 43 50 34 C48 42 52 44 50 50Z" fill="#fde047"/>'),
  },
  {
    id: 'cl-warli-dance', name: 'Warli dancers', category: 'Rangoli',
    svg: svg('<rect x="4" y="4" width="92" height="92" rx="6" fill="#8a4b2b"/><g fill="none" stroke="#f5e9dc" stroke-width="2.4" stroke-linecap="round"><g transform="translate(24 50)"><circle cx="0" cy="-14" r="4"/><path d="M0 -10 V4"/><path d="M-8 -4 L0 -2 L8 -8"/><path d="M0 4 L-7 16 M0 4 L7 16"/></g><g transform="translate(50 50)"><circle cx="0" cy="-14" r="4"/><path d="M0 -10 V4"/><path d="M-8 -8 L0 -2 L8 -4"/><path d="M0 4 L-7 16 M0 4 L7 16"/></g><g transform="translate(76 50)"><circle cx="0" cy="-14" r="4"/><path d="M0 -10 V4"/><path d="M-8 -4 L0 -2 L8 -8"/><path d="M0 4 L-7 16 M0 4 L7 16"/></g></g>'),
  },
  {
    id: 'cl-warli-sun', name: 'Warli sun', category: 'Rangoli',
    svg: svg(`<rect x="4" y="4" width="92" height="92" rx="6" fill="#8a4b2b"/><g stroke="#f5e9dc" stroke-width="2.4" stroke-linecap="round">${radial('<path d="M50 22 V8"/>', 12)}</g><circle cx="50" cy="50" r="16" fill="none" stroke="#f5e9dc" stroke-width="2.6"/><circle cx="50" cy="50" r="6" fill="#f5e9dc"/>`),
  },
  {
    id: 'cl-paisley', name: 'Paisley', category: 'Rangoli',
    svg: svg('<path d="M40 88 C10 70 18 30 48 22 C74 15 84 44 66 56 C54 64 40 58 44 46 C46 40 54 40 56 46" fill="none" stroke="#0d9488" stroke-width="5"/><path d="M40 88 C14 70 22 34 48 26 C70 20 78 44 64 54" fill="#5eead4" opacity=".55"/><g fill="#f59e0b"><circle cx="46" cy="40" r="3"/><circle cx="40" cy="52" r="3"/><circle cx="40" cy="66" r="3"/></g>'),
  },
  {
    id: 'cl-mandala', name: 'Lotus mandala', category: 'Rangoli',
    svg: svg(`${radial('<path d="M50 50 C42 34 58 34 50 50Z M50 12 C44 26 56 26 50 12Z" fill="#c084fc"/>', 12)}${radial('<path d="M50 22 C45 32 55 32 50 22Z" fill="#f472b6"/>', 12)}<circle cx="50" cy="50" r="9" fill="#f59e0b"/><circle cx="50" cy="50" r="4" fill="#fff7ed"/>`),
  },
];

export const clipartByCategory = (cat: ClipartCategory): ClipartItem[] => CLIPART.filter((c) => c.category === cat);
