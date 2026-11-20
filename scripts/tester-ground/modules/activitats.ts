/**
 * Tester ground, Activitats (RAPP-885): the activity categories, the
 * activities the four testers share, the companions' sign-ups that make the
 * counts look alive, the testers' own starting sign-ups and their attendance
 * at past sessions.
 *
 * What a tester finds (the rules live in `activities-attention.ts` and
 * `home-attention.ts` in the app):
 *   - Inici shows her next signed-up activity, else the earliest upcoming one.
 *     Testers 1 and 3 start with no active sign-up, so Inici shows the cooking
 *     workshop, new, and it adds 1 to the Inici number. Testers 2 and 4 start
 *     signed up for the Catalan conversation group, so Inici shows that one
 *     with her sign-up and adds nothing.
 *   - Activitats counts the new activities except the one Inici counts, and
 *     each new activity says "Nou" on its first upcoming card.
 *
 * Activities have no image in the schema, so no image tokens are used. The
 * occurrences are made by the database trigger from each activity's dates.
 */

import {
  COMPANIONS,
  daysFromNow,
  gid,
  jsonb,
  lit,
  minutesAgo,
  ORG,
  TEAM,
  TESTERS,
  uid,
  type Account,
  type GroundModule,
} from '../lib/ground';
import {
  ACTIVITIES,
  CATEGORIES,
  type ActivityData,
  type AttendanceStatus,
  type Published,
  type SignupState,
} from './activitats/data';

const NAME = 'activitats';
/** Training sessions that took place after the testers joined (30 days before the run). */
const FIRST_ATTENDED_DAY = -29;
const TRAINING_STATUSES: readonly AttendanceStatus[] = [
  'present',
  'present',
  'absent',
  'present',
  'excused',
  'present',
];

const categoryId = (key: string) => uid(`${NAME}:category:${key}`);
const eventId = (key: string) => uid(`${NAME}:event:${key}`);
const eventIds = () => ACTIVITIES.map((activity) => eventId(activity.key)).join(', ');

function publishedAt(published: Published): string {
  if (published === 'old') return daysFromNow(-45, '10:00');
  // After the testers joined, before the record of what is seen started.
  if (published === 'recent') return daysFromNow(-10, '10:00');
  return minutesAgo(published);
}

function startsAt(activity: ActivityData): string {
  return daysFromNow(activity.day, activity.time);
}

function endsAt(activity: ActivityData): string {
  return `(${startsAt(activity)} + interval '${activity.minutes} minutes')`;
}

function recurrenceRule(activity: ActivityData): string {
  return activity.weeklyCount === undefined
    ? 'null'
    : lit(`FREQ=WEEKLY;INTERVAL=1;COUNT=${activity.weeklyCount}`);
}

function activeState(activity: ActivityData): SignupState {
  return activity.signupMode === 'interest' ? 'interested' : 'confirmed';
}

interface Signup {
  readonly activity: ActivityData;
  readonly account: Account;
  readonly state: SignupState;
}

function companionSignups(): Signup[] {
  return ACTIVITIES.flatMap((activity) =>
    COMPANIONS.slice(0, activity.companions).map((account) => ({
      activity,
      account,
      state: activeState(activity),
    })),
  );
}

function testerNumber(tester: Account): 1 | 2 | 3 | 4 {
  const index = TESTERS.findIndex((candidate) => candidate.id === tester.id);
  if (index < 0) throw new Error(`Not a tester: ${tester.key}`);
  return (index + 1) as 1 | 2 | 3 | 4;
}

function testerSignups(tester: Account): Signup[] {
  const number = testerNumber(tester);
  return ACTIVITIES.flatMap((activity) => {
    const state = activity.testers?.[number];
    return state === undefined ? [] : [{ activity, account: tester, state }];
  });
}

/** Upserts sign-ups; the database trigger keeps each activity's count of places. */
function signupsSql(signups: readonly Signup[]): string {
  if (signups.length === 0) return '';
  const rows = signups.map(
    ({ activity, account, state }) =>
      `  (${uid(`${NAME}:signup:${activity.key}:${account.key}`)}, ${ORG}, ${eventId(activity.key)}, ${lit(account.id)}::uuid, ${lit(state)})`,
  );
  return `insert into public.event_signups (id, org_id, event_id, player_id, state)
values
${rows.join(',\n')}
on conflict (event_id, player_id) do update set state = excluded.state;`;
}

function categoriesSql(): string {
  const rows = CATEGORIES.map(
    (category, index) =>
      `  (${categoryId(category.key)}, ${ORG}, ${jsonb(category.name)}, ${lit(category.icon)}, ${lit(category.color)}, ${(index + 1) * 10})`,
  );
  return `insert into public.event_categories (id, org_id, name, icon, color, sort_order)
values
${rows.join(',\n')}
on conflict (id) do update set
  name = excluded.name,
  icon = excluded.icon,
  color = excluded.color,
  sort_order = excluded.sort_order;`;
}

/**
 * Publishing an activity queues a push notification to every player. The
 * testers have no device yet and the owner's devices on staging should not
 * receive a burst of dummy notifications, so each activity's publication is
 * recorded as already sent before the activity exists. The trigger then finds
 * it and queues nothing.
 */
function quietPushSql(): string {
  const rows = ACTIVITIES.map(
    (activity) =>
      `  (${uid(`${NAME}:push:${activity.key}`)}, ${ORG}, 'event', ${eventId(activity.key)}, now(), 'complete', now())`,
  );
  return `insert into public.push_publications (id, org_id, content_type, content_id, scheduled_for, state, completed_at)
values
${rows.join(',\n')}
on conflict (content_type, content_id) do nothing;`;
}

