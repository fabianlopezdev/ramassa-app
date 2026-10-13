/**
 * The web admin's call to the translation Worker. The request itself is shared
 * with the phone (`@ramassa/shared/translation/client`, RAPP-341); this file
 * adds the admin's address, session and Sentry-reporting `safeAsync`.
 */
import { safeAsync } from '@/lib/observability';
import { adminClientEnv, supabase } from '@/lib/supabase';
import { AppError } from '@ramassa/shared/errors';
import type { SupportedLanguage } from '@ramassa/shared/i18n';
import type { TranslationReview } from '@ramassa/shared/translation';
import {
  CATALAN_TRANSLATION_TARGETS,
  requestTranslationDrafts,
} from '@ramassa/shared/translation/client';

export async function requestTranslation(
  text: string,
  from: SupportedLanguage,
  to: readonly SupportedLanguage[],
) {
  return safeAsync<TranslationReview>(
    async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || data.session === null) throw new AppError('AUTH-2');
      return requestTranslationDrafts({
        workerUrl: adminClientEnv.EXPO_PUBLIC_TRANSLATION_WORKER_URL,
        accessToken: data.session.access_token,
        text,
        from,
        to,
      });
    },
    { code: 'TRANSLATION-1', context: { targetCount: to.length } },
  );
}

export function requestCatalanTranslation(text: string) {
  return requestTranslation(text, 'ca', CATALAN_TRANSLATION_TARGETS);
}
