import type { PdfDocument } from './document.js';
import type { PdfObject } from './types.js';
import { decodeStream } from './streams.js';

/**
 * TRUE redaction — remove the text under a redaction rectangle from the page
 * content stream, not just paint a black box over it.
 *
 * A black rectangle alone is the classic redaction failure (Manafort 2019,
 * DOJ Epstein files 2025): the glyphs are still in the content stream and a
 * reader can copy-paste or text-extract them straight out. This pass parses
 * the page content stream, tracks text-positioning state, and BLANKS the
 * string operand of any text-showing operator (Tj / TJ / ' / ") whose drawn
 * box intersects a redaction rectangle — so the characters are physically
 * gone from the file. The positioning operators are kept (operands emptied)
 * so surrounding text stays put.
 *
 * Scope/safety: this handles axis-aligned text in the page's own content
 * stream(s) — the overwhelmingly common case. Text drawn inside Form XObjects,
 * Type3 glyphs, or via unusual constructs may be missed, so this is ALWAYS
 * paired with an independent verifier (see the engine/demo) that re-extracts
 * the saved bytes and refuses to certify if any text remains in a redacted
 * region. We deliberately over-remove on intersection (a partially-covered
 * Tj is blanked whole) — extra removal hides under the box; leaving text does
 * not.
 */

export interface RedactRect {
  /** PDF user-space points (origin bottom-left), same space as MediaBox. */
  x: number;
  y: number;
  width: number;
  height: number;
}

type Mat = [number, number, number, number, number, number];
const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

// Row-vector affine multiply: result = A then B.
function mul(a: Mat, b: Mat): Mat {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}
function apply(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

// ── content-stream tokenizer (shared with accessibility.ts) ──────────────────
export type TokType = 'num' | 'str' | 'name' | 'arr_open' | 'arr_close' | 'dict' | 'op';
export interface Tok { type: TokType; start: number; end: number; num?: number }

const WS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

export function tokenizeContent(b: Uint8Array): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = b.length;
  while (i < n) {
    const c = b[i]!;
    if (WS.has(c)) { i++; continue; }
    if (c === 0x25) { // % comment to EOL
      while (i < n && b[i] !== 0x0a && b[i] !== 0x0d) i++;
      continue;
    }
    if (c === 0x28) { // ( literal string
      const start = i; i++;
      let depth = 1;
      while (i < n && depth > 0) {
        const d = b[i]!;
        if (d === 0x5c) { i += 2; continue; } // escape
        if (d === 0x28) depth++;
        else if (d === 0x29) depth--;
        i++;
      }
      toks.push({ type: 'str', start, end: i });
      continue;
    }
    if (c === 0x3c && b[i + 1] === 0x3c) { // << dict open — pass through to >>
      const start = i; i += 2;
      let depth = 1;
      while (i < n && depth > 0) {
        if (b[i] === 0x3c && b[i + 1] === 0x3c) { depth++; i += 2; }
        else if (b[i] === 0x3e && b[i + 1] === 0x3e) { depth--; i += 2; }
        else i++;
      }
      toks.push({ type: 'dict', start, end: i });
      continue;
    }
    if (c === 0x3c) { // < hex string
      const start = i; i++;
      while (i < n && b[i] !== 0x3e) i++;
      i++; // consume >
      toks.push({ type: 'str', start, end: i });
      continue;
    }
    if (c === 0x2f) { // /name
      const start = i; i++;
      while (i < n && !WS.has(b[i]!) && !DELIM.has(b[i]!)) i++;
      toks.push({ type: 'name', start, end: i });
      continue;
    }
    if (c === 0x5b) { toks.push({ type: 'arr_open', start: i, end: i + 1 }); i++; continue; }
    if (c === 0x5d) { toks.push({ type: 'arr_close', start: i, end: i + 1 }); i++; continue; }
    // number or operator (bare keyword)
    const start = i;
    while (i < n && !WS.has(b[i]!) && !DELIM.has(b[i]!)) i++;
    const text = asAscii(b, start, i);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(text)) toks.push({ type: 'num', start, end: i, num: parseFloat(text) });
    else toks.push({ type: 'op', start, end: i });
  }
  return toks;
}

