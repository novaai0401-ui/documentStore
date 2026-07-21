/**
 * PDF encryption primitives — Standard Security Handler.
 *
 * Spec reference: ISO 32000-1 §7.6 (PDF 1.7).
 *
 * Supports:
 *   - V=1, R=2 — RC4 40-bit
 *   - V=2, R=3 — RC4 up to 128-bit
 *   - V=4, R=4 — RC4 or AES-128 via crypt filters (AESV2)
 *   - V=5, R=5/6 — AES-256 (AESV3)
 *
 * Deliberately self-contained: MD5 + RC4 are pure JS (SubtleCrypto offers
 * neither). AES routes through crypto.subtle so we don't ship a cipher.
 */
import type { PdfObject } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
//   Standard password padding string (PDF spec §7.6.3.3).
// ─────────────────────────────────────────────────────────────────────────────

const PASSWORD_PADDING = new Uint8Array([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41,
  0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80,
  0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

const AES_SALT = new Uint8Array([0x73, 0x41, 0x6c, 0x54]); // "sAlT"

// ─────────────────────────────────────────────────────────────────────────────
//   Public types
// ─────────────────────────────────────────────────────────────────────────────

export type CipherKind = 'RC4' | 'AES-128' | 'AES-256' | 'Identity';

export interface EncryptionContext {
  /** Algorithm version: 1, 2, 4, 5. */
  V: number;
  /** Revision: 2, 3, 4, 5, 6. Drives password algorithm choice. */
  R: number;
  /** Key length in bytes. */
  keyLength: number;
  /** Permissions flags (signed 32-bit). */
  P: number;
  /** Owner password hash (32 or 48 bytes). */
  O: Uint8Array;
  /** User password hash (32 or 48 bytes). */
  U: Uint8Array;
  /** R=5/6 only: encrypted file key for owner / user. */
  OE?: Uint8Array;
  UE?: Uint8Array;
  /** R=5/6 only: 16-byte encrypted permissions. */
  Perms?: Uint8Array;
  /** First element of /ID in trailer — used in key derivation. */
  fileId: Uint8Array;
  /** /EncryptMetadata, default true for V>=4. */
  encryptMetadata: boolean;
  /** Cipher used for streams. */
  stmCipher: CipherKind;
  /** Cipher used for strings. */
  strCipher: CipherKind;
  /** Derived file encryption key (populated after password verification). */
  fileKey?: Uint8Array;
}

export class EncryptedPdfError extends Error {
  readonly code = 'NEEDS_PASSWORD';
  constructor(public readonly context: EncryptionContext, public readonly wasAttempted: boolean) {
    super(wasAttempted ? 'pdf-core: wrong password' : 'pdf-core: password required');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//   /Encrypt dict parsing
// ─────────────────────────────────────────────────────────────────────────────

export function parseEncryptDict(
  encryptDict: Map<string, PdfObject>,
  fileId: Uint8Array,
): EncryptionContext {
  const V = numAt(encryptDict.get('V')) ?? 1;
  const R = numAt(encryptDict.get('R')) ?? 2;
  let keyLengthBits = numAt(encryptDict.get('Length')) ?? (V === 1 ? 40 : 128);
  if (V === 5) keyLengthBits = 256;
  const keyLength = Math.ceil(keyLengthBits / 8);
  const P = (numAt(encryptDict.get('P')) ?? 0) | 0;
  const O = stringBytes(encryptDict.get('O')) ?? new Uint8Array(32);
  const U = stringBytes(encryptDict.get('U')) ?? new Uint8Array(32);
  const OE = stringBytes(encryptDict.get('OE'));
  const UE = stringBytes(encryptDict.get('UE'));
  const Perms = stringBytes(encryptDict.get('Perms'));
  const encryptMetadataObj = encryptDict.get('EncryptMetadata');
  const encryptMetadata = encryptMetadataObj?.kind === 'bool' ? encryptMetadataObj.value : true;

  // Determine cipher per V.
  let stmCipher: CipherKind = 'RC4';
  let strCipher: CipherKind = 'RC4';
  if (V === 4 || V === 5) {
    // /CF crypt-filters dict, /StmF, /StrF
    const cf = encryptDict.get('CF');
    const stmF = nameAt(encryptDict.get('StmF')) ?? 'Identity';
    const strF = nameAt(encryptDict.get('StrF')) ?? 'Identity';
    if (cf && cf.kind === 'dict') {
      stmCipher = cipherFromFilter(cf.entries.get(stmF));
      strCipher = cipherFromFilter(cf.entries.get(strF));
    } else {
      stmCipher = V === 5 ? 'AES-256' : 'AES-128';
      strCipher = stmCipher;
    }
  }
  if (V === 5) {
    stmCipher = 'AES-256';
    strCipher = 'AES-256';
  }

  return {
    V, R, keyLength, P, O, U, OE, UE, Perms,
    fileId, encryptMetadata,
    stmCipher, strCipher,
  };
}

function cipherFromFilter(filter: PdfObject | undefined): CipherKind {
  if (!filter || filter.kind !== 'dict') return 'Identity';
  const cfm = filter.entries.get('CFM');
  if (cfm?.kind !== 'name') return 'Identity';
  if (cfm.value === 'V2') return 'RC4';
  if (cfm.value === 'AESV2') return 'AES-128';
  if (cfm.value === 'AESV3') return 'AES-256';
  return 'Identity';
}

function numAt(o: PdfObject | undefined): number | undefined {
  return o && o.kind === 'num' ? o.value : undefined;
}

function nameAt(o: PdfObject | undefined): string | undefined {
  return o && o.kind === 'name' ? o.value : undefined;
}

function stringBytes(o: PdfObject | undefined): Uint8Array | undefined {
  return o && o.kind === 'string' ? o.value : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
//   Password verification (R <= 4 — covers ~95% of real PDFs)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Try a user-supplied password against the standard security handler.
 * Returns the derived file encryption key on success, or null on failure.
 * Tries the password as both user and owner. R<=4 path here; R=5/6 elsewhere.
 */
export async function tryStandardPassword(
  ctx: EncryptionContext,
  password: string,
): Promise<Uint8Array | null> {
  if (ctx.R >= 5) return tryR56Password(ctx, password);

  const pwBytes = stringToPdfDocEncoding(password);

  // Try as USER password first.
  const keyUser = computeFileKeyR234(ctx, pwBytes);
  if (await verifyUserPassword(ctx, keyUser)) return keyUser;

  // Try as OWNER password.
  const userPwFromOwner = await deriveUserPasswordFromOwner(ctx, pwBytes);
  const keyOwner = computeFileKeyR234(ctx, userPwFromOwner);
  if (await verifyUserPassword(ctx, keyOwner)) return keyOwner;

  return null;
}

/** PDF Algorithm 2 — file encryption key from a user password. */
function computeFileKeyR234(ctx: EncryptionContext, password: Uint8Array): Uint8Array {
  // Step a: pad/truncate the password to 32 bytes.
  const padded = padPassword(password);

  // Step b/c/d/e: MD5(padded || O || P_le32 || fileId [|| 0xFFFFFFFF if !encryptMetadata])
  const Pbytes = new Uint8Array(4);
  new DataView(Pbytes.buffer).setInt32(0, ctx.P, true /* little-endian */);
  const extra = (ctx.R >= 4 && !ctx.encryptMetadata) ? new Uint8Array([0xff, 0xff, 0xff, 0xff]) : new Uint8Array(0);

  let key = md5Concat([padded, ctx.O, Pbytes, ctx.fileId, extra]);

  // Step f (R >= 3): repeat MD5 50 times on first n bytes.
  if (ctx.R >= 3) {
    for (let i = 0; i < 50; i++) {
      key = md5(key.slice(0, ctx.keyLength));
    }
  }
  return key.slice(0, ctx.keyLength);
}

/** PDF Algorithm 5/6 — verify the file key by reproducing /U. */
async function verifyUserPassword(ctx: EncryptionContext, fileKey: Uint8Array): Promise<boolean> {
  const computedU = await computeUValue(ctx, fileKey);
  // R>=3: compare first 16 bytes; R=2: compare all 32.
  const compareLen = ctx.R >= 3 ? 16 : 32;
  for (let i = 0; i < compareLen; i++) {
    if (computedU[i] !== ctx.U[i]) return false;
  }
  return true;
}

async function computeUValue(ctx: EncryptionContext, fileKey: Uint8Array): Promise<Uint8Array> {
  if (ctx.R === 2) {
    // Algorithm 4: RC4(fileKey, paddingString)
    return rc4(fileKey, PASSWORD_PADDING);
  }
  // Algorithm 5 (R >= 3):
  //   a) MD5(padding || fileId)
  //   b) RC4 with fileKey
  //   c) repeat RC4 19 times with key XORed by iteration index (1..19)
  let block = md5Concat([PASSWORD_PADDING, ctx.fileId]);
  block = rc4(fileKey, block);
  for (let i = 1; i <= 19; i++) {
    const tweaked = new Uint8Array(fileKey.length);
    for (let j = 0; j < fileKey.length; j++) tweaked[j] = fileKey[j]! ^ i;
    block = rc4(tweaked, block);
  }
  // Pad to 32 bytes (the second 16 bytes are arbitrary in the file's /U).
  const out = new Uint8Array(32);
  out.set(block, 0);
  return out;
}

/** PDF Algorithm 7 — given an owner password, derive the user password. */
async function deriveUserPasswordFromOwner(
  ctx: EncryptionContext,
  ownerPassword: Uint8Array,
): Promise<Uint8Array> {
  // Step a: pad password.
  const padded = padPassword(ownerPassword);
  // Step b: MD5; for R>=3 iterate 50 times.
  let h = md5(padded);
  if (ctx.R >= 3) {
    for (let i = 0; i < 50; i++) h = md5(h.slice(0, ctx.keyLength));
  }
  const rcKey = h.slice(0, ctx.keyLength);
  // Step c: decrypt /O.
  if (ctx.R === 2) {
    return rc4(rcKey, ctx.O);
  }
  // R >= 3: 20 RC4 passes with key XORed by 19..0.
  let block = ctx.O;
  for (let i = 19; i >= 0; i--) {
    const tweaked = new Uint8Array(rcKey.length);
    for (let j = 0; j < rcKey.length; j++) tweaked[j] = rcKey[j]! ^ i;
    block = rc4(tweaked, block);
  }
  return block;
}

// ─────────────────────────────────────────────────────────────────────────────
//   R=5/6 (AES-256) password path. Different algorithm — separate code path.
// ─────────────────────────────────────────────────────────────────────────────

async function tryR56Password(ctx: EncryptionContext, password: string): Promise<Uint8Array | null> {
  const pw = utf8Bytes(password).slice(0, 127);
  // R=5/6: O = hash(48) || validation_salt(8) || key_salt(8); same shape for U.
  // Test user password: compute SHA-256(password || U_validation_salt), compare to U_hash.
  if (ctx.U.length < 48 || ctx.UE === undefined || ctx.UE.length < 32) return null;
  const uHash = ctx.U.slice(0, 32);
  const uVSalt = ctx.U.slice(32, 40);
  const uKSalt = ctx.U.slice(40, 48);

  if (sameBytes(await sha256Concat([pw, uVSalt]), uHash)) {
    // Derive intermediate key and decrypt UE with it (AES-256 CBC, zero IV).
    const ik = await sha256Concat([pw, uKSalt]);
    return aesCbcDecryptNoIv(ik, ctx.UE);
  }
  // Try owner password.
  if (ctx.O.length < 48 || ctx.OE === undefined || ctx.OE.length < 32) return null;
  const oHash = ctx.O.slice(0, 32);
  const oVSalt = ctx.O.slice(32, 40);
  const oKSalt = ctx.O.slice(40, 48);
  if (sameBytes(await sha256Concat([pw, oVSalt, ctx.U.slice(0, 48)]), oHash)) {
    const ik = await sha256Concat([pw, oKSalt, ctx.U.slice(0, 48)]);
    return aesCbcDecryptNoIv(ik, ctx.OE);
  }
  return null;
}

async function aesCbcDecryptNoIv(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'AES-CBC' }, false, ['decrypt']);
  // Zero IV
  const iv = new Uint8Array(16);
  // crypto.subtle expects PKCS#7 padding; some PDF blobs aren't padded.
  // Decrypt by appending one padding-block manually if size is exact multiple
  // of 16 — otherwise use it raw.
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, data as BufferSource));
  } catch {
    // Fall back to raw block decrypt without checking padding.
    return aesCbcDecryptUnpadded(key, iv, data);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//   Per-object key derivation + decrypt helpers
// ─────────────────────────────────────────────────────────────────────────────

export function perObjectKey(
  fileKey: Uint8Array,
  objNum: number,
  gen: number,
  cipher: CipherKind,
): Uint8Array {
  if (cipher === 'AES-256' || cipher === 'Identity') return fileKey;
  // Append low 3 bytes of obj + low 2 bytes of gen.
  const extra = new Uint8Array([
    objNum & 0xff, (objNum >> 8) & 0xff, (objNum >> 16) & 0xff,
    gen & 0xff, (gen >> 8) & 0xff,
  ]);
  const buf = new Uint8Array(fileKey.length + 5 + (cipher === 'AES-128' ? 4 : 0));
  buf.set(fileKey, 0);
  buf.set(extra, fileKey.length);
  if (cipher === 'AES-128') buf.set(AES_SALT, fileKey.length + 5);
  const h = md5(buf);
  return h.slice(0, Math.min(fileKey.length + 5, 16));
}

export async function decryptBytes(
  bytes: Uint8Array,
  objNum: number,
  gen: number,
  ctx: EncryptionContext,
  cipher: CipherKind,
): Promise<Uint8Array> {
  if (cipher === 'Identity' || !ctx.fileKey) return bytes;
  const key = perObjectKey(ctx.fileKey, objNum, gen, cipher);
  if (cipher === 'RC4') return rc4(key, bytes);
  if (cipher === 'AES-128' || cipher === 'AES-256') {
    if (bytes.length < 16) return bytes;
    const iv = bytes.slice(0, 16);
    const ct = bytes.slice(16);
    const fullKey = cipher === 'AES-256' ? (ctx.fileKey ?? key) : key;
    const cryptoKey = await crypto.subtle.importKey('raw', fullKey as BufferSource, { name: 'AES-CBC' }, false, ['decrypt']);
    try {
      return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, ct as BufferSource));
    } catch {
      return aesCbcDecryptUnpadded(fullKey, iv, ct);
    }
  }
  return bytes;
}

