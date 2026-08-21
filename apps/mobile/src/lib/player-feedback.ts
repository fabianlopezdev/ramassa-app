import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNetworkState } from 'expo-network';
import { useAuth } from '@ramassa/shared/auth';
import { AppError } from '@ramassa/shared/errors';
import {
  createFeedbackSubmission,
  fetchOwnFeedbackSubmissions,
  type FeedbackSubmissionValues,
} from '@ramassa/shared/feedback';
import { isNetworkStateOnline } from './network-status';
import { supabase } from './supabase';

export const playerFeedbackQueryKey = (userId: string) => ['player-feedback', userId] as const;

export function usePlayerFeedback() {
  const { user } = useAuth();
  return useQuery({
    queryKey: playerFeedbackQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => {
      if (user === null) throw new AppError('AUTH-2');
      return fetchOwnFeedbackSubmissions(supabase, signal);
    },
    enabled: user !== null,
  });
}

export function useCreateFeedback() {
  const { user } = useAuth();
  const networkState = useNetworkState();
  const isOnline = isNetworkStateOnline(networkState);
  const queryClient = useQueryClient();
  const userId = user?.id ?? 'signed-out';
  const queryKey = playerFeedbackQueryKey(userId);
  return useMutation({
    mutationKey: ['create-feedback', userId],
    networkMode: 'always',
    mutationFn: (input: FeedbackSubmissionValues) => {
      if (!isOnline) throw new AppError('NETWORK-1');
      if (user === null) throw new AppError('AUTH-2');
      return createFeedbackSubmission(supabase, input);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
}
