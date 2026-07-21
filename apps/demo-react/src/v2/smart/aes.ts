/**
 * AES (FIPS-197) block cipher — ours, from scratch. We need this because the
 * Web Crypto API only offers AES-CBC *with* PKCS7 padding, while ECMA-376 Office
 * encryption uses AES-CBC with **no padding** (zero-padded, block-aligned). The
 * S-box and round constants are generated at load (no giant literals), and the
 * implementation is checked against the FIPS-197 known-answer vectors in tests.
 *
 * Supports 128/192/256-bit keys; exposes single-block encrypt/decrypt and
 * CBC-mode decrypt with no padding (what we use to unlock .docx/.xlsx/.pptx).
 */

const SBOX = new Uint8Array(256);
const INV_SBOX = new Uint8Array(256);
(function initSbox() {
  let p = 1;
  let q = 1;
  do {
    p = (p ^ (p << 1) ^ (p & 0x80 ? 0x11b : 0)) & 0xff;
    q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff;
    if (q & 0x80) q ^= 0x09;
    const x = (q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4))) & 0xff;
    SBOX[p] = x ^ 0x63;
  } while (p !== 1);
  SBOX[0] = 0x63;
  for (let i = 0; i < 256; i++) INV_SBOX[SBOX[i]!] = i;
})();

function xtime(a: number): number { return ((a << 1) ^ (a & 0x80 ? 0x11b : 0)) & 0xff; }
function mul(a: number, b: number): number {
  let r = 0;
  for (let i = 0; i < 8 && b; i++) { if (b & 1) r ^= a; a = xtime(a); b >>= 1; }
  return r & 0xff;
}

const RCON = (() => { const r = new Uint8Array(15); let c = 1; for (let i = 1; i < 15; i++) { r[i] = c; c = xtime(c); } return r; })();

export class Aes {
  private readonly rounds: number;
  private readonly rk: Uint8Array; // expanded round keys, (rounds+1)*16 bytes

  constructor(key: Uint8Array) {
    const Nk = key.length / 4;
    if (Nk !== 4 && Nk !== 6 && Nk !== 8) throw new Error('AES key must be 16/24/32 bytes');
    this.rounds = Nk + 6;
    const Nb = 4;
    const total = Nb * (this.rounds + 1);
    const w = new Uint8Array(total * 4);
    w.set(key);
    for (let i = Nk; i < total; i++) {
      let t = [w[(i - 1) * 4]!, w[(i - 1) * 4 + 1]!, w[(i - 1) * 4 + 2]!, w[(i - 1) * 4 + 3]!];
      if (i % Nk === 0) {
        t = [SBOX[t[1]!]! ^ RCON[i / Nk]!, SBOX[t[2]!]!, SBOX[t[3]!]!, SBOX[t[0]!]!];
      } else if (Nk > 6 && i % Nk === 4) {
        t = [SBOX[t[0]!]!, SBOX[t[1]!]!, SBOX[t[2]!]!, SBOX[t[3]!]!];
      }
      for (let j = 0; j < 4; j++) w[i * 4 + j] = w[(i - Nk) * 4 + j]! ^ t[j]!;
    }
    this.rk = w;
  }

  decryptBlock(input: Uint8Array, out: Uint8Array, outOff = 0): void {
    const s = new Uint8Array(16);
    s.set(input.subarray(0, 16));
    const rk = this.rk;
    const addRoundKey = (round: number) => { for (let i = 0; i < 16; i++) s[i] ^= rk[round * 16 + i]!; };

    addRoundKey(this.rounds);
    for (let round = this.rounds - 1; round >= 1; round--) {
      invShiftRows(s); invSubBytes(s); addRoundKey(round); invMixColumns(s);
    }
    invShiftRows(s); invSubBytes(s); addRoundKey(0);
    out.set(s, outOff);
  }

