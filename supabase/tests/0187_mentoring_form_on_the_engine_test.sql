-- The mentoring request on the form engine (RAPP-940).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Every organization has the mentoring form, a form of the engine filled
--      in by the player, never published, with its fixed screen (the topic, the
--      detail and the preferred date and time) first. A new organization gets
--      it beside the suggestions form.
--   2. Installed phone builds read `intake_catalog()` as before: neither the
--      form nor its questions reach it, for the team or for a player. The
--      dashboard reads it apart, with its questions.
--   3. The design role adds a screen and questions of the form's own; the form
--      asks no other field, no block, no consent. Its fixed screen keeps its
--      place and is never deleted; no screen hides; its choices stay; it is
--      never published. These rules are the ones the suggestions form keeps.
--   4. Her phone reads the form, and a request with answers saves them
--      encrypted with the request. A required question, a question the form
--      does not ask and an answer that does not fit are refused.
--   5. An installed build's request still saves through the old function, with
--      no answers, even when a question is required.
--   6. The queue reads her answers with each question as she read it, under the
--      rule that reads the request's detail: the design role, who builds the
--      form, reads no request and no answer.
--
-- The test builds its own organization: an admin ...001, a player ...002, a
-- second player ...003 and a designer ...004 who holds onboarding.design only.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(41);

insert into public.organizations (id, name, slug)
values ('94000000-0000-4000-8000-000000000000', 'Proves 940', 'proves-940');
insert into auth.users (id, email) values
  ('94000000-0000-4000-8000-000000000001', 'admin-940@example.test'),
  ('94000000-0000-4000-8000-000000000002', 'player-940@example.test'),
  ('94000000-0000-4000-8000-000000000003', 'player2-940@example.test'),
  ('94000000-0000-4000-8000-000000000004', 'designer-940@example.test');
insert into public.profiles (id, org_id, role, first_name, last_name, terms_accepted_at)
values
  ('94000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000000', 'admin', 'Admin', 'Prova', now()),
  ('94000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000000', 'player', 'Jugadora', 'Prova', now()),
  ('94000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000000', 'player', 'Altra', 'Prova', now()),
  ('94000000-0000-4000-8000-000000000004', '94000000-0000-4000-8000-000000000000', 'staff', 'Dissenyadora', 'Prova', now())
on conflict (id) do update set org_id = excluded.org_id, role = excluded.role;
delete from public.team_member_permissions where profile_id = '94000000-0000-4000-8000-000000000004';
insert into public.team_member_permissions (org_id, profile_id, permission_code)
values ('94000000-0000-4000-8000-000000000000', '94000000-0000-4000-8000-000000000004', 'onboarding.design');

create temporary table ids (key text primary key, id uuid) on commit drop;
grant all on ids to authenticated;
insert into ids select 'form', f.id from public.custom_forms f
 where f.org_id = '94000000-0000-4000-8000-000000000000' and f.system_key = 'mentoring';
insert into ids select 'fixed', s.id from public.custom_form_screens s
 where s.form_id = (select id from ids where key = 'form') and s.system_screen = 'mentoring_request';

create function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', 4102444800)))::text, true);
end;
$$;
create function pg_temp.catalog(p_user uuid, p_with_surveys boolean) returns jsonb language plpgsql as $$
declare
  result jsonb;
begin
  perform pg_temp.as_user(p_user);
  set local role authenticated;
  result := case when p_with_surveys then public.intake_catalog_with_surveys() else public.intake_catalog() end;
  reset role;
  return result;
end;
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1. Every organization has the mentoring form -----------------------------------------------------------

select is((select count(*)::integer from ids where key in ('form', 'fixed')), 2,
          'a new organization gets the mentoring form with its fixed screen');
select is((select count(*)::integer from public.custom_forms
            where org_id = '94000000-0000-4000-8000-000000000000' and system_key in ('feedback', 'mentoring')),
          2, 'and the suggestions form beside it');
