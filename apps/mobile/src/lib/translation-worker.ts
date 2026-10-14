/**
 * Machine translation drafts on the phone (RAPP-341): the shared Worker call
 * with the phone's address and session, through the phone's `safeAsync`, so a
 * failure reaches Sentry and comes back as a code. Staff write in Catalan; a
 * participant story is translated from its own language (RAPP-343).
 */
import { AppError, type AppErrorCode } from '@ramassa/shared/errors';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@ramassa/shared/i18n';
import type {
  CreateTranslationReviewOptions,
  TranslationReview,
} from '@ramassa/shared/translation';
import { requestTranslationDrafts } from '@ramassa/shared/translation/client';
import { generatedReviewOptions } from './content-translations';
import { safeAsync } from './observability';
import { mobileClientEnv, supabase } from './supabase';

const targetsFrom = (from: SupportedLanguage) =>
  SUPPORTED_LANGUAGES.filter((language) => language !== from);

function requestTranslation(text: string, from: SupportedLanguage = 'ca') {
  const to = targetsFrom(from);
  return safeAsync<TranslationReview>(
    async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || data.session === null) throw new AppError('AUTH-2');
      return requestTranslationDrafts({
        workerUrl: mobileClientEnv.EXPO_PUBLIC_TRANSLATION_WORKER_URL,
        accessToken: data.session.access_token,
        text,
        from,
        to,
      });
    },
    { code: 'TRANSLATION-1', context: { targetCount: to.length } },
  );
}

/** One text's reviewed drafts per language, for the knowledge body; throws on failure. */
export async function translateText(
  text: string,
  from: SupportedLanguage,
): Promise<Partial<Record<SupportedLanguage, string>>> {
  const result = await requestTranslation(text, from);
  if (!result.ok) throw result.error;
  return Object.fromEntries(result.value.suggestions.map((s) => [s.language, s.reviewedText]));
}

/**
 * Asks for the drafts of several texts at once (RAPP-342) and starts each
 * review only when every request succeeded, so a form never mixes new and old
 * drafts. Returns the first failure's code, or null.
 */
export async function generateDrafts(
  requests: readonly {
    readonly source: string;
    readonly start: (options: CreateTranslationReviewOptions) => void;
  }[],
  from: SupportedLanguage = 'ca',
): Promise<AppErrorCode | null> {
  const results = await Promise.all(
    requests.map(async (request) => ({
      start: request.start,
      result: await requestTranslation(request.source, from),
    })),
  );
  for (const { result } of results) if (!result.ok) return result.error.code;
  for (const { result, start } of results) {
    if (result.ok) start(generatedReviewOptions(result.value));
  }
  return null;
}
