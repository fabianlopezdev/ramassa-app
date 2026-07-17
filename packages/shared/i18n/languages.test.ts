import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_LANGUAGE,
  getLanguageDirection,
  getLanguageFontFamilyKey,
  isRtlLanguage,
  isSupportedLanguage,
  parseAcceptLanguageHeader,
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

describe('parseAcceptLanguageHeader', () => {
  test('returns an empty list for a missing or empty header', () => {
    expect(parseAcceptLanguageHeader(undefined)).toEqual([]);
    expect(parseAcceptLanguageHeader('')).toEqual([]);
  });

  test('preserves header order when no q-values are given', () => {
    expect(parseAcceptLanguageHeader('es-ES,ca,en')).toEqual(['es-ES', 'ca', 'en']);
  });

  test('orders by q-value, highest first, defaulting missing q to 1', () => {
    expect(parseAcceptLanguageHeader('en;q=0.5,ar,es;q=0.8')).toEqual(['ar', 'es', 'en']);
  });

  test('drops wildcards and q=0 entries', () => {
    expect(parseAcceptLanguageHeader('*;q=0.1,fa,en;q=0')).toEqual(['fa']);
  });

  test('tolerates whitespace and malformed q-values', () => {
    expect(parseAcceptLanguageHeader(' es-ES , en; q=broken ')).toEqual(['es-ES', 'en']);
  });

  test('feeds resolveInitialLanguage the browser preference order', () => {
    const language = resolveInitialLanguage({
      persistedLanguage: null,
      deviceLanguages: parseAcceptLanguageHeader('fr;q=0.9,ar;q=0.8,en;q=0.7'),
    });
    expect(language).toBe('ar');
  });
});