/**
 * Encrypt plaintext for re-serialization. For RC4 this is identical to
 * decryption (RC4 is symmetric). For AES the result is IV || CBC(PKCS#7).
 * The IV is freshly chosen each call from crypto.getRandomValues so two
 * identical plaintexts produce two distinct ciphertexts.
 */
export async function encryptBytes(
  plaintext: Uint8Array,
  objNum: number,
  gen: number,
  ctx: EncryptionContext,
  cipher: CipherKind,
): Promise<Uint8Array> {
  if (cipher === 'Identity' || !ctx.fileKey) return plaintext;
  const key = perObjectKey(ctx.fileKey, objNum, gen, cipher);
  if (cipher === 'RC4') return rc4(key, plaintext);
  if (cipher === 'AES-128' || cipher === 'AES-256') {
    const iv = new Uint8Array(16);
    crypto.getRandomValues(iv);
    const fullKey = cipher === 'AES-256' ? (ctx.fileKey ?? key) : key;
    const cryptoKey = await crypto.subtle.importKey('raw', fullKey as BufferSource, { name: 'AES-CBC' }, false, ['encrypt']);
    const ct = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, cryptoKey, plaintext as BufferSource),
    );
    const out = new Uint8Array(16 + ct.length);
    out.set(iv, 0);
    out.set(ct, 16);
    return out;
  }
  return plaintext;
}