select results_eq(
  $$ select kind, filled_by, mandatory, published_at is null from public.custom_forms
      where id = (select id from ids where key = 'form') $$,
  $$ values ('other', 'player', 'optional', true) $$,
  'it is filled in by the player, optional and never published');
select is(
  (select count(*)::integer from public.organizations o
    where not exists (select 1 from public.custom_forms f where f.org_id = o.id and f.system_key = 'mentoring')),
  0, 'every organization has it');

-- 3. The design role builds it ------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('94000000-0000-4000-8000-000000000004');
insert into ids select 'second', public.save_custom_form_screen(
  null, (select id from ids where key = 'form'), '{"ca": "Una mica més"}', null, null);
insert into ids select 'rating', public.save_survey_question(
  null, (select id from ids where key = 'second'), 'rating', '{"ca": "Com et trobes?"}', null, true, '[]', '{}');
insert into ids select 'choice', public.save_survey_question(
  null, (select id from ids where key = 'fixed'), 'single_choice', '{"ca": "On prefereixes?"}', null, false,
  '[{"label": {"ca": "Al camp"}}, {"label": {"ca": "Al local"}}]', '{}');
reset role;
set local role authenticated;
select pg_temp.as_user('94000000-0000-4000-8000-000000000001');
insert into ids select 'regular', public.save_profile_field(
  null, (select s.id from public.profile_sections s
          where s.org_id = '94000000-0000-4000-8000-000000000000' order by s.sort_order limit 1),
  'short_text', '{"ca": "Una pregunta de la fitxa"}', null, 'normal', false, '[]', '{}');
reset role;

select results_eq(
  $$ select kind, survey_form_id, section_id is null from public.profile_fields
      where id = (select id from ids where key = 'rating') $$,
  $$ values ('survey', (select id from ids where key = 'form'), true) $$,
  'a question of the form is its own, in no section');
select results_eq(
  $$ select screen_key, required from public.field_placements where field_id = (select id from ids where key = 'rating') $$,
  $$ values ((select id::text from ids where key = 'second'), true) $$,
  'the question goes on the screen staff picked, required as saved');
select is(
  (select screen_key from public.field_placements where field_id = (select id from ids where key = 'choice')),
  (select id::text from ids where key = 'fixed'),
  'a question goes on the fixed screen too, after the topic, the detail and the preferred date and time');
select is(
  (select sort_order from public.custom_form_screens where id = (select id from ids where key = 'second'))
    > (select sort_order from public.custom_form_screens where id = (select id from ids where key = 'fixed')),
  true, 'a new screen goes after the fixed screen');

set local role authenticated;
select pg_temp.as_user('94000000-0000-4000-8000-000000000001');
select throws_ok(
  format($$ select public.place_field(%L, 'custom_form', %L, false) $$,
         (select id from ids where key = 'regular'), (select id from ids where key = 'second')),
  '23514', 'the mentoring form asks its own questions only',
  'a field of the Fitxa is never asked on the mentoring form');
select throws_ok(
  format($$ select public.save_form_block(null, 'custom_form', %L, 'text', '{"ca": "Un text"}'::jsonb, null, null) $$,
         (select id from ids where key = 'second')),
  '23514', 'the mentoring form asks its own questions only',
  'the mentoring form holds no block');
select throws_ok(
  format($$ select public.reorder_custom_form_screens(%L, array[%L, %L]::uuid[]) $$,
         (select id from ids where key = 'form'), (select id from ids where key = 'second'),
         (select id from ids where key = 'fixed')),
  '23514', 'a system screen of a legal form keeps its place',
  'the fixed screen keeps its place');
select lives_ok(
  format($$ select public.reorder_custom_form_screens(%L, array[%L, %L]::uuid[]) $$,
         (select id from ids where key = 'form'), (select id from ids where key = 'fixed'),
         (select id from ids where key = 'second')),
  'the other screens are ordered after it');
insert into ids select 'third', public.save_custom_form_screen(
  null, (select id from ids where key = 'form'), '{"ca": "Una altra"}', null, null);
