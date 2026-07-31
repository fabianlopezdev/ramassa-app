/**
 * The five supported languages (ADR-006), as a leaf module so domain schemas
 * can import the primitive without a cycle through the barrel: `index.ts`
 * re-exports every sibling, so a sibling importing from `./index` would import
 * itself. Catalan is the grant-mandated default.
 */

import { z } from 'zod';

export const languageCodeSchema = z.enum(['ca', 'es', 'en', 'ar', 'fa']);
export type LanguageCode = z.infer<typeof languageCodeSchema>;

export const DEFAULT_LANGUAGE: LanguageCode = 'ca';