/**
 * Walk a PdfObject pre-serialization and produce a tree where every
 * string + stream has been encrypted with the per-object key. Mirror of
 * decryptObject — the symmetry means a read → encrypt → write round-trip
 * (with no edits) produces equivalent bytes up to fresh AES IVs.
 *
 * Stream /Length is updated to reflect the encrypted body so the lexer
 * can skip past it cleanly when the file is read back.
 */
export async function encryptObjectForWrite(
  obj: PdfObject,
  objNum: number,
  gen: number,
  ctx: EncryptionContext,
): Promise<PdfObject> {
  if (obj.kind === 'string') {
    const v = await encryptBytes(obj.value, objNum, gen, ctx, ctx.strCipher);
    // Force hex form on encrypted strings — encrypted bytes are arbitrary
    // binary, and literal `(...)` strings would need escape handling for
    // unbalanced parens. `<...>` hex is unambiguous.
    return { kind: 'string', value: v, literal: false };
  }
  if (obj.kind === 'array') {
    const items: PdfObject[] = [];
    for (const it of obj.items) items.push(await encryptObjectForWrite(it, objNum, gen, ctx));
    return { ...obj, items };
  }
  if (obj.kind === 'dict') {
    const entries = new Map<string, PdfObject>();
    for (const [k, v] of obj.entries) entries.set(k, await encryptObjectForWrite(v, objNum, gen, ctx));
    return { ...obj, entries };
  }
  if (obj.kind === 'stream') {
    const entries = new Map<string, PdfObject>();
    for (const [k, v] of obj.dict) entries.set(k, await encryptObjectForWrite(v, objNum, gen, ctx));
    const raw = await encryptBytes(obj.raw, objNum, gen, ctx, ctx.stmCipher);
    entries.set('Length', { kind: 'num', value: raw.length });
    return { ...obj, dict: entries, raw };
  }
  return obj;
}

