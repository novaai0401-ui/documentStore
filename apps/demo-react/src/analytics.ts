/**
 * Optional, opt-in analytics — OFF by default. A stock Pyntra build ships ZERO
 * tracking and loads no third-party script: consistent with the product promise
 * that nothing leaves your device. A self-hoster who wants anonymous page metrics
 * can opt in by setting `VITE_GA_ID` at build time; only then is Google Analytics
 * loaded, and even then we still honour Do Not Track / Global Privacy Control
 * (nothing loads if either is set), turn on IP anonymisation, and disable Google
 * "signals"/ad-personalisation. There is deliberately NO baked-in Measurement ID
 * — the default experience makes no outbound request to anyone.
 */
declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

/** True when the user has asked not to be tracked (DNT or GPC). */
export function trackingOptedOut(): boolean {
  if (typeof navigator === 'undefined') return true;
  const dnt = navigator.doNotTrack || (window as unknown as { doNotTrack?: string }).doNotTrack || (navigator as unknown as { msDoNotTrack?: string }).msDoNotTrack;
  if (dnt === '1' || dnt === 'yes') return true;
  if ((navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl === true) return true;
  return false;
}

export function initAnalytics(): void {
  // Opt-in only: no `VITE_GA_ID` → no analytics, no script, no requests.
  const id = import.meta.env.VITE_GA_ID;
  if (!id || !import.meta.env.PROD) return;
  // Respect the user's opt-out — no script, no requests, nothing.
  if (trackingOptedOut()) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  // Consent Mode: deny ad storage/personalisation by default; only anonymous
  // analytics with IP anonymisation.
  window.gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
  window.gtag('js', new Date());
  window.gtag('config', id, { anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false });

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);
}

export {};
