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
    (select count(*) from public.custom_answers where profile_id = '5eed0000-0000-4000-8000-000000000011') as answers,
    (select role || ':' || coalesce(terms_accepted_at::text, '') from public.profiles where id = '5eed0000-0000-4000-8000-000000000011') as player_state;
grant select on real_rows to authenticated;

create temp table her_status (label text, required boolean, is_returning boolean) on commit drop;
grant all on her_status to authenticated;

-- An app answer given by option key, as the app's screens send it by option id.
create function pg_temp.by_option_key(f public.profile_fields, v jsonb) returns jsonb language sql stable security definer as $$
  select case
    when f.question_type in ('single_choice', 'search_choice') and jsonb_typeof(v) = 'string' then
      coalesce((select to_jsonb(o.id::text) from public.custom_question_options o
                 where o.question_id = f.id and o.key = v #>> '{}'), v)
    when f.question_type = 'multiple_choice' and jsonb_typeof(v) = 'array' then
      coalesce((select jsonb_agg(o.id::text order by o.sort_order) from public.custom_question_options o
                 where o.question_id = f.id and o.key in (select jsonb_array_elements_text(v))
                having count(*) = jsonb_array_length(v)), v)
    else v
  end;
$$;
-- Her answers travel by field (RAPP-661). Helpers: the app's keys of a payload
-- keyed by their fields (a choice by its option), a field's id, and her stored
-- answer to an app field (decrypted).
create function pg_temp.answers(p jsonb) returns jsonb language sql security definer as $$
  select coalesce(jsonb_object_agg(f.id::text, pg_temp.by_option_key(f, e.value)), '{}'::jsonb)
    from jsonb_each(p) e
    join public.profile_fields f on f.org_id = '5eed0000-0000-4000-8000-000000000000' and f.system_key = e.key;
$$;
create function pg_temp.field(p_key text) returns text language sql security definer as $$
  select id::text from public.profile_fields
   where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = p_key;
$$;
create function pg_temp.stored(p_profile uuid, p_key text) returns jsonb language sql security definer as $$
  select private.system_field_answer(p_profile, p_key);
$$;
-- Her answers' system keys and sources, read as the database owner.
create function pg_temp.sources(p_profile uuid) returns text[] language sql security definer as $$
  select array_agg(f.system_key || ':' || a.source order by f.system_key) from public.custom_answers a
    join public.profile_fields f on f.id = a.question_id where a.profile_id = p_profile;
$$;
grant execute on all functions in schema pg_temp to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

-- 1. Answers -------------------------------------------------------------------------------------------

select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096', jsonb_build_object(
       'kind', 'answers',
       'fill', jsonb_build_object(
         'first_name', 'Joana', 'last_name', 'Prova', 'preferred_language', 'ca',
         -- Her answers by field (RAPP-661).
         'answers', pg_temp.answers('{
           "date_of_birth": "1995-05-15", "place_of_birth": "Marroc", "nationality": "Marroc",
           "reference_entity": "Entitat de prova", "has_dependents": "no",
           "clothing_size": "M", "shoe_size": "38", "phone": "+34600111222"}')))) $$,
  'the design role fills her answers'
);
select is(
  pg_temp.sources('5eed0000-0000-4000-8000-000000000096'),
  array['clothing_size:staff', 'date_of_birth:staff', 'has_dependents:staff', 'nationality:staff',
        'phone:staff', 'place_of_birth:staff', 'reference_entity:staff', 'shoe_size:staff'],
  'filled answers are staff answers, so her wizard skips them'
);
select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096',
       jsonb_build_object('kind', 'answers', 'clear', jsonb_build_array(pg_temp.field('phone'), pg_temp.field('date_of_birth')))) $$,
  'and clears some'
);
select is(
  (select count(*)::integer from unnest(pg_temp.sources('5eed0000-0000-4000-8000-000000000096')) s
    where s like 'phone:%' or s like 'date_of_birth:%'),
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
  '22023', null::text,
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
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096', jsonb_build_object(
       'kind', 'answers', 'fill', jsonb_build_object('answers', pg_temp.answers('{"date_of_birth": "1995-05-15"}')))) $$,
  'her date of birth answered again'
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
       jsonb_build_object('kind', 'answers', 'clear', jsonb_build_array(pg_temp.field('date_of_birth')))) $$,
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
  '{"terms_accepted": true, "current_season": "2026/27", "signed_this_season": false, "returning": true,
    "terms_draft": false, "authorization_draft": false}'::jsonb,
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
  (select p.role || ':' || (p.terms_accepted_at is null)::text
     from public.profiles p where p.id = '5eed0000-0000-4000-8000-000000000096'),
  'invited:true',
  'not joined'
);
select is(
  (select count(*)::integer from public.custom_answers where profile_id = '5eed0000-0000-4000-8000-000000000096'),
  0,
  'only the name the invitation gave her stays: no answer is left'
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
     || ':' || (select count(*) from public.custom_answers where profile_id = '5eed0000-0000-4000-8000-000000000011')
     || ':' || (select role || ':' || coalesce(terms_accepted_at::text, '') from public.profiles
                 where id = '5eed0000-0000-4000-8000-000000000011')),
  'the real player''s rows are exactly as before'
);

select * from finish();
rollback;
