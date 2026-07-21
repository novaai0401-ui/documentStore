/**
 * Track 2 — multi-format conversion. Pyntra is a PDF tool first, but the
 * surrounding workflow is rarely PDF-only: people arrive with images, text,
 * markdown, or HTML and want a PDF, or they have a PDF and need its text or
 * page images out. These conversions all run in the browser:
 *
 *   • PDF  → text   (extracted page text, honest about scans)
 *   • PDF  → images (each page rasterized via pdf.js → PNG/JPEG, zipped)
 *   • images → PDF  (one image per page, via pdf-lib)
 *   • text / markdown / HTML → PDF (laid out with pdf-lib + standard fonts)
 *
 * Fidelity is stated plainly in the UI: text/markdown/HTML get a clean but
 * basic layout (no CSS rendering); a full DOCX/CSS-faithful path would be a
 * server- or wasm-renderer follow-up, not something we fake here.
 */
import type { PageRuns } from './util.js';
import { zipStore } from './zip.js';
import { decryptOfficeIfNeeded } from './officeCrypto.js';
import { renderMarkdown } from '../editors/markdown.js';

// ── PDF → text ────────────────────────────────────────────────────────────────

/** Flatten page-run bundles into plain text, one block per page, runs joined
 *  in reading order (top→bottom, left→right) with blank lines between pages. */
export function pdfRunsToText(pages: PageRuns[]): string {
  const blocks: string[] = [];
  for (const pg of pages) {
    const runs = [...pg.runs].sort((a, b) => (Math.abs(a.y - b.y) > 3 ? a.y - b.y : a.x - b.x));
    let line = '';
    let lastY = runs.length ? runs[0]!.y : 0;
    const lines: string[] = [];
    for (const r of runs) {
      if (Math.abs(r.y - lastY) > 3) {
        lines.push(line.trimEnd());
        line = '';
        lastY = r.y;
      }
      line += (line ? ' ' : '') + r.text;
    }
    if (line.trim()) lines.push(line.trimEnd());
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n');
}

// ── HTML / Markdown → blocks ────────────────────────────────────────────────────

/** A laid-out document block. Text blocks carry a string; tables carry a grid
 *  of cell strings (first row treated as a header); images carry decoded
 *  PNG/JPEG bytes. The same model drives Markdown/HTML/DOCX/CSV/XLSX → PDF.
 *
 *  Text/quote blocks may also carry `runs`: the inline-formatted spans (bold,
 *  italic, inline code, links) that let the PDF mirror the on-screen rendered
 *  view instead of flattening to plain text. `runs` is only attached when there
 *  *is* inline formatting; a plain block stays `{ type, text }` so the two are
 *  interchangeable and existing consumers are unaffected. */
export interface Run { text: string; bold?: boolean; italic?: boolean; code?: boolean; link?: boolean }
export type TextBlock = { type: 'h1' | 'h2' | 'h3' | 'p' | 'li'; text: string; runs?: Run[]; ordered?: boolean; marker?: string };
export type TableBlock = { type: 'table'; rows: string[][] };
export type ImageBlock = { type: 'image'; data: Uint8Array; fmt: 'png' | 'jpg' };
/** A fenced/`<pre>` code block, rendered monospaced on a shaded panel. */
export type CodeBlock = { type: 'code'; text: string; lines: string[] };
/** A block quote, rendered with an accent bar and indent. */
export type QuoteBlock = { type: 'quote'; text: string; runs?: Run[] };
/** A horizontal rule. */
export type HrBlock = { type: 'hr' };
export type DocBlock = TextBlock | TableBlock | ImageBlock | CodeBlock | QuoteBlock | HrBlock;

/** Parse an HTML inline fragment into formatted runs. Returns the flattened
 *  text plus, *only when some span is actually styled*, the run list. Whitespace
 *  is collapsed across the fragment and trimmed at the ends, matching how the
 *  preview renders. */
export function inlineRuns(fragment: string): { text: string; runs?: Run[] } {
  const runs: Run[] = [];
  const stack: Array<keyof Run> = [];
  const flags = (): Partial<Run> => {
    const f: Partial<Run> = {};
    for (const s of stack) f[s] = true as never;
    return f;
  };
  const tokenRe = /<(\/?)(strong|b|em|i|code|del|s|a)\b[^>]*>|([^<]+)/gi;
  let t: RegExpExecArray | null;
  while ((t = tokenRe.exec(fragment))) {
    if (t[3] != null) {
      const text = decodeEntities(t[3]).replace(/\s+/g, ' ');
      if (text) runs.push({ text, ...flags() });
      continue;
    }
    const closing = t[1] === '/';
    const tag = t[2]!.toLowerCase();
    const style: keyof Run | null =
      tag === 'strong' || tag === 'b' ? 'bold'
      : tag === 'em' || tag === 'i' ? 'italic'
      : tag === 'code' ? 'code'
      : tag === 'a' ? 'link'
      : null; // del/s → no PDF style (no strikethrough font); treat as plain
    if (!style) continue;
    if (closing) { const idx = stack.lastIndexOf(style); if (idx >= 0) stack.splice(idx, 1); }
    else stack.push(style);
  }
  // Trim the fragment's outer whitespace.
  if (runs.length) { runs[0]!.text = runs[0]!.text.replace(/^\s+/, ''); runs[runs.length - 1]!.text = runs[runs.length - 1]!.text.replace(/\s+$/, ''); }
  const cleaned = runs.filter((r) => r.text.length);
  const text = cleaned.map((r) => r.text).join('');
  const styled = cleaned.some((r) => r.bold || r.italic || r.code || r.link);
  return styled ? { text, runs: cleaned } : { text };
}

/** Decode the handful of HTML entities that matter for readable text. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

/** Strip HTML to readable plain text, preserving block boundaries and list
 *  items. Not a browser DOM parse (works in tests too) — a pragmatic regex
 *  pass that decodes the common entities. */
export function htmlToPlainText(html: string): string {
  const s = html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|h[1-6]|li|tr|section|article|header|footer)\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(s).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Parse HTML into layout blocks (headings, list items, paragraphs, **tables**,
 * and **images**) in document order, preserving structure — used for HTML→PDF
 * and DOCX→PDF (Word's HTML, with images inlined as data URIs by mammoth).
 * Inline tags are stripped; falls back to paragraph splitting when no block
 * tags are present.
 */
export function htmlToBlocks(html: string): DocBlock[] {
  const cleaned = html.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  // Strip everything except inline formatting tags, then parse the remainder into
  // formatted runs — so bold/italic/code/links survive into the PDF.
  const toRuns = (s: string) => inlineRuns(s.replace(/<\s*br\s*\/?\s*>/gi, ' ').replace(/<\/?(?!(?:strong|b|em|i|code|del|s|a)\b)[a-z][^>]*>/gi, ''));
  const items: Array<{ index: number; block: DocBlock }> = [];

  // Capture whole regions whose inner text must NOT be re-emitted by the
  // heading/paragraph pass: tables (cells) and code blocks (pre).
  const ranges: Array<{ start: number; end: number }> = [];
  const sweep = (re: RegExp, onMatch: (m: RegExpExecArray) => void) => {
    let x: RegExpExecArray | null;
    while ((x = re.exec(cleaned))) { ranges.push({ start: x.index, end: x.index + x[0].length }); onMatch(x); }
  };
  sweep(/<table[^>]*>[\s\S]*?<\/table\s*>/gi, (tm) => { const rows = parseHtmlTable(tm[0]); if (rows.length) items.push({ index: tm.index, block: { type: 'table', rows } }); });
  sweep(/<pre[^>]*>([\s\S]*?)<\/pre\s*>/gi, (pm) => {
    const inner = pm[1]!.replace(/<\/?code[^>]*>/gi, '');
    const lines = decodeEntities(inner).replace(/\n$/, '').split('\n');
    items.push({ index: pm.index, block: { type: 'code', text: lines.join('\n'), lines } });
  });
  const excluded = (i: number) => ranges.some((r) => i >= r.start && i < r.end);

  // Ordered-list ranges so <li>s inside an <ol> get 1. 2. 3. numbering.
  const olRanges: Array<{ start: number; end: number }> = [];
  { let om: RegExpExecArray | null; const olRe = /<ol\b[^>]*>[\s\S]*?<\/ol\s*>/gi; while ((om = olRe.exec(cleaned))) olRanges.push({ start: om.index, end: om.index + om[0].length }); }
  const olCounters = new Map<number, number>();

  const blockRe = /<(h[1-6]|p|li|blockquote)[^>]*>([\s\S]*?)<\/\1\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(cleaned))) {
    if (excluded(m.index)) continue;
    const tag = m[1]!.toLowerCase();
    const { text, runs } = toRuns(m[2]!);
    if (!text) continue;
    if (tag === 'blockquote') { items.push({ index: m.index, block: { type: 'quote', text, ...(runs ? { runs } : {}) } }); continue; }
    const type: TextBlock['type'] = tag === 'li' ? 'li' : tag[0] === 'h' ? (`h${Math.min(3, Number(tag[1]))}` as 'h1' | 'h2' | 'h3') : 'p';
    const block: TextBlock = { type, text, ...(runs ? { runs } : {}) };
    if (type === 'li') {
      const k = olRanges.findIndex((r) => m!.index >= r.start && m!.index < r.end);
      if (k >= 0) { const n = (olCounters.get(k) ?? 0) + 1; olCounters.set(k, n); block.ordered = true; block.marker = `${n}.  `; }
    }
    items.push({ index: m.index, block });
  }

  // Horizontal rules.
  { let hm: RegExpExecArray | null; const hrRe = /<hr\b[^>]*\/?>/gi; while ((hm = hrRe.exec(cleaned))) { if (!excluded(hm.index)) items.push({ index: hm.index, block: { type: 'hr' } }); } }

  const imgRe = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let im: RegExpExecArray | null;
  while ((im = imgRe.exec(cleaned))) {
    if (excluded(im.index)) continue;
    const img = dataUriToImage(im[1]!);
    if (img) items.push({ index: im.index, block: img });
  }

  items.sort((a, b) => a.index - b.index);
  if (items.length === 0) {
    return htmlToPlainText(html)
      .split(/\n{2,}/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => ({ type: 'p' as const, text: t }));
  }
  return items.map((x) => x.block);
}

