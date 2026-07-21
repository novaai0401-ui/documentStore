import { describe, it, expect } from 'vitest';
import { designToEntries, entriesToDesign, changedEntries } from './collabDesign.js';
import type { Design } from './model.js';

const design: Design = {
  w: 1080, h: 1080, background: '#0f172a',
  elements: [
    { id: 'a', type: 'rect', x: 10, y: 20, w: 100, h: 50, fill: '#fff', radius: 8 },
    { id: 'b', type: 'text', x: 0, y: 0, w: 200, h: 40, text: 'Hi', size: 24, color: '#fff', font: 'Inter', weight: 700, align: 'left' },
    { id: 'c', type: 'image', x: 5, y: 5, w: 80, h: 80, href: 'data:image/png;base64,AAAA', radius: 0 },
  ],
};

describe('collabDesign', () => {
  it('round-trips a design (including the image href) through entries', () => {
    const entries = designToEntries(design);
    expect(entries['el:c']).toContain('data:image/png;base64,AAAA'); // image travels
    const back = entriesToDesign(entries);
    expect(back).toEqual(design);
  });

  it('re-serializing a round-tripped design yields identical entries (no echo)', () => {
    const e1 = designToEntries(design);
    const e2 = designToEntries(entriesToDesign(e1));
    expect(e2).toEqual(e1);
  });

  it('drops elements removed from order even if a stale el: key lingers (LWW has no delete)', () => {
    const entries = designToEntries(design);
    entries.order = JSON.stringify(['a', 'b']); // 'c' removed from order; el:c remains
    const back = entriesToDesign(entries);
    expect(back.elements.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('changedEntries reports only what moved', () => {
    const prev = designToEntries(design);
    const moved = entriesToDesign(prev);
    moved.elements[0]!.x = 999;
    const cur = designToEntries(moved);
    const diff = changedEntries(prev, cur);
    expect(Object.keys(diff)).toEqual(['el:a']); // only the moved element
  });
});
