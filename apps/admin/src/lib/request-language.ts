import { createServerFn } from '@tanstack/react-start';
import { getCookie, getRequestHeader } from '@tanstack/react-start/server';
import {
  parseAcceptLanguageHeader,
  resolveInitialLanguage,
  staffLanguageFor,
} from '@ramassa/shared/i18n';
import { LANGUAGE_COOKIE_NAME } from './i18n';

/**
 * Resolves the request's language on the server: an earlier explicit choice
 * (cookie) wins, then the browser's Accept-Language preferences, then Catalan.
 * Called from the root route's loader so the result is dehydrated and the
 * client hydrates with the exact language the server rendered (RAPP-76).
 */
// The admin is the staff side: Catalan, Spanish or English (RAPP-238). A saved
// or browser language outside those opens in Catalan.
export const getRequestLanguage = createServerFn({ method: 'GET' }).handler(() =>
  staffLanguageFor(
    resolveInitialLanguage({
      persistedLanguage: getCookie(LANGUAGE_COOKIE_NAME) ?? null,
      deviceLanguages: parseAcceptLanguageHeader(getRequestHeader('accept-language')),
    }),
  ),
);
