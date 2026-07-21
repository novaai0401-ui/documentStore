import { describe, it, expect } from 'vitest';
import { collectTexts, applyTexts, translateDesign } from './translateDesign.js';
import { blankDesign, formatById, type Design } from './model.js';

const design = (): Design => ({ ...blankDesign(formatById('ig-post')), elements: [
  { id: 't1', type: 'text', x: 0, y: 0, w: 10, h: 10, text: 'Hello', size: 40, color: '#000', font: 'Inter', weight: 700, align: 'left' },
  { id: 'r', type: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#000' },
  { id: 't2', type: 'text', x: 0, y: 0, w: 10, h: 10, text: 'World', size: 20, color: '#000', font: 'Inter', weight: 400, align: 'left' },
  { id: 't3', type: 'text', x: 0, y: 0, w: 10, h: 10, text: '   ', size: 20, color: '#000', font: 'Inter', weight: 400, align: 'left' },
] });

describe('translateDesign', () => {
  it('collects only non-empty text element strings, in order', () => {
    const { ids, texts } = collectTexts(design());
    expect(ids).toEqual(['t1', 't2']);
    expect(texts).toEqual(['Hello', 'World']);
  });

  it('applies replacements by id, leaving non-text and layout intact', () => {
    const out = applyTexts(design(), ['t1', 't2'], ['Hola', 'Mundo']);
    expect((out.elements[0] as { text: string }).text).toBe('Hola');
    expect((out.elements[2] as { text: string }).text).toBe('Mundo');
    expect(out.elements[1]!.type).toBe('rect');
    expect(out.elements[0]!.x).toBe(0); // layout preserved
  });

  it('translates every text element via a LineTranslator', async () => {
    const upper = async (lines: string[]) => lines.map((l) => l.toUpperCase());
    const out = await translateDesign(design(), upper);
    expect((out.elements[0] as { text: string }).text).toBe('HELLO');
    expect((out.elements[2] as { text: string }).text).toBe('WORLD');
  });

  it('keeps the original line when the translator drops one', async () => {
    const dropper = async () => ['Hola']; // returns fewer than asked
    const out = await translateDesign(design(), dropper);
    expect((out.elements[0] as { text: string }).text).toBe('Hola');
    expect((out.elements[2] as { text: string }).text).toBe('World'); // fallback to original
  });

  it('returns the design unchanged when there is no text', async () => {
    const d: Design = { ...blankDesign(formatById('ig-post')), elements: [{ id: 'r', type: 'rect', x: 0, y: 0, w: 1, h: 1, fill: '#000' }] };
    const out = await translateDesign(d, async (l) => l.map(() => 'X'));
    expect(out).toBe(d);
  });
});
