/**
 * Profile self-service wiring for the mobile app (RAPP-22).
 *
 * The shared hooks deliberately hold no Supabase client: they read the query and
 * mutation functions from the client's defaults, which is what this module
 * registers. That keeps the data package platform-neutral (the admin app will
 * register its own) and it is also what lets the rollback test drive a failing
 * write without mocking a network.
 */

import { logger } from '@/lib/observability';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import {
  fetchOwnDeletionRequest,
  fetchOwnProfile,
  ownDeletionRequestQueryKey,
  ownProfileQueryKey,
  requestOwnDeletion,
  updateOwnProfile,
  updateOwnProfileMutationKey,
} from '@ramassa/shared/profile';
import { buildUpdateOwnProfilePayload, type ProfileEdit } from '@ramassa/shared/schemas';

/**
 * Called once at app start. The profile is read fresh on every entry to the tab
 * rather than served from a long cache: it is the screen a woman opens to check
 * what the organization holds about her, and stale answers to that question are
 * worse than a spinner.
 */
export function registerProfileQueries(currentProfileId: () => string | null): void {
  queryClient.setQueryDefaults(ownProfileQueryKey, {
    queryFn: () => fetchOwnProfile(supabase),
    staleTime: 0,
  });

  queryClient.setQueryDefaults(ownDeletionRequestQueryKey, {
    queryFn: () => {
      const profileId = currentProfileId();
      return profileId === null ? null : fetchOwnDeletionRequest(supabase, profileId);
    },
  });

  queryClient.setMutationDefaults(updateOwnProfileMutationKey, {
    mutationFn: (edit: ProfileEdit) =>
      updateOwnProfile(supabase, buildUpdateOwnProfilePayload(edit)),
    onError: (error: unknown) => {
      logger.error('profile.update.failed', { error });
    },
  });
}

/** Files an RGPD erasure request and refreshes the pending-request banner. */
export async function submitDeletionRequest(params: {
  profileId: string;
  reason?: string;
}): Promise<void> {
  await requestOwnDeletion(supabase, params);
  await queryClient.invalidateQueries({ queryKey: ownDeletionRequestQueryKey });
}
