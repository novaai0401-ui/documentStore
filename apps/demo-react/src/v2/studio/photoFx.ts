/**
 * Photo art filters — turn a photo into a pencil sketch, cartoon, painting,
 * pop-art poster and more, ENTIRELY on-device. Pure pixel math on an RGBA
 * Uint8ClampedArray (no canvas, no DOM, no network, no ML model), so it's
 * deterministic, unit-tested, free and private — the same philosophy as
 * bgRemove.ts. The canvas glue (image ↔ pixels ↔ data-URI) lives in
 * photoFxRender.ts; this module is the maths.
 *
 * These feed the "✨ Stylize your photo" step: the stylised result becomes the
 * photo in a greeting card or a Family Portrait slot — a free alternative to
 * paid AI image editing.
 */

export type PhotoFxId = 'sketch' | 'cartoon' | 'painting' | 'popart' | 'halftone' | 'sepia' | 'noir';

export interface PhotoFx { id: PhotoFxId; label: string; emoji: string }
export const PHOTO_FX: PhotoFx[] = [
  { id: 'sketch', label: 'Pencil sketch', emoji: '✏️' },
  { id: 'cartoon', label: 'Cartoon', emoji: '🦸' },
  { id: 'painting', label: 'Painting', emoji: '🎨' },
  { id: 'popart', label: 'Pop art', emoji: '🌈' },
  { id: 'halftone', label: 'Comic dots', emoji: '🗞️' },
  { id: 'sepia', label: 'Vintage', emoji: '📷' },
  { id: 'noir', label: 'Noir', emoji: '🎬' },
];

const clamp = (n: number): number => (n < 0 ? 0 : n > 255 ? 255 : n);
const lum = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b;

/** Grayscale copy (one luminance value per pixel) — the basis of several fx. */
export function grayscalePlane(px: Uint8ClampedArray, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = lum(px[i * 4]!, px[i * 4 + 1]!, px[i * 4 + 2]!);
  return g;
}

/** Separable box blur on a single plane (fast, good enough for the sketch dodge
 *  and painting pre-smooth). `r` = radius in px. Returns a new plane. */
export function boxBlurPlane(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src.slice();
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const norm = 1 / (2 * r + 1);
  // Horizontal
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))]!;
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc * norm;
      const add = src[y * w + Math.min(w - 1, x + r + 1)]!;
      const sub = src[y * w + Math.max(0, x - r)]!;
      acc += add - sub;
    }
  }
  // Vertical
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]!;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc * norm;
      const add = tmp[Math.min(h - 1, y + r + 1) * w + x]!;
      const sub = tmp[Math.max(0, y - r) * w + x]!;
      acc += add - sub;
    }
  }
  return out;
}

/** Sobel edge magnitude (0..~1) on a grayscale plane — used for cartoon/comic
 *  outlines. */
export function sobelEdges(g: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  const at = (x: number, y: number) => g[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) + at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
      const gy = -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      out[y * w + x] = Math.sqrt(gx * gx + gy * gy) / 1442; // /(255*4*√2) → 0..1
    }
  }
  return out;
}

/** Posterize a channel value to `levels` bands (cartoon/pop-art flattening). */
export function posterize(v: number, levels: number): number {
  const step = 255 / (levels - 1);
  return clamp(Math.round(Math.round(v / step) * step));
}

// ── The filters — each takes RGBA in, returns a NEW RGBA out ──────────────────

/** Pencil sketch: grayscale → invert → blur → colour-dodge (classic method). */
export function fxSketch(px: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const g = grayscalePlane(px, w, h);
  const inv = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) inv[i] = 255 - g[i]!;
  const blur = boxBlurPlane(inv, w, h, Math.max(2, Math.round(Math.min(w, h) / 90)));
  const out = new Uint8ClampedArray(px.length);
  for (let i = 0; i < w * h; i++) {
    const base = g[i]!, bl = blur[i]!;
    // Colour-dodge: base * 255 / (255 - blurred).
    const d = bl >= 255 ? 255 : clamp((base * 255) / (255 - bl));
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = d;
    out[i * 4 + 3] = px[i * 4 + 3]!;
  }
  return out;
}

/** Cartoon: smooth + posterise the colours, then lay a dark edge outline. */
export function fxCartoon(px: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const r = Math.max(1, Math.round(Math.min(w, h) / 200));
  // Smooth each channel (plane blur) then posterise.
  const planes: Float32Array[] = [0, 1, 2].map((c) => {
    const p = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) p[i] = px[i * 4 + c]!;
    return boxBlurPlane(p, w, h, r);
  });
  const edges = sobelEdges(grayscalePlane(px, w, h), w, h);
  const out = new Uint8ClampedArray(px.length);
  for (let i = 0; i < w * h; i++) {
    const edge = edges[i]! > 0.28 ? 0 : 1; // strong edge → black line
    for (let c = 0; c < 3; c++) out[i * 4 + c] = posterize(planes[c]![i]!, 6) * edge;
    out[i * 4 + 3] = px[i * 4 + 3]!;
  }
  return out;
}

