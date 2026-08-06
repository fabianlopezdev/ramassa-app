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

export * from './language';

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

/** The subset of an Expo manifest the capture harness trusts to identify Metro. */
export const expoMetroManifestSchema = z.object({
  extra: z.object({
    expoClient: z.object({
      scheme: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    }),
  }),
});
export type ExpoMetroManifest = z.infer<typeof expoMetroManifestSchema>;

// Domain schemas compose from the primitives above and live in sibling files.
export * from './accounts';
export * from './auth';
export * from './onboarding';
export * from './participant-notes';
export * from './profile';
export * from './upload';
export * from './equipment';
