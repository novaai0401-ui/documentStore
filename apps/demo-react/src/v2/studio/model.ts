/**
 * Design Studio model — the pure, framework-free core of Pyntra's Express-style
 * design canvas. A Design is a fixed-size artboard plus a stack of elements
 * (text, rectangles, ellipses, lines, images). Everything here is deterministic
 * and DOM-free so it can be unit-tested and rendered to an SVG string that the
 * editor displays and the exporters turn into PNG/PDF — all in the browser, with
 * the file never leaving the device.
 */

import { effectLayerSvg } from './effects.js';

export type ElementType = 'text' | 'rect' | 'ellipse' | 'line' | 'image';

/** Continuous looping motion for a single element — the "animated emoji" layer.
 *  Plays in the live editor (via CSS) and bakes into GIF/APNG/video exports. */
export type ElementMotion = 'bounce' | 'float' | 'spin' | 'pulse' | 'wobble' | 'shake' | 'beat';
export const ELEMENT_MOTIONS: { id: ElementMotion; label: string }[] = [
  { id: 'bounce', label: '⬆️ Bounce' },
  { id: 'float', label: '🎈 Float' },
  { id: 'spin', label: '🔄 Spin' },
  { id: 'pulse', label: '🔍 Pulse' },
  { id: 'wobble', label: '🙃 Wobble' },
  { id: 'shake', label: '📳 Shake' },
  { id: 'beat', label: '❤️ Heartbeat' },
];

/** Base loop length per motion (seconds) — the live CSS durations; a per-element
 *  motionSpeed multiplier divides these (and multiplies the export phase). */
export const MOTION_BASE_SECONDS: Record<ElementMotion, number> = { bounce: 1.4, float: 3, spin: 3, pulse: 1.6, wobble: 1.2, shake: 0.7, beat: 1.3 };

interface Base { id: string; type: ElementType; x: number; y: number; w: number; h: number; rotation?: number; hidden?: boolean; locked?: boolean; name?: string; opacity?: number; motion?: ElementMotion; motionSpeed?: number }
export interface TextEl extends Base { type: 'text'; text: string; size: number; color: string; font: string; weight: number; align: 'left' | 'center' | 'right' }
export interface RectEl extends Base { type: 'rect'; fill: string; radius?: number; stroke?: string; strokeWidth?: number }
export interface EllipseEl extends Base { type: 'ellipse'; fill: string; stroke?: string; strokeWidth?: number }
export interface LineEl extends Base { type: 'line'; stroke: string; strokeWidth: number }
export type ImageShape = 'rect' | 'circle' | 'star' | 'heart' | 'hex' | 'diamond';
export type ImageShadow = 'soft' | 'strong';
export interface ImageEl extends Base { type: 'image'; href: string; radius?: number; shape?: ImageShape; shadow?: ImageShadow; placeholder?: boolean;
  /** `cover` (default) fills the box and crops — right for photos. `contain`
   *  shows the whole graphic without cropping — right for SVG clipart & avatars,
   *  which are transparent and must not be sliced. */
  fit?: 'cover' | 'contain' }

/** CSS @keyframes for the live-editor motion preview — one loop each, injected
 *  once into the canvas SVG. The export path recomputes the same motion frame
 *  by frame (see animate.ts motionDelta), so live and exported motion match. */
