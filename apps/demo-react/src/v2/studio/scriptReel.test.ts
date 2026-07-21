import { describe, it, expect } from 'vitest';
import { SCRIPT_STYLES, scriptStyleById, buildScenes, scenesDuration, sceneAt } from './scriptReel.js';

describe('script → reel scene builder', () => {
  it('offers styles with unique ids and valid gradients', () => {
    const ids = SCRIPT_STYLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SCRIPT_STYLES) {
      expect(s.colors.length).toBeGreaterThanOrEqual(2);
      for (const g of s.colors) expect(g).toHaveLength(2);
    }
    expect(scriptStyleById('nonsense')).toBe(SCRIPT_STYLES[0]);
  });

  it('builds sequential, non-overlapping scenes within the duration bounds', () => {
    const scenes = buildScenes('First line here. A slightly longer second line that says a bit more. Third.', 'bold', { minSec: 2, maxSec: 6 });
    expect(scenes.length).toBeGreaterThanOrEqual(3);
    expect(scenes[0]!.startS).toBe(0);
    for (let i = 1; i < scenes.length; i++) expect(scenes[i]!.startS).toBeCloseTo(scenes[i - 1]!.endS, 5);
    for (const s of scenes) {
      const dur = s.endS - s.startS;
      expect(dur).toBeGreaterThanOrEqual(2 - 1e-9);
      expect(dur).toBeLessThanOrEqual(6 + 1e-9);
    }
    expect(buildScenes('', 'bold')).toEqual([]);
  });

  it('cycles the style gradients across scenes', () => {
    const scenes = buildScenes('a. b. c. d. e.', 'mono');
    const style = scriptStyleById('mono'); // 2 gradients
    expect(scenes[0]!.bg).toEqual(style.colors[0]);
    expect(scenes[2]!.bg).toEqual(style.colors[0]); // wrapped back around
    expect(scenes[1]!.bg).toEqual(style.colors[1]);
  });

  it('sceneAt returns the active scene and holds the last one past the end', () => {
    const scenes = buildScenes('one. two. three.', 'bold');
    expect(sceneAt(scenes, 0)).toBe(scenes[0]);
    expect(sceneAt(scenes, scenesDuration(scenes) + 5)).toBe(scenes[scenes.length - 1]);
    expect(sceneAt([], 1)).toBeNull();
  });
});
