/**
 * Appearance stream synthesis for AcroForm widgets.
 *
 * When we change /V on a field, the visible glyphs come from /AP/N — a
 * Form XObject containing a content stream. PDF spec says viewers can
 * regenerate this from /V when /NeedAppearances is true, but many real
 * viewers don't (Chrome/Edge built-in, mobile, lots of cloud previewers).
 *
 * To make a saved PDF render correctly *everywhere*, we synthesize a
 * fresh /AP/N stream for every touched text-ish field on save. The
 * checkbox/radio path doesn't need this — its existing /AP/N already
 * has both states baked in; we just toggle /AS.
 *
 * Everything is dynamic: font + size + color come from the field's
 * effective /DA, the alignment from /Q, the rect from the widget,
 * and the displayed text from the new /V.
 */
import type { PdfObject } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// /DA — the "default appearance" string. Format is one or more PDF text-state
// ops; what we care about is the font name, size, and fill color.
// ─────────────────────────────────────────────────────────────────────────────

export interface DAInfo {
  /** Font name as it appears in /DA (e.g. "Helv"). May not be a /DR key. */
  fontName: string;
  /** Font size in points. 0 means "auto-fit to rect height". */
  fontSize: number;
  /** PDF content-stream color operator for fill, e.g. "0 g" or "0 0 0 rg". */
  colorOp: string;
}

const DA_DEFAULTS: DAInfo = { fontName: 'Helv', fontSize: 0, colorOp: '0 g' };

export function parseDA(da: string | undefined): DAInfo {
  if (!da) return { ...DA_DEFAULTS };
  const toks = da.match(/\S+/g) ?? [];
  let fontName: string | undefined;
  let fontSize: number | undefined;
  let colorOp: string | undefined;

  for (let i = 0; i < toks.length; i++) {
    const op = toks[i]!;
    if (op === 'Tf' && i >= 2) {
      const name = toks[i - 2]!;
      const sz = Number(toks[i - 1]!);
      if (name.startsWith('/')) fontName = name.slice(1);
      if (!Number.isNaN(sz)) fontSize = sz;
    } else if (op === 'g' && i >= 1) {
      const c = Number(toks[i - 1]!);
      if (!Number.isNaN(c)) colorOp = `${fmt(c)} g`;
    } else if (op === 'rg' && i >= 3) {
      const r = Number(toks[i - 3]!);
      const g = Number(toks[i - 2]!);
      const b = Number(toks[i - 1]!);
      if (![r, g, b].some(Number.isNaN)) colorOp = `${fmt(r)} ${fmt(g)} ${fmt(b)} rg`;
    } else if (op === 'k' && i >= 4) {
      const c = Number(toks[i - 4]!);
      const m = Number(toks[i - 3]!);
      const y = Number(toks[i - 2]!);
      const k = Number(toks[i - 1]!);
      if (![c, m, y, k].some(Number.isNaN)) colorOp = `${fmt(c)} ${fmt(m)} ${fmt(y)} ${fmt(k)} k`;
    }
  }
  return {
    fontName: fontName ?? DA_DEFAULTS.fontName,
    fontSize: fontSize ?? DA_DEFAULTS.fontSize,
    colorOp: colorOp ?? DA_DEFAULTS.colorOp,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// String encoding for the Tj operator.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Escape a string for use in a PDF literal Tj string. Returns the full
 * "(...)" form for ASCII-only input, or a "<FEFF...>" UTF-16BE hex string
 * for any non-ASCII content. The result drops into a content stream
 * verbatim before the Tj operator.
 */
export function encodeStringForTj(s: string): string {
  let allAscii = true;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c > 0x7e) { allAscii = false; break; }
  }
  if (allAscii) {
    return '(' + s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')';
  }
  let hex = 'FEFF';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    hex += ((c >> 8) & 0xff).toString(16).padStart(2, '0').toUpperCase();
    hex += (c & 0xff).toString(16).padStart(2, '0').toUpperCase();
  }
  return '<' + hex + '>';
}