export const MOTION_CSS = `
@keyframes ptx-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-9%)} }
@keyframes ptx-float { 0%,100%{transform:translateY(-4%)} 50%{transform:translateY(4%)} }
@keyframes ptx-spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
@keyframes ptx-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.14)} }
@keyframes ptx-wobble { 0%,100%{transform:rotate(-7deg)} 50%{transform:rotate(7deg)} }
@keyframes ptx-shake { 0%,100%{transform:translateX(-3%)} 25%{transform:translateX(3%)} 50%{transform:translateX(-3%)} 75%{transform:translateX(3%)} }
@keyframes ptx-beat { 0%,100%{transform:scale(1)} 15%{transform:scale(1.18)} 30%{transform:scale(1)} 45%{transform:scale(1.12)} }
.ptx-mo-bounce{animation:ptx-bounce 1.4s ease-in-out infinite}
.ptx-mo-float{animation:ptx-float 3s ease-in-out infinite}
.ptx-mo-spin{animation:ptx-spin 3s linear infinite}
.ptx-mo-pulse{animation:ptx-pulse 1.6s ease-in-out infinite}
.ptx-mo-wobble{animation:ptx-wobble 1.2s ease-in-out infinite}
.ptx-mo-shake{animation:ptx-shake 0.7s ease-in-out infinite}
.ptx-mo-beat{animation:ptx-beat 1.3s ease-in-out infinite}
[class*="ptx-mo-"]{transform-box:fill-box;transform-origin:center}
@keyframes ptx-fall { from{transform:translateY(0)} to{transform:translateY(var(--fh))} }
@keyframes ptx-rise { from{transform:translateY(0)} to{transform:translateY(calc(-1 * var(--fh)))} }
`;

/** A tap-to-fill photo slot for templates: renders as a friendly dashed frame
 *  until the user taps it and picks a picture, which drops in cover-fitted. */
export function photoSlot(x: number, y: number, w: number, h: number): ImageEl {
  return { id: newElId(), type: 'image', href: '', placeholder: true, x, y, w, h, name: 'Photo (tap to add)' };
}

/** Drop-shadow parameters for an image layer, sized relative to the element so
 *  the shadow scales with the design. Rendered as an SVG-NATIVE feDropShadow
 *  filter (not CSS drop-shadow, which browsers ignore when rasterizing SVG via
 *  <img> for export). Follows the ALPHA silhouette — a cut-out person gets a
 *  person-shaped shadow, not a box. */
export function imageShadowParams(el: Pick<ImageEl, 'shadow' | 'h'>): { dy: number; blur: number; opacity: number } | undefined {
  if (!el.shadow) return undefined;
  const s = Math.max(2, el.h);
  return el.shadow === 'strong'
    ? { dy: +(s * 0.03).toFixed(1), blur: +(s * 0.05).toFixed(1), opacity: 0.55 }
    : { dy: +(s * 0.02).toFixed(1), blur: +(s * 0.035).toFixed(1), opacity: 0.35 };
}
export type Element = TextEl | RectEl | EllipseEl | LineEl | ImageEl;

/** CSS clip-path per image shape (percentages scale with the element's box, so
 *  the same clip works at any size). 'rect' falls back to the radius inset. */
export const IMAGE_SHAPE_CLIPS: Record<Exclude<ImageShape, 'rect'>, string> = {
  circle: 'ellipse(50% 50% at 50% 50%)',
  star: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
  heart: 'polygon(50% 91%, 30% 74%, 13% 56%, 5% 40%, 7% 22%, 19% 10%, 33% 9%, 44% 16%, 50% 26%, 56% 16%, 67% 9%, 81% 10%, 93% 22%, 95% 40%, 87% 56%, 70% 74%)',
  hex: 'polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%)',
  diamond: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
};

/** Picker entries for the image Shape control (kept here so UI and renderer agree). */
export const IMAGE_SHAPES: { id: ImageShape; label: string }[] = [
  { id: 'rect', label: '⬛ Square / rounded' },
  { id: 'circle', label: '⚫ Circle / oval' },
  { id: 'star', label: '⭐ Star' },
  { id: 'heart', label: '❤️ Heart' },
  { id: 'hex', label: '⬡ Hexagon' },
  { id: 'diamond', label: '🔷 Diamond' },
];

export interface Design {
  w: number; h: number;
  background: string;
  /** Optional second colour: the background becomes a linear gradient from
   *  `background` → `bg2` at `bgAngle`° (default 135° top-left → bottom-right).
   *  Flat colour when omitted — fully backwards compatible. */
  bg2?: string;
  bgAngle?: number;
  /** Subtle film-grain texture over the background (feTurbulence) — the 2026
   *  "tactile" look that kills clip-art flatness. */
  grain?: boolean;
  elements: Element[];
  effect?: import('./effects.js').BackgroundEffect;
}

