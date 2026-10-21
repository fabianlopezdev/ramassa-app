/**
 * Participant invitation schemas (RAPP-25, RAPP-227): what staff type when
 * inviting a player, and the exact snake_case payload the SECURITY DEFINER RPC
 * reads. Client validates for UX; the RPC re-validates for security (rule 6), so
 * a payload that skips this schema still cannot invite a malformed address.
 *
 * Every player joins by invitation with her own email (RAPP-224). A player
 * without an email gets help creating one first; there is no account path
 * without one.
 */

import { z } from 'zod';
import { loginEmailSchema } from './auth';

/**
 * The address goes through the SAME normalization as login (trim, lowercase),
 * so the invite row matches the identity that eventually signs in, capitals
 * included.
 */
/**
 * Her name is required: the invitation creates her profile with it, so staff
 * can complete what they know before her first login (RAPP-300).
 */
export const createParticipantInviteSchema = z.object({
  email: loginEmailSchema,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  referenceEntity: z.string().trim().optional(),
  /**
   * A test player (RAPP-615), made up for designing the onboarding. Off unless
   * staff turn it on; the database refuses it to anyone who may not set it.
   */
  isTestAccount: z.boolean().default(false),
});
export type CreateParticipantInviteInput = z.input<typeof createParticipantInviteSchema>;
export type CreateParticipantInvite = z.infer<typeof createParticipantInviteSchema>;

/**
 * '' and undefined both mean "no referring entity", stored as NULL, never ''.
 * Trimmed HERE as well as in the schema: the builder is also called on values
 * that skipped parsing, and a whitespace-only entity must not become a distinct
 * reporting bucket.
 */
function normalizedEntity(referenceEntity: string | undefined): string | null {
  const trimmed = referenceEntity?.trim();
  return trimmed === undefined || trimmed === '' ? null : trimmed;
}

/**
 * `referralId` is the pending partner-entity referral the invitation answers,
 * if staff opened the form from one. The database links it to her profile when
 * she finishes the onboarding wizard.
 *
 * `questionStates` is what staff confirmed her wizard asks (RAPP-618): only the
 * questions set to Ask or Don't ask. The database saves them in the same
 * transaction as the invitation, or creates nothing.
 */
export function buildCreateParticipantInvitePayload(
  input: CreateParticipantInviteInput,
  referralId: string | null = null,
  questionStates: Readonly<Record<string, 'ask' | 'skip'>> = {},
) {
  const isTestAccount = input.isTestAccount === true;
  return {
    ...(Object.keys(questionStates).length === 0 ? {} : { question_states: questionStates }),
    email: input.email,
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    reference_entity: normalizedEntity(input.referenceEntity),
    // A test player is made up, so she never answers a real referral.
    referral_id: isTestAccount ? null : referralId,
    is_test_account: isTestAccount,
  };
}
export type CreateParticipantInvitePayload = ReturnType<typeof buildCreateParticipantInvitePayload>;
