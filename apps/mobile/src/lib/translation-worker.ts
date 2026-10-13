/**
 * Machine translation drafts on the phone (RAPP-341): the shared Worker call
 * with the phone's address and session, through the phone's `safeAsync`, so a
 * failure reaches Sentry and comes back as a code.
 */
import { AppError } from '@ramassa/shared/errors';
import type { TranslationReview } from '@ramassa/shared/translation';
import {
  CATALAN_TRANSLATION_TARGETS,
  requestTranslationDrafts,
} from '@ramassa/shared/translation/client';
import { safeAsync } from './observability';
import { mobileClientEnv, supabase } from './supabase';

export function requestCatalanTranslation(text: string) {
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
