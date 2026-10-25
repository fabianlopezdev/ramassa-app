import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from './errors';
import {
  appAnswersFromForm,
  appFormToSend,
  type AppFormKey,
} from './intake-builder/app-field-form';
import { isEmptyAnswer } from './intake-builder/builder';
import {
  fetchSystemFieldIndex,
  fieldAnswersFromColumns,
  fieldAnswersReadSchema,
  type SystemFieldIndex,
} from './intake-builder/field-answers';
import { internationalPhone, type CustomAnswerValue } from './intake-builder/question-types';
import { DOCUMENT_TYPES, NIE_PATTERN } from './schemas/onboarding';
import { personNameSchema, trimPersonName } from './schemas/person-name';
import {
  APPLICANT_STATUSES,
  CHILDCARE_NEEDS,
  SPECIFIC_NEEDS_MAX_LENGTH,
  SUPPORTING_ENTITIES_MAX,
} from './schemas/season';
import type { Database, Json } from './types/database';

export const DOCUMENTATION_STATUSES = ['none', 'missing', 'in_progress', 'complete'] as const;
export const REFERRAL_STATUSES = ['pending', 'active', 'inactive'] as const;
export const REFERRAL_UPDATE_TYPES = [
  'housing',
  'documentation',
  'education',
  'employment',
  'health',
  'other',
] as const;

const optionalTrimmedText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .default('')
    .transform((value) => (value.length === 0 ? null : value));

const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .optional()
  .default('')
  .transform((value, context) => {
    if (value.length === 0) return null;
    const parsed = z.email().safeParse(value.toLowerCase());
    if (!parsed.success) {
      context.addIssue({ code: 'custom', message: 'Invalid email address' });
      return z.NEVER;
    }
    return parsed.data;
  });

/** An empty choice is "not answered"; anything else must be one of the choices. */
const optionalChoice = <const Values extends readonly [string, ...string[]]>(values: Values) =>
  z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.enum(values).nullable(),
  );

const optionalIsoDate = z
  .string()
  .trim()
  .optional()
  .default('')
  .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), 'YYYY-MM-DD')
  .transform((value) => (value.length === 0 ? null : value));

/**
 * The referral an entity sends (RAPP-54), with the season registration
 * questions of the form entities filled until now (RAPP-303). Only her names
 * and the entity's confirmation that she agreed to share her data are
 * required, as in that form.
 */
export const createReferralSchema = z
  .object({
    firstName: personNameSchema,
    lastName: personNameSchema,
    phone: optionalTrimmedText(50),
    email: optionalEmail,
    documentationStatus: z.enum(DOCUMENTATION_STATUSES),
    notes: optionalTrimmedText(4000),
    dateOfBirth: optionalIsoDate,
    nationality: optionalTrimmedText(100),
    documentType: optionalChoice(DOCUMENT_TYPES),
    documentNumber: optionalTrimmedText(50).transform((value) => value?.toUpperCase() ?? null),
    city: optionalTrimmedText(100),
    applicantStatus: optionalChoice(APPLICANT_STATUSES),
    supportingEntities: z
      .array(z.string().trim().max(200))
      .max(SUPPORTING_ENTITIES_MAX)
      .optional()
      .default([])
      .transform((names) => names.filter((name) => name.length > 0)),
    // A contact's name of only invisible characters is no name (RAPP-624).
    referenceContactName: z
      .string()
      .overwrite(trimPersonName)
      .max(200)
      .optional()
      .default('')
      .transform((value) => (value.length === 0 ? null : value)),
    seasonNumber: z.preprocess(
      (value) => (value === '' || value === undefined || value === null ? null : Number(value)),
      z.number().int().min(1).max(5).nullable(),
    ),
    childcareNeed: optionalChoice(CHILDCARE_NEEDS),
    specificNeeds: optionalTrimmedText(SPECIFIC_NEEDS_MAX_LENGTH),
    consentConfirmed: z.literal(true),
  })
  .superRefine((referral, context) => {
    const type = referral.documentType;
    if (type === null || type === 'none') return;
    if (referral.documentNumber === null) {
      context.addIssue({ code: 'custom', path: ['documentNumber'], message: 'required' });
    } else if (type === 'nie' && !NIE_PATTERN.test(referral.documentNumber)) {
      context.addIssue({ code: 'custom', path: ['documentNumber'], message: 'nie format' });
    }
  });