function asAscii(b: Uint8Array, s: number, e: number): string {
  let out = '';
  for (let i = s; i < e; i++) out += String.fromCharCode(b[i]!);
  return out;
}

/** Approx character count of a string token (for width estimation). */
function strLen(b: Uint8Array, tok: Tok): number {
  // literal: bytes between (), minus escapes (rough); hex: nibble pairs / 2.
  if (b[tok.start] === 0x3c) {
    let hex = 0;
    for (let i = tok.start + 1; i < tok.end - 1; i++) if (!WS.has(b[i]!)) hex++;
    return Math.ceil(hex / 2);
  }
  return Math.max(0, tok.end - tok.start - 2);
}

/**
 * Return the byte ranges (operand spans) to blank to remove text intersecting
 * any rect. Operates on one decoded content-stream buffer.
 */
function findBlankRanges(b: Uint8Array, rects: RedactRect[]): Array<[number, number]> {
  const toks = tokenizeContent(b);
  const blanks: Array<[number, number]> = [];

  let ctm: Mat = [...IDENTITY] as Mat;
  const gstack: Mat[] = [];
  let tm: Mat = [...IDENTITY] as Mat;
  let tlm: Mat = [...IDENTITY] as Mat;
  let fontSize = 0;
  let leading = 0;
  let charSpace = 0;
  let inText = false;

  // operand window: collect recent operands until an operator fires.
  let operands: Tok[] = [];
  const nums = () => operands.filter((t) => t.type === 'num').map((t) => t.num ?? 0);

  const showWidthText = (charCount: number): number =>
    charCount * (fontSize * 0.5 + charSpace);

  const flagIfHit = (operandTok: Tok, charCount: number) => {
    const trm = mul(tm, ctm);
    const w = showWidthText(charCount);
    const [x0, y0] = apply(trm, 0, 0);
    const [x1, y1] = apply(trm, w, 0);
    const [, yh] = apply(trm, 0, fontSize || 1);
    const h = Math.abs(yh - y0) || Math.abs(fontSize) || 8;
    const bx0 = Math.min(x0, x1);
    const bx1 = Math.max(x0, x1);
    const by0 = Math.min(y0, y1) - h * 0.25;
    const by1 = Math.max(y0, y1) + h * 0.85;
    for (const r of rects) {
      if (bx1 >= r.x && bx0 <= r.x + r.width && by1 >= r.y && by0 <= r.y + r.height) {
        blanks.push([operandTok.start, operandTok.end]);
        break;
      }
    }
    // advance text matrix by the shown width (so following text positions hold)
    tm = mul([1, 0, 0, 1, w, 0], tm);
  };

  for (const tok of toks) {
    if (tok.type !== 'op') { operands.push(tok); continue; }
    const op = asAscii(b, tok.start, tok.end);
    switch (op) {
      case 'q': gstack.push([...ctm] as Mat); break;
      case 'Q': ctm = gstack.pop() ?? ([...IDENTITY] as Mat); break;
      case 'cm': { const v = nums(); if (v.length >= 6) ctm = mul(v.slice(0, 6) as Mat, ctm); break; }
      case 'BT': inText = true; tm = [...IDENTITY] as Mat; tlm = [...IDENTITY] as Mat; break;
      case 'ET': inText = false; break;
      case 'Tf': { const v = nums(); if (v.length) fontSize = v[v.length - 1]!; break; }
      case 'TL': { const v = nums(); if (v.length) leading = v[v.length - 1]!; break; }
      case 'Tc': { const v = nums(); if (v.length) charSpace = v[v.length - 1]!; break; }
      case 'Tm': { const v = nums(); if (v.length >= 6) { tm = v.slice(0, 6) as Mat; tlm = [...tm] as Mat; } break; }
      case 'Td': { const v = nums(); if (v.length >= 2) { tlm = mul([1, 0, 0, 1, v[0]!, v[1]!], tlm); tm = [...tlm] as Mat; } break; }
      case 'TD': { const v = nums(); if (v.length >= 2) { leading = -v[1]!; tlm = mul([1, 0, 0, 1, v[0]!, v[1]!], tlm); tm = [...tlm] as Mat; } break; }
      case 'T*': { tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = [...tlm] as Mat; break; }
      case 'Tj': { const s = lastStr(operands); if (s && inText) flagIfHit(s, strLen(b, s)); break; }
      case "'": { tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = [...tlm] as Mat; const s = lastStr(operands); if (s && inText) flagIfHit(s, strLen(b, s)); break; }
      case '"': { const s = lastStr(operands); if (s && inText) flagIfHit(s, strLen(b, s)); break; }
      case 'TJ': {
        // operand is an array [ ... ]; blank the whole array span if any hit.
        const open = lastIndexOfType(operands, 'arr_open');
        if (open >= 0 && inText) {
          let chars = 0;
          for (let k = open + 1; k < operands.length; k++) {
            const t = operands[k]!;
            if (t.type === 'str') chars += strLen(b, t);
          }
          // Use the array-open token start to the operator-preceding close.
          const arrStart = operands[open]!.start;
          const close = operands[operands.length - 1];
          const arrEnd = close && close.type === 'arr_close' ? close.end : tok.start;
          flagIfHitRange(arrStart, arrEnd, chars);
        }
        break;
      }
      default: break;
    }
    operands = [];
  }

  function flagIfHitRange(rangeStart: number, rangeEnd: number, charCount: number) {
    const trm = mul(tm, ctm);
    const w = showWidthText(charCount);
    const [x0, y0] = apply(trm, 0, 0);
    const [x1, y1] = apply(trm, w, 0);
    const [, yh] = apply(trm, 0, fontSize || 1);
    const h = Math.abs(yh - y0) || Math.abs(fontSize) || 8;
    const bx0 = Math.min(x0, x1), bx1 = Math.max(x0, x1);
    const by0 = Math.min(y0, y1) - h * 0.25, by1 = Math.max(y0, y1) + h * 0.85;
    for (const r of rects) {
      if (bx1 >= r.x && bx0 <= r.x + r.width && by1 >= r.y && by0 <= r.y + r.height) {
        blanks.push([rangeStart, rangeEnd]);
        break;
      }
    }
    tm = mul([1, 0, 0, 1, w, 0], tm);
  }

  return blanks;
}

