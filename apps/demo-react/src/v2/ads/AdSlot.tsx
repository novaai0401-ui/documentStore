/**
 * AdSense ad slots — in-feed (between cards) and a sticky anchor — mirroring the
 * native/anchor units on greeting-card galleries.
 *
 * Everything here is OFF by default and renders NOTHING unless the site is built
 * with a valid AdSense publisher id AND the matching slot id:
 *   VITE_ADSENSE_CLIENT        = ca-pub-XXXXXXXXXXXXXXXX   (whole-site)
 *   VITE_ADSENSE_SLOT_INFEED   = 1234567890                (in-feed unit)
 *   VITE_ADSENSE_SLOT_ANCHOR   = 1234567890                (anchor unit)
 * With these unset (the default) `adsEnabled()` is false and every <AdSlot/>
 * returns null, so the app looks and behaves exactly as before. The AdSense
 * loader script itself is injected into the HTML at build time by
 * build-site.mjs (also gated on VITE_ADSENSE_CLIENT).
 */
import { useEffect, useRef } from 'react';

const CLIENT = (import.meta.env.VITE_ADSENSE_CLIENT || '').trim();
const CLIENT_OK = /^ca-pub-\d{16}$/.test(CLIENT);
const SLOTS: Record<AdKind, string> = {
  infeed: (import.meta.env.VITE_ADSENSE_SLOT_INFEED || '').trim(),
  anchor: (import.meta.env.VITE_ADSENSE_SLOT_ANCHOR || '').trim(),
};

export type AdKind = 'infeed' | 'anchor';

/** True only when a real publisher id is baked in — callers use this to decide
 *  whether to weave ad slots into a list at all (so nothing changes when off). */
export const adsEnabled = (): boolean => CLIENT_OK;
/** True when this specific slot can actually render (client + slot id present). */
export const adSlotReady = (kind: AdKind): boolean => CLIENT_OK && !!SLOTS[kind];

/** One AdSense unit. Renders null (nothing) unless its client+slot are present. */
export function AdSlot({ kind }: { kind: AdKind }) {
  const slot = SLOTS[kind];
  const ref = useRef<HTMLModElement | null>(null);
  const pushed = useRef(false);
  useEffect(() => {
    if (!CLIENT_OK || !slot || pushed.current) return;
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      (w.adsbygoogle = w.adsbygoogle || []).push({});
      pushed.current = true;
    } catch { /* loader not ready yet — the script retries the queue itself */ }
  }, [slot]);

  if (!CLIENT_OK || !slot) return null;

  if (kind === 'anchor') {
    return (
      <div className="ad-anchor" aria-label="Advertisement">
        <ins ref={ref} className="adsbygoogle" style={{ display: 'block', width: '100%' }}
          data-ad-client={CLIENT} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true" />
      </div>
    );
  }
  return (
    <div className="ad-infeed" aria-label="Advertisement">
      <span className="ad-label">Ad</span>
      <ins ref={ref} className="adsbygoogle" style={{ display: 'block' }}
        data-ad-client={CLIENT} data-ad-slot={slot} data-ad-format="fluid" data-ad-layout="in-article" />
    </div>
  );
}
