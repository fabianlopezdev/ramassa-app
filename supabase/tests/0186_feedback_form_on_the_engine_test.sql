-- The suggestions form on the form engine (RAPP-939).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Every organization has the suggestions form, a form of the engine
--      filled in by the player, never published, with its fixed screen (the
--      type, the text and the photo) first.
--   2. Installed phone builds read `intake_catalog()` as before: neither the
--      form nor its questions reach it, for the team or for a player. The
--      dashboard reads the form apart, with its questions.
--   3. Staff add a screen and questions of the form's own; the form asks no
--      other field, no block, no consent. Its fixed screen keeps its place
--      and is never deleted; no screen hides; its choices stay; it is never
--      published.
--   4. Her phone reads the form, and a suggestion with answers saves them
--      encrypted with the suggestion. A required question, a question the
--      form does not ask and an answer that does not fit are refused.
--   5. An installed build's suggestion still saves through the old function,
--      with no answers, even when a question is required.
--   6. The inbox reads her answers with each question as she read it.
--
-- The test builds its own organization: an admin ...001, a player ...002 and
-- a second player ...003.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(33);

insert into public.organizations (id, name, slug)
values ('93900000-0000-4000-8000-000000000000', 'Proves 939', 'proves-939');
insert into auth.users (id, email) values
  ('93900000-0000-4000-8000-000000000001', 'admin-939@example.test'),
  ('93900000-0000-4000-8000-000000000002', 'player-939@example.test'),
  ('93900000-0000-4000-8000-000000000003', 'player2-939@example.test');
insert into public.profiles (id, org_id, role, first_name, last_name, terms_accepted_at)
values
  ('93900000-0000-4000-8000-000000000001', '93900000-0000-4000-8000-000000000000', 'admin', 'Admin', 'Prova', now()),
  ('93900000-0000-4000-8000-000000000002', '93900000-0000-4000-8000-000000000000', 'player', 'Jugadora', 'Prova', now()),
  ('93900000-0000-4000-8000-000000000003', '93900000-0000-4000-8000-000000000000', 'player', 'Altra', 'Prova', now())
on conflict (id) do update set org_id = excluded.org_id, role = excluded.role;

create temporary table ids (key text primary key, id uuid) on commit drop;
grant all on ids to authenticated;
insert into ids select 'form', f.id from public.custom_forms f
 where f.org_id = '93900000-0000-4000-8000-000000000000' and f.system_key = 'feedback';
insert into ids select 'fixed', s.id from public.custom_form_screens s
 where s.form_id = (select id from ids where key = 'form') and s.system_screen = 'feedback_message';

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

-- 1. Every organization has the suggestions form ---------------------------------------------------------

select is((select count(*)::integer from ids where key in ('form', 'fixed')), 2,
          'a new organization gets the suggestions form with its fixed screen');
select results_eq(
  $$ select kind, filled_by, mandatory, published_at is null from public.custom_forms
      where id = (select id from ids where key = 'form') $$,
  $$ values ('other', 'player', 'optional', true) $$,
  'it is filled in by the player, optional and never published');

-- 3. Staff build it -----------------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('93900000-0000-4000-8000-000000000001');
insert into ids select 'second', public.save_custom_form_screen(
  null, (select id from ids where key = 'form'), '{"ca": "Una mica més"}', null, null);
insert into ids select 'rating', public.save_survey_question(
  null, (select id from ids where key = 'second'), 'rating', '{"ca": "Com t''ho passes?"}', null, true, '[]', '{}');
insert into ids select 'choice', public.save_survey_question(
  null, (select id from ids where key = 'fixed'), 'single_choice', '{"ca": "On?"}', null, false,
  '[{"label": {"ca": "Al camp"}}, {"label": {"ca": "Al local"}}]', '{}');
insert into ids select 'regular', public.save_profile_field(
  null, (select s.id from public.profile_sections s
          where s.org_id = '93900000-0000-4000-8000-000000000000' order by s.sort_order limit 1),
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
  'a question goes on the fixed screen too, after the type, the text and the photo');
select is(
  (select sort_order from public.custom_form_screens where id = (select id from ids where key = 'second'))
    > (select sort_order from public.custom_form_screens where id = (select id from ids where key = 'fixed')),
  true, 'a new screen goes after the fixed screen');

set local role authenticated;
select pg_temp.as_user('93900000-0000-4000-8000-000000000001');
select throws_ok(
  format($$ select public.place_field(%L, 'custom_form', %L, false) $$,
         (select id from ids where key = 'regular'), (select id from ids where key = 'second')),
  '23514', 'the suggestions form asks its own questions only',
  'a field of the Fitxa is never asked on the suggestions form');
select throws_ok(
  format($$ select public.save_form_block(null, 'custom_form', %L, 'text', '{"ca": "Un text"}'::jsonb, null, null) $$,
         (select id from ids where key = 'second')),
  '23514', 'the suggestions form asks its own questions only',
  'the suggestions form holds no block');
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
  '23514', 'a screen of the suggestions form always shows', 'no screen of the form hides');
select throws_ok(
  format($$ select public.delete_builder_screen('custom_form', %L, array[%L]) $$,
         (select id from ids where key = 'fixed'), (select id from ids where key = 'fixed')),
  '23514', null::text, 'the fixed screen is never deleted');
select throws_ok(
  format($$ select public.publish_custom_form(%L, false, null) $$, (select id from ids where key = 'form')),
  '23514', null::text, 'the suggestions form is never published');
select throws_ok(
  format($$ select public.save_custom_form(%L, '{"ca": "Suggeriments"}', 'player', 'required_to_use_app', null, 'all', false, null) $$,
         (select id from ids where key = 'form')),
  '23514', null::text, 'its choices stay');
