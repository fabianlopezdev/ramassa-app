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
  identityStepSchema,
  logisticsFields,
  normalizeDependents,
  refineDependents,
  refineDocumentNumber,
} from './onboarding';

export const profileEditSchema = z
  .object({
    ...identityStepSchema.shape,
    ...documentationFields.shape,
    ...logisticsFields.shape,
    mediaConsent: z.boolean(),
  })
  .superRefine(refineDocumentNumber)
  .superRefine(refineDependents);

export type ProfileEdit = z.infer<typeof profileEditSchema>;

/**
 * The row `public.get_own_profile()` returns: the profile with its encrypted
 * columns already decrypted server-side. Declared structurally rather than
 * pulled from the generated database types because those live in a package this
 * one must not depend on, and the RPC's shape is pinned by pgTAP either way.
 */
export interface ProfileRow {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  place_of_birth: string | null;
  nationality: string | null;
  preferred_language: string;
  document_type: string | null;
  document_number: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  reference_entity: string | null;
  reference_contact_name: string | null;
  has_dependents: boolean;
  num_dependents: number;
  clothing_size: string | null;
  shoe_size: string | null;
  avatar_url: string | null;
  media_consent: boolean;
  terms_accepted_at: string | null;
}

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
    documentType: row.document_type ?? 'none',
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
    document_type: normalized.documentType,
    document_number: normalized.documentNumber ?? null,
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
