/**
 * Turn an active brand kit (logo + palette + fonts) into a document DocTheme, so
 * the Word, spreadsheet, slide and text editors can offer "your brand" as a theme
 * alongside the built-in presets. We pick readable roles from the palette:
 * the primary colour becomes the accent, the darkest becomes headings/body text,
 * and a near-white (or white) becomes the page background.
 */
import type { DocTheme } from './themes.js';
import type { BrandKit } from './brandStore.js';

/** Perceived luminance 0..1 of a #rrggbb colour. */
function luminance(hex: string): number {
  const x = hex.replace('#', '');
  if (x.length < 6) return 0.5;
  const r = parseInt(x.slice(0, 2), 16), g = parseInt(x.slice(2, 4), 16), b = parseInt(x.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function brandKitToTheme(kit: BrandKit): DocTheme {
  const colors = kit.colors.length ? kit.colors : ['#2e5bff', '#0f172a'];
  const accent = colors[0]!;
  const sorted = [...colors].sort((a, b) => luminance(a) - luminance(b));
  const darkest = sorted[0]!;
  const lightest = sorted[sorted.length - 1]!;
  const heading = luminance(darkest) < 0.5 ? darkest : '#0f172a';
  const bg = luminance(lightest) > 0.85 ? lightest : '#ffffff';
  return {
    id: 'brand:' + kit.id,
    name: kit.name + ' (brand)',
    bg,
    panel: '#ffffff',
    fg: heading,
    heading,
    accent,
    fontHeading: kit.fonts.heading,
    fontBody: kit.fonts.body,
  };
}