export type CreateReferralInput = z.input<typeof createReferralSchema>;
export type CreateReferral = z.output<typeof createReferralSchema>;

/** Answers to the Ramassà fields of the form (RAPP-652), by field id; empty ones left out. */
export type ReferralFieldAnswers = Readonly<Record<string, CustomAnswerValue | null>>;

/**
 * TEMPORARY, until the portal renders every field (RAPP-663, RAPP-664): the
 * form's values under the system keys of the app's fields (`first_name`,
 * `document_type`...), the one place the form's own names meet the fields.
 * `fieldAnswersFromColumns` turns them into answers by field, and
 * `missingEntityFormFields` reads them.
 */
export function referralSystemValues(
  form: Readonly<Partial<Record<keyof CreateReferralInput, unknown>>>,
): Record<string, unknown> {
  return {
    first_name: form.firstName,
    last_name: form.lastName,
    phone: form.phone,
    date_of_birth: form.dateOfBirth,
    nationality: form.nationality,
    document_type: form.documentType,
    document_number: form.documentNumber,
    city: form.city,
    applicant_status: form.applicantStatus,
    supporting_entities: form.supportingEntities,
    reference_contact_name: form.referenceContactName,
    childcare_need: form.childcareNeed,
    specific_needs: form.specificNeeds,
  };
}

/** The form's values to answer from: a number travels only with a type that takes one. */
function referralColumns(referral: CreateReferral): Record<string, unknown> {
  const hasNumber = referral.documentType !== null && referral.documentType !== 'none';
  return {
    ...referralSystemValues(referral),
    document_number: hasNumber ? referral.documentNumber : null,
  };
}

/**
 * The referral as `create_entity_referral` takes it (RAPP-661): her names,
 * every answer by field (the app's and Ramassà's), and the referral's own
 * data. A referral starts empty, so an empty answer is left out: there is
 * nothing to remove, and a field the form does not ask stays out.
 */
export function buildReferralPayload(
  referral: CreateReferral,
  systemFields: SystemFieldIndex = new Map(),
  fields: ReferralFieldAnswers | null = null,
): Json {
  const answers = Object.entries({
    ...fieldAnswersFromColumns(systemFields, referralColumns(referral)).answers,
    ...fields,
  }).filter(([, value]) => !isEmptyAnswer(value));
  return {
    first_name: referral.firstName,
    last_name: referral.lastName,
    email: referral.email,
    documentationStatus: referral.documentationStatus,
    notes: referral.notes,
    seasonNumber: referral.seasonNumber,
    consentConfirmed: referral.consentConfirmed,
    answers: Object.fromEntries(answers) as Json,
  };
}

// By field (RAPP-663) ---------------------------------------------------------------------------

/** The app's fields the referral form can ask, by the form's names. */
const REFERRAL_FORM_KEYS = [
  'phone',
  'dateOfBirth',
  'nationality',
  'documentType',
  'documentNumber',
  'city',
  'applicantStatus',
  'supportingEntities',
  'referenceContactName',
  'childcareNeed',
  'specificNeeds',
] as const satisfies readonly AppFormKey[];

/**
 * The referral's answers to the app's fields, by field (RAPP-663): a phone in
 * its international form (a Spanish number typed without +34 gets it), a
 * document number only with a type that takes one. A referral starts empty,
 * so an empty answer is left out.
 */
export function referralAppAnswers(
  fields: SystemFieldIndex,
  referral: CreateReferral,
): Record<string, CustomAnswerValue> {
  const form = {
    ...referral,
    phone: referral.phone === null ? null : internationalPhone(referral.phone),
    documentType: referral.documentType ?? undefined,
    documentNumber: referral.documentNumber ?? undefined,
  };
  return Object.fromEntries(
    Object.entries(appAnswersFromForm(fields, appFormToSend(form, REFERRAL_FORM_KEYS))).flatMap(
      ([id, value]) => (value === null || isEmptyAnswer(value) ? [] : [[id, value]]),
    ),
  );
}

/**
 * The referral as `create_entity_referral` takes it: her names, every answer
 * by field (the app's and Ramassà's), and the referral's own data.
 */
export function referralRequest(referral: CreateReferral, answers: ReferralFieldAnswers): Json {
  return {
    first_name: referral.firstName,
    last_name: referral.lastName,
    email: referral.email,
    documentationStatus: referral.documentationStatus,
    notes: referral.notes,
    seasonNumber: referral.seasonNumber,
    consentConfirmed: referral.consentConfirmed,
    answers: Object.fromEntries(
      Object.entries(answers).filter(([, value]) => !isEmptyAnswer(value)),
    ) as Json,
  };
}

