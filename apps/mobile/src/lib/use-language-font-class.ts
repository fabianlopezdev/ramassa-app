import { useLanguage } from '@ramassa/shared/i18n';
import { fontClassForLanguage } from './language-font-class';

/** NativeWind font class that renders the current language's script correctly. */
export function useLanguageFontClass(): string {
  const { language } = useLanguage();
  return fontClassForLanguage(language);
}
