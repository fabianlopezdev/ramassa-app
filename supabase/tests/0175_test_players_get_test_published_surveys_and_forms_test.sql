-- A test player receives the surveys and forms a test account published (RAPP-885).
-- Run with: bunx supabase test db
--
-- What these assertions defend: on staging the testers sign in as test players
-- and must see, open and answer what a test team account publishes for them.
-- A survey or a form published by a real team member still never reaches a
-- test player (RAPP-619). A real player sees exactly what she saw before, from
-- either publisher. Counts, results and the survey export still leave every
-- test player out.
--
-- The test builds its own organization, so it needs no seed: a test admin
-- ...001, a real admin ...002, a test player ...011 and a real player ...012.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(29);

insert into public.organizations (id, name, slug)
values ('88500000-0000-4000-8000-000000000000', 'Proves 885', 'proves-885');
insert into auth.users (id, email) values
  ('88500000-0000-4000-8000-000000000001', 'test-admin-885@example.test'),
  ('88500000-0000-4000-8000-000000000002', 'real-admin-885@example.test'),
  ('88500000-0000-4000-8000-000000000011', 'test-player-885@example.test'),
  ('88500000-0000-4000-8000-000000000012', 'real-player-885@example.test');
insert into public.profiles (id, org_id, role, first_name, last_name, is_test_account, terms_accepted_at)
values
  ('88500000-0000-4000-8000-000000000001', '88500000-0000-4000-8000-000000000000', 'admin', 'Admin', 'Prova', true, now()),
  ('88500000-0000-4000-8000-000000000002', '88500000-0000-4000-8000-000000000000', 'admin', 'Admin', 'Real', false, now()),
  ('88500000-0000-4000-8000-000000000011', '88500000-0000-4000-8000-000000000000', 'player', 'Jugadora', 'Prova', true, now()),
  ('88500000-0000-4000-8000-000000000012', '88500000-0000-4000-8000-000000000000', 'player', 'Jugadora', 'Real', false, now())
on conflict (id) do update
  set org_id = excluded.org_id, role = excluded.role, is_test_account = excluded.is_test_account;

-- Surveys: one by the test admin and one by the real admin, both for everyone,
-- each with one optional question. A third by the test admin goes to the
-- players interested in a category nobody is interested in.
insert into public.surveys (id, org_id, title, published_at, audience_kind, audience_config, created_by)
values
  ('88500000-0000-4000-8885-000000000001', '88500000-0000-4000-8000-000000000000',
   '{"ca": "Enquesta de prova"}', now() - interval '1 hour', 'all', '{}',
   '88500000-0000-4000-8000-000000000001'),
  ('88500000-0000-4000-8885-000000000002', '88500000-0000-4000-8000-000000000000',
   '{"ca": "Enquesta real"}', now() - interval '1 hour', 'all', '{}',
   '88500000-0000-4000-8000-000000000002'),
  ('88500000-0000-4000-8885-000000000003', '88500000-0000-4000-8000-000000000000',
   '{"ca": "Enquesta de prova per interès"}', now() - interval '1 hour', 'interest',
   '{"service_category_id": "88500000-0000-4000-8885-0000000000ff"}',
   '88500000-0000-4000-8000-000000000001');
insert into public.survey_questions (id, org_id, survey_id, prompt, question_type, options, required, sort_order)
select ('88500000-0000-4000-8886-00000000000' || n)::uuid, '88500000-0000-4000-8000-000000000000',
       ('88500000-0000-4000-8885-00000000000' || n)::uuid, '{"ca": "Com ha anat?"}', 'free_text', null, false, 0
  from generate_series(1, 2) as n;