/** Parse a single `<table>…</table>` fragment into a grid of cell strings. */
export function parseHtmlTable(tableHtml: string): string[][] {
  const cellText = (s: string) => decodeEntities(s.replace(/<\s*br\s*\/?\s*>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const rows: string[][] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr\s*>/gi;
  let tr: RegExpExecArray | null;
  while ((tr = trRe.exec(tableHtml))) {
    const cells: string[] = [];
    const cellRe = /<(t[dh])[^>]*>([\s\S]*?)<\/\1\s*>/gi;
    let c: RegExpExecArray | null;
    while ((c = cellRe.exec(tr[1]!))) cells.push(cellText(c[2]!));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

/** Decode a `data:image/(png|jpeg);base64,…` URI to an image block, or null. */
function dataUriToImage(src: string): ImageBlock | null {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(src.trim());
  if (!m) return null;
  const fmt: 'png' | 'jpg' = m[1]!.toLowerCase().startsWith('jp') ? 'jpg' : 'png';
  try {
    const bin = atob(m[2]!);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { type: 'image', data: bytes, fmt };
  } catch {
    return null;
  }
}

/** Parse a useful subset of Markdown into layout blocks (headings, bullet
 *  lists, paragraphs). Inline emphasis markers are stripped — we render a
 *  clean document, not a styled one. */
export function parseMarkdownBlocks(md: string): DocBlock[] {
  const stripInline = (t: string) =>
    t
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .trim();
  const blocks: DocBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      blocks.push({ type: 'p', text: stripInline(para.join(' ')) });
      para = [];
    }
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const li = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (line.trim() === '') {
      flush();
    } else if (h) {
      flush();
      const level = Math.min(3, h[1]!.length);
      blocks.push({ type: (`h${level}` as 'h1' | 'h2' | 'h3'), text: stripInline(h[2]!) });
    } else if (li) {
      flush();
      blocks.push({ type: 'li', text: stripInline(li[1]!) });
    } else {
      para.push(line.trim());
    }
  }
  flush();
  return blocks;
}

// ── blocks → PDF (pdf-lib) ──────────────────────────────────────────────────────

const PAGE_W = 612; // US Letter
const PAGE_H = 792;
const MARGIN = 54;

// pdf-lib's standard fonts only encode WinAnsi (CP1252). Map the common Unicode
// symbols that appear in Markdown/text/HTML/Office docs to safe equivalents, and
// replace anything still unencodable with '?', so conversion never throws on a
// character like "→" (0x2192). (CP1252 already covers smart quotes, em/en
// dashes, bullets, ellipsis, €, ™ — those pass through unchanged.)
const CP1252_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);
const SYMBOL_MAP: Record<string, string> = {
  '→': '->', '←': '<-', '↑': '^', '↓': 'v', '↔': '<->', '⇒': '=>', '⇐': '<=', '⇔': '<=>',
  '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~', '×': 'x', '÷': '/', '±': '+/-', '∞': 'inf',
  '✓': '[x]', '✔': '[x]', '☑': '[x]', '✗': 'x', '✘': 'x', '☒': 'x', '★': '*', '☆': '*',
  '●': '*', '○': 'o', '▪': '-', '▫': '-', '◦': '-', '·': '-', '–': '-', '—': '-',
  '≡': '=', '∑': 'sum', '√': 'sqrt', '°': ' deg', '€': 'EUR', '£': 'GBP', '¥': 'JPY',
};

export function winAnsiSafe(text: string): string {
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0x09 || cp === 0x0a || (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || CP1252_EXTRA.has(cp)) {
      out += ch;
    } else if (SYMBOL_MAP[ch]) {
      out += SYMBOL_MAP[ch];
    } else {
      out += '?';
    }
  }
  return out;
}

/** A document theme carried into PDF/PPTX/DOCX exports (hex colours). */
export interface PdfTheme { bg: string; fg: string; heading: string }
const hexRgb = (h: string): [number, number, number] => {
  const x = h.replace('#', '');
  return [parseInt(x.slice(0, 2), 16) / 255, parseInt(x.slice(2, 4), 16) / 255, parseInt(x.slice(4, 6), 16) / 255];
};

/** Lay out document blocks into a PDF with the standard Helvetica fonts.
 *  Handles word-wrapping, headings, bullets, tables, images, page breaks, and
 *  an optional document theme (background + text/heading colours). */
