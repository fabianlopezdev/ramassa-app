import type { i18n } from 'i18next';
import {
  createI18n,
  DEFAULT_LANGUAGE,
  resolveInitialLanguage,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';

/**
 * The language choice lives in a cookie (not localStorage) so the server can
 * render the same language it will hydrate with (RAPP-76). The name doubles as
 * the cookie the request-language server function reads.
 */
export const LANGUAGE_COOKIE_NAME = 'ramassa.language';

const LANGUAGE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Builds one i18n instance for one already-resolved language. The root route's
 * loader resolves that language on the server (cookie, then Accept-Language)
 * and dehydrates it, so the server render and the client hydration agree; the
 * server creates one instance per request, the browser exactly one.
 */
export function createAdminI18n(language: SupportedLanguage): i18n {
  return createI18n({
    languageStorage: {
      getLanguage: () => language,
      setLanguage: (nextLanguage) => {
        if (typeof document !== 'undefined') {
          document.cookie = `${LANGUAGE_COOKIE_NAME}=${nextLanguage}; Path=/; Max-Age=${LANGUAGE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
        }
      },
    },
    deviceLanguages: [],
  });
}

/**
 * Browser-side language resolution for trees that mount outside the root
 * route's provider (the router error fallback): cookie first, then the
 * browser's languages, then Catalan. On the server it returns the default;
 * a rare SSR'd error page may therefore hydrate into another language, an
 * accepted edge inside an error state.
 */
export function resolveClientLanguage(): SupportedLanguage {
  if (typeof document === 'undefined') {
    return DEFAULT_LANGUAGE;
  }
  const persistedLanguage =
    document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith(`${LANGUAGE_COOKIE_NAME}=`))
      ?.slice(LANGUAGE_COOKIE_NAME.length + 1) ?? null;
  return resolveInitialLanguage({ persistedLanguage, deviceLanguages: navigator.languages });
}
