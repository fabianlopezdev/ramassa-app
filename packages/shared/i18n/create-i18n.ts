/**
 * The single i18n factory both apps consume (one config, ADR-006). Locale
 * resources are namespaced JSON per feature under `locales/<language>/`; they
 * are bundled statically because the full set is small and must work offline.
 */

import { createInstance, type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { LanguageStorage } from './language-storage';
import { DEFAULT_LANGUAGE, resolveInitialLanguage, SUPPORTED_LANGUAGES } from './languages';
import arAdmin from './locales/ar/admin.json';
import arAuth from './locales/ar/auth.json';
import arCommon from './locales/ar/common.json';
import arHome from './locales/ar/home.json';
import caAdmin from './locales/ca/admin.json';
import caAuth from './locales/ca/auth.json';
import caCommon from './locales/ca/common.json';
import caHome from './locales/ca/home.json';
import enAdmin from './locales/en/admin.json';
import enAuth from './locales/en/auth.json';
import enCommon from './locales/en/common.json';
import enHome from './locales/en/home.json';
import esAdmin from './locales/es/admin.json';
import esAuth from './locales/es/auth.json';
import esCommon from './locales/es/common.json';
import esHome from './locales/es/home.json';
import faAdmin from './locales/fa/admin.json';
import faAuth from './locales/fa/auth.json';
import faCommon from './locales/fa/common.json';
import faHome from './locales/fa/home.json';

const resources = {
  ca: { common: caCommon, home: caHome, auth: caAuth, admin: caAdmin },
  es: { common: esCommon, home: esHome, auth: esAuth, admin: esAdmin },
  en: { common: enCommon, home: enHome, auth: enAuth, admin: enAdmin },
  ar: { common: arCommon, home: arHome, auth: arAuth, admin: arAdmin },
  fa: { common: faCommon, home: faHome, auth: faAuth, admin: faAdmin },
};

export interface CreateI18nOptions {
  languageStorage: LanguageStorage;
  /** Device/browser locale preference list, best first (e.g. `['es-ES', 'en']`). */
  deviceLanguages?: readonly string[];
}

export function createI18n(options: CreateI18nOptions): i18n {
  const { languageStorage, deviceLanguages = [] } = options;

  const instance = createInstance();
  // Bundled resources make init synchronous; `t` works as soon as this returns.
  void instance.use(initReactI18next).init({
    resources,
    lng: resolveInitialLanguage({
      persistedLanguage: languageStorage.getLanguage(),
      deviceLanguages,
    }),
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    defaultNS: 'common',
    ns: Object.keys(resources.ca),
    interpolation: {
      // React already escapes interpolated values.
      escapeValue: false,
    },
  });

  // Attached after init so only explicit language switches persist, not the
  // device-derived boot language: until the user chooses, a device language
  // change should keep flowing through.
  instance.on('languageChanged', (language) => {
    languageStorage.setLanguage(language);
  });

  return instance;
}
