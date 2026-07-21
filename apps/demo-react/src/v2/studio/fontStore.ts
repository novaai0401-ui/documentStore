/**
 * Custom fonts — upload any font file (TTF/OTF/WOFF/WOFF2), including Google
 * Fonts you've downloaded, and use it in the Design Studio. Stored locally as a
 * data URL (nothing leaves the device). Fonts are registered with the browser via
 * the FontFace API so they render live on the canvas, and — crucially — are
 * embedded as data-URI @font-face into exported SVG so PNG/PDF output matches what
 * you see (an <img>-rasterized SVG can't read document fonts, only embedded ones).
 * Pure helpers here are unit-tested; CRUD uses the shared KV.
 */
import { openKv, type Kv } from '../persist/kv.js';
import type { Design } from './model.js';

export interface CustomFont {
  id: string;
  /** CSS font-family name used both on elements and in @font-face. */
  family: string;
  /** woff2 | woff | truetype | opentype — the CSS `format()` token. */
  format: string;
  /** The font file as a data: URL. */
  dataUri: string;
}

/** Map a file name/extension to the CSS @font-face `format()` token. */
export function fontFormat(filename: string): string {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  return ext === 'woff2' ? 'woff2' : ext === 'woff' ? 'woff' : ext === 'otf' ? 'opentype' : 'truetype';
}

/** Derive a clean family name from a file name, e.g. "Roboto-BoldItalic.ttf" → "Roboto Bold Italic". */
export function familyFromFilename(name: string): string {
  const stem = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  return stem.replace(/\s+/g, ' ').trim().slice(0, 48) || 'Custom font';
}

/** The distinct font-family strings actually used by a design's text elements. */
export function usedFontFamilies(d: Design): string[] {
  const set = new Set<string>();
  for (const el of d.elements) if (el.type === 'text') set.add(el.font);
  return [...set];
}

/** A `@font-face` block for each custom font (optionally only the families used). */
export function fontFaceCss(fonts: CustomFont[], onlyFamilies?: string[]): string {
  const want = onlyFamilies ? new Set(onlyFamilies.map((f) => f.replace(/['"]/g, '').toLowerCase())) : null;
  return fonts
    .filter((f) => !want || want.has(f.family.toLowerCase()))
    .map((f) => `@font-face{font-family:'${f.family.replace(/'/g, '')}';src:url(${f.dataUri}) format('${f.format}');font-display:swap;}`)
    .join('');
}

// ── Persistence ─────────────────────────────────────────────────────────────
const KEY = (id: string) => `font:${id}`;
const INDEX = 'font:index';

let kv: Kv | null = null;
const store = (): Kv => (kv ??= openKv());
/** Inject a KV (tests use an in-memory one). */
export function configureFontStore(next: Kv): void { kv = next; }

const newFontId = (): string => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const readIndex = async (): Promise<string[]> => (await store().get<string[]>(INDEX)) ?? [];

export async function listFonts(): Promise<CustomFont[]> {
  const ids = await readIndex();
  const out: CustomFont[] = [];
  for (const id of ids) { const f = await store().get<CustomFont>(KEY(id)); if (f) out.push(f); }
  return out;
}

const fileToDataUri = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error('Could not read the font file'));
  r.readAsDataURL(file);
});

export async function addFontFromFile(file: File): Promise<CustomFont> {
  const font: CustomFont = { id: newFontId(), family: familyFromFilename(file.name), format: fontFormat(file.name), dataUri: await fileToDataUri(file) };
  await store().set(KEY(font.id), font);
  await store().set(INDEX, [...(await readIndex()), font.id]);
  return font;
}

export async function deleteFont(id: string): Promise<void> {
  await store().del(KEY(id));
  await store().set(INDEX, (await readIndex()).filter((x) => x !== id));
}

/** Register fonts with the browser so they render on the live canvas. No-op where
 *  the FontFace API isn't available (e.g. tests). */
export async function registerFonts(fonts: CustomFont[]): Promise<void> {
  const fontset = (globalThis as unknown as { document?: { fonts?: FontFaceSet } }).document?.fonts;
  const FF = (globalThis as unknown as { FontFace?: typeof FontFace }).FontFace;
  if (!fontset || !FF) return;
  await Promise.all(fonts.map(async (f) => {
    try { const face = new FF(f.family, `url(${f.dataUri})`); await face.load(); fontset.add(face); } catch { /* ignore a bad font file */ }
  }));
}
