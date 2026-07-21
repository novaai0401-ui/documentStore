import { ByteReader, isDigit, isWhitespace } from './reader.js';
import { parseObject } from './parser.js';
import { findStartxref, readXref, type XrefEntry, type XrefTable } from './xref.js';
import { decodeStream } from './streams.js';
import type { PdfObject } from './types.js';
import {
  parseEncryptDict,
  tryStandardPassword,
  decryptObject,
  EncryptedPdfError,
  type EncryptionContext,
} from './crypto.js';

export interface LoadOptions {
  /** Password for encrypted PDFs. Try user password first, then owner. */
  password?: string;
}

/**
 * A loaded PDF document. The constructor only reads the xref + trailer —
 * individual objects are parsed lazily through `resolve()`. That keeps
 * memory bounded for large files.
 *
 * Encrypted PDFs are supported transparently: load() parses /Encrypt and
 * derives the file key from the supplied password; resolve() then
 * decrypts every parsed object before caching it. From the caller's
 * point of view, an encrypted PDF behaves exactly like an unencrypted
 * one once authenticated.
 */
export class PdfDocument {
  private readonly reader: ByteReader;
  readonly xref: XrefTable;
  /** Populated when the source file is encrypted and authentication succeeded. */
  readonly encryption?: EncryptionContext;
  private cache = new Map<number, PdfObject>();

  private constructor(bytes: Uint8Array, xref: XrefTable, encryption?: EncryptionContext) {
    this.reader = new ByteReader(bytes);
    this.xref = xref;
    this.encryption = encryption;
  }

  static async load(bytes: Uint8Array, opts: LoadOptions = {}): Promise<PdfDocument> {
    // Magic-byte gate: PDF files begin with "%PDF-<version>". Reject
    // anything else loudly so callers see a clean error instead of a
    // cryptic xref / parser blow-up downstream.
    //
    // We allow up to 1024 bytes of leading garbage (some PDFs ship with
    // a UTF-8 BOM, mail-header preamble, or HTTP chunk fragments) —
    // Adobe and Acrobat both tolerate this.
    if (!hasPdfMagic(bytes)) {
      throw new InvalidPdfError(
        bytes.length < 5
          ? 'pdf-core: input is too short to be a PDF'
          : 'pdf-core: input is not a PDF (no %PDF- header found in first 1KB)',
      );
    }

    const reader = new ByteReader(bytes);
    const startxref = findStartxref(reader);
    const xref = await readXref(new ByteReader(bytes), startxref);

    const encryptObj = xref.trailer.get('Encrypt');
    if (!encryptObj) {
      return new PdfDocument(bytes, xref);
    }

    // Resolve /Encrypt if it's an indirect ref (common). The dict itself
    // lives in plaintext — encryption applies to the rest of the file.
    let encryptDict: Map<string, PdfObject>;
    if (encryptObj.kind === 'ref') {
      const tempDoc = new PdfDocument(bytes, xref);
      const o = await tempDoc.resolveRaw(encryptObj);
      if (o.kind !== 'dict') throw new Error('pdf-core: /Encrypt is not a dictionary');
      encryptDict = o.entries;
    } else if (encryptObj.kind === 'dict') {
      encryptDict = encryptObj.entries;
    } else {
      throw new Error('pdf-core: /Encrypt is not a dictionary');
    }

    // /ID — first element is required for key derivation.
    const idObj = xref.trailer.get('ID');
    let fileId: Uint8Array = new Uint8Array(0);
    if (idObj && idObj.kind === 'array' && idObj.items.length > 0) {
      const first = idObj.items[0]!;
      if (first.kind === 'string') fileId = new Uint8Array(first.value);
    }
    if (fileId.length === 0) {
      // Some malformed PDFs omit /ID; fall back to empty bytes (matches
      // Acrobat's lenient behavior).
      fileId = new Uint8Array(0);
    }

    const ctx = parseEncryptDict(encryptDict, fileId);

    // Empty password is a valid attempt — try it before raising.
    const password = opts.password ?? '';
    const key = await tryStandardPassword(ctx, password);
    if (!key) {
      throw new EncryptedPdfError(ctx, opts.password !== undefined);
    }
    ctx.fileKey = key;

    return new PdfDocument(bytes, xref, ctx);
  }

  /** Return the raw bytes of the source file. */
  get sourceBytes(): Uint8Array {
    return this.reader.bytes;
  }

  /** Trailer entry shortcut. */
  get root(): PdfObject | undefined {
    return this.xref.trailer.get('Root');
  }

