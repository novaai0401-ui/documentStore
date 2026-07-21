import { describe, it, expect } from 'vitest';
import { evaluateSheet, isFormula } from './formula.js';

describe('spreadsheet formulas', () => {
  it('detects formulas', () => {
    expect(isFormula('=A1')).toBe(true);
    expect(isFormula('10')).toBe(false);
  });

  it('evaluates SUM over a range (A1 = top-left, row 1)', () => {
    const out = evaluateSheet([['10'], ['20'], ['30'], ['=SUM(A1:A3)']]);
    expect(out[3]![0]).toBe('60');
  });

  it('evaluates arithmetic across columns', () => {
    const out = evaluateSheet([['4', '5', '=A1*B1'], ['2', '3', '=A2+B2']]);
    expect(out[0]![2]).toBe('20');
    expect(out[1]![2]).toBe('5');
  });

  it('chains formulas and leaves non-formula text alone', () => {
    const out = evaluateSheet([['Label', '7'], ['', '=B1*2'], ['', '=B2+1']]);
    expect(out[0]![0]).toBe('Label');
    expect(out[1]![1]).toBe('14');
    expect(out[2]![1]).toBe('15');
  });

  it('guards against cycles without throwing', () => {
    const out = evaluateSheet([['=A2'], ['=A1']]);
    expect(out[0]![0]).toMatch(/#(CYCLE|ERROR)/);
  });
});

import { columnStats } from './formula.js';

describe('columnStats', () => {
  it('aggregates numeric columns and ignores text ones', () => {
    const grid = [['Region', 'Sales'], ['East', '100'], ['West', '250'], ['North', '175']];
    const stats = columnStats(grid);
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ header: 'Sales', count: 3, sum: 525, min: 100, max: 250 });
    expect(stats[0]!.avg).toBeCloseTo(175, 5);
  });
  it('returns nothing when no numeric data', () => {
    expect(columnStats([['a', 'b'], ['x', 'y']])).toEqual([]);
  });
});
