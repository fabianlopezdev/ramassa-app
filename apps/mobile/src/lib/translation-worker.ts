/**
 * Machine translation drafts on the phone (RAPP-341): the shared Worker call
 * with the phone's address and session, through the phone's `safeAsync`, so a
 * failure reaches Sentry and comes back as a code.
 */
import { AppError, type AppErrorCode } from '@ramassa/shared/errors';
import type {
  CreateTranslationReviewOptions,
  TranslationReview,
} from '@ramassa/shared/translation';
import {
  CATALAN_TRANSLATION_TARGETS,
  requestTranslationDrafts,
} from '@ramassa/shared/translation/client';
import { generatedReviewOptions } from './content-translations';
import { safeAsync } from './observability';
import { mobileClientEnv, supabase } from './supabase';

function requestCatalanTranslation(text: string) {
  return safeAsync<TranslationReview>(
    async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || data.session === null) throw new AppError('AUTH-2');
      return requestTranslationDrafts({
        workerUrl: mobileClientEnv.EXPO_PUBLIC_TRANSLATION_WORKER_URL,
        accessToken: data.session.access_token,
        text,
        from: 'ca',
        to: CATALAN_TRANSLATION_TARGETS,
      });
    },
    { code: 'TRANSLATION-1', context: { targetCount: CATALAN_TRANSLATION_TARGETS.length } },
  );
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
): Promise<AppErrorCode | null> {
  const results = await Promise.all(
    requests.map(async (request) => ({
      start: request.start,
      result: await requestCatalanTranslation(request.source),
    })),
  );
  for (const { result } of results) if (!result.ok) return result.error.code;
  for (const { result, start } of results) {
    if (result.ok) start(generatedReviewOptions(result.value));
  }
  return null;
}
