/**
 * The participation authorization on her phone (RAPP-304): the gate, signing
 * and her optional consents. The status is read fresh on every app open, so a
 * version staff publish today is asked for the next time she opens the app.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import {
  fetchMyAuthorizationStatus,
  fetchMyConsents,
  setOptionalConsent,
  signAuthorization,
  type AuthorizationConsentKey,
  type buildSignPayload,
} from '@ramassa/shared/authorization';
import type { LanguageCode } from '@ramassa/shared/schemas';
import { supabase } from './supabase';

const statusKey = (userId: string) => ['authorization-status', userId] as const;
const consentsKey = (userId: string) => ['my-consents', userId] as const;

export function useAuthorizationStatus(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: statusKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => fetchMyAuthorizationStatus(supabase, { signal }),
    enabled: enabled && user !== null,
    // A failed read asks her to try again (the gate fails closed, RAPP-773);
    // it is not retried in a loop behind a spinner.
    retry: 1,
    refetchOnMount: 'always',
  });
}

export function useSignAuthorization() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    // The payload of the form she walked (`buildSignPayload`, RAPP-773).
    mutationFn: (input: {
      readonly versionId: string;
      readonly payload: NonNullable<ReturnType<typeof buildSignPayload>>;
    }) =>
      signAuthorization(supabase, input.versionId, input.payload),
    onSuccess: async () => {
      const userId = user?.id ?? 'signed-out';
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: statusKey(userId) }),
        queryClient.invalidateQueries({ queryKey: consentsKey(userId) }),
        queryClient.invalidateQueries({ queryKey: ['own-profile'] }),
      ]);
    },
  });
}

export function useMyConsents(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: consentsKey(user?.id ?? 'signed-out'),
    queryFn: () => fetchMyConsents(supabase),
    enabled: enabled && user !== null,
  });
}

export function useSetOptionalConsent() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      readonly key: AuthorizationConsentKey;
      readonly granted: boolean;
      readonly language: LanguageCode;
    }) => setOptionalConsent(supabase, input.key, input.granted, input.language),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: consentsKey(user?.id ?? 'signed-out') });
      await queryClient.invalidateQueries({ queryKey: ['own-profile'] });
    },
  });
}
