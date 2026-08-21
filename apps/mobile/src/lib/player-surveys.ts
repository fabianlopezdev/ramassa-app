import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNetworkState } from 'expo-network';
import { useAuth } from '@ramassa/shared/auth';
import { AppError } from '@ramassa/shared/errors';
import {
  fetchOwnSurveyResponse,
  fetchPlayerSurveys,
  saveSurveyResponse,
  type SurveyAnswer,
  type SurveyQuestion,
} from '@ramassa/shared/surveys';
import { isNetworkStateOnline } from './network-status';
import { supabase } from './supabase';

export const playerSurveysQueryKey = (userId: string) => ['player-surveys', userId] as const;
export const ownSurveyResponseQueryKey = (userId: string, surveyId: string) =>
  ['survey-response', userId, surveyId] as const;

export function usePlayerSurveys() {
  const { user } = useAuth();
  return useQuery({
    queryKey: playerSurveysQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => {
      if (user === null) throw new AppError('AUTH-2');
      return fetchPlayerSurveys(supabase, signal);
    },
    enabled: user !== null,
  });
}

export function useOwnSurveyResponse(surveyId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ownSurveyResponseQueryKey(user?.id ?? 'signed-out', surveyId),
    queryFn: ({ signal }) => {
      if (user === null) throw new AppError('AUTH-2');
      return fetchOwnSurveyResponse(supabase, surveyId, signal);
    },
    enabled: user !== null && surveyId.length > 0,
  });
}

export function useSaveSurveyResponse() {
  const { user } = useAuth();
  const networkState = useNetworkState();
  const isOnline = isNetworkStateOnline(networkState);
  const queryClient = useQueryClient();
  const userId = user?.id ?? 'signed-out';
  return useMutation({
    mutationKey: ['save-survey-response', userId],
    networkMode: 'always',
    mutationFn: (input: {
      readonly surveyId: string;
      readonly questions: readonly SurveyQuestion[];
      readonly answers: Readonly<Record<string, SurveyAnswer>>;
      readonly complete: boolean;
    }) => {
      if (!isOnline) throw new AppError('NETWORK-1');
      if (user === null) throw new AppError('AUTH-2');
      return saveSurveyResponse(supabase, input);
    },
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: playerSurveysQueryKey(userId),
        }),
        queryClient.invalidateQueries({
          queryKey: ownSurveyResponseQueryKey(userId, variables.surveyId),
        }),
      ]);
    },
  });
}
