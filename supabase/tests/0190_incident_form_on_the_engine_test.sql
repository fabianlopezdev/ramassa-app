-- The incident report on the form engine (RAPP-973).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Every organization has the incident form, a form of the engine filled
--      in by the player, never published, with its fixed screen first. A new
--      organization gets it beside the other two forms she sends when she wants.
--   2. `incidents.manage` exists after `mentoring.manage`, is a Staff and an
--      Admin default, and every team member who read mentoring requests before
--      it reads incident reports now.
--   3. The design role adds questions to the form; installed phone builds never
--      read it in `intake_catalog()`; the dashboard reads it apart.
--   4. Her phone reads the form, and a report saves encrypted with her answers.
--      A day in the future, an empty "what" or "where", a required question
--      left empty and an eleventh report in a day are refused.
--   5. An anonymous report never names her to the team: no id, no name in the
--      queue, and the bell names nobody. A named report shows her name.
--   6. Only incidents.manage reads and closes a report: the design role and a
--      team member with mentoring.manage alone read none, and nobody reads the
--      table itself.
--   7. A new report rings the bell and queues a push for incidents.manage only,
--      with no content.
--   8. The erasure registry purges her reports with her account.
--
-- The test builds its own organization: an admin ...001, a player ...002, a
-- second player ...003, a designer ...004 (onboarding.design only), a team
-- member ...005 with incidents.manage only and one ...006 with mentoring.manage only.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(46);

-- 2. Before this test adds anyone: whoever read mentoring requests reads incident reports.
select is(
  (select count(*)::integer from public.team_member_permissions m
    where m.permission_code = 'mentoring.manage'
      and not exists (select 1 from public.team_member_permissions i
                       where i.profile_id = m.profile_id and i.permission_code = 'incidents.manage')),
  0, 'every team member who reads mentoring requests reads incident reports');
select is(
  (select count(*)::integer from public.permission_preset_permissions m
    where m.permission_code = 'mentoring.manage'
      and not exists (select 1 from public.permission_preset_permissions i
                       where i.preset_id = m.preset_id and i.permission_code = 'incidents.manage')),
  0, 'and every preset that holds mentoring.manage holds incidents.manage');
select results_eq(
  $$ select area, sort_order from public.permissions where code = 'incidents.manage' $$,
  $$ values ('community', (select sort_order + 1 from public.permissions where code = 'mentoring.manage')) $$,
  'incidents.manage is a community permission, right after mentoring.manage');
select results_eq(
  $$ select builtin_key from public.permission_preset_defaults
      where permission_code = 'incidents.manage' order by builtin_key $$,
  $$ values ('admin'), ('staff') $$,
  'Staff and Admin hold it by default, Coach and the design role do not');

insert into public.organizations (id, name, slug)
values ('97300000-0000-4000-8000-000000000000', 'Proves 973', 'proves-973');
insert into auth.users (id, email) values
  ('97300000-0000-4000-8000-000000000001', 'admin-973@example.test'),
  ('97300000-0000-4000-8000-000000000002', 'player-973@example.test'),
  ('97300000-0000-4000-8000-000000000003', 'player2-973@example.test'),
  ('97300000-0000-4000-8000-000000000004', 'designer-973@example.test'),
  ('97300000-0000-4000-8000-000000000005', 'incidents-973@example.test'),
  ('97300000-0000-4000-8000-000000000006', 'mentoring-973@example.test');
insert into public.profiles (id, org_id, role, first_name, last_name, terms_accepted_at)
values
  ('97300000-0000-4000-8000-000000000001', '97300000-0000-4000-8000-000000000000', 'admin', 'Admin', 'Prova', now()),
  ('97300000-0000-4000-8000-000000000002', '97300000-0000-4000-8000-000000000000', 'player', 'Jugadora', 'Prova', now()),
  ('97300000-0000-4000-8000-000000000003', '97300000-0000-4000-8000-000000000000', 'player', 'Anonima', 'Secreta', now()),
  ('97300000-0000-4000-8000-000000000004', '97300000-0000-4000-8000-000000000000', 'staff', 'Dissenyadora', 'Prova', now()),
  ('97300000-0000-4000-8000-000000000005', '97300000-0000-4000-8000-000000000000', 'staff', 'Incidents', 'Prova', now()),
  ('97300000-0000-4000-8000-000000000006', '97300000-0000-4000-8000-000000000000', 'staff', 'Mentora', 'Prova', now())
