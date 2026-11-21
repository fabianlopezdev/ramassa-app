/**
 * Tester ground, Activitats (RAPP-885): the activity categories, the
 * activities the testers share and the companions' sign-ups that make the
 * counts look alive.
 *
 * A tester starts from Onboarding, so she has no sign-up and no attendance of
 * her own. What she finds (the rules live in `activities-attention.ts` and
 * `home-attention.ts` in the app):
 *   - Inici shows the earliest upcoming activity, the cooking workshop, new,
 *     and it adds 1 to the Inici number.
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
  uid,
  type Account,
  type GroundModule,
} from '../lib/ground';
import {
  ACTIVITIES,
  CATEGORIES,
  type ActivityData,
  type Published,
  type SignupState,
} from './activitats/data';

const NAME = 'activitats';

const categoryId = (key: string) => uid(`${NAME}:category:${key}`);
const eventId = (key: string) => uid(`${NAME}:event:${key}`);
const eventIds = () => ACTIVITIES.map((activity) => eventId(activity.key)).join(', ');

function publishedAt(published: Published): string {
  if (published === 'old') return daysFromNow(-45, '10:00');
  // Ten days back: before the testers were invited, so it counts as seen.
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

const activitats: GroundModule = {
  name: NAME,
  order: 30,

  publish() {
    return [
      `-- ${NAME}: categories, activities and the companions' sign-ups`,
      quietPushSql(),
      categoriesSql(),
      eventsSql(),
      signupsSql(companionSignups()),
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
    // Back to how publish() left her: no sign-up of her own. The runner already
    // deletes the records of what she opened and which lists she saw.
    return `-- ${NAME}: renew ${tester.key}
delete from public.event_signups
where player_id = ${lit(tester.id)}::uuid
  and event_id in (${eventIds()});`;
  },
};

export default activitats;

/** Exposed for checks: the id of an activity of this module by its key. */
export const activityId = (key: string): string => gid(`${NAME}:event:${key}`);
