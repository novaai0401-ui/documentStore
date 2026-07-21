/**
 * Small, pure spreadsheet operations used by the grid toolbar. Kept out of the
 * component so they're easy to unit-test.
 */

/**
 * Compute a totals row for a grid: each column is summed over the body rows
 * (row 0 is treated as a header and skipped), counting only numeric cells. A
 * column with no numbers stays blank. If any total was produced and the first
 * column is blank, it's labelled "Total". Returns null when there's nothing to
 * total (no numeric data), so callers can no-op.
 */
export function computeTotalsRow(rows: string[][]): string[] | null {
  const cols = Math.max(0, ...rows.map((r) => r.length));
  const out = new Array<string>(cols).fill('');
  let produced = false;
  for (let c = 0; c < cols; c++) {
    let sum = 0, any = false;
    for (let r = 1; r < rows.length; r++) {
      const cell = (rows[r]?.[c] ?? '').trim();
      if (cell === '') continue;
      const n = Number(cell.replace(/,/g, ''));
      if (Number.isFinite(n)) { sum += n; any = true; }
    }
    if (any) { out[c] = String(Number(sum.toFixed(4))); produced = true; }
  }
  if (!produced) return null;
  if (out[0] === '') out[0] = 'Total';
  return out;
}
