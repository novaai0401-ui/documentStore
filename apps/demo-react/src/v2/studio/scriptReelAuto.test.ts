import { describe, it, expect } from 'vitest';
import { autoGradientFor, buildScenes, SCRIPT_STYLES } from './scriptReel.js';

describe('autoGradientFor (content-matched background)', () => {
  it('picks distinct palettes for different moods', () => {
    const love = autoGradientFor('I will love you forever, my dear', 0);
    const success = autoGradientFor('3 habits to grow your business and win', 0);
    const calm = autoGradientFor('breathe, relax and find peace this morning', 0);
    expect(love).not.toEqual(success);
    expect(success).not.toEqual(calm);
    // love → warm pink family
    expect(love[0].toLowerCase()).toMatch(/^#(83|9d|6d)/);
  });

  it('falls back to a default palette for neutral text', () => {
    const a = autoGradientFor('the quick report for tuesday', 0);
    const b = autoGradientFor('another neutral sentence here', 0);
    expect(a).toEqual(b); // same default, same index
  });

  it('varies the shade by scene index within one mood', () => {
    const g0 = autoGradientFor('love and hearts', 0);
    const g1 = autoGradientFor('love and hearts', 1);
    expect(g0).not.toEqual(g1);
  });
});

describe("buildScenes 'auto' style", () => {
  it('assigns each scene a background from its own words', () => {
    const script = 'I love you forever.\nLet us grow our business and win.';
    const scenes = buildScenes(script, 'auto');
    expect(scenes.length).toBe(2);
    expect(scenes[0]!.bg).toEqual(autoGradientFor(scenes[0]!.text, 0));
    expect(scenes[1]!.bg).toEqual(autoGradientFor(scenes[1]!.text, 1));
    expect(scenes[0]!.bg).not.toEqual(scenes[1]!.bg); // love vs success
  });

  it("'auto' is offered as the first style option", () => {
    expect(SCRIPT_STYLES[0]!.id).toBe('auto');
  });

  it('a fixed style still cycles its own palette (auto off)', () => {
    const scenes = buildScenes('one line here\nanother line there', 'mono');
    const mono = SCRIPT_STYLES.find((s) => s.id === 'mono')!;
    expect(scenes[0]!.bg).toEqual(mono.colors[0]);
  });
});

describe('decorative backgrounds & frames', () => {
  it('offers sketched/decorative background styles with valid patterns', async () => {
    const { SCRIPT_STYLES: styles } = await import('./scriptReel.js');
    const valid = new Set(['none', 'doodle', 'confetti', 'notebook', 'bokeh', 'stars', 'bubbles']);
    const decorated = styles.filter((s) => s.pattern && s.pattern !== 'none');
    expect(decorated.length).toBeGreaterThanOrEqual(4);
    for (const s of styles) if (s.pattern) expect(valid.has(s.pattern)).toBe(true);
    // The doodle style exists and every style still has colours + a font.
    expect(styles.some((s) => s.id === 'doodle')).toBe(true);
    for (const s of styles) { expect(s.colors.length).toBeGreaterThan(0); expect(s.font.length).toBeGreaterThan(0); }
  });

  it('offers unique frame options including none', async () => {
    const { SCRIPT_FRAMES } = await import('./scriptReel.js');
    const ids = SCRIPT_FRAMES.map((f) => f.id);
    expect(ids).toContain('none');
    expect(ids.length).toBeGreaterThanOrEqual(4);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
