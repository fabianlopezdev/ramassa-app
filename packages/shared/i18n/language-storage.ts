/**
 * Language persistence adapters. Like the Supabase session storage, the i18n
 * factory takes the adapter as an argument so this package stays
 * platform-neutral: MMKV never reaches the web bundle, localStorage never
 * reaches native.
 */

import type { MmkvLike } from '../lib/supabase';

const LANGUAGE_STORAGE_KEY = 'ramassa.language';

export interface LanguageStorage {
  getLanguage(): string | null;
  setLanguage(language: string): void;
}

/**
 * Web language storage backed by `localStorage`. Used by the admin app.
 */
export function createLocalStorageLanguageStorage(): LanguageStorage {
  return {
    getLanguage: () => globalThis.localStorage.getItem(LANGUAGE_STORAGE_KEY),
    setLanguage: (language) => globalThis.localStorage.setItem(LANGUAGE_STORAGE_KEY, language),
  };
}

/**
 * Mobile language storage backed by MMKV. Used by the mobile app, which passes
 * its real `new MMKV()` instance.
 */
export function createMmkvLanguageStorage(mmkv: MmkvLike): LanguageStorage {
  return {
    getLanguage: () => mmkv.getString(LANGUAGE_STORAGE_KEY) ?? null,
    setLanguage: (language) => mmkv.set(LANGUAGE_STORAGE_KEY, language),
  };
}

/**
 * Non-persisting storage for tests and for environments with no storage at all
 * (the admin's server render).
 */
export function createInMemoryLanguageStorage(): LanguageStorage {
  let storedLanguage: string | null = null;
  return {
    getLanguage: () => storedLanguage,
    setLanguage: (language) => {
      storedLanguage = language;
    },
  };
}
