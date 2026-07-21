import { describe, it, expect } from 'vitest';
import { buildCardCopyMessages, parseCardCopy, parseCardDesign, buildCardDesignMessages } from './promptDesignAi.js';
import { aiCardToDesign } from './promptDesign.js';
import { formatById } from './model.js';

describe('promptDesignAi', () => {
  it('builds messages that demand strict JSON card copy', () => {
    const msgs = buildCardCopyMessages('Eco-friendly Ganesh Chaturthi card in Marathi');
    expect(msgs[0]!.role).toBe('system');
    expect(msgs[0]!.content).toContain('JSON');
    expect(msgs[0]!.content).toContain('headline');
    expect(msgs[1]!.content).toContain('Eco-friendly Ganesh Chaturthi card in Marathi');
  });

  it('parses a clean JSON reply', () => {
    const c = parseCardCopy('{"headline":"Ganpati Bappa Morya","subtitle":"गणपती बाप्पा मोरया","message":"May Bappa bless your home"}');
    expect(c.headline).toBe('Ganpati Bappa Morya');
    expect(c.subtitle).toBe('गणपती बाप्पा मोरया');
    expect(c.message).toContain('Bappa');
  });

  it('tolerates markdown fences and surrounding prose', () => {
    const c = parseCardCopy('Here you go:\n```json\n{"headline":"Happy Diwali","message":"Lights and joy"}\n```');
    expect(c.headline).toBe('Happy Diwali');
    expect(c.subtitle).toBeUndefined();
  });

  it('rejects garbage with a readable error', () => {
    expect(() => parseCardCopy('sorry, no')).toThrow(/copy/i);
    expect(() => parseCardCopy('{"foo": 1}')).toThrow(/usable/i);
  });

  it('parses a full AI card design spec (palette, motifs, style, photo)', () => {
    const spec = parseCardDesign('{"bg":"#160a2e","bg2":"#7c2d12","accent":"#fbbf24","ink":"#fde68a","hero":"🪔","scatter":["🪔","🎆","🪷","✨"],"headline":"शुभ दीपावली","subtitle":"the festival of lights","message":"May every diya glow","style":"elegant","photo":false}');
    expect(spec.bg).toBe('#160a2e');
    expect(spec.bg2).toBe('#7c2d12');
    expect(spec.hero).toBe('🪔');
    expect(spec.scatter).toHaveLength(4);
    expect(spec.style).toBe('elegant');
    expect(spec.photo).toBe(false);
  });

  it('design parser defaults safely and rejects incomplete specs', () => {
    // Invalid bg2 / style / scatter fall back rather than crash.
    const s = parseCardDesign('{"bg":"#111111","accent":"#ffe600","ink":"#ffffff","headline":"BRAVO","bg2":"nope","style":"weird","scatter":[]}');
    expect(s.bg2).toBeUndefined();
    expect(s.style).toBeUndefined();
    expect(s.scatter.length).toBeGreaterThan(0);
    // Missing bg or headline → readable error.
    expect(() => parseCardDesign('{"accent":"#fff000","headline":"Hi"}')).toThrow(/incomplete/i);
    expect(() => parseCardDesign('{"bg":"#111111","accent":"#fff000"}')).toThrow(/headline/i);
  });

  it('renders an AI design spec into a gradient card with the chosen style', () => {
    const spec = parseCardDesign('{"bg":"#ffd9a0","bg2":"#ff8fab","accent":"#ffffff","ink":"#7c2d55","hero":"🎈","scatter":["🎂","🎁","🎉","⭐"],"headline":"HAPPY BIRTHDAY","style":"3d","photo":true}');
    const d = aiCardToDesign(spec, formatById('ig-post'));
    expect(d.bg2).toBe('#ff8fab');
    // 3D style → layered headline copies.
    expect(d.elements.filter((e) => e.type === 'text' && /HAPPY/.test((e as { text: string }).text)).length).toBeGreaterThanOrEqual(4);
    // photo:true → tap-to-add slot.
    expect(d.elements.some((e) => e.type === 'image' && (e as { placeholder?: boolean }).placeholder)).toBe(true);
  });

  it('the design system prompt bans animal-deity emoji and demands JSON', () => {
    const sys = buildCardDesignMessages('Ganesh card')[0]!.content;
    expect(sys).toContain('JSON');
    expect(sys).toContain('🕉️');
    expect(sys).toMatch(/NEVER use animal emoji/);
  });
});
