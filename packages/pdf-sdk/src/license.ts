/**
 * pdfcraft SDK licensing — the tldraw model, enforced offline.
 *
 * Use is FREE in development. Production use requires a license key; without
 * one the embedding host shows a small "Built with pdfcraft" watermark badge.
 * Crucially for a privacy-first product, enforcement is **fully offline**:
 * a key is an ECDSA P-256 signature over a JSON payload, verified locally
 * against an embedded public key via WebCrypto — no license server, no
 * phone-home, no telemetry. (A licensing scheme that called home would
 * contradict the compliance whitepaper; this one provably can't.)
 *
 * Key format:  PC1.<base64url payload>.<base64url signature>
 * Payload:     { "licensee": string, "exp": "YYYY-MM-DD", "domains"?: string[] }
 *
 * Keys are minted with scripts/generate-license.mjs using the vendor's
 * private key. Tampering with the payload invalidates the signature; expiry
 * and (optional) domain restriction are checked at validation time.
 */

export type LicenseState =
  /** Non-production context (localhost etc.) — fully featured, no badge. */
  | 'dev'
  /** Valid key for this context — fully featured, no badge. */
  | 'licensed'
  /** Key present but expired — featured, badge shown, console notice. */
  | 'expired'
  /** Production with no/invalid key — featured, badge shown. */
  | 'unlicensed';

export interface LicenseInfo {
  state: LicenseState;
  licensee?: string;
  expires?: string;
  reason?: string;
}

/** Vendor public key (JWK, ECDSA P-256). Replace with your production key —
 *  scripts/generate-license.mjs prints a matching pair. */
const DEFAULT_PUBLIC_JWK: JsonWebKey = {
  kty: 'EC',
  crv: 'P-256',
  x: 'REPLACE_WITH_PRODUCTION_KEY_X',
  y: 'REPLACE_WITH_PRODUCTION_KEY_Y',
};

let publicJwk: JsonWebKey = DEFAULT_PUBLIC_JWK;
let configuredKey: string | null = null;
let cached: LicenseInfo | null = null;

/** Install the license key (call once at startup, before mounting the UI). */
export function configureLicense(key: string | null): void {
  configuredKey = key;
  cached = null;
}

/** Test/ops hook: override the embedded vendor public key. */
export function setLicensePublicKey(jwk: JsonWebKey): void {
  publicJwk = jwk;
  cached = null;
}

const DEV_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0', '']);

/** Heuristic for "development context": non-browser (tests/SSR/Node tools)
 *  or a loopback/file origin. Production = a real hostname over http(s). */
export function isDevContext(): boolean {
  if (typeof window === 'undefined' || typeof location === 'undefined') return true;
  if (location.protocol === 'file:') return true;
  const host = location.hostname.toLowerCase();
  return DEV_HOSTS.has(host) || host.endsWith('.localhost');
}

// Pure base64url decoder — no atob/Buffer, identical in browser and Node.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64urlToBytes(s: string): Uint8Array {
  const clean = s.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buf = 0;
  let bits = 0;
  let o = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error('invalid base64url');
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buf >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

interface Payload {
  licensee?: string;
  exp?: string;
  domains?: string[];
}

/**
 * Validate the configured key for the current context. Resolves to a full
 * LicenseInfo; never throws. Results are cached until configuration changes.
 */
export async function validateLicense(): Promise<LicenseInfo> {
  if (cached) return cached;
  cached = await compute();
  return cached;
}

async function compute(): Promise<LicenseInfo> {
  if (!configuredKey) {
    return isDevContext()
      ? { state: 'dev' }
      : { state: 'unlicensed', reason: 'No license key configured for production use.' };
  }

  const parts = configuredKey.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'PC1') {
    return { state: 'unlicensed', reason: 'Malformed license key.' };
  }
  let payload: Payload;
  let payloadBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    payloadBytes = b64urlToBytes(parts[1]!);
    sigBytes = b64urlToBytes(parts[2]!);
    payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as Payload;
  } catch {
    return { state: 'unlicensed', reason: 'Unreadable license key.' };
  }

  // Signature check (offline, WebCrypto).
  try {
    const key = await crypto.subtle.importKey('jwk', publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      sigBytes as unknown as ArrayBuffer,
      payloadBytes as unknown as ArrayBuffer,
    );
    if (!ok) return { state: 'unlicensed', reason: 'Invalid license signature.' };
  } catch (e) {
    return { state: 'unlicensed', reason: 'License verification unavailable: ' + (e instanceof Error ? e.message : String(e)) };
  }

  // Domain restriction (only enforceable in a browser; dev contexts pass).
  if (payload.domains?.length && typeof location !== 'undefined' && !isDevContext()) {
    const host = location.hostname.toLowerCase();
    const match = payload.domains.some((d) => {
      const dom = d.toLowerCase();
      return host === dom || host.endsWith('.' + dom);
    });
    if (!match) {
      return { state: 'unlicensed', licensee: payload.licensee, reason: `License not valid for domain "${host}".` };
    }
  }

  // Expiry.
  if (payload.exp) {
    const exp = Date.parse(payload.exp + 'T23:59:59Z');
    if (Number.isFinite(exp) && Date.now() > exp) {
      return { state: 'expired', licensee: payload.licensee, expires: payload.exp, reason: 'License expired.' };
    }
  }

  return { state: 'licensed', licensee: payload.licensee, expires: payload.exp };
}

/** Should the embedding UI show the "Built with pdfcraft" badge? */
export function shouldShowBadge(info: LicenseInfo): boolean {
  return info.state === 'unlicensed' || info.state === 'expired';
}
