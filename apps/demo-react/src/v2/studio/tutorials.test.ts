import { describe, it, expect } from 'vitest';
import {
  TUTORIALS, TUTORIAL_CATEGORIES, videoEmbedUrl, formatDuration, findTutorials, tutorialForTool,
} from './tutorials.js';

describe('help-center tutorials', () => {
  it('every tutorial is well-formed and useful even without a video', () => {
    expect(TUTORIALS.length).toBeGreaterThanOrEqual(6);
    const ids = new Set<string>();
    for (const t of TUTORIALS) {
      expect(t.id).toBeTruthy(); expect(ids.has(t.id)).toBe(false); ids.add(t.id);
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.emoji.length).toBeGreaterThan(0);
      expect(t.steps.length).toBeGreaterThanOrEqual(2); // steps carry it before a video exists
      expect(TUTORIAL_CATEGORIES).toContain(t.category);
    }
  });

  it('covers the core tools users need to learn', () => {
    const tools = TUTORIALS.map((t) => t.tool);
    for (const tool of ['invitation', 'family', 'photoart', 'prompt', 'reminders', 'reel']) expect(tools).toContain(tool);
    expect(tutorialForTool('family')?.title).toMatch(/family/i);
    expect(tutorialForTool('nope')).toBeUndefined();
  });

  it('builds privacy-friendly embed URLs and rejects malformed sources', () => {
    expect(videoEmbedUrl({ kind: 'youtube', id: 'abcd1234XYZ' })).toEqual({ kind: 'iframe', url: 'https://www.youtube-nocookie.com/embed/abcd1234XYZ?rel=0' });
    expect(videoEmbedUrl({ kind: 'vimeo', id: '123456789' })).toEqual({ kind: 'iframe', url: 'https://player.vimeo.com/video/123456789' });
    expect(videoEmbedUrl({ kind: 'file', src: 'make-a-card.webm' })).toEqual({ kind: 'file', url: '/tutorials/make-a-card.webm', poster: '/tutorials/make-a-card.png' });
    // Path-traversal and bad ids are refused.
    expect(videoEmbedUrl({ kind: 'file', src: '../../secret.mp4' })).toEqual({ kind: 'file', url: '/tutorials/secret.mp4', poster: '/tutorials/secret.png' });
    expect(videoEmbedUrl({ kind: 'youtube', id: 'no' })).toBeNull();
    expect(videoEmbedUrl({ kind: 'vimeo', id: 'abc' })).toBeNull();
  });

  it('formats durations as m:ss', () => {
    expect(formatDuration(62)).toBe('1:02');
    expect(formatDuration(150)).toBe('2:30');
    expect(formatDuration(0)).toBe('');
    expect(formatDuration(undefined)).toBe('');
  });

  it('search filters by text and category', () => {
    expect(findTutorials('photo').every((t) => /photo/i.test(`${t.title} ${t.blurb} ${t.tool}`))).toBe(true);
    expect(findTutorials('', 'Family & photos').every((t) => t.category === 'Family & photos')).toBe(true);
    expect(findTutorials('zzznomatch')).toHaveLength(0);
    expect(findTutorials('').length).toBe(TUTORIALS.length);
  });
});