  /** Resolve an indirect-ref, applying decryption when the file is encrypted. */
  async resolve(ref: PdfObject): Promise<PdfObject> {
    if (ref.kind !== 'ref') return ref;
    const cached = this.cache.get(ref.objectNumber);
    if (cached) return cached;

    const raw = await this.resolveRaw(ref);
    const obj = this.encryption
      ? await decryptObject(raw, ref.objectNumber, ref.generation, this.encryption)
      : raw;
    this.cache.set(ref.objectNumber, obj);
    return obj;
  }

  /**
   * Same as resolve() but skips decryption. Used during load() to read the
   * /Encrypt dict itself (which is always stored unencrypted), and for the
   * containing ObjStm of compressed objects (the inner objects are NOT
   * re-encrypted; only the containing stream is).
   */
  private async resolveRaw(ref: PdfObject): Promise<PdfObject> {
    if (ref.kind !== 'ref') return ref;
    const entry = this.xref.entries.get(ref.objectNumber);
    if (!entry || !entry.inUse) return { kind: 'null' };
    if (entry.compressed) return this.resolveCompressed(entry);
    return this.resolveUncompressed(entry, ref.objectNumber);
  }

  private resolveUncompressed(entry: XrefEntry, objNum: number): PdfObject {
    const r = new ByteReader(this.reader.bytes, entry.offset);
    skipUInt(r);
    r.skipSpacesOnly();
    skipUInt(r);
    r.skipSpacesOnly();
    if (!r.consumeKeyword('obj')) {
      throw new Error(`resolve: missing 'obj' keyword for ${objNum}`);
    }
    r.skipWhitespace();
    return parseObject(r);
  }

  /**
   * Pull a single object out of an Object Stream. The ObjStm dict has
   * /N (object count) and /First (byte offset to the first object's
   * content); its decoded body begins with N pairs of "objNum offset"
   * followed by the concatenated object bodies.
   *
   * When the file is encrypted, the containing ObjStm is decrypted by
   * the outer resolve() before reaching here — so by the time we call
   * decodeStream, .raw is already plaintext. The inner objects extracted
   * from the decoded body are NOT re-encrypted (per spec).
   */
  private async resolveCompressed(entry: XrefEntry): Promise<PdfObject> {
    const objStm = await this.resolve({ kind: 'ref', objectNumber: entry.offset, generation: 0 });
    if (objStm.kind !== 'stream') {
      throw new Error('resolveCompressed: containing object is not a stream');
    }
    const n = numEntry(objStm.dict, 'N');
    const first = numEntry(objStm.dict, 'First');
    const data = await decodeStream(objStm);

    const headerReader = new ByteReader(data, 0);
    const offsets: number[] = [];
    for (let i = 0; i < n; i++) {
      headerReader.skipWhitespace();
      readUIntFrom(headerReader);
      headerReader.skipSpacesOnly();
      offsets.push(readUIntFrom(headerReader));
    }

    const objStart = first + offsets[entry.indexInObjStm ?? 0]!;
    const bodyReader = new ByteReader(data, objStart);
    return parseObject(bodyReader);
  }

  /** Dereference once and assert the result is a dict (or stream-dict). */
  async resolveDict(ref: PdfObject): Promise<Map<string, PdfObject>> {
    const o = await this.resolve(ref);
    if (o.kind === 'dict') return o.entries;
    if (o.kind === 'stream') return o.dict;
    throw new Error(`resolveDict: expected dict, got ${o.kind}`);
  }
}

/**
 * True when `bytes` looks like a PDF — `%PDF-` (0x25 0x50 0x44 0x46 0x2d)
 * appears within the first 1024 bytes. PDF spec §7.5.2 requires the
 * header on the first line, but real-world files sometimes ship with a
 * UTF-8 BOM or short preamble that consumers tolerate. We do the same.
 */
function hasPdfMagic(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length - 4, 1024);
  for (let i = 0; i <= limit; i++) {
    if (
      bytes[i] === 0x25 && bytes[i + 1] === 0x50 &&
      bytes[i + 2] === 0x44 && bytes[i + 3] === 0x46 &&
      bytes[i + 4] === 0x2d
    ) return true;
  }
  return false;
}

/** Thrown when the input bytes don't carry a PDF magic header. */
export class InvalidPdfError extends Error {
  readonly code = 'INVALID_PDF';
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPdfError';
  }
}

function numEntry(dict: Map<string, PdfObject>, key: string): number {
  const o = dict.get(key);
  return o && o.kind === 'num' ? o.value : 0;
}

function readUIntFrom(r: ByteReader): number {
  const start = r.pos;
  while (r.pos < r.length && isDigit(r.bytes[r.pos]!)) r.pos++;
  return Number(r.asciiOf(start, r.pos));
}

function skipUInt(r: ByteReader): void {
  while (r.pos < r.length && isDigit(r.bytes[r.pos]!)) r.pos++;
}
void isWhitespace;

export { EncryptedPdfError } from './crypto.js';
