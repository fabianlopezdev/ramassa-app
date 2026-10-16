/**
 * The staff-written explanation under the wizard's document step (RAPP-302):
 * why Ramassà asks for a document and what it is used for. Multilingual like
 * other staff content. Catalan is required, the other languages are optional
 * and fall back to Catalan. With nothing written, the step shows no extra line.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError, databaseErrorCode } from '../errors';
import { resolveLocalizedText } from '../i18n/localized-content';
import { withCancellation, type CancellableRequest } from '../lib/cancellation';
import type { LanguageCode } from '../schemas/language';
import { localizedTextSchema, type LocalizedText } from '../schemas/localized-text';
import type { Database } from '../types/database';

type Client = SupabaseClient<Database>;

export const DOCUMENT_EXPLANATION_MAX_LENGTH = 1000;

const storedExplanationSchema = localizedTextSchema.nullable();

/**
 * The Settings form value: every language optional. Empty languages are
 * dropped, all empty clears the explanation, and another language without
 * Catalan is refused because Catalan is what every other language falls back to.
 */
export const documentExplanationDraftSchema = z
  .object({
    ca: z.string().optional(),
    es: z.string().optional(),
    en: z.string().optional(),
    ar: z.string().optional(),
    fa: z.string().optional(),
  })
  .transform((draft, context): LocalizedText | null => {
    const entries = Object.entries(draft)
      .map(([language, text]) => [language, (text ?? '').trim()] as const)
      .filter(([, text]) => text !== '');
    if (entries.length === 0) return null;
    for (const [language, text] of entries) {
      if (text.length > DOCUMENT_EXPLANATION_MAX_LENGTH) {
        context.addIssue({ code: 'custom', path: [language], message: 'too long' });
      }
    }
    const cleaned = Object.fromEntries(entries) as Partial<LocalizedText>;
    if (cleaned.ca === undefined) {
      context.addIssue({ code: 'custom', path: ['ca'], message: 'catalan required' });
      return z.NEVER;
    }
    return cleaned as LocalizedText;
  });

export type DocumentExplanationDraft = z.input<typeof documentExplanationDraftSchema>;

/** Her organization's explanation, or null when staff wrote none. */
export async function fetchDocumentStepExplanation(
  client: Client,
  options: CancellableRequest = {},
): Promise<LocalizedText | null> {
  const { data, error } = await withCancellation(
    client.rpc('get_document_step_explanation'),
    options,
  );
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
  return storedExplanationSchema.parse(data ?? null);
}

/** The text to show in her language, or null when there is none. */
export function documentExplanationFor(
  explanation: LocalizedText | null,
  language: LanguageCode,
): string | null {
  if (explanation === null) return null;
  return resolveLocalizedText(explanation, language)?.text ?? null;
}

/** Saves the explanation (`settings.organization`); null clears it. */
export async function saveDocumentStepExplanation(
  client: Client,
  explanation: LocalizedText | null,
): Promise<LocalizedText | null> {
  const { data, error } = await client.rpc('set_document_step_explanation', {
    p_explanation: explanation,
  });
  if (error) {
    throw new AppError(databaseErrorCode(error.message), { message: error.message });
  }
  return storedExplanationSchema.parse(data ?? null);
}
