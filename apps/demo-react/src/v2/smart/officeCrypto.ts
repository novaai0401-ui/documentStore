/**
 * Decrypt password-protected OOXML (.docx/.xlsx/.pptx) — ECMA-376 **agile
 * encryption** (Office 2010+), implemented ourselves. The container is CFB
 * (see cfb.ts); the cipher is AES-CBC with no padding (see aes.ts); the key
 * derivation hashing uses Web Crypto's `digest` (available in browser and Node,
 * and padding-free so it's fine to use). Returns the decrypted inner zip, which
 * the normal docx/xlsx/pptx path then reads.
 *
 * Covers agile (the common modern case). Legacy "standard"/RC4 CryptoAPI
 * encryption (Office 97–2007) is detected and reported, not silently mishandled.
 */
import { readCfbStreams, isCfb } from './cfb.js';
import { cbcDecryptNoPad } from './aes.js';

export { isCfb };

// MS-OFFCRYPTO 2.3.4.13 block keys.
const BLOCK_KEY = {
  verifierInput: new Uint8Array([0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4f, 0x23, 0x4f, 0xb6, 0x5e, 0x6e, 0xd9, 0x1d, 0xa4, 0x33, 0x53]),
  verifierValue: new Uint8Array([0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e, 0xa0, 0x9d, 0x6f, 0xb0, 0x42, 0x28, 0xf6, 0xdb]),
  keyValue: new Uint8Array([0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6, 0xea, 0x63, 0x29, 0x54, 0xf9, 0x4e, 0xb9, 0x6e]),
};

function b64(s: string): Uint8Array {
  const bin = atob(s.trim());
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
function utf16le(s: string): Uint8Array {
  const u = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); u[i * 2] = c & 0xff; u[i * 2 + 1] = c >> 8; }
  return u;
}
function le32(n: number): Uint8Array { const u = new Uint8Array(4); new DataView(u.buffer).setUint32(0, n, true); return u; }

function subtleName(alg: string): string {
  const a = alg.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (a.includes('512')) return 'SHA-512';
  if (a.includes('384')) return 'SHA-384';
  if (a.includes('256')) return 'SHA-256';
  return 'SHA-1';
}
async function hash(alg: string, ...parts: Uint8Array[]): Promise<Uint8Array> {
  const buf = concat(...parts);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const d = await crypto.subtle.digest(subtleName(alg), ab);
  return new Uint8Array(d);
}

/** Fit a hash output to the required key length (truncate, or pad with 0x36). */
function fitKey(h: Uint8Array, keyBytes: number): Uint8Array {
  const k = new Uint8Array(keyBytes);
  for (let i = 0; i < keyBytes; i++) k[i] = i < h.length ? h[i]! : 0x36;
  return k;
}

/** Agile password → key for a given block key (MS-OFFCRYPTO 2.3.4.11). */
export async function deriveAgileKey(password: string, salt: Uint8Array, spinCount: number, alg: string, blockKey: Uint8Array, keyBits: number): Promise<Uint8Array> {
  let h = await hash(alg, salt, utf16le(password));
  for (let i = 0; i < spinCount; i++) h = await hash(alg, le32(i), h);
  const final = await hash(alg, h, blockKey);
  return fitKey(final, keyBits / 8);
}

interface AgileParams {
  // keyData (used to decrypt the package)
  pkgSalt: Uint8Array; pkgHash: string; pkgKeyBits: number; pkgBlock: number;
  // encryptedKey (password verifier + wrapped key)
  ekSalt: Uint8Array; ekHash: string; ekKeyBits: number; ekSpin: number;
  encVerifierHashInput: Uint8Array; encVerifierHashValue: Uint8Array; encKeyValue: Uint8Array;
}

function el(xml: string, local: string): string {
  const m = new RegExp(`<(?:\\w+:)?${local}\\b([^>]*)>`).exec(xml);
  if (!m) throw new Error(`EncryptionInfo missing <${local}>`);
  return m[1]!;
}
function at(attrs: string, name: string): string {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
  if (!m) throw new Error(`EncryptionInfo missing @${name}`);
  return m[1]!;
}