/** Output/canvas size presets (px at 96dpi). */
export interface Format { id: string; name: string; w: number; h: number; group: string }
export const FORMATS: Format[] = [
  { id: 'ig-post', name: 'Instagram Post', w: 1080, h: 1080, group: 'Social' },
  { id: 'ig-story', name: 'Story / Reel', w: 1080, h: 1920, group: 'Social' },
  { id: 'fb-link', name: 'Facebook Link', w: 1200, h: 630, group: 'Social' },
  { id: 'yt-thumb', name: 'YouTube Thumbnail', w: 1280, h: 720, group: 'Social' },
  { id: 'a4-port', name: 'A4 Portrait', w: 794, h: 1123, group: 'Print' },
  { id: 'a4-land', name: 'A4 Landscape', w: 1123, h: 794, group: 'Print' },
  { id: 'letter', name: 'US Letter', w: 816, h: 1056, group: 'Print' },
  { id: 'poster', name: 'Poster', w: 1080, h: 1527, group: 'Print' },
  { id: 'card', name: 'Business Card', w: 1050, h: 600, group: 'Print' },
  { id: 'slide', name: 'Presentation 16:9', w: 1280, h: 720, group: 'Presentation' },
];
export const formatById = (id: string): Format => FORMATS.find((f) => f.id === id) ?? FORMATS[0]!;

