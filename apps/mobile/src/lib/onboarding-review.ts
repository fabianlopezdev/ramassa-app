/**
 * Onboarding's Nova versió on her phone (RAPP-697): the screens staff saved
 * as a new version after she finished Onboarding. While any is pending she
 * goes through them, with the Onboarding wizard, before using the app.
 *
 * A failed lookup lets her in, as every gate does: a network flake must never
 * lock out a player who already joined.
 */

import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import { fetchMyOnboardingReview } from '@ramassa/shared/intake-builder';

const reviewKey = (userId: string) => ['onboarding-review', userId] as const;

export function useOnboardingReview(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: reviewKey(user?.id ?? 'signed-out'),
    queryFn: () => fetchMyOnboardingReview(supabase),
    enabled: enabled && user !== null,
    retry: 1,
    refetchOnMount: 'always',
  });
}

/** After she finishes: the gate reads her screens again and lets her in. */
export function useRefreshOnboardingReview() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: reviewKey(user?.id ?? 'signed-out') });
}
