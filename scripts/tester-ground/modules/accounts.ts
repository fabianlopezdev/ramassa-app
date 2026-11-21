/**
 * Tester ground (RAPP-885): the eleven accounts every other module hangs from.
 *
 * The testers start from Onboarding. Each is a test player invited by the
 * equip tècnic, exactly as the invitation form makes one with "Test player"
 * ticked (public.create_participant_invite): a sign-in identity, an open
 * invitation, and a profile with role `invited`, her names and nothing else.
 * Her names are kept as her first answers by the profile trigger, as for any
 * invited player, so the first Onboarding screen shows them filled in. With no
 * `terms_accepted_at` the app sends her to Onboarding (shared/auth
 * `needsOnboarding`); finishing it (complete_onboarding_signed) makes her a
 * player, spends the invitation and records her terms, her answers and her
 * consents.
 *
 * The six companions and the team member are finished accounts, joined 30
 * days before the run: the companions write in the forum, the gallery and the
 * stories, and the team member publishes and answers.
 *
 * All eleven are test accounts (`is_test_account`):
 *   - a tester signs in on staging with the fixed code, which only a test
 *     account can use (public.test_sign_in_account), and a profile must exist
 *     for that, so a tester cannot start with no profile at all;
 *   - a test player sees only forum posts, gallery items and stories by test
 *     accounts or the team (private.sees_only_test_players), so the companions
 *     are test accounts too;
 *   - the team member is the publisher the test audience rule looks at.
 *
 * What counts as new for a tester is what was published after
 * `profiles.created_at` (my_tab_news, my_home_seen). Finishing Onboarding
 * leaves `created_at` as it is, so a tester was invited TESTER_INVITED before
 * the run: after everything dated days back, before everything dated minutes
 * back. However long she takes to start, the new things stay new.
 *
 * `restartTester()` puts one tester back to the start of Onboarding, so the
 * club can try Onboarding again.
 */

import {
  COMPANIONS,
  img,
  lit,
  ORG,
  sqlGid,
  TEAM,
  TESTERS,
  uid,
  type Account,
  type GroundModule,
  type ImageName,
} from '../lib/ground';

/** When the companions and the team member joined. */
const JOINED = "(now() - interval '30 days')";
/**
 * When the testers were invited. The newest dated-back content is a day old
 * and the oldest new content an hour old, so two hours sits between them.
 */
const TESTER_INVITED = "(now() - interval '2 hours')";
/**
 * The invitation stays open for a year: the nightly job
 * `ramassa-purge-unjoined-participants` deletes an invited profile only when
 * her address has no open invitation (`expires_at` later than now).
 */
const INVITATION_OPEN_UNTIL = "(now() + interval '1 year')";

interface Person {
  readonly account: Account;
  readonly role: 'player' | 'staff';
  readonly avatar: ImageName | null;
  /** Answers by system field key, as the onboarding stores them (choices by option key). */
  readonly answers: Readonly<Record<string, string>>;
}

function companion(
  account: Account,
  avatar: ImageName,
  born: string,
  birthplace: string,
  nationality: string,
  city: string,
  clothing: string,
  shoe: string,
): Person {
  return {
    account,
    role: 'player',
    avatar,
    answers: {
      date_of_birth: born,
      place_of_birth: birthplace,
      nationality,
      city,
      clothing_size: clothing,
      shoe_size: shoe,
      has_dependents: 'no',
    },
  };
}

const [samira, yasmin, oksana, fatou, carolina, hawa] = COMPANIONS as [
  Account,
  Account,
  Account,
  Account,
  Account,
  Account,
];

const COMPANION_PEOPLE: readonly Person[] = [
  companion(samira, 'avatar-01', '1992-01-30', 'Homs', 'Síria', 'Vic', 'M', '38'),
  companion(yasmin, 'avatar-02', '1996-09-14', 'Herat', 'Afganistan', 'Manlleu', 'S', '36'),
  companion(oksana, 'avatar-03', '1985-04-08', 'Odessa', 'Ucraïna', 'Vic', 'L', '39'),
  companion(fatou, 'avatar-04', '1999-12-21', 'Thiès', 'Senegal', 'Roda de Ter', 'M', '41'),
  companion(carolina, 'avatar-05', '1991-06-03', 'Medellín', 'Colòmbia', 'Vic', 'S', '37'),
  companion(hawa, 'avatar-06', '1997-02-16', 'Banjul', 'Gàmbia', 'Torelló', 'M', '39'),
];
const FINISHED: readonly Person[] = [
  ...COMPANION_PEOPLE,
  { account: TEAM, role: 'staff', avatar: 'avatar-07', answers: {} },
];

