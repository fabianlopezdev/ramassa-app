/**
 * Seasons and re-registration (RAPP-306).
 *
 * Staff create seasons and choose the current one. Publishing the current
 * season's authorization (RAPP-304) makes every returning player re-register:
 * she checks her details, answers the season questions and signs. Her season
 * answers are kept per season, and the season number is counted from the
 * seasons she signed plus the ones she played before the app.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError, databaseErrorCode } from '../errors';
import {
  appAnswersFromForm,
  appFormToSend,
  type AppFormKey,
} from '../intake-builder/app-field-form';
import { answerPayload } from '../intake-builder/builder';
import type { SystemFieldIndex } from '../intake-builder/field-answers';
import type { CustomAnswerValue } from '../intake-builder/question-types';
import {
  createTargetedNotificationSend,
  fetchCustomNotificationGroups,
  previewNotificationAudience,
  saveCustomNotificationGroup,
  type NotificationContent,
} from '../notifications';
import type { SeasonAnswerFields } from '../schemas/season';
import type { Database, Json } from '../types/database';

type Client = SupabaseClient<Database>;

function failure(message: string): never {
  throw new AppError(databaseErrorCode(message), { message });
}

const seasonRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  starts_on: z.string(),
  is_current: z.boolean(),
});

export interface Season {
  readonly id: string;
  readonly name: string;
  readonly startsOn: string;
  readonly isCurrent: boolean;
}

export async function fetchSeasons(client: Client): Promise<readonly Season[]> {
  const { data, error } = await client
    .from('seasons')
    .select('id, name, starts_on, is_current')
    .order('starts_on', { ascending: false });
  if (error) failure(error.message);
  return z
    .array(seasonRowSchema)
    .parse(data ?? [])
    .map((row) => ({
      id: row.id,
      name: row.name,
      startsOn: row.starts_on,
      isCurrent: row.is_current,
    }));
}

export const newSeasonSchema = z.object({
  name: z.string().trim().min(1).max(50),
  startsOn: z.iso.date(),
  makeCurrent: z.boolean(),
});

export async function createSeason(
  client: Client,
  input: z.input<typeof newSeasonSchema>,
): Promise<string> {
  const season = newSeasonSchema.parse(input);
  const { data, error } = await client.rpc('create_season', {
    p_name: season.name,
    p_starts_on: season.startsOn,
    p_make_current: season.makeCurrent,
  });
  if (error) failure(error.message);
  return z.uuid().parse(data);
}

export async function setCurrentSeason(client: Client, seasonId: string): Promise<void> {
  const { error } = await client.rpc('set_current_season', { p_season_id: seasonId });
  if (error) failure(error.message);
}

/** The seasons she played before the app; the season number counts them. */
export async function setPriorSeasons(
  client: Client,
  profileId: string,
  count: number,
): Promise<void> {
  const { error } = await client.rpc('set_prior_seasons', {
    p_profile_id: profileId,
    p_count: z.number().int().min(0).max(20).parse(count),
  });
  if (error) failure(error.message);
}

/** The app's season questions her re-registration asks. Her status details stay as they are. */
const MY_SEASON_FORM_KEYS = [
  'applicantStatus',
  'supportingEntities',
  'childcareNeed',
  'specificNeeds',
] as const satisfies readonly AppFormKey[];

/**
 * Her answers to the app's season questions, by field (RAPP-663). A question
 * she left empty is null, which removes its answer.
 */
export function mySeasonAnswers(
  fields: SystemFieldIndex,
  values: Partial<SeasonAnswerFields>,
): Record<string, CustomAnswerValue | null> {
  return appAnswersFromForm(fields, appFormToSend(values, MY_SEASON_FORM_KEYS));
}

/**
 * Her season answers by field (RAPP-661, RAPP-663): the app's season fields and
 * the team's alike, every one placed on the season form. Null removes an
 * answer. The call ends her re-registration: every required season answer is
 * checked there.
 */
export async function updateMySeasonAnswers(
  client: Client,
  answers: Readonly<Record<string, CustomAnswerValue | null>>,
): Promise<void> {
  const { error } = await client.rpc('update_my_season_answers', {
    p_payload: { answers: answerPayload(answers) } as Json,
  });
  if (error) failure(error.message);
}

const registrationRowSchema = z.object({
  profile_id: z.uuid(),
  first_name: z.string(),
  last_name: z.string(),
  registered: z.boolean(),
  method: z.string().nullable(),
  signed_at: z.string().nullable(),
});

export interface SeasonRegistration {
  readonly profileId: string;
  readonly name: string;
  readonly registered: boolean;
  readonly method: string | null;
  readonly signedAt: string | null;
}

/** Every active player and whether she registered for the season (the current one by default). */
export async function fetchSeasonRegistrations(
  client: Client,
  seasonId: string | null = null,
): Promise<readonly SeasonRegistration[]> {
  const { data, error } =
    seasonId === null
      ? await client.rpc('season_registration_status')
      : await client.rpc('season_registration_status', { p_season_id: seasonId });
  if (error) failure(error.message);
  return z
    .array(registrationRowSchema)
    .parse(data ?? [])
    .map((row) => ({
      profileId: row.profile_id,
      name: `${row.first_name} ${row.last_name}`.trim(),
      registered: row.registered,
      method: row.method,
      signedAt: row.signed_at,
    }));
}

export type RegistrationFilter = 'all' | 'registered' | 'pending';

export function filterRegistrations(
  rows: readonly SeasonRegistration[],
  filter: RegistrationFilter,
): readonly SeasonRegistration[] {
  if (filter === 'all') return rows;
  return rows.filter((row) => row.registered === (filter === 'registered'));
}

/** The custom notification group a season's reminders go to. */
export function reminderGroupName(seasonName: string): string {
  return `Reinscripció ${seasonName}`.slice(0, 80);
}

/**
 * Reminds the players who have not re-registered, through the targeted
 * notifications: their names go into the season's custom group, and the
 * message goes to that group. Returns how many devices' owners it reached;
 * zero sends nothing.
 */
export async function remindUnregisteredPlayers(
  client: Client,
  input: {
    readonly seasonName: string;
    readonly participantIds: readonly string[];
    readonly title: NotificationContent;
    readonly body: NotificationContent;
  },
): Promise<number> {
  if (input.participantIds.length === 0) return 0;
  const name = reminderGroupName(input.seasonName);
  const existing = (await fetchCustomNotificationGroups(client)).find(
    (group) => group.name === name,
  );
  const groupId = await saveCustomNotificationGroup(client, {
    id: existing?.id,
    name,
    participantIds: input.participantIds,
  });
  const audience = { kind: 'custom_group' as const, customGroupId: groupId };
  const reached = await previewNotificationAudience(client, audience);
  if (reached.length === 0) return 0;
  await createTargetedNotificationSend(client, {
    title: input.title,
    body: input.body,
    audience,
    expectedRecipientCount: reached.length,
  });
  return reached.length;
}
