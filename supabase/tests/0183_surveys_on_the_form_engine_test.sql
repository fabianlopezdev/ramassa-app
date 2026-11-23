-- Surveys on the form engine (RAPP-929).
-- Run with: bunx supabase test db
--
-- What these assertions defend: a survey is a form of the engine, but her
-- answers to it are opinions about one survey. They are kept per response and
-- never reach her record (`custom_answers`). A survey and its questions never
-- reach the catalog installed builds read, nor their form list, nor a push;
-- the dashboard reads them through `intake_catalog_with_surveys`. The 1 to 5
-- rating is a survey's question only.
--
-- The test builds its own organization: an admin ...001 and a player ...011.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(22);

insert into public.organizations (id, name, slug)
values ('92900000-0000-4000-8000-000000000000', 'Proves 929', 'proves-929');
insert into auth.users (id, email) values
  ('92900000-0000-4000-8000-000000000001', 'admin-929@example.test'),
  ('92900000-0000-4000-8000-000000000011', 'player-929@example.test');
insert into public.profiles (id, org_id, role, first_name, last_name, is_test_account, terms_accepted_at)
values
  ('92900000-0000-4000-8000-000000000001', '92900000-0000-4000-8000-000000000000', 'admin', 'Admin', 'Prova', false, now()),
  ('92900000-0000-4000-8000-000000000011', '92900000-0000-4000-8000-000000000000', 'player', 'Jugadora', 'Una', false, now())
on conflict (id) do update
  set org_id = excluded.org_id, role = excluded.role, is_test_account = excluded.is_test_account;
insert into public.profile_sections (id, org_id, key, title, sort_order)
values ('92900000-0000-4000-8929-000000000001', '92900000-0000-4000-8000-000000000000',
        'proves', '{"ca": "Proves"}', 0);
-- A field of her record, to show a survey refuses it.
insert into public.profile_fields (id, org_id, section_id, kind, question_type, label, privacy)
values ('92900000-0000-4000-8929-0000000000f1', '92900000-0000-4000-8000-000000000000',
        '92900000-0000-4000-8929-000000000001', 'custom', 'short_text', '{"ca": "Parada de metro"}', 'normal');

-- The team builds a survey ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "92900000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

create temporary table ids (key text primary key, id uuid) on commit drop;
grant all on ids to authenticated;

insert into ids
select 'survey', public.create_custom_form('{"ca": "Com ha anat l''entrenament?"}', 'player', 'optional', null, 'all', false, 'survey');
select is((select kind from public.custom_forms where id = (select id from ids where key = 'survey')), 'survey',
          'a survey is a form of the engine');

select throws_ok(
  $$ select public.create_custom_form('{"ca": "Obligatòria"}', 'player', 'required_to_use_app', null, 'all', false, 'survey') $$,
  '23514', null, 'a survey is never required');

insert into ids
select 'screen', public.save_custom_form_screen(null, (select id from ids where key = 'survey'), '{"ca": "Valora-ho"}', null, null);

insert into ids
select 'rating', public.save_survey_question(
  null, (select id from ids where key = 'screen'), 'rating', '{"ca": "Com ha anat?"}', null, true, '[]', '{}');
select is((select kind || ':' || coalesce(section_id::text, 'none') || ':' || (survey_form_id = (select id from ids where key = 'survey'))::text
             from public.profile_fields where id = (select id from ids where key = 'rating')),
          'survey:none:true', 'a survey question belongs to its survey and no section');
select is((select count(*)::integer from public.field_placements
            where field_id = (select id from ids where key = 'rating') and surface = 'custom_form'),
          1, 'the question is placed on its screen');

select throws_ok(
  $$ select public.save_profile_field(null, '92900000-0000-4000-8929-000000000001', 'rating',
                                      '{"ca": "Puntua"}', null, 'normal') $$,
  '23514', 'a rating is asked on a survey only', 'a rating is never a field of her record');

select throws_ok(
  format($$ select public.place_field('92900000-0000-4000-8929-0000000000f1', 'custom_form', %L) $$,
         (select id from ids where key = 'screen')),
  '23514', 'a survey asks its own questions only', 'a survey asks no field of her record');

select throws_ok(
  format($$ select public.place_field(%L, 'onboarding', 'contact') $$, (select id from ids where key = 'rating')),
  '23514', 'a survey question goes on its own survey only', 'a survey question goes on no other surface');

select lives_ok(
  format($$ select public.publish_custom_form(%L, false, null) $$, (select id from ids where key = 'survey')),
  'the team publishes the survey');
select is((select count(*)::integer from public.custom_form_responses
            where form_id = (select id from ids where key = 'survey')
              and profile_id = '92900000-0000-4000-8000-000000000011'),
          1, 'publishing asks the player');
reset role;
select is((select count(*)::integer from public.push_publications
            where content_type = 'custom_form'
              and content_id in (select id from public.custom_form_responses
                                  where form_id = (select id from ids where key = 'survey'))),
          0, 'a survey rings no phone: an older build would open it as a form');

-- The player answers ---------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "92900000-0000-4000-8000-000000000011", "role": "authenticated"}';

select ok(not exists (select 1 from jsonb_array_elements(public.intake_catalog() -> 'custom_forms') f
                       where f ->> 'id' = (select id from ids where key = 'survey')::text),
          'the catalog older builds read has no survey');
select ok(not exists (select 1 from jsonb_array_elements(public.intake_catalog() -> 'fields') f
                       where f ->> 'kind' = 'survey'),
          'nor a survey question');
select is((select count(*)::integer from public.my_custom_forms() m
            where m.form_id = (select id from ids where key = 'survey')),
          0, 'her form list leaves the survey out');
select is((select count(*)::integer from public.my_surveys()), 1, 'her surveys list it');
select throws_ok(
  $$ select public.intake_catalog_with_surveys() $$,
  '42501', null, 'the dashboard catalog is the team''s');

insert into ids select 'response', response_id from public.my_surveys();
select throws_ok(
  format($$ select public.complete_custom_form(%L, '{"answers": {}}') $$, (select id from ids where key = 'response')),
  '22023', 'a survey is answered with complete_survey', 'a survey never goes through the form path');
select throws_ok(
  format($$ select public.complete_survey(%L, jsonb_build_object(%L, 6)) $$,
         (select id from ids where key = 'response'), (select id from ids where key = 'rating')),
  '23514', 'an answer does not fit its question', 'a rating is 1 to 5');
select lives_ok(
  format($$ select public.complete_survey(%L, jsonb_build_object(%L, 4)) $$,
         (select id from ids where key = 'response'), (select id from ids where key = 'rating')),
  'she answers the survey');
reset role;

select is((select status from public.custom_form_responses where id = (select id from ids where key = 'response')),
          'done', 'the response is done');
select is((select count(*)::integer from public.custom_answers
            where question_id = (select id from ids where key = 'rating')),
          0, 'her answer never reaches her record');

-- The team reads the results -------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "92900000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select ok(exists (select 1 from jsonb_array_elements(public.intake_catalog_with_surveys() -> 'fields') f
                   where f ->> 'id' = (select id from ids where key = 'rating')::text),
          'the dashboard catalog has the survey question');
select is((select (r.answers ->> (select id from ids where key = 'rating')::text)::integer
             from public.survey_results((select id from ids where key = 'survey')) r),
          4, 'the results hold her answer');
reset role;

select * from finish();
rollback;
