import { describe, it, expect } from 'vitest';
import { designToSvg, drawDesignText, type Design, type TextEl } from './model.js';

const textEl = (o: Partial<TextEl> & { text: string }): TextEl => ({
  id: 't1', type: 'text', x: 10, y: 20, w: 80, h: 40, size: 16, color: '#123456',
  font: 'Georgia, serif', weight: 700, align: 'center', rotation: 0, ...o,
});

/** Minimal canvas-2d recorder capturing fillText + transforms. */
function recorder() {
  const fills: { text: string; x: number; y: number }[] = [];
  const ops: string[] = [];
  const ctx = {
    globalAlpha: 1, font: '', fillStyle: '', textAlign: '', textBaseline: '',
    save() { ops.push('save'); }, restore() { ops.push('restore'); },
    scale(x: number, y: number) { ops.push(`scale ${x} ${y}`); },
    translate() { /* */ }, rotate() { ops.push('rotate'); },
    fillText(text: string, x: number, y: number) { fills.push({ text, x, y }); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills, ops };
}

describe('native text rendering for exports (iOS SVG-text fix)', () => {
  it('designToSvg(skipText) omits <text> design elements but keeps shapes', () => {
    const d: Design = { w: 100, h: 100, background: '#fff', elements: [textEl({ text: 'Hi' }), { id: 'r', type: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#000', rotation: 0 }] };
    expect(designToSvg(d)).toContain('<text');            // default: text included
    const skipped = designToSvg(d, undefined, 0.35, true);
    expect(skipped).not.toContain('<text');               // skipText: no design text
    expect(skipped).toContain('<rect');                   // shapes still drawn
  });

  it('drawDesignText draws each line at the SVG-matching baseline', () => {
    const { ctx, fills } = recorder();
    const d: Design = { w: 100, h: 100, background: '#fff', elements: [textEl({ text: 'Line1\nLine2', x: 10, y: 20, size: 16 })] };
    drawDesignText(ctx, d, 1, 1);
    expect(fills.map((f) => f.text)).toEqual(['Line1', 'Line2']);
    // First baseline at y + size; second at + 1.25*size (matches <tspan dy>).
    expect(fills[0]!.y).toBe(20 + 16);
    expect(fills[1]!.y).toBeCloseTo(20 + 16 + 16 * 1.25, 5);
    // Centre-anchored: x at the box centre.
    expect(fills[0]!.x).toBe(10 + 80 / 2);
  });

  it('scales into canvas coordinates and skips hidden/non-text elements', () => {
    const { ctx, fills, ops } = recorder();
    const d: Design = { w: 100, h: 100, background: '#fff', elements: [
      textEl({ id: 'a', text: 'Shown' }),
      textEl({ id: 'b', text: 'Hidden', hidden: true }),
      { id: 'r', type: 'rect', x: 0, y: 0, w: 5, h: 5, fill: '#000', rotation: 0 },
    ] };
    drawDesignText(ctx, d, 2, 3);
    expect(fills.map((f) => f.text)).toEqual(['Shown']); // hidden + rect skipped
    expect(ops).toContain('scale 2 3');
  });
});
