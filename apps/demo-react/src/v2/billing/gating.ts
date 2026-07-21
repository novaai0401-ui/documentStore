/**
 * Premium content gating — which templates and clipart require Pyntra Pro.
 *
 * Kept as explicit id sets (rather than a flag on every data item) so the whole
 * gating policy lives in one testable place and is trivial to expand or dial
 * back. Free users get the large majority of content; the flashiest animated
 * cards and the decorative "frames" clipart are the Pro upsell. Avatars and the
 * everyday cards stay free on purpose — they're the funnel.
 *
 * This is *content* gating only. It's a soft gate (crackable client-side by
 * design); real money is protected at the server for paid AI calls in later
 * phases. See docs/monetization-spec.md.
 */

/** Templates behind Pro (a small, high-appeal subset — expand over time). */
export const PREMIUM_TEMPLATE_IDS: ReadonlySet<string> = new Set([
  // Flagship animated greeting cards
  'gc-birthday-milestone',
  'gc-anniversary',
  'gc-new-year',
  'gc-diwali',
  'gc-eid',
  'gc-christmas',
  // Legacy "animated" showcase templates
  'anim-birthday-wish',
  'anim-congrats',
  'anim-love',
  'invite-birthday',
]);

/** Clipart behind Pro — the decorative "Frames" set (banners, seals, wreaths…). */
export const PREMIUM_CLIPART_IDS: ReadonlySet<string> = new Set([
  'cl-ribbon',
  'cl-seal',
  'cl-wreath',
  'cl-speech',
  'cl-bow',
  'cl-sparkle',
]);

export const isPremiumTemplate = (id: string): boolean => PREMIUM_TEMPLATE_IDS.has(id);
export const isPremiumClipart = (id: string): boolean => PREMIUM_CLIPART_IDS.has(id);

/**
 * Can this item be *used* right now? Premium items require Pro; everything else
 * is always allowed. Callers pass the current Pro status so this stays pure.
 */
export function canUseTemplate(id: string, isPro: boolean): boolean {
  return isPro || !isPremiumTemplate(id);
}
export function canUseClipart(id: string, isPro: boolean): boolean {
  return isPro || !isPremiumClipart(id);
}