// ─────────────────────────────────────────────────────────────────────────────
// Font metrics — approximations for the 14 standard PDF fonts. PDF readers
// have these built in (no embedded font bytes needed), and we only need them
// for alignment math when /Q is center/right. Values are in 1/1000 em.
// ─────────────────────────────────────────────────────────────────────────────

/** Average glyph width as fraction of font size, used for centering math.
 *  Real per-char widths from PDF/Type1 spec would be more accurate, but for
 *  alignment-only purposes the average is enough — the widget always has
 *  internal clipping so over/under-shoot just affects where text sits. */
const AVG_WIDTH: Record<string, number> = {
  Helv: 0.5, HeBo: 0.55, HeIt: 0.5, HeBI: 0.55,
  TiRo: 0.5, TiBo: 0.52, TiIt: 0.5, TiBI: 0.52,
  Cour: 0.6, CoBo: 0.6, CoIt: 0.6, CoBI: 0.6,
  ZaDb: 0.6, Symb: 0.5,
};

/** Map /DA font name to a standard /BaseFont string for fontless resources. */
export function fontBaseName(name: string): string {
  const map: Record<string, string> = {
    Helv: 'Helvetica',  HeBo: 'Helvetica-Bold', HeIt: 'Helvetica-Oblique', HeBI: 'Helvetica-BoldOblique',
    TiRo: 'Times-Roman', TiBo: 'Times-Bold', TiIt: 'Times-Italic', TiBI: 'Times-BoldItalic',
    Cour: 'Courier', CoBo: 'Courier-Bold', CoIt: 'Courier-Oblique', CoBI: 'Courier-BoldOblique',
    ZaDb: 'ZapfDingbats', Symb: 'Symbol',
  };
  return map[name] ?? 'Helvetica';
}

function approxTextWidth(text: string, fontName: string, fontSize: number): number {
  const f = AVG_WIDTH[fontName] ?? AVG_WIDTH.Helv!;
  return text.length * fontSize * f;
}

// ─────────────────────────────────────────────────────────────────────────────
// Content-stream builders for the three text-ish appearance kinds.
// ─────────────────────────────────────────────────────────────────────────────

export interface TextAppearanceOpts {
  /** Field/widget rect in PDF coords: [x, y, w, h]. We only use w and h. */
  width: number;
  height: number;
  /** The text to display. May contain newlines for multiline fields. */
  text: string;
  /** Effective /DA string. */
  da: string | undefined;
  /** Text alignment from /Q. 0=left (default), 1=center, 2=right. */
  alignment?: 0 | 1 | 2;
  /** Multiline (text wraps on \n + auto-positions each line). */
  multiline?: boolean;
}

const PAD_X = 2;
const PAD_Y = 2;
const LINE_HEIGHT_RATIO = 1.2;

/**
 * Synthesize the content-stream bytes for an appearance form.
 * Structure: /Tx BMC ... EMC marks the whole thing as a text widget so the
 * PDF spec lets readers know it's auto-generated. Inside: graphics state
 * save, clipping rect (so overflowing text doesn't escape the widget),
 * BT...ET text block with the font op, fill color, text position, and Tj.
 */