function parseAgile(xml: string): AgileParams {
  const kd = el(xml, 'keyData');
  const ek = el(xml, 'encryptedKey');
  return {
    pkgSalt: b64(at(kd, 'saltValue')), pkgHash: at(kd, 'hashAlgorithm'), pkgKeyBits: Number(at(kd, 'keyBits')), pkgBlock: Number(at(kd, 'blockSize')),
    ekSalt: b64(at(ek, 'saltValue')), ekHash: at(ek, 'hashAlgorithm'), ekKeyBits: Number(at(ek, 'keyBits')), ekSpin: Number(at(ek, 'spinCount')),
    encVerifierHashInput: b64(at(ek, 'encryptedVerifierHashInput')),
    encVerifierHashValue: b64(at(ek, 'encryptedVerifierHashValue')),
    encKeyValue: b64(at(ek, 'encryptedKeyValue')),
  };
}

/** Decrypt the `EncryptedPackage` stream (4096-byte segments, per-segment IV =
 *  hash(salt + LE32(index))). Exported for round-trip testing. */
export async function decryptAgilePackage(secretKey: Uint8Array, pkgSalt: Uint8Array, pkgHash: string, blockSize: number, encrypted: Uint8Array, totalSize: number): Promise<Uint8Array> {
  const SEG = 4096;
  const out = new Uint8Array(encrypted.length);
  for (let i = 0, off = 0; off < encrypted.length; i++, off += SEG) {
    const iv = (await hash(pkgHash, pkgSalt, le32(i))).subarray(0, blockSize);
    const chunk = encrypted.subarray(off, Math.min(off + SEG, encrypted.length));
    out.set(cbcDecryptNoPad(secretKey, iv, chunk), off);
  }
  return out.subarray(0, totalSize);
}

/** Decrypt an agile-encrypted OOXML file. Throws on wrong password or an
 *  unsupported (legacy) encryption scheme. */
export async function decryptAgile(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const streams = readCfbStreams(bytes);
  const info = streams.get('EncryptionInfo');
  const pkg = streams.get('EncryptedPackage');
  if (!info || !pkg) throw new Error('Not an encrypted Office file');
  const major = new DataView(info.buffer, info.byteOffset, 4).getUint16(0, true);
  if (major !== 4) throw new Error('This file uses legacy (non-agile) Office encryption, which isn’t supported yet');
  const xml = new TextDecoder().decode(info.subarray(8));
  const p = parseAgile(xml);

  // Verify the password: decrypt the verifier input, hash it, compare to value.
  const viKey = await deriveAgileKey(password, p.ekSalt, p.ekSpin, p.ekHash, BLOCK_KEY.verifierInput, p.ekKeyBits);
  const verifierInput = cbcDecryptNoPad(viKey, p.ekSalt, p.encVerifierHashInput);
  const vvKey = await deriveAgileKey(password, p.ekSalt, p.ekSpin, p.ekHash, BLOCK_KEY.verifierValue, p.ekKeyBits);
  const verifierValue = cbcDecryptNoPad(vvKey, p.ekSalt, p.encVerifierHashValue);
  const expected = await hash(p.ekHash, verifierInput);
  const ok = expected.length <= verifierValue.length && expected.every((b, i) => b === verifierValue[i]);
  if (!ok) throw new Error('Incorrect password');

  // Unwrap the package key, then decrypt the package.
  const kvKey = await deriveAgileKey(password, p.ekSalt, p.ekSpin, p.ekHash, BLOCK_KEY.keyValue, p.ekKeyBits);
  const secretKey = cbcDecryptNoPad(kvKey, p.ekSalt, p.encKeyValue).subarray(0, p.pkgKeyBits / 8);
  const totalSize = Number(new DataView(pkg.buffer, pkg.byteOffset, 8).getBigUint64(0, true));
  return decryptAgilePackage(secretKey, p.pkgSalt, p.pkgHash, p.pkgBlock, pkg.subarray(8), totalSize);
}

/** If `bytes` is an encrypted Office (CFB) file, decrypt it with `password`
 *  (required); otherwise return it unchanged so the normal zip path handles it. */
export async function decryptOfficeIfNeeded(bytes: Uint8Array, password?: string): Promise<Uint8Array> {
  if (!isCfb(bytes)) return bytes;
  if (!password) throw new Error('PASSWORD_REQUIRED');
  return decryptAgile(bytes, password);
}