export async function blocksToPdf(blocks: DocBlock[], opts: { landscape?: boolean; theme?: PdfTheme } = {}): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const boldItalic = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  // Pick the face for an inline run given its style flags.
  const faceFor = (r: Run): typeof font => r.code ? mono : r.bold && r.italic ? boldItalic : r.bold ? bold : r.italic ? italic : font;

  // Wide tables (spreadsheets with many columns) lay out far better landscape.
  const PW = opts.landscape ? PAGE_H : PAGE_W;
  const PH = opts.landscape ? PAGE_W : PAGE_H;
  const themeBg = opts.theme && opts.theme.bg.toLowerCase() !== '#ffffff' ? rgb(...hexRgb(opts.theme.bg)) : null;
  const paintBg = () => { if (themeBg) page.drawRectangle({ x: 0, y: 0, width: PW, height: PH, color: themeBg }); };
  let page = pdf.addPage([PW, PH]);
  paintBg();
  let y = PH - MARGIN;
  const maxW = PW - MARGIN * 2;

  const newPage = () => {
    page = pdf.addPage([PW, PH]);
    paintBg();
    y = PH - MARGIN;
  };

  // Word-wrap to an available width (defaults to the full text column). Text is
  // sanitized to WinAnsi here so every measure/draw downstream is safe. A word
  // wider than the column is broken character-by-character so it never spills
  // over the cell border (the cause of overlapping table columns).
  const wrap = (text: string, f: typeof font, size: number, avail = maxW): string[] => {
    const out: string[] = [];
    for (const para of winAnsiSafe(text).split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      let cur = '';
      for (const w of words) {
        if (f.widthOfTextAtSize(w, size) > avail) {
          if (cur) { out.push(cur); cur = ''; }
          let chunk = '';
          for (const ch of w) {
            if (chunk && f.widthOfTextAtSize(chunk + ch, size) > avail) { out.push(chunk); chunk = ch; }
            else chunk += ch;
          }
          cur = chunk;
          continue;
        }
        const trial = cur ? cur + ' ' + w : w;
        if (f.widthOfTextAtSize(trial, size) > avail && cur) { out.push(cur); cur = w; }
        else cur = trial;
      }
      out.push(cur);
    }
    return out.length ? out : [''];
  };

  const ink = opts.theme ? rgb(...hexRgb(opts.theme.fg)) : rgb(0.1, 0.12, 0.16);
  const headingInk = opts.theme ? rgb(...hexRgb(opts.theme.heading)) : ink;
  // Borders/header fill must read on a dark theme too: blend toward the page
  // background so a light header tint never hides light text.
  const bgRgb = opts.theme ? hexRgb(opts.theme.bg) : [1, 1, 1];
  const fgRgb = opts.theme ? hexRgb(opts.theme.fg) : [0.1, 0.12, 0.16];
  const mix = (a: number[], b: number[], t: number): [number, number, number] => [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];
  const border = opts.theme ? rgb(...mix(bgRgb, fgRgb, 0.35)) : rgb(0.8, 0.83, 0.86);
  const headerBg = opts.theme ? rgb(...mix(bgRgb, fgRgb, 0.14)) : rgb(0.95, 0.96, 0.98);

  // Inline run colours: links read as links, inline code as a distinct accent
  // (kept readable on a dark theme by falling back to the body ink).
  const linkInk = rgb(0.13, 0.32, 0.78);
  const codeInk = opts.theme ? ink : rgb(0.66, 0.13, 0.30);
  const codePanel = opts.theme ? rgb(...mix(bgRgb, fgRgb, 0.1)) : rgb(0.96, 0.97, 0.98);
  const quoteBar = opts.theme ? rgb(...mix(bgRgb, fgRgb, 0.45)) : rgb(0.78, 0.81, 0.85);
  const quoteInk = opts.theme ? rgb(...mix(fgRgb, bgRgb, 0.25)) : rgb(0.38, 0.42, 0.48);

  const styleFor = (b: TextBlock): { f: typeof font; size: number; gap: number; before: number; indent: number; prefix: string } => {
    switch (b.type) {
      case 'h1': return { f: bold, size: 22, gap: 6, before: 14, indent: 0, prefix: '' };
      case 'h2': return { f: bold, size: 17, gap: 5, before: 12, indent: 0, prefix: '' };
      case 'h3': return { f: bold, size: 14, gap: 4, before: 10, indent: 0, prefix: '' };
      case 'li': return { f: font, size: 11, gap: 4, before: 2, indent: 16, prefix: b.marker ?? '•  ' };
      default: return { f: font, size: 11, gap: 4, before: 8, indent: 0, prefix: '' };
    }
  };

  // Break a too-wide token into chunks that each fit `avail`.
  const breakWord = (tok: string, f: typeof font, size: number, avail: number): string[] => {
    const out: string[] = []; let chunk = '';
    for (const ch of tok) { if (chunk && f.widthOfTextAtSize(chunk + ch, size) > avail) { out.push(chunk); chunk = ch; } else chunk += ch; }
    if (chunk) out.push(chunk);
    return out;
  };

  type Seg = { text: string; f: typeof font; color: typeof ink };
  // Wrap a run sequence into lines of styled segments. A marker (bullet/number)
  // is laid as a leading plain segment.
  const layoutRuns = (runs: Run[], size: number, avail: number, baseColor: typeof ink, marker = ''): Seg[][] => {
    const lines: Seg[][] = [[]];
    let w = 0;
    const push = (s: Seg) => lines[lines.length - 1]!.push(s);
    if (marker) { const ms = winAnsiSafe(marker); push({ text: ms, f: font, color: baseColor }); w += font.widthOfTextAtSize(ms, size); }
    for (const r of runs) {
      const f = faceFor(r);
      const color = r.link ? linkInk : r.code ? codeInk : baseColor;
      for (const tok of winAnsiSafe(r.text).split(/(\s+)/)) {
        if (!tok) continue;
        if (/^\s+$/.test(tok)) { if (w > 0) { push({ text: ' ', f, color }); w += f.widthOfTextAtSize(' ', size); } continue; }
        const pieces = f.widthOfTextAtSize(tok, size) > avail ? breakWord(tok, f, size, avail) : [tok];
        for (const piece of pieces) {
          const pw = f.widthOfTextAtSize(piece, size);
          if (w + pw > avail && w > 0) { lines.push([]); w = 0; }
          push({ text: piece, f, color }); w += pw;
        }
      }
    }
    return lines;
  };

  const drawSegLines = (lines: Seg[][], size: number, lineH: number, x0: number, hangingIndent = 0) => {
    for (let i = 0; i < lines.length; i++) {
      if (y - lineH < MARGIN) newPage();
      let x = x0 + (i > 0 ? hangingIndent : 0);
      for (const seg of lines[i]!) { if (seg.text) { page.drawText(seg.text, { x, y: y - size, size, font: seg.f, color: seg.color }); x += seg.f.widthOfTextAtSize(seg.text, size); } }
      y -= lineH;
    }
  };

  const drawTextBlock = (b: TextBlock) => {
    const st = styleFor(b);
    const col = b.type === 'h1' || b.type === 'h2' || b.type === 'h3' ? headingInk : ink;
    y -= st.before;
    const lineH = st.size * 1.4;
    const avail = maxW - st.indent;
    // Headings stay uniformly bold (inline emphasis inside them is moot), so they
    // use the plain path; body/list text renders its formatted runs.
    if (b.runs && b.runs.length && (b.type === 'p' || b.type === 'li')) {
      const lines = layoutRuns(b.runs, st.size, avail, col, st.prefix);
      drawSegLines(lines, st.size, lineH, MARGIN, st.indent);
    } else {
      const lines = wrap(st.prefix + b.text, st.f, st.size, avail);
      for (let i = 0; i < lines.length; i++) {
        if (y - lineH < MARGIN) newPage();
        const x = MARGIN + (b.type === 'li' && i > 0 ? st.indent : 0);
        page.drawText(lines[i]!, { x, y: y - st.size, size: st.size, font: st.f, color: col });
        y -= lineH;
      }
    }
    y -= st.gap;
  };

  // Block quote: an accent bar + indented, muted text.
  const drawQuote = (b: QuoteBlock) => {
    const size = 11, lineH = size * 1.4, indent = 16;
    y -= 8;
    const lines = b.runs && b.runs.length
      ? layoutRuns(b.runs, size, maxW - indent, quoteInk)
      : wrap(b.text, font, size, maxW - indent).map((ln) => [{ text: ln, f: font, color: quoteInk }] as Seg[]);
    const top = y;
    drawSegLines(lines, size, lineH, MARGIN + indent, 0);
    page.drawRectangle({ x: MARGIN, y: y + lineH - size, width: 3, height: top - (y + lineH - size), color: quoteBar });
    y -= 8;
  };

  // Fenced code: monospaced lines on a shaded panel.
  const drawCode = (b: CodeBlock) => {
    const size = 9.5, lineH = size * 1.4, pad = 8;
    const wrapped: string[] = [];
    for (const ln of b.lines) { const parts = wrap(ln === '' ? ' ' : ln, mono, size, maxW - pad * 2); for (const p of parts) wrapped.push(p); }
    y -= 6;
    let i = 0;
    while (i < wrapped.length) {
      const avail = Math.max(1, Math.floor((y - MARGIN - pad * 2) / lineH));
      const slice = wrapped.slice(i, i + Math.max(1, avail));
      const panelH = slice.length * lineH + pad * 2;
      page.drawRectangle({ x: MARGIN, y: y - panelH, width: maxW, height: panelH, color: codePanel, borderColor: border, borderWidth: 0.5 });
      let ty = y - pad - size;
      for (const ln of slice) { page.drawText(ln, { x: MARGIN + pad, y: ty, size, font: mono, color: ink }); ty -= lineH; }
      y -= panelH;
      i += slice.length;
      if (i < wrapped.length) newPage();
    }
    y -= 8;
  };

  const drawHr = () => { y -= 8; if (y - 4 < MARGIN) newPage(); page.drawRectangle({ x: MARGIN, y: y - 1, width: maxW, height: 0.8, color: border }); y -= 8; };

  const drawTable = (rows: string[][]) => {
    const cols = Math.max(...rows.map((r) => r.length));
    if (!rows.length || cols === 0) return;
    // Smaller type for column-heavy tables so cells stay readable.
    const size = cols >= 9 ? 7 : cols >= 6 ? 8 : 9;
    const lineH = size * 1.25;
    const pad = 3;
    // Column widths proportional to each column's widest cell (capped), then
    // normalized to the text column width — but never below a usable minimum.
    const raw = new Array(cols).fill(20);
    for (let c = 0; c < cols; c++) {
      for (const r of rows) raw[c] = Math.max(raw[c], Math.min(200, font.widthOfTextAtSize(r[c] ?? '', size) + pad * 2));
    }
    const sum = raw.reduce((a: number, b: number) => a + b, 0);
    const minCol = Math.min(maxW / cols, 34);
    let colW: number[] = raw.map((w: number) => Math.max(minCol, (w / sum) * maxW));
    // Re-normalize so the row still fits exactly within maxW.
    const total = colW.reduce((a, b) => a + b, 0);
    if (total > maxW) colW = colW.map((w) => (w / total) * maxW);

    const drawRow = (cells: string[], header: boolean) => {
      const perCell = Array.from({ length: cols }, (_, ci) => wrap(cells[ci] ?? '', header ? bold : font, size, colW[ci]! - pad * 2));
      const rowLines = Math.max(1, ...perCell.map((l) => l.length));
      const rowH = rowLines * lineH + pad * 2;
      if (y - rowH < MARGIN) newPage();
      let x = MARGIN;
      for (let ci = 0; ci < cols; ci++) {
        page.drawRectangle({ x, y: y - rowH, width: colW[ci]!, height: rowH, borderColor: border, borderWidth: 0.5, ...(header ? { color: headerBg } : {}) });
        let ty = y - pad - size;
        for (const ln of perCell[ci]!) { page.drawText(ln, { x: x + pad, y: ty, size, font: header ? bold : font, color: ink }); ty -= lineH; }
        x += colW[ci]!;
      }
      y -= rowH;
    };

    y -= 8;
    rows.forEach((r, ri) => drawRow(r, ri === 0));
    y -= 8;
  };

  const drawImage = async (b: ImageBlock) => {
    try {
      const embed = b.fmt === 'jpg' ? await pdf.embedJpg(b.data) : await pdf.embedPng(b.data);
      let w = embed.width;
      let h = embed.height;
      const fit = Math.min(1, maxW / w, (PAGE_H - MARGIN * 2) / h);
      w *= fit; h *= fit;
      y -= 6;
      if (y - h < MARGIN) newPage();
      page.drawImage(embed, { x: MARGIN, y: y - h, width: w, height: h });
      y -= h + 8;
    } catch { /* skip an undecodable image */ }
  };

  for (const b of blocks) {
    if (b.type === 'table') drawTable(b.rows);
    else if (b.type === 'image') await drawImage(b);
    else if (b.type === 'code') drawCode(b);
    else if (b.type === 'quote') drawQuote(b);
    else if (b.type === 'hr') drawHr();
    else drawTextBlock(b);
  }

  return pdf.save();
}

