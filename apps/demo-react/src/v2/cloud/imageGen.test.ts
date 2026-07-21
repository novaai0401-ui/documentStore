import { describe, it, expect, beforeEach } from 'vitest';
import { buildImageRequest, parseImageResponse } from './imageGen.js';
import { memKv } from '../persist/kv.js';
import { configureAiStore, isConfigured, getAiImageConfig, setAiImageConfig, clearAiImageConfig } from './aiConfig.js';

const cfg = { endpoint: 'https://api.example.com/v1/', apiKey: 'sk-test', model: 'gpt-image-1' };

describe('imageGen request/response', () => {
  it('builds an OpenAI-style request (trimming trailing slashes)', () => {
    const { url, init } = buildImageRequest(cfg, { prompt: 'a red fox', size: '1024x1024' });
    expect(url).toBe('https://api.example.com/v1/images/generations');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: 'gpt-image-1', prompt: 'a red fox', size: '1024x1024', n: 1 });
  });

  it('parses base64 images into data URLs', () => {
    const urls = parseImageResponse({ data: [{ b64_json: 'AAAA' }, { b64_json: 'BBBB' }] });
    expect(urls).toEqual(['data:image/png;base64,AAAA', 'data:image/png;base64,BBBB']);
  });
  it('passes through hosted URLs', () => {
    expect(parseImageResponse({ data: [{ url: 'https://img/x.png' }] })).toEqual(['https://img/x.png']);
  });
  it('throws on malformed or empty responses', () => {
    expect(() => parseImageResponse({})).toThrow();
    expect(() => parseImageResponse({ data: [] })).toThrow();
  });
});

describe('aiConfig store', () => {
  beforeEach(() => configureAiStore(memKv()));
  it('validates that all fields are present', () => {
    expect(isConfigured(undefined)).toBe(false);
    expect(isConfigured({ endpoint: 'x', apiKey: '', model: 'm' })).toBe(false);
    expect(isConfigured(cfg)).toBe(true);
  });
  it('persists and clears config', async () => {
    await setAiImageConfig(cfg);
    expect(await getAiImageConfig()).toEqual(cfg);
    await clearAiImageConfig();
    expect(await getAiImageConfig()).toBeUndefined();
  });
});
