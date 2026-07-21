/**
 * Render a slide deck (our Slide model) directly to a 16:9 PDF — so layouts,
 * indented bullets and per-slide images actually export (the .pptx writer keeps
 * the standard title+body, but PDF is full-fidelity). pdf-lib, fully client-side.
 */
import type { Slide, SlideLayout } from './convert.js';
import { bulletLevel } from './pptxExport.js';

export interface SlideTheme { bg?: string; fg?: string; heading?: string; accent?: string }

const W = 720, H = 405, M = 44; // 16:9 points + margin

const rgbOf = (hex: string | undefined, fallback: [number, number, number]) => {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return fallback;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255] as [number, number, number];
};

export async function slidesToPdf(slides: Slide[], theme?: SlideTheme): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const bg = rgbOf(theme?.bg, [1, 1, 1]);
  const fg = rgbOf(theme?.fg, [0.12, 0.16, 0.22]);
  const head = rgbOf(theme?.heading, [0.06, 0.09, 0.16]);
  const accent = rgbOf(theme?.accent, [0.18, 0.36, 1]);

  // Wrap a string to a max width at a font size, returning lines.
  const wrap = (text: string, f: typeof font, size: number, maxW: number): string[] => {
    const words = text.split(/\s+/);
    const out: string[] = [];
    let line = '';
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) > maxW && line) { out.push(line); line = w; } else line = t;
    }
    if (line) out.push(line);
    return out.length ? out : [''];
  };

  for (const s of slides) {
    const page = pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(...bg) });
    const layout: SlideLayout = s.layout ?? 'titleContent';
    const marker = ['•', '–', '·', '·', '·'];

    // Section / title layouts: large centred title.
    if (layout === 'section' || layout === 'title') {
      if (layout === 'section') page.drawRectangle({ x: 0, y: H / 2 - 2, width: W, height: 4, color: rgb(...accent) });
      const size = 30;
      const lines = wrap(s.title || '', bold, size, W - 2 * M);
      let y = H / 2 + (lines.length * size) / 2 + (layout === 'section' ? 22 : 0);
      for (const ln of lines) {
        const w = bold.widthOfTextAtSize(ln, size);
        page.drawText(ln, { x: (W - w) / 2, y, size, font: bold, color: rgb(...head) });
        y -= size * 1.2;
      }
      const sub = s.body.find((b) => b.trim());
      if (sub) { const w = font.widthOfTextAtSize(sub.trim(), 15); page.drawText(sub.trim(), { x: (W - w) / 2, y: y - 6, size: 15, font, color: rgb(...fg) }); }
      continue;
    }

    // Title bar (titleContent / imageRight / blank-with-title).
    let bodyTop = H - M;
    if (layout !== 'blank' && s.title.trim()) {
      page.drawText(s.title, { x: M, y: H - M - 22, size: 24, font: bold, color: rgb(...head) });
      page.drawRectangle({ x: M, y: H - M - 34, width: W - 2 * M, height: 3, color: rgb(...accent) });
      bodyTop = H - M - 52;
    }

    // Image (right half for imageRight, else nothing here).
    let bodyRight = W - M;
    if (layout === 'imageRight' && s.image) {
      try {
        const bytes = Uint8Array.from(atob(s.image.split(',')[1] ?? ''), (c) => c.charCodeAt(0));
        const img = s.image.startsWith('data:image/png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        const boxW = (W - 2 * M) * 0.42, boxH = bodyTop - M;
        const scale = Math.min(boxW / img.width, boxH / img.height);
        const iw = img.width * scale, ih = img.height * scale;
        page.drawImage(img, { x: W - M - iw, y: M + (boxH - ih) / 2, width: iw, height: ih });
        bodyRight = W - M - boxW - 18;
      } catch { /* skip unreadable image */ }
    }

    // Bullets with indent levels + wrapping.
    let y = bodyTop;
    const size = 15;
    for (const raw of s.body) {
      if (!raw.trim()) { y -= size * 0.6; continue; }
      const lvl = bulletLevel(raw);
      const text = raw.replace(/^\t+/, '');
      const indent = M + lvl * 18;
      const lines = wrap(text, font, size, bodyRight - indent - 14);
      page.drawText(marker[Math.min(lvl, 4)]!, { x: indent, y, size, font, color: rgb(...accent) });
      for (let i = 0; i < lines.length; i++) {
        page.drawText(lines[i]!, { x: indent + 14, y, size, font, color: rgb(...fg) });
        y -= size * 1.35;
      }
      if (y < M) break;
    }
  }

  return pdf.save();
}
