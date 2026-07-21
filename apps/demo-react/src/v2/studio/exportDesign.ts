/**
 * Export a Design to a file, entirely in the browser. The design is first
 * rendered to a raster (SVG → off-screen canvas) so what you see is exactly what
 * you get; the raster is then either downloaded as PNG or embedded full-bleed into
 * a PDF page sized to the artboard. Only data-URI / same-origin images are used,
 * so the canvas never taints and nothing is uploaded.
 */
import { designToSvg, newElId, type Design, type TextEl } from './model.js';
import { rasterizeDesign } from './designRaster.js';
import { downloadBytes } from '../smart/util.js';

/** Free-tier export watermark — a small, translucent "Made with Pyntra" mark in
 *  the bottom-right corner. Pyntra Pro exports pass `watermark: false` to omit
 *  it. Returns a shallow-cloned design so the original is never mutated. */
export function withWatermark(d: Design, on: boolean): Design {
  if (!on) return d;
  const pad = Math.max(16, Math.round(Math.min(d.w, d.h) * 0.02));
  const size = Math.max(18, Math.round(Math.min(d.w, d.h) * 0.028));
  const mark: TextEl = {
    id: newElId(), type: 'text', text: 'Made with Pyntra ✦',
    x: d.w * 0.4, y: d.h - pad - size, w: d.w * 0.6 - pad, h: size * 1.4,
    size, color: '#000000', opacity: 0.32, font: 'Inter, system-ui, sans-serif',
    weight: 700, align: 'right', rotation: 0,
  };
  return { ...d, elements: [...d.elements, mark] };
}

/** Rasterize a design's SVG to PNG bytes at an optional supersample scale.
 *  `styleCss` carries embedded @font-face rules so custom fonts render.
 *  `watermark` stamps the free-tier brand mark (Pro omits it). */
export async function designToPng(d: Design, scale = 2, styleCss?: string, watermark = false): Promise<Uint8Array> {
  // Composite via rasterizeDesign so text is drawn natively on the canvas —
  // an <img>-rasterized SVG drops <text> on iOS/WebKit (see designRaster.ts).
  const wd = withWatermark(d, watermark);
  const canvas = await rasterizeDesign(wd, Math.round(wd.w * scale), Math.round(wd.h * scale), styleCss);
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

export async function exportDesignPng(d: Design, name: string, styleCss?: string, watermark = false): Promise<void> {
  downloadBytes(`${name}.png`, await designToPng(d, 2, styleCss, watermark), 'image/png');
}

/** Embed the rasterized design full-page into a PDF sized to the artboard (px→pt). */
export async function designToPdf(d: Design, styleCss?: string, watermark = false): Promise<Uint8Array> {
  return designsToPdf([d], styleCss, watermark);
}

/** Combine several designs into ONE multi-page PDF (a page per design, each sized
 *  to its own artboard). Powers exporting a card set and mail-merge batch output.
 *  Fully client-side; nothing is uploaded. */
export async function designsToPdf(designs: Design[], styleCss?: string, watermark = false): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  for (const d of designs) {
    const png = await designToPng(d, 2, styleCss, watermark);
    const pw = (d.w * 72) / 96, ph = (d.h * 72) / 96;
    const page = pdf.addPage([pw, ph]);
    const embed = await pdf.embedPng(png);
    page.drawImage(embed, { x: 0, y: 0, width: pw, height: ph });
  }
  return pdf.save();
}

export async function exportDesignPdf(d: Design, name: string, styleCss?: string, watermark = false): Promise<void> {
  downloadBytes(`${name}.pdf`, await designToPdf(d, styleCss, watermark), 'application/pdf');
}

export async function exportDesignsPdf(designs: Design[], name: string, styleCss?: string, watermark = false): Promise<void> {
  downloadBytes(`${name}.pdf`, await designsToPdf(designs, styleCss, watermark), 'application/pdf');
}

/** Download the editable, infinitely-crisp SVG itself (with any embedded fonts). */
export function exportDesignSvg(d: Design, name: string, styleCss?: string, watermark = false): void {
  const bytes = new TextEncoder().encode(designToSvg(withWatermark(d, watermark), styleCss));
  downloadBytes(`${name}.svg`, bytes, 'image/svg+xml');
}