select throws_ok(
  format($$ select public.set_screen_hidden(%L, true) $$, (select id from ids where key = 'third')),
  '23514', 'a screen of the mentoring form always shows', 'no screen of the form hides');
select throws_ok(
  format($$ select public.set_screen_hidden(%L, true) $$, (select id from ids where key = 'fixed')),
  '23514', 'a screen of the mentoring form always shows', 'nor its fixed screen');
select throws_ok(
  format($$ select public.delete_builder_screen('custom_form', %L, array[%L]) $$,
         (select id from ids where key = 'fixed'), (select id from ids where key = 'fixed')),
  '23514', null::text, 'the fixed screen is never deleted');
select throws_ok(
  format($$ select public.publish_custom_form(%L, false, null) $$, (select id from ids where key = 'form')),
  '23514', null::text, 'the mentoring form is never published');
select throws_ok(
  format($$ select public.save_custom_form(%L, '{"ca": "Mentoria"}', 'player', 'required_to_use_app', null, 'all', false, null) $$,
         (select id from ids where key = 'form')),
  '23514', null::text, 'its choices stay');
select throws_ok(
  format($$ select public.archive_custom_form(%L) $$, (select id from ids where key = 'form')),
  null::text, null::text, 'it is never archived');
select lives_ok(
  format($$ select public.save_custom_form_screen(%L, %L, '{"ca": "La teva sol·licitud"}', null, null) $$,
         (select id from ids where key = 'fixed'), (select id from ids where key = 'form')),
  'staff word the fixed screen');
reset role;

-- 2. Installed builds read the catalog as before ------------------------------------------------------------

select is(pg_temp.catalog('94000000-0000-4000-8000-000000000001', false)::text
            like '%' || (select id::text from ids where key = 'form') || '%',
          false, 'the team''s catalog an installed build reads never names the mentoring form');
select is(pg_temp.catalog('94000000-0000-4000-8000-000000000001', false)::text
            like '%' || (select id::text from ids where key = 'rating') || '%',
          false, 'nor its questions');
select is(pg_temp.catalog('94000000-0000-4000-8000-000000000001', false) ? 'mentoring_form',
          false, 'nor a key it does not know');
select is(pg_temp.catalog('94000000-0000-4000-8000-000000000002', false)::text
            like '%' || (select id::text from ids where key = 'form') || '%',
          false, 'a player''s catalog never names it either');
select is(pg_temp.catalog('94000000-0000-4000-8000-000000000004', true) -> 'mentoring_form' ->> 'id',
          (select id::text from ids where key = 'form'),
          'the dashboard reads the form apart');
select is(
  (select count(*)::integer from jsonb_array_elements(pg_temp.catalog('94000000-0000-4000-8000-000000000004', true) -> 'custom_forms') e
    where e ->> 'system_key' in ('feedback', 'mentoring')),
  0, 'its lists of forms never show either form');
select is(
  (select count(*)::integer from jsonb_array_elements(pg_temp.catalog('94000000-0000-4000-8000-000000000004', true) -> 'custom_form_placements') e
    where e ->> 'field_id' in (select id::text from ids where key in ('rating', 'choice'))),
  2, 'the dashboard reads where each question is asked');

-- 4. Her phone reads the form and sends a request with its answers -----------------------------------------

set local role authenticated;
select pg_temp.as_user('94000000-0000-4000-8000-000000000002');
select results_eq(
  $$ select jsonb_array_length(f -> 'content' -> 'screens'), f -> 'content' -> 'screens' -> 0 ->> 'system_screen',
            jsonb_array_length(f -> 'content' -> 'placements')
       from public.my_mentoring_form() f $$,
  $$ values (3, 'mentoring_request', 2) $$,
  'her phone reads the form: the fixed screen first, and the questions');
select throws_ok(
  $$ select public.send_mentoring_request('empowerment', null, null, null, '{}'::jsonb) $$,
  '23514', 'a required question has no answer', 'a required question needs an answer');
