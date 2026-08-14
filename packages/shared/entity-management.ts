import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from './errors';
import type { Database } from './types/database';

const entityIdSchema = z.uuid();

export const createEntitySchema = z.object({
  name: z.string().trim().min(1).max(200),
});

export const inviteEntityCollaboratorSchema = z.object({
  email: z
    .string()
    .trim()
    .max(254)
    .transform((value) => value.toLowerCase())
    .pipe(z.email()),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
});

export type CreateEntityInput = z.input<typeof createEntitySchema>;
export type InviteEntityCollaboratorInput = z.input<typeof inviteEntityCollaboratorSchema>;

const impactSchema = z.object({
  suppressed: z.boolean(),
  referred_count: z.number().int().nullable(),
  active_count: z.number().int().nullable(),
  inactive_count: z.number().int().nullable(),
  attendance_present_count: z.number().int().nullable(),
  attendance_eligible_count: z.number().int().nullable(),
  attendance_marked_count: z.number().int().nullable(),
  attendance_rate: z.number().nullable(),
});

const trendSchema = z.object({
  month_start: z.string(),
  participant_count: z.number().int(),
  attendance_present_count: z.number().int(),
  attendance_eligible_count: z.number().int(),
  attendance_marked_count: z.number().int(),
  attendance_rate: z.number(),
});

const trackingSchema = z.object({
  referral_id: z.uuid(),
  referred_profile_id: z.uuid(),
  referred_first_name: z.string(),
  referred_last_name: z.string(),
  status: z.enum(['pending', 'active', 'inactive']),
  attendance_present_count: z.number().int(),
  attendance_absent_count: z.number().int(),
  attendance_excused_count: z.number().int(),
  attendance_marked_count: z.number().int(),
  attendance_rate: z.number(),
  latest_occurrence_at: z.string().nullable(),
});

const localizedTextSchema = z.record(z.string(), z.string());
const upcomingEventSchema = z.object({
  id: z.uuid(),
  category_id: z.uuid(),
  title: localizedTextSchema,
  description: localizedTextSchema,
  location: z.string(),
  location_url: z.string().nullable(),
  starts_at: z.string(),
  ends_at: z.string().nullable(),
  time_zone: z.string(),
  is_recurring: z.boolean(),
});

const managedEntitySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  is_active: z.boolean(),
  active_collaborator_count: z.number().int(),
  referral_count: z.number().int(),
  pending_invitation_count: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});

const collaboratorSchema = z.object({
  profile_id: z.uuid(),
  first_name: z.string(),
  last_name: z.string(),
  email: z.string(),
  is_active: z.boolean(),
  invited_at: z.string().nullable(),
  accepted_at: z.string().nullable(),
});

const invitationSchema = z.object({
  invitation_id: z.uuid(),
  profile_id: z.uuid(),
  email: z.string(),
  expires_at: z.string(),
});

const ownInvitationSchema = z.object({
  invitation_id: z.uuid(),
  collaborating_entity_id: z.uuid(),
  entity_name: z.string(),
  invited_at: z.string(),
});

export interface EntityImpact {
  readonly suppressed: boolean;
  readonly referredCount: number | null;
  readonly activeCount: number | null;
  readonly inactiveCount: number | null;
  readonly attendancePresentCount: number | null;
  readonly attendanceEligibleCount: number | null;
  readonly attendanceMarkedCount: number | null;
  readonly attendanceRate: number | null;
}

export interface EntityTrendPoint {
  readonly monthStart: string;
  readonly participantCount: number;
  readonly attendancePresentCount: number;
  readonly attendanceEligibleCount: number;
  readonly attendanceMarkedCount: number;
  readonly attendanceRate: number;
}

export interface EntityReferralTracking {
  readonly referralId: string;
  readonly referredProfileId: string;
  readonly referredFirstName: string;
  readonly referredLastName: string;
  readonly status: 'pending' | 'active' | 'inactive';
  readonly attendancePresentCount: number;
  readonly attendanceAbsentCount: number;
  readonly attendanceExcusedCount: number;
  readonly attendanceMarkedCount: number;
  readonly attendanceRate: number;
  readonly latestOccurrenceAt: string | null;
}

