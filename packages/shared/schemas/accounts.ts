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
export const createParticipantInviteSchema = z.object({
  email: loginEmailSchema,
  referenceEntity: z.string().trim().optional(),
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
 */
export function buildCreateParticipantInvitePayload(
  input: CreateParticipantInvite,
  referralId: string | null = null,
) {
  return {
    email: input.email,
    reference_entity: normalizedEntity(input.referenceEntity),
    referral_id: referralId,
  };
}
export type CreateParticipantInvitePayload = ReturnType<typeof buildCreateParticipantInvitePayload>;
