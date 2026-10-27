/**
 * The forms chained after Onboarding (RAPP-703) on her phone: right after
 * her Onboarding and the app terms, a new player goes through them in the
 * order the team set on the Onboarding board, then into the app.
 *
 * The walk reuses the gates that already exist: the authorization screen and
 * the form wizard of the forms the team creates (RAPP-700, RAPP-701). Only
 * the order changes: while the chain is ahead of her, the next chained form
 * that applies to her opens first. An optional form she puts off ("passed")
 * leaves the walk and stays on Home by its own rules. When none is left, the
 * walk ends for good. A failed lookup lets her in, as every gate does.
 */

import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import {
  fetchMyOnboardingChain,
  finishOnboardingChain,
  type ChainedFormRef,
} from '@ramassa/shared/intake-builder';

const chainKey = (userId: string) => ['onboarding-chain', userId] as const;

/** Her chain while it is ahead of her; empty once done, or for anyone else. */
export function useMyOnboardingChain(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: chainKey(user?.id ?? 'signed-out'),
    queryFn: () => fetchMyOnboardingChain(supabase),
    enabled: enabled && user !== null,
    retry: 1,
    refetchOnMount: 'always',
  });
}

/** An optional chained form she puts off: the walk goes on without it. */
export function usePassChainedForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return (ref: ChainedFormRef) => {
    queryClient.setQueryData<readonly ChainedFormRef[]>(
      chainKey(user?.id ?? 'signed-out'),
      (chain) => chain?.filter((each) => each !== ref),
    );
  };
}

/** No chained form is left for her: the walk ends, also when the save fails. */
export function useFinishOnboardingChain() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return async () => {
    await safeAsync(() => finishOnboardingChain(supabase), { code: 'DB-1' });
    queryClient.setQueryData<readonly ChainedFormRef[]>(chainKey(user?.id ?? 'signed-out'), []);
  };
}
