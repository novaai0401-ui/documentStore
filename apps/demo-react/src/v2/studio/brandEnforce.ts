/**
 * Brand enforcement — keep a design true to its active brand kit. Pure, DOM-free
 * and unit-tested: audit a design for colours/fonts that aren't in the kit, and
 * snap them to the nearest brand colour / the brand fonts in one click. Canva
 * only does this on paid Teams plans; here it's local and free.
 */
import type { Design, Element } from './model.js';
import type { BrandKit } from './brandStore.js';

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()) || /^#?([0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Squared RGB distance (Infinity if either colour can't be parsed). */
export function colorDistance(a: string, b: string): number {
  const x = hexToRgb(a), y = hexToRgb(b);
  if (!x || !y) return Infinity;
  return (x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2;
}

/** The palette colour closest to `color` (returns `color` unchanged if nothing parses). */
export function nearestBrandColor(color: string, palette: string[]): string {
  let best = color, bestD = Infinity;
  for (const p of palette) { const d = colorDistance(color, p); if (d < bestD) { bestD = d; best = p; } }
  return bestD === Infinity ? color : best;
}

const norm = (c: string) => c.trim().toLowerCase();
const colorsOf = (el: Element): string[] =>
  el.type === 'text' ? [el.color]
  : el.type === 'rect' ? [el.fill, ...(el.stroke ? [el.stroke] : [])]
  : el.type === 'ellipse' ? [el.fill, ...(el.stroke ? [el.stroke] : [])]
  : el.type === 'line' ? [el.stroke]
  : [];

/** Colours/fonts used by the design that are NOT part of the brand kit. */
export function brandAudit(d: Design, brand: BrandKit): { offColors: string[]; offFonts: string[]; total: number } {
  const palette = new Set(brand.colors.map(norm));
  const brandFonts = new Set([brand.fonts.heading, brand.fonts.body].map(norm));
  const offColors = new Set<string>();
  const offFonts = new Set<string>();
  for (const el of d.elements) {
    for (const c of colorsOf(el)) if (!palette.has(norm(c))) offColors.add(norm(c));
    if (el.type === 'text' && !brandFonts.has(norm(el.font))) offFonts.add(el.font);
  }
  return { offColors: [...offColors], offFonts: [...offFonts], total: offColors.size + offFonts.size };
}

/** Snap every off-brand colour to the nearest brand colour, and every text font to
 *  a brand font (heading for bold/large text, body otherwise). Returns a new Design. */
export function applyBrand(d: Design, brand: BrandKit): Design {
  const palette = brand.colors;
  const elements = d.elements.map((el): Element => {
    const font = el.type === 'text' ? (el.weight >= 700 ? brand.fonts.heading : brand.fonts.body) : undefined;
    switch (el.type) {
      case 'text': return { ...el, color: nearestBrandColor(el.color, palette), font: font! };
      case 'rect': return { ...el, fill: nearestBrandColor(el.fill, palette), ...(el.stroke ? { stroke: nearestBrandColor(el.stroke, palette) } : {}) };
      case 'ellipse': return { ...el, fill: nearestBrandColor(el.fill, palette), ...(el.stroke ? { stroke: nearestBrandColor(el.stroke, palette) } : {}) };
      case 'line': return { ...el, stroke: nearestBrandColor(el.stroke, palette) };
      default: return el;
    }
  });
  return { ...d, elements };
}
