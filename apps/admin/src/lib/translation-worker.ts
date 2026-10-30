/**
 * The web admin's call to the translation Worker. The request itself is shared
 * with the phone (`@ramassa/shared/translation/client`, RAPP-341); this file
 * adds the admin's address, session and Sentry-reporting `safeAsync`.
 */
import { safeAsync } from '@/lib/observability';
import { adminClientEnv, supabase } from '@/lib/supabase';
import { AppError, err, ok, type Result } from '@ramassa/shared/errors';
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

/** At most this many texts are on their way to the Worker at once. */
const CATALAN_TRANSLATION_CONCURRENCY = 3;

/**
 * Catalan texts into one language (RAPP-750), for the editors' translate
 * button: each distinct text is asked once, a few at a time, and the first
 * failure stops the rest. The map goes from each Catalan text to its draft.
 */
export async function translateFromCatalan(
  texts: readonly string[],
  target: SupportedLanguage,
): Promise<Result<ReadonlyMap<string, string>>> {
  const pending = [...new Set(texts.map((text) => text.trim()).filter((text) => text !== ''))];
  const translations = new Map<string, string>();
  let failure: AppError | null = null;
  async function work() {
    for (let text = pending.shift(); text !== undefined; text = pending.shift()) {
      if (failure !== null) return;
      const result = await requestTranslation(text, 'ca', [target]);
      if (!result.ok) {
        failure ??= result.error;
        return;
      }
      const draft = result.value.suggestions.find((each) => each.language === target);
      if (draft !== undefined) translations.set(text, draft.machineText);
    }
  }
  await Promise.all(Array.from({ length: CATALAN_TRANSLATION_CONCURRENCY }, work));
  return failure === null ? ok(translations) : err(failure);
}
