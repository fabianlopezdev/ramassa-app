import { getLanguageFontFamilyKey, useLanguage } from '@ramassa/shared/i18n';

// `font-arabic` / `font-farsi` resolve to the bundled Noto Kufi Arabic and
// Vazirmatn families through the NativeWind config (shared tokens, ADR-015).
const fontClassByFamilyKey = {
  sans: 'font-sans',
  arabic: 'font-arabic',
  farsi: 'font-farsi',
} as const;

/** NativeWind font class that renders the current language's script correctly. */
export function useLanguageFontClass(): string {
  const { language } = useLanguage();
  return fontClassByFamilyKey[getLanguageFontFamilyKey(language)];
}
