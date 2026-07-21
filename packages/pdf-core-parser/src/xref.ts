import { ByteReader, isDigit, isWhitespace } from './reader.js';
import { parseObject } from './parser.js';
import { inflate } from './streams.js';
import type { PdfObject } from './types.js';

export interface XrefEntry {
  /** For inUse entries: byte offset of "n g obj" in the file.
   *  For compressed entries: object number of the containing ObjStm. */
  offset: number;
  generation: number;
  inUse: boolean;
  /** True if the object lives inside a /Type/ObjStm at `offset`. */
  compressed?: boolean;
  /** Index within the ObjStm for compressed entries. */
  indexInObjStm?: number;
}

export interface XrefTable {
  /** Map of objectNumber → entry. Holes (deleted slots) are absent. */
  entries: Map<number, XrefEntry>;
  /** The trailer dictionary (with /Root, /Info, /Size, etc.). */
  trailer: Map<string, PdfObject>;
}

/**
 * Find the byte offset of the last xref table. A valid PDF ends with
 *   xref
 *   ...
 *   startxref
 *   <offset>
 *   %%EOF
 * We look back for `startxref` from the end of the file.
 *
 * Note on linearized PDFs (PDF spec Annex F): linearized files put a
 * special /Linearized dict + a first-page xref near the START of the
 * file for fast first-page web rendering. Reading from end-of-file
 * picks up the COMPLETE xref (the master at the end), which is what
 * we want — the linearization tables are skipped transparently.
 */
export function findStartxref(r: ByteReader): number {
  const idx = r.lastIndexOf('startxref');
  if (idx < 0) throw new Error('xref: startxref marker not found');
  let p = idx + 'startxref'.length;
  while (p < r.length && isWhitespace(r.bytes[p]!)) p++;
  const numStart = p;
  while (p < r.length && isDigit(r.bytes[p]!)) p++;
  return Number(r.asciiOf(numStart, p));
}

/**
 * Read the cross-reference table starting at the given offset. Supports
 * both forms: the classic `xref ... trailer` (PDF 1.0-1.4) and xref
 * streams (PDF 1.5+, used by pdf-lib / Acrobat by default).
 *
 * Follows the /Prev chain so older sections fill in objects this section
 * doesn't override.
 */
export async function readXref(r: ByteReader, startxref: number): Promise<XrefTable> {
  r.pos = startxref;
  // The classic form starts with the literal `xref` keyword. Anything
  // else (an object header like "11 0 obj") means a cross-reference
  // stream.
  if (r.consumeKeyword('xref')) {
    return await readClassicXref(r);
  }
  r.pos = startxref;
  return readXrefStream(r);
}

/**
 * Read a classic `xref ... trailer` table. The /Prev chain (which may
 * point at a *stream* xref in mixed/hybrid files) is followed via the
 * top-level `readXref` dispatcher so each section auto-detects its form.
 */
export async function readClassicXref(r: ByteReader, startxref?: number): Promise<XrefTable> {
  if (startxref !== undefined) {
    r.pos = startxref;
    if (!r.consumeKeyword('xref')) {
      throw new Error('readClassicXref: not a classic xref table at offset ' + startxref);
    }
  }

  const entries = new Map<number, XrefEntry>();
  while (true) {
    r.skipWhitespace();
    if (r.consumeKeyword('trailer')) break;
    const firstObj = readUInt(r);
    r.skipWhitespace();
    const count = readUInt(r);
    r.skipWhitespace();
    for (let i = 0; i < count; i++) {
      // Each entry is exactly 20 bytes: "nnnnnnnnnn ggggg n\r\n" or " f\r\n"
      const lineStart = r.pos;
      r.pos += 20;
      const offset = Number(r.asciiOf(lineStart, lineStart + 10));
      const gen = Number(r.asciiOf(lineStart + 11, lineStart + 16));
      const flag = String.fromCharCode(r.bytes[lineStart + 17]!);
      entries.set(firstObj + i, { offset, generation: gen, inUse: flag === 'n' });
    }
  }

  r.skipWhitespace();
  const trailerDict = parseObject(r);
  if (trailerDict.kind !== 'dict') throw new Error('xref: trailer is not a dict');

  // Hybrid-reference files (PDF spec §7.5.8.4): a classic xref trailer
  // can carry a /XRefStm pointing at a supplementary xref stream that
  // covers compressed objects (which the classic table can't represent).
  // Merge those entries in BEFORE following /Prev — the classic table
  // takes precedence for any objects it lists.
  const xrefStm = trailerDict.entries.get('XRefStm');
  if (xrefStm && xrefStm.kind === 'num') {
    try {
      const supplement = await readXref(new ByteReader(r.bytes), xrefStm.value);
      for (const [n, e] of supplement.entries) {
        if (!entries.has(n)) entries.set(n, e);
      }
    } catch (e) {
      // Hybrid streams are common but not load-blocking; warn + continue.
      // eslint-disable-next-line no-console
      console.warn('xref: /XRefStm supplement failed to read:', e);
    }
  }

  const prev = trailerDict.entries.get('Prev');
  if (prev && prev.kind === 'num') {
    // Dispatch — the prior xref might be a stream (PDF 1.5+), not a classic table.
    const older = await readXref(new ByteReader(r.bytes), prev.value);
    for (const [n, e] of older.entries) {
      if (!entries.has(n)) entries.set(n, e);
    }
  }
  return { entries, trailer: trailerDict.entries };
}

