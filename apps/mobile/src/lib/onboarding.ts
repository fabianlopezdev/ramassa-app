/**
 * Onboarding wiring for the mobile app (RAPP-21): the draft store bound to the
 * app's MMKV, the completion action that calls the atomic RPC, and the pending
 * invitation the wizard pre-fills its referring entity from (RAPP-25).
 */

import { safeAsync } from '@/lib/observability';
import { privateStorage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { fetchMyPendingInvite } from '@ramassa/shared/accounts';
import { AppError, type Result } from '@ramassa/shared/errors';
import { createMmkvOnboardingDraftStore } from '@ramassa/shared/onboarding-drafts';
import type { CompleteOnboardingPayload } from '@ramassa/shared/schemas';

/** The one draft store the wizard screens share. */
export const onboardingDraftStore = createMmkvOnboardingDraftStore(privateStorage);

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

/**
 * The referring entity a staff invitation carries for the signed-in address
 * (RAPP-25), or null: most players sign up uninvited, and a failed lookup is
 * the same null. The prefill is a CONVENIENCE, so nothing about it may block
 * or break the wizard.
 *
 * The RPC takes no argument: the address comes from the verified JWT
 * server-side, so a forwarded invite link cannot pre-fill for the wrong woman.
 */
export function usePendingInviteEntity(): string | null {
  const [entity, setEntity] = useState<string | null>(null);

  useEffect(() => {
    // An AbortController, not only a mounted flag. The flag stops the state
    // write, which is the crash; the controller stops the REQUEST, which is the
    // battery and the data. A player who taps through step 3 quickly leaves
    // this lookup in flight behind her.
    const controller = new AbortController();
    void safeAsync(() => fetchMyPendingInvite(supabase, { signal: controller.signal }), {
      code: 'DB-1',
    }).then((result) => {
      // The abort itself arrives here as a failure, and it is one nobody needs
      // to hear about: `result.ok` is false and the prefill is a convenience.
      if (controller.signal.aborted || !result.ok) return;
      setEntity(result.value?.reference_entity ?? null);
    });
    return () => controller.abort();
  }, []);

  return entity;
}
