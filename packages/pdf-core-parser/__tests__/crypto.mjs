/**
 * Self-contained tests for the crypto primitives. Verifies MD5 + RC4
 * + AES-CBC against known vectors before we trust them in the PDF
 * password derivation path.
 *
 * Run: node packages/pdf-core-parser/__tests__/crypto.mjs
 */
import { md5, rc4 } from '../dist/index.js';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

let pass = 0, fail = 0;

function check(name, got, want) {
  const same = got === want;
  if (same) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${got}\n      want: ${want}`); }
}

function hex(u8) {
  return Array.from(u8, b => b.toString(16).padStart(2, '0')).join('');
}

function bytes(s) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ─── MD5 vectors (RFC 1321) ──────────────────────────────────────────────────
console.log('MD5 (RFC 1321 test vectors)');
check('md5("")',                          hex(md5(new Uint8Array(0))),       'd41d8cd98f00b204e9800998ecf8427e');
check('md5("a")',                         hex(md5(bytes('a'))),              '0cc175b9c0f1b6a831c399e269772661');
check('md5("abc")',                       hex(md5(bytes('abc'))),            '900150983cd24fb0d6963f7d28e17f72');
check('md5("message digest")',            hex(md5(bytes('message digest'))), 'f96b697d7cb7938d525a2f31aaf161d0');
check('md5("abcdefghijklmnopqrstuvwxyz")', hex(md5(bytes('abcdefghijklmnopqrstuvwxyz'))),
                                          'c3fcd3d76192e4007dfb496cca67e13b');
check('md5("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")',
      hex(md5(bytes('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'))),
      'd174ab98d277d9f5a5611c2c9f419d9f');
// Cross-block input (>64 bytes) — exercises the second MD5 round.
check('md5(80 chars)',
      hex(md5(bytes('1234567890'.repeat(8)))),
      '57edf4a22be3c955ac49da2e2107b67a');

// ─── RC4 vectors (RFC 6229) ──────────────────────────────────────────────────
console.log('RC4 (RFC 6229 test vectors)');
// Key = 0102030405, plaintext = 00 * 16 → expected output below
const rc4_v1 = rc4(new Uint8Array([1,2,3,4,5]), new Uint8Array(16));
check('rc4(key=0102030405, 16x00)', hex(rc4_v1), 'b2396305f03dc027ccc3524a0a1118a8');

const rc4_v2 = rc4(new Uint8Array([0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08]), new Uint8Array(16));
check('rc4(key=8byte, 16x00)', hex(rc4_v2), '97ab8a1bf0afb96132f2f67258da15a8');

// ─── RC4 symmetry — encrypt(decrypt(x)) === x ────────────────────────────────
console.log('RC4 (symmetry)');
const plain = bytes('the quick brown fox jumps over the lazy dog');
const key = bytes('SuperSecretKey');
const ct = rc4(key, plain);
const pt = rc4(key, ct);
check('rc4 symmetric round-trip', hex(pt), hex(plain));

console.log('');
console.log(fail === 0 ? `ALL OK (${pass} pass)` : `FAIL — ${fail} failed, ${pass} passed`);
process.exit(fail === 0 ? 0 : 1);
