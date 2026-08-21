import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import {
  fetchOwnSurveyResponse,
  fetchPlayerSurveys,
  saveSurveyResponse,
  type SurveyAnswer,
  type SurveyQuestion,
} from '@ramassa/shared/surveys';
import { supabase } from './supabase';

export const playerSurveysQueryKey = (userId: string) => ['player-surveys', userId] as const;
export const ownSurveyResponseQueryKey = (userId: string, surveyId: string) =>
  ['survey-response', userId, surveyId] as const;

export function usePlayerSurveys() {
  const { user } = useAuth();
  return useQuery({
    queryKey: playerSurveysQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => fetchPlayerSurveys(supabase, signal),
    enabled: user !== null,
  });
}

export function useOwnSurveyResponse(surveyId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ownSurveyResponseQueryKey(user?.id ?? 'signed-out', surveyId),
    queryFn: ({ signal }) => fetchOwnSurveyResponse(supabase, surveyId, signal),
    enabled: user !== null && surveyId.length > 0,
  });
}

export function useSaveSurveyResponse() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['save-survey-response', user?.id ?? 'signed-out'],
    mutationFn: (input: {
      readonly surveyId: string;
      readonly questions: readonly SurveyQuestion[];
      readonly answers: Readonly<Record<string, SurveyAnswer>>;
      readonly complete: boolean;
    }) => saveSurveyResponse(supabase, input),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: playerSurveysQueryKey(user?.id ?? 'signed-out'),
        }),
        queryClient.invalidateQueries({
          queryKey: ownSurveyResponseQueryKey(user?.id ?? 'signed-out', variables.surveyId),
        }),
      ]);
    },
  });
}
