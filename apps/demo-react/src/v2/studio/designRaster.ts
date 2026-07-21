/**
 * Rasterize a design to a canvas for raster exports (Animate video/GIF/APNG,
 * Save PNG). Non-text (rects, images, background effect) is drawn from the SVG;
 * TEXT is drawn natively with the Canvas 2D API. This is the fix for text
 * vanishing from exports on iOS/WebKit, where an <img>-loaded SVG rasterizes
 * `<text>` unreliably (fonts silently fail → blank glyphs) while the effect
 * emoji — which carry no font-family — survive.
 */
import { designToSvg, drawDesignText, type Design } from './model.js';

/** Load an SVG string as an <img>, via a Blob URL (more reliable on iOS than a
 *  data: URI for SVGs). Rejects if the SVG can't be decoded. */
export function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not render a frame')); };
    img.src = url;
  });
}

/**
 * Render `design` onto a fresh `w×h` canvas: the SVG (without text) scaled to
 * fill, then the text drawn natively on top. Returns the canvas (usable as a
 * CanvasImageSource for encoders or toBlob for PNG).
 */
export async function rasterizeDesign(design: Design, w: number, h: number, fontCss?: string, effectPhase = 0.35): Promise<HTMLCanvasElement> {
  const img = await loadSvgImage(designToSvg(design, fontCss, effectPhase, true));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  drawDesignText(ctx, design, canvas.width / design.w, canvas.height / design.h);
  return canvas;
}