select throws_ok(
  format($$ select public.send_mentoring_request('empowerment', null, null, null, %L::jsonb) $$,
         jsonb_build_object((select id::text from ids where key = 'rating'), 4,
                            (select id::text from ids where key = 'regular'), 'hola')),
  '22023', 'an answer to a question the mentoring form does not ask',
  'an answer to a question the form does not ask is refused');
select throws_ok(
  format($$ select public.send_mentoring_request('empowerment', null, null, null, %L::jsonb) $$,
         jsonb_build_object((select id::text from ids where key = 'rating'), 9)),
  '23514', 'an answer does not fit its question', 'an answer that does not fit is refused');
select throws_ok(
  format($$ select public.send_mentoring_request('not_a_topic', null, null, null, %L::jsonb) $$,
         jsonb_build_object((select id::text from ids where key = 'rating'), 4)),
  '23514', 'invalid mentoring request', 'the request''s own parts are checked as before');
insert into ids select 'sent', public.send_mentoring_request('gender_violence', 'Una nota privada', '2026-12-01', '17:30',
  jsonb_build_object((select id::text from ids where key = 'rating'), 4,
                     (select id::text from ids where key = 'choice'),
                     (select o.id::text from public.custom_question_options o
                       where o.question_id = (select id from ids where key = 'choice') order by o.sort_order limit 1)));
reset role;

select results_eq(
  $$ select topic, public.decrypt_field(topic_detail_encrypted), preferred_date, preferred_time, answers_encrypted is not null
       from public.mentoring_requests where id = (select id from ids where key = 'sent') $$,
  $$ values ('gender_violence', 'Una nota privada', '2026-12-01'::date, '17:30'::time, true) $$,
  'the request saves as before, with her answers beside it');
select is(
  (select jsonb_array_length(public.decrypt_field(answers_encrypted)::jsonb)
     from public.mentoring_requests where id = (select id from ids where key = 'sent')),
  2, 'every answer is kept, encrypted');
select is(
  (select count(*)::integer from public.custom_answers
    where question_id in (select id from ids where key in ('rating', 'choice'))),
  0, 'her answers never go on her record');

-- 5. An installed build's request still saves ---------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('94000000-0000-4000-8000-000000000003');
insert into ids select 'old', public.create_mentoring_request('digital_skills', null, null, null);
select pg_temp.as_user('94000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.my_mentoring_form() $$, '42501', null::text, 'DENIAL: only a player reads it');
reset role;
select results_eq(
  $$ select topic, answers_encrypted is null from public.mentoring_requests where id = (select id from ids where key = 'old') $$,
  $$ values ('digital_skills', true) $$,
  'an installed build''s request saves with no answers, even with a required question');

-- 6. The queue reads her answers, and only who reads the detail --------------------------------------------

set local role authenticated;
select pg_temp.as_user('94000000-0000-4000-8000-000000000001');
select is(
  (select a -> 'question' -> 'label' ->> 'ca'
     from public.list_staff_mentoring_requests() l
     cross join lateral jsonb_array_elements(l.answers) a
    where l.id = (select id from ids where key = 'sent') and a ->> 'field_id' = (select id::text from ids where key = 'rating')),
  'Com et trobes?', 'the queue reads each answer with its question as she read it');
select is(
  (select l.answers from public.list_staff_mentoring_requests() l
    where l.id = (select id from ids where key = 'old')),
  '[]'::jsonb, 'a request with no answers reads an empty list');
select pg_temp.as_user('94000000-0000-4000-8000-000000000004');
select is((select count(*)::integer from public.list_staff_mentoring_requests()), 0,
          'DENIAL: the design role, who builds the form, reads no request in the queue');
select is((select count(*)::integer from public.mentoring_requests), 0,
          'DENIAL: nor a request row');
select throws_ok(
  $$ select public.decrypt_field(answers_encrypted) from public.mentoring_requests $$,
  '42501', null::text, 'DENIAL: nobody decrypts the answers outside the queue');
reset role;

select * from finish();
rollback;