function idArray(accounts: readonly Account[]): string {
  return `array[${accounts.map((account) => lit(account.id)).join(', ')}]::uuid[]`;
}

const EVERYONE = [...TESTERS, ...FINISHED.map((person) => person.account)];
const ALL_IDS = idArray(EVERYONE);
const ALL_ID_TEXTS = `array[${EVERYONE.map((account) => lit(account.id)).join(', ')}]::text[]`;
const ALL_EMAILS = `array[${EVERYONE.map((account) => lit(account.email)).join(', ')}]::text[]`;
const TESTER_IDS = idArray(TESTERS);

const inviteId = (tester: Account) => uid(`accounts:invite:${tester.key}`);

function authUsers(): string {
  const rows = EVERYONE.map(
    (account) =>
      `  (${lit(account.id)}::uuid, ${lit(account.email)}, ${
        TESTERS.includes(account) ? TESTER_INVITED : JOINED
      })`,
  ).join(',\n');
  return `-- Accounts: sign-in identities. No password: they sign in with an emailed or fixed code.
insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, reauthentication_token
)
select '00000000-0000-0000-0000-000000000000'::uuid, person.id, 'authenticated', 'authenticated',
       person.email, person.at, '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
       person.at, person.at, '', '', '', '', '', ''
  from (values
${rows}
  ) as person(id, email, at)
on conflict (id) do nothing;

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, created_at, updated_at
)
select ${sqlGid("'accounts:identity:' || u.id::text")}, u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', u.created_at, u.created_at
  from auth.users u
 where u.id = any (${ALL_IDS})
on conflict (provider_id, provider) do nothing;
`;
}

function finishedProfiles(): string {
  const rows = FINISHED.map(
    ({ account, role, avatar }) =>
      `  (${lit(account.id)}::uuid, ${lit(role)}, ${lit(account.firstName)}, ${lit(account.lastName)}, ${
        avatar === null ? 'null' : img(avatar)
      })`,
  ).join(',\n');
  return `-- Accounts: the companions and the team member, finished profiles joined 30 days ago.
insert into public.profiles (
  id, org_id, role, first_name, last_name, preferred_language, avatar_url, is_active,
  is_test_account, terms_accepted_at, media_consent_at, onboarding_chain_done_at,
  created_at, updated_at
)
select person.id, ${ORG}, person.role, person.first_name, person.last_name, 'ca', person.avatar,
       true, true,
       case when person.role = 'player' then ${JOINED} end,
       case when person.role = 'player' then ${JOINED} end,
       case when person.role = 'player' then ${JOINED} end,
       ${JOINED}, ${JOINED}
  from (values
${rows}
  ) as person(id, role, first_name, last_name, avatar)
on conflict (id) do nothing;
`;
}

/** The invitation the equip tècnic sent her, open, as the invitation form makes it. */
function invitationSql(tester: Account): string {
  return `insert into public.invites (id, org_id, email, invited_by, expires_at, created_at)
values (${inviteId(tester)}, ${ORG}, ${lit(tester.email)}, ${uid(TEAM.key)}, ${INVITATION_OPEN_UNTIL}, ${TESTER_INVITED})
on conflict (id) do update set accepted_at = null, accepted_by = null, expires_at = excluded.expires_at;`;
}

function testerProfiles(): string {
  const rows = TESTERS.map(
    (tester) => `  (${lit(tester.id)}::uuid, ${lit(tester.firstName)}, ${lit(tester.lastName)})`,
  ).join(',\n');
  return `-- Accounts: the testers, invited test players who have not started Onboarding.
${TESTERS.map(invitationSql).join('\n')}

insert into public.profiles (
  id, org_id, role, first_name, last_name, preferred_language, is_active, is_test_account,
  created_at, updated_at
)
select person.id, ${ORG}, 'invited', person.first_name, person.last_name,
       coalesce((select o.locked_default_language from public.organizations o where o.id = ${ORG}), 'ca'),
       true, true, ${TESTER_INVITED}, ${TESTER_INVITED}
  from (values
${rows}
  ) as person(id, first_name, last_name)
on conflict (id) do nothing;
`;
}

