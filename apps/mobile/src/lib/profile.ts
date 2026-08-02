/**
 * Profile self-service wiring for the mobile app (RAPP-22).
 *
 * The shared hooks deliberately hold no Supabase client: they read the query and
 * mutation functions from the client's defaults, which is what this module
 * registers. That keeps the data package platform-neutral (the admin app will
 * register its own) and it is also what lets the rollback test drive a failing
 * write without mocking a network.
 */

import { logger, safeAsync } from '@/lib/observability';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import type { AppError, Result } from '@ramassa/shared/errors';
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
  // `signal` is React Query's own, and it aborts the request when the query is
  // cancelled or the last screen using it unmounts. Forwarded rather than
  // dropped because this query refetches on EVERY entry to the tab (staleTime
  // 0), so leaving the tab mid-flight otherwise leaves the radio open on a
  // low-end phone for an answer nobody is waiting for.
  queryClient.setQueryDefaults(ownProfileQueryKey, {
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchOwnProfile(supabase, { signal }),
    staleTime: 0,
  });

  queryClient.setQueryDefaults(ownDeletionRequestQueryKey, {
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      const profileId = currentProfileId();
      return profileId === null ? null : fetchOwnDeletionRequest(supabase, profileId, { signal });
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

/**
 * Files an RGPD erasure request and refreshes the pending-request banner.
 *
 * Returns a `Result` through the app's wired `safeAsync` (contract rule 7)
 * rather than throwing for the screen to catch. The screen's own try/catch did
 * produce a typed code, but it was the ONLY failing write in the app that never
 * reached the logger or Sentry: a woman exercising her right to erasure could
 * be failing repeatedly and nothing outside her phone would know.
 *
 * The invalidation is inside the guarded operation deliberately. Refreshing the
 * banner after a write that did not happen would ask the server the same
 * question again for nothing, and any failure of the refresh itself is still a
 * failure to show her that her request arrived.
 */
export function submitDeletionRequest(params: {
  profileId: string;
  reason?: string;
}): Promise<Result<void, AppError>> {
  return safeAsync(
    async () => {
      await requestOwnDeletion(supabase, params);
      await queryClient.invalidateQueries({ queryKey: ownDeletionRequestQueryKey });
    },
    { code: 'DB-1' },
  );
}
