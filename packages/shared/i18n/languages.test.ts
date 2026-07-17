import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_LANGUAGE,
  getLanguageDirection,
  getLanguageFontFamilyKey,
  isRtlLanguage,
  isSupportedLanguage,
  resolveInitialLanguage,
  RTL_LANGUAGES,
  SUPPORTED_LANGUAGES,
} from './languages';

describe('language constants', () => {
  test('supports exactly the five grant languages with Catalan as default', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['ca', 'es', 'en', 'ar', 'fa']);
    expect(DEFAULT_LANGUAGE).toBe('ca');
  });

  test('Arabic and Farsi are the RTL languages', () => {
    expect(RTL_LANGUAGES).toEqual(['ar', 'fa']);
  });
});

describe('isSupportedLanguage', () => {
  test('accepts each supported language', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      expect(isSupportedLanguage(language)).toBe(true);
    }
  });

  test('rejects unsupported languages', () => {
    expect(isSupportedLanguage('fr')).toBe(false);
    expect(isSupportedLanguage('')).toBe(false);
  });
});

describe('isRtlLanguage / getLanguageDirection', () => {
  test('flips to rtl for Arabic and Farsi', () => {
    expect(isRtlLanguage('ar')).toBe(true);
    expect(isRtlLanguage('fa')).toBe(true);
    expect(getLanguageDirection('ar')).toBe('rtl');
    expect(getLanguageDirection('fa')).toBe('rtl');
  });

  test('stays ltr for Catalan, Spanish, and English', () => {
    for (const language of ['ca', 'es', 'en']) {
      expect(isRtlLanguage(language)).toBe(false);
      expect(getLanguageDirection(language)).toBe('ltr');
    }
  });
});

describe('getLanguageFontFamilyKey', () => {
  test('Arabic and Farsi map to their bundled script fonts, the rest to sans', () => {
    expect(getLanguageFontFamilyKey('ar')).toBe('arabic');
    expect(getLanguageFontFamilyKey('fa')).toBe('farsi');
    expect(getLanguageFontFamilyKey('ca')).toBe('sans');
    expect(getLanguageFontFamilyKey('en')).toBe('sans');
  });
});

describe('resolveInitialLanguage', () => {
  test('a persisted supported language wins over everything', () => {
    expect(resolveInitialLanguage({ persistedLanguage: 'ar', deviceLanguages: ['es-ES'] })).toBe(
      'ar',
    );
  });

  test('an unsupported persisted value is ignored in favor of the device language', () => {
    expect(resolveInitialLanguage({ persistedLanguage: 'fr', deviceLanguages: ['en-US'] })).toBe(
      'en',
    );
  });

  test('device languages match on the primary subtag, first supported wins', () => {
    expect(
      resolveInitialLanguage({ persistedLanguage: null, deviceLanguages: ['fr-FR', 'fa-IR'] }),
    ).toBe('fa');
  });

  test('falls back to Catalan when nothing matches', () => {
    expect(resolveInitialLanguage({ persistedLanguage: null, deviceLanguages: ['de-DE'] })).toBe(
      'ca',
    );
    expect(resolveInitialLanguage({ persistedLanguage: null, deviceLanguages: [] })).toBe('ca');
  });
});
