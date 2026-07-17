/**
 * The five grant-mandated languages (ADR-006). Catalan is both the default and
 * the fallback: the Generalitat grant requires it, and every key is guaranteed
 * to exist in `locales/ca/` first. The list itself is owned by
 * `languageCodeSchema` in `schemas/` (the single validation source); this
 * module derives from it.
 */

import { DEFAULT_LANGUAGE, languageCodeSchema, type LanguageCode } from '../schemas';

export const SUPPORTED_LANGUAGES = languageCodeSchema.options;

export type SupportedLanguage = LanguageCode;

export { DEFAULT_LANGUAGE };

export const RTL_LANGUAGES: readonly SupportedLanguage[] = ['ar', 'fa'];

export type LayoutDirection = 'ltr' | 'rtl';

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function isRtlLanguage(language: string): boolean {
  return (RTL_LANGUAGES as readonly string[]).includes(language);
}

export function getLanguageDirection(language: string): LayoutDirection {
  return isRtlLanguage(language) ? 'rtl' : 'ltr';
}

/**
 * Which `tokens.fontFamily` entry renders a language's script correctly.
 * Arabic and Farsi ship their own bundled fonts (ADR-006); everything else
 * uses the Latin default.
 */
export function getLanguageFontFamilyKey(language: string): 'sans' | 'arabic' | 'farsi' {
  if (language === 'ar') return 'arabic';
  if (language === 'fa') return 'farsi';
  return 'sans';
}

/**
 * Picks the language an app should boot in: an explicit earlier choice wins,
 * otherwise the first device language whose primary subtag we support (`es-ES`
 * matches `es`), otherwise Catalan.
 */
export function resolveInitialLanguage(options: {
  persistedLanguage: string | null;
  deviceLanguages: readonly string[];
}): SupportedLanguage {
  const { persistedLanguage, deviceLanguages } = options;

  if (persistedLanguage !== null && isSupportedLanguage(persistedLanguage)) {
    return persistedLanguage;
  }

  for (const deviceLanguage of deviceLanguages) {
    const primarySubtag = deviceLanguage.toLowerCase().split('-')[0];
    if (primarySubtag !== undefined && isSupportedLanguage(primarySubtag)) {
      return primarySubtag;
    }
  }

  return DEFAULT_LANGUAGE;
}
