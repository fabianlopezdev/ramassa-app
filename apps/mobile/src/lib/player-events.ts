import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNetworkState } from 'expo-network';
import { useAuth } from '@ramassa/shared/auth';
import { AppError } from '@ramassa/shared/errors';
import {
  applyOptimisticEventSignup,
  fetchPlayerEventOccurrences,
  setPlayerEventSignup,
  type EventSignupState,
  type PlayerEventOccurrence,
} from '@ramassa/shared/events';
import { requireEventSignupOnline } from './event-signup-policy';
import { isNetworkStateOnline } from './network-status';
import { supabase } from './supabase';

export const playerEventsQueryKey = (userId: string) => ['player-events', userId] as const;

export function usePlayerEvents() {
  const { user } = useAuth();
  return useQuery<readonly PlayerEventOccurrence[]>({
    queryKey: playerEventsQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => fetchPlayerEventOccurrences(supabase, { signal }),
    enabled: user !== null,
  });
}

export interface EventSignupVariables {
  readonly eventId: string;
  readonly state: EventSignupState;
}

export function useEventSignup() {
  const { user } = useAuth();
  const networkState = useNetworkState();
  const isOnline = isNetworkStateOnline(networkState);
  const queryClient = useQueryClient();
  const queryKey = playerEventsQueryKey(user?.id ?? 'signed-out');

  return useMutation({
    mutationKey: ['event-signup', user?.id ?? 'signed-out'],
    networkMode: 'always',
    mutationFn: async ({ eventId, state }: EventSignupVariables) => {
      requireEventSignupOnline(isOnline);
      if (user === null) throw new AppError('AUTH-2');
      return setPlayerEventSignup(supabase, { eventId, playerId: user.id, state });
    },
    onMutate: async ({ eventId, state }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<readonly PlayerEventOccurrence[]>(queryKey);
      queryClient.setQueryData<readonly PlayerEventOccurrence[]>(queryKey, (current = []) =>
        applyOptimisticEventSignup(current, eventId, state),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}
