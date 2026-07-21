/**
 * Paywall — the Pyntra Pro upsell sheet. Mounted once at the app shell; opens in
 * response to the paywall store (a locked template/clipart, or the Upgrade
 * button). Buys through the billing layer (Play on Android, Stripe on web, mock
 * in dev) and unlocks the entitlement, at which point every gated surface
 * re-renders as unlocked automatically.
 */
import { useState } from 'react';
import { TkxButton } from 'tekivex-ui';
import { SUBSCRIPTIONS, PRO_BENEFITS, type Product } from './products.js';
import { purchaseAndUnlock, restorePurchases } from './billing.js';
import { useIsPro, isPro, getEntitlement } from './entitlements.js';
import { usePaywallReason, closePaywall, type PaywallReason } from './paywallStore.js';

const HEADLINE: Record<Exclude<PaywallReason, null>, string> = {
  pro: 'Unlock everything with Pyntra Pro',
  template: 'This template is a Pro design',
  clipart: 'This decoration is Pro',
  export: 'Remove the watermark with Pro',
};

export function Paywall() {
  const reason = usePaywallReason();
  const pro = useIsPro();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!reason) return null;

  const buy = async (p: Product) => {
    setError(null);
    setBusy(p.id);
    try {
      await purchaseAndUnlock(p.id);
      closePaywall();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Purchase could not be completed');
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    setError(null);
    setBusy('restore');
    try { await restorePurchases(); if (isPro(getEntitlement())) closePaywall(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Nothing to restore'); }
    finally { setBusy(null); }
  };

  return (
    <div className="v2-modal" onClick={closePaywall}>
      <div className="v2-modal__inner paywall" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head">
          <strong>✨ {pro ? 'You’re a Pro member' : HEADLINE[reason]}</strong>
          <button className="brand-x" aria-label="Close" onClick={closePaywall}>✕</button>
        </div>

        <div className="paywall-body">
          {pro ? (
            <p className="paywall-thanks">Thanks for supporting Pyntra — every premium template, decoration and watermark-free export is unlocked. 💛</p>
          ) : (
            <>
              <ul className="paywall-benefits">
                {PRO_BENEFITS.map((b) => <li key={b}>{b}</li>)}
              </ul>

              <div className="paywall-plans">
                {SUBSCRIPTIONS.map((p) => (
                  <button key={p.id} className="paywall-plan" disabled={busy !== null} onClick={() => void buy(p)}>
                    {p.badge && <span className="paywall-plan-badge">{p.badge}</span>}
                    <span className="paywall-plan-price">{p.price}<span className="paywall-plan-per">/{p.period}</span></span>
                    <span className="paywall-plan-blurb">{p.blurb}</span>
                    <span className="paywall-plan-cta">{busy === p.id ? 'Processing…' : 'Choose'}</span>
                  </button>
                ))}
              </div>

              <p className="paywall-note">Credits for AI images &amp; avatars are coming soon.</p>
              {error && <p className="paywall-error" role="alert">{error}</p>}

              <div className="paywall-foot">
                <TkxButton variant="link" size="sm" disabled={busy !== null} onClick={() => void restore()}>Restore purchases</TkxButton>
                <TkxButton variant="ghost" size="sm" onClick={closePaywall}>Maybe later</TkxButton>
              </div>
              <p className="paywall-fine">Cancel anytime. Billed through Google Play or your card. Free features stay free forever — on your device.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