function eventsSql(): string {
  const rows = ACTIVITIES.map((activity) =>
    [
      `  (${eventId(activity.key)}`,
      ORG,
      categoryId(activity.category),
      jsonb(activity.title),
      jsonb(activity.description),
      lit(activity.location),
      startsAt(activity),
      endsAt(activity),
      recurrenceRule(activity),
      lit(activity.maxParticipants),
      lit(activity.signupMode),
      `'published'`,
      publishedAt(activity.published),
      `${lit(TEAM.id)}::uuid)`,
    ].join(', '),
  );
  return `insert into public.events (
  id, org_id, category_id, title, description, location, starts_at, ends_at,
  recurrence_rule, max_participants, signup_mode, status, published_at, created_by
)
values
${rows.join(',\n')}
on conflict (id) do update set
  category_id = excluded.category_id,
  title = excluded.title,
  description = excluded.description,
  location = excluded.location,
  location_url = null,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  recurrence_rule = excluded.recurrence_rule,
  max_participants = excluded.max_participants,
  signup_mode = excluded.signup_mode,
  status = excluded.status,
  published_at = excluded.published_at,
  expires_at = null;`;
}

interface Mark {
  readonly activity: ActivityData;
  readonly day: number;
  readonly tester: Account;
  readonly status: AttendanceStatus;
}

function attendanceMarks(): Mark[] {
  const marks: Mark[] = [];
  for (const activity of ACTIVITIES) {
    const sessionDays = Array.from(
      { length: activity.weeklyCount ?? 1 },
      (_unused, week) => activity.day + week * 7,
    );
    TESTERS.forEach((tester, testerIndex) => {
      const number = (testerIndex + 1) as 1 | 2 | 3 | 4;
      const oneOff = activity.attendance?.[number];
      if (oneOff !== undefined) {
        marks.push({ activity, day: activity.day, tester, status: oneOff });
        return;
      }
      if (activity.weeklyCount === undefined) return;
      sessionDays
        .filter((day) => day >= FIRST_ATTENDED_DAY && day < 0)
        .forEach((day, session) => {
          const status = TRAINING_STATUSES[(session + testerIndex) % TRAINING_STATUSES.length];
          if (status !== undefined) marks.push({ activity, day, tester, status });
        });
    });
  }
  return marks;
}

/**
 * Attendance is marked the way the app marks it: by a staff member with the
 * `attendance.mark` permission, whose identity the attendance trigger reads
 * from the request claims. The claims are set for this block only and put
 * back afterwards. Without that permission the marks are skipped with a
 * notice, and everything else stays published.
 */
function attendanceSql(): string {
  const rows = attendanceMarks().map(
    ({ activity, day, tester, status }) =>
      `      (${uid(`${NAME}:attendance:${activity.key}:${day}:${tester.key}`)}, ${eventId(activity.key)}, ${daysFromNow(day, '00:00')}, ${lit(tester.id)}::uuid, ${lit(status)})`,
  );
  return `do $attendance$
declare
  previous_claims text := current_setting('request.jwt.claims', true);
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', ${lit(TEAM.id)},
      'role', 'authenticated',
      'aal', 'aal2',
      'iat', floor(extract(epoch from now()))::bigint + 60
    )::text,
    true
  );
  if (select public.has_permission('attendance.mark')) then
    insert into public.attendance (id, org_id, occurrence_id, player_id, status, marked_at)
    select mark.id, occurrence.org_id, occurrence.id, mark.player_id, mark.status, now()
    from (
      values
${rows.join(',\n')}
    ) as mark (id, event_id, day_start, player_id, status)
    -- Matched by day: weekly sessions keep their Barcelona time across the
    -- change of summer time, so their UTC hour moves.
    join public.event_occurrences as occurrence
      on occurrence.event_id = mark.event_id
     and occurrence.starts_at >= mark.day_start
     and occurrence.starts_at < mark.day_start + interval '1 day'
    on conflict (occurrence_id, player_id) do nothing;
  else
    raise notice 'activitats: % cannot mark attendance, so no attendance was recorded', ${lit(TEAM.email)};
  end if;
  perform set_config('request.jwt.claims', coalesce(previous_claims, ''), true);
end;
$attendance$;`;
}

const activitats: GroundModule = {
  name: NAME,
  order: 30,

  publish() {
    return [
      `-- ${NAME}: categories, activities, sign-ups and attendance`,
      quietPushSql(),
      categoriesSql(),
      eventsSql(),
      signupsSql(companionSignups()),
      ...TESTERS.map((tester) => signupsSql(testerSignups(tester))),
      attendanceSql(),
    ]
      .filter((statement) => statement !== '')
      .join('\n\n');
  },

  remove() {
    const events = eventIds();
    const categories = CATEGORIES.map((category) => categoryId(category.key)).join(', ');
    // Sign-ups go first, while their activity still exists for the trigger that
    // gives the place back. Deleting an activity removes its sessions, the
    // attendance at them and the records of who opened it.
    return `-- ${NAME}: remove
delete from public.event_signups where event_id in (${events});
delete from public.events where id in (${events});
delete from public.event_categories where id in (${categories});
delete from public.push_publications where content_type = 'event' and content_id in (${events});`;
  },

  renew(tester) {
    // Her answers go back to how publish() left them. The runner already
    // deletes the records of what she opened and which lists she saw.
    return `-- ${NAME}: renew ${tester.key}
delete from public.event_signups
where player_id = ${lit(tester.id)}::uuid
  and event_id in (${eventIds()});

${signupsSql(testerSignups(tester))}`.trimEnd();
  },
};

export default activitats;

/** Exposed for checks: the id of an activity of this module by its key. */
export const activityId = (key: string): string => gid(`${NAME}:event:${key}`);
