/**
 * The incident report (RAPP-973): a player tells the team, privately, what
 * happened, when and where, and may send it anonymously. It is the third form
 * she sends when she wants on the form engine (`on-demand-form.ts`), beside the
 * suggestions form and the mentoring request: staff add questions to it on the
 * board, and her answers travel with the report, encrypted.
 *
 * Its fixed screen (`systemScreen` `incident_report`) holds the report's own
 * parts. Her phone walks what, when and where as questions of the engine
 * (`incidentFormCatalog`), so they are checked like every other question; the
 * anonymous switch sits under them on that screen. Only `incidents.manage`
 * reads a report, and an anonymous one never names her.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from './errors';
import { MADRID_TIME_ZONE } from './events';
import type { IntakeCatalog } from './intake-builder/builder';
import type { BuilderText } from './intake-builder/profile-layout';
import { LONG_TEXT_MAX_LENGTH, SHORT_TEXT_MAX_LENGTH } from './intake-builder/question-types';
import {
  fetchMyOnDemandFormSource,
  formAnswersSchema,
  onDemandFormCatalog,
  takeFixedAnswers,
  withFixedQuestions,
  type FixedFormQuestion,
  type FormAnswer,
  type OnDemandForm,
} from './on-demand-form';
import type { Database } from './types/database';

type RpcClient = Pick<SupabaseClient<Database>, 'rpc'>;

function databaseFailure(message: string): never {
  throw new AppError('DB-1', { message });
}

export const INCIDENT_STATUSES = ['open', 'closed'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

/** The screen holding what happened, when, where and the anonymous switch. */
export const INCIDENT_REPORT_SCREEN = 'incident_report';

/** At most ten reports a day, as the database counts them. */
export const INCIDENT_REPORTS_PER_DAY = 10;

/**
 * The ids of the report's own parts on her phone: fixed UUIDs of the app,
 * which no question staff make can take.
 */
export const INCIDENT_FIXED_FIELD_IDS = {
  what: '00000000-0000-4973-8000-000000000001',
  when: '00000000-0000-4973-8000-000000000002',
  where: '00000000-0000-4973-8000-000000000003',
} as const;

/** Today in Madrid, `YYYY-MM-DD`: the latest day an incident can have happened. */
export function todayInMadrid(now: Date = new Date()): string {
  // `en-CA` writes the date as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: MADRID_TIME_ZONE }).format(now);
}

export const incidentReportSchema = z.object({
  what: z.string().trim().min(1).max(LONG_TEXT_MAX_LENGTH),
  happenedOn: z.iso.date().refine((day) => day <= todayInMadrid()),
  where: z.string().trim().min(1).max(SHORT_TEXT_MAX_LENGTH),
  isAnonymous: z.boolean(),
});
export type IncidentReportValues = z.output<typeof incidentReportSchema>;

/**
 * What, when and where as questions of the engine, worded as her app words
 * them. The day takes no future date (`min_age` 0: today or before).
 */
export function incidentFixedQuestions(labels: {
  readonly what: BuilderText;
  readonly when: BuilderText;
  readonly where: BuilderText;
}): readonly FixedFormQuestion[] {
  return [
    {
      fieldId: INCIDENT_FIXED_FIELD_IDS.what,
      type: 'long_text',
      label: labels.what,
      isRequired: true,
    },
    {
      fieldId: INCIDENT_FIXED_FIELD_IDS.when,
      type: 'date',
      label: labels.when,
      isRequired: true,
      settings: { min_age: 0 },
    },
    {
      fieldId: INCIDENT_FIXED_FIELD_IDS.where,
      type: 'short_text',
      label: labels.where,
      isRequired: true,
    },
  ];
}

/** The incident form as she fills it in now; null from a server before it. */
export type IncidentForm = OnDemandForm;

/**
 * The catalog her phone walks the incident form with: the catalog
 * `intake_catalog` sent, with the form laid over it and what, when and where
 * first on its fixed screen.
 */
export function incidentFormCatalog(
  raw: unknown,
  form: IncidentForm,
  labels: Parameters<typeof incidentFixedQuestions>[0],
  readAt: string = new Date().toISOString(),
): IntakeCatalog {
  return onDemandFormCatalog(
    raw,
    'incident',
    withFixedQuestions(form, INCIDENT_REPORT_SCREEN, incidentFixedQuestions(labels)),
    readAt,
  );
}

/** What her phone needs to walk the incident form: the catalog as sent, and the form. */
export async function fetchMyIncidentFormSource(
  client: RpcClient,
): Promise<{ readonly raw: unknown; readonly form: IncidentForm | null }> {
  return fetchMyOnDemandFormSource(client, 'incident');
}

/**
 * The report and her answers to the questions staff added, from what she gave
 * on the walk (by question id) and the anonymous switch.
 */
