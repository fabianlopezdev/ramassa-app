-- Surveys on the form engine close the gaps to the old surveys (RAPP-943 to RAPP-946).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   - a survey picked by an audience matches it live: a player who joins the
--     group after it was published is asked when she opens the app (RAPP-943);
--   - her answers are stored encrypted (RAPP-944);
--   - a half-answered survey is kept, says it is started, and goes when she
--     sends it; a closed survey keeps nothing more (RAPP-945);
--   - the CSV rows need a recent authenticator code and leave an audit row
--     (RAPP-946);
--   - a test player's answers stay out of real results, and a test account
--     reviewing staging sees them (RAPP-619).
--
-- The test builds its own organization: a real admin ...001, a test admin
-- ...002, players ...011 and ...012 and a test player ...013.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(20);

insert into public.organizations (id, name, slug)
values ('94300000-0000-4000-8000-000000000000', 'Proves 943', 'proves-943');
insert into auth.users (id, email) values
  ('94300000-0000-4000-8000-000000000001', 'admin-943@example.test'),
  ('94300000-0000-4000-8000-000000000002', 'test-admin-943@example.test'),
  ('94300000-0000-4000-8000-000000000011', 'player-943-a@example.test'),
  ('94300000-0000-4000-8000-000000000012', 'player-943-b@example.test'),
  ('94300000-0000-4000-8000-000000000013', 'test-player-943@example.test');
insert into public.profiles (id, org_id, role, first_name, last_name, is_test_account, terms_accepted_at)
values
  ('94300000-0000-4000-8000-000000000001', '94300000-0000-4000-8000-000000000000', 'admin', 'Admin', 'Real', false, now()),
  ('94300000-0000-4000-8000-000000000002', '94300000-0000-4000-8000-000000000000', 'admin', 'Admin', 'Prova', true, now()),
  ('94300000-0000-4000-8000-000000000011', '94300000-0000-4000-8000-000000000000', 'player', 'Jugadora', 'A', false, now()),
  ('94300000-0000-4000-8000-000000000012', '94300000-0000-4000-8000-000000000000', 'player', 'Jugadora', 'B', false, now()),
  ('94300000-0000-4000-8000-000000000013', '94300000-0000-4000-8000-000000000000', 'player', 'Jugadora', 'Prova', true, now())
on conflict (id) do update
  set org_id = excluded.org_id, role = excluded.role, is_test_account = excluded.is_test_account;
insert into public.custom_notification_groups (id, org_id, name)
values ('94300000-0000-4000-8943-0000000000a1', '94300000-0000-4000-8000-000000000000', 'Grup de proves');
insert into public.custom_notification_group_members (org_id, group_id, participant_id)
values ('94300000-0000-4000-8000-000000000000', '94300000-0000-4000-8943-0000000000a1',
        '94300000-0000-4000-8000-000000000011');

create temporary table ids (key text primary key, id uuid) on commit drop;
grant all on ids to authenticated;

-- The test admin builds a survey for the group ----------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "94300000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

insert into ids
select 'survey', public.create_custom_form('{"ca": "Com ha anat?"}', 'player', 'optional', null, 'chosen', false, 'survey');
insert into ids
select 'screen', public.save_custom_form_screen(null, (select id from ids where key = 'survey'), '{"ca": "Valora"}', null, null);
insert into ids
select 'rating', public.save_survey_question(
  null, (select id from ids where key = 'screen'), 'rating', '{"ca": "Com ha anat?"}', null, true, '[]', '{}');
insert into ids
select 'comment', public.save_survey_question(
  null, (select id from ids where key = 'screen'), 'short_text', '{"ca": "Algun comentari?"}', null, false, '[]', '{}');

select is(
  public.set_custom_form_recipients((select id from ids where key = 'survey'), 'custom_group',
    '{"custom_group_id": "94300000-0000-4000-8943-0000000000a1"}'),
  1, 'the group holds one player');
select is((select audience_rule ->> 'kind' from public.custom_forms where id = (select id from ids where key = 'survey')),
          'custom_group', 'a survey keeps the audience it was picked by');
select lives_ok(
  format($$ select public.publish_custom_form(%L, false, null) $$, (select id from ids where key = 'survey')),
  'the test admin publishes it');
reset role;

-- The audience is live --------------------------------------------------------------------------------

insert into public.custom_notification_group_members (org_id, group_id, participant_id)
values ('94300000-0000-4000-8000-000000000000', '94300000-0000-4000-8943-0000000000a1',
        '94300000-0000-4000-8000-000000000012'),
       ('94300000-0000-4000-8000-000000000000', '94300000-0000-4000-8943-0000000000a1',
        '94300000-0000-4000-8000-000000000013');