export async function textToPdf(text: string, theme?: PdfTheme): Promise<Uint8Array> {
  const blocks: DocBlock[] = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ type: 'p' as const, text: p.replace(/\s*\n\s*/g, ' ') }));
  return blocksToPdf(blocks.length ? blocks : [{ type: 'p', text: '' }], { theme });
}

// Render Markdown to a PDF that mirrors the on-screen preview: it goes through
// the *same* GitHub-flavored renderer the editor preview uses, so headings,
// emphasis, inline code, links, code fences, quotes, tables and rules all carry
// over instead of being flattened to plain paragraphs.
export const markdownToPdf = (md: string, theme?: PdfTheme) => blocksToPdf(htmlToBlocks(renderMarkdown(md)), { theme });
export const htmlToPdf = (html: string, theme?: PdfTheme) => blocksToPdf(htmlToBlocks(html), { theme });

// ── DOCX → PDF (mammoth → HTML → blocks → PDF) ──────────────────────────────────

/**
 * Convert a Word .docx to PDF. mammoth maps the document's semantic structure
 * (headings, lists, paragraphs, bold) to HTML; we keep the block structure and
 * lay it out with the standard fonts. Fidelity is honest: text, headings and
 * lists carry over — exact fonts, columns, images and complex tables do not.
 */