/** One signed acceptance per companion for every terms version of the organization. */
function companionTerms(): string {
  const ids = idArray(COMPANION_PEOPLE.map((person) => person.account));
  return `-- Accounts: the companions accepted and signed every terms version.
insert into public.terms_acceptances (
  id, profile_id, terms_version, locale_shown, accepted_at, version_id
)
select ${sqlGid("'accounts:terms:' || p.id::text || ':' || v.id::text")}, p.id,
       coalesce(v.version_number::text, 'draft'), 'ca',
       greatest(${JOINED}, v.published_at), v.id
  from public.profiles p
  join public.app_terms_versions v on v.org_id = p.org_id
 where p.id = any (${ids})
on conflict (id) do nothing;

insert into public.app_terms_signatures (
  acceptance_id, profile_id, org_id, signature, unable_to_draw, media_consent, device
)
select t.id, t.profile_id, p.org_id, null, true, true, 'tester-ground'
  from public.terms_acceptances t
  join public.profiles p on p.id = t.profile_id
 where t.profile_id = any (${ids})
   and t.id = ${sqlGid("'accounts:terms:' || t.profile_id::text || ':' || t.version_id::text")}
on conflict (acceptance_id) do nothing;
`;
}

/**
 * The companions' answers, written the way her own app writes them
 * (private.write_custom_answer with source `player`). Only Normal and
 * Personal fields. A seasonal field is skipped while there is no current
 * season, as for a real player.
 */
function companionAnswers(): string {
  const rows = COMPANION_PEOPLE.flatMap(({ account, answers: given }) =>
    Object.entries(given).map(
      ([key, value]) => `      (${lit(account.id)}::uuid, ${lit(key)}, ${lit(value)})`,
    ),
  ).join(',\n');
  return `-- Accounts: plausible profile answers for the companions.
do $tg_accounts$
declare
  answer record;
  field public.profile_fields;
  stored jsonb;
begin
  for answer in
    select * from (values
${rows}
    ) as given(profile_id, system_key, value)
  loop
    select f.* into field
      from public.profile_fields f
      join public.profiles p on p.id = answer.profile_id and p.org_id = f.org_id
     where f.system_key = answer.system_key and not f.is_archived;
    continue when field.id is null;
    stored := to_jsonb(answer.value);
    if field.question_type in ('single_choice', 'search_choice') then
      select to_jsonb(o.id::text) into stored
        from public.custom_question_options o
       where o.question_id = field.id and o.key = answer.value and not o.is_archived;
    end if;
    continue when stored is null;
    perform private.write_custom_answer(answer.profile_id, field, stored, 'player', null);
  end loop;
end
$tg_accounts$;
`;
}

/** Staff bell entries that her own actions raised, for every staff member. */
function herStaffNotifications(ids: string): string {
  return `delete from public.staff_notifications
 where (event = 'message' and source_id in (select id from public.conversations where user_id = any (${ids})))
    or (event = 'mentoring_request' and source_id in (select id from public.mentoring_requests where player_id = any (${ids})))
    or (event = 'feedback' and source_id in (select id from public.feedback_submissions where author_id = any (${ids})))
    or (event in ('forum_report', 'gallery_report') and source_id in (select id from public.forum_flags where flagger_id = any (${ids})))
    or (event = 'deletion_request' and source_id in (select id from public.deletion_requests where profile_id = any (${ids})));`;
}

/**
 * Puts one tester back to where `seed` leaves her: an invited test player who
 * has not started Onboarding, with nothing of her own. The same steps as the
 * design sandbox's "start again" switch (private.scenario_reset and the terms
 * switch), plus everything she did in the app. The runner then clears what she
 * opened and runs every module's `renew` for her.
 */
