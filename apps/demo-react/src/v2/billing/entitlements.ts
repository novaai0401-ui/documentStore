/**
 * Entitlements — the client's view of what the signed-in user has paid for.
 *
 * Phase 1 of monetization (content gating). The *source of truth* is the server:
 * a purchase is verified server-side (Play Billing / Stripe) and the resulting
 * entitlement is pushed here via `setEntitlement`. This module only stores and
 * exposes that state reactively — it never decides on its own that someone is
 * Pro. A locally-forged entitlement unlocks nothing that costs us money, because
 * every paid *AI* call (Phase 2+) is re-checked at the server proxy; the only
 * thing gated purely client-side is premium *content* and the export watermark,
 * where crackability is an accepted trade-off (see docs/monetization-spec.md).
 *
 * Reactive store in the same shape as i18n.ts (module state + listeners +
 * useSyncExternalStore), so any component re-renders when the plan changes.
 */
import { useSyncExternalStore } from 'react';

export type Plan = 'free' | 'pro';

export interface Entitlement {
  plan: Plan;
  /** ISO date the Pro subscription lapses; null = no expiry known / not Pro. */
  proExpiresAt: string | null;
  /** Consumable AI credits (used from Phase 2 on; 0 in Phase 1). */
  credits: number;
  /** Where the entitlement came from: 'play' | 'stripe' | 'mock' | null. */
  source: string | null;
  updatedAt: string | null;
}

export const FREE_ENTITLEMENT: Entitlement = { plan: 'free', proExpiresAt: null, credits: 0, source: null, updatedAt: null };

const KEY = 'pyntra:entitlement';

function normalize(v: unknown): Entitlement {
  const o = (v && typeof v === 'object') ? v as Record<string, unknown> : {};
  const plan: Plan = o.plan === 'pro' ? 'pro' : 'free';
  const credits = typeof o.credits === 'number' && o.credits >= 0 ? Math.floor(o.credits) : 0;
  const proExpiresAt = typeof o.proExpiresAt === 'string' ? o.proExpiresAt : null;
  const source = typeof o.source === 'string' ? o.source : null;
  const updatedAt = typeof o.updatedAt === 'string' ? o.updatedAt : null;
  return { plan, proExpiresAt, credits, source, updatedAt };
}

function load(): Entitlement {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : FREE_ENTITLEMENT;
  } catch { return FREE_ENTITLEMENT; }
}

let current: Entitlement = load();
const listeners = new Set<() => void>();

function persist(): void { try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* SSR / private mode */ } }
function emit(): void { listeners.forEach((l) => l()); }

export function getEntitlement(): Entitlement { return current; }

/** Replace the entitlement (called after server verification, or by the mock
 *  billing provider in dev). Always normalizes and notifies subscribers. */
export function setEntitlement(next: Partial<Entitlement>): void {
  current = normalize({ ...current, ...next, updatedAt: nowIso() });
  persist();
  emit();
}

/** Add (or subtract, if negative) consumable credits — clamped at zero. */
export function addCredits(delta: number, source?: string): void {
  setEntitlement({ credits: Math.max(0, current.credits + Math.floor(delta)), ...(source ? { source } : {}) });
}

/** Sign-out / reset to the free plan. */
export function resetEntitlement(): void {
  current = FREE_ENTITLEMENT;
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  emit();
}

/** Is the user an *active* Pro? Pure — pass an entitlement + clock for tests. */
export function isPro(e: Entitlement = current, now: number = Date.now()): boolean {
  if (e.plan !== 'pro') return false;
  if (!e.proExpiresAt) return true; // Pro with no known expiry (e.g. lifetime / dev)
  const t = Date.parse(e.proExpiresAt);
  return Number.isNaN(t) ? true : t > now;
}

function nowIso(): string { try { return new Date().toISOString(); } catch { return ''; } }

export function subscribeEntitlement(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** React hook — re-renders on any entitlement change. */
export function useEntitlement(): Entitlement {
  return useSyncExternalStore(subscribeEntitlement, getEntitlement, getEntitlement);
}

/** Convenience hook for the common `isPro` gate.
 *
 *  Pyntra is now fully free — there is no paid plan and no upgrade flow. Every
 *  feature that used to be behind Pro (premium templates & clipart, and
 *  watermark-free exports) ships to everyone, so this hook always reports the
 *  unlocked state. The pure `isPro(entitlement)` above is kept intact for tests
 *  and any future re-introduction, but the app no longer gates on it.
 *  We still subscribe to the store so the hook stays reactive/stable. */
export function useIsPro(): boolean {
  useEntitlement();
  return true;
}
