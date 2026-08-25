import { getLocales } from 'expo-localization';
import { I18nManager } from 'react-native';
import {
  applyDocumentDirection,
  createI18n,
  createMmkvLanguageStorage,
  DEFAULT_LANGUAGE,
  syncNativeLayoutDirection,
} from '@ramassa/shared/i18n';
import { preferencesStorage } from './storage';

/**
 * The app's single i18n instance, created once at module scope so it exists
 * before the first render. Language resolution: persisted choice from MMKV,
 * else the device locale, else Catalan (ADR-006).
 */
const languageStorage = createMmkvLanguageStorage(preferencesStorage);

export const i18n = createI18n({
  languageStorage,
  deviceLanguages: getLocales().map((deviceLocale) => deviceLocale.languageTag),
});

export function hasPersistedLanguageChoice(): boolean {
  return languageStorage.getLanguage() !== null;
}

// React Native only applies a layout-direction flip on the next app start, so a
// `true` return here means the CURRENT session still shows the old direction.
// `extra.supportsRTL` in app.json already makes a first launch on an AR/FA
// device lay out RTL natively; this sync covers the in-app language switch,
// which becomes fully visible on the next launch. The settings-UI issue that
// exposes the switcher owns prompting/triggering that reload.
function syncLayoutDirection(language: string): void {
  if (typeof document !== 'undefined') {
    applyDocumentDirection(document, language);
    return;
  }
  syncNativeLayoutDirection(I18nManager, language);
}

syncLayoutDirection(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE);
i18n.on('languageChanged', (language) => {
  syncLayoutDirection(language);
});
