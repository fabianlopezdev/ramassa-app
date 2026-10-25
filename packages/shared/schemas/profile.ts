/**
 * Editing your own profile (RAPP-22).
 *
 * Composed from the INTAKE field objects and refinement functions, never
 * re-declared. The same woman's NIE has to be judged by the same rule whether
 * she typed it during onboarding or fixed a typo six months later; two
 * declarations is how "valid" quietly comes to mean two different things inside
 * one product, and the one that drifts is always the one nobody re-read.
 *
 * The terms step is deliberately NOT part of this: acceptance is a versioned
 * event, not a form field, and it is not revocable by editing a profile. Media
 * consent IS here, because that grant is revocable by design and this screen is
 * where the wizard told her she could change it.
 */

import { z } from 'zod';
import {
  appAnswersFromForm,
  appFormToSend,
  appFormValues,
  type AppFormValues,
} from '../intake-builder/app-field-form';
import type { SystemFieldIndex } from '../intake-builder/field-answers';
import type { CustomAnswerValue } from '../intake-builder/question-types';
import {
  documentationFields,
  identityFields,
  logisticsFields,
  normalizeDependents,
  refineDependents,
  refineDocumentNumber,
} from './onboarding';
import { seasonAnswerFields } from './season';

const profileEditFields = z.object({
  ...identityFields.shape,
  ...documentationFields.shape,
  ...logisticsFields.shape,
  // The season registration answers (RAPP-303): she can correct them too.
  ...seasonAnswerFields.shape,
  mediaConsent: z.boolean(),
});

export const profileEditSchema = profileEditFields
  .superRefine(refineDocumentNumber)
  .superRefine(refineDependents);

export type ProfileEdit = z.infer<typeof profileEditSchema>;

/**
 * The staff form for a person without `participants.view_sensitive` (RAPP-281).
 * Her screen has no document number, phone, address or postal code, so the
 * document rule cannot run here: the database keeps the stored values and runs
 * the same rule on the stored number instead.
 */
export const profileEditWithoutSensitiveSchema = profileEditFields.superRefine(refineDependents);

/**
 * Her record as the readers return it since RAPP-662 (`get_own_profile`,
 * `get_participant_profile`): her account (names, app language, settings and
 * the season authorization's answers) and her answers by field id, each in the
 * shape its field stores. Unknown keys are stripped, so a column the server
 * adds does not break a phone that has not updated.
 */
export const profileRecordSchema = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  preferred_language: z.string(),
  avatar_url: z.string().nullable(),
  media_consent: z.boolean(),
  terms_accepted_at: z.string().nullable(),
  season_number: z.number().int().nullish(),
  // From the season authorization (RAPP-304). The medical answer reaches staff
  // only with participants.view_health.
  health_info: z.string().nullish(),
  emergency_contact_name: z.string().nullish(),
  emergency_contact_relation: z.string().nullish(),
  emergency_contact_phone: z.string().nullish(),
  answers: z.record(z.string(), z.unknown()).default({}),
});

export type ProfileRecord = z.infer<typeof profileRecordSchema>;

/** A record with her organization's app fields, so its answers can be read by form name. */
export interface ProfileRecordWithFields extends ProfileRecord {
  readonly fields: SystemFieldIndex;
}

/** Her record as the edit form holds it: her account and her answers by form name. */
export type ProfileForm = Omit<
  AppFormValues,
  | 'dateOfBirth'
  | 'placeOfBirth'
  | 'nationality'
  | 'referenceEntity'
  | 'numDependents'
  | 'clothingSize'
  | 'shoeSize'
  | 'supportingEntities'
> & {
  readonly firstName: string;
  readonly lastName: string;
  readonly preferredLanguage: string;
  readonly mediaConsent: boolean;
  readonly avatarUrl?: string;
  readonly seasonNumber?: number;
  readonly dateOfBirth: string;
  readonly placeOfBirth: string;
  readonly nationality: string;
  /** Null is "None" (or no entity named). */
  readonly referenceEntity: string | null;
  readonly numDependents: number;
  readonly clothingSize: string;
  readonly shoeSize: string;
  readonly supportingEntities: string[];
};

/**
 * Her record as the edit form wants it (RAPP-663): her account, and her answers
 * read by field through the layout. An answer nobody gave stays absent:
 * "not given" never reads as "I have none".
 */
export function profileFormOf(record: ProfileRecordWithFields): ProfileForm {
  const values = appFormValues(record.fields, record.answers);
  return {
    firstName: record.first_name,
    lastName: record.last_name,
    dateOfBirth: values.dateOfBirth ?? '',
    placeOfBirth: values.placeOfBirth ?? '',
    nationality: values.nationality ?? '',
    preferredLanguage: record.preferred_language,
    documentType: values.documentType,
    documentNumber: values.documentNumber,
    documentName: values.documentName,
    phone: values.phone,
    address: values.address,
    city: values.city,
    postalCode: values.postalCode,
    referenceEntity: values.referenceEntity ?? null,
    referenceContactName: values.referenceContactName,
    hasDependents: values.hasDependents,
    numDependents: values.numDependents ?? 0,
    clothingSize: values.clothingSize ?? '',
    shoeSize: values.shoeSize ?? '',
    avatarUrl: record.avatar_url ?? undefined,
    applicantStatus: values.applicantStatus,
    applicantStatusDetails: values.applicantStatusDetails,
    supportingEntities: values.supportingEntities ?? [],
    seasonNumber: record.season_number ?? undefined,
    childcareNeed: values.childcareNeed,
    specificNeeds: values.specificNeeds,
    mediaConsent: record.media_consent,
  };
}

/** What `update_own_profile` takes: her names and settings, and her answers by field. */
export interface ProfileUpdate {
  readonly first_name: string;
  readonly last_name: string;
  readonly preferred_language: string;
  readonly media_consent: boolean;
  readonly season_number: number | null;
  readonly answers: Readonly<Record<string, CustomAnswerValue | null>>;
}

/**
 * A checked edit as what to send (RAPP-663): every answer by field, with the
 * rules every screen shares (`appFormToSend`). An answer she emptied is null,
 * which removes it; one she gave again unchanged keeps whoever gave it first.
 */
export function profileUpdateOf(fields: SystemFieldIndex, edit: ProfileEdit): ProfileUpdate {
  const normalized = normalizeDependents(edit);
  return {
    first_name: normalized.firstName,
    last_name: normalized.lastName,
    preferred_language: normalized.preferredLanguage,
    media_consent: normalized.mediaConsent,
    season_number: normalized.seasonNumber ?? null,
    answers: appAnswersFromForm(fields, appFormToSend(normalized)),
  };
}

/**
 * The most recent erasure request this participant filed. `state` stays an open
 * string: the workflow the staff side runs is theirs to extend, and a phone
 * that has not been updated must not reject a row because a new state was added
 * on the server.
 */
export const ownDeletionRequestSchema = z.object({
  id: z.string(),
  state: z.string(),
  created_at: z.string(),
});

export type OwnDeletionRequest = z.infer<typeof ownDeletionRequestSchema>;

/** What a participant may ask staff to do with her data (RGPD art. 17). */
export const deletionRequestSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
});
export type DeletionRequest = z.infer<typeof deletionRequestSchema>;
