/**
 * Batch watermark — stamp text across every page of a PDF (or over images),
 * 100% in the browser. PDFs are stamped with pdf-lib (real drawn text, diagonal,
 * optional tiling, adjustable opacity); images are stamped on a Canvas. Pure
 * geometry/colour helpers here; the UI lives in WatermarkModal.
 */

/** Parse a #rrggbb (or #rgb) colour to 0–1 RGB components for pdf-lib. */
export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  let h = (hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return { r: 0.5, g: 0.5, b: 0.5 };
  return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 };
}

/** Tiled stamp origins across a w×h area at the given spacing (top-left walked). */
export function tilePositions(w: number, h: number, gapX: number, gapY: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  const sx = Math.max(40, gapX), sy = Math.max(40, gapY);
  for (let y = -h; y < h * 2; y += sy) for (let x = -w; x < w * 2; x += sx) out.push({ x, y });
  return out;
}

export interface WatermarkOpts {
  text: string;
  opacity?: number;   // 0–1
  color?: string;     // hex
  rotation?: number;  // degrees
  tile?: boolean;     // repeat across the page
  fontScale?: number; // fraction of min(page side); default ~0.08
}

/** Stamp a watermark into every page of a PDF and return new bytes. */
export async function watermarkPdf(bytes: Uint8Array, opts: WatermarkOpts): Promise<Uint8Array> {
  const text = opts.text.trim();
  if (!text) return bytes;
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { r, g, b } = hexToRgb01(opts.color ?? '#888888');
  const opacity = opts.opacity ?? 0.18;
  const rot = opts.rotation ?? 45;

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const size = Math.max(18, Math.min(width, height) * (opts.fontScale ?? 0.08));
    const textW = font.widthOfTextAtSize(text, size);
    const draw = (cx: number, cy: number) => {
      // Position so the text is roughly centred on (cx,cy) before rotation.
      page.drawText(text, { x: cx - textW / 2, y: cy, size, font, color: rgb(r, g, b), opacity, rotate: degrees(rot) });
    };
    if (opts.tile) {
      for (const p of tilePositions(width, height, textW + size * 2, size * 4)) draw(p.x + textW / 2, p.y);
    } else {
      draw(width / 2, height / 2 - size / 2);
    }
  }
  return pdf.save();
}

/** Stamp a watermark over an image and return a JPEG/PNG blob (browser only). */
export async function watermarkImage(file: Blob, opts: WatermarkOpts): Promise<Blob> {
  const text = opts.text.trim();
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width; canvas.height = bmp.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  if (text) {
    const size = Math.max(16, Math.min(canvas.width, canvas.height) * (opts.fontScale ?? 0.08));
    ctx.font = `bold ${size}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = opts.color ?? '#888888';
    ctx.globalAlpha = opts.opacity ?? 0.22;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const stamp = (cx: number, cy: number) => { ctx.save(); ctx.translate(cx, cy); ctx.rotate((-(opts.rotation ?? 45) * Math.PI) / 180); ctx.fillText(text, 0, 0); ctx.restore(); };
    if (opts.tile) {
      const tw = ctx.measureText(text).width;
      for (const p of tilePositions(canvas.width, canvas.height, tw + size * 2, size * 4)) stamp(p.x, p.y);
    } else { stamp(canvas.width / 2, canvas.height / 2); }
    ctx.globalAlpha = 1;
  }
  const type = /png/i.test(file.type) ? 'image/png' : 'image/jpeg';
  return new Promise<Blob>((res) => canvas.toBlob((bl) => res(bl ?? new Blob()), type, 0.92));
}