export function incidentReportFromWalk(
  answers: Readonly<Record<string, unknown>>,
  isAnonymous: boolean,
): {
  readonly report: z.input<typeof incidentReportSchema>;
  readonly answers: Readonly<Record<string, unknown>>;
} {
  const { fixed, added } = takeFixedAnswers(
    answers,
    Object.values(INCIDENT_FIXED_FIELD_IDS).map((fieldId) => ({ fieldId })),
  );
  const text = (id: string) => (typeof fixed[id] === 'string' ? fixed[id] : '');
  return {
    report: {
      what: text(INCIDENT_FIXED_FIELD_IDS.what),
      happenedOn: text(INCIDENT_FIXED_FIELD_IDS.when),
      where: text(INCIDENT_FIXED_FIELD_IDS.where),
      isAnonymous,
    },
    answers: added,
  };
}

/**
 * Sends a report with her answers to the questions staff added, by question
 * id. The database checks the answers against the form as it is now, a
 * required one included.
 */
export async function sendIncidentReport(
  client: RpcClient,
  input: z.input<typeof incidentReportSchema>,
  answers: Readonly<Record<string, unknown>>,
): Promise<string> {
  const report = incidentReportSchema.parse(input);
  const { data, error } = await client.rpc('send_incident_report', {
    p_what: report.what,
    p_happened_on: report.happenedOn,
    p_where: report.where,
    p_is_anonymous: report.isAnonymous,
    p_answers:
      answers as Database['public']['Functions']['send_incident_report']['Args']['p_answers'],
  });
  if (error) databaseFailure(error.message);
  return z.uuid().parse(data);
}

// Her own reports ----------------------------------------------------------------------------------

export interface OwnIncidentReport {
  readonly id: string;
  readonly happenedOn: string;
  readonly isAnonymous: boolean;
  readonly status: IncidentStatus;
  readonly createdAt: string;
}

const ownReportRowSchema = z.object({
  id: z.uuid(),
  happened_on: z.string(),
  is_anonymous: z.boolean(),
  status: z.enum(INCIDENT_STATUSES),
  created_at: z.string(),
});

export async function fetchOwnIncidentReports(
  client: RpcClient,
  signal?: AbortSignal,
): Promise<readonly OwnIncidentReport[]> {
  let query = client.rpc('list_own_incident_reports');
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) databaseFailure(error.message);
  return z
    .array(ownReportRowSchema)
    .parse(data ?? [])
    .map((row) => ({
      id: row.id,
      happenedOn: row.happened_on,
      isAnonymous: row.is_anonymous,
      status: row.status,
      createdAt: row.created_at,
    }));
}

// The team's reports -------------------------------------------------------------------------------

/** Who sent a report: her name, or nobody when she sent it anonymously. */
export type IncidentSender =
  | { readonly kind: 'anonymous' }
  | {
      readonly kind: 'named';
      readonly playerId: string;
      readonly firstName: string;
      readonly lastName: string;
    };

export interface StaffIncidentReport {
  readonly id: string;
  readonly sender: IncidentSender;
  readonly what: string;
  readonly happenedOn: string;
  readonly where: string;
  readonly status: IncidentStatus;
  readonly closedAt: string | null;
  readonly createdAt: string;
  /** Her answers to the questions staff added to the form, in the form's order. */
  readonly answers: readonly FormAnswer[];
}

const staffReportRowSchema = z.object({
  id: z.uuid(),
  is_anonymous: z.boolean(),
  player_id: z.uuid().nullable(),
  player_first_name: z.string().nullable(),
  player_last_name: z.string().nullable(),
  what: z.string(),
  happened_on: z.string(),
  where_text: z.string(),
  status: z.enum(INCIDENT_STATUSES),
  closed_at: z.string().nullable(),
  created_at: z.string(),
  answers: formAnswersSchema,
});

function senderFromRow(row: z.infer<typeof staffReportRowSchema>): IncidentSender {
  // Anonymous, or a sender the database did not name: nobody.
  if (row.is_anonymous || row.player_id === null) return { kind: 'anonymous' };
  return {
    kind: 'named',
    playerId: row.player_id,
    firstName: row.player_first_name ?? '',
    lastName: row.player_last_name ?? '',
  };
}

export async function fetchStaffIncidentReports(
  client: RpcClient,
  signal?: AbortSignal,
): Promise<readonly StaffIncidentReport[]> {
  let query = client.rpc('list_staff_incident_reports');
  if (signal !== undefined) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) databaseFailure(error.message);
  return z
    .array(staffReportRowSchema)
    .parse(data ?? [])
    .map((row) => ({
      id: row.id,
      sender: senderFromRow(row),
      what: row.what,
      happenedOn: row.happened_on,
      where: row.where_text,
      status: row.status,
      closedAt: row.closed_at,
      createdAt: row.created_at,
      answers: row.answers,
    }));
}

/** The team closes a report, or opens it again. */
export async function setIncidentReportStatus(
  client: RpcClient,
  reportId: string,
  status: IncidentStatus,
): Promise<void> {
  const { error } = await client.rpc('set_incident_report_status', {
    p_report_id: z.uuid().parse(reportId),
    p_status: z.enum(INCIDENT_STATUSES).parse(status),
  });
  if (error) databaseFailure(error.message);
}
