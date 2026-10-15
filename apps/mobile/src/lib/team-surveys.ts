/**
 * Surveys on the phone (RAPP-384), as the web admin's workspace: the staff
 * list with its response counts, a new survey saved and distributed, and the
 * attributed responses of one survey for `surveys.results` holders. The
 * audience reuses the notification groups and options. Kept in memory: the
 * responses name the participants.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import {
  fetchCustomNotificationGroups,
  fetchNotificationAudienceOptions,
} from '@ramassa/shared/notifications';
import { fetchStaffSurveys, fetchSurveyResponses, saveSurvey } from '@ramassa/shared/surveys';
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
