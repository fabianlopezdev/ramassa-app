/**
 * The team and entity screens are in Catalan, Spanish or English (RAPP-238).
 * A person whose saved language is Arabic or Farsi gets Catalan here, and can
 * pick Spanish or English in Settings. Player screens keep all five.
 *
 * Arabic and Farsi read right to left, and React Native flips the layout only
 * at the next start, so that one switch restarts the app, as the player's own
 * language switcher does.
 */
import { shouldRestartForLanguage } from '@/components/auth/language-restart-policy';
import { reloadAppAsync } from 'expo';
import { useEffect } from 'react';
import { I18nManager } from 'react-native';
import { staffLanguageFor, useLanguage } from '@ramassa/shared/i18n';

/**
 * Called at the top of the signed-in layout, before any early return, so it
 * also covers the authenticator screen a team member sees first.
 */
export function useStaffLanguage(isStaffSide: boolean): void {
  const { language, setLanguage } = useLanguage();
  const staffLanguage = staffLanguageFor(language);

  useEffect(() => {
    if (!isStaffSide || staffLanguage === language) return;
    void setLanguage(staffLanguage).then(() => {
      if (
        process.env.EXPO_OS !== 'web' &&
        shouldRestartForLanguage(I18nManager.isRTL, staffLanguage)
      ) {
        void reloadAppAsync();
      }
    });
  }, [isStaffSide, language, setLanguage, staffLanguage]);
}
