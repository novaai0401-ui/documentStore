/**
 * Verifiable document signatures — 100% local, via the Web Crypto API.
 *
 * We sign the exact bytes of a file with an ECDSA P-256 key and produce a small
 * JSON "signature manifest" that travels alongside the document. Anyone can
 * verify it offline: re-hash the bytes, check they match, and verify the
 * signature against the embedded public key. This proves **integrity** (the file
 * hasn't changed) and **authenticity** (it was signed by the holder of that key).
 *
 * Scope note: this is a self-contained cryptographic signature, not a CA-backed
 * PAdES/PKI trust chain — there is no certificate authority. It is honest about
 * what it asserts, needs no server, and nothing leaves the device.
 */

export interface SignatureManifest {
  v: 1;
  /** Human-readable signer label. */
  signer: string;
  /** ISO-8601 time the signature was created. */
  signedAt: string;
  alg: 'ECDSA-P256-SHA256';
  /** Public key (JWK) needed to verify — embedded so verification is standalone. */
  publicKeyJwk: JsonWebKey;
  /** Hex SHA-256 of the signed bytes (fast integrity display). */
  digestSha256: string;
  /** Base64 ECDSA signature over the document bytes. */
  signature: string;
}

export interface VerifyResult {
  valid: boolean;
  digestMatch: boolean;
  sigValid: boolean;
  signer: string;
  signedAt: string;
}

const ALGO = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;

function subtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) throw new Error('Web Crypto is unavailable in this environment.');
  return c.subtle;
}

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await subtle().digest('SHA-256', bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A fresh signing identity (ECDSA P-256). Exportable so it can be saved/reused. */
export function generateSigningKey(): Promise<CryptoKeyPair> {
  return subtle().generateKey(ALGO, true, ['sign', 'verify']) as Promise<CryptoKeyPair>;
}

/** Sign `bytes`, producing a standalone, verifiable manifest. */
export async function signDocument(bytes: Uint8Array, signer: string, keys: CryptoKeyPair): Promise<SignatureManifest> {
  const sig = new Uint8Array(await subtle().sign(SIGN, keys.privateKey, bytes as unknown as ArrayBuffer));
  const publicKeyJwk = await subtle().exportKey('jwk', keys.publicKey);
  return {
    v: 1,
    signer: signer.trim() || 'Anonymous',
    signedAt: new Date().toISOString(),
    alg: 'ECDSA-P256-SHA256',
    publicKeyJwk,
    digestSha256: await sha256Hex(bytes),
    signature: toB64(sig),
  };
}

/** Verify a document against its manifest: integrity (digest) + authenticity (signature). */
export async function verifyDocument(bytes: Uint8Array, m: SignatureManifest): Promise<VerifyResult> {
  const digestMatch = (await sha256Hex(bytes)) === m.digestSha256;
  let sigValid = false;
  try {
    const pub = await subtle().importKey('jwk', m.publicKeyJwk, ALGO, false, ['verify']);
    sigValid = await subtle().verify(SIGN, pub, fromB64(m.signature) as unknown as ArrayBuffer, bytes as unknown as ArrayBuffer);
  } catch { sigValid = false; }
  return { valid: digestMatch && sigValid, digestMatch, sigValid, signer: m.signer, signedAt: m.signedAt };
}

export function manifestToJson(m: SignatureManifest): string {
  return JSON.stringify(m, null, 2);
}

/** Parse + shape-check a manifest from JSON; throws on anything malformed. */
export function manifestFromJson(text: string): SignatureManifest {
  const m = JSON.parse(text) as Partial<SignatureManifest>;
  if (m.v !== 1 || !m.signature || !m.digestSha256 || !m.publicKeyJwk || m.alg !== 'ECDSA-P256-SHA256') {
    throw new Error('Not a valid Pyntra signature manifest.');
  }
  return m as SignatureManifest;
}
