/**
 * A tiny global signal for opening the paywall from anywhere (a locked template,
 * a locked clipart tile, the top-bar Upgrade button) without prop-drilling.
 * `<Paywall/>` is mounted once at the app shell and reacts to this store.
 */
import { useSyncExternalStore } from 'react';

/** Why the paywall opened — lets the UI tailor the headline. null = closed. */
export type PaywallReason = 'pro' | 'template' | 'clipart' | 'export' | null;

let reason: PaywallReason = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openPaywall(r: Exclude<PaywallReason, null> = 'pro'): void { reason = r; emit(); }
export function closePaywall(): void { reason = null; emit(); }
export function getPaywallReason(): PaywallReason { return reason; }

export function usePaywallReason(): PaywallReason {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    getPaywallReason,
    getPaywallReason,
  );
}
