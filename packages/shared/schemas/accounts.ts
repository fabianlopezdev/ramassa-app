/**
 * Account-lifecycle schemas (RAPP-25): what staff type when creating a
 * participant account or an invitation, and the exact snake_case payloads the
 * SECURITY DEFINER RPCs read. Client validates for UX; the RPCs re-validate
 * for security (rule 6) — a payload that skips this schema still cannot mint
 * a nameless account or an invite to a malformed address.
 *
 * What is ABSENT is deliberate: there is no email on the account form (the
 * SERVER generates the internal address, so there is no rule for staff to
 * remember and no way to get it wrong), and no password anywhere (it exists
 * only in the RPC's one-time response).
 */

import { z } from 'zod';
import { loginEmailSchema } from './auth';

/** A staff member creating an account for a participant who has no email. */
export const createParticipantAccountSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  referenceEntity: z.string().trim().optional(),
});
export type CreateParticipantAccountInput = z.input<typeof createParticipantAccountSchema>;
export type CreateParticipantAccount = z.infer<typeof createParticipantAccountSchema>;

/**
 * An invitation for a participant who DOES have an email. The address goes
 * through the SAME normalization as login (trim, lowercase), so the invite row
 * matches the identity that eventually signs in, capitals included.
 */
export const createParticipantInviteSchema = z.object({
  email: loginEmailSchema,
  referenceEntity: z.string().trim().optional(),
});
export type CreateParticipantInviteInput = z.input<typeof createParticipantInviteSchema>;
export type CreateParticipantInvite = z.infer<typeof createParticipantInviteSchema>;

/**
 * '' and undefined both mean "no referring entity", stored as NULL, never ''.
 * Trimmed HERE as well as in the schemas: the builders are also called on
 * values that skipped parsing, and a whitespace-only entity must not become a
 * distinct reporting bucket.
 */
function normalizedEntity(referenceEntity: string | undefined): string | null {
  const trimmed = referenceEntity?.trim();
  return trimmed === undefined || trimmed === '' ? null : trimmed;
}

export function buildCreateParticipantAccountPayload(input: CreateParticipantAccount) {
  return {
    first_name: input.firstName,
    last_name: input.lastName,
    reference_entity: normalizedEntity(input.referenceEntity),
  };
}
export type CreateParticipantAccountPayload = ReturnType<
  typeof buildCreateParticipantAccountPayload
>;

export function buildCreateParticipantInvitePayload(input: CreateParticipantInvite) {
  return {
    email: input.email,
    reference_entity: normalizedEntity(input.referenceEntity),
  };
}
export type CreateParticipantInvitePayload = ReturnType<typeof buildCreateParticipantInvitePayload>;
