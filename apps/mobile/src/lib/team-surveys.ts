/**
 * Surveys on the phone (RAPP-384), as the web admin's workspace: the staff
 * list with its response counts, a new survey saved and distributed, and the
 * attributed responses of one survey for `surveys.results` holders, and
 * their CSV (RAPP-402), which asks for the step-up first and goes to the share
 * sheet. The audience reuses the notification groups and options. Kept in
 * memory: the responses name the participants.
 */
import { useStepUp } from '@/components/auth/step-up';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import {
  fetchCustomNotificationGroups,
  fetchNotificationAudienceOptions,
} from '@ramassa/shared/notifications';
import {
  buildSurveyCsv,
  createSurveyExport,
  fetchStaffSurveys,
  fetchSurveyResponses,
  saveSurvey,
  type StaffSurvey,
} from '@ramassa/shared/surveys';
import { shareFile } from './share-file';
import { supabase } from './supabase';

const SIGNED_OUT = 'signed-out';

const surveysRoot = (userId: string) => ['team', userId, 'surveys'] as const;

export function useStaffSurveys() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...surveysRoot(user?.id ?? SIGNED_OUT), 'list'],
    queryFn: ({ signal }) => fetchStaffSurveys(supabase, signal),
    enabled: user !== null,
  });
}

export function useSurveyResponses(surveyId: string, enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...surveysRoot(user?.id ?? SIGNED_OUT), 'responses', surveyId],
    queryFn: ({ signal }) => fetchSurveyResponses(supabase, surveyId, signal),
    enabled: user !== null && enabled,
  });
}

/** The custom groups and audience options a survey can go to. */
export function useSurveyAudienceChoices() {
  const { user } = useAuth();
  const root = surveysRoot(user?.id ?? SIGNED_OUT);
  const groups = useQuery({
    queryKey: [...root, 'groups'],
    queryFn: ({ signal }) => fetchCustomNotificationGroups(supabase, signal),
    enabled: user !== null,
  });
  const options = useQuery({
    queryKey: [...root, 'options'],
    queryFn: ({ signal }) => fetchNotificationAudienceOptions(supabase, signal),
    enabled: user !== null,
  });
  return { groups, options };
}

export function useSaveSurvey() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof saveSurvey>[1]) => saveSurvey(supabase, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: surveysRoot(user?.id ?? SIGNED_OUT) }),
  });
}

/**
 * The survey's CSV, as the web admin's Export CSV: the database asks for a
 * recent authenticator code and records the export, then the file goes to the
 * share sheet and is deleted from the phone afterwards.
 */
export function useSurveyExport(dialogTitle: string) {
  const withStepUp = useStepUp();
  return useMutation({
    mutationFn: async (survey: Pick<StaffSurvey, 'id' | 'questions'>) => {
      const responses = await withStepUp(() => createSurveyExport(supabase, survey.id));
      await shareFile({
        name: `survey-${survey.id}.csv`,
        content: buildSurveyCsv(survey.questions, responses),
        mimeType: 'text/csv',
        uti: 'public.comma-separated-values-text',
        dialogTitle,
      });
      return responses.length;
    },
  });
}