on conflict (id) do update set org_id = excluded.org_id, role = excluded.role;
delete from public.team_member_permissions
 where profile_id in ('97300000-0000-4000-8000-000000000004', '97300000-0000-4000-8000-000000000005',
                      '97300000-0000-4000-8000-000000000006');
insert into public.team_member_permissions (org_id, profile_id, permission_code) values
  ('97300000-0000-4000-8000-000000000000', '97300000-0000-4000-8000-000000000004', 'onboarding.design'),
  ('97300000-0000-4000-8000-000000000000', '97300000-0000-4000-8000-000000000005', 'incidents.manage'),
  ('97300000-0000-4000-8000-000000000000', '97300000-0000-4000-8000-000000000006', 'mentoring.manage');
insert into public.push_tokens (user_id, token, platform, device_id) values
  ('97300000-0000-4000-8000-000000000005', 'ExponentPushToken[incidents-973]', 'ios', 'device-973-5'),
  ('97300000-0000-4000-8000-000000000006', 'ExponentPushToken[mentoring-973]', 'ios', 'device-973-6'),
  ('97300000-0000-4000-8000-000000000002', 'ExponentPushToken[player-973]', 'ios', 'device-973-2');
update public.profiles set push_notifications_enabled = true
 where org_id = '97300000-0000-4000-8000-000000000000';

create temporary table ids (key text primary key, id uuid) on commit drop;
grant all on ids to authenticated;
insert into ids select 'form', f.id from public.custom_forms f
 where f.org_id = '97300000-0000-4000-8000-000000000000' and f.system_key = 'incident';
insert into ids select 'fixed', s.id from public.custom_form_screens s
 where s.form_id = (select id from ids where key = 'form') and s.system_screen = 'incident_report';

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

-- 1. Every organization has the incident form ------------------------------------------------------------

select is((select count(*)::integer from ids where key in ('form', 'fixed')), 2,
          'a new organization gets the incident form with its fixed screen');
select is((select count(*)::integer from public.custom_forms
            where org_id = '97300000-0000-4000-8000-000000000000'
              and system_key in ('feedback', 'mentoring', 'incident')),
          3, 'beside the suggestions form and the mentoring form');
select results_eq(
  $$ select kind, filled_by, mandatory, published_at is null from public.custom_forms
      where id = (select id from ids where key = 'form') $$,
  $$ values ('other', 'player', 'optional', true) $$,
  'it is filled in by the player, optional and never published');
select is(
  (select count(*)::integer from public.organizations o
    where not exists (select 1 from public.custom_forms f where f.org_id = o.id and f.system_key = 'incident')),
  0, 'every organization has it');

-- 3. The design role builds it; installed builds never read it ------------------------------------------------

set local role authenticated;
select pg_temp.as_user('97300000-0000-4000-8000-000000000004');
insert into ids select 'second', public.save_custom_form_screen(
  null, (select id from ids where key = 'form'), '{"ca": "Més detalls"}', null, null);
insert into ids select 'who', public.save_survey_question(
  null, (select id from ids where key = 'second'), 'short_text', '{"ca": "Qui hi era?"}', null, true, '[]', '{}');
insert into ids select 'hurt', public.save_survey_question(
  null, (select id from ids where key = 'fixed'), 'yes_no', '{"ca": "Algú ha pres mal?"}', null, false, '[]', '{}');
select throws_ok(
  format($$ select public.set_screen_hidden(%L, true) $$, (select id from ids where key = 'fixed')),
  '23514', 'a screen of the incident form always shows', 'no screen of the form hides');
select throws_ok(
  format($$ select public.publish_custom_form(%L, false, null) $$, (select id from ids where key = 'form')),
  '23514', null::text, 'the incident form is never published');
reset role;

select results_eq(
  $$ select kind, survey_form_id, section_id is null from public.profile_fields
      where id = (select id from ids where key = 'who') $$,
  $$ values ('survey', (select id from ids where key = 'form'), true) $$,
  'a question of the form is its own, in no section');
select is(pg_temp.catalog('97300000-0000-4000-8000-000000000001', false)::text
            like '%' || (select id::text from ids where key = 'form') || '%',
          false, 'the team''s catalog an installed build reads never names the incident form');
select is(pg_temp.catalog('97300000-0000-4000-8000-000000000001', false) ? 'incident_form',
          false, 'nor a key it does not know');
select is(pg_temp.catalog('97300000-0000-4000-8000-000000000002', false)::text
            like '%' || (select id::text from ids where key = 'who') || '%',
          false, 'a player''s catalog never names its questions');