export interface EntityUpcomingEvent {
  readonly id: string;
  readonly categoryId: string;
  readonly title: Readonly<Record<string, string>>;
  readonly description: Readonly<Record<string, string>>;
  readonly location: string;
  readonly locationUrl: string | null;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly timeZone: string;
  readonly isRecurring: boolean;
}

export interface ManagedEntity {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly activeCollaboratorCount: number;
  readonly referralCount: number;
  readonly pendingInvitationCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface EntityCollaborator {
  readonly profileId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly isActive: boolean;
  readonly invitedAt: string | null;
  readonly acceptedAt: string | null;
}

export interface EntityDashboard {
  readonly impact: EntityImpact;
  readonly trend: readonly EntityTrendPoint[];
  readonly tracking: readonly EntityReferralTracking[];
  readonly upcomingEvents: readonly EntityUpcomingEvent[];
}

type Client = SupabaseClient<Database>;

function databaseFailure(message: string): never {
  throw new AppError('DB-1', { message });
}

function impactFromRow(row: z.infer<typeof impactSchema>): EntityImpact {
  return {
    suppressed: row.suppressed,
    referredCount: row.referred_count,
    activeCount: row.active_count,
    inactiveCount: row.inactive_count,
    attendancePresentCount: row.attendance_present_count,
    attendanceEligibleCount: row.attendance_eligible_count,
    attendanceMarkedCount: row.attendance_marked_count,
    attendanceRate: row.attendance_rate,
  };
}

export async function fetchEntityDashboard(client: Pick<Client, 'rpc'>): Promise<EntityDashboard> {
  const [impactResult, trendResult, trackingResult, eventsResult] = await Promise.all([
    client.rpc('get_entity_impact_summary'),
    client.rpc('list_entity_participation_trend'),
    client.rpc('list_entity_referral_tracking'),
    client.rpc('list_entity_upcoming_events'),
  ]);

  for (const result of [impactResult, trendResult, trackingResult, eventsResult]) {
    if (result.error) databaseFailure(result.error.message);
  }

  const impactRow = z.array(impactSchema).length(1).parse(impactResult.data)[0];
  if (impactRow === undefined) databaseFailure('Entity impact was not returned');

  return {
    impact: impactFromRow(impactRow),
    trend: z
      .array(trendSchema)
      .parse(trendResult.data ?? [])
      .map((row) => ({
        monthStart: row.month_start,
        participantCount: row.participant_count,
        attendancePresentCount: row.attendance_present_count,
        attendanceEligibleCount: row.attendance_eligible_count,
        attendanceMarkedCount: row.attendance_marked_count,
        attendanceRate: row.attendance_rate,
      })),
    tracking: z
      .array(trackingSchema)
      .parse(trackingResult.data ?? [])
      .map((row) => ({
        referralId: row.referral_id,
        referredProfileId: row.referred_profile_id,
        referredFirstName: row.referred_first_name,
        referredLastName: row.referred_last_name,
        status: row.status,
        attendancePresentCount: row.attendance_present_count,
        attendanceAbsentCount: row.attendance_absent_count,
        attendanceExcusedCount: row.attendance_excused_count,
        attendanceMarkedCount: row.attendance_marked_count,
        attendanceRate: row.attendance_rate,
        latestOccurrenceAt: row.latest_occurrence_at,
      })),
    upcomingEvents: z
      .array(upcomingEventSchema)
      .parse(eventsResult.data ?? [])
      .map((row) => ({
        id: row.id,
        categoryId: row.category_id,
        title: row.title,
        description: row.description,
        location: row.location,
        locationUrl: row.location_url,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        timeZone: row.time_zone,
        isRecurring: row.is_recurring,
      })),
  };
}

export async function fetchEntityUpcomingEvents(
  client: Pick<Client, 'rpc'>,
): Promise<readonly EntityUpcomingEvent[]> {
  const { data, error } = await client.rpc('list_entity_upcoming_events');
  if (error) databaseFailure(error.message);
  return z
    .array(upcomingEventSchema)
    .parse(data ?? [])
    .map((row) => ({
      id: row.id,
      categoryId: row.category_id,
      title: row.title,
      description: row.description,
      location: row.location,
      locationUrl: row.location_url,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      timeZone: row.time_zone,
      isRecurring: row.is_recurring,
    }));
}

export async function fetchManagedEntities(
  client: Pick<Client, 'rpc'>,
): Promise<readonly ManagedEntity[]> {
  const { data, error } = await client.rpc('list_collaborating_entities');
  if (error) databaseFailure(error.message);
  return z
    .array(managedEntitySchema)
    .parse(data ?? [])
    .map((row) => ({
      id: row.id,
      name: row.name,
      isActive: row.is_active,
      activeCollaboratorCount: row.active_collaborator_count,
      referralCount: row.referral_count,
      pendingInvitationCount: row.pending_invitation_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
}

export async function fetchEntityCollaborators(
  client: Pick<Client, 'rpc'>,
  entityId: string,
): Promise<readonly EntityCollaborator[]> {
  const { data, error } = await client.rpc('list_entity_collaborators', {
    p_collaborating_entity_id: entityIdSchema.parse(entityId),
  });
  if (error) databaseFailure(error.message);
  return z
    .array(collaboratorSchema)
    .parse(data ?? [])
    .map((row) => ({
      profileId: row.profile_id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      isActive: row.is_active,
      invitedAt: row.invited_at,
      acceptedAt: row.accepted_at,
    }));
}

export async function createManagedEntity(
  client: Pick<Client, 'rpc'>,
  input: CreateEntityInput,
): Promise<string> {
  const entity = createEntitySchema.parse(input);
  const { data, error } = await client.rpc('create_collaborating_entity', {
    p_name: entity.name,
  });
  if (error) databaseFailure(error.message);
  return entityIdSchema.parse(data);
}

export async function inviteEntityCollaborator(
  client: Pick<Client, 'rpc'>,
  entityId: string,
  input: InviteEntityCollaboratorInput,
): Promise<{ invitationId: string; profileId: string; email: string; expiresAt: string }> {
  const collaborator = inviteEntityCollaboratorSchema.parse(input);
  const { data, error } = await client.rpc('invite_entity_collaborator', {
    p_collaborating_entity_id: entityIdSchema.parse(entityId),
    p_email: collaborator.email,
    p_first_name: collaborator.firstName,
    p_last_name: collaborator.lastName,
  });
  if (error) databaseFailure(error.message);
  const row = z.array(invitationSchema).length(1).parse(data)[0];
  if (row === undefined) databaseFailure('Entity invitation was not returned');
  return {
    invitationId: row.invitation_id,
    profileId: row.profile_id,
    email: row.email,
    expiresAt: row.expires_at,
  };
}

export async function setEntityActive(
  client: Pick<Client, 'rpc'>,
  entityId: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await client.rpc('set_collaborating_entity_active', {
    p_collaborating_entity_id: entityIdSchema.parse(entityId),
    p_is_active: isActive,
  });
  if (error) databaseFailure(error.message);
}

export async function setEntityCollaboratorActive(
  client: Pick<Client, 'rpc'>,
  profileId: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await client.rpc('set_entity_collaborator_active', {
    p_profile_id: entityIdSchema.parse(profileId),
    p_is_active: isActive,
  });
  if (error) databaseFailure(error.message);
}

export async function acceptPendingEntityInvitation(client: Pick<Client, 'rpc'>): Promise<void> {
  const pending = await client.rpc('my_entity_invitation');
  if (pending.error) databaseFailure(pending.error.message);
  const invitations = z
    .array(ownInvitationSchema)
    .max(1)
    .parse(pending.data ?? []);
  if (invitations.length === 0) return;
  const accepted = await client.rpc('accept_my_entity_invitation');
  if (accepted.error) databaseFailure(accepted.error.message);
  z.uuid().parse(accepted.data);
}