-- The audience rule ----------------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "88500000-0000-4000-8000-000000000002", "role": "authenticated"}';
select is(
  private.matches_notification_audience('88500000-0000-4000-8000-000000000011', 'all', '{}',
    '88500000-0000-4000-8000-000000000001'),
  true, 'a test player matches an audience a test account published to'
);
select is(
  private.matches_notification_audience('88500000-0000-4000-8000-000000000011', 'all', '{}',
    '88500000-0000-4000-8000-000000000002'),
  false, 'a test player does not match an audience a real team member published to'
);
select is(
  private.matches_notification_audience('88500000-0000-4000-8000-000000000011', 'all'),
  false, 'with no publisher a test player matches nothing, as before'
);
select is(
  private.matches_notification_audience('88500000-0000-4000-8000-000000000011', 'interest',
    '{"service_category_id": "88500000-0000-4000-8885-0000000000ff"}', '88500000-0000-4000-8000-000000000001'),
  false, 'a test player still has to fit the audience itself'
);
select is(
  array[
    private.matches_notification_audience('88500000-0000-4000-8000-000000000012', 'all'),
    private.matches_notification_audience('88500000-0000-4000-8000-000000000012', 'all', '{}',
      '88500000-0000-4000-8000-000000000001'),
    private.matches_notification_audience('88500000-0000-4000-8000-000000000012', 'all', '{}',
      '88500000-0000-4000-8000-000000000002')],
  array[true, true, true],
  'a real player matches the same whoever published'
);
select is(
  private.matches_notification_audience('88500000-0000-4000-8000-000000000012', 'interest',
    '{"service_category_id": "88500000-0000-4000-8885-0000000000ff"}', '88500000-0000-4000-8000-000000000001'),
  false, 'a real player outside the audience stays outside when a test account published'
);
select hasnt_function('private', 'matches_notification_audience', array['uuid', 'text', 'jsonb'],
  'the three-argument audience rule is gone, so three arguments reach the one rule');
select function_privs_are('private', 'matches_notification_audience', array['uuid', 'text', 'jsonb', 'uuid'],
  'authenticated', array[]::text[], 'a signed-in caller cannot run the audience rule directly');
select function_privs_are('private', 'matches_notification_audience', array['uuid', 'text', 'jsonb', 'uuid'],
  'anon', array[]::text[], 'nor can an anonymous caller');

-- Surveys: what each player sees and answers ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "88500000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(
  (select array_agg(id order by id) from public.list_player_surveys()),
  array['88500000-0000-4000-8885-000000000001'::uuid],
  'the test player sees the survey the test admin published, and only that one'
);
select isnt(
  public.save_survey_response('88500000-0000-4000-8885-000000000001',
    '{"88500000-0000-4000-8886-000000000001": "Molt bé"}', true),
  null, 'the test player answers the survey the test admin published'
);
select is(
  (select status from public.get_own_survey_response('88500000-0000-4000-8885-000000000001')),
  'completed', 'her answer is saved as completed'
);
select throws_ok(
  $$select public.save_survey_response('88500000-0000-4000-8885-000000000002', '{}', true)$$,
  'P0001', 'SURVEYS/CLOSED',
  'the test player cannot answer the survey the real admin published'
);

set local request.jwt.claims = '{"sub": "88500000-0000-4000-8000-000000000012", "role": "authenticated"}';
select is(
  (select array_agg(id order by id) from public.list_player_surveys()),
  array['88500000-0000-4000-8885-000000000001'::uuid, '88500000-0000-4000-8885-000000000002'::uuid],
  'the real player sees both surveys, as before'
);
select isnt(
  public.save_survey_response('88500000-0000-4000-8885-000000000001',
    '{"88500000-0000-4000-8886-000000000001": "Bé"}', true),
  null, 'the real player answers the survey the test admin published'
);
select isnt(
  public.save_survey_response('88500000-0000-4000-8885-000000000002',
    '{"88500000-0000-4000-8886-000000000002": "Bé"}', true),
  null, 'the real player answers the survey the real admin published'
);

-- Survey counts, results and the export leave the test player out -----------------------------------------------