select lives_ok(
  format($$ select public.save_custom_form_screen(%L, %L, '{"ca": "El teu suggeriment"}', null, null) $$,
         (select id from ids where key = 'fixed'), (select id from ids where key = 'form')),
  'staff word the fixed screen');
reset role;

-- 2. Installed builds read the catalog as before ------------------------------------------------------------

select is(pg_temp.catalog('93900000-0000-4000-8000-000000000001', false)::text
            like '%' || (select id::text from ids where key = 'form') || '%',
          false, 'the team''s catalog an installed build reads never names the suggestions form');
select is(pg_temp.catalog('93900000-0000-4000-8000-000000000001', false)::text
            like '%' || (select id::text from ids where key = 'rating') || '%',
          false, 'nor its questions');
select is(pg_temp.catalog('93900000-0000-4000-8000-000000000001', false) ? 'feedback_form',
          false, 'nor a key it does not know');
select is(pg_temp.catalog('93900000-0000-4000-8000-000000000002', false)::text
            like '%' || (select id::text from ids where key = 'form') || '%',
          false, 'a player''s catalog never names it either');
select is(pg_temp.catalog('93900000-0000-4000-8000-000000000001', true) -> 'feedback_form' ->> 'id',
          (select id::text from ids where key = 'form'),
          'the dashboard reads the form apart');
select is(
  (select count(*)::integer from jsonb_array_elements(pg_temp.catalog('93900000-0000-4000-8000-000000000001', true) -> 'custom_forms') e
    where e ->> 'id' = (select id::text from ids where key = 'form')),
  0, 'its lists of forms never show it');
select is(
  (select count(*)::integer from jsonb_array_elements(pg_temp.catalog('93900000-0000-4000-8000-000000000001', true) -> 'custom_form_placements') e
    where e ->> 'field_id' in (select id::text from ids where key in ('rating', 'choice'))),
  2, 'the dashboard reads where each question is asked');

-- 4. Her phone reads the form and sends a suggestion with its answers --------------------------------------

set local role authenticated;
select pg_temp.as_user('93900000-0000-4000-8000-000000000002');
select results_eq(
  $$ select jsonb_array_length(f -> 'content' -> 'screens'), f -> 'content' -> 'screens' -> 0 ->> 'system_screen',
            jsonb_array_length(f -> 'content' -> 'placements')
       from public.my_feedback_form() f $$,
  $$ values (3, 'feedback_message', 2) $$,
  'her phone reads the form: the fixed screen first, and the questions');
select throws_ok(
  $$ select public.send_feedback_submission('idea', 'Una idea', null, '{}'::jsonb) $$,
  '23514', 'a required question has no answer', 'a required question needs an answer');
select throws_ok(
  format($$ select public.send_feedback_submission('idea', 'Una idea', null, %L::jsonb) $$,
         jsonb_build_object((select id::text from ids where key = 'rating'), 4,
                            (select id::text from ids where key = 'regular'), 'hola')),
  '22023', 'an answer to a question the suggestions form does not ask',
  'an answer to a question the form does not ask is refused');
select throws_ok(
  format($$ select public.send_feedback_submission('idea', 'Una idea', null, %L::jsonb) $$,
         jsonb_build_object((select id::text from ids where key = 'rating'), 9)),
  '23514', 'an answer does not fit its question', 'an answer that does not fit is refused');
insert into ids select 'sent', public.send_feedback_submission('idea', 'Una idea', null,
  jsonb_build_object((select id::text from ids where key = 'rating'), 4,
                     (select id::text from ids where key = 'choice'),
                     (select o.id::text from public.custom_question_options o
                       where o.question_id = (select id from ids where key = 'choice') order by o.sort_order limit 1)));
reset role;

select results_eq(
  $$ select type, public.decrypt_field(content_encrypted), answers_encrypted is not null
       from public.feedback_submissions where id = (select id from ids where key = 'sent') $$,
  $$ values ('idea', 'Una idea', true) $$,
  'the suggestion saves as before, with her answers beside it');
select is(
  (select jsonb_array_length(public.decrypt_field(answers_encrypted)::jsonb)
     from public.feedback_submissions where id = (select id from ids where key = 'sent')),
  2, 'every answer is kept, encrypted');
select is(
  (select count(*)::integer from public.custom_answers
    where question_id in (select id from ids where key in ('rating', 'choice'))),
  0, 'her answers never go on her record');

-- 5. An installed build's suggestion still saves -----------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('93900000-0000-4000-8000-000000000003');
insert into ids select 'old', public.create_feedback_submission('problem', 'Un problema', null);
select pg_temp.as_user('93900000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.my_feedback_form() $$, '42501', null::text, 'DENIAL: only a player reads it');
reset role;
select results_eq(
  $$ select type, answers_encrypted is null from public.feedback_submissions where id = (select id from ids where key = 'old') $$,
  $$ values ('problem', true) $$,
  'an installed build''s suggestion saves with no answers, even with a required question');

-- 6. The inbox reads her answers ----------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('93900000-0000-4000-8000-000000000001');
select is(
  (select a -> 'question' -> 'label' ->> 'ca'
     from public.list_staff_feedback_submissions(null, null) l
     cross join lateral jsonb_array_elements(l.answers) a
    where l.id = (select id from ids where key = 'sent') and a ->> 'field_id' = (select id::text from ids where key = 'rating')),
  'Com t''ho passes?', 'the inbox reads each answer with its question as she read it');
select is(
  (select l.answers from public.list_staff_feedback_submissions(null, null) l
    where l.id = (select id from ids where key = 'old')),
  '[]'::jsonb, 'a suggestion with no answers reads an empty list');
reset role;

select * from finish();
rollback;
