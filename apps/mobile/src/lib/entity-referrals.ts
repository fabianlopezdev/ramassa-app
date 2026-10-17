/**
 * The partner entity's referrals on the phone (RAPP-413), as the web portal's
 * referrals pages: the women her entity referred with their status, one
 * referral with its updates, a new referral, and an update the entity shares
 * with the team. The database scopes every row to her own entity. Kept in
 * memory: referrals hold contact details.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import {
  fetchIntakeCatalog,
  referralScreens,
  saveReferralCustomAnswers,
  type CustomAnswerValue,
  type IntakeScreen,
} from '@ramassa/shared/intake-builder';
import {
  createReferral,
  fetchEntityReferrals,
  fetchReferral,
  fetchReferralUpdates,
  fetchSupportingEntityNames,
  submitReferralUpdate,
  type CreateReferral,
  type ReferralUpdateInput,
} from '@ramassa/shared/referrals';
import { supabase } from './supabase';

const referralsRoot = (userId: string) => ['entity', userId, 'referrals'] as const;

export function useEntityReferrals() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...referralsRoot(user?.id ?? 'signed-out'), 'list'],
    queryFn: () => fetchEntityReferrals(supabase),
    enabled: user !== null,
  });
}

export function useEntityReferral(referralId: string) {
  const { user } = useAuth();
  const root = referralsRoot(user?.id ?? 'signed-out');
  const referral = useQuery({
    queryKey: [...root, 'detail', referralId],
    queryFn: () => fetchReferral(supabase, referralId),
    enabled: user !== null,
  });
  const updates = useQuery({
    queryKey: [...root, 'updates', referralId],
    queryFn: () => fetchReferralUpdates(supabase, referralId),
    enabled: user !== null,
  });
  return { referral, updates };
}

/** The organization's partner entities by name, for the referral form (RAPP-303). */
export function useSupportingEntityNames() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['supporting-entity-names', user?.id ?? 'signed-out'],
    queryFn: () => fetchSupportingEntityNames(supabase),
    enabled: user !== null,
  });
}

/**
 * The questions staff added to the referral form (RAPP-307), grouped by
 * screen. A failed load reads as none: the form still works without them.
 */
export function useReferralQuestions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['referral-questions', user?.id ?? 'signed-out'],
    queryFn: async (): Promise<readonly IntakeScreen[]> => {
      try {
        return referralScreens(await fetchIntakeCatalog(supabase));
      } catch {
        return [];
      }
    },
    enabled: user !== null,
  });
}

export function useReferralActions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: referralsRoot(user?.id ?? 'signed-out') });
  const create = useMutation({
    mutationFn: (input: CreateReferral) => createReferral(supabase, input),
    onSuccess: refresh,
  });
  // Right after the referral is created: the database lets only its sender answer.
  const saveAnswers = useMutation({
    mutationFn: (input: {
      readonly referralId: string;
      readonly answers: Readonly<Record<string, CustomAnswerValue | null>>;
    }) => saveReferralCustomAnswers(supabase, input.referralId, input.answers),
  });
  const addUpdate = useMutation({
    mutationFn: (input: { readonly referralId: string; readonly update: ReferralUpdateInput }) =>
      submitReferralUpdate(supabase, input.referralId, input.update),
    onSuccess: refresh,
  });
  return { create, saveAnswers, addUpdate };
}