set local request.jwt.claims = '{"sub": "88500000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select array[response_count, completed_count] from public.list_surveys()
    where id = '88500000-0000-4000-8885-000000000001'),
  array[1::bigint, 1::bigint],
  'the response counts hold the real player''s answer only'
);
select is(
  (select array_agg(player_id) from public.list_survey_responses('88500000-0000-4000-8885-000000000001')),
  array['88500000-0000-4000-8000-000000000012'::uuid],
  'the survey results hold the real player''s answer only'
);
select is(
  (select count(*)::integer from jsonb_array_elements(
     public.create_survey_export('88500000-0000-4000-8885-000000000001') -> 'rows') r
    where r ->> 'player_id' = '88500000-0000-4000-8000-000000000011'),
  0, 'the survey export has no test player'
);
set local request.jwt.claims = '{"sub": "88500000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select array_agg(player_id) from public.list_survey_responses('88500000-0000-4000-8885-000000000001')),
  array['88500000-0000-4000-8000-000000000012'::uuid],
  'nor does the test admin read the test player''s answer in the results'
);

-- Forms: the recipients chosen by a group ------------------------------------------------------------------------

reset role;
insert into public.custom_forms (id, org_id, name, filled_by, audience)
values
  ('88500000-0000-4000-8887-000000000001', '88500000-0000-4000-8000-000000000000',
   '{"ca": "Formulari de prova"}', 'player', 'chosen'),
  ('88500000-0000-4000-8887-000000000002', '88500000-0000-4000-8000-000000000000',
   '{"ca": "Formulari real"}', 'player', 'chosen');
insert into public.custom_form_screens (org_id, form_id, title)
select '88500000-0000-4000-8000-000000000000', id, '{"ca": "Pantalla"}'
  from public.custom_forms where org_id = '88500000-0000-4000-8000-000000000000';

set local role authenticated;
set local request.jwt.claims = '{"sub": "88500000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  public.set_custom_form_recipients('88500000-0000-4000-8887-000000000001', 'all', '{}'),
  2, 'the test admin chooses everyone and both players are recipients'
);
select lives_ok(
  $$select public.publish_custom_form('88500000-0000-4000-8887-000000000001')$$,
  'the test admin publishes her form'
);
set local request.jwt.claims = '{"sub": "88500000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  public.set_custom_form_recipients('88500000-0000-4000-8887-000000000002', 'all', '{}'),
  1, 'the real admin chooses everyone and only the real player is a recipient'
);
select lives_ok(
  $$select public.publish_custom_form('88500000-0000-4000-8887-000000000002')$$,
  'the real admin publishes his form'
);

set local request.jwt.claims = '{"sub": "88500000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(
  (select array_agg(form_id order by form_id) from public.my_custom_forms()),
  array['88500000-0000-4000-8887-000000000001'::uuid],
  'the test player is asked the test admin''s form, and only that one'
);
select lives_ok(
  $$select public.complete_custom_form(
      (select response_id from public.my_custom_forms()
        where form_id = '88500000-0000-4000-8887-000000000001'), '{}')$$,
  'the test player answers the test admin''s form'
);

set local request.jwt.claims = '{"sub": "88500000-0000-4000-8000-000000000012", "role": "authenticated"}';
select is(
  (select array_agg(form_id order by form_id) from public.my_custom_forms()),
  array['88500000-0000-4000-8887-000000000001'::uuid, '88500000-0000-4000-8887-000000000002'::uuid],
  'the real player is asked both forms, as before'
);
select lives_ok(
  $$select public.complete_custom_form(
      (select response_id from public.my_custom_forms()
        where form_id = '88500000-0000-4000-8887-000000000002'), '{}')$$,
  'the real player answers the real admin''s form'
);

-- Choosing by name never read the audience rule: a test player chosen by name is asked, as before.
set local request.jwt.claims = '{"sub": "88500000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  public.set_custom_form_recipients('88500000-0000-4000-8887-000000000002', 'players',
    '{"participant_ids": ["88500000-0000-4000-8000-000000000011"]}'),
  1, 'a test player chosen by name is a recipient, whoever chose her'
);

select * from finish();
rollback;
