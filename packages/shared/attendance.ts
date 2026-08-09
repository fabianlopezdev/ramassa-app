import { TZDate } from '@date-fns/tz';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, format } from 'date-fns';
import { z } from 'zod';
import { AppError } from './errors';
import { MADRID_TIME_ZONE, toUtcInstant, type EventLocalizedText } from './events';
import type { Database } from './types/database';

export const ATTENDANCE_STATUSES = ['present', 'absent', 'excused'] as const;
export const ATTENDANCE_OVERVIEW_STATES = ['empty', 'in_progress', 'complete'] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export type AttendanceOverviewState = (typeof ATTENDANCE_OVERVIEW_STATES)[number];
type Client = SupabaseClient<Database>;

/**
 * One server-accepted mark. `marked_at` is the writer's intent timestamp and
 * is the sole conflict clock; `updated_at` is operational metadata only.
 */
export interface AttendanceMark {
  readonly id: string;
  readonly occurrence_id: string;
  readonly player_id: string;
  readonly status: AttendanceStatus;
  readonly marked_by: string | null;
  readonly marked_at: string;
  readonly updated_at: string;
}

export function nextAttendanceStatus(status: AttendanceStatus | null): AttendanceStatus {
  if (status === null || status === 'excused') return 'present';
  return status === 'present' ? 'absent' : 'excused';
}

export function nextAttendanceMarkedAt(current: string | null, now = new Date()): string {
  const currentTime = current === null ? Number.NEGATIVE_INFINITY : Date.parse(current);
  return new Date(Math.max(now.getTime(), currentTime + 1)).toISOString();
}

/** Last-writer-wins by the timestamp generated when the coach tapped. */
export function mergeAttendanceMark(
  existing: AttendanceMark,
  incoming: AttendanceMark,
): AttendanceMark {
  if (incoming.marked_at > existing.marked_at) return incoming;
  if (incoming.marked_at === existing.marked_at && existing.id.startsWith('local:')) {
    return incoming;
  }
  return existing;
}

export function mergeAttendanceMarks(
  marks: readonly AttendanceMark[],
  incoming: AttendanceMark,
): readonly AttendanceMark[] {
  const index = marks.findIndex((mark) => mark.player_id === incoming.player_id);
  if (index === -1) return [...marks, incoming];
  const merged = mergeAttendanceMark(marks[index]!, incoming);
  if (merged === marks[index]) return marks;
  const next = [...marks];
  next[index] = merged;
  return next;
}

export interface AttendanceOccurrence {
  readonly id: string;
  readonly event_id: string;
  readonly starts_at: string;
  readonly ends_at: string | null;
}

export interface AttendanceEvent {
  readonly id: string;
  readonly title: EventLocalizedText;
  readonly location: string;
}

export interface AttendanceProfile {
  readonly id: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly is_active: boolean;
}

export interface AttendanceSignup {
  readonly player_id: string;
  readonly state: string;
}

export interface AttendanceParticipant extends AttendanceProfile {
  readonly signed_up: boolean;
  readonly mark: AttendanceMark | null;
}

export interface AttendanceSheet {
  readonly occurrence: AttendanceOccurrence;
  readonly event: AttendanceEvent;
  readonly participants: readonly AttendanceParticipant[];
}

export interface AttendanceOccurrenceListRow extends AttendanceOccurrence {
  readonly event: AttendanceEvent;
}

interface AttendanceSheetSource {
  readonly occurrence: AttendanceOccurrence;
  readonly event: AttendanceEvent;
  readonly profiles: readonly AttendanceProfile[];
  readonly signups: readonly AttendanceSignup[];
  readonly marks: readonly AttendanceMark[];
}

function newestMarksByPlayer(marks: readonly AttendanceMark[]): Map<string, AttendanceMark> {
  const newest = new Map<string, AttendanceMark>();
  for (const mark of marks) {
    const current = newest.get(mark.player_id);
    newest.set(mark.player_id, current === undefined ? mark : mergeAttendanceMark(current, mark));
  }
  return newest;
}

function expectedParticipantIds(
  profiles: readonly AttendanceProfile[],
  signups: readonly AttendanceSignup[],
): ReadonlySet<string> {
  const expected = new Set(
    profiles.filter((profile) => profile.is_active).map((profile) => profile.id),
  );
  for (const signup of signups) {
    if (signup.state !== 'cancelled') expected.add(signup.player_id);
  }
  return expected;
}

export function buildAttendanceSheet(source: AttendanceSheetSource): AttendanceSheet {
  const activeSignupIds = new Set(
    source.signups
      .filter((signup) => signup.state !== 'cancelled')
      .map((signup) => signup.player_id),
  );
  const expected = expectedParticipantIds(source.profiles, source.signups);
  const marks = newestMarksByPlayer(source.marks);
  const participants = source.profiles
    .filter((profile) => expected.has(profile.id))
    .map((profile) => ({
      ...profile,
      signed_up: activeSignupIds.has(profile.id),
      mark: marks.get(profile.id) ?? null,
    }))
    // `map` already created a new array, so an in-place sort is both immutable
    // with respect to the caller and compatible with the app's Hermes runtime.
    .sort((left, right) => {
      if (left.signed_up !== right.signed_up) return left.signed_up ? -1 : 1;
      return `${left.first_name}\u0000${left.last_name}`.localeCompare(
        `${right.first_name}\u0000${right.last_name}`,
      );
    });
  return { occurrence: source.occurrence, event: source.event, participants };
}

