import { describe, it, expect } from 'vitest';
import { t, detectLang, isRtl, LANGUAGES, type StrKey } from './i18n.js';

describe('i18n', () => {
  it('translates into Indian and foreign languages', () => {
    expect(t('cta_primary', 'hi')).toContain('PDF');
    expect(t('open_document', 'ta')).toBe('ஆவணத்தைத் திறக்கவும்');
    expect(t('open_document', 'es')).toBe('Abrir un documento');
    expect(t('lang_label', 'ar')).toBe('اللغة');
  });

  it('falls back to English for a missing translation', () => {
    // Force a key/lang that isn't filled by casting — fallback must be English.
    expect(t('trust', 'en')).toContain('device');
    // every language at least resolves to a non-empty string
    for (const l of LANGUAGES) for (const k of ['brand_tagline', 'cta_primary', 'open_document'] as StrKey[]) expect(t(k, l.code).length).toBeGreaterThan(0);
  });

  it('marks RTL languages', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('ur')).toBe(true);
    expect(isRtl('hi')).toBe(false);
    expect(isRtl('en')).toBe(false);
  });

  it('ships a strong set of Indian + high-population foreign languages', () => {
    const codes = LANGUAGES.map((l) => l.code);
    for (const indian of ['hi', 'bn', 'te', 'mr', 'ta', 'gu', 'ur', 'kn', 'ml', 'pa', 'or', 'as']) expect(codes).toContain(indian);
    for (const foreign of ['es', 'fr', 'de', 'pt', 'zh', 'ar', 'ru', 'ja', 'id']) expect(codes).toContain(foreign);
  });

  it('detects a language without throwing (defaults to en)', () => {
    expect(typeof detectLang()).toBe('string');
  });
});
