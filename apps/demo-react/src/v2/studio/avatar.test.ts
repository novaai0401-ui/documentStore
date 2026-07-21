import { describe, it, expect } from 'vitest';
import { buildAvatarSvg, randomAvatar, DEFAULT_AVATAR, AVATAR_OPTIONS, type AvatarOptions } from './avatar.js';

/** Tiny deterministic PRNG so randomAvatar is reproducible in tests. */
const seeded = (s: number) => () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

describe('avatar builder', () => {
  it('builds a well-formed SVG from the defaults', () => {
    const svg = buildAvatarSvg(DEFAULT_AVATAR);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('viewBox="0 0 200 200"');
    expect(svg).toContain(DEFAULT_AVATAR.bg);   // background colour present
    expect(svg).toContain(DEFAULT_AVATAR.skin); // skin colour present
  });

  it('every single option value renders without throwing and stays well-formed', () => {
    for (const dim of AVATAR_OPTIONS) {
      for (const ch of dim.choices) {
        const opts = { ...DEFAULT_AVATAR, [dim.key]: ch.id } as AvatarOptions;
        const svg = buildAvatarSvg(opts);
        expect(svg.match(/<svg/g)!.length).toBe(1);
        expect(svg.match(/<\/svg>/g)!.length).toBe(1);
      }
    }
  });

  it('randomAvatar is deterministic for a given seed and always valid', () => {
    const a = randomAvatar(seeded(42));
    const b = randomAvatar(seeded(42));
    expect(a).toEqual(b);
    const keys = AVATAR_OPTIONS.map((d) => d.key);
    for (const k of keys) expect(a[k]).toBeTruthy();
    // The produced options render.
    expect(buildAvatarSvg(a)).toContain('<svg');
  });
});
