import { describe, it, expect, beforeEach } from 'vitest';
import { FREE_ENTITLEMENT, isPro, setEntitlement, resetEntitlement, addCredits, getEntitlement } from './entitlements.js';

describe('entitlements', () => {
  beforeEach(() => resetEntitlement());

  it('defaults to the free plan', () => {
    expect(getEntitlement()).toEqual(FREE_ENTITLEMENT);
    expect(isPro(getEntitlement())).toBe(false);
  });

  it('isPro respects plan and expiry', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(isPro({ plan: 'pro', proExpiresAt: future, credits: 0, source: null, updatedAt: null })).toBe(true);
    expect(isPro({ plan: 'pro', proExpiresAt: past, credits: 0, source: null, updatedAt: null })).toBe(false);
    expect(isPro({ plan: 'pro', proExpiresAt: null, credits: 0, source: null, updatedAt: null })).toBe(true); // lifetime
    expect(isPro({ plan: 'free', proExpiresAt: future, credits: 0, source: null, updatedAt: null })).toBe(false);
  });

  it('setEntitlement normalizes and stamps updatedAt', () => {
    setEntitlement({ plan: 'pro', proExpiresAt: '2999-01-01T00:00:00.000Z' });
    const e = getEntitlement();
    expect(e.plan).toBe('pro');
    expect(isPro(e)).toBe(true);
    expect(e.updatedAt).toBeTruthy();
  });

  it('credits never go negative', () => {
    addCredits(50, 'mock');
    expect(getEntitlement().credits).toBe(50);
    addCredits(-100);
    expect(getEntitlement().credits).toBe(0);
  });

  it('resetEntitlement clears back to free', () => {
    setEntitlement({ plan: 'pro' });
    resetEntitlement();
    expect(getEntitlement().plan).toBe('free');
  });
});
