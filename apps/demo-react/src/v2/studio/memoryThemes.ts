/**
 * Memory-video themes — one-tap "looks designed" presets that set the pace,
 * transition and a matching built-in music mood for common occasions. Pure data;
 * the modal applies a theme to its controls and generates the mood's music.
 */
import type { SlideTransition } from './slideshow.js';

export interface MemoryTheme {
  id: string;
  label: string;
  icon: string;
  transition: SlideTransition;
  /** Seconds per photo. */
  perPhotoSec: number;
  /** Built-in music mood id (see musicGen.ts), or null for none. */
  music: string | null;
  note?: string;
}

export const MEMORY_THEMES: MemoryTheme[] = [
  { id: 'classic', label: 'Classic', icon: '🎞️', transition: 'cross', perPhotoSec: 2.5, music: 'soft-piano', note: 'Gentle fades + soft piano' },
  { id: 'wedding', label: 'Wedding', icon: '💍', transition: 'cross', perPhotoSec: 3.5, music: 'calm', note: 'Slow, elegant, warm' },
  { id: 'birthday', label: 'Birthday', icon: '🎂', transition: 'slide', perPhotoSec: 2, music: 'celebration', note: 'Snappy & fun' },
  { id: 'travel', label: 'Travel', icon: '✈️', transition: 'slide', perPhotoSec: 2.2, music: 'uplifting', note: 'Energetic slideshow' },
  { id: 'baby', label: 'Baby', icon: '🍼', transition: 'cross', perPhotoSec: 3, music: 'soft-piano', note: 'Soft & tender' },
  { id: 'chill', label: 'Chill', icon: '🌆', transition: 'cross', perPhotoSec: 2.8, music: 'lofi', note: 'Relaxed lo-fi vibe' },
];

export const memoryThemeById = (id: string): MemoryTheme | undefined => MEMORY_THEMES.find((t) => t.id === id);
