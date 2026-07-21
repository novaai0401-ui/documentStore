/**
 * Photo collage core — arrange several images into a grid and render a single
 * image, 100% in the browser. Pure layout helpers here (grid geometry, sensible
 * column counts); the Canvas compositing + UI live in CollageModal.
 */

/** A reasonable default column count for a given number of photos. */
export function autoColumns(count: number): number {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

export interface Cell { x: number; y: number; w: number; h: number }

/** Grid cell rectangles for `count` items in `cols` columns within a W×H canvas. */
export function collageCells(count: number, cols: number, W: number, H: number, gap: number): Cell[] {
  const c = Math.max(1, cols);
  const rows = Math.max(1, Math.ceil(count / c));
  const cellW = (W - gap * (c + 1)) / c;
  const cellH = (H - gap * (rows + 1)) / rows;
  const cells: Cell[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % c, row = Math.floor(i / c);
    cells.push({ x: gap + col * (cellW + gap), y: gap + row * (cellH + gap), w: cellW, h: cellH });
  }
  return cells;
}

/** Cover-fit a source w×h into a cell, returning the source crop rect (sx,sy,sw,sh). */
export function coverCrop(srcW: number, srcH: number, cellW: number, cellH: number): { sx: number; sy: number; sw: number; sh: number } {
  const scale = Math.max(cellW / srcW, cellH / srcH);
  const sw = cellW / scale, sh = cellH / scale;
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}

export type CollagePreset = 'grid' | 'featured-left' | 'featured-top' | 'row' | 'column';
export const COLLAGE_PRESETS: { value: CollagePreset; label: string }[] = [
  { value: 'grid', label: 'Grid' },
  { value: 'featured-left', label: 'Featured left' },
  { value: 'featured-top', label: 'Featured top' },
  { value: 'row', label: 'Single row' },
  { value: 'column', label: 'Single column' },
];

/** Cell rectangles for a layout preset. `cols` only applies to the grid preset. */
export function presetCells(preset: CollagePreset, count: number, W: number, H: number, gap: number, cols: number): Cell[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: gap, y: gap, w: W - gap * 2, h: H - gap * 2 }];
  switch (preset) {
    case 'row': return collageCells(count, count, W, H, gap);
    case 'column': return collageCells(count, 1, W, H, gap);
    case 'featured-left': {
      const leftW = (W - gap * 3) / 2;
      const left: Cell = { x: gap, y: gap, w: leftW, h: H - gap * 2 };
      const rightX = gap * 2 + leftW, rightW = W - rightX - gap, rows = count - 1;
      const cellH = (H - gap * (rows + 1)) / rows;
      const cells: Cell[] = [left];
      for (let i = 0; i < rows; i++) cells.push({ x: rightX, y: gap + i * (cellH + gap), w: rightW, h: cellH });
      return cells;
    }
    case 'featured-top': {
      const topH = (H - gap * 3) * 0.62;
      const top: Cell = { x: gap, y: gap, w: W - gap * 2, h: topH };
      const n = count - 1, rowY = gap * 2 + topH, rowH = H - rowY - gap;
      const cellW = (W - gap * (n + 1)) / n;
      const cells: Cell[] = [top];
      for (let i = 0; i < n; i++) cells.push({ x: gap + i * (cellW + gap), y: rowY, w: cellW, h: rowH });
      return cells;
    }
    case 'grid':
    default: return collageCells(count, cols, W, H, gap);
  }
}
