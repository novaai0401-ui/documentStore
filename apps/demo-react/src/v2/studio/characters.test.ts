import { describe, it, expect, vi } from 'vitest';
import { drawCharacter, CHARACTER_STYLES } from './characters.js';

/** A no-op 2D context that records how many draw calls were issued, so we can
 *  assert the character actually paints (and never throws). */
function mockCtx() {
  const calls = { fill: 0, stroke: 0, path: 0 };
  const noop = () => {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop: string) {
      if (prop === 'fill') return () => { calls.fill++; };
      if (prop === 'stroke') return () => { calls.stroke++; };
      if (prop === 'beginPath') return () => { calls.path++; };
      // numeric-ish props the code assigns to are harmless on a proxy.
      return typeof prop === 'string' && /Style|Width|Cap|Join|Alpha|font|text/i.test(prop) ? '' : vi.fn(noop);
    },
    set() { return true; },
  };
  const ctx = new Proxy({}, handler) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('illustrated characters', () => {
  it('exposes girl & boy palettes', () => {
    expect(CHARACTER_STYLES.girl).toBeTruthy();
    expect(CHARACTER_STYLES.boy).toBeTruthy();
    for (const st of Object.values(CHARACTER_STYLES)) {
      expect(st.skin).toMatch(/^#/); expect(st.hair).toMatch(/^#/); expect(st.outfit).toMatch(/^#/);
    }
  });

  it('draws a girl and a boy without throwing, issuing many paint calls', () => {
    for (const type of ['girl', 'boy'] as const) {
      const { ctx, calls } = mockCtx();
      expect(() => drawCharacter(ctx, { x: 100, y: 100, size: 200, t: 0.5, type })).not.toThrow();
      expect(calls.fill + calls.stroke).toBeGreaterThan(8); // head, body, legs, arms, face…
    }
  });

  it('skips drawing entirely when reveal is 0 (pop-in not started)', () => {
    const { ctx, calls } = mockCtx();
    drawCharacter(ctx, { x: 0, y: 0, size: 100, t: 0, type: 'girl', reveal: 0 });
    expect(calls.fill + calls.stroke).toBe(0);
  });
});
