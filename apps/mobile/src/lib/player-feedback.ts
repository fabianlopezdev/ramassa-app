import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import {
  createFeedbackSubmission,
  fetchOwnFeedbackSubmissions,
  type FeedbackSubmissionValues,
} from '@ramassa/shared/feedback';
import { supabase } from './supabase';

export const playerFeedbackQueryKey = (userId: string) => ['player-feedback', userId] as const;

export function usePlayerFeedback() {
  const { user } = useAuth();
  return useQuery({
    queryKey: playerFeedbackQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => fetchOwnFeedbackSubmissions(supabase, signal),
    enabled: user !== null,
  });
}

export function useCreateFeedback() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = playerFeedbackQueryKey(user?.id ?? 'signed-out');
  return useMutation({
    mutationKey: ['create-feedback', user?.id ?? 'signed-out'],
    mutationFn: (input: FeedbackSubmissionValues) => createFeedbackSubmission(supabase, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
}