export interface AttendanceOverviewRow {
  readonly occurrence_id: string;
  readonly event_id: string;
  readonly title: EventLocalizedText;
  readonly location: string;
  readonly starts_at: string;
  readonly ends_at: string | null;
  readonly expected_count: number;
  readonly marked_count: number;
  readonly state: AttendanceOverviewState;
}

interface AttendanceOverviewSource {
  readonly occurrences: readonly AttendanceOccurrence[];
  readonly events: readonly AttendanceEvent[];
  readonly profiles: readonly AttendanceProfile[];
  readonly signups: readonly (AttendanceSignup & { readonly event_id?: string })[];
  readonly marks: readonly AttendanceMark[];
}

export function buildAttendanceOverview(
  source: AttendanceOverviewSource,
): readonly AttendanceOverviewRow[] {
  const events = new Map(source.events.map((event) => [event.id, event]));
  return source.occurrences.flatMap((occurrence) => {
    const event = events.get(occurrence.event_id);
    if (event === undefined) return [];
    const signups = source.signups.filter((signup) => signup.event_id === occurrence.event_id);
    const expected = expectedParticipantIds(source.profiles, signups);
    const marked = new Set(
      source.marks
        .filter((mark) => mark.occurrence_id === occurrence.id && expected.has(mark.player_id))
        .map((mark) => mark.player_id),
    ).size;
    const state: AttendanceOverviewState =
      marked === 0 ? 'empty' : marked >= expected.size ? 'complete' : 'in_progress';
    return [
      {
        occurrence_id: occurrence.id,
        event_id: occurrence.event_id,
        title: event.title,
        location: event.location,
        starts_at: occurrence.starts_at,
        ends_at: occurrence.ends_at,
        expected_count: expected.size,
        marked_count: marked,
        state,
      },
    ];
  });
}

export const attendanceOverviewSearchSchema = z.object({
  q: z.string().trim().max(200).catch('').default(''),
  status: z
    .enum(['all', ...ATTENDANCE_OVERVIEW_STATES])
    .catch('all')
    .default('all'),
});
export type AttendanceOverviewSearch = z.infer<typeof attendanceOverviewSearchSchema>;

function normalizedSearchValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase();
}

export function filterAttendanceOverview(
  rows: readonly AttendanceOverviewRow[],
  search: AttendanceOverviewSearch,
): readonly AttendanceOverviewRow[] {
  const needle = normalizedSearchValue(search.q);
  return rows.filter((row) => {
    if (search.status !== 'all' && row.state !== search.status) return false;
    if (needle.length === 0) return true;
    const content = [...Object.values(row.title), row.location].join(' ');
    return normalizedSearchValue(content).includes(needle);
  });
}

const OCCURRENCE_COLUMNS = 'id, event_id, starts_at, ends_at';
const EVENT_COLUMNS = 'id, title, location';
const PROFILE_COLUMNS = 'id, first_name, last_name, is_active';
const SIGNUP_COLUMNS = 'event_id, player_id, state';
const MARK_COLUMNS = 'id, occurrence_id, player_id, status, marked_by, marked_at, updated_at';

export async function fetchAttendanceOccurrencesForDay(
  client: Client,
  now = new Date(),
  signal?: AbortSignal,
): Promise<readonly AttendanceOccurrenceListRow[]> {
  const madridNow = new TZDate(now, MADRID_TIME_ZONE);
  const localDay = format(madridNow, 'yyyy-MM-dd');
  const from = toUtcInstant(`${localDay}T00:00`);
  const untilDay = format(addDays(madridNow, 1), 'yyyy-MM-dd');
  const until = toUtcInstant(`${untilDay}T00:00`);
  let occurrencesQuery = client
    .from('event_occurrences')
    .select(OCCURRENCE_COLUMNS)
    .gte('starts_at', from)
    .lt('starts_at', until)
    .order('starts_at', { ascending: true });
  let eventsQuery = client.from('events').select(EVENT_COLUMNS).eq('status', 'published');
  if (signal !== undefined) {
    occurrencesQuery = occurrencesQuery.abortSignal(signal);
    eventsQuery = eventsQuery.abortSignal(signal);
  }
  const [occurrencesResult, eventsResult] = await Promise.all([occurrencesQuery, eventsQuery]);
  const error = occurrencesResult.error ?? eventsResult.error;
  if (error) throw new AppError('DB-1', { message: error.message });
  const events = new Map(
    ((eventsResult.data ?? []) as unknown as AttendanceEvent[]).map((event) => [event.id, event]),
  );
  return ((occurrencesResult.data ?? []) as AttendanceOccurrence[]).flatMap((occurrence) => {
    const event = events.get(occurrence.event_id);
    return event === undefined ? [] : [{ ...occurrence, event }];
  });
}

