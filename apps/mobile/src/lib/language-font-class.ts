import { getLanguageFontFamilyKey, type SupportedLanguage } from '@ramassa/shared/i18n';

// `font-arabic` / `font-farsi` resolve to the bundled Noto Kufi Arabic and
// Vazirmatn families through the NativeWind config (shared tokens, ADR-015).
const fontClassByFamilyKey = {
  sans: 'font-sans',
  arabic: 'font-arabic',
  farsi: 'font-farsi',
} as const;

/** NativeWind font class that renders the given language's script correctly. */
export function fontClassForLanguage(language: SupportedLanguage): string {
  return fontClassByFamilyKey[getLanguageFontFamilyKey(language)];
}
