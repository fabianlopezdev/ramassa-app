/**
 * Her surveys on the form engine (RAPP-929): the ones waiting for her, each
 * with the catalog she walks it with, and sending her answers.
 *
 * A survey never comes in the catalog every build reads: `my_surveys` sends
 * each one as the version she was asked, and `surveyCatalog` lays it over the
 * catalog so the form walker draws it as it draws a form. Her answers go with
 * `complete_survey`, kept with her response and never on her record.
 */

import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import type { AppErrorCode } from '@ramassa/shared/errors';
import { completeSurvey, fetchMySurveySource } from '@ramassa/shared/intake-builder';

const SURVEY_FORMS_QUERY_ROOT = 'player-survey-forms';

/** Her surveys waiting, with the catalog as sent, read again whenever it is asked. */
export function useMySurveySource(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [SURVEY_FORMS_QUERY_ROOT, user?.id ?? 'signed-out'],
    queryFn: () => fetchMySurveySource(supabase),
    enabled: enabled && user !== null,
    staleTime: 0,
  });
}

/** Sends her answers to a survey, then reads her surveys again. The failure's code, else null. */
export function useAnswerSurvey() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return async (
    responseId: string,
    answers: Readonly<Record<string, unknown>>,
  ): Promise<AppErrorCode | null> => {
    const result = await safeAsync(() => completeSurvey(supabase, responseId, answers), {
      code: 'DB-1',
    });
    if (!result.ok) return result.error.code;
    await queryClient.invalidateQueries({
      queryKey: [SURVEY_FORMS_QUERY_ROOT, user?.id ?? 'signed-out'],
    });
    return null;
  };
}

/** Reads her surveys again, so Home shows one she left half way as started (RAPP-945). */
export function useRefreshMySurveys() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return () =>
    void queryClient.invalidateQueries({
      queryKey: [SURVEY_FORMS_QUERY_ROOT, user?.id ?? 'signed-out'],
    });
}
