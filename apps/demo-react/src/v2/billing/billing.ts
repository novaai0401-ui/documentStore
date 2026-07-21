/**
 * Billing — the seam between the app and the store.
 *
 * A `BillingProvider` abstracts *where the money comes from*: Google Play
 * Billing on Android (required for a Play-distributed app's digital goods),
 * Stripe on the web, and a mock provider for local development. Purchases return
 * an opaque token; the token is then **verified server-side** (`verifyUrl`) and
 * the server pushes back the resulting entitlement. Without a configured server
 * (local dev), the mock provider grants the entitlement locally so the whole
 * flow — paywall → purchase → Pro unlock → gated content opens — is testable
 * end-to-end before any backend exists.
 *
 * Nothing here trusts the client for money: the real provider tokens are
 * meaningless until the server validates them against Play/Stripe. See
 * docs/monetization-spec.md §4 and §9.
 */
import { setEntitlement, addCredits } from './entitlements.js';
import { productById, type Product } from './products.js';

export interface PurchaseResult { productId: string; token: string; platform: string }

export interface BillingProvider {
  readonly id: string;
  /** True when this provider can actually transact in the current environment. */
  isAvailable(): boolean;
  /** Launch the store's purchase flow; resolve with an opaque purchase token. */
  purchase(productId: string): Promise<PurchaseResult>;
  /** Re-fetch owned purchases (Play requires a "Restore purchases" affordance). */
  restore(): Promise<PurchaseResult[]>;
}

interface BillingConfig {
  provider?: BillingProvider;
  /** Server endpoint that verifies a purchase token → entitlement. */
  verifyUrl?: string;
  /** Pyntra session JWT (from Google Sign-In) sent to the verify endpoint. */
  sessionToken?: string;
}

let config: BillingConfig = {};

export function configureBilling(next: BillingConfig): void {
  config = { ...config, ...next };
}

// ── Providers ──────────────────────────────────────────────────────────────

/** Dev/web-fallback: "buys" instantly and grants locally. Clearly labelled. */
export const mockBillingProvider: BillingProvider = {
  id: 'mock',
  isAvailable: () => true,
  async purchase(productId) {
    return { productId, token: `mock-${productId}-${localCounter()}`, platform: 'mock' };
  },
  async restore() { return []; },
};

/**
 * Google Play Billing. Wired through a Capacitor in-app-purchase plugin at
 * runtime; unavailable (and inert) until that plugin ships in the Android build.
 * The lookup is defensive so the web bundle never hard-depends on a native API.
 */
export const playBillingProvider: BillingProvider = {
  id: 'play',
  isAvailable() {
    const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return !!cap?.isNativePlatform?.() && !!getPlayPlugin();
  },
  async purchase(productId) {
    const plugin = getPlayPlugin();
    if (!plugin) throw new Error('Play Billing is not available in this build');
    // The concrete plugin shape is finalized when the Android wrapper lands;
    // it must return an object carrying the Play purchaseToken.
    const res = await plugin.purchase({ productId });
    const token = res?.purchaseToken ?? res?.token;
    if (!token) throw new Error('Play Billing returned no purchase token');
    return { productId, token, platform: 'play' };
  },
  async restore() {
    const plugin = getPlayPlugin();
    if (!plugin?.restorePurchases) return [];
    const owned = (await plugin.restorePurchases()) ?? [];
    return owned
      .map((p) => ({ productId: p.productId, token: p.purchaseToken ?? p.token, platform: 'play' }))
      .filter((p): p is PurchaseResult => !!p.token);
  },
};

interface PlayPlugin {
  purchase(opts: { productId: string }): Promise<{ purchaseToken?: string; token?: string }>;
  restorePurchases?(): Promise<Array<{ productId: string; purchaseToken?: string; token?: string }>>;
}
function getPlayPlugin(): PlayPlugin | undefined {
  return (globalThis as { PyntraPlayBilling?: PlayPlugin }).PyntraPlayBilling;
}

/**
 * Stripe (web). Redirects to a server-created Checkout Session; entitlement is
 * granted asynchronously via the Stripe webhook, so `purchase` here only starts
 * the redirect. Available only when a checkout endpoint is configured.
 */
export function stripeCheckoutProvider(checkoutUrl: string): BillingProvider {
  return {
    id: 'stripe',
    isAvailable: () => typeof window !== 'undefined' && !!checkoutUrl,
    async purchase(productId) {
      const url = new URL(checkoutUrl, window.location.origin);
      url.searchParams.set('product', productId);
      window.location.assign(url.toString());
      // The redirect navigates away; resolve a placeholder for type-completeness.
      return { productId, token: 'redirect', platform: 'stripe' };
    },
    async restore() { return []; },
  };
}

// ── Provider resolution ──────────────────────────────────────────────────────

/** Pick the right provider: explicit config → Play (Android) → mock (dev/web). */
export function resolveProvider(): BillingProvider {
  if (config.provider) return config.provider;
  if (playBillingProvider.isAvailable()) return playBillingProvider;
  return mockBillingProvider;
}

// ── Purchase → verify → grant ────────────────────────────────────────────────

/**
 * Run a purchase and unlock the entitlement it grants.
 * - With a `verifyUrl`: POST the token to the server, which validates it against
 *   Play/Stripe and returns the authoritative entitlement.
 * - Without one (local dev / mock provider): grant locally from the product
 *   catalog so the flow is exercisable end-to-end.
 */
export async function purchaseAndUnlock(productId: string): Promise<void> {
  const provider = resolveProvider();
  const result = await provider.purchase(productId);
  if (result.platform === 'stripe' && result.token === 'redirect') return; // navigated away
  await grant(result);
}

async function grant(result: PurchaseResult): Promise<void> {
  if (config.verifyUrl) {
    const ent = await verifyOnServer(result);
    setEntitlement(ent);
    return;
  }
  grantLocally(result); // dev path — mock provider
}

async function verifyOnServer(result: PurchaseResult): Promise<Record<string, unknown>> {
  const res = await fetch(config.verifyUrl!, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(config.sessionToken ? { authorization: `Bearer ${config.sessionToken}` } : {}),
    },
    body: JSON.stringify({ token: result.token, productId: result.productId, platform: result.platform }),
  });
  if (!res.ok) throw new Error(`Purchase verification failed (${res.status})`);
  const body = await res.json();
  // The server returns the entitlement fields directly.
  return body?.entitlement ?? body;
}

/** Local grant used only when no verification server is configured (dev). */
function grantLocally(result: PurchaseResult): void {
  const product: Product | undefined = productById(result.productId);
  if (!product) return;
  if (product.kind === 'subscription') {
    setEntitlement({ plan: 'pro', proExpiresAt: expiryFor(product.period), source: result.platform });
  } else if (product.kind === 'credits' && product.credits) {
    addCredits(product.credits, result.platform);
  }
}

function expiryFor(period: 'month' | 'year' | undefined): string {
  const now = Date.now();
  const ms = period === 'year' ? 365 : 31;
  try { return new Date(now + ms * 24 * 60 * 60 * 1000).toISOString(); } catch { return ''; }
}

/** Restore previously-owned purchases (Play requirement). */
export async function restorePurchases(): Promise<void> {
  const provider = resolveProvider();
  const owned = await provider.restore();
  for (const p of owned) await grant(p);
}

let _c = 0;
function localCounter(): number { return ++_c; }
