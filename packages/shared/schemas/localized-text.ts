import { z } from 'zod';

/** Catalan is the required fallback; the other supported languages can arrive incrementally. */
export const localizedTextSchema = z.object({
  ca: z.string().min(1),
  es: z.string().optional(),
  en: z.string().optional(),
  ar: z.string().optional(),
  fa: z.string().optional(),
});

export type LocalizedText = z.infer<typeof localizedTextSchema>;
