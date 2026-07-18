/**
 * Base zod schemas: the single validation source for the whole codebase.
 *
 * The rule this folder establishes (and every later issue follows):
 *   1. Every form and every Edge Function payload has a schema HERE.
 *   2. The client validates with it for fast, friendly UX feedback.
 *   3. The server re-validates with the SAME schema for security. Client
 *      validation is never trusted on its own.
 *   4. External API responses are parsed through a schema before use.
 *
 * This file seeds the primitives that domain schemas compose from. Feature
 * schemas (events, profiles, forum posts, ...) land in sibling files as their
 * issues arrive and import these primitives instead of redefining them.
 */

import { z } from 'zod';

/**
 * The five supported languages (ADR-006). Catalan is the grant-mandated default.
 */
export const languageCodeSchema = z.enum(['ca', 'es', 'en', 'ar', 'fa']);
export type LanguageCode = z.infer<typeof languageCodeSchema>;

export const DEFAULT_LANGUAGE: LanguageCode = 'ca';

/**
 * Multilingual text. Catalan is required (it is the default the UI falls back to);
 * the other four languages are optional so staff can translate incrementally.
 */
export const localizedTextSchema = z.object({
  ca: z.string().min(1),
  es: z.string().optional(),
  en: z.string().optional(),
  ar: z.string().optional(),
  fa: z.string().optional(),
});
export type LocalizedText = z.infer<typeof localizedTextSchema>;

export const uuidSchema = z.uuid();
export const emailSchema = z.email();
export const isoDateTimeSchema = z.iso.datetime();

// Domain schemas compose from the primitives above and live in sibling files.
export * from './auth';