function lastStr(operands: Tok[]): Tok | null {
  for (let i = operands.length - 1; i >= 0; i--) if (operands[i]!.type === 'str') return operands[i]!;
  return null;
}
function lastIndexOfType(operands: Tok[], type: TokType): number {
  for (let i = operands.length - 1; i >= 0; i--) if (operands[i]!.type === type) return i;
  return -1;
}

/** Apply blank ranges to a buffer: replace each [start,end) operand with an
 *  empty equivalent — `()` for a string, `[]` for a TJ array. */
function blankBuffer(b: Uint8Array, ranges: Array<[number, number]>): Uint8Array {
  if (ranges.length === 0) return b;
  ranges.sort((a, c) => a[0] - c[0]);
  const out: number[] = [];
  let cursor = 0;
  for (const [s, e] of ranges) {
    for (let i = cursor; i < s; i++) out.push(b[i]!);
    const isArray = b[s] === 0x5b; // '['
    if (isArray) { out.push(0x5b, 0x5d); } else { out.push(0x28, 0x29); }
    cursor = e;
  }
  for (let i = cursor; i < b.length; i++) out.push(b[i]!);
  return new Uint8Array(out);
}

/** Remove text intersecting `rects` from a single decoded content buffer.
 *  Exported for unit testing. */
export function redactContentBuffer(decoded: Uint8Array, rects: RedactRect[]): Uint8Array {
  return blankBuffer(decoded, findBlankRanges(decoded, rects));
}

/** A redaction box as it comes from the editor: CSS pixels, top-left origin,
 *  with the rendered page size it was placed against. */
export interface RedactionInput {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  pageCssWidth: number;
  pageCssHeight: number;
}

async function findPageRefs(doc: PdfDocument): Promise<Array<PdfObject & { kind: 'ref' }>> {
  const refs: Array<PdfObject & { kind: 'ref' }> = [];
  if (!doc.root || doc.root.kind !== 'ref') return refs;
  const catalog = await doc.resolveDict(doc.root);
  const pagesRef = catalog.get('Pages');
  if (!pagesRef) return refs;
  await walk(pagesRef);
  return refs;
  async function walk(r: PdfObject): Promise<void> {
    if (r.kind !== 'ref') return;
    const d = await doc.resolveDict(r);
    if (d.get('Type')?.kind === 'name' && (d.get('Type') as { value: string }).value === 'Page') { refs.push(r); return; }
    const kids = d.get('Kids');
    if (kids?.kind === 'array') for (const k of kids.items) await walk(k);
  }
}

