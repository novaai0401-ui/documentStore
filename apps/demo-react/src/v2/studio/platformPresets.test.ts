import { describe, it, expect } from 'vitest';
import { PLATFORM_PRESETS, platformPresetById, matchPreset } from './platformPresets.js';

describe('platform export presets', () => {
  it('covers the platforms people post reels to', () => {
    const ids = PLATFORM_PRESETS.map((p) => p.id);
    for (const id of ['yt-shorts', 'ig-reel', 'tiktok', 'fb-reel', 'wa-status', 'yt-video']) {
      expect(ids).toContain(id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('short-form presets are vertical 9:16', () => {
    for (const id of ['yt-shorts', 'ig-reel', 'tiktok', 'fb-reel', 'wa-status']) {
      expect(platformPresetById(id)!.aspect).toBe('9:16');
    }
    expect(platformPresetById('yt-video')!.aspect).toBe('16:9');
    expect(platformPresetById('ig-post')!.aspect).toBe('1:1');
  });

  it('every preset has a label, icon and sane maxW', () => {
    for (const p of PLATFORM_PRESETS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.icon.length).toBeGreaterThan(0);
      expect(p.maxW).toBeGreaterThanOrEqual(480);
      expect(p.maxW).toBeLessThanOrEqual(3840);
    }
  });

  it('matchPreset round-trips a known preset and falls back to custom otherwise', () => {
    expect(matchPreset('9:16', 1920)).toBe('yt-shorts'); // 1080p vertical = 1080×1920
    expect(matchPreset('16:9', 1920)).toBe('yt-video');
    expect(matchPreset('9:16', 999)).toBe('custom');
  });

  it('short-form presets export at 1080p (longest side 1920) so reels aren’t low-res', () => {
    for (const id of ['yt-shorts', 'ig-reel', 'tiktok', 'fb-reel']) {
      expect(platformPresetById(id)!.maxW).toBe(1920);
    }
    expect(platformPresetById('ig-post')!.maxW).toBe(1080); // square 1080×1080
  });
});
