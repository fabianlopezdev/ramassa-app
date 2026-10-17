/**
 * Which profile fields a team member sees on a participant's card (RAPP-281).
 *
 * The levels are the database's (RAPP-240): Basic fields for everyone with
 * `participants.view`, Personal fields with `participants.view_personal`, and
 * the four encrypted Sensitive fields with `participants.view_sensitive`. The
 * database already returns null for a field above the reader's level. The card
 * still needs the level, because a null she may see means "not provided" and a
 * null she may not see must not show at all.
 */

type ParticipantFieldLevel = 'basic' | 'personal' | 'sensitive';

export interface ParticipantFieldAccess {
  readonly personal: boolean;
  readonly sensitive: boolean;
}

/** The profile fields in the order the card shows them, the web admin's order. */
const PARTICIPANT_PROFILE_FIELDS = [
  { key: 'dateOfBirth', level: 'personal' },
  { key: 'placeOfBirth', level: 'personal' },
  { key: 'nationality', level: 'personal' },
  { key: 'language', level: 'basic' },
  { key: 'documentType', level: 'personal' },
  { key: 'documentNumber', level: 'sensitive' },
  { key: 'phone', level: 'sensitive' },
  { key: 'address', level: 'sensitive' },
  { key: 'city', level: 'personal' },
  { key: 'postalCode', level: 'sensitive' },
  { key: 'entity', level: 'basic' },
  { key: 'referenceContact', level: 'personal' },
  { key: 'dependents', level: 'personal' },
  { key: 'clothingSize', level: 'basic' },
  { key: 'shoeSize', level: 'basic' },
  // The season registration answers (RAPP-303), at the levels the database applies.
  { key: 'applicantStatus', level: 'sensitive' },
  { key: 'supportingEntities', level: 'personal' },
  { key: 'seasonNumber', level: 'basic' },
  { key: 'childcareNeed', level: 'personal' },
  { key: 'specificNeeds', level: 'sensitive' },
  { key: 'mediaConsent', level: 'basic' },
  { key: 'terms', level: 'basic' },
] as const satisfies readonly { readonly key: string; readonly level: ParticipantFieldLevel }[];

export type ParticipantProfileField = (typeof PARTICIPANT_PROFILE_FIELDS)[number]['key'];

export function participantFieldAccess(permissions: ReadonlySet<string>): ParticipantFieldAccess {
  return {
    personal: permissions.has('participants.view_personal'),
    sensitive: permissions.has('participants.view_sensitive'),
  };
}

export function visibleProfileFields(
  access: ParticipantFieldAccess,
): readonly ParticipantProfileField[] {
  return PARTICIPANT_PROFILE_FIELDS.filter(
    (field) =>
      field.level === 'basic' ||
      (field.level === 'personal' && access.personal) ||
      (field.level === 'sensitive' && access.sensitive),
  ).map((field) => field.key);
}