export function restartTester(tester: Account): string {
  const her = `${lit(tester.id)}::uuid`;
  const ids = `array[${her}]`;
  return `-- Accounts: ${tester.key} back to the start of Onboarding.
${herStaffNotifications(ids)}
delete from public.push_publications
 where content_type = 'message'
   and content_id in (select m.id from public.messages m
                        join public.conversations c on c.id = m.conversation_id
                       where c.user_id = ${her});
delete from public.forum_replies where author_id = ${her};
delete from public.forum_posts where author_id = ${her};
delete from public.forum_flags where flagger_id = ${her};
delete from public.media_items where uploaded_by = ${her};
delete from public.knowledge_articles where author_id = ${her} and content_type = 'participant_story';
delete from public.event_signups where player_id = ${her};
delete from public.service_submission_notifications
 where kind = 'service_interest' and created_by = ${her};
delete from public.service_interests where user_id = ${her};
delete from public.mentoring_requests where player_id = ${her};
delete from public.feedback_submissions where author_id = ${her};
delete from public.conversations where user_id = ${her};
delete from public.survey_responses where player_id = ${her};
delete from public.audit_log where actor_id = ${her} and action = 'survey_response_completed';
delete from public.custom_form_responses where profile_id = ${her};
delete from public.deletion_requests where profile_id = ${her};
delete from public.terms_acceptances where profile_id = ${her};
delete from public.authorization_signatures where profile_id = ${her};
delete from public.form_signatures where profile_id = ${her};
-- Her answers go; her names stay as her first answers, as on the day she was invited.
delete from public.custom_answers a
 where a.profile_id = ${her}
   and a.question_id not in (select f.id from public.profile_fields f
                              where f.system_key in ('first_name', 'last_name'));
update public.profiles
   set role = 'invited', first_name = ${lit(tester.firstName)}, last_name = ${lit(tester.lastName)},
       preferred_language = 'ca', avatar_url = null, terms_accepted_at = null,
       media_consent_at = null, onboarding_chain_done_at = null, season_number = null,
       prior_seasons = 0, push_notifications_enabled = true, updated_at = now()
 where id = ${her};
-- Her consent history goes after the update above, which records the photo choice it clears.
select set_config('ramassa.consent_event_erasure', 'on', true);
delete from public.consent_events where profile_id = ${her};
select set_config('ramassa.consent_event_erasure', '', true);
${invitationSql(tester)}
-- A new scenario stamp: the app drops an Onboarding draft kept on her phone (my_test_scenario_stamp).
insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
values (${ORG}, ${uid(TEAM.key)}, 'test_player.scenario', 'profile', ${her},
        '{"kind": "reset", "by": "tester-ground"}'::jsonb);
`;
}

const accounts: GroundModule = {
  name: 'accounts',
  order: 10,

  publish() {
    return [
      authUsers(),
      finishedProfiles(),
      testerProfiles(),
      companionTerms(),
      companionAnswers(),
    ].join('\n');
  },

  remove() {
    return `-- Accounts: what the testers' own actions left for the staff, the invitations, the audit
-- trail of these accounts (a fixed-code sign-in writes one), then the accounts. Deleting the
-- sign-in identity deletes the profile and every row that cascades from it; a row of another
-- module that still points at an account stops the removal.
${herStaffNotifications(TESTER_IDS)}
delete from public.invites
 where email in (${TESTERS.map((tester) => lit(tester.email)).join(', ')})
    or invited_by = any (${ALL_IDS}) or accepted_by = any (${ALL_IDS});

delete from public.audit_log
 where actor_id = any (${ALL_IDS}) or target_id = any (${ALL_IDS});

-- The sign-in service keeps its own log of each sign-in of these accounts.
delete from auth.audit_log_entries
 where payload ->> 'actor_id' = any (${ALL_ID_TEXTS})
    or payload ->> 'actor_username' = any (${ALL_EMAILS});

delete from auth.users where id = any (${ALL_IDS});
`;
  },

  /**
   * Keeps her where she is. A tester who finished Onboarding and is now shown
   * terms she has not signed (a draft made after she joined) gets them signed,
   * so renew never stops her at the terms.
   */
  renew(tester) {
    const her = `${lit(tester.id)}::uuid`;
    return `-- Accounts: ${tester.key} keeps her place; a joined tester has the terms she is shown signed.
insert into public.terms_acceptances (id, profile_id, terms_version, locale_shown, version_id)
select ${sqlGid("'accounts:terms:' || p.id::text || ':' || shown.id::text")}, p.id,
       coalesce(shown.version_number::text, 'draft'), p.preferred_language, shown.id
  from public.profiles p
  cross join lateral private.app_terms_version_for(p.org_id, p.id) shown
 where p.id = ${her} and p.role = 'player' and shown.id is not null
   and not private.signed_terms_version(p.id, shown.id)
on conflict (id) do nothing;

insert into public.app_terms_signatures (
  acceptance_id, profile_id, org_id, signature, unable_to_draw, media_consent, device
)
select t.id, t.profile_id, p.org_id, null, true, p.media_consent_at is not null, 'tester-ground'
  from public.terms_acceptances t
  join public.profiles p on p.id = t.profile_id
 where t.profile_id = ${her}
   and t.id = ${sqlGid("'accounts:terms:' || t.profile_id::text || ':' || t.version_id::text")}
on conflict (acceptance_id) do nothing;
`;
  },
};

export default accounts;
