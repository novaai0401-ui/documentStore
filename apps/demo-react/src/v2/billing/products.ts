/**
 * Product catalog — the SKUs sold through Google Play Billing (Android) and
 * Stripe (web). Product ids must match exactly what's configured in the Play
 * Console and Stripe dashboard. Prices here are display-only placeholders; the
 * store is the source of truth for the amount actually charged.
 *
 * Phase 1 sells the Pro subscription only (content gating). Credit packs are
 * defined for Phase 2+ (AI features) but surfaced as "coming soon" until the
 * metered AI proxy exists — see docs/monetization-spec.md.
 */
export type ProductKind = 'subscription' | 'credits';

export interface Product {
  id: string;
  kind: ProductKind;
  title: string;
  blurb: string;
  /** Display price (store overrides at purchase time). */
  price: string;
  /** For subscriptions. */
  period?: 'month' | 'year';
  /** For credit packs — how many credits the purchase grants. */
  credits?: number;
  /** Optional ribbon, e.g. "Best value". */
  badge?: string;
}

export const PRO_MONTHLY = 'pyntra_pro_monthly';
export const PRO_YEARLY = 'pyntra_pro_yearly';

export const SUBSCRIPTIONS: Product[] = [
  { id: PRO_MONTHLY, kind: 'subscription', title: 'Pyntra Pro', blurb: 'Billed monthly', price: '$4.99', period: 'month' },
  { id: PRO_YEARLY, kind: 'subscription', title: 'Pyntra Pro', blurb: 'Billed yearly — 2 months free', price: '$39.99', period: 'year', badge: 'Best value' },
];

/** Consumable AI credits — Phase 2+. Listed for completeness; not yet sold. */
export const CREDIT_PACKS: Product[] = [
  { id: 'credits_100', kind: 'credits', title: '100 credits', blurb: 'AI images, avatars & more', price: '$1.99', credits: 100 },
  { id: 'credits_500', kind: 'credits', title: '500 credits', blurb: 'Save 20%', price: '$7.99', credits: 500, badge: 'Popular' },
  { id: 'credits_1500', kind: 'credits', title: '1500 credits', blurb: 'Save 33%', price: '$19.99', credits: 1500 },
];

export const PRODUCTS: Product[] = [...SUBSCRIPTIONS, ...CREDIT_PACKS];

export const productById = (id: string): Product | undefined => PRODUCTS.find((p) => p.id === id);

/** The Pro benefits list shown on the paywall. */
export const PRO_BENEFITS: string[] = [
  'All premium templates & animated cards',
  'The full clipart & decoration library',
  'Watermark-free exports (PNG, PDF, SVG)',
  'HD & video exports',
  'Priority access to new features',
];
