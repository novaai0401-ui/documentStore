import { describe, it, expect } from 'vitest';
import { moveLayer, elementLabel, designToSvg, type Element, type Design } from './model.js';

const els = (): Element[] => [
  { id: 'a', type: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#000' },
  { id: 'b', type: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#111' },
  { id: 'c', type: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#222' },
];
const ids = (a: Element[]) => a.map((e) => e.id).join('');

describe('layers / z-order', () => {
  it('moves an element forward and backward by one', () => {
    expect(ids(moveLayer(els(), 'a', 'forward'))).toBe('bac');
    expect(ids(moveLayer(els(), 'c', 'backward'))).toBe('acb');
  });
  it('jumps to front and back', () => {
    expect(ids(moveLayer(els(), 'a', 'front'))).toBe('bca');
    expect(ids(moveLayer(els(), 'c', 'back'))).toBe('cab');
  });
  it('is a no-op at the edges and for unknown ids', () => {
    expect(ids(moveLayer(els(), 'c', 'forward'))).toBe('abc');
    expect(ids(moveLayer(els(), 'a', 'backward'))).toBe('abc');
    expect(ids(moveLayer(els(), 'zzz', 'front'))).toBe('abc');
  });
  it('does not mutate the input array', () => {
    const original = els();
    moveLayer(original, 'a', 'front');
    expect(ids(original)).toBe('abc');
  });

  it('labels elements sensibly', () => {
    expect(elementLabel({ id: '1', type: 'text', x: 0, y: 0, w: 1, h: 1, text: 'Hello world this is long', size: 10, color: '#000', font: 'Inter', weight: 400, align: 'left' })).toBe('Hello world this is long');
    expect(elementLabel({ id: '2', type: 'text', x: 0, y: 0, w: 1, h: 1, text: '   ', size: 10, color: '#000', font: 'Inter', weight: 400, align: 'left' })).toBe('Text');
    expect(elementLabel({ id: '3', type: 'image', x: 0, y: 0, w: 1, h: 1, href: 'x', name: 'Logo' })).toBe('Logo');
    expect(elementLabel({ id: '4', type: 'ellipse', x: 0, y: 0, w: 1, h: 1, fill: '#000' })).toBe('Ellipse');
  });

  it('omits hidden elements from the rendered SVG', () => {
    const d: Design = { w: 100, h: 100, background: '#fff', elements: [
      { id: 'a', type: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#abcdef' },
      { id: 'b', type: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#123456', hidden: true },
    ] };
    const svg = designToSvg(d);
    expect(svg).toContain('#abcdef');
    expect(svg).not.toContain('#123456');
  });
});
