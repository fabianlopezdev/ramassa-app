import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import {
  createMentoringRequest,
  fetchOwnMentoringRequests,
  type MentoringRequestValues,
} from '@ramassa/shared/mentoring';
import { playerMentoringQueryKey } from './player-mentoring-key';
import { supabase } from './supabase';

export { playerMentoringQueryKey } from './player-mentoring-key';

export function usePlayerMentoringRequests() {
  const { user } = useAuth();
  return useQuery({
    queryKey: playerMentoringQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => fetchOwnMentoringRequests(supabase, signal),
    enabled: user !== null,
  });
}

export function useCreateMentoringRequest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = playerMentoringQueryKey(user?.id ?? 'signed-out');

  return useMutation({
    mutationKey: ['create-mentoring-request', user?.id ?? 'signed-out'],
    mutationFn: (request: MentoringRequestValues) => createMentoringRequest(supabase, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
}