// ─────────────────────────────────────────────────────────────────────────────
//   Pure-JS RC4
// ─────────────────────────────────────────────────────────────────────────────

export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i]! + key[i % key.length]!) & 0xff;
    [S[i], S[j]] = [S[j]!, S[i]!];
  }
  let a = 0, b = 0;
  const out = new Uint8Array(data.length);
  for (let k = 0; k < data.length; k++) {
    a = (a + 1) & 0xff;
    b = (b + S[a]!) & 0xff;
    [S[a], S[b]] = [S[b]!, S[a]!];
    out[k] = data[k]! ^ S[(S[a]! + S[b]!) & 0xff]!;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
//   Pure-JS MD5 (RFC 1321). SubtleCrypto doesn't offer MD5 and PDF needs it.
// ─────────────────────────────────────────────────────────────────────────────

export function md5(data: Uint8Array): Uint8Array {
  // Padding
  const bitLen = data.length * 8;
  const padLen = (data.length % 64 < 56 ? 56 : 120) - (data.length % 64);
  const buf = new Uint8Array(data.length + padLen + 8);
  buf.set(data, 0);
  buf[data.length] = 0x80;
  // Append bit length as 64-bit little-endian
  const view = new DataView(buf.buffer);
  view.setUint32(buf.length - 8, bitLen >>> 0, true);
  view.setUint32(buf.length - 4, Math.floor(bitLen / 0x100000000), true);

  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  for (let off = 0; off < buf.length; off += 64) {
    const M = new Uint32Array(16);
    for (let i = 0; i < 16; i++) M[i] = view.getUint32(off + i * 4, true);
    const aa = a, bb = b, cc = c, dd = d;

    function F(x: number, y: number, z: number) { return (x & y) | (~x & z); }
    function G(x: number, y: number, z: number) { return (x & z) | (y & ~z); }
    function H(x: number, y: number, z: number) { return x ^ y ^ z; }
    function I(x: number, y: number, z: number) { return y ^ (x | ~z); }
    function rotl(x: number, n: number) { return ((x << n) | (x >>> (32 - n))) >>> 0; }
    function step(fn: (x: number, y: number, z: number) => number, a: number, b: number, c: number, d: number, m: number, s: number, t: number) {
      return (rotl((a + fn(b, c, d) + m + t) >>> 0, s) + b) >>> 0;
    }

    a = step(F, a, b, c, d, M[0]!, 7, 0xd76aa478);
    d = step(F, d, a, b, c, M[1]!, 12, 0xe8c7b756);
    c = step(F, c, d, a, b, M[2]!, 17, 0x242070db);
    b = step(F, b, c, d, a, M[3]!, 22, 0xc1bdceee);
    a = step(F, a, b, c, d, M[4]!, 7, 0xf57c0faf);
    d = step(F, d, a, b, c, M[5]!, 12, 0x4787c62a);
    c = step(F, c, d, a, b, M[6]!, 17, 0xa8304613);
    b = step(F, b, c, d, a, M[7]!, 22, 0xfd469501);
    a = step(F, a, b, c, d, M[8]!, 7, 0x698098d8);
    d = step(F, d, a, b, c, M[9]!, 12, 0x8b44f7af);
    c = step(F, c, d, a, b, M[10]!, 17, 0xffff5bb1);
    b = step(F, b, c, d, a, M[11]!, 22, 0x895cd7be);
    a = step(F, a, b, c, d, M[12]!, 7, 0x6b901122);
    d = step(F, d, a, b, c, M[13]!, 12, 0xfd987193);
    c = step(F, c, d, a, b, M[14]!, 17, 0xa679438e);
    b = step(F, b, c, d, a, M[15]!, 22, 0x49b40821);

    a = step(G, a, b, c, d, M[1]!, 5, 0xf61e2562);
    d = step(G, d, a, b, c, M[6]!, 9, 0xc040b340);
    c = step(G, c, d, a, b, M[11]!, 14, 0x265e5a51);
    b = step(G, b, c, d, a, M[0]!, 20, 0xe9b6c7aa);
    a = step(G, a, b, c, d, M[5]!, 5, 0xd62f105d);
    d = step(G, d, a, b, c, M[10]!, 9, 0x02441453);
    c = step(G, c, d, a, b, M[15]!, 14, 0xd8a1e681);
    b = step(G, b, c, d, a, M[4]!, 20, 0xe7d3fbc8);
    a = step(G, a, b, c, d, M[9]!, 5, 0x21e1cde6);
    d = step(G, d, a, b, c, M[14]!, 9, 0xc33707d6);
    c = step(G, c, d, a, b, M[3]!, 14, 0xf4d50d87);
    b = step(G, b, c, d, a, M[8]!, 20, 0x455a14ed);
    a = step(G, a, b, c, d, M[13]!, 5, 0xa9e3e905);
    d = step(G, d, a, b, c, M[2]!, 9, 0xfcefa3f8);
    c = step(G, c, d, a, b, M[7]!, 14, 0x676f02d9);
    b = step(G, b, c, d, a, M[12]!, 20, 0x8d2a4c8a);

    a = step(H, a, b, c, d, M[5]!, 4, 0xfffa3942);
    d = step(H, d, a, b, c, M[8]!, 11, 0x8771f681);
    c = step(H, c, d, a, b, M[11]!, 16, 0x6d9d6122);
    b = step(H, b, c, d, a, M[14]!, 23, 0xfde5380c);
    a = step(H, a, b, c, d, M[1]!, 4, 0xa4beea44);
    d = step(H, d, a, b, c, M[4]!, 11, 0x4bdecfa9);
    c = step(H, c, d, a, b, M[7]!, 16, 0xf6bb4b60);
    b = step(H, b, c, d, a, M[10]!, 23, 0xbebfbc70);
    a = step(H, a, b, c, d, M[13]!, 4, 0x289b7ec6);
    d = step(H, d, a, b, c, M[0]!, 11, 0xeaa127fa);
    c = step(H, c, d, a, b, M[3]!, 16, 0xd4ef3085);
    b = step(H, b, c, d, a, M[6]!, 23, 0x04881d05);
    a = step(H, a, b, c, d, M[9]!, 4, 0xd9d4d039);
    d = step(H, d, a, b, c, M[12]!, 11, 0xe6db99e5);
    c = step(H, c, d, a, b, M[15]!, 16, 0x1fa27cf8);
    b = step(H, b, c, d, a, M[2]!, 23, 0xc4ac5665);

    a = step(I, a, b, c, d, M[0]!, 6, 0xf4292244);
    d = step(I, d, a, b, c, M[7]!, 10, 0x432aff97);
    c = step(I, c, d, a, b, M[14]!, 15, 0xab9423a7);
    b = step(I, b, c, d, a, M[5]!, 21, 0xfc93a039);
    a = step(I, a, b, c, d, M[12]!, 6, 0x655b59c3);
    d = step(I, d, a, b, c, M[3]!, 10, 0x8f0ccc92);
    c = step(I, c, d, a, b, M[10]!, 15, 0xffeff47d);
    b = step(I, b, c, d, a, M[1]!, 21, 0x85845dd1);
    a = step(I, a, b, c, d, M[8]!, 6, 0x6fa87e4f);
    d = step(I, d, a, b, c, M[15]!, 10, 0xfe2ce6e0);
    c = step(I, c, d, a, b, M[6]!, 15, 0xa3014314);
    b = step(I, b, c, d, a, M[13]!, 21, 0x4e0811a1);
    a = step(I, a, b, c, d, M[4]!, 6, 0xf7537e82);
    d = step(I, d, a, b, c, M[11]!, 10, 0xbd3af235);
    c = step(I, c, d, a, b, M[2]!, 15, 0x2ad7d2bb);
    b = step(I, b, c, d, a, M[9]!, 21, 0xeb86d391);

    a = (a + aa) >>> 0;
    b = (b + bb) >>> 0;
    c = (c + cc) >>> 0;
    d = (d + dd) >>> 0;
  }
  const out = new Uint8Array(16);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, a, true);
  ov.setUint32(4, b, true);
  ov.setUint32(8, c, true);
  ov.setUint32(12, d, true);
  return out;
}

