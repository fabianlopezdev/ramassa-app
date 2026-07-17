import {
  applyDocumentDirection,
  createI18n,
  createInMemoryLanguageStorage,
  createLocalStorageLanguageStorage,
  DEFAULT_LANGUAGE,
} from '@ramassa/shared/i18n';

const isBrowser = typeof document !== 'undefined';

/**
 * The admin's single i18n instance, created once at module scope. The server
 * render always uses the Catalan default (in-memory storage, no browser
 * languages); the browser resolves the persisted or navigator language after
 * hydration. `suppressHydrationWarning` on `<html>` absorbs the attribute
 * difference (full request-scoped SSR i18n arrives with the real admin UI).
 */
export const i18n = createI18n({
  languageStorage: isBrowser
    ? createLocalStorageLanguageStorage()
    : createInMemoryLanguageStorage(),
  deviceLanguages: isBrowser ? navigator.languages : [],
});

if (isBrowser) {
  applyDocumentDirection(document, i18n.resolvedLanguage ?? DEFAULT_LANGUAGE);
  i18n.on('languageChanged', (language) => {
    applyDocumentDirection(document, language);
  });
}