export async function docxToPdf(bytes: Uint8Array, password?: string, theme?: PdfTheme): Promise<Uint8Array> {
  bytes = await decryptOfficeIfNeeded(bytes, password);
  // Prefer our own run-level parser (bold/italic/underline/colour/size/align);
  // fall back to mammoth's structural conversion if anything looks off.
  try {
    const { parseDocxRich, richBlocksToPdf } = await import('./docxRich.js');
    const rich = await parseDocxRich(bytes);
    if (rich && rich.length) return await richBlocksToPdf(rich, theme);
  } catch { /* fall through to mammoth */ }
  type MammothInput = { arrayBuffer: ArrayBuffer; buffer: ArrayBuffer };
  const mod = (await import('mammoth')) as unknown as {
    convertToHtml?: (i: MammothInput) => Promise<{ value: string }>;
    default?: { convertToHtml: (i: MammothInput) => Promise<{ value: string }> };
  };
  const convert = mod.convertToHtml ?? mod.default?.convertToHtml;
  if (!convert) throw new Error('DOCX converter unavailable');
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  // The browser build reads `arrayBuffer`; the Node build reads `buffer`.
  // Pass both so this works in the app and in tests.
  const { value } = await convert({ arrayBuffer: ab, buffer: ab });
  // mammoth inlines images as base64 data URIs and emits real <table>s, so the
  // block parser carries images and tables through into the PDF.
  return blocksToPdf(htmlToBlocks(value), { theme });
}

// ── CSV / XLSX → PDF tables ──────────────────────────────────────────────────────

/** Parse delimited text (RFC 4180): quoted fields, embedded delimiters/newlines,
 *  and "" escapes. Returns a grid of cell strings. */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  row.push(field);
  // Drop a trailing empty row produced by a final newline.
  if (!(row.length === 1 && row[0] === '')) rows.push(row);
  return rows;
}

/** True when any table block is wide enough to warrant a landscape page. */
function hasWideTable(blocks: DocBlock[]): boolean {
  return blocks.some((b) => b.type === 'table' && Math.max(0, ...b.rows.map((r) => r.length)) > 6);
}

export async function csvToPdf(text: string, delimiter = ','): Promise<Uint8Array> {
  const rows = parseCsv(text, delimiter).filter((r) => r.some((c) => c.trim() !== ''));
  const blocks: DocBlock[] = rows.length ? [{ type: 'table', rows }] : [{ type: 'p', text: '' }];
  return blocksToPdf(blocks, { landscape: hasWideTable(blocks) });
}

/**
 * Convert a spreadsheet (.xlsx / .xls) to PDF, one table per sheet (a heading
 * per sheet when there's more than one). SheetJS is lazy-imported.
 */
export async function xlsxToPdf(bytes: Uint8Array, password?: string, theme?: PdfTheme): Promise<Uint8Array> {
  bytes = await decryptOfficeIfNeeded(bytes, password);
  const XLSX = (await import('xlsx')) as unknown as {
    read: (d: Uint8Array, o: { type: string }) => { SheetNames: string[]; Sheets: Record<string, unknown> };
    utils: { sheet_to_json: (ws: unknown, o: { header: 1; blankrows: boolean; defval: string }) => unknown[][] };
  };
  const wb = XLSX.read(bytes, { type: 'array' });
  const blocks: DocBlock[] = [];
  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, defval: '' });
    const rows = grid.map((r) => (r ?? []).map((c) => (c == null ? '' : String(c)))).filter((r) => r.some((c) => c.trim() !== ''));
    if (!rows.length) continue;
    if (wb.SheetNames.length > 1) blocks.push({ type: 'h2', text: name });
    blocks.push({ type: 'table', rows });
  }
  const out = blocks.length ? blocks : [{ type: 'p' as const, text: '' }];
  return blocksToPdf(out, { landscape: hasWideTable(out), theme });
}

// ── PDF → Markdown ──────────────────────────────────────────────────────────────

export interface MdHeading {
  page: number;
  level: number;
  text: string;
}

/**
 * Render extracted page text as Markdown. Detected headings (passed in from the
 * heading detector) become `#`-prefixed lines at their level; everything else
 * is paragraph text. Heuristic — honest about being a best-effort structure.
 */