/** Oil-painting: each pixel takes the average colour of the most common
 *  intensity bucket in its neighbourhood (a fast Kuwahara-lite). */
export function fxPainting(px: Uint8ClampedArray, w: number, h: number, radius = 0): Uint8ClampedArray {
  const rad = radius || Math.max(2, Math.round(Math.min(w, h) / 120));
  const BUCKETS = 20;
  const g = grayscalePlane(px, w, h);
  const out = new Uint8ClampedArray(px.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const count = new Int32Array(BUCKETS);
      const rs = new Float32Array(BUCKETS), gs = new Float32Array(BUCKETS), bs = new Float32Array(BUCKETS);
      for (let dy = -rad; dy <= rad; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -rad; dx <= rad; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          const j = yy * w + xx;
          const b = Math.min(BUCKETS - 1, (g[j]! / 256 * BUCKETS) | 0);
          count[b]++; rs[b]! += px[j * 4]!; gs[b]! += px[j * 4 + 1]!; bs[b]! += px[j * 4 + 2]!;
        }
      }
      let best = 0;
      for (let b = 1; b < BUCKETS; b++) if (count[b]! > count[best]!) best = b;
      const n = count[best]! || 1, o = (y * w + x) * 4;
      out[o] = clamp(rs[best]! / n); out[o + 1] = clamp(gs[best]! / n); out[o + 2] = clamp(bs[best]! / n);
      out[o + 3] = px[(y * w + x) * 4 + 3]!;
    }
  }
  return out;
}

/** Pop-art: posterise hard to a few tones and push saturation (Warhol-ish). */
export function fxPopart(px: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(px.length);
  for (let i = 0; i < w * h; i++) {
    for (let c = 0; c < 3; c++) {
      const v = px[i * 4 + c]!;
      // Push away from mid-grey (saturation-ish) then posterise to 4 tones.
      const pushed = clamp(128 + (v - 128) * 1.6);
      out[i * 4 + c] = posterize(pushed, 4);
    }
    out[i * 4 + 3] = px[i * 4 + 3]!;
  }
  return out;
}

/** Comic halftone: luminance → dot pattern in a duotone (ink on paper). */
export function fxHalftone(px: Uint8ClampedArray, w: number, h: number, cell = 0): Uint8ClampedArray {
  const c = cell || Math.max(3, Math.round(Math.min(w, h) / 140));
  const g = grayscalePlane(px, w, h);
  const out = new Uint8ClampedArray(px.length);
  // Paper + ink.
  const paper = [250, 246, 235], ink = [30, 28, 40];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Cell centre + radius from local average darkness.
      const cxCell = Math.floor(x / c) * c + c / 2, cyCell = Math.floor(y / c) * c + c / 2;
      const gi = Math.min(h - 1, cyCell | 0) * w + Math.min(w - 1, cxCell | 0);
      const dark = 1 - g[gi]! / 255; // 0 light..1 dark
      const rad = Math.sqrt(dark) * (c / 2) * 1.15;
      const dist = Math.hypot(x - cxCell, y - cyCell);
      const on = dist <= rad;
      const o = (y * w + x) * 4;
      const col = on ? ink : paper;
      out[o] = col[0]!; out[o + 1] = col[1]!; out[o + 2] = col[2]!;
      out[o + 3] = px[o + 3]!;
    }
  }
  return out;
}

/** Warm vintage sepia. */
export function fxSepia(px: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(px.length);
  for (let i = 0; i < w * h; i++) {
    const r = px[i * 4]!, g = px[i * 4 + 1]!, b = px[i * 4 + 2]!;
    out[i * 4] = clamp(0.393 * r + 0.769 * g + 0.189 * b);
    out[i * 4 + 1] = clamp(0.349 * r + 0.686 * g + 0.168 * b);
    out[i * 4 + 2] = clamp(0.272 * r + 0.534 * g + 0.131 * b);
    out[i * 4 + 3] = px[i * 4 + 3]!;
  }
  return out;
}

/** High-contrast black & white "noir". */
export function fxNoir(px: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(px.length);
  for (let i = 0; i < w * h; i++) {
    const v = clamp(128 + (lum(px[i * 4]!, px[i * 4 + 1]!, px[i * 4 + 2]!) - 128) * 1.7);
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = px[i * 4 + 3]!;
  }
  return out;
}

/** Apply a filter by id. Pure — RGBA in, new RGBA out. */
export function applyPhotoFx(id: PhotoFxId, px: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  switch (id) {
    case 'sketch': return fxSketch(px, w, h);
    case 'cartoon': return fxCartoon(px, w, h);
    case 'painting': return fxPainting(px, w, h);
    case 'popart': return fxPopart(px, w, h);
    case 'halftone': return fxHalftone(px, w, h);
    case 'sepia': return fxSepia(px, w, h);
    case 'noir': return fxNoir(px, w, h);
    default: return new Uint8ClampedArray(px);
  }
}
