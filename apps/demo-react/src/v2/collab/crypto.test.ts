import { describe, it, expect } from 'vitest';
import { generateKey, exportKey, importKey, encrypt, decrypt, encryptJson, decryptJson, b64urlEncode, b64urlDecode, randomToken } from './crypto.js';

describe('collab crypto (AES-GCM, WebCrypto)', () => {
  it('round-trips bytes', async () => {
    const key = await generateKey();
    const data = new Uint8Array([1, 2, 3, 0, 255, 128]);
    const blob = await encrypt(key, data);
    expect(Array.from(await decrypt(key, blob))).toEqual(Array.from(data));
  });

  it('round-trips JSON ops', async () => {
    const key = await generateKey();
    const ops = [{ t: 'ins', id: { c: 1, s: 'A' }, origin: null, ch: 'x' }];
    const blob = await encryptJson(key, ops);
    expect(await decryptJson(key, blob)).toEqual(ops);
  });

  it('ciphertext hides the plaintext and varies per call (random IV)', async () => {
    const key = await generateKey();
    const data = new TextEncoder().encode('secret payload');
    const a = await encrypt(key, data);
    const b = await encrypt(key, data);
    expect(Array.from(a)).not.toEqual(Array.from(b)); // different IVs
    expect(new TextDecoder().decode(a)).not.toContain('secret');
  });

  it('a wrong key cannot decrypt (authenticated)', async () => {
    const k1 = await generateKey();
    const k2 = await generateKey();
    const blob = await encrypt(k1, new Uint8Array([9, 9, 9]));
    await expect(decrypt(k2, blob)).rejects.toBeTruthy();
  });

  it('exports/imports a key and the imported key decrypts', async () => {
    const key = await generateKey();
    const str = await exportKey(key);
    const data = new Uint8Array([5, 6, 7]);
    const blob = await encrypt(key, data);
    const imported = await importKey(str);
    expect(Array.from(await decrypt(imported, blob))).toEqual([5, 6, 7]);
  });

  it('base64url round-trips and tokens are unguessable + unique', () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
    expect(Array.from(b64urlDecode(b64urlEncode(bytes)))).toEqual(Array.from(bytes));
    expect(b64urlEncode(bytes)).not.toMatch(/[+/=]/); // url-safe
    expect(randomToken()).not.toBe(randomToken());
    expect(randomToken(16).length).toBeGreaterThanOrEqual(20);
  });
});