select is(pg_temp.catalog('97300000-0000-4000-8000-000000000004', true) -> 'incident_form' ->> 'id',
          (select id::text from ids where key = 'form'),
          'the dashboard reads the form apart');
select is(
  (select count(*)::integer
     from jsonb_array_elements(pg_temp.catalog('97300000-0000-4000-8000-000000000004', true) -> 'custom_forms') e
    where e ->> 'system_key' = 'incident'),
  0, 'its lists of forms never show it');

-- 4. Her phone reads the form and sends a report ----------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('97300000-0000-4000-8000-000000000002');
select results_eq(
  $$ select f -> 'content' -> 'screens' -> 0 ->> 'system_screen', jsonb_array_length(f -> 'content' -> 'placements')
       from public.my_incident_form() f $$,
  $$ values ('incident_report', 2) $$,
  'her phone reads the form: the fixed screen first, and the questions');
select throws_ok(
  format($$ select public.send_incident_report('Em van insultar', current_date + 2, 'Al camp', false, %L::jsonb) $$,
         jsonb_build_object((select id::text from ids where key = 'who'), 'Una noia')),
  '23514', 'invalid incident report', 'a day in the future is refused');
select throws_ok(
  format($$ select public.send_incident_report('   ', current_date, 'Al camp', false, %L::jsonb) $$,
         jsonb_build_object((select id::text from ids where key = 'who'), 'Una noia')),
  '23514', 'invalid incident report', 'what happened is needed');
select throws_ok(
  format($$ select public.send_incident_report('Em van insultar', current_date, '', false, %L::jsonb) $$,
         jsonb_build_object((select id::text from ids where key = 'who'), 'Una noia')),
  '23514', 'invalid incident report', 'where it happened is needed');
select throws_ok(
  $$ select public.send_incident_report('Em van insultar', current_date, 'Al camp', false, '{}'::jsonb) $$,
  '23514', 'a required question has no answer', 'a required question needs an answer');
insert into ids select 'named', public.send_incident_report(
  'Em van insultar', current_date - 1, 'Al camp', false,
  jsonb_build_object((select id::text from ids where key = 'who'), 'Una noia de l''altre equip',
                     (select id::text from ids where key = 'hurt'), 'no'));
select pg_temp.as_user('97300000-0000-4000-8000-000000000003');
insert into ids select 'anonymous', public.send_incident_report(
  'Un entrenador em va cridar', current_date, 'Al vestidor', true,
  jsonb_build_object((select id::text from ids where key = 'who'), 'Un entrenador'));
select results_eq(
  $$ select status, is_anonymous from public.list_own_incident_reports() $$,
  $$ values ('open', true) $$,
  'she lists her own report, and only hers');
select is((select count(*)::integer from public.list_staff_incident_reports()), 0,
          'DENIAL: a player never reads the team''s queue');
reset role;

select results_eq(
  $$ select public.decrypt_field(what_encrypted), happened_on, public.decrypt_field(where_encrypted),
            is_anonymous, answers_encrypted is not null
       from public.incident_reports where id = (select id from ids where key = 'named') $$,
  $$ values ('Em van insultar', current_date - 1, 'Al camp', false, true) $$,
  'the report saves encrypted, with her answers beside it');
select is(
  (select count(*)::integer from public.custom_answers
    where question_id in (select id from ids where key in ('who', 'hurt'))),
  0, 'her answers never go on her record');
select is(
  (select player_id from public.incident_reports where id = (select id from ids where key = 'anonymous')),
  '97300000-0000-4000-8000-000000000003'::uuid,
  'an anonymous report keeps her id on the row, for her account and the sending limit');

-- 5 and 6. The team's queue -----------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('97300000-0000-4000-8000-000000000005');
select results_eq(
  $$ select is_anonymous, player_id, player_first_name is not null, what, where_text
       from public.list_staff_incident_reports() where id = (select id from ids where key = 'named') $$,
  $$ values (false, '97300000-0000-4000-8000-000000000002'::uuid, true, 'Em van insultar', 'Al camp') $$,
  'a named report shows who sent it, as the mentoring queue shows her');
select results_eq(
  $$ select is_anonymous, player_id, player_first_name, player_last_name, what
       from public.list_staff_incident_reports() where id = (select id from ids where key = 'anonymous') $$,
  $$ values (true, null::uuid, null::text, null::text, 'Un entrenador em va cridar') $$,
  'an anonymous report names nobody: no id, no name');
