/**
 * Host-gated key exchange (ECDH) — the security core of invite-only rooms. The
 * room's AES key is NEVER put in the share link; instead the host holds it and
 * hands it only to peers that pass admit(). Delivery is via ephemeral ECDH
 * (P-256): the joiner sends its public key, the host derives a shared secret with
 * it, wraps the room key (AES-GCM), and sends it back. Only the holder of the
 * matching private key (the intended joiner) can unwrap it — so a forwarded link
 * (different keypair) cannot decrypt the room key, even though it reached the relay.
 *
 * All WebCrypto, so it runs and is byte-verified in Node — the one collab security
 * piece I can prove here.
 */
import { b64urlEncode, b64urlDecode, encrypt, decrypt } from './crypto.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
const buf = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

export interface EcdhPair { publicKey: string; privateKey: CryptoKey }

/** A fresh ephemeral ECDH P-256 key pair; the public key is base64url (raw point). */
export async function generateEcdhPair(): Promise<EcdhPair> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { publicKey: b64urlEncode(raw), privateKey: pair.privateKey };
}

/** Derive the shared AES-GCM key from our private key and their public key. */
export async function deriveSharedKey(privateKey: CryptoKey, theirPublicB64: string): Promise<CryptoKey> {
  const theirPub = await crypto.subtle.importKey('raw', buf(b64urlDecode(theirPublicB64)), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  return crypto.subtle.deriveKey({ name: 'ECDH', public: theirPub }, privateKey, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/** Wrap (encrypt) the room key string for delivery over the (public) relay. */
export async function wrapRoomKey(shared: CryptoKey, roomKeyB64: string): Promise<string> {
  return b64urlEncode(await encrypt(shared, enc.encode(roomKeyB64)));
}

/** Unwrap the room key. Throws if the shared key is wrong (e.g. a forwarded peer). */
export async function unwrapRoomKey(shared: CryptoKey, wrappedB64: string): Promise<string> {
  return dec.decode(await decrypt(shared, b64urlDecode(wrappedB64)));
}
