/**
 * Onboarding's Nova versió on her phone (RAPP-697): the screens staff saved
 * as a new version after she finished Onboarding. While any is pending she
 * goes through them, with the Onboarding wizard, before using the app.
 *
 * A failed lookup lets her in, as every gate does: a network flake must never
 * lock out a player who already joined.
 */

import { safeAsync } from '@/lib/observability';
import { onboardingDraftStore } from '@/lib/onboarding';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import {
  completeOnboardingReview,
  fetchMyOnboardingReview,
  type OnboardingReviewPayload,
} from '@ramassa/shared/intake-builder';

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

/**
 * Saves her review. Once saved, her draft goes and the gate reads her screens
 * again, which opens the app. False when the save failed.
 */
export function useFinishOnboardingReview() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return async (payload: OnboardingReviewPayload): Promise<boolean> => {
    const result = await safeAsync(() => completeOnboardingReview(supabase, payload), {
      code: 'DB-1',
    });
    if (result.ok) {
      if (user !== null) onboardingDraftStore.clearUserDraft(user.id);
      await queryClient.invalidateQueries({ queryKey: reviewKey(user?.id ?? 'signed-out') });
    }
    return result.ok;
  };
}
