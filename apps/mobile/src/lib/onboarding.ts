/**
 * Onboarding wiring for the mobile app (RAPP-21): the draft store bound to the
 * app's MMKV, the completion action that calls the atomic RPC, and the pending
 * invitation the wizard pre-fills its referring entity from (RAPP-25).
 */

import { safeAsync } from '@/lib/observability';
import { privateStorage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { createWizardDraftStore } from '@/lib/wizard-draft';
import { useEffect, useState } from 'react';
import type { Database } from '@ramassa/shared';
import { fetchMyPendingInvite } from '@ramassa/shared/accounts';
import { AppError, type Result } from '@ramassa/shared/errors';
import {
  answerPayload,
  type FieldAnswers,
  type formSignaturesPayload,
} from '@ramassa/shared/intake-builder';
import { createAccountOnboardingDraftStore } from '@ramassa/shared/onboarding-drafts';

/**
 * The one draft store the wizard screens share. Her phone keeps the draft by
 * field (RAPP-663); the screens load and save their forms through it, which
 * needs her organization's fields: the onboarding layout sets them before any
 * screen mounts.
 */
export const onboardingDraftStore = createWizardDraftStore(
  createAccountOnboardingDraftStore(privateStorage),
);

/**
 * What she sends when she finishes: her names, her settings, her answers by
 * field and her signatures of the signature blocks, by block id (RAPP-690).
 * The terms' version, language and photo choice travel here only for an
 * older server's terms; the terms form names them itself (RAPP-772).
 */
export interface CompleteOnboardingRequest {
  readonly first_name: string;
  readonly last_name: string;
  readonly preferred_language: string;
  readonly media_consent?: boolean;
  readonly terms_version?: string;
  readonly locale_shown?: string;
  readonly answers: FieldAnswers;
  readonly signatures: ReturnType<typeof formSignaturesPayload>;
  /** Her ticks of the consents her Onboarding asks, by key (RAPP-699), when it asks one. */
  readonly consents?: Readonly<Record<string, boolean>>;
}

/**
 * Completes onboarding through `public.complete_onboarding_signed`: profile,
 * answers, terms acceptance, signatures and consents in one server-side
 * transaction, sensitive fields encrypted there so the key never touches this
 * device. `signing` is what she gave on the terms (`appTermsSubmission`).
 * On success the caller clears the protected draft copy of the intake answers
 * and refreshes the auth profile so the gate flips.
 */
export function completeOnboarding(
  request: CompleteOnboardingRequest,
  signing: Readonly<Record<string, unknown>>,
): Promise<Result<void, AppError>> {
  return safeAsync(
    async () => {
      const { error } = await supabase.rpc('complete_onboarding_signed', {
        payload: { ...request, answers: answerPayload(request.answers) },
        p_signing:
          signing as Database['public']['Functions']['complete_onboarding_signed']['Args']['p_signing'],
      });
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