export function pdfRunsToMarkdown(pages: PageRuns[], headings: MdHeading[] = []): string {
  const headingAt = new Map<string, number>();
  for (const h of headings) headingAt.set(`${h.page}::${h.text.trim()}`, Math.min(6, Math.max(1, h.level)));
  const out: string[] = [];
  for (const pg of pages) {
    const runs = [...pg.runs].sort((a, b) => (Math.abs(a.y - b.y) > 3 ? a.y - b.y : a.x - b.x));
    let line = '';
    let lastY = runs.length ? runs[0]!.y : 0;
    const emit = (text: string) => {
      const t = text.trim();
      if (!t) return;
      const lvl = headingAt.get(`${pg.page}::${t}`);
      out.push(lvl ? `${'#'.repeat(lvl)} ${t}` : t);
    };
    for (const r of runs) {
      if (Math.abs(r.y - lastY) > 3) { emit(line); line = ''; lastY = r.y; }
      line += (line ? ' ' : '') + r.text;
    }
    emit(line);
    out.push(''); // blank line between pages
  }
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ── PDF → Word (.docx) ──────────────────────────────────────────────────────────

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Split each page's runs into lines tagged with a heading level (0 = body). */
function pageDocLines(pages: PageRuns[], headings: MdHeading[]): Array<Array<{ text: string; level: number }>> {
  const headingAt = new Map<string, number>();
  for (const h of headings) headingAt.set(`${h.page}::${h.text.trim()}`, Math.min(3, Math.max(1, h.level)));
  return pages.map((pg) => {
    const runs = [...pg.runs].sort((a, b) => (Math.abs(a.y - b.y) > 3 ? a.y - b.y : a.x - b.x));
    const lines: Array<{ text: string; level: number }> = [];
    let line = '';
    let lastY = runs.length ? runs[0]!.y : 0;
    const emit = (t: string) => {
      const s = t.trim();
      if (s) lines.push({ text: s, level: headingAt.get(`${pg.page}::${s}`) ?? 0 });
    };
    for (const r of runs) {
      if (Math.abs(r.y - lastY) > 3) { emit(line); line = ''; lastY = r.y; }
      line += (line ? ' ' : '') + r.text;
    }
    emit(line);
    return lines;
  });
}

/** A PNG image to bake into the .docx, with its pixel dimensions. */
export interface DocxImage {
  page: number;
  data: Uint8Array; // PNG bytes
  width: number;
  height: number;
}

const EMU_PER_PX = 9525;
const DOCX_MAX_W_EMU = 6 * 914400; // 6 inch content width

/**
 * Export extracted content to a real, editable Word .docx (a hand-built OOXML
 * package — no writer dependency). Detected headings become Word Heading 1–3
 * styles; detected **tables** become native Word tables; extracted **images**
 * are embedded (DrawingML); pages are separated by page breaks. Honest: this
 * is the document's content reflowed into Word, not a pixel copy of the layout.
 */
export function runsToDocx(
  pages: PageRuns[],
  headings: MdHeading[] = [],
  extras: { tables?: SheetTable[]; images?: DocxImage[] } = {},
): Uint8Array {
  const byPage = pageDocLines(pages, headings);
  const tablesByPage = new Map<number, string[][][]>();
  for (const t of extras.tables ?? []) (tablesByPage.get(t.page) ?? tablesByPage.set(t.page, []).get(t.page)!).push(t.rows);
  const imagesByPage = new Map<number, DocxImage[]>();
  for (const im of extras.images ?? []) (imagesByPage.get(im.page) ?? imagesByPage.set(im.page, []).get(im.page)!).push(im);

  const tableXml = (rows: string[][]) => {
    const cols = Math.max(1, ...rows.map((r) => r.length));
    const borders = '<w:tblBorders>' +
      ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`).join('') +
      '</w:tblBorders>';
    const trs = rows.map((r) =>
      '<w:tr>' + Array.from({ length: cols }, (_, ci) => `<w:tc><w:tcPr/><w:p><w:r><w:t xml:space="preserve">${xmlEscape(r[ci] ?? '')}</w:t></w:r></w:p></w:tc>`).join('') + '</w:tr>',
    ).join('');
    // A table must be followed by a paragraph in OOXML.
    return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${borders}</w:tblPr>${trs}</w:tbl><w:p/>`;
  };

  // Image parts + relationships are collected as we emit drawings.
  const media: Array<{ name: string; data: Uint8Array }> = [];
  const imageRels: string[] = [];
  let rid = 2; // rId1 is the styles relationship
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const drawingXml = (img: DocxImage) => {
    const n = media.length + 1;
    const id = `rId${rid++}`;
    media.push({ name: `word/media/image${n}.png`, data: img.data });
    imageRels.push(`<Relationship Id="${id}" Type="${R}/image" Target="media/image${n}.png"/>`);
    let cx = img.width * EMU_PER_PX;
    let cy = img.height * EMU_PER_PX;
    if (cx > DOCX_MAX_W_EMU) { const s = DOCX_MAX_W_EMU / cx; cx *= s; cy *= s; }
    cx = Math.round(cx); cy = Math.round(cy);
    return `<w:p><w:r><w:drawing>` +
      `<wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
      `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Image ${n}"/>` +
      `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:nvPicPr><pic:cNvPr id="${n}" name="Image ${n}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${id}" xmlns:r="${R}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
      `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  };

  const paras: string[] = [];
  byPage.forEach((lines, pi) => {
    if (pi > 0) paras.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    const pageNo = pages[pi]!.page;
    const tbls = tablesByPage.get(pageNo) ?? [];
    const imgs = imagesByPage.get(pageNo) ?? [];
    if (lines.length === 0 && tbls.length === 0 && imgs.length === 0) paras.push('<w:p/>');
    for (const ln of lines) {
      const style = ln.level ? `<w:pPr><w:pStyle w:val="Heading${ln.level}"/></w:pPr>` : '';
      paras.push(`<w:p>${style}<w:r><w:t xml:space="preserve">${xmlEscape(ln.text)}</w:t></w:r></w:p>`);
    }
    for (const rows of tbls) paras.push(tableXml(rows));
    for (const im of imgs) paras.push(drawingXml(im));
  });

  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W}"><w:body>${paras.join('')}<w:sectPr/></w:body></w:document>`;

  const headingStyle = (id: number, size: number) =>
    `<w:style w:type="paragraph" w:styleId="Heading${id}"><w:name w:val="heading ${id}"/>` +
    `<w:pPr><w:keepNext/><w:outlineLvl w:val="${id - 1}"/></w:pPr>` +
    `<w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`;
  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:styles xmlns:w="${W}">` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
    headingStyle(1, 36) + headingStyle(2, 28) + headingStyle(3, 24) +
    `</w:styles>`;

  const ct =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    (media.length ? `<Default Extension="png" ContentType="image/png"/>` : '') +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`;
  const docRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${R}/styles" Target="styles.xml"/>${imageRels.join('')}</Relationships>`;

  const enc = new TextEncoder();
  return zipStore([
    { name: '[Content_Types].xml', data: enc.encode(ct) },
    { name: '_rels/.rels', data: enc.encode(rels) },
    { name: 'word/document.xml', data: enc.encode(documentXml) },
    { name: 'word/styles.xml', data: enc.encode(stylesXml) },
    { name: 'word/_rels/document.xml.rels', data: enc.encode(docRels) },
    ...media,
  ]);
}

// ── PDF tables → Excel (.xlsx) ───────────────────────────────────────────────────

export interface SheetTable {
  page: number;
  rows: string[][];
}

/** Build an .xlsx workbook from named sheets (SheetJS, lazy-imported). */
export async function sheetsToXlsx(sheets: Array<{ name: string; rows: string[][] }>): Promise<Uint8Array> {
  const XLSX = (await import('xlsx')) as unknown as {
    utils: {
      book_new: () => unknown;
      aoa_to_sheet: (rows: string[][]) => unknown;
      book_append_sheet: (wb: unknown, ws: unknown, name: string) => void;
    };
    write: (wb: unknown, o: { type: string; bookType: string }) => ArrayBuffer;
  };
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const s of sheets.length ? sheets : [{ name: 'Sheet1', rows: [['']] }]) {
    // Sheet names: ≤31 chars, no : \ / ? * [ ], and unique.
    let name = (s.name || 'Sheet').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';
    while (used.has(name)) name = name.slice(0, 28) + '~' + (used.size % 10);
    used.add(name);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows.length ? s.rows : [['']]), name);
  }
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

/**
 * Export detected tables to a real .xlsx workbook (one sheet per table). Cells
 * are written as values, so the result is fully editable.
 */
export function tablesToXlsx(tables: SheetTable[]): Promise<Uint8Array> {
  return sheetsToXlsx(tables.map((t, i) => ({ name: `Table ${i + 1} (p${t.page})`, rows: t.rows })));
}

/** All page text as spreadsheet rows: [Page, Line] — for a "full content"
 *  sheet alongside detected tables. */
export function pagesToSheetRows(pages: PageRuns[]): string[][] {
  const rows: string[][] = [['Page', 'Text']];
  for (const pg of pages) {
    const runs = [...pg.runs].sort((a, b) => (Math.abs(a.y - b.y) > 3 ? a.y - b.y : a.x - b.x));
    let line = '';
    let lastY = runs.length ? runs[0]!.y : 0;
    const emit = () => { if (line.trim()) rows.push([String(pg.page), line.trim()]); line = ''; };
    for (const r of runs) {
      if (Math.abs(r.y - lastY) > 3) { emit(); lastY = r.y; }
      line += (line ? ' ' : '') + r.text;
    }
    emit();
  }
  return rows;
}

/** Split pages into per-slide content (first line → title, rest → body). */
export function pagesToSlides(pages: PageRuns[]): Array<{ title: string; body: string[] }> {
  return pages.map((pg, i) => {
    const runs = [...pg.runs].sort((a, b) => (Math.abs(a.y - b.y) > 3 ? a.y - b.y : a.x - b.x));
    const lines: string[] = [];
    let line = '';
    let lastY = runs.length ? runs[0]!.y : 0;
    const emit = () => { if (line.trim()) lines.push(line.trim()); line = ''; };
    for (const r of runs) { if (Math.abs(r.y - lastY) > 3) { emit(); lastY = r.y; } line += (line ? ' ' : '') + r.text; }
    emit();
    return { title: lines[0] ?? `Slide ${i + 1}`, body: lines.slice(1) };
  });
}

