import { createContext, useContext } from 'react';
import { useLanguage, type SupportedLanguage } from '@ramassa/shared/i18n';
import { fontClassForLanguage } from './language-font-class';

/**
 * A screen shown in another person's language, whatever the app's is: the
 * authorization a player signs on a staff tablet (RAPP-305). Inside it, every
 * field and chip takes her script's font.
 */
export const ScreenLanguageContext = createContext<SupportedLanguage | null>(null);

/** NativeWind font class that renders the current language's script correctly. */
export function useLanguageFontClass(): string {
  const screenLanguage = useContext(ScreenLanguageContext);
  const { language } = useLanguage();
  return fontClassForLanguage(screenLanguage ?? language);
}
