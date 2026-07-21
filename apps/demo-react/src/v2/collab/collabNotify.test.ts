import { describe, it, expect } from 'vitest';
import { shouldNotify } from './collabNotify.js';

describe('collab notification throttle', () => {
  it('allows the first notification and then throttles within the gap', () => {
    expect(shouldNotify(10_000, 0, 8000)).toBe(true);   // 10s since last → ok
    expect(shouldNotify(5_000, 0, 8000)).toBe(false);   // only 5s → throttled
    expect(shouldNotify(8_000, 0, 8000)).toBe(true);    // exactly the gap → ok
  });
});
