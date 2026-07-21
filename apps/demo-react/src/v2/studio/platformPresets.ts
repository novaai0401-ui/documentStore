/**
 * Export presets for the platforms people actually post to. Each preset is just
 * the right shape + resolution for a destination, so a non-technical user picks
 * "YouTube Shorts" instead of reasoning about 9:16 and 1080p. Pure data +
 * lookups (unit-tested); the modal maps a preset onto its aspect/quality state.
 */
import type { VideoAspect } from './video.js';

export interface PlatformPreset {
  id: string;
  /** Shown in the dropdown. */
  label: string;
  /** Emoji so the list scans fast. */
  icon: string;
  aspect: VideoAspect;
  /** Longest-side pixels for the export (see video.ts `outputDims`): 1920 gives
   *  a 1080p video (1080×1920 vertical, 1920×1080 wide, 1080 for square). */
  maxW: number;
  /** One-line hint (where it fits / typical length). */
  note?: string;
}

/** Ordered by how people use them: vertical short-form first, then square, wide, custom. */
export const PLATFORM_PRESETS: PlatformPreset[] = [
  { id: 'yt-shorts', label: 'YouTube Shorts', icon: '▶️', aspect: '9:16', maxW: 1920, note: 'Vertical 1080×1920, up to 60s' },
  { id: 'ig-reel', label: 'Instagram Reel', icon: '📸', aspect: '9:16', maxW: 1920, note: 'Vertical 1080×1920, up to 90s' },
  { id: 'tiktok', label: 'TikTok', icon: '🎵', aspect: '9:16', maxW: 1920, note: 'Vertical 1080×1920' },
  { id: 'fb-reel', label: 'Facebook Reel', icon: '👍', aspect: '9:16', maxW: 1920, note: 'Vertical 1080×1920' },
  { id: 'wa-status', label: 'WhatsApp Status', icon: '💬', aspect: '9:16', maxW: 1280, note: 'Vertical 720×1280, up to 30s' },
  { id: 'ig-post', label: 'Instagram Post', icon: '⬛', aspect: '1:1', maxW: 1080, note: 'Square 1080×1080' },
  { id: 'fb-feed', label: 'Facebook Feed', icon: '📘', aspect: '1:1', maxW: 1080, note: 'Square 1080×1080' },
  { id: 'yt-video', label: 'YouTube video', icon: '📺', aspect: '16:9', maxW: 1920, note: 'Widescreen 1920×1080' },
  { id: 'x-twitter', label: 'X / Twitter', icon: '𝕏', aspect: '16:9', maxW: 1280, note: 'Widescreen' },
  { id: 'original', label: 'Keep original shape', icon: '🎬', aspect: 'source', maxW: 1920, note: 'Same shape as your video' },
];

export const platformPresetById = (id: string): PlatformPreset | undefined =>
  PLATFORM_PRESETS.find((p) => p.id === id);

/** Best-effort match of an aspect+quality pair back to a preset id (falls back
 *  to 'custom' when the user has hand-tweaked to something off-menu). */
export function matchPreset(aspect: VideoAspect, maxW: number): string {
  const hit = PLATFORM_PRESETS.find((p) => p.aspect === aspect && p.maxW === maxW);
  return hit ? hit.id : 'custom';
}
