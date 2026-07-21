import { describe, it, expect } from 'vitest';
import { webcrypto } from 'node:crypto';
import { md5, rc4 } from '../dist/index.js';

// SubtleCrypto isn't globally available in older Node — patch in if needed.
if (!globalThis.crypto) (globalThis as { crypto: Crypto }).crypto = webcrypto as unknown as Crypto;

const enc = (s: string) => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};
const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('');

describe('MD5 (RFC 1321 vectors)', () => {
  it('hashes the empty string', () => {
    expect(hex(md5(new Uint8Array(0)))).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });
  it('hashes "a"', () => {
    expect(hex(md5(enc('a')))).toBe('0cc175b9c0f1b6a831c399e269772661');
  });
  it('hashes "abc"', () => {
    expect(hex(md5(enc('abc')))).toBe('900150983cd24fb0d6963f7d28e17f72');
  });
  it('hashes "message digest"', () => {
    expect(hex(md5(enc('message digest')))).toBe('f96b697d7cb7938d525a2f31aaf161d0');
  });
  it('hashes the lowercase alphabet', () => {
    expect(hex(md5(enc('abcdefghijklmnopqrstuvwxyz')))).toBe('c3fcd3d76192e4007dfb496cca67e13b');
  });
  it('handles cross-block input', () => {
    // 80 chars — exercises the second MD5 round.
    expect(hex(md5(enc('1234567890'.repeat(8))))).toBe('57edf4a22be3c955ac49da2e2107b67a');
  });
});

describe('RC4 (RFC 6229 vectors)', () => {
  it('encrypts 16 zero bytes with 5-byte key', () => {
    const out = rc4(new Uint8Array([1, 2, 3, 4, 5]), new Uint8Array(16));
    expect(hex(out)).toBe('b2396305f03dc027ccc3524a0a1118a8');
  });
  it('encrypts 16 zero bytes with 8-byte key', () => {
    const out = rc4(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), new Uint8Array(16));
    expect(hex(out)).toBe('97ab8a1bf0afb96132f2f67258da15a8');
  });
  it('is symmetric', () => {
    const key = enc('SuperSecretKey');
    const plain = enc('the quick brown fox jumps over the lazy dog');
    const ciphertext = rc4(key, plain);
    const recovered = rc4(key, ciphertext);
    expect(Array.from(recovered)).toEqual(Array.from(plain));
  });
});
