/**
 * The supported languages (ADR-006, French added by RAPP-781), as a leaf
 * module so domain schemas can import the primitive without a cycle through
 * the barrel: `index.ts` re-exports every sibling, so a sibling importing from
 * `./index` would import itself. Catalan is the grant-mandated default.
 *
 * The order is the order of every language picker.
 */

import { z } from 'zod';

export const languageCodeSchema = z.enum(['ca', 'es', 'en', 'fr', 'ar', 'fa']);
export type LanguageCode = z.infer<typeof languageCodeSchema>;

export const DEFAULT_LANGUAGE: LanguageCode = 'ca';

/**
 * The languages every STORED complete translation carries. French came later
 * (RAPP-781): rows written before it have no French key, and the app build
 * already installed reads those same rows. So a stored text is read with
 * French optional, and a French player reads the fallback where it is
 * missing. Publishing still asks for every supported language, French too.
 */
export const STORED_TRANSLATION_LANGUAGES = [
  'ca',
  'es',
  'en',
  'ar',
  'fa',
] as const satisfies readonly LanguageCode[];

/**
 * The zod shape of a stored complete text, from one schema per language. The
 * French key is optional, so a row from before French still parses.
 */
export function storedTranslationsSchema<T extends z.ZodType>(text: T) {
  return z.object({
    ca: text,
    es: text,
    en: text,
    fr: text.optional(),
    ar: text,
    fa: text,
  });
}

/** The zod shape of a complete text as it is published: every supported language, French too. */
export function publishedTranslationsSchema<T extends z.ZodType>(text: T) {
  return z.object({ ca: text, es: text, en: text, fr: text, ar: text, fa: text });
}

/** The zod shape of a draft text: Catalan, and any other language written so far. */
export function draftTranslationsSchema<T extends z.ZodType>(text: T) {
  return z.object({
    ca: text,
    es: text.optional(),
    en: text.optional(),
    fr: text.optional(),
    ar: text.optional(),
    fa: text.optional(),
  });
}
