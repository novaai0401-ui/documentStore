import { describe, it, expect } from 'vitest';
import { AI_PROVIDERS, CUSTOM_PROVIDER_ID, providerById, detectProvider, providerDoesImages } from './providers.js';

describe('AI providers catalog', () => {
  it('offers OpenAI plus non-OpenAI keys (Groq, Together, …) and a custom escape hatch', () => {
    const ids = AI_PROVIDERS.map((p) => p.id);
    expect(ids).toContain('openai');
    expect(ids).toContain('groq');
    expect(ids).toContain('together');
    expect(ids).toContain(CUSTOM_PROVIDER_ID);
    expect(new Set(ids).size).toBe(ids.length); // unique
    for (const p of AI_PROVIDERS) expect(p.label.length).toBeGreaterThan(0);
  });

  it('every non-custom provider has a valid https/http base URL', () => {
    for (const p of AI_PROVIDERS) {
      if (p.id === CUSTOM_PROVIDER_ID) continue;
      expect(() => new URL(p.endpoint)).not.toThrow();
    }
  });

  it('image-capable providers list image models; text-only ones do not', () => {
    expect(providerById('openai')!.images.length).toBeGreaterThan(0);
    expect(providerById('together')!.images.length).toBeGreaterThan(0);
    expect(providerById('groq')!.images).toHaveLength(0);
    expect(providerById('mistral')!.images).toHaveLength(0);
  });

  it('providerDoesImages reflects capability, treating custom as "let them try"', () => {
    expect(providerDoesImages('openai')).toBe(true);
    expect(providerDoesImages('groq')).toBe(false);
    expect(providerDoesImages(CUSTOM_PROVIDER_ID)).toBe(true);
    expect(providerDoesImages('nonsense')).toBe(true);
  });

  it('detectProvider maps a saved endpoint back to its provider', () => {
    expect(detectProvider('https://api.openai.com/v1')).toBe('openai');
    expect(detectProvider('https://api.groq.com/openai/v1')).toBe('groq');
    expect(detectProvider('https://my-proxy.example.com/v1')).toBe(CUSTOM_PROVIDER_ID);
    expect(detectProvider('')).toBe(CUSTOM_PROVIDER_ID);
  });

  it('local providers are keyless', () => {
    expect(providerById('ollama')!.keyless).toBe(true);
    expect(providerById('lmstudio')!.keyless).toBe(true);
    expect(providerById('openai')!.keyless).toBeFalsy();
  });
});
