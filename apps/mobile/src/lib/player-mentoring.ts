import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNetworkState } from 'expo-network';
import { useAuth } from '@ramassa/shared/auth';
import { AppError } from '@ramassa/shared/errors';
import {
  createMentoringRequest,
  fetchOwnMentoringRequests,
  type MentoringRequestValues,
} from '@ramassa/shared/mentoring';
import { isNetworkStateOnline } from './network-status';
import { playerMentoringQueryKey } from './player-mentoring-key';
import { supabase } from './supabase';

export { playerMentoringQueryKey } from './player-mentoring-key';

export function usePlayerMentoringRequests() {
  const { user } = useAuth();
  return useQuery({
    queryKey: playerMentoringQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => {
      if (user === null) throw new AppError('AUTH-2');
      return fetchOwnMentoringRequests(supabase, signal);
    },
    enabled: user !== null,
  });
}

export function useCreateMentoringRequest() {
  const { user } = useAuth();
  const networkState = useNetworkState();
  const isOnline = isNetworkStateOnline(networkState);
  const queryClient = useQueryClient();
  const userId = user?.id ?? 'signed-out';
  const queryKey = playerMentoringQueryKey(userId);

  return useMutation({
    mutationKey: ['create-mentoring-request', userId],
    networkMode: 'always',
    mutationFn: (request: MentoringRequestValues) => {
      if (!isOnline) throw new AppError('NETWORK-1');
      if (user === null) throw new AppError('AUTH-2');
      return createMentoringRequest(supabase, request);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
}
