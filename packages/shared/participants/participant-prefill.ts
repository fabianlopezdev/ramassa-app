/**
 * Staff completing the record of a woman who has not joined yet (RAPP-300).
 *
 * Her profile was created with her invitation, so staff can fill in what they
 * already know and her wizard asks only the rest. Three rules keep that honest:
 *   - only what somebody answered is shown: a column default (no dependants,
 *     Catalan, the "M" a full edit form would preselect) is not an answer;
 *   - only her names are required: everything else may still be unknown;
 *   - only the fields staff changed are sent, because every field sent becomes
 *     a staff answer and the wizard then stops asking it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from '../errors';
import {
  answeredQuestionsSchema,
  type AnsweredQuestions,
  type IntakeQuestion,
} from '../onboarding/intake';
import {
  CLOTHING_SIZES,
  DOCUMENT_TYPES,
  documentNumberToSend,
  identityStepSchema,
  logisticsFields,
  NIE_PATTERN,
  SHOE_SIZES,
} from '../schemas/onboarding';
import { seasonAnswerFields } from '../schemas/season';
import type { Database } from '../types/database';

type Client = SupabaseClient<Database>;

/** The stored columns the prefill form reads. */
export interface PrefillRow {
  readonly first_name: string;
  readonly last_name: string;
  readonly date_of_birth: string | null;
  readonly place_of_birth: string | null;
  readonly nationality: string | null;
  readonly preferred_language: string;
  readonly document_type: string | null;
  readonly document_number: string | null;
  readonly document_name?: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly city: string | null;
  readonly postal_code: string | null;
  readonly reference_entity: string | null;
  readonly reference_contact_name: string | null;
  readonly has_dependents: boolean | null;
  readonly num_dependents: number;
  readonly clothing_size: string | null;
  readonly shoe_size: string | null;
  // The season registration answers (RAPP-303); absent from older reads.
  readonly applicant_status?: string | null;
  readonly applicant_status_details?: string | null;
  readonly supporting_entities?: readonly string[] | null;
  readonly season_number?: number | null;
  readonly childcare_need?: string | null;
  readonly specific_needs?: string | null;
}

/** An empty input is an absent answer, never an invalid one. */
const emptyAsAbsent = (value: unknown) => (value === '' || value === null ? undefined : value);

export const profilePrefillSchema = z
  .object({
    firstName: identityStepSchema.shape.firstName,
    lastName: identityStepSchema.shape.lastName,
    dateOfBirth: z.preprocess(emptyAsAbsent, identityStepSchema.shape.dateOfBirth.optional()),
    placeOfBirth: z.preprocess(emptyAsAbsent, z.string().trim().max(200).optional()),
    nationality: z.preprocess(emptyAsAbsent, z.string().trim().max(100).optional()),
    preferredLanguage: z.preprocess(
      emptyAsAbsent,
      identityStepSchema.shape.preferredLanguage.optional(),
    ),
    documentType: z.preprocess(emptyAsAbsent, z.enum(DOCUMENT_TYPES).optional()),
    documentName: z.preprocess(emptyAsAbsent, z.string().trim().max(100).optional()),
    documentNumber: z.preprocess(emptyAsAbsent, z.string().trim().toUpperCase().max(50).optional()),
    phone: logisticsFields.shape.phone,
    address: logisticsFields.shape.address,
    city: logisticsFields.shape.city,
    postalCode: logisticsFields.shape.postalCode,
    referenceEntity: z.preprocess(emptyAsAbsent, z.string().trim().max(200).optional()),
    referenceContactName: logisticsFields.shape.referenceContactName,
    hasDependents: z.boolean().optional(),
    numDependents: z.number().int().min(0).max(15).optional(),
    clothingSize: z.preprocess(emptyAsAbsent, z.enum(CLOTHING_SIZES).optional()),
    shoeSize: z.preprocess(
      emptyAsAbsent,
      z
        .string()
        .refine((value) => SHOE_SIZES.includes(value))
        .optional(),
    ),
    ...seasonAnswerFields.shape,
  })
  .superRefine((values, context) => {
    if (
      values.documentType === 'nie' &&
      values.documentNumber !== undefined &&
      !NIE_PATTERN.test(values.documentNumber)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['documentNumber'],
        message: 'a NIE is one letter, seven digits, one letter',
      });
    }
    if (values.hasDependents === true && (values.numDependents ?? 0) < 1) {
      context.addIssue({
        code: 'custom',
        path: ['numDependents'],
        message: 'how many, between 1 and 15',
      });
    }
  });

export type ProfilePrefillInput = z.input<typeof profilePrefillSchema>;
export type ProfilePrefill = z.infer<typeof profilePrefillSchema>;
export type ProfilePrefillField = keyof ProfilePrefill;

const FIELD_QUESTION: Readonly<Record<ProfilePrefillField, IntakeQuestion>> = {
  firstName: 'first_name',
  lastName: 'last_name',
  dateOfBirth: 'date_of_birth',
  placeOfBirth: 'place_of_birth',
  nationality: 'nationality',
  preferredLanguage: 'preferred_language',
  documentType: 'document',
  documentNumber: 'document',
  documentName: 'document',
  phone: 'phone',
  address: 'address',
  city: 'city',
  postalCode: 'postal_code',
  referenceEntity: 'reference_entity',
  referenceContactName: 'reference_contact_name',
  hasDependents: 'dependents',
  numDependents: 'dependents',
  clothingSize: 'clothing_size',
  shoeSize: 'shoe_size',
  applicantStatus: 'applicant_status',
  applicantStatusDetails: 'applicant_status',
  supportingEntities: 'supporting_entities',
  seasonNumber: 'season_number',
  childcareNeed: 'childcare_need',
  specificNeeds: 'specific_needs',
};

