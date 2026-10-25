/**
 * Which profile fields a team member sees on a participant's card (RAPP-281).
 *
 * Each field's level is the layout's (D9, RAPP-663): Normal for everyone with
 * `participants.view`, Personal with `participants.view_personal`, Sensitive
 * with `participants.view_sensitive`. Staff choose it on Dades de les
 * jugadores; the phone reads it from her organization's fields. Her app
 * language, her season count and her consents are her account's, read by
 * anyone who may see her. The database already leaves out an answer above the
 * reader's level. The card still needs the level, because a missing answer she
 * may see means "not provided" and one she may not see must not show at all.
 */
import type { SystemFieldKey } from '@ramassa/shared/intake';
import type { QuestionPrivacy, SystemFieldIndex } from '@ramassa/shared/intake-builder';

export interface ParticipantFieldAccess {
  readonly personal: boolean;
  readonly sensitive: boolean;
}

/**
 * The card's rows in the order it shows them, the web admin's order: each an
 * app field by its system key, or one of her account's settings.
 */
const PARTICIPANT_PROFILE_FIELDS = [
  { key: 'dateOfBirth', field: 'date_of_birth' },
  { key: 'placeOfBirth', field: 'place_of_birth' },
  { key: 'nationality', field: 'nationality' },
  { key: 'language', field: null },
  { key: 'documentType', field: 'document_type' },
  { key: 'documentNumber', field: 'document_number' },
  { key: 'phone', field: 'phone' },
  { key: 'address', field: 'address' },
  { key: 'city', field: 'city' },
  { key: 'postalCode', field: 'postal_code' },
  { key: 'entity', field: 'reference_entity' },
  { key: 'referenceContact', field: 'reference_contact_name' },
  { key: 'dependents', field: 'has_dependents' },
  { key: 'clothingSize', field: 'clothing_size' },
  { key: 'shoeSize', field: 'shoe_size' },
  // The season registration answers (RAPP-303).
  { key: 'applicantStatus', field: 'applicant_status' },
  { key: 'supportingEntities', field: 'supporting_entities' },
  { key: 'seasonNumber', field: null },
  { key: 'childcareNeed', field: 'childcare_need' },
  { key: 'specificNeeds', field: 'specific_needs' },
  { key: 'mediaConsent', field: null },
  { key: 'terms', field: null },
] as const satisfies readonly { readonly key: string; readonly field: SystemFieldKey | null }[];

export type ParticipantProfileField = (typeof PARTICIPANT_PROFILE_FIELDS)[number]['key'];

export function participantFieldAccess(permissions: ReadonlySet<string>): ParticipantFieldAccess {
  return {
    personal: permissions.has('participants.view_personal'),
    sensitive: permissions.has('participants.view_sensitive'),
  };
}

function reads(access: ParticipantFieldAccess, privacy: QuestionPrivacy): boolean {
  return (
    privacy === 'normal' ||
    (privacy === 'personal' && access.personal) ||
    (privacy === 'sensitive' && access.sensitive)
  );
}

/**
 * The card's rows this reader sees, each at its field's level in her
 * organization's layout. A field the layout no longer has shows no row.
 */
export function visibleProfileFields(
  access: ParticipantFieldAccess,
  fields: SystemFieldIndex,
): readonly ParticipantProfileField[] {
  return PARTICIPANT_PROFILE_FIELDS.filter((row) => {
    if (row.field === null) return true;
    const field = fields.get(row.field);
    return field !== undefined && reads(access, field.privacy);
  }).map((row) => row.key);
}