let counter = 0;
export const newElId = (): string => `e${Date.now().toString(36)}${(counter++).toString(36)}`;

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Resize a design to a new artboard, scaling every element so the composition is
 * preserved. Width-related fields scale by sx, height-related by sy; font size and
 * stroke (which can't be non-uniformly stretched) scale by the smaller factor so
 * text stays legible. Returns a new Design — the input is not mutated.
 */
export function resizeDesign(d: Design, w: number, h: number): Design {
  const sx = w / d.w, sy = h / d.h, s = Math.min(sx, sy);
  const elements = d.elements.map((el): Element => {
    const base = { ...el, x: el.x * sx, y: el.y * sy, w: el.w * sx, h: el.h * sy };
    if (base.type === 'text') return { ...base, size: Math.max(1, Math.round((base.size as number) * s)) };
    if ((base.type === 'rect' || base.type === 'ellipse' || base.type === 'line') && typeof (base as RectEl).strokeWidth === 'number') {
      return { ...base, strokeWidth: (base as RectEl).strokeWidth! * s } as Element;
    }
    return base as Element;
  });
  return { ...d, w, h, elements };
}

/** Serialize one element to an SVG fragment. */
export function elementToSvg(el: Element): string {
  const rot = (el.rotation ? ` transform="rotate(${el.rotation} ${el.x + el.w / 2} ${el.y + el.h / 2})"` : '')
    + (el.opacity !== undefined && el.opacity < 1 ? ` opacity="${Math.max(0, el.opacity).toFixed(3)}"` : '');
  switch (el.type) {
    case 'rect': {
      const r = el.radius ? ` rx="${el.radius}" ry="${el.radius}"` : '';
      const st = el.stroke ? ` stroke="${esc(el.stroke)}" stroke-width="${el.strokeWidth ?? 1}"` : '';
      return `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}"${r} fill="${esc(el.fill)}"${st}${rot}/>`;
    }
    case 'ellipse': {
      const st = el.stroke ? ` stroke="${esc(el.stroke)}" stroke-width="${el.strokeWidth ?? 1}"` : '';
      return `<ellipse cx="${el.x + el.w / 2}" cy="${el.y + el.h / 2}" rx="${el.w / 2}" ry="${el.h / 2}" fill="${esc(el.fill)}"${st}${rot}/>`;
    }
    case 'line':
      // Drawn corner-to-corner of its box so it can point any direction.
      return `<line x1="${el.x}" y1="${el.y}" x2="${el.x + el.w}" y2="${el.y + el.h}" stroke="${esc(el.stroke)}" stroke-width="${el.strokeWidth}" stroke-linecap="round"${rot}/>`;
    case 'image': {
      // An unfilled photo slot renders as a friendly dashed frame (in the
      // editor AND in exports, so a half-finished design still looks tidy).
      if (el.placeholder && !el.href) {
        const fs = Math.max(14, Math.min(el.w, el.h) * 0.11);
        return `<g${rot}><rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" rx="14" fill="#f8fafc" fill-opacity="0.85" stroke="#94a3b8" stroke-width="2.5" stroke-dasharray="12 9"/>`
          + `<text x="${el.x + el.w / 2}" y="${el.y + el.h / 2 - fs * 0.2}" font-family="system-ui, sans-serif" font-size="${fs * 1.8}" text-anchor="middle">📷</text>`
          + `<text x="${el.x + el.w / 2}" y="${el.y + el.h / 2 + fs * 1.4}" font-family="system-ui, sans-serif" font-size="${fs}" font-weight="600" fill="#64748b" text-anchor="middle">Tap to add photo</text></g>`;
      }
      const shape = el.shape && el.shape !== 'rect' ? IMAGE_SHAPE_CLIPS[el.shape] : undefined;
      const clip = shape
        ? ` style="clip-path: ${shape}"`
        : el.radius ? ` style="clip-path: inset(0 round ${el.radius}px)"` : '';
      // Clipart/avatars are `contain` (whole graphic, no crop); photos are `cover`.
      const par = el.fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice';
      const img = `<image x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" href="${esc(el.href)}" preserveAspectRatio="${par}"${clip}${rot}/>`;
      // Shadow wraps a GROUP so the filter runs AFTER clipping — the shadow
      // follows the clipped/cut-out silhouette instead of being clipped away.
      // feDropShadow (SVG-native) rasterizes in <img> exports; CSS drop-shadow doesn't.
      const sh = imageShadowParams(el);
      return sh
        ? `<g filter="url(#sh-${esc(el.id)})"><defs><filter id="sh-${esc(el.id)}" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="${sh.dy}" stdDeviation="${sh.blur}" flood-color="#000000" flood-opacity="${sh.opacity}"/></filter></defs>${img}</g>`
        : img;
    }
    case 'text': {
      const anchor = el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start';
      const tx = el.align === 'center' ? el.x + el.w / 2 : el.align === 'right' ? el.x + el.w : el.x;
      const lines = el.text.split('\n');
      const lh = el.size * 1.25;
      const tspans = lines.map((ln, i) => `<tspan x="${tx}" dy="${i === 0 ? el.size : lh}">${esc(ln) || ' '}</tspan>`).join('');
      return `<text x="${tx}" y="${el.y}" font-family="${esc(el.font)}" font-size="${el.size}" font-weight="${el.weight}" fill="${esc(el.color)}" text-anchor="${anchor}"${rot}>${tspans}</text>`;
    }
  }
}

/** Render a whole design to a standalone SVG document string. Hidden elements
 *  (toggled off in the Layers panel) are omitted from both preview and export.
 *  `styleCss` (e.g. @font-face rules for custom fonts) is embedded so an
 *  <img>-rasterized export renders exactly what the live canvas shows.
 *  `effectPhase` positions the animated background layer (confetti/snow/…);
 *  static exports use a fixed mid-phase so the decoration still shows. */
export function designToSvg(d: Design, styleCss?: string, effectPhase = 0.35, skipText = false): string {
  // `skipText` omits <text> elements so the caller can draw them natively on a
  // canvas instead — iOS/WebKit rasterizes SVG <text> unreliably when an <img>
  // (fonts silently fail → blank text), so raster exports draw text via
  // `drawDesignText` below and skip it here.
  const body = d.elements.filter((el) => !el.hidden && !(skipText && el.type === 'text')).map(elementToSvg).join('');
  const style = styleCss ? `<style>${styleCss}</style>` : '';
  const fx = d.effect ? effectLayerSvg(d.effect, effectPhase, d.w, d.h) : '';
  // Background defs: linear-gradient fill (angle → unit-vector endpoints in
  // SVG gradient space) and/or the film-grain turbulence filter.
  let defsInner = '', bgFill = esc(d.background), grain = '';
  if (d.bg2) {
    const a = ((d.bgAngle ?? 135) - 90) * (Math.PI / 180);
    const x = Math.cos(a) / 2, y = Math.sin(a) / 2;
    defsInner += `<linearGradient id="ptxbg" x1="${(0.5 - x).toFixed(3)}" y1="${(0.5 - y).toFixed(3)}" x2="${(0.5 + x).toFixed(3)}" y2="${(0.5 + y).toFixed(3)}"><stop offset="0" stop-color="${esc(d.background)}"/><stop offset="1" stop-color="${esc(d.bg2)}"/></linearGradient>`;
    bgFill = 'url(#ptxbg)';
  }
  if (d.grain) {
    defsInner += `<filter id="ptxgrain"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.14" intercept="0"/></feComponentTransfer></filter>`;
    grain = `<rect width="${d.w}" height="${d.h}" filter="url(#ptxgrain)"/>`;
  }
  const defs = defsInner ? `<defs>${defsInner}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${d.w}" height="${d.h}" viewBox="0 0 ${d.w} ${d.h}">${style}${defs}<rect width="${d.w}" height="${d.h}" fill="${bgFill}"/>${grain}${fx}${body}</svg>`;
}

/**
 * Draw a design's text elements natively onto a canvas, matching `designToSvg`'s
 * text layout (baseline at y+size, 1.25 line-height, anchor, rotation, opacity).
 * `sx`/`sy` scale design coordinates to the canvas size. Pair with
 * `designToSvg(d, css, phase, true)` so text renders reliably on every browser
 * (the SVG handles rects/images/effects; this handles the text).
 */
export function drawDesignText(ctx: CanvasRenderingContext2D, d: Design, sx: number, sy: number): void {
  for (const el of d.elements) {
    if (el.hidden || el.type !== 'text') continue;
    const anchor: CanvasTextAlign = el.align === 'center' ? 'center' : el.align === 'right' ? 'right' : 'left';
    const tx = el.align === 'center' ? el.x + el.w / 2 : el.align === 'right' ? el.x + el.w : el.x;
    ctx.save();
    if (el.opacity !== undefined && el.opacity < 1) ctx.globalAlpha = Math.max(0, el.opacity);
    ctx.scale(sx, sy); // draw in design coordinates
    if (el.rotation) { const cx = el.x + el.w / 2, cy = el.y + el.h / 2; ctx.translate(cx, cy); ctx.rotate((el.rotation * Math.PI) / 180); ctx.translate(-cx, -cy); }
    ctx.font = `${el.weight} ${el.size}px ${el.font}`;
    ctx.fillStyle = el.color;
    ctx.textAlign = anchor;
    ctx.textBaseline = 'alphabetic';
    const lines = el.text.split('\n');
    const lh = el.size * 1.25;
    lines.forEach((ln, i) => ctx.fillText(ln || ' ', tx, el.y + el.size + i * lh));
    ctx.restore();
  }
}

/** A short human label for an element, for the Layers panel. */
export function elementLabel(el: Element): string {
  if (el.name) return el.name;
  if (el.type === 'text') { const t = el.text.replace(/\s+/g, ' ').trim(); return t ? t.slice(0, 24) : 'Text'; }
  return { rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', image: 'Image' }[el.type] ?? el.type;
}

export type LayerOp = 'front' | 'back' | 'forward' | 'backward';
/**
 * Reorder one element within the stack (array order == paint order; the last
 * element is on top). 'front'/'back' jump to the ends; 'forward'/'backward' step
 * by one. Returns a new array; the input is not mutated.
 */
export function moveLayer(elements: Element[], id: string, op: LayerOp): Element[] {
  const i = elements.findIndex((e) => e.id === id);
  if (i < 0) return elements;
  const out = elements.slice();
  const [el] = out.splice(i, 1);
  if (!el) return elements;
  if (op === 'front') out.push(el);
  else if (op === 'back') out.unshift(el);
  else if (op === 'forward') out.splice(Math.min(out.length, i + 1), 0, el);
  else out.splice(Math.max(0, i - 1), 0, el);
  return out;
}

/** A blank design at a given format. */
export function blankDesign(format: Format): Design {
  return { w: format.w, h: format.h, background: '#ffffff', elements: [] };
}
