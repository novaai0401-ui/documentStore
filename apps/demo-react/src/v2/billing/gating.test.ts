import { describe, it, expect } from 'vitest';
import { isPremiumTemplate, isPremiumClipart, canUseTemplate, canUseClipart, PREMIUM_TEMPLATE_IDS, PREMIUM_CLIPART_IDS } from './gating.js';
import { STUDIO_TEMPLATES } from '../studio/templates.js';
import { CLIPART } from '../studio/clipart.js';

describe('content gating', () => {
  it('premium sets reference ids that actually exist', () => {
    const tplIds = new Set(STUDIO_TEMPLATES.map((t) => t.id));
    for (const id of PREMIUM_TEMPLATE_IDS) expect(tplIds.has(id)).toBe(true);
    const clipIds = new Set(CLIPART.map((c) => c.id));
    for (const id of PREMIUM_CLIPART_IDS) expect(clipIds.has(id)).toBe(true);
  });

  it('leaves the majority of content free (premium is an upsell, not a wall)', () => {
    const premiumTpl = STUDIO_TEMPLATES.filter((t) => isPremiumTemplate(t.id)).length;
    const premiumClip = CLIPART.filter((c) => isPremiumClipart(c.id)).length;
    expect(premiumTpl).toBeLessThan(STUDIO_TEMPLATES.length / 2);
    expect(premiumClip).toBeLessThan(CLIPART.length / 2);
  });

  it('canUse gates premium behind Pro but never gates free items', () => {
    const premium = [...PREMIUM_TEMPLATE_IDS][0];
    expect(canUseTemplate(premium, false)).toBe(false);
    expect(canUseTemplate(premium, true)).toBe(true);
    expect(canUseTemplate('gc-good-morning', false)).toBe(true); // free everyday card
    const premiumClip = [...PREMIUM_CLIPART_IDS][0];
    expect(canUseClipart(premiumClip, false)).toBe(false);
    expect(canUseClipart('cl-heart', false)).toBe(true);
  });
});