/** Sends a referral with every answer by field; the database checks the required ones. */
export async function sendReferral(
  client: Pick<Client, 'rpc'>,
  referral: CreateReferral,
  answers: ReferralFieldAnswers,
): Promise<string> {
  const { data, error } = await client.rpc('create_entity_referral', {
    p_payload: referralRequest(referral, answers),
  });
  if (error) databaseFailure(error.message);
  return z.uuid().parse(data);
}

/** One referral with the entity's answers by field, and the fields to read them by. */
export interface ReferralRecord extends Referral {
  /** The entity's answers by field id, each one the reader may read (RAPP-662). */
  readonly answers: Readonly<Record<string, unknown>>;
  readonly seasonNumber: number | null;
  readonly fields: SystemFieldIndex;
}

/**
 * One referral with the entity's answers by field (RAPP-663, RAPP-664). A
 * caller that already reads her organization's fields (the catalog) passes
 * them, so they are not read twice.
 */
export async function fetchReferralRecord(
  client: Pick<Client, 'rpc'>,
  referralId: string,
  fields?: SystemFieldIndex | Promise<SystemFieldIndex>,
): Promise<ReferralRecord> {
  const { data, error } = await client.rpc('get_entity_referral', {
    p_referral_id: z.uuid().parse(referralId),
  });
  if (error) databaseFailure(error.message);
  const row = z.array(referralRpcRowSchema).min(1).max(1).parse(data)[0];
  if (row === undefined) databaseFailure('Referral was not returned');
  return {
    ...referralFromRow(row),
    answers: row.answers ?? {},
    seasonNumber: row.season_number ?? null,
    fields: await (fields ?? fetchSystemFieldIndex(client)),
  };
}

export const referralUpdateSchema = z.object({
  updateType: z.enum(REFERRAL_UPDATE_TYPES),
  content: z.string().trim().min(1).max(4000),
});

export type ReferralUpdateInput = z.input<typeof referralUpdateSchema>;
export type ReferralUpdate = z.output<typeof referralUpdateSchema>;

const referralRpcRowSchema = z.object({
  id: z.uuid(),
  entity_user_id: z.uuid(),
  referred_profile_id: z.uuid().nullable(),
  assigned_staff_id: z.uuid().nullable(),
  referred_first_name: z.string(),
  referred_last_name: z.string(),
  referred_phone: z.string().nullable(),
  referred_email: z.string().nullable(),
  documentation_status: z.enum(DOCUMENTATION_STATUSES),
  notes: z.string().nullable(),
  status: z.enum(REFERRAL_STATUSES),
  entity_name: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  // Only the single-referral read returns these (RAPP-303): the entity's
  // answers by field (RAPP-662) and her season count.
  answers: fieldAnswersReadSchema.optional(),
  season_number: z.number().int().nullable().optional(),
  consent_confirmed_at: z.string().nullable().optional(),
});

export interface Referral {
  readonly id: string;
  readonly entityUserId: string;
  readonly referredProfileId: string | null;
  readonly assignedStaffId: string | null;
  readonly referredFirstName: string;
  readonly referredLastName: string;
  readonly referredPhone: string | null;
  readonly referredEmail: string | null;
  readonly documentationStatus: (typeof DOCUMENTATION_STATUSES)[number];
  readonly notes: string | null;
  readonly status: (typeof REFERRAL_STATUSES)[number];
  readonly entityName: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly consentConfirmedAt: string | null;
}