/**
 * Strip redacted text from page content streams in the incremental `updates`
 * map. CSS-space boxes are converted to PDF user space using each page's
 * MediaBox. We modify the underlying content-stream OBJECTS in place, so the
 * later overlay (black box) and tagging passes — which append to the page
 * /Contents array — compose correctly on top.
 */
export async function applyRedactions(
  doc: PdfDocument,
  inputs: RedactionInput[],
  updates: Map<number, PdfObject>,
): Promise<void> {
  if (inputs.length === 0) return;
  const pageRefs = await findPageRefs(doc);
  const byPage = new Map<number, RedactionInput[]>();
  for (const inp of inputs) (byPage.get(inp.page) ?? byPage.set(inp.page, []).get(inp.page)!).push(inp);

  for (const [pageNo, group] of byPage) {
    const pageRef = pageRefs[pageNo - 1];
    if (!pageRef) continue;
    const pageDict = await doc.resolveDict(pageRef);
    const mediaBox = pageDict.get('MediaBox') ?? pageDict.get('CropBox');
    if (!mediaBox || mediaBox.kind !== 'array' || mediaBox.items.length < 4) continue;
    const [llx, , urx, ury] = mediaBox.items.map((it) => (it.kind === 'num' ? it.value : 0)) as number[];
    const pdfW = (urx ?? 0) - (llx ?? 0);

    // CSS (top-left) → PDF user space (bottom-left).
    const rects: RedactRect[] = group.map((g) => {
      const scale = pdfW / (g.pageCssWidth || pdfW);
      return {
        x: (llx ?? 0) + g.x * scale,
        y: (ury ?? 0) - (g.y + g.height) * scale,
        width: g.width * scale,
        height: g.height * scale,
      };
    });

    const contents = pageDict.get('Contents');
    const streamRefs: Array<PdfObject & { kind: 'ref' }> = [];
    if (contents?.kind === 'ref') streamRefs.push(contents);
    else if (contents?.kind === 'array') {
      for (const it of contents.items) if (it.kind === 'ref') streamRefs.push(it);
    }
    if (streamRefs.length === 0) continue;

    // Decode each stream, concatenate with boundaries, find blanks across the
    // whole page, then map ranges back to their originating stream.
    const parts: Array<{ ref: PdfObject & { kind: 'ref' }; bytes: Uint8Array; offset: number }> = [];
    let combinedLen = 0;
    const chunks: Uint8Array[] = [];
    for (const ref of streamRefs) {
      const obj = await doc.resolve(ref);
      if (obj.kind !== 'stream') continue;
      const bytes = await decodeStream(obj);
      parts.push({ ref, bytes, offset: combinedLen });
      chunks.push(bytes);
      combinedLen += bytes.length + 1; // +1 for separating newline
    }
    const combined = new Uint8Array(combinedLen);
    {
      let o = 0;
      for (const c of chunks) { combined.set(c, o); o += c.length; combined[o] = 0x0a; o += 1; }
    }
    const ranges = findBlankRanges(combined, rects);
    if (ranges.length === 0) continue;

    // Map each range to a part and blank per-part.
    for (const part of parts) {
      const local: Array<[number, number]> = [];
      const lo = part.offset, hi = part.offset + part.bytes.length;
      for (const [s, e] of ranges) {
        if (s >= lo && s < hi) local.push([s - lo, Math.min(e, hi) - lo]);
      }
      if (local.length === 0) continue;
      const blanked = blankBuffer(part.bytes, local);
      const orig = await doc.resolve(part.ref);
      if (orig.kind !== 'stream') continue;
      // Drop any existing filter — store decoded+blanked; compressNewStreams
      // will re-Flate it. Keep other dict keys.
      const dict = new Map(orig.dict);
      dict.delete('Filter');
      dict.delete('DecodeParms');
      dict.delete('DL');
      dict.set('Length', { kind: 'num', value: blanked.length });
      updates.set(part.ref.objectNumber, { kind: 'stream', dict, raw: blanked });
    }
  }
}