export function buildTextAppearanceContent(opts: TextAppearanceOpts): Uint8Array {
  const { width: w, height: h, text, alignment = 0, multiline = false } = opts;
  const da = parseDA(opts.da);

  // Auto-fit font size when /DA had 0 — choose something that fits the rect.
  let fontSize = da.fontSize;
  if (fontSize <= 0) {
    fontSize = multiline ? 12 : Math.max(8, Math.min(18, h * 0.65));
  }
  const lineHeight = fontSize * LINE_HEIGHT_RATIO;

  const lines = multiline ? text.split(/\r\n|\r|\n/) : [text];

  // Compute the first line's baseline Y. For single line, vertical center.
  // For multiline, top-align inside the inner box.
  const innerH = h - PAD_Y * 2;
  const baselineDescent = fontSize * 0.2; // approx descent
  const firstBaselineY = multiline
    ? h - PAD_Y - fontSize * 0.8
    : (h - fontSize) / 2 + baselineDescent;

  const ops: string[] = [
    '/Tx BMC',
    'q',
    // Clipping rect so we never paint past the widget.
    `${fmt(PAD_X)} ${fmt(PAD_Y)} ${fmt(w - PAD_X * 2)} ${fmt(h - PAD_Y * 2)} re W n`,
    'BT',
    `/${da.fontName} ${fmt(fontSize)} Tf`,
    da.colorOp,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let lineX = PAD_X;
    if (alignment === 1) {
      const tw = approxTextWidth(line, da.fontName, fontSize);
      lineX = Math.max(PAD_X, (w - tw) / 2);
    } else if (alignment === 2) {
      const tw = approxTextWidth(line, da.fontName, fontSize);
      lineX = Math.max(PAD_X, w - tw - PAD_X);
    }
    if (i === 0) {
      ops.push(`${fmt(lineX)} ${fmt(firstBaselineY)} Td`);
    } else {
      // Move to next line: dx relative to prev line start, dy = -lineHeight
      const prevLineX = (() => {
        const pl = lines[i - 1]!;
        if (alignment === 1) {
          const tw = approxTextWidth(pl, da.fontName, fontSize);
          return Math.max(PAD_X, (w - tw) / 2);
        }
        if (alignment === 2) {
          const tw = approxTextWidth(pl, da.fontName, fontSize);
          return Math.max(PAD_X, w - tw - PAD_X);
        }
        return PAD_X;
      })();
      ops.push(`${fmt(lineX - prevLineX)} ${fmt(-lineHeight)} Td`);
    }
    ops.push(`${encodeStringForTj(line)} Tj`);

    // Multiline: only emit lines that fit inside innerH (drop the rest).
    if (multiline && (i + 1) * lineHeight > innerH) break;
  }

  ops.push('ET', 'Q', 'EMC');
  return new TextEncoder().encode(ops.join('\n'));
}

// ─────────────────────────────────────────────────────────────────────────────
// XObject form wrapper.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the /Type/XObject/Subtype/Form stream that contains the appearance.
 * The resources dict references the requested font as a standard 14 base
 * font — no font bytes are embedded (every PDF reader has these built in).
 */
export function buildAppearanceXObject(
  content: Uint8Array,
  width: number,
  height: number,
  fontName: string,
): PdfObject {
  const fontDict: PdfObject = {
    kind: 'dict',
    entries: new Map<string, PdfObject>([
      ['Type', { kind: 'name', value: 'Font' }],
      ['Subtype', { kind: 'name', value: 'Type1' }],
      ['BaseFont', { kind: 'name', value: fontBaseName(fontName) }],
      ['Encoding', { kind: 'name', value: 'WinAnsiEncoding' }],
    ]),
  };
  const fonts: PdfObject = {
    kind: 'dict',
    entries: new Map<string, PdfObject>([[fontName, fontDict]]),
  };
  const resources: PdfObject = {
    kind: 'dict',
    entries: new Map<string, PdfObject>([['Font', fonts]]),
  };

  return {
    kind: 'stream',
    dict: new Map<string, PdfObject>([
      ['Type', { kind: 'name', value: 'XObject' }],
      ['Subtype', { kind: 'name', value: 'Form' }],
      ['FormType', { kind: 'num', value: 1 }],
      ['BBox', {
        kind: 'array',
        items: [
          { kind: 'num', value: 0 },
          { kind: 'num', value: 0 },
          { kind: 'num', value: width },
          { kind: 'num', value: height },
        ],
      }],
      ['Matrix', {
        kind: 'array',
        items: [
          { kind: 'num', value: 1 }, { kind: 'num', value: 0 },
          { kind: 'num', value: 0 }, { kind: 'num', value: 1 },
          { kind: 'num', value: 0 }, { kind: 'num', value: 0 },
        ],
      }],
      ['Resources', resources],
      ['Length', { kind: 'num', value: content.length }],
    ]),
    raw: content,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}
