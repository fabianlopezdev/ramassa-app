-- Scenario switches on a test player (RAPP-619).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Every switch works on a test player, for the design role and for staff
--      who edit participants, and her app sees the result: the answers the
--      wizard skips, whether she joined, whether this season is signed,
--      whether she is returning.
--   2. Nothing touches a real woman: every switch and the read are refused on
--      a real player and on a real invited woman, for every caller, with one
--      refusal; a player and a coach cannot use the switches on a test player.
--   3. Every switch is audited, and her app can tell her situation changed.
--
-- Seed: staff ...002 and ...003, the real player ...011, the real invited
-- woman ...098, the design account ...097, the test player ...096 (invited,
-- no answers), the current season 2026/27 with a published authorization.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(35);

create temp table real_rows on commit drop as
  select
    (select count(*) from public.authorization_signatures where profile_id = '5eed0000-0000-4000-8000-000000000011') as signatures,
    (select count(*) from public.profile_answers where profile_id = '5eed0000-0000-4000-8000-000000000011') as answers,
    (select role || ':' || coalesce(terms_accepted_at::text, '') from public.profiles where id = '5eed0000-0000-4000-8000-000000000011') as player_state;
grant select on real_rows to authenticated;

create temp table her_status (label text, required boolean, is_returning boolean) on commit drop;
grant all on her_status to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

-- 1. Answers -------------------------------------------------------------------------------------------

select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096', '{
       "kind": "answers",
       "fill": {
         "first_name": "Joana", "last_name": "Prova", "date_of_birth": "1995-05-15",
         "place_of_birth": "Marroc", "nationality": "Marroc", "preferred_language": "ca",
         "reference_entity": "Entitat de prova", "has_dependents": false, "num_dependents": 0,
         "clothing_size": "M", "shoe_size": "38", "phone": "+34600111222"
       }
     }'::jsonb) $$,
  'the design role fills her answers'
);
select is(
  (select array_agg(a.question || ':' || a.source order by a.question) from public.profile_answers a
    where a.profile_id = '5eed0000-0000-4000-8000-000000000096'),
  array['clothing_size:staff', 'date_of_birth:staff', 'dependents:staff', 'first_name:staff',
        'last_name:staff', 'nationality:staff', 'phone:staff', 'place_of_birth:staff',
        'preferred_language:staff', 'reference_entity:staff', 'shoe_size:staff'],
  'filled answers are staff answers, so her wizard skips them'
);
select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096',
       '{"kind": "answers", "clear": ["phone", "first_name"]}'::jsonb) $$,
  'and clears some'
);
select is(
  (select count(*)::integer from public.profile_answers a
    where a.profile_id = '5eed0000-0000-4000-8000-000000000096' and a.question in ('phone', 'first_name')),
  0,
  'a cleared question is unanswered again'
);
select is(
  (select first_name from public.profiles where id = '5eed0000-0000-4000-8000-000000000096'),
  'Joana',
  'her name stays: it is only asked again'
);
select throws_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096',
       '{"kind": "answers", "fill": {"role": "admin"}}'::jsonb) $$,
  '22023', 'a sample answer has an unknown field',
  'a field that is not a wizard answer is refused'
);

-- 2. App terms ---------------------------------------------------------------------------------------

select throws_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096',
       '{"kind": "terms", "accepted": true, "terms_version": "2026-07-01"}'::jsonb) $$,
  '23514', 'fill her required answers before she accepts the terms',
  'she joins only with every required answer, as in the app'
);
select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096', '{
       "kind": "answers", "fill": {"first_name": "Joana"}}'::jsonb) $$,
  'her name answered again'
);
select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096',
       '{"kind": "terms", "accepted": true, "terms_version": "2026-07-01"}'::jsonb) $$,
  'terms accepted'
);
reset role;
select is(
  (select p.role || ':' || (p.terms_accepted_at is not null)::text || ':' || t.is_test_fixture::text
     from public.profiles p join public.terms_acceptances t on t.profile_id = p.id
    where p.id = '5eed0000-0000-4000-8000-000000000096'),
  'player:true:true',
  'she has joined, with a marked acceptance'
);
select is(
  (select count(*)::integer from public.invites
    where email = 'jugadora.prova@example.test' and accepted_at is not null),
  1,
  'joining spent her invitation, as in the app'
);
set local role authenticated;
select throws_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096',
       '{"kind": "answers", "clear": ["date_of_birth"]}'::jsonb) $$,
  '55000', 'she has joined: set the app terms to not accepted before clearing a required answer',
  'a joined woman keeps a complete profile'
);

-- 3. This season's authorization, and returning ------------------------------------------------------------

-- What her app reads, as her.
select set_config('request.jwt.claims',
  '{"sub": "5eed0000-0000-4000-8000-000000000096", "role": "authenticated", "aal": "aal1"}', true);
insert into her_status select 'joined', required, is_returning from public.my_authorization_status();

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096',
       '{"kind": "season_signature", "signed": true}'::jsonb) $$,
  'this season signed'
);
select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096',
       '{"kind": "returning", "returning": true}'::jsonb) $$,
  'returning from an earlier season'
);
select set_config('request.jwt.claims',
  '{"sub": "5eed0000-0000-4000-8000-000000000096", "role": "authenticated", "aal": "aal1"}', true);
