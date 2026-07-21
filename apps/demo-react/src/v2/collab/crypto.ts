/**
 * End-to-end encryption for collaboration. Every byte that crosses the network
 * is encrypted with AES-GCM (authenticated) using a key that lives only in the
 * share link's URL fragment — which browsers never send to a server. So a relay
 * (or anyone in between) sees nothing but ciphertext and a room id; it cannot
 * read or tamper with the document. Built on the browser-native WebCrypto, so
 * there's no crypto dependency to trust.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str: string): Uint8Array {
  const norm = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(norm);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Random URL-safe token (default 16 bytes ≈ 128 bits of entropy). */
export function randomToken(bytes = 16): string {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function exportKey(key: CryptoKey): Promise<string> {
  return b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}

// WebCrypto wants BufferSource; the newer TS typed-array generics don't
// structurally match a plain Uint8Array, so funnel through this cast.
const buf = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

export function importKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', buf(b64urlDecode(raw)), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

/** Encrypt bytes; a fresh random 12-byte IV is prepended to the ciphertext. */
export async function encrypt(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(iv) }, key, buf(data)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return out;
}

/** Decrypt a blob produced by `encrypt` (rejects if the key is wrong or data tampered). */
export async function decrypt(key: CryptoKey, blob: Uint8Array): Promise<Uint8Array> {
  const iv = blob.slice(0, 12);
  const ct = blob.slice(12);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(iv) }, key, buf(ct)));
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<Uint8Array> {
  return encrypt(key, enc.encode(JSON.stringify(value)));
}

export async function decryptJson<T>(key: CryptoKey, blob: Uint8Array): Promise<T> {
  return JSON.parse(dec.decode(await decrypt(key, blob))) as T;
}
