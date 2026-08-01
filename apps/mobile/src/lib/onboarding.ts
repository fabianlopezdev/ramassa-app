/**
 * Onboarding wiring for the mobile app (RAPP-21): the draft store bound to the
 * app's MMKV, and the completion action that calls the atomic RPC.
 */

import { safeAsync } from '@/lib/observability';
import { mmkvStorage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { AppError, type Result } from '@ramassa/shared/errors';
import { createMmkvOnboardingDraftStore } from '@ramassa/shared/onboarding-drafts';
import type { CompleteOnboardingPayload } from '@ramassa/shared/schemas';

/** The one draft store the wizard screens share. */
export const onboardingDraftStore = createMmkvOnboardingDraftStore(mmkvStorage);

/**
 * Completes onboarding through `public.complete_onboarding`: profile plus
 * terms acceptance in one server-side transaction, sensitive fields encrypted
 * there so the key never touches this device. On success the caller clears the
 * draft (the only unencrypted copy of the intake PII) and refreshes the auth
 * profile so the gate flips.
 */
export function completeOnboarding(
  payload: CompleteOnboardingPayload,
): Promise<Result<void, AppError>> {
  return safeAsync(
    async () => {
      const { error } = await supabase.rpc('complete_onboarding', { payload });
      if (error) {
        throw new AppError('DB-1', { message: error.message });
      }
    },
    { code: 'DB-1' },
  );
}
