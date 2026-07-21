import { describe, it, expect } from 'vitest';
import { autoColumns, collageCells, coverCrop, presetCells } from './collage.js';

describe('collage layout', () => {
  it('chooses sensible column counts', () => {
    expect(autoColumns(1)).toBe(1);
    expect(autoColumns(4)).toBe(2);
    expect(autoColumns(6)).toBe(3);
    expect(autoColumns(12)).toBe(4);
  });
  it('lays cells in a grid within the canvas, respecting gaps', () => {
    const cells = collageCells(4, 2, 1000, 1000, 20);
    expect(cells.length).toBe(4);
    expect(cells[0]).toEqual({ x: 20, y: 20, w: 470, h: 470 });
    // last cell stays inside the canvas
    const last = cells[3]!;
    expect(last.x + last.w).toBeLessThanOrEqual(1000);
    expect(last.y + last.h).toBeLessThanOrEqual(1000);
  });
  it('cover-crops preserving aspect (centered)', () => {
    const c = coverCrop(1000, 500, 200, 200); // wide source into square → crop sides
    expect(Math.round(c.sw)).toBe(500);
    expect(Math.round(c.sh)).toBe(500);
    expect(Math.round(c.sx)).toBe(250);
    expect(c.sy).toBe(0);
  });

  it('layout presets place the right number of cells, all inside the canvas', () => {
    const W = 1000, H = 1000, gap = 10;
    for (const p of ['grid', 'featured-left', 'featured-top', 'row', 'column'] as const) {
      const cells = presetCells(p, 5, W, H, gap, 3);
      expect(cells.length).toBe(5);
      for (const c of cells) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.x + c.w).toBeLessThanOrEqual(W + 0.001);
        expect(c.y + c.h).toBeLessThanOrEqual(H + 0.001);
        expect(c.w).toBeGreaterThan(0); expect(c.h).toBeGreaterThan(0);
      }
    }
  });
  it('featured-left makes the first cell tall (the hero)', () => {
    const cells = presetCells('featured-left', 4, 1000, 1000, 10, 3);
    expect(cells[0]!.h).toBeGreaterThan(cells[1]!.h); // hero taller than the side tiles
  });
  it('a single photo fills the canvas regardless of preset', () => {
    expect(presetCells('featured-left', 1, 800, 600, 10, 3)).toEqual([{ x: 10, y: 10, w: 780, h: 580 }]);
  });
});
