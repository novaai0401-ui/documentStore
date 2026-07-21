import { describe, it, expect } from 'vitest';
import { computeTotalsRow } from './sheetOps.js';

describe('computeTotalsRow', () => {
  it('sums numeric columns, skips the header, labels the first column', () => {
    const rows = [['Item', 'Q1', 'Q2'], ['A', '10', '5'], ['B', '20', '8']];
    expect(computeTotalsRow(rows)).toEqual(['Total', '30', '13']);
  });
  it('leaves non-numeric columns blank and tolerates thousands separators', () => {
    const rows = [['Name', 'Amount'], ['x', '1,000'], ['y', '2,500']];
    expect(computeTotalsRow(rows)).toEqual(['Total', '3500']);
  });
  it('keeps an existing first-column value instead of overwriting with "Total"', () => {
    const rows = [['n'], ['1'], ['2']];
    // single numeric column → first column is the numeric one, gets the sum
    expect(computeTotalsRow(rows)).toEqual(['3']);
  });
  it('returns null when there is nothing numeric to total', () => {
    expect(computeTotalsRow([['a', 'b'], ['x', 'y']])).toBeNull();
  });
});
