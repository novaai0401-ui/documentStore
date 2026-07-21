import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import {
  configureLicense,
  validateLicense,
  setLicensePublicKey,
  isDevContext,
  shouldShowBadge,
} from './license.js';

const b64url = (buf: ArrayBuffer | Uint8Array): string =>
  Buffer.from(buf as Uint8Array).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let priv: CryptoKey;

async function mint(payload: Record<string, unknown>): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, bytes);
  return `PC1.${b64url(bytes)}.${b64url(sig)}`;
}

function stubProduction(host = 'app.example.com'): void {
  vi.stubGlobal('window', {});
  vi.stubGlobal('location', { hostname: host, protocol: 'https:' });
}

beforeAll(async () => {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  priv = kp.privateKey;
  setLicensePublicKey(await crypto.subtle.exportKey('jwk', kp.publicKey));
});

afterEach(() => {
  vi.unstubAllGlobals();
  configureLicense(null);
});

describe('license validation', () => {
  it('is dev (no badge) outside a browser with no key', async () => {
    configureLicense(null);
    expect(isDevContext()).toBe(true);
    const info = await validateLicense();
    expect(info.state).toBe('dev');
    expect(shouldShowBadge(info)).toBe(false);
  });

  it('is unlicensed (badge) in production with no key', async () => {
    stubProduction();
    configureLicense(null);
    const info = await validateLicense();
    expect(info.state).toBe('unlicensed');
    expect(shouldShowBadge(info)).toBe(true);
  });

  it('accepts a validly signed, unexpired key in production', async () => {
    stubProduction();
    configureLicense(await mint({ licensee: 'Acme Corp', exp: '2999-12-31' }));
    const info = await validateLicense();
    expect(info.state).toBe('licensed');
    expect(info.licensee).toBe('Acme Corp');
    expect(shouldShowBadge(info)).toBe(false);
  });

  it('rejects a tampered payload (signature mismatch)', async () => {
    stubProduction();
    const key = await mint({ licensee: 'Acme Corp', exp: '2999-12-31' });
    const [h, , sig] = key.split('.');
    const forged = b64url(new TextEncoder().encode(JSON.stringify({ licensee: 'Evil Co', exp: '2999-12-31' })));
    configureLicense(`${h}.${forged}.${sig}`);
    const info = await validateLicense();
    expect(info.state).toBe('unlicensed');
    expect(info.reason).toContain('signature');
  });

  it('marks expired keys (badge, with licensee preserved)', async () => {
    stubProduction();
    configureLicense(await mint({ licensee: 'Acme Corp', exp: '2020-01-01' }));
    const info = await validateLicense();
    expect(info.state).toBe('expired');
    expect(shouldShowBadge(info)).toBe(true);
  });

  it('enforces domain restriction in production', async () => {
    stubProduction('other.io');
    configureLicense(await mint({ licensee: 'Acme', exp: '2999-12-31', domains: ['acme.com'] }));
    expect((await validateLicense()).state).toBe('unlicensed');

    stubProduction('app.acme.com'); // subdomain of a licensed domain
    configureLicense(await mint({ licensee: 'Acme', exp: '2999-12-31', domains: ['acme.com'] }));
    expect((await validateLicense()).state).toBe('licensed');
  });

  it('rejects malformed keys without throwing', async () => {
    stubProduction();
    configureLicense('not-a-key');
    expect((await validateLicense()).state).toBe('unlicensed');
    configureLicense('PC1.zzz');
    expect((await validateLicense()).state).toBe('unlicensed');
  });

  it('treats localhost as dev even with no key', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('location', { hostname: 'localhost', protocol: 'http:' });
    configureLicense(null);
    expect((await validateLicense()).state).toBe('dev');
  });
});
