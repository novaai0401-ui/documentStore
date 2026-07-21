import { describe, it, expect } from 'vitest';
import { archetypeFor, contrastText, promptToDesign, fitHeadline, shade, PROMPT_BACKGROUNDS, promptBgById, occasionForPrompt, PROMPT_OCCASIONS } from './promptDesign.js';
import { formatById } from './model.js';
import type { BrandKit } from './brandStore.js';

const fmt = formatById('ig-post');

describe('promptDesign', () => {
  it('classifies prompts into archetypes', () => {
    expect(archetypeFor('Summer sale 30% off')).toBe('promo');
    expect(archetypeFor('An inspiring quote about life')).toBe('quote');
    expect(archetypeFor('Join our webinar on Friday')).toBe('event');
    expect(archetypeFor('We moved to a new office')).toBe('announcement');
  });

  it('detects festive occasions and renders a greeting card, not a poster', () => {
    // Occasion words → greeting archetype with the right theme.
    expect(archetypeFor('Diwali card for my family')).toBe('greeting');
    expect(archetypeFor('Eco-friendly Ganesh Chaturthi card in Marathi')).toBe('greeting');
    expect(archetypeFor('Birthday wishes for Aisha')).toBe('greeting');
    expect(occasionForPrompt('Durga Puja greeting — Maa aschen')?.key).toBe('durga');
    expect(occasionForPrompt('छठ पूजा कार्ड')?.key).toBe('chhath');
    // "Diwali sale" is still a promo — commerce wins over occasion.
    expect(archetypeFor('Diwali sale 50% off')).toBe('promo');
    // The design carries the occasion's hero motif, wish and native-script line.
    const d = promptToDesign('Ganesh Chaturthi card for our society', { format: fmt });
    const texts = d.elements.filter((e) => e.type === 'text') as { text: string }[];
    expect(texts.some((t) => t.text === '🕉️')).toBe(true);
    // (the wish may be line-wrapped by fitHeadline, so match a single word)
    expect(texts.some((t) => /Ganpati[\s\S]*Morya/.test(t.text))).toBe(true);
    expect(texts.some((t) => /गणपती बाप्पा मोरया/.test(t.text))).toBe(true);
    expect(d.background).toBe('#3a1405');
    // A chosen background preset still wins.
    expect(promptToDesign('Diwali card', { format: fmt, bgId: 'midnight' }).background).toBe('#0f172a');
    // Every occasion theme is well-formed and culturally clean: no elephant-
    // animal emoji standing in for Ganesha, no dancing-girl emoji.
    for (const o of PROMPT_OCCASIONS) {
      expect(o.hero.length).toBeGreaterThan(0);
      expect(o.scatter).toHaveLength(4);
      expect(o.bg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(o.message.length).toBeGreaterThan(0);
      expect([o.hero, ...o.scatter].join('')).not.toMatch(/🐘|💃/u);
    }
    // The user's raw prompt (an instruction) is never echoed onto the card.
    expect(texts.some((t) => /card for our society/i.test(t.text))).toBe(false);
    // AI copy overrides the built-in wording when provided.
    const ai = promptToDesign('Diwali card', { format: fmt, copy: { headline: 'Shubh Deepavali', message: 'Custom AI wish here' } });
    const aiTexts = ai.elements.filter((e) => e.type === 'text') as { text: string }[];
    expect(aiTexts.some((t) => /Shubh[\s\S]*Deepavali/.test(t.text))).toBe(true);
    expect(aiTexts.some((t) => t.text === 'Custom AI wish here')).toBe(true);
  });

  it('picks legible text colour for a background', () => {
    expect(contrastText('#ffffff')).toBe('#0f172a');
    expect(contrastText('#0f172a')).toBe('#ffffff');
  });

  it('builds a design sized to the format with text from the prompt', () => {
    const d = promptToDesign('Coffee Shop', { format: fmt });
    expect(d.w).toBe(1080);
    expect(d.h).toBe(1080);
    const texts = d.elements.filter((e) => e.type === 'text');
    expect(texts.length).toBeGreaterThanOrEqual(2);
    expect(texts.some((t) => /Coffee Shop/i.test((t as { text: string }).text))).toBe(true);
  });

  it('adds a CTA pill for promo and event, not for announcements', () => {
    const promo = promptToDesign('Big sale this weekend', { format: fmt });
    expect(promo.elements.some((e) => e.type === 'text' && (e as { text: string }).text === 'Shop now')).toBe(true);
    const ann = promptToDesign('We have moved offices', { format: fmt });
    expect(ann.elements.some((e) => e.type === 'text' && /Shop now|RSVP/.test((e as { text: string }).text))).toBe(false);
  });

  it('fitHeadline keeps every line within the box (no overflow) and wraps long titles', () => {
    const maxW = 900, avg = 0.56;
    for (const title of ['Coffee', 'An Inspiring Quote About Growth', 'The quick brown fox jumps over the lazy dog again and again']) {
      const { lines, size } = fitHeadline(title, maxW, 140, avg);
      expect(size).toBeGreaterThan(0);
      for (const ln of lines) expect(ln.length * size * avg).toBeLessThanOrEqual(maxW + 0.5);
    }
    // A long title must wrap onto more than one line rather than shrink to nothing.
    expect(fitHeadline('An Inspiring Quote About Growth', maxW, 140).lines.length).toBeGreaterThan(1);
    expect(fitHeadline('Coffee', maxW, 140).lines.length).toBe(1);
  });

  it('the generated headline text fits the canvas width', () => {
    const d = promptToDesign('An inspiring quote about growth', { format: fmt });
    const head = d.elements.find((e) => e.type === 'text') as { text: string; size: number } | undefined;
    expect(head).toBeTruthy();
    const longest = Math.max(...head!.text.replace(/[“”]/g, '').split('\n').map((s) => s.length));
    expect(longest * head!.size * 0.56).toBeLessThanOrEqual(1080 - 1080 * 0.16 + 1);
  });

  it('applies the brand palette and fonts when a kit is given', () => {
    const brand: BrandKit = { id: 'b', name: 'Acme', colors: ['#123456', '#abcdef'], fonts: { heading: 'Poppins', body: 'Lato' } };
    const d = promptToDesign('Hello world', { format: fmt, brand });
    expect(d.background).toBe('#123456');
    const head = d.elements.find((e) => e.type === 'text') as { font: string } | undefined;
    expect(head?.font).toBe('Poppins');
  });

  it('shade lightens toward white and darkens toward black', () => {
    expect(shade('#808080', 1)).toBe('#ffffff');
    expect(shade('#808080', -1)).toBe('#000000');
    expect(shade('#808080', 0)).toBe('#808080');
  });

  it('a chosen background preset overrides the auto colour and stays readable', () => {
    const d = promptToDesign('Summer sale 30% off', { format: fmt, bgId: 'midnight' });
    expect(d.background).toBe('#0f172a');
    const head = d.elements.find((e) => e.type === 'text') as { color: string } | undefined;
    expect(head?.color).toBe(contrastText('#0f172a')); // white on dark
    // A decorative preset adds background accent shapes; a "plain" one doesn't.
    const ellipses = d.elements.filter((e) => e.type === 'ellipse').length;
    expect(ellipses).toBeGreaterThan(0);
    expect(promptToDesign('Summer sale', { format: fmt, bgId: 'solid-dark' }).elements.filter((e) => e.type === 'ellipse')).toHaveLength(0);
    expect(promptBgById('nope').id).toBe('auto'); // unknown → auto
    expect(PROMPT_BACKGROUNDS.length).toBeGreaterThan(4);
  });
});