  encryptBlock(input: Uint8Array, out: Uint8Array, outOff = 0): void {
    const s = new Uint8Array(16);
    s.set(input.subarray(0, 16));
    const rk = this.rk;
    const addRoundKey = (round: number) => { for (let i = 0; i < 16; i++) s[i] ^= rk[round * 16 + i]!; };

    addRoundKey(0);
    for (let round = 1; round < this.rounds; round++) {
      subBytes(s); shiftRows(s); mixColumns(s); addRoundKey(round);
    }
    subBytes(s); shiftRows(s); addRoundKey(this.rounds);
    out.set(s, outOff);
  }
}

function subBytes(s: Uint8Array) { for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]!]!; }
function invSubBytes(s: Uint8Array) { for (let i = 0; i < 16; i++) s[i] = INV_SBOX[s[i]!]!; }

// State is column-major (s[col*4 + row]); ShiftRows rotates each row left by row.
function shiftRows(s: Uint8Array) {
  const t = s.slice();
  for (let r = 1; r < 4; r++) for (let c = 0; c < 4; c++) s[c * 4 + r] = t[((c + r) % 4) * 4 + r]!;
}
function invShiftRows(s: Uint8Array) {
  const t = s.slice();
  for (let r = 1; r < 4; r++) for (let c = 0; c < 4; c++) s[c * 4 + r] = t[((c - r + 4) % 4) * 4 + r]!;
}
function mixColumns(s: Uint8Array) {
  for (let c = 0; c < 4; c++) {
    const a0 = s[c * 4]!, a1 = s[c * 4 + 1]!, a2 = s[c * 4 + 2]!, a3 = s[c * 4 + 3]!;
    s[c * 4] = mul(a0, 2) ^ mul(a1, 3) ^ a2 ^ a3;
    s[c * 4 + 1] = a0 ^ mul(a1, 2) ^ mul(a2, 3) ^ a3;
    s[c * 4 + 2] = a0 ^ a1 ^ mul(a2, 2) ^ mul(a3, 3);
    s[c * 4 + 3] = mul(a0, 3) ^ a1 ^ a2 ^ mul(a3, 2);
  }
}
function invMixColumns(s: Uint8Array) {
  for (let c = 0; c < 4; c++) {
    const a0 = s[c * 4]!, a1 = s[c * 4 + 1]!, a2 = s[c * 4 + 2]!, a3 = s[c * 4 + 3]!;
    s[c * 4] = mul(a0, 14) ^ mul(a1, 11) ^ mul(a2, 13) ^ mul(a3, 9);
    s[c * 4 + 1] = mul(a0, 9) ^ mul(a1, 14) ^ mul(a2, 11) ^ mul(a3, 13);
    s[c * 4 + 2] = mul(a0, 13) ^ mul(a1, 9) ^ mul(a2, 14) ^ mul(a3, 11);
    s[c * 4 + 3] = mul(a0, 11) ^ mul(a1, 13) ^ mul(a2, 9) ^ mul(a3, 14);
  }
}

/** AES-CBC decrypt with NO padding (length must be a multiple of 16). */
export function cbcDecryptNoPad(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  const aes = new Aes(key);
  const out = new Uint8Array(data.length);
  let prev = iv.subarray(0, 16);
  const block = new Uint8Array(16);
  for (let off = 0; off < data.length; off += 16) {
    aes.decryptBlock(data.subarray(off, off + 16), block, 0);
    for (let i = 0; i < 16; i++) out[off + i] = block[i]! ^ prev[i]!;
    prev = data.subarray(off, off + 16);
  }
  return out;
}

/** AES-CBC encrypt with NO padding (length must be a multiple of 16). Used by
 *  tests (round-trip) and never in the open path. */
export function cbcEncryptNoPad(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  const aes = new Aes(key);
  const out = new Uint8Array(data.length);
  const prev = new Uint8Array(16);
  prev.set(iv.subarray(0, 16));
  const block = new Uint8Array(16);
  for (let off = 0; off < data.length; off += 16) {
    for (let i = 0; i < 16; i++) block[i] = data[off + i]! ^ prev[i]!;
    aes.encryptBlock(block, prev, 0);
    out.set(prev, off);
  }
  return out;
}