/** The form's starting values: answered questions show, the rest stay empty. */
export function prefillFromRow(row: PrefillRow, answered: AnsweredQuestions): ProfilePrefillInput {
  const shown = (field: ProfilePrefillField) => answered.has(FIELD_QUESTION[field]);
  const value = <T>(field: ProfilePrefillField, stored: T | null): T | undefined =>
    shown(field) && stored !== null ? stored : undefined;
  return {
    // Set by the invitation, always: a name is never unknown.
    firstName: row.first_name,
    lastName: row.last_name,
    dateOfBirth: value('dateOfBirth', row.date_of_birth),
    placeOfBirth: value('placeOfBirth', row.place_of_birth),
    nationality: value('nationality', row.nationality),
    preferredLanguage: value('preferredLanguage', row.preferred_language) as
      ProfilePrefillInput['preferredLanguage'] | undefined,
    documentType: value('documentType', row.document_type) as
      ProfilePrefillInput['documentType'] | undefined,
    documentNumber: value('documentNumber', row.document_number),
    documentName: value('documentName', row.document_name ?? null),
    phone: value('phone', row.phone),
    address: value('address', row.address),
    city: value('city', row.city),
    postalCode: value('postalCode', row.postal_code),
    referenceEntity: value('referenceEntity', row.reference_entity),
    referenceContactName: value('referenceContactName', row.reference_contact_name),
    hasDependents: value('hasDependents', row.has_dependents),
    numDependents: value('numDependents', row.num_dependents),
    clothingSize: value('clothingSize', row.clothing_size) as
      ProfilePrefillInput['clothingSize'] | undefined,
    shoeSize: value('shoeSize', row.shoe_size),
    applicantStatus: value('applicantStatus', row.applicant_status ?? null) as
      ProfilePrefillInput['applicantStatus'] | undefined,
    applicantStatusDetails: value('applicantStatusDetails', row.applicant_status_details ?? null),
    supportingEntities: (value('supportingEntities', row.supporting_entities ?? null) ??
      []) as string[],
    seasonNumber: value('seasonNumber', row.season_number ?? null),
    childcareNeed: value('childcareNeed', row.childcare_need ?? null) as
      ProfilePrefillInput['childcareNeed'] | undefined,
    specificNeeds: value('specificNeeds', row.specific_needs ?? null),
  };
}

const PAYLOAD_KEY: Readonly<Record<ProfilePrefillField, string>> = {
  firstName: 'first_name',
  lastName: 'last_name',
  dateOfBirth: 'date_of_birth',
  placeOfBirth: 'place_of_birth',
  nationality: 'nationality',
  preferredLanguage: 'preferred_language',
  documentType: 'document_type',
  documentNumber: 'document_number',
  documentName: 'document_name',
  phone: 'phone',
  address: 'address',
  city: 'city',
  postalCode: 'postal_code',
  referenceEntity: 'reference_entity',
  referenceContactName: 'reference_contact_name',
  hasDependents: 'has_dependents',
  numDependents: 'num_dependents',
  clothingSize: 'clothing_size',
  shoeSize: 'shoe_size',
  applicantStatus: 'applicant_status',
  applicantStatusDetails: 'applicant_status_details',
  supportingEntities: 'supporting_entities',
  seasonNumber: 'season_number',
  childcareNeed: 'childcare_need',
  specificNeeds: 'specific_needs',
};

/** Fields that travel together: one without the other means nothing. */
const TRAVELS_WITH: Readonly<Partial<Record<ProfilePrefillField, ProfilePrefillField>>> = {
  documentType: 'documentNumber',
  documentNumber: 'documentType',
  hasDependents: 'numDependents',
  numDependents: 'hasDependents',
};

export type ProfilePrefillPayload = Record<string, string | number | boolean | string[] | null>;

/** The `update_participant_profile` payload for the changed fields only. */
export function buildProfilePrefillPayload(
  values: Partial<ProfilePrefill>,
  changed: ReadonlySet<string>,
): ProfilePrefillPayload {
  const fields = new Set<ProfilePrefillField>();
  for (const name of changed) {
    if (!(name in PAYLOAD_KEY)) continue;
    const field = name as ProfilePrefillField;
    fields.add(field);
    const partner = TRAVELS_WITH[field];
    if (partner !== undefined) fields.add(partner);
  }
  const payload: ProfilePrefillPayload = {};
  for (const field of fields) {
    let value = values[field] as string | number | boolean | string[] | undefined;
    // An emptied list is "not answered" (RAPP-303).
    if (Array.isArray(value) && value.length === 0) value = undefined;
    if (field === 'documentNumber' && documentNumberToSend(values) === null) value = undefined;
    if (field === 'numDependents' && values.hasDependents !== true) value = 0;
    payload[PAYLOAD_KEY[field]] = value ?? null;
  }
  return payload;
}

/** Her answered questions, read under the team policy on `profile_answers`. */
export async function fetchParticipantAnsweredQuestions(
  client: Client,
  participantId: string,
): Promise<AnsweredQuestions> {
  const { data, error } = await client
    .from('profile_answers')
    .select('question')
    .eq('profile_id', participantId);
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
  return new Set(answeredQuestionsSchema.parse((data ?? []).map((row) => row.question)));
}