/** Combine detected tables into a single CSV blob (RFC-4180-escaped), each
 *  table preceded by a `# Table N (pX)` comment row, blank-line separated. */
export function tablesToCombinedCsv(tables: SheetTable[]): string {
  const esc = (v: string) => (/[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  return tables
    .map((t, i) => `# Table ${i + 1} (page ${t.page})\r\n` + t.rows.map((r) => r.map(esc).join(',')).join('\r\n'))
    .join('\r\n\r\n') + '\r\n';
}

// ── PDF → EPUB (reflowable e-book) ──────────────────────────────────────────────

/**
 * Export extracted text to a valid EPUB 3 (a zip with the required `mimetype`
 * stored first). Headings become `<h1..h3>`, body becomes `<p>` — a
 * reflowable e-book that opens in any reader. No images (text-first).
 */
export function runsToEpub(pages: PageRuns[], headings: MdHeading[] = [], title = 'Document'): Uint8Array {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = pageDocLines(pages, headings)
    .map((lines) => lines.map((ln) => (ln.level ? `<h${ln.level}>${esc(ln.text)}</h${ln.level}>` : `<p>${esc(ln.text)}</p>`)).join('\n'))
    .join('\n<hr/>\n');
  const uid = 'urn:uuid:' + (globalThis.crypto?.randomUUID?.() ?? `pdfcraft-${Date.now()}`);
  const content =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${esc(title)}</title></head>` +
    `<body>${body || '<p></p>'}</body></html>`;
  const opf =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">` +
    `<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">` +
    `<dc:identifier id="bookid">${uid}</dc:identifier><dc:title>${esc(title)}</dc:title>` +
    `<dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta></metadata>` +
    `<manifest>` +
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>` +
    `<item id="content" href="content.xhtml" media-type="application/xhtml+xml"/></manifest>` +
    `<spine><itemref idref="content"/></spine></package>`;
  const nav =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${esc(title)}</title></head>` +
    `<body><nav epub:type="toc" id="toc"><ol><li><a href="content.xhtml">${esc(title)}</a></li></ol></nav></body></html>`;
  const container =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">` +
    `<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
  const enc = new TextEncoder();
  // `mimetype` MUST be the first entry and stored uncompressed — zipStore is
  // STORE-only and preserves order, so listing it first satisfies the spec.
  return zipStore([
    { name: 'mimetype', data: enc.encode('application/epub+zip') },
    { name: 'META-INF/container.xml', data: enc.encode(container) },
    { name: 'OEBPS/content.opf', data: enc.encode(opf) },
    { name: 'OEBPS/nav.xhtml', data: enc.encode(nav) },
    { name: 'OEBPS/content.xhtml', data: enc.encode(content) },
  ]);
}

// ── PowerPoint (.pptx) → PDF ─────────────────────────────────────────────────────

/** Extract paragraph text from one slide's XML, in reading order. */
export function parsePptxSlideText(slideXml: string): string[] {
  const paras: string[] = [];
  const pRe = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(slideXml))) {
    const tRe = /<a:t>([\s\S]*?)<\/a:t>/g;
    let t: RegExpExecArray | null;
    let s = '';
    while ((t = tRe.exec(m[1]!))) s += decodeEntities(t[1]!);
    if (s.trim()) paras.push(s.trim());
  }
  return paras;
}

/**
 * Convert a PowerPoint .pptx to PDF: one section per slide ("Slide N" heading +
 * its text), laid out with the standard fonts. fflate (lazy) unzips the OOXML;
 * honest fidelity — text and reading order carry over, not the slide visuals.
 */
export async function pptxToPdf(bytes: Uint8Array, password?: string, theme?: PdfTheme): Promise<Uint8Array> {
  bytes = await decryptOfficeIfNeeded(bytes, password);
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(bytes);
  const slideNo = (n: string) => Number(/slide(\d+)\.xml$/.exec(n)?.[1] ?? 0);
  const slides = Object.keys(files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNo(a) - slideNo(b));
  const blocks: DocBlock[] = [];
  slides.forEach((n, i) => {
    blocks.push({ type: 'h2', text: `Slide ${i + 1}` });
    for (const t of parsePptxSlideText(strFromU8(files[n]!))) blocks.push({ type: 'p', text: t });
  });
  return blocksToPdf(blocks.length ? blocks : [{ type: 'p', text: '' }], { theme });
}

export type SlideLayout = 'titleContent' | 'title' | 'section' | 'imageRight' | 'blank';
export interface Slide { title: string; body: string[]; notes?: string; image?: string; layout?: SlideLayout }

/** Parse a .pptx into editable slides (first paragraph → title, rest → body). */
export async function pptxToSlides(bytes: Uint8Array): Promise<Slide[]> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(bytes);
  const slideNo = (n: string) => Number(/slide(\d+)\.xml$/.exec(n)?.[1] ?? 0);
  const slides = Object.keys(files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNo(a) - slideNo(b));
  const out = slides.map((n, i) => {
    const paras = parsePptxSlideText(strFromU8(files[n]!));
    return { title: paras[0] ?? `Slide ${i + 1}`, body: paras.slice(1) };
  });
  return out.length ? out : [{ title: 'Slide 1', body: [] }];
}

// ── Image format expansion (WEBP / GIF / BMP / SVG → PNG, in-browser) ────────────

const RASTERIZABLE = new Set(['webp', 'gif', 'bmp', 'svg', 'svg+xml']);

/** Decode any browser-supported image to PNG bytes via a canvas. Used so
 *  formats pdf-lib can't embed directly (WEBP/GIF/BMP/SVG) still become PDF
 *  pages. Browser-only (needs canvas); returns null if the image can't decode
 *  (e.g. TIFF/HEIC, which browsers don't render). */
export async function rasterizeToPng(bytes: Uint8Array, mime: string): Promise<Uint8Array | null> {
  try {
    const blob = new Blob([bytes as BlobPart], { type: mime || 'image/png' });
    let width: number;
    let height: number;
    let source: CanvasImageSource;
    if (typeof createImageBitmap === 'function') {
      const bmp = await createImageBitmap(blob);
      width = bmp.width; height = bmp.height; source = bmp;
    } else {
      const url = URL.createObjectURL(blob);
      try {
        const img = await new Promise<HTMLImageElement>((res, rej) => {
          const el = new Image();
          el.onload = () => res(el);
          el.onerror = rej;
          el.src = url;
        });
        width = img.naturalWidth || 300; height = img.naturalHeight || 150; source = img;
      } finally { URL.revokeObjectURL(url); }
    }
    if (!width || !height) return null;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(source, 0, 0);
    const out: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'));
    return new Uint8Array(await out.arrayBuffer());
  } catch {
    return null;
  }
}

/** Decode a TIFF with our own decoder and re-encode as PNG (no canvas needed,
 *  so it works in any environment). Returns null if it isn't a baseline TIFF we
 *  support. */
export async function tiffToPng(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const [{ decodeTiff }, { encodePngRGBA }] = await Promise.all([import('./tiff.js'), import('./png.js')]);
    const img = await decodeTiff(bytes);
    return await encodePngRGBA(img.width, img.height, img.rgba);
  } catch {
    return null;
  }
}

/** Normalize an image file to embeddable PNG/JPEG bytes: PNG/JPEG pass through;
 *  TIFF is decoded by our own decoder; WEBP/GIF/BMP/SVG are rasterized via
 *  canvas; anything else returns null. */
export async function toEmbeddableImage(bytes: Uint8Array, ext: string, mime: string): Promise<ImageInput | null> {
  const e = ext.toLowerCase();
  if (e === 'png' || e === 'jpg' || e === 'jpeg' || mime === 'image/png' || mime === 'image/jpeg') {
    return { bytes, type: e === 'jpg' || e === 'jpeg' || mime === 'image/jpeg' ? 'jpg' : 'png' };
  }
  if (e === 'tif' || e === 'tiff' || mime === 'image/tiff') {
    const png = await tiffToPng(bytes);
    return png ? { bytes: png, type: 'png' } : null;
  }
  const subtype = mime.split('/')[1] ?? e;
  if (RASTERIZABLE.has(e) || RASTERIZABLE.has(subtype)) {
    const png = await rasterizeToPng(bytes, mime || `image/${e}`);
    return png ? { bytes: png, type: 'png' } : null;
  }
  return null;
}

// ── Open-any-document dispatch ──────────────────────────────────────────────────

const stripExt = (n: string) => n.replace(/\.[^.]+$/, '') || 'document';

/** File types `fileToPdf` knows how to open (besides PDF itself). */
export const OPENABLE_ACCEPT =
  'application/pdf,.pdf,.md,.markdown,.txt,.text,.html,.htm,.rtf,.docx,.pptx,.odt,.odp,.ods,.csv,.tsv,.xlsx,.xls,' +
  'image/png,image/jpeg,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,.tif,.tiff';

/**
 * Convert an arbitrary supported document to PDF bytes so it can be opened in
 * the editor. Returns `null` for a PDF (the caller loads it directly) and
 * throws for an unsupported/empty conversion so the UI can report it.
 */
export async function fileToPdf(file: File, password?: string): Promise<{ bytes: Uint8Array; name: string } | null> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  const name = stripExt(file.name);
  const buf = new Uint8Array(await file.arrayBuffer());
  const text = () => new TextDecoder().decode(buf);

  if (ext === 'pdf' || file.type === 'application/pdf') return null;
  if (ext === 'md' || ext === 'markdown') return { bytes: await markdownToPdf(text()), name };
  if (ext === 'html' || ext === 'htm') return { bytes: await htmlToPdf(text()), name };
  if (ext === 'docx') return { bytes: await docxToPdf(buf, password), name };
  if (ext === 'pptx') return { bytes: await pptxToPdf(buf, password), name };
  if (ext === 'rtf') return { bytes: await textToPdf((await import('./rtf.js')).rtfToText(text())), name };
  if (ext === 'odt') return { bytes: await (await import('./odf.js')).odtToPdf(buf), name };
  if (ext === 'odp') return { bytes: await (await import('./odf.js')).odpToPdf(buf), name };
  if (ext === 'ods') return { bytes: await xlsxToPdf(buf, password), name }; // SheetJS reads ODS
  if (ext === 'csv' || ext === 'tsv') return { bytes: await csvToPdf(text(), ext === 'tsv' ? '\t' : ','), name };
  if (ext === 'xlsx' || ext === 'xls') return { bytes: await xlsxToPdf(buf, password), name };
  if (ext === 'svg' || ext === 'svgz') return { bytes: await imageFileToPdf(buf, ext, file.type), name };
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff'].includes(ext) || file.type.startsWith('image/')) {
    return { bytes: await imageFileToPdf(buf, ext, file.type), name };
  }
  if (ext === 'txt' || ext === 'text' || file.type.startsWith('text/') || !ext) {
    return { bytes: await textToPdf(text()), name };
  }
  throw new Error(`Can't open .${ext} files yet`);
}

/** Turn an image file (any browser-decodable format) into a one-page PDF,
 *  rasterizing non-PNG/JPEG inputs to PNG first. */
async function imageFileToPdf(buf: Uint8Array, ext: string, mime: string): Promise<Uint8Array> {
  const img = await toEmbeddableImage(buf, ext, mime);
  if (!img) throw new Error(`Can't open .${ext || 'image'} files yet (try PNG/JPEG/WEBP/GIF/BMP/SVG)`);
  const r = await imagesToPdf([img]);
  if (!r.embedded) throw new Error('Unsupported image format');
  return r.bytes;
}

// ── images → PDF (pdf-lib) ──────────────────────────────────────────────────────

export interface ImageInput {
  bytes: Uint8Array;
  /** 'jpg' | 'png' — inferred from the file's magic bytes when omitted. */
  type?: 'jpg' | 'png';
  name?: string;
}

function sniffImage(bytes: Uint8Array): 'jpg' | 'png' | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  return null;
}

/** Build a PDF with one image per page, each page sized to its image (capped
 *  to a sane max so huge photos don't make absurd pages). Unsupported formats
 *  are skipped and reported via the returned `skipped` count. */
export async function imagesToPdf(images: ImageInput[]): Promise<{ bytes: Uint8Array; embedded: number; skipped: number }> {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  let embedded = 0;
  let skipped = 0;
  const MAX = 1400; // max page dimension in points

  for (const img of images) {
    const kind = img.type ?? sniffImage(img.bytes);
    if (!kind) { skipped++; continue; }
    try {
      const embed = kind === 'jpg' ? await pdf.embedJpg(img.bytes) : await pdf.embedPng(img.bytes);
      let { width, height } = embed;
      const scale = Math.min(1, MAX / Math.max(width, height));
      width *= scale;
      height *= scale;
      const page = pdf.addPage([width, height]);
      page.drawImage(embed, { x: 0, y: 0, width, height });
      embedded++;
    } catch {
      skipped++;
    }
  }
  if (embedded === 0) pdf.addPage([PAGE_W, PAGE_H]); // never emit a 0-page PDF
  return { bytes: await pdf.save(), embedded, skipped };
}

// ── PDF → page images (pdf.js) ──────────────────────────────────────────────────

export interface RenderedPage {
  page: number;
  bytes: Uint8Array;
  ext: 'png' | 'jpg';
}

interface PdfRenderDoc {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (o: { scale: number }) => { width: number; height: number };
    render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
  }>;
}

async function canvasToBytes(canvas: HTMLCanvasElement, format: 'png' | 'jpg', quality: number): Promise<Uint8Array> {
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), mime, quality));
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Rasterize every page of a PDF to an image at the given DPI. Pure pdf.js
 * rendering (engine lazy-imported), so it composes with whatever the document
 * actually looks like (form values, overlays once burned in).
 */
export async function pdfToImages(
  bytes: Uint8Array,
  opts: { dpi?: number; format?: 'png' | 'jpg'; quality?: number } = {},
): Promise<RenderedPage[]> {
  const { dpi = 144, format = 'png', quality = 0.92 } = opts;
  const { loadDocument, getPdfjsDocument } = await import('@pdfcraft/engine');
  const handle = await loadDocument(bytes);
  const doc = getPdfjsDocument(handle) as unknown as PdfRenderDoc;
  const scale = dpi / 72;
  const out: RenderedPage[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    out.push({ page: p, bytes: await canvasToBytes(canvas, format, quality), ext: format });
  }
  return out;
}
