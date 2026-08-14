import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from './errors';
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

export const createReferralSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: optionalTrimmedText(50),
  email: optionalEmail,
  documentationStatus: z.enum(DOCUMENTATION_STATUSES),
  notes: optionalTrimmedText(4000),
});

export type CreateReferralInput = z.input<typeof createReferralSchema>;
export type CreateReferral = z.output<typeof createReferralSchema>;

export interface ReferralPayload {
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly documentationStatus: (typeof DOCUMENTATION_STATUSES)[number];
  readonly notes: string | null;
}

export function buildReferralPayload(referral: CreateReferral): Json {
  return {
    firstName: referral.firstName,
    lastName: referral.lastName,
    phone: referral.phone,
    email: referral.email,
    documentationStatus: referral.documentationStatus,
    notes: referral.notes,
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
    .map(referralFromRow);
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
    .map(referralFromRow);
}

export async function fetchReferral(
  client: Pick<Client, 'rpc'>,
  referralId: string,
): Promise<Referral> {
  const { data, error } = await client.rpc('get_entity_referral', {
    p_referral_id: z.uuid().parse(referralId),
  });
  if (error) databaseFailure(error.message);
  const row = z.array(referralRpcRowSchema).min(1).max(1).parse(data)[0];
  if (row === undefined) databaseFailure('Referral was not returned');
  return referralFromRow(row);
}

export async function createReferral(
  client: Pick<Client, 'rpc'>,
  input: CreateReferral,
): Promise<string> {
  const { data, error } = await client.rpc('create_entity_referral', {
    p_payload: buildReferralPayload(input),
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
