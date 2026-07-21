import { describe, it, expect, beforeEach } from 'vitest';
import { configureBilling, purchaseAndUnlock, restorePurchases, mockBillingProvider, type BillingProvider } from './billing.js';
import { resetEntitlement, getEntitlement, isPro } from './entitlements.js';
import { PRO_MONTHLY } from './products.js';

describe('billing', () => {
  beforeEach(() => { resetEntitlement(); configureBilling({ provider: undefined, verifyUrl: undefined }); });

  it('mock provider grants Pro locally when no verify server is configured', async () => {
    configureBilling({ provider: mockBillingProvider });
    await purchaseAndUnlock(PRO_MONTHLY);
    expect(isPro(getEntitlement())).toBe(true);
    expect(getEntitlement().source).toBe('mock');
    expect(getEntitlement().proExpiresAt).toBeTruthy();
  });

  it('a credit pack adds credits locally', async () => {
    configureBilling({ provider: mockBillingProvider });
    await purchaseAndUnlock('credits_500');
    expect(getEntitlement().credits).toBe(500);
    expect(isPro(getEntitlement())).toBe(false);
  });

  it('verifies server-side when a verifyUrl is set (client never self-grants)', async () => {
    const captured: { url?: string; body?: unknown } = {};
    const fakeProvider: BillingProvider = {
      id: 'test', isAvailable: () => true,
      async purchase(productId) { return { productId, token: 'tok-123', platform: 'test' }; },
      async restore() { return []; },
    };
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      captured.url = url; captured.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ entitlement: { plan: 'pro', proExpiresAt: '2999-01-01T00:00:00.000Z' } }) } as Response;
    }) as typeof fetch;
    try {
      configureBilling({ provider: fakeProvider, verifyUrl: 'https://api.example/verify', sessionToken: 'jwt' });
      await purchaseAndUnlock(PRO_MONTHLY);
    } finally { globalThis.fetch = realFetch; }
    expect(captured.url).toBe('https://api.example/verify');
    expect(captured.body).toMatchObject({ token: 'tok-123', productId: PRO_MONTHLY, platform: 'test' });
    expect(isPro(getEntitlement())).toBe(true);
  });

  it('restore grants nothing when there are no owned purchases', async () => {
    configureBilling({ provider: mockBillingProvider });
    await restorePurchases();
    expect(isPro(getEntitlement())).toBe(false);
  });
});
