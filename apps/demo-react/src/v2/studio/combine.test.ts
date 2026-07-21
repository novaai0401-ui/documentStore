import { describe, it, expect } from 'vitest';
import { moveItem } from './CombineModal.js';

describe('moveItem', () => {
  it('moves an item up and down', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('is a no-op at the boundaries and returns the original array', () => {
    const arr = ['a', 'b', 'c'];
    expect(moveItem(arr, 0, -1)).toBe(arr);
    expect(moveItem(arr, 2, 1)).toBe(arr);
  });
});
