/**
 * Splitting the smoke suite across simulators (RAPP-500).
 *
 * The suite ran one flow after another on one device for about 96 minutes. It
 * now runs on N devices at once against one freshly seeded QA database, so the
 * only real question is which flows may share that database at the same time.
 * Most may. The ones below may not, and stay together on one shard, in order:
 *
 * - `attendance`, `attendance-offline` and `events-signup`. `attendance` flips
 *   the shared player's mark for today's session, both attendance flows sign in
 *   as the same staff member with the same authenticator code, and the
 *   attendance sheet lists signed-up players first, so a sheet loaded while
 *   `events-signup` has the player cancelled can push her row off screen.
 * - `phase8-survey-ca` then `phase8-survey-ar`. Survey completion is one-shot
 *   per player, so the second locale needs the first one's response deleted
 *   (`SURVEY_UNDO_SQL`). It used to be a whole-database reset, which is no
 *   longer possible with other flows using the database at the same moment.
 *
 * `smoke-auth` signs the shared player out with global scope. The app only asks
 * the server about the session again at sign-out, and access tokens last an
 * hour, so the other devices keep working; it still runs LAST on its shard so
 * fewer flows are in flight when it does.
 *
 * Everything else is balanced by duration, longest group first onto the least
 * loaded shard. The durations come from the previous run on this checkout when
 * there is one, and from the last sequential run (2026-10-16) when there is not.
 */

export interface FlowGroup {
  readonly flows: readonly string[];
}

export interface Shard {
  readonly index: number;
  readonly flows: readonly string[];
  readonly estimatedSeconds: number;
}

/** Seconds per flow on iOS, measured from the sequential run on 2026-10-16 (96 min total). */
export const BASELINE_SECONDS: Readonly<Record<string, number>> = {
  'attendance-history.yaml': 189,
  'attendance-offline.yaml': 182,
  'attendance.yaml': 184,
  'events-signup.yaml': 284,
  'feed-browse.yaml': 314,
  'forum.yaml': 210,
  'gallery.yaml': 177,
  'knowledge-story.yaml': 305,
  'messaging.yaml': 265,
  'offline-feed.yaml': 204,
  'phase8-feedback.yaml': 281,
  'phase8-mentoring.yaml': 221,
  'phase8-notification.yaml': 267,
  'phase8-survey-ar.yaml': 300,
  'phase8-survey-ca.yaml': 212,
  'smoke-auth.yaml': 419,
  'smoke-i18n.yaml': 446,
  'smoke-onboarding-invited.yaml': 349,
  'smoke-onboarding.yaml': 438,
  'smoke-profile.yaml': 314,
  'smoke-shells.yaml': 199,
};

const DEFAULT_SECONDS = 270;

/** Flows that must run on one device, in this order. */
export const ORDERED_GROUPS: readonly (readonly string[])[] = [
  ['attendance.yaml', 'attendance-offline.yaml', 'events-signup.yaml'],
  ['phase8-survey-ca.yaml', 'phase8-survey-ar.yaml'],
];

/** Runs last on whichever shard it lands on. */
export const LAST_ON_SHARD = 'smoke-auth.yaml';

/**
 * Deletes the shared player's response to the seeded survey, so the second
 * locale walks the same full journey as the first. QA database only.
 */
export const SURVEY_UNDO_SQL = `
  delete from public.survey_responses
   where survey_id = '5eed0000-0000-4000-8040-000000000001'
     and player_id = '5eed0000-0000-4000-8000-000000000011';
`;

/** SQL to run on the QA database before a flow, when the flow needs it. */
export function sqlBefore(flow: string, previousOnShard: readonly string[]): string | undefined {
  if (
    flow.startsWith('phase8-survey-') &&
    previousOnShard.some((f) => f.startsWith('phase8-survey-'))
  ) {
    return SURVEY_UNDO_SQL;
  }
  return undefined;
}

/** Groups the selected flows: the ordered groups (only the members selected), then singles. */
export function groupFlows(flows: readonly string[]): FlowGroup[] {
  const selected = new Set(flows);
  const grouped = new Set<string>();
  const groups: FlowGroup[] = [];
  for (const ordered of ORDERED_GROUPS) {
    const members = ordered.filter((flow) => selected.has(flow));
    if (members.length === 0) continue;
    members.forEach((flow) => grouped.add(flow));
    groups.push({ flows: members });
  }
  for (const flow of flows) {
    if (!grouped.has(flow)) groups.push({ flows: [flow] });
  }
  return groups;
}

export function durationOf(flow: string, measured: Readonly<Record<string, number>>): number {
  return measured[flow] ?? BASELINE_SECONDS[flow] ?? DEFAULT_SECONDS;
}

/**
 * Longest-processing-time-first: each group, longest first, goes to the shard
 * with the least work so far. Deterministic for a given input, so a failure can
 * be re-run on the same split.
 */
export function planShards(
  flows: readonly string[],
  shardCount: number,
  measured: Readonly<Record<string, number>> = {},
): Shard[] {
  if (!Number.isInteger(shardCount) || shardCount < 1) {
    throw new Error(`Shard count must be a positive integer, got ${shardCount}`);
  }
  const groups = groupFlows(flows)
    .map((group) => ({
      ...group,
      seconds: group.flows.reduce((sum, flow) => sum + durationOf(flow, measured), 0),
    }))
    .sort((a, b) => b.seconds - a.seconds || a.flows[0]!.localeCompare(b.flows[0]!));

  const count = Math.min(shardCount, Math.max(groups.length, 1));
  const shards = Array.from({ length: count }, (_, index) => ({
    index,
    flows: [] as string[],
    estimatedSeconds: 0,
  }));
  for (const group of groups) {
    const target = shards.reduce((least, shard) =>
      shard.estimatedSeconds < least.estimatedSeconds ? shard : least,
    );
    target.flows.push(...group.flows);
    target.estimatedSeconds += group.seconds;
  }
  for (const shard of shards) {
    const last = shard.flows.indexOf(LAST_ON_SHARD);
    if (last !== -1) {
      shard.flows.splice(last, 1);
      shard.flows.push(LAST_ON_SHARD);
    }
  }
  return shards.filter((shard) => shard.flows.length > 0);
}