export async function fetchAttendanceSheet(
  client: Client,
  occurrenceId: string,
  signal?: AbortSignal,
): Promise<AttendanceSheet> {
  let occurrenceQuery = client
    .from('event_occurrences')
    .select(OCCURRENCE_COLUMNS)
    .eq('id', occurrenceId);
  if (signal !== undefined) occurrenceQuery = occurrenceQuery.abortSignal(signal);
  const occurrenceResult = await occurrenceQuery.single();
  if (occurrenceResult.error)
    throw new AppError('DB-1', { message: occurrenceResult.error.message });
  const occurrence = occurrenceResult.data as AttendanceOccurrence;

  let eventQuery = client.from('events').select(EVENT_COLUMNS).eq('id', occurrence.event_id);
  let profilesQuery = client.from('profiles').select(PROFILE_COLUMNS).eq('role', 'player');
  let signupsQuery = client
    .from('event_signups')
    .select(SIGNUP_COLUMNS)
    .eq('event_id', occurrence.event_id);
  let marksQuery = client
    .from('attendance')
    .select(MARK_COLUMNS)
    .eq('occurrence_id', occurrence.id);
  if (signal !== undefined) {
    eventQuery = eventQuery.abortSignal(signal);
    profilesQuery = profilesQuery.abortSignal(signal);
    signupsQuery = signupsQuery.abortSignal(signal);
    marksQuery = marksQuery.abortSignal(signal);
  }
  const [eventResult, profilesResult, signupsResult, marksResult] = await Promise.all([
    eventQuery.single(),
    profilesQuery,
    signupsQuery,
    marksQuery,
  ]);
  const failed = [eventResult, profilesResult, signupsResult, marksResult].find(
    (result) => result.error !== null,
  );
  if (failed?.error) throw new AppError('DB-1', { message: failed.error.message });
  return buildAttendanceSheet({
    occurrence,
    event: eventResult.data as unknown as AttendanceEvent,
    profiles: (profilesResult.data ?? []) as AttendanceProfile[],
    signups: (signupsResult.data ?? []) as AttendanceSignup[],
    marks: (marksResult.data ?? []) as unknown as AttendanceMark[],
  });
}

export async function fetchAttendanceOverview(
  client: Client,
  search: AttendanceOverviewSearch,
): Promise<readonly AttendanceOverviewRow[]> {
  const [occurrencesResult, eventsResult, profilesResult, signupsResult, marksResult] =
    await Promise.all([
      client
        .from('event_occurrences')
        .select(OCCURRENCE_COLUMNS)
        .order('starts_at', { ascending: false }),
      client.from('events').select(EVENT_COLUMNS),
      client.from('profiles').select(PROFILE_COLUMNS).eq('role', 'player'),
      client.from('event_signups').select(SIGNUP_COLUMNS),
      client.from('attendance').select(MARK_COLUMNS),
    ]);
  const failed = [occurrencesResult, eventsResult, profilesResult, signupsResult, marksResult].find(
    (result) => result.error !== null,
  );
  if (failed?.error) throw new AppError('DB-1', { message: failed.error.message });
  return filterAttendanceOverview(
    buildAttendanceOverview({
      occurrences: (occurrencesResult.data ?? []) as AttendanceOccurrence[],
      events: (eventsResult.data ?? []) as unknown as AttendanceEvent[],
      profiles: (profilesResult.data ?? []) as AttendanceProfile[],
      signups: (signupsResult.data ?? []) as (AttendanceSignup & { event_id: string })[],
      marks: (marksResult.data ?? []) as unknown as AttendanceMark[],
    }),
    search,
  );
}

export async function upsertAttendanceMark(
  client: Client,
  input: {
    readonly occurrenceId: string;
    readonly playerId: string;
    readonly status: AttendanceStatus;
    readonly markedAt: string;
  },
): Promise<AttendanceMark> {
  const { data, error } = await client.rpc('mark_attendance', {
    attendance_occurrence_id: input.occurrenceId,
    attendance_player_id: input.playerId,
    attendance_status: input.status,
    attendance_marked_at: input.markedAt,
  });
  if (error) throw new AppError('DB-1', { message: error.message });
  return data as unknown as AttendanceMark;
}

export function subscribeToAttendance(
  client: Client,
  occurrenceId: string,
  onMark: (mark: AttendanceMark) => void,
): () => void {
  const channel = client
    .channel(`attendance:${occurrenceId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'attendance',
        filter: `occurrence_id=eq.${occurrenceId}`,
      },
      (payload) => {
        if (payload.eventType !== 'DELETE') onMark(payload.new as AttendanceMark);
      },
    )
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