set local role authenticated;
set local request.jwt.claims = '{"sub": "94300000-0000-4000-8000-000000000012", "role": "authenticated"}';
select is((select count(*)::integer from public.my_surveys()), 1,
          'a player who joined the group after it was published is asked when she opens the app');
insert into ids select 'response_b', response_id from public.my_surveys();
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "94300000-0000-4000-8000-000000000013", "role": "authenticated"}';
select is((select count(*)::integer from public.my_surveys()), 1,
          'a test player in the group is asked what a test account published');
insert into ids select 'response_test', response_id from public.my_surveys();
select lives_ok(
  format($$ select public.complete_survey(%L, jsonb_build_object(%L, 2)) $$,
         (select id from ids where key = 'response_test'), (select id from ids where key = 'rating')),
  'the test player answers');
reset role;

-- A half-answered survey is kept ----------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "94300000-0000-4000-8000-000000000011", "role": "authenticated"}';
insert into ids select 'response_a', response_id from public.my_surveys();
select lives_ok(
  format($$ select public.save_custom_form_progress(%L, jsonb_build_object(%L, 5), %L) $$,
         (select id from ids where key = 'response_a'), (select id from ids where key = 'rating'),
         (select id from ids where key = 'screen')),
  'she leaves it half way and her answers so far are kept');
select is((select is_started from public.my_surveys()), true, 'her survey says it is started');
select is((public.my_custom_form_progress((select id from ids where key = 'response_a')) -> 'answers'
             ->> (select id from ids where key = 'rating')::text)::integer,
          5, 'she gets her answer back when she opens it again');
select lives_ok(
  format($$ select public.complete_survey(%L, jsonb_build_object(%L, 5, %L, 'Molt bé')) $$,
         (select id from ids where key = 'response_a'), (select id from ids where key = 'rating'),
         (select id from ids where key = 'comment')),
  'she sends it');
reset role;

select is((select count(*)::integer from public.custom_form_progress
            where response_id = (select id from ids where key = 'response_a')),
          0, 'sending removes her answers so far');

-- Her answers are encrypted ---------------------------------------------------------------------------

select ok(not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = 'survey_answers' and column_name = 'value'),
          'no survey answer is kept in plain text');
select ok(not exists (select 1 from public.survey_answers a
                       where a.response_id = (select id from ids where key = 'response_a')
                         and position(convert_to('Molt bé', 'UTF8') in a.value_encrypted) > 0),
          'her written answer is not readable in the table');

-- A closed survey keeps nothing more --------------------------------------------------------------------

update public.custom_forms set closes_at = now() - interval '1 minute'
 where id = (select id from ids where key = 'survey');
set local role authenticated;
set local request.jwt.claims = '{"sub": "94300000-0000-4000-8000-000000000012", "role": "authenticated"}';
select throws_ok(
  format($$ select public.save_custom_form_progress(%L, jsonb_build_object(%L, 3), null) $$,
         (select id from ids where key = 'response_b'), (select id from ids where key = 'rating')),
  '23514', 'the survey is closed', 'a closed survey keeps nothing more');
reset role;

-- The results and their CSV ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "94300000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is((select array_agg(profile_id) from public.survey_results((select id from ids where key = 'survey'))),
          array['94300000-0000-4000-8000-000000000011'::uuid],
          'real results leave the test player out');
select is((select r.answers ->> (select id from ids where key = 'comment')::text
             from public.survey_results((select id from ids where key = 'survey')) r),
          'Molt bé', 'the team reads her answer back');
select is(jsonb_array_length(public.create_survey_results_export((select id from ids where key = 'survey')) -> 'rows'),
          1, 'the CSV rows come after a recent authenticator code');
reset role;
select is((select count(*)::integer from public.audit_log
            where action = 'survey_export' and target_id = (select id from ids where key = 'survey')),
          1, 'each export leaves an audit row');

set local role authenticated;
set local request.jwt.claims = '{"sub": "94300000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "password", "timestamp": 4102444800}]}';
select throws_ok(
  format($$ select public.create_survey_results_export(%L) $$, (select id from ids where key = 'survey')),
  '42501', 'step_up_required', 'without a recent authenticator code the CSV is refused');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "94300000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is((select count(*)::integer from public.survey_results((select id from ids where key = 'survey'))),
          2, 'a test account reviewing staging sees the test player''s answers too');
reset role;

select * from finish();
rollback;