function searchableReferralText(referral: Referral): string {
  return [
    referral.referredFirstName,
    referral.referredLastName,
    referral.referredEmail ?? '',
    referral.referredPhone ?? '',
    referral.entityName ?? '',
  ]
    .join(' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase();
}

export function filterReferrals(
  referrals: readonly Referral[],
  query: string,
): readonly Referral[] {
  const normalizedQuery = query.trim().normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
  if (normalizedQuery.length === 0) return referrals;
  return referrals.filter((referral) => searchableReferralText(referral).includes(normalizedQuery));
}

function referralFromRow(row: z.infer<typeof referralRpcRowSchema>): Referral {
  return {
    id: row.id,
    entityUserId: row.entity_user_id,
    referredProfileId: row.referred_profile_id,
    assignedStaffId: row.assigned_staff_id,
    referredFirstName: row.referred_first_name,
    referredLastName: row.referred_last_name,
    referredPhone: row.referred_phone,
    referredEmail: row.referred_email,
    documentationStatus: row.documentation_status,
    notes: row.notes,
    status: row.status,
    entityName: row.entity_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    consentConfirmedAt: row.consent_confirmed_at ?? null,
  };
}

type Client = SupabaseClient<Database>;

function databaseFailure(message: string): never {
  throw new AppError('DB-1', { message });
}

export async function fetchEntityReferrals(
  client: Pick<Client, 'rpc'>,
): Promise<readonly Referral[]> {
  const { data, error } = await client.rpc('list_entity_referrals');
  if (error) databaseFailure(error.message);
  return z
    .array(referralRpcRowSchema)
    .parse(data ?? [])
    .map((row) => referralFromRow(row));
}

export async function fetchStaffReferrals(
  client: Pick<Client, 'rpc'>,
  status: (typeof REFERRAL_STATUSES)[number] | null = null,
): Promise<readonly Referral[]> {
  const { data, error } =
    status === null
      ? await client.rpc('list_staff_referrals')
      : await client.rpc('list_staff_referrals', { p_status: status });
  if (error) databaseFailure(error.message);
  return z
    .array(referralRpcRowSchema)
    .parse(data ?? [])
    .map((row) => referralFromRow(row));
}

/**
 * The organization's partner entities by name, for "other entities that
 * support her" on the referral form (RAPP-303).
 */
export async function fetchSupportingEntityNames(
  client: Pick<Client, 'rpc'>,
): Promise<readonly string[]> {
  const { data, error } = await client.rpc('list_supporting_entity_names');
  if (error) databaseFailure(error.message);
  return z.array(z.string()).parse(data ?? []);
}

/**
 * Sends a referral. `fields` carries the answers to the Ramassà fields of the
 * form (RAPP-652); the database then checks every required field at once.
 */
export async function createReferral(
  client: Pick<Client, 'rpc'>,
  input: CreateReferral,
  fields: ReferralFieldAnswers | null = null,
): Promise<string> {
  const { data, error } = await client.rpc('create_entity_referral', {
    p_payload: buildReferralPayload(input, await fetchSystemFieldIndex(client), fields),
  });
  if (error) databaseFailure(error.message);
  return z.uuid().parse(data);
}

export async function completeReferral(
  client: Pick<Client, 'rpc'>,
  referralId: string,
  profileId: string,
): Promise<void> {
  const { error } = await client.rpc('complete_entity_referral', {
    p_referral_id: z.uuid().parse(referralId),
    p_profile_id: z.uuid().parse(profileId),
  });
  if (error) databaseFailure(error.message);
}

export async function submitReferralUpdate(
  client: Pick<Client, 'rpc'>,
  referralId: string,
  input: ReferralUpdateInput,
): Promise<string> {
  const update = referralUpdateSchema.parse(input);
  const { data, error } = await client.rpc('add_referral_update', {
    p_referral_id: z.uuid().parse(referralId),
    p_update_type: update.updateType,
    p_content: update.content,
  });
  if (error) databaseFailure(error.message);
  return z.uuid().parse(data);
}

const referralUpdateRowSchema = z.object({
  id: z.uuid(),
  update_type: z.enum(REFERRAL_UPDATE_TYPES),
  content: z.string(),
  author_name: z.string(),
  created_at: z.string(),
});

export interface ReferralUpdateEntry {
  readonly id: string;
  readonly updateType: (typeof REFERRAL_UPDATE_TYPES)[number];
  readonly content: string;
  readonly authorName: string;
  readonly createdAt: string;
}

export async function fetchReferralUpdates(
  client: Pick<Client, 'rpc'>,
  referralId: string,
): Promise<readonly ReferralUpdateEntry[]> {
  const { data, error } = await client.rpc('list_referral_updates', {
    p_referral_id: z.uuid().parse(referralId),
  });
  if (error) databaseFailure(error.message);
  return z
    .array(referralUpdateRowSchema)
    .parse(data ?? [])
    .map((row) => ({
      id: row.id,
      updateType: row.update_type,
      content: row.content,
      authorName: row.author_name,
      createdAt: row.created_at,
    }));
}
