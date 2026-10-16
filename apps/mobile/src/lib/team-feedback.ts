/**
 * The feedback inbox on the phone (RAPP-383), for `feedback.view` holders, as
 * the web admin's inbox: the private feedback players send, newest first, how
 * much of each kind arrived per month, and moving a submission on (read, in
 * progress, resolved). The answer goes in the chat the submission opened.
 * Kept in memory: the feedback is private.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import {
  fetchFeedbackMonthlyCounts,
  fetchStaffFeedbackSubmissions,
  transitionFeedbackSubmission,
  type FeedbackStatus,
} from '@ramassa/shared/feedback';
import { supabase } from './supabase';

const SIGNED_OUT = 'signed-out';

const feedbackRoot = (userId: string) => ['team', userId, 'feedback'] as const;

export function useStaffFeedback() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...feedbackRoot(user?.id ?? SIGNED_OUT), 'submissions'],
    queryFn: ({ signal }) => fetchStaffFeedbackSubmissions(supabase, {}, signal),
    enabled: user !== null,
  });
}

export function useFeedbackMonthlyCounts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...feedbackRoot(user?.id ?? SIGNED_OUT), 'monthly'],
    queryFn: ({ signal }) => fetchFeedbackMonthlyCounts(supabase, signal),
    enabled: user !== null,
  });
}

export function useFeedbackTransition() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      readonly submissionId: string;
      readonly status: Exclude<FeedbackStatus, 'new'>;
    }) => transitionFeedbackSubmission(supabase, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: feedbackRoot(user?.id ?? SIGNED_OUT) }),
  });
}