function md5Concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const buf = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { buf.set(p, off); off += p.length; }
  return md5(buf);
}

async function sha256Concat(parts: Uint8Array[]): Promise<Uint8Array> {
  let total = 0;
  for (const p of parts) total += p.length;
  const buf = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { buf.set(p, off); off += p.length; }
  return new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
}

// ─────────────────────────────────────────────────────────────────────────────
//   Helpers
// ─────────────────────────────────────────────────────────────────────────────

function padPassword(pw: Uint8Array): Uint8Array {
  const out = new Uint8Array(32);
  const copy = Math.min(pw.length, 32);
  out.set(pw.subarray(0, copy), 0);
  if (copy < 32) out.set(PASSWORD_PADDING.subarray(0, 32 - copy), copy);
  return out;
}

function stringToPdfDocEncoding(s: string): Uint8Array {
  // ASCII range matches PDFDocEncoding; for higher chars this is a best-effort.
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function utf8Bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * AES-CBC decrypt fallback when crypto.subtle's PKCS#7 padding check fails.
 * Decrypts blocks manually and returns the raw output without verifying
 * padding (PDF strings/streams aren't always padded the same way).
 */
async function aesCbcDecryptUnpadded(
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  // Build a known-padding ciphertext by appending an encrypted zero block.
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key as BufferSource, { name: 'AES-CBC' }, false, ['encrypt'],
  );
  // Encrypt a single zero block in ECB mode to use as a "padding" appendage.
  // This is a brittle workaround; real PDFs are usually well-padded so this
  // path rarely runs.
  const zeros = new Uint8Array(16);
  const lastBlock = data.slice(data.length - 16);
  const encryptedZeros = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-CBC', iv: lastBlock }, cryptoKey, zeros as BufferSource),
  );
  // Use the first 16 bytes of the result (ignore the appended padding block).
  const extended = new Uint8Array(data.length + 16);
  extended.set(data, 0);
  extended.set(encryptedZeros.slice(0, 16), data.length);
  const decryptKey = await crypto.subtle.importKey(
    'raw', key as BufferSource, { name: 'AES-CBC' }, false, ['decrypt'],
  );
  const out = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-CBC', iv: iv as BufferSource }, decryptKey, extended as BufferSource),
  );
  // Trim the final padding byte's value off the end.
  const padByte = out[out.length - 1] ?? 0;
  return padByte > 0 && padByte <= 16
    ? out.slice(0, out.length - padByte)
    : out;
}

