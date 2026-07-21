/**
 * Magic Resize — turn one design into many. Given a Design and a set of target
 * formats, produce a resized variant for each (composition preserved via
 * resizeDesign). Pure and DOM-free so it's unit-tested; the modal handles the UI
 * and export. This is Pyntra's free, on-device take on Canva's "Magic Resize"
 * (which Canva gates behind Pro) — design once, get every size, nothing uploaded.
 */
import { resizeDesign, formatById, FORMATS, type Design, type Format } from './model.js';

export interface Variant { format: Format; design: Design }

/** True when a format's dimensions match the design's current artboard. */
export function isCurrentFormat(d: Design, f: Format): boolean {
  return f.w === d.w && f.h === d.h;
}

/** Build a resized variant of the design for each requested format id (skips
 *  unknown ids and the design's current size — resizing to itself is a no-op). */
export function buildVariants(d: Design, formatIds: string[]): Variant[] {
  const seen = new Set<string>();
  const out: Variant[] = [];
  for (const id of formatIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const format = formatById(id);
    if (format.id !== id) continue; // formatById falls back to FORMATS[0] for unknown ids
    if (isCurrentFormat(d, format)) continue;
    out.push({ format, design: resizeDesign(d, format.w, format.h) });
  }
  return out;
}

/** A sensible default set to pre-tick: every Social format except the current
 *  size (the most common "resize my post for other channels" intent). Falls back
 *  to all non-current formats if the design isn't a social size. */
export function defaultSelection(d: Design): string[] {
  const social = FORMATS.filter((f) => f.group === 'Social' && !isCurrentFormat(d, f));
  const pool = social.length ? social : FORMATS.filter((f) => !isCurrentFormat(d, f));
  return pool.map((f) => f.id);
}

/** Filesystem-safe stem, e.g. "Summer Sale" -> "summer-sale". */
export function slugify(name: string): string {
  return (name || 'design').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'design';
}

/** Per-variant file stem, e.g. "summer-sale-ig-story-1080x1920". */
export function variantStem(baseName: string, f: Format): string {
  return `${slugify(baseName)}-${f.id}-${f.w}x${f.h}`;
}
