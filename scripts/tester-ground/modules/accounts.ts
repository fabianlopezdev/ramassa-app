/**
 * Tester ground (RAPP-885): the eleven accounts every other module hangs from.
 *
 * The four testers and the six companions are players with a finished
 * profile, so a tester who signs in lands on Inici: the profile exists and is
 * active (onboarding gate, shared/auth fetchProfileSummary), her terms are
 * accepted and signed for every terms version of the organization, the draft
 * included (terms gate, my_terms_acceptance_needed), and the forms chained
 * after Onboarding are done (my_onboarding_chain). With no current season
 * there is no authorization to sign (my_authorization_status), and the
 * organization has no form of its own that a player must answer
 * (my_custom_forms).
 *
 * All eleven are test accounts (`is_test_account`):
 *   - a tester signs in on staging with the fixed code, which only a test
 *     account can use (public.test_sign_in_account);
 *   - a test player sees only forum posts, gallery items and stories by test
 *     accounts or the team (private.sees_only_test_players), so the companions
 *     must be test accounts for the testers to see them;
 *   - the team member is the publisher the test audience rule looks at.
 *
 * Everyone joined 30 days before the run: `profiles.created_at` is what
 * my_tab_news and the Inici counts read as the day she joined.
 */

import {
  COMPANIONS,
  img,
  lit,
  ORG,
  sqlGid,
  TEAM,
  TESTERS,
  type Account,
  type GroundModule,
  type ImageName,
} from '../lib/ground';

const JOINED = "(now() - interval '30 days')";

interface Person {
  readonly account: Account;
  readonly role: 'player' | 'staff';
  readonly avatar: ImageName | null;
  /** Answers by system field key, as the onboarding stores them (choices by option key). */
  readonly answers: Readonly<Record<string, string>>;
}

function player(
  account: Account,
  avatar: ImageName | null,
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

const [amal, leila, olena, mariama] = TESTERS as [Account, Account, Account, Account];
const [samira, yasmin, oksana, fatou, carolina, hawa] = COMPANIONS as [
  Account,
  Account,
  Account,
  Account,
  Account,
  Account,
];

/** Testers have no photo, so the app shows their initials. */
const PEOPLE: readonly Person[] = [
  player(amal, null, '1994-03-12', 'Tànger', 'Marroc', 'Vic', 'M', '38'),
  player(leila, null, '1990-07-25', 'Alep', 'Síria', 'Manlleu', 'S', '37'),
  player(olena, null, '1987-11-02', 'Khàrkiv', 'Ucraïna', 'Torelló', 'L', '39'),
  player(mariama, null, '1998-05-18', 'Dakar', 'Senegal', 'Vic', 'M', '40'),
  player(samira, 'avatar-01', '1992-01-30', 'Homs', 'Síria', 'Vic', 'M', '38'),
  player(yasmin, 'avatar-02', '1996-09-14', 'Herat', 'Afganistan', 'Manlleu', 'S', '36'),
  player(oksana, 'avatar-03', '1985-04-08', 'Odessa', 'Ucraïna', 'Vic', 'L', '39'),
  player(fatou, 'avatar-04', '1999-12-21', 'Thiès', 'Senegal', 'Roda de Ter', 'M', '41'),
  player(carolina, 'avatar-05', '1991-06-03', 'Medellín', 'Colòmbia', 'Vic', 'S', '37'),
  player(hawa, 'avatar-06', '1997-02-16', 'Banjul', 'Gàmbia', 'Torelló', 'M', '39'),
  { account: TEAM, role: 'staff', avatar: 'avatar-07', answers: {} },
];

const PLAYERS = PEOPLE.filter((person) => person.role === 'player');

function idArray(people: readonly { readonly account: Account }[]): string {
  return `array[${people.map((person) => lit(person.account.id)).join(', ')}]::uuid[]`;
}

const ALL_IDS = idArray(PEOPLE);

function authUsers(): string {
  const rows = PEOPLE.map(
    ({ account }) => `  (${lit(account.id)}::uuid, ${lit(account.email)})`,
  ).join(',\n');
  return `-- Accounts: sign-in identities. No password: they sign in with an emailed or fixed code.
insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, reauthentication_token
)
select '00000000-0000-0000-0000-000000000000'::uuid, person.id, 'authenticated', 'authenticated',
       person.email, ${JOINED}, '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
       ${JOINED}, ${JOINED}, '', '', '', '', '', ''
  from (values
${rows}
  ) as person(id, email)
on conflict (id) do nothing;

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, created_at, updated_at
)
select ${sqlGid("'accounts:identity:' || u.id::text")}, u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', ${JOINED}, ${JOINED}
  from auth.users u
 where u.id = any (${ALL_IDS})
on conflict (provider_id, provider) do nothing;
`;
}

function profiles(): string {
  const rows = PEOPLE.map(
    ({ account, role, avatar }) =>
      `  (${lit(account.id)}::uuid, ${lit(role)}, ${lit(account.firstName)}, ${lit(account.lastName)}, ${
        avatar === null ? 'null' : img(avatar)
      })`,
  ).join(',\n');
  return `-- Accounts: finished profiles in the organization, joined 30 days ago.
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

/**
 * One signed acceptance per player for every terms version of the
 * organization. A test player is shown the draft when there is one
 * (private.app_terms_version_for), so the draft is accepted too. Run again by
 * `renew`, so a draft made after the seed never stops a tester at the terms.
 */
function termsAcceptances(people: readonly Person[]): string {
  const ids = idArray(people);
  return `-- Accounts: every terms version accepted and signed.
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
 * Her answers, written the way her own app writes them
 * (private.write_custom_answer with source `player`). Only Normal and
 * Personal fields: nothing here needs the encryption key. A seasonal field is
 * skipped while there is no current season, as for a real player.
 */
function answers(): string {
  const rows = PLAYERS.flatMap(({ account, answers: given }) =>
    Object.entries(given).map(
      ([key, value]) => `      (${lit(account.id)}::uuid, ${lit(key)}, ${lit(value)})`,
    ),
  ).join(',\n');
  return `-- Accounts: plausible profile answers.
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

const accounts: GroundModule = {
  name: 'accounts',
  order: 10,

  publish() {
    return [authUsers(), profiles(), termsAcceptances(PLAYERS), answers()].join('\n');
  },

  remove() {
    return `-- Accounts: the audit trail of these accounts (a fixed-code sign-in writes one), then the
-- accounts. Deleting the sign-in identity deletes the profile and every row that cascades
-- from it; a row of another module that still points at an account stops the removal.
delete from public.audit_log
 where actor_id = any (${ALL_IDS}) or target_id = any (${ALL_IDS});

delete from auth.users where id = any (${ALL_IDS});
`;
  },

  renew(tester) {
    const person = PLAYERS.find(({ account }) => account.id === tester.id);
    return person === undefined ? '' : termsAcceptances([person]);
  },
};

export default accounts;