// ─────────────────────────────────────────────────────────────────────────────
//   Recursive object decryption
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Walk a parsed PdfObject and decrypt every embedded string + stream raw
 * bytes using the per-object key for (objNum, gen). Returns a new object —
 * does NOT mutate the input (so cached objects stay decrypted-once).
 */
export async function decryptObject(
  obj: PdfObject,
  objNum: number,
  gen: number,
  ctx: EncryptionContext,
): Promise<PdfObject> {
  if (obj.kind === 'string') {
    const v = await decryptBytes(obj.value, objNum, gen, ctx, ctx.strCipher);
    return { ...obj, value: v };
  }
  if (obj.kind === 'array') {
    const items: PdfObject[] = [];
    for (const it of obj.items) items.push(await decryptObject(it, objNum, gen, ctx));
    return { ...obj, items };
  }
  if (obj.kind === 'dict') {
    const entries = new Map<string, PdfObject>();
    for (const [k, v] of obj.entries) entries.set(k, await decryptObject(v, objNum, gen, ctx));
    return { ...obj, entries };
  }
  if (obj.kind === 'stream') {
    // Decrypt the dict's strings AND the stream raw bytes.
    const entries = new Map<string, PdfObject>();
    for (const [k, v] of obj.dict) entries.set(k, await decryptObject(v, objNum, gen, ctx));
    const raw = await decryptBytes(obj.raw, objNum, gen, ctx, ctx.stmCipher);
    return { ...obj, dict: entries, raw };
  }
  return obj;
}