/**
 * Read a PDF 1.5+ cross-reference stream. The stream is an indirect
 * object whose dict has /Type /XRef, /W <byte widths>, /Index <starts +
 * counts>, /Size, and (optionally) /Prev. The stream body is one row of
 * (w1+w2+w3) bytes per entry.
 *
 * Row format:
 *   type=0  free entry             — w2 is next free object number
 *   type=1  in-use uncompressed    — w2 is byte offset, w3 is generation
 *   type=2  compressed in ObjStm   — w2 is ObjStm object number, w3 is index
 */
async function readXrefStream(r: ByteReader): Promise<XrefTable> {
  // Skip the indirect-object header: "n g obj"
  skipObjHeader(r);
  r.skipWhitespace();
  const obj = parseObject(r);
  if (obj.kind !== 'stream') throw new Error('readXrefStream: object is not a stream');
  const dict = obj.dict;

  const w = dict.get('W');
  if (!w || w.kind !== 'array' || w.items.length < 3) {
    throw new Error('readXrefStream: missing /W array');
  }
  const w0 = numAt(w.items[0]);
  const w1 = numAt(w.items[1]);
  const w2 = numAt(w.items[2]);
  const rowLen = w0 + w1 + w2;

  const size = numAt(dict.get('Size')) ?? 0;
  const indexEntry = dict.get('Index');
  let subsections: Array<[number, number]>;
  if (indexEntry && indexEntry.kind === 'array') {
    subsections = [];
    for (let i = 0; i + 1 < indexEntry.items.length; i += 2) {
      subsections.push([numAt(indexEntry.items[i])!, numAt(indexEntry.items[i + 1])!]);
    }
  } else {
    subsections = [[0, size]];
  }

  const decompressed = await inflate(obj.raw);
  // /Predictor + /Columns may live directly on the stream dict OR (more
  // commonly for PDF 1.5+ xref streams) inside /DecodeParms. Check both.
  const dp = dict.get('DecodeParms');
  const dpDict = dp && dp.kind === 'dict' ? dp.entries : null;
  const predictor =
    numAt(dpDict?.get('Predictor')) ||
    numAt(dict.get('Predictor')) ||
    1;
  const columns =
    numAt(dpDict?.get('Columns')) ||
    numAt(dict.get('Columns')) ||
    rowLen;
  const raw = predictor >= 10 ? unpredict(decompressed, columns, predictor) : decompressed;

  const entries = new Map<number, XrefEntry>();
  let off = 0;
  for (const [start, count] of subsections) {
    for (let i = 0; i < count; i++) {
      const type = w0 === 0 ? 1 : readUIntBE(raw, off, w0);
      const f1 = readUIntBE(raw, off + w0, w1);
      const f2 = readUIntBE(raw, off + w0 + w1, w2);
      off += rowLen;
      const objNum = start + i;
      if (type === 1) entries.set(objNum, { offset: f1, generation: f2, inUse: true });
      else if (type === 2)
        entries.set(objNum, {
          offset: f1, // ObjStm object number
          generation: 0,
          inUse: true,
          compressed: true,
          indexInObjStm: f2,
        });
      // type === 0: free, skip
    }
  }

  // Chain /Prev
  const prev = dict.get('Prev');
  if (prev && prev.kind === 'num') {
    const older = await readXref(new ByteReader(r.bytes), prev.value);
    for (const [n, e] of older.entries) {
      if (!entries.has(n)) entries.set(n, e);
    }
  }

  return { entries, trailer: dict };
}

function skipObjHeader(r: ByteReader): void {
  while (r.pos < r.length && isDigit(r.bytes[r.pos]!)) r.pos++;
  r.skipSpacesOnly();
  while (r.pos < r.length && isDigit(r.bytes[r.pos]!)) r.pos++;
  r.skipSpacesOnly();
  if (!r.consumeKeyword('obj')) throw new Error('readXrefStream: missing obj header');
}

function numAt(o: PdfObject | undefined): number {
  return o && o.kind === 'num' ? o.value : 0;
}

function readUIntBE(bytes: Uint8Array, offset: number, width: number): number {
  let v = 0;
  for (let i = 0; i < width; i++) v = (v << 8) | bytes[offset + i]!;
  return v;
}

/**
 * PNG predictor 12 (Up): each row's bytes were computed as
 * row[i] - prevRow[i]. Reverse it.
 * Each row in the stream has 1 prefix byte (filter tag) + columns data bytes.
 * We just need to handle filter tag 2 (Up) — that's what every PDF I've
 * seen uses. We tolerate tag 0 (None) too.
 */
function unpredict(data: Uint8Array, columns: number, _predictor: number): Uint8Array {
  const rowLen = columns + 1;
  const rows = Math.floor(data.length / rowLen);
  const out = new Uint8Array(rows * columns);
  const prev = new Uint8Array(columns);
  for (let r = 0; r < rows; r++) {
    const filterTag = data[r * rowLen]!;
    for (let c = 0; c < columns; c++) {
      const cur = data[r * rowLen + 1 + c]!;
      let val: number;
      if (filterTag === 2) val = (cur + prev[c]!) & 0xff; // Up
      else val = cur; // None / unsupported -> pass-through
      out[r * columns + c] = val;
      prev[c] = val;
    }
  }
  return out;
}

function readUInt(r: ByteReader): number {
  const start = r.pos;
  while (r.pos < r.length && isDigit(r.bytes[r.pos]!)) r.pos++;
  return Number(r.asciiOf(start, r.pos));
}
