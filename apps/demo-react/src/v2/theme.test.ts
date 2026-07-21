import { describe, it, expect } from 'vitest';
import { nextChoice, resolveTheme } from './theme.js';

describe('theme helpers', () => {
  it('cycles light → dark → system → light', () => {
    expect(nextChoice('light')).toBe('dark');
    expect(nextChoice('dark')).toBe('system');
    expect(nextChoice('system')).toBe('light');
  });

  it('resolves explicit choices regardless of OS', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the OS when set to system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});