select is(
  (select bool_or(to_jsonb(l)::text like '%97300000-0000-4000-8000-000000000003%'
                  or to_jsonb(l)::text like '%Anonima%' or to_jsonb(l)::text like '%Secreta%')
     from public.list_staff_incident_reports() l),
  false, 'nothing in the queue points to the anonymous sender');
select is(
  (select a -> 'question' -> 'label' ->> 'ca'
     from public.list_staff_incident_reports() l
     cross join lateral jsonb_array_elements(l.answers) a
    where l.id = (select id from ids where key = 'named') and a ->> 'field_id' = (select id::text from ids where key = 'who')),
  'Qui hi era?', 'the queue reads each answer with its question as she read it');
select results_eq(
  $$ select event, name, path from public.list_staff_notifications(30) where event = 'incident_report' order by created_at $$,
  $$ values ('incident_report', null::text, '/incidents'), ('incident_report', null::text, '/incidents') $$,
  'the bell rings for each report and names nobody');
select lives_ok(
  format($$ select public.set_incident_report_status(%L, 'closed') $$, (select id from ids where key = 'named')),
  'incidents.manage closes a report');
select throws_ok(
  $$ select count(*) from public.incident_reports $$, '42501', null::text,
  'DENIAL: even incidents.manage reads the table only through its functions');

select pg_temp.as_user('97300000-0000-4000-8000-000000000006');
select is((select count(*)::integer from public.list_staff_incident_reports()), 0,
          'DENIAL: mentoring.manage alone reads no report');
select throws_ok(
  format($$ select public.set_incident_report_status(%L, 'open') $$, (select id from ids where key = 'named')),
  '42501', null::text, 'DENIAL: nor changes one');
select is((select count(*)::integer from public.list_staff_notifications(30) where event = 'incident_report'), 0,
          'DENIAL: nor hears of one');
select pg_temp.as_user('97300000-0000-4000-8000-000000000004');
select is((select count(*)::integer from public.list_staff_incident_reports()), 0,
          'DENIAL: the design role, who builds the form, reads no report');
select throws_ok(
  $$ select public.decrypt_field(what_encrypted) from public.incident_reports $$,
  '42501', null::text, 'DENIAL: nobody decrypts a report outside the queue');
reset role;

select results_eq(
  $$ select status, closed_at is not null from public.incident_reports where id = (select id from ids where key = 'named') $$,
  $$ values ('closed', true) $$,
  'the closed report keeps when it was closed');

-- 7. The push: incidents.manage only, no content ---------------------------------------------------------------

select is(
  (select count(*)::integer from public.push_publications
    where content_type = 'incident_report' and content_id in (select id from ids where key in ('named', 'anonymous'))
      and recipient_id is null),
  2, 'each report queues one push');
select results_eq(
  $$ select distinct d.recipient_id from public.push_deliveries d
       join public.push_publications p on p.id = d.publication_id
      where p.content_type = 'incident_report' and p.org_id = '97300000-0000-4000-8000-000000000000' $$,
  $$ values ('97300000-0000-4000-8000-000000000005'::uuid) $$,
  'the push reaches incidents.manage only: never the player, never mentoring.manage alone');

-- 4. The sending limit ------------------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('97300000-0000-4000-8000-000000000002');
select lives_ok(
  format($$ select public.send_incident_report('Una altra vegada', current_date, 'Al camp', true, %L::jsonb)
              from generate_series(1, 9) $$,
         jsonb_build_object((select id::text from ids where key = 'who'), 'Una noia')),
  'ten reports in a day are taken');
select throws_ok(
  format($$ select public.send_incident_report('Una més', current_date, 'Al camp', true, %L::jsonb) $$,
         jsonb_build_object((select id::text from ids where key = 'who'), 'Una noia')),
  '23514', 'too many incident reports today', 'the eleventh in a day is refused');
select pg_temp.as_user('97300000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.my_incident_form() $$, '42501', null::text, 'DENIAL: only a player reads the form');
reset role;

-- 8. The erasure registry ---------------------------------------------------------------------------------------

select results_eq(
  $$ select participant_column, disposition from public.personal_data_disposition() where table_name = 'incident_reports' $$,
  $$ values ('player_id', 'purge') $$,
  'her reports are purged with her account');
delete from public.profiles where id = '97300000-0000-4000-8000-000000000003';
select is((select count(*)::integer from public.incident_reports
            where id = (select id from ids where key = 'anonymous')), 0,
          'an anonymous report goes with her account');

select * from finish();
rollback;
