-- Season re-registration (RAPP-306).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Staff with settings.organization create a season and make it current;
--      one season is current at a time.
--   2. Publishing the new season's authorization makes returning players
--      re-register; the gate knows she is returning; a paper record completes it.
--   3. The season answers keep their history, one row per season, and the
--      sensitive ones are readable only with participants.view_sensitive.
--   4. The season number is counted: earlier seasons plus the seasons she signed.
--   5. The wizard asks the four registration questions, all optional.
--   6. Staff see who has and has not re-registered.
--
-- The seed: 2026/27 is current, version 1 published; players have a paper
-- record except Наталія (...022); Amina (...011) signed in the app.

begin;
select plan(20);

create temp table run (label text primary key, id uuid);
grant all on run to authenticated;

-- 4. The counted season number, before anything changes ---------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select season_number from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011')),
  1::smallint, 'one signed season and no earlier ones: her first season'
);
select lives_ok(
  $$ select public.set_prior_seasons('5eed0000-0000-4000-8000-000000000011', 2) $$,
  'staff enter the seasons she played before the app'
);
select is(
  (select season_number from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011')),
  3::smallint, 'and the number counts them'
);

-- 3. Season answers snapshot with history -------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select lives_ok(
  $$ select public.update_my_season_answers('{"childcare_need": "yes", "applicant_status": "refugee", "specific_needs": "Pauses."}'::jsonb) $$,
  'she answers the season questions for 2026/27'
);
select throws_ok(
  $$ select public.update_my_season_answers('{"childcare_need": "often"}'::jsonb) $$,
  '22023', null::text, 'an answer outside its choices is refused'
);

-- 1. A new season ---------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.create_season('2027/28', '2027-09-01', true) $$,
  '42501', null::text, 'creating a season needs settings.organization'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into run (label, id) select 'season', public.create_season('2027/28', '2027-09-01', true);
select is(
  (select name from public.seasons where is_current and org_id = '5eed0000-0000-4000-8000-000000000000'),
  '2027/28', 'the new season is current'
);
select is(
  (select count(*)::integer from public.seasons where is_current and org_id = '5eed0000-0000-4000-8000-000000000000'),
  1, 'and only one season is current'
);

-- 2. Re-registration -------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select is(
  (select count(*)::integer from public.my_authorization_status()), 0,
  'a season with no published authorization asks nothing yet'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into run (label, id)
select 'version', public.publish_authorization_version(
  (select content from public.authorization_versions where id = '5eed0000-0000-4000-8041-000000000001'));

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select is(
  (select required::text || '|' || is_returning::text from public.my_authorization_status()),
  'true|true', 'publishing the new season makes a returning player re-register'
);
select lives_ok(
  $$ select public.update_my_season_answers('{"childcare_need": "no"}'::jsonb) $$,
  'she updates her season answers for 2027/28'
);
select lives_ok(
  $$ select public.sign_authorization((select id from run where label = 'version'), jsonb_build_object(
       'consents', jsonb_build_object('participation', true, 'data_processing', true,
                                      'code_of_conduct', true, 'health_data', true),
       'health_info', 'No', 'unable_to_draw', true, 'language', 'ca')) $$,
  'and signs the new season'
);
select is(
  (select required from public.my_authorization_status()), false,
  'signing completes re-registration'
);

reset role;
select is(
  (select string_agg(s.name || ':' || coalesce(a.childcare_need, '-'), ',' order by s.starts_on)
     from public.season_answers a join public.seasons s on s.id = a.season_id
    where a.profile_id = '5eed0000-0000-4000-8000-000000000011'),
  '2026/27:yes,2027/28:no', 'each season keeps its own answers'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
reset role;
delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000003' and permission_code = 'participants.view_sensitive';
set local role authenticated;
select is(
  (select coalesce(applicant_status, 'hidden') || '|' || childcare_need
     from public.participant_season_answers('5eed0000-0000-4000-8000-000000000011') where season_name = '2026/27'),
  'hidden|yes', 'without participants.view_sensitive the sensitive season answers stay hidden'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select season_number from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011')),
  4::smallint, 'two signed seasons and two earlier ones: her fourth season'
);

-- 6. The season view and paper -------------------------------------------------------------------------------

select is(
  (select registered from public.season_registration_status() where profile_id = '5eed0000-0000-4000-8000-000000000012'),
  false, 'a player who has not re-registered shows as not registered'
);
select public.record_paper_authorization('5eed0000-0000-4000-8000-000000000012', current_date);
select is(
  (select registered::text || '|' || method from public.season_registration_status()
    where profile_id = '5eed0000-0000-4000-8000-000000000012'),
  'true|paper', 'a paper record completes re-registration'
);

-- 5. The wizard asks the registration questions ---------------------------------------------------------------

reset role;
select ok(
  private.wizard_intake_questions() @> array['applicant_status', 'supporting_entities', 'childcare_need', 'specific_needs'],
  'the four registration questions are wizard questions'
);
select ok(
  not (private.required_intake_questions() && array['applicant_status', 'supporting_entities', 'childcare_need', 'specific_needs']),
  'and they are optional'
);

select * from finish();
rollback;
