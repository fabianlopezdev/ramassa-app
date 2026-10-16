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
  documentationFields,
  documentNumberToSend,
  identityStepSchema,
  logisticsFields,
  normalizeDependents,
  refineDependents,
  refineDocumentNumber,
} from './onboarding';
import {
  APPLICANT_STATUSES,
  CHILDCARE_NEEDS,
  seasonAnswerFields,
  seasonAnswersPayload,
} from './season';

const profileEditFields = z.object({
  ...identityStepSchema.shape,
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
 * The row `public.get_own_profile()` returns: the profile with its encrypted
 * columns already decrypted server-side. Declared structurally rather than
 * pulled from the generated database types because those live in a package this
 * one must not depend on, and the RPC's shape is pinned by pgTAP either way.
 *
 * A SCHEMA, not just an interface (contract rule 6: external API responses are
 * parsed). An interface is a promise the compiler cannot keep about a payload
 * that arrived over the network: the previous `data as ProfileRow[]` cast meant
 * a renamed column reached the screens as `undefined` and rendered as "Sense
 * omplir", which is the app quietly telling a woman it holds nothing about her.
 * Parsing turns that into a typed `DB-1` with a retry.
 *
 * Unknown keys are stripped rather than rejected, so a migration that ADDS a
 * column does not break every phone that has not updated yet.
 */
export const profileRowSchema = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  date_of_birth: z.string().nullable(),
  place_of_birth: z.string().nullable(),
  nationality: z.string().nullable(),
  preferred_language: z.string(),
  document_type: z.string().nullable(),
  document_number: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  postal_code: z.string().nullable(),
  reference_entity: z.string().nullable(),
  reference_contact_name: z.string().nullable(),
  has_dependents: z.boolean(),
  num_dependents: z.number(),
  clothing_size: z.string().nullable(),
  shoe_size: z.string().nullable(),
  avatar_url: z.string().nullable(),
  media_consent: z.boolean(),
  terms_accepted_at: z.string().nullable(),
  // The season registration answers (RAPP-303). Optional, so a server without
  // them still parses. Applicant status and specific needs arrive only for her
  // own profile, or for staff with participants.view_sensitive.
  applicant_status: z.enum(APPLICANT_STATUSES).nullish(),
  supporting_entities: z.array(z.string()).nullish(),
  season_number: z.number().int().nullish(),
  childcare_need: z.enum(CHILDCARE_NEEDS).nullish(),
  specific_needs: z.string().nullish(),
});

export type ProfileRow = z.infer<typeof profileRowSchema>;

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

/**
 * A decrypted row as the edit form wants it. NULL becomes `undefined` for the
 * optional fields rather than an empty string, so a profile whose phone was
 * never given reads as absent and not as an invalid phone the woman never typed.
 */
export function profileFromRow(row: ProfileRow): Record<string, unknown> {
  return {
    firstName: row.first_name,
    lastName: row.last_name,
    dateOfBirth: row.date_of_birth ?? '',
    placeOfBirth: row.place_of_birth ?? '',
    nationality: row.nationality ?? '',
    preferredLanguage: row.preferred_language,
    // Empty stays empty (RAPP-302): "not given" must never read as "I have none".
    documentType: row.document_type ?? undefined,
    documentNumber: row.document_number ?? undefined,
    phone: row.phone ?? undefined,
    address: row.address ?? undefined,
    city: row.city ?? undefined,
    postalCode: row.postal_code ?? undefined,
    referenceEntity: row.reference_entity,
    referenceContactName: row.reference_contact_name ?? undefined,
    hasDependents: row.has_dependents,
    numDependents: row.num_dependents,
    clothingSize: row.clothing_size ?? 'M',
    shoeSize: row.shoe_size ?? '38',
    avatarUrl: row.avatar_url ?? undefined,
    applicantStatus: row.applicant_status ?? undefined,
    supportingEntities: row.supporting_entities ?? [],
    seasonNumber: row.season_number ?? undefined,
    childcareNeed: row.childcare_need ?? undefined,
    specificNeeds: row.specific_needs ?? undefined,
    mediaConsent: row.media_consent,
  };
}

/**
 * The exact snake_case payload `public.update_own_profile(jsonb)` reads. No type
 * checker crosses the SQL boundary, so a mistyped key would silently become a
 * NULLed column: this mapper and its test are the only guard.
 *
 * What is ABSENT here is as deliberate as what is present. There is no `role`,
 * no `org_id`, no `terms_accepted_at`: the RPC ignores them anyway, and not
 * sending them means no client bug can even attempt the escalation.
 */
export function buildUpdateOwnProfilePayload(edit: ProfileEdit) {
  const normalized = normalizeDependents(edit);
  return {
    first_name: normalized.firstName,
    last_name: normalized.lastName,
    date_of_birth: normalized.dateOfBirth,
    place_of_birth: normalized.placeOfBirth,
    nationality: normalized.nationality,
    preferred_language: normalized.preferredLanguage,
    document_type: normalized.documentType ?? null,
    document_number: documentNumberToSend(normalized),
    phone: normalized.phone ?? null,
    address: normalized.address ?? null,
    city: normalized.city ?? null,
    postal_code: normalized.postalCode ?? null,
    reference_entity: normalized.referenceEntity,
    reference_contact_name: normalized.referenceContactName ?? null,
    has_dependents: normalized.hasDependents,
    num_dependents: normalized.numDependents,
    clothing_size: normalized.clothingSize,
    shoe_size: normalized.shoeSize,
    media_consent: normalized.mediaConsent,
    ...seasonAnswersPayload(normalized),
  };
}

export type UpdateOwnProfilePayload = ReturnType<typeof buildUpdateOwnProfilePayload>;

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
