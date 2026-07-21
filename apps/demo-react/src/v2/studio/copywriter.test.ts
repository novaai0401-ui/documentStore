import { describe, it, expect } from 'vitest';
import { titleCase, keywords, headlines, hashtags, caption, rewrite, fitToLength } from './copywriter.js';

describe('copywriter', () => {
  it('title-cases with small words lowercased mid-phrase', () => {
    expect(titleCase('the future of design')).toBe('The Future of Design');
    expect(titleCase('HELLO world')).toBe('Hello World');
  });

  it('extracts salient keywords without stopwords or dupes', () => {
    expect(keywords('The new coffee shop for coffee lovers')).toEqual(['coffee', 'shop', 'lovers']);
  });

  it('generates distinct headlines containing the topic', () => {
    const hs = headlines('Coffee Shop', 5);
    expect(hs).toHaveLength(5);
    expect(new Set(hs).size).toBe(5); // all distinct
    expect(hs.every((h) => /Coffee Shop/i.test(h))).toBe(true);
  });

  it('builds CamelCase hashtags from keywords', () => {
    expect(hashtags('summer sale event', 3)).toEqual(['#Summer', '#Sale', '#Event']);
  });

  it('writes a caption with optional emoji and tags', () => {
    const c = caption('Summer Sale', { emoji: true });
    expect(c.startsWith('✨')).toBe(true);
    expect(c).toContain('#Summer');
    expect(caption('Summer Sale', { tags: false })).not.toContain('#');
  });

  it('rewrites in each mode', () => {
    expect(rewrite('hello world', 'upper')).toBe('HELLO WORLD');
    expect(rewrite('the future of design', 'title')).toBe('The Future of Design');
    expect(rewrite('this is really just very good.', 'punchier')).toBe('This is good!');
    expect(rewrite('Buy now', 'longer')).toContain('Buy now');
    expect(rewrite('', 'shorter')).toBe('');
  });

  it('fits text to a max length on a word boundary', () => {
    expect(fitToLength('short', 20)).toBe('short');
    const f = fitToLength('the quick brown fox jumps over the lazy dog', 20);
    expect(f.length).toBeLessThanOrEqual(20);
    expect(f.endsWith('…')).toBe(true);
  });
});