insert into her_status select 'signed', required, is_returning from public.my_authorization_status();
select isnt(public.my_test_scenario_stamp(), null, 'her app can tell her situation changed');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096',
       '{"kind": "season_signature", "signed": false}'::jsonb) $$,
  'this season not signed'
);
select set_config('request.jwt.claims',
  '{"sub": "5eed0000-0000-4000-8000-000000000096", "role": "authenticated", "aal": "aal1"}', true);
insert into her_status select 'unsigned', required, is_returning from public.my_authorization_status();

select is(
  (select array_agg(label || ':' || required || ':' || is_returning order by label) from her_status),
  array['joined:true:false', 'signed:false:true', 'unsigned:true:true'],
  'her app asks for the signature, or not, and shows re-registration when she returns'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  public.test_player_scenario('5eed0000-0000-4000-8000-000000000096') - 'answered' - 'preferred_language'
    - 'custom_answered' - 'org_id',
  '{"terms_accepted": true, "current_season": "2026/27", "signed_this_season": false, "returning": true}'::jsonb,
  'her page reads the situation'
);
reset role;
select is(
  (select bool_and(s.is_test_fixture) from public.authorization_signatures s
    where s.profile_id = '5eed0000-0000-4000-8000-000000000096'),
  true,
  'every signature the switches made is marked'
);
set local role authenticated;

-- 4. Reset, and not joined again -------------------------------------------------------------------------

-- Staff who edit participants may use the switches too.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096', '{"kind": "reset"}'::jsonb) $$,
  'staff reset her to a brand-new player'
);
reset role;
select is(
  (select p.role || ':' || (p.terms_accepted_at is null)::text || ':' || coalesce(p.clothing_size, '-')
     from public.profiles p where p.id = '5eed0000-0000-4000-8000-000000000096'),
  'invited:true:-',
  'not joined, nothing answered'
);
select is(
  (select array_agg(question order by question) from public.profile_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000096'),
  array['first_name', 'last_name'],
  'only the name the invitation gave her stays answered'
);
select is(
  (select count(*)::integer from public.authorization_signatures
    where profile_id = '5eed0000-0000-4000-8000-000000000096')
  + (select count(*)::integer from public.terms_acceptances
    where profile_id = '5eed0000-0000-4000-8000-000000000096'),
  0,
  'no signature and no acceptance remain'
);
select is(
  (select count(*)::integer from public.invites
    where email = 'jugadora.prova@example.test' and accepted_at is null and expires_at > now()),
  1,
  'her invitation is open again, so the purge of women who never joined keeps her'
);
select is(
  (select count(*)::integer from public.audit_log
    where action = 'test_player.scenario' and target_id = '5eed0000-0000-4000-8000-000000000096'),
  8,
  'every switch is audited'
);
set local role authenticated;

-- 5. Nothing touches a real woman ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000011',
       '{"kind": "answers", "clear": ["phone"]}'::jsonb) $$,
  '42501', 'scenario switches are for test players only',
  'staff cannot clear a real player''s answers'
);
select throws_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000011',
       '{"kind": "terms", "accepted": false}'::jsonb) $$,
  '42501', 'scenario switches are for test players only',
  'nor send her back to the onboarding'
);
select throws_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000011',
       '{"kind": "season_signature", "signed": false}'::jsonb) $$,
  '42501', 'scenario switches are for test players only',
  'nor remove her signature'
);
select throws_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000098', '{"kind": "reset"}'::jsonb) $$,
  '42501', 'scenario switches are for test players only',
  'nor reset a real invited woman'
);
select throws_ok(
  $$ select public.test_player_scenario('5eed0000-0000-4000-8000-000000000011') $$,
  '42501', 'scenario switches are for test players only',
  'nor read a real player''s situation through the switches'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000011',
       '{"kind": "returning", "returning": false}'::jsonb) $$,
  '42501', 'scenario switches are for test players only',
  'the design role cannot touch a real player'
);

-- A team member who does not edit participants: staff ...003 without
-- participants.view_personal, for this test only.
reset role;
delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000003' and permission_code = 'participants.view_personal';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096', '{"kind": "reset"}'::jsonb) $$,
  '42501', 'scenario switches are for test players only',
  'a team member who does not edit participants is refused on a test player too'
);

select set_config('request.jwt.claims',
  '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}', true);
select throws_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096', '{"kind": "reset"}'::jsonb) $$,
  '42501', 'scenario switches are for test players only',
  'a player is refused'
);
select is(public.my_test_scenario_stamp(), null, 'a real player''s app reads no scenario stamp');

reset role;
select is(
  (select signatures || ':' || answers || ':' || player_state from real_rows),
  (select
     (select count(*) from public.authorization_signatures where profile_id = '5eed0000-0000-4000-8000-000000000011')
     || ':' || (select count(*) from public.profile_answers where profile_id = '5eed0000-0000-4000-8000-000000000011')
     || ':' || (select role || ':' || coalesce(terms_accepted_at::text, '') from public.profiles
                 where id = '5eed0000-0000-4000-8000-000000000011')),
  'the real player''s rows are exactly as before'
);

select * from finish();
rollback;
