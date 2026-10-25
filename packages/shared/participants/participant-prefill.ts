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
  appAnswersFromForm,
  appFormToSend,
  appFormValues,
  isAppFormKey,
} from '../intake-builder/app-field-form';
import type { SystemFieldIndex } from '../intake-builder/field-answers';
import type { CustomAnswerValue } from '../intake-builder/question-types';
import {
  answeredQuestionsSchema,
  type AnsweredQuestions,
} from '../onboarding/intake';
import {
  CLOTHING_SIZES,
  DOCUMENT_TYPES,
  identityStepSchema,
  logisticsFields,
  NIE_PATTERN,
  SHOE_SIZES,
} from '../schemas/onboarding';
import type { ProfileRecordWithFields } from '../schemas/profile';
import { seasonAnswerFields } from '../schemas/season';
import type { Database } from '../types/database';

type Client = SupabaseClient<Database>;

/** An empty input is an absent answer, never an invalid one. */
const emptyAsAbsent = (value: unknown) => (value === '' || value === null ? undefined : value);

const prefillFields = z.object({
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
});

export const profilePrefillSchema = prefillFields.superRefine((values, context) => {
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

/** Fields that travel together: one without the other means nothing. */
const TRAVELS_WITH: Readonly<Partial<Record<ProfilePrefillField, ProfilePrefillField>>> = {
  documentType: 'documentNumber',
  documentNumber: 'documentType',
  hasDependents: 'numDependents',
  numDependents: 'hasDependents',
};

// By field (RAPP-663) ---------------------------------------------------------------------------

/** Her account settings in the prefill form, and the column each one is. */
const ACCOUNT_FIELDS = {
  firstName: 'first_name',
  lastName: 'last_name',
  preferredLanguage: 'preferred_language',
  seasonNumber: 'season_number',
} as const satisfies Partial<Record<ProfilePrefillField, string>>;

/**
 * The prefill form's starting values from her record by field (RAPP-663):
 * her names always, a setting when it was answered, and every answer she has,
 * read by field. A question nobody answered stays empty.
 */
export function prefillFormOf(
  record: ProfileRecordWithFields,
  answered: AnsweredQuestions,
): ProfilePrefillInput {
  const values = appFormValues(record.fields, record.answers);
  return {
    ...(values as Partial<ProfilePrefillInput>),
    firstName: record.first_name,
    lastName: record.last_name,
    preferredLanguage: answered.has('preferred_language')
      ? (record.preferred_language as ProfilePrefillInput['preferredLanguage'])
      : undefined,
    seasonNumber: answered.has('season_number') ? (record.season_number ?? undefined) : undefined,
    supportingEntities: values.supportingEntities ?? [],
  };
}

/**
 * What to send for the fields staff changed (RAPP-663): each setting, and each
 * answer by field. Fields that travel together go together, and the rules of
 * every screen apply (`appFormToSend`).
 */
export function prefillUpdateOf(
  fields: SystemFieldIndex,
  values: Partial<ProfilePrefill>,
  changed: ReadonlySet<string>,
): ParticipantPrefillUpdate {
  const sent = new Set<ProfilePrefillField>();
  for (const name of changed) {
    if (!(name in prefillFields.shape)) continue;
    const field = name as ProfilePrefillField;
    sent.add(field);
    const partner = TRAVELS_WITH[field];
    if (partner !== undefined) sent.add(partner);
  }
  const update: Record<string, unknown> = {};
  for (const [field, column] of Object.entries(ACCOUNT_FIELDS)) {
    if (sent.has(field as ProfilePrefillField)) {
      update[column] = values[field as keyof typeof ACCOUNT_FIELDS] ?? null;
    }
  }
  const answers = appAnswersFromForm(fields, appFormToSend(values, [...sent].filter(isAppFormKey)));
  return { ...update, answers } as ParticipantPrefillUpdate;
}

/** The changed settings and answers of a woman who has not joined yet. */
export interface ParticipantPrefillUpdate {
  readonly first_name?: string;
  readonly last_name?: string;
  readonly preferred_language?: string | null;
  readonly season_number?: number | null;
  readonly answers: Readonly<Record<string, CustomAnswerValue | null>>;
}

/** Her answered questions, from her answers (RAPP-662), for a caller who may list her. */
export async function fetchParticipantAnsweredQuestions(
  client: Client,
  participantId: string,
): Promise<AnsweredQuestions> {
  const { data, error } = await client.rpc('participant_answered_questions', {
    p_profile_id: participantId,
  });
  if (error) {
    throw new AppError('DB-1', { message: error.message });
  }
  return new Set(answeredQuestionsSchema.parse(data ?? []));
}
