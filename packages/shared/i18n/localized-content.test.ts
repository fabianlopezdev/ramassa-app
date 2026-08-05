import { describe, expect, test } from 'bun:test';
import { getContentLanguageFallbacks, resolveLocalizedText } from './localized-content';

describe('localized content fallback', () => {
  test('prefers the requested approved translation', () => {
    expect(resolveLocalizedText({ ca: 'Entrenament', ar: 'تدريب' }, 'ar')).toEqual({
      language: 'ar',
      text: 'تدريب',
    });
  });

  test('falls back to Catalan, then the remaining supported languages', () => {
    expect(getContentLanguageFallbacks('ar')).toEqual(['ar', 'ca', 'es', 'en', 'fa']);
    expect(resolveLocalizedText({ ca: 'Entrenament' }, 'ar')).toEqual({
      language: 'ca',
      text: 'Entrenament',
    });
    expect(resolveLocalizedText({ en: 'Training' }, 'ar')).toEqual({
      language: 'en',
      text: 'Training',
    });
  });

  test('ignores missing and blank translations', () => {
    expect(resolveLocalizedText({ ar: '   ', ca: '', es: 'Entrenamiento' }, 'ar')).toEqual({
      language: 'es',
      text: 'Entrenamiento',
    });
  });
});
