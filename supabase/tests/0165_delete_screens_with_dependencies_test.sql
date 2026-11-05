-- Deleting a screen and the screens that depend on it (RAPP-780).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. A dependent Onboarding screen, made on an answer of the document
--      screen, is deleted. The delete used to fail every time: its audit row
--      had no target, which the audit log requires.
--   2. A screen goes with the screens that depend on it, in one go.
--   3. A delete whose confirmation lists other screens than the database
--      finds is refused, so the admin sees why.
--   4. A screen of a custom form is deleted the same way, and the audit row
--      names its form.
--
-- Seed: admin ...001, organization ...000.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';

-- 1. A screen on the answer "no document" of the document screen -----------------------------------------

insert into ids values ('doc', public.save_intake_screen(null, '{"ca":"No en tinc"}'::jsonb, null, 'documentation'));
select public.save_screen_condition(
  (select id from ids where name = 'doc'),
  (select id from public.profile_fields
    where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = 'document_type'),
  array[(select o.id::text from public.custom_question_options o
           join public.profile_fields f on f.id = o.question_id
          where f.org_id = '5eed0000-0000-4000-8000-000000000000'
            and f.system_key = 'document_type' and o.key = 'passport')]);

select lives_ok(
  $$ select public.delete_builder_screen('onboarding', 'custom:' || (select id from ids where name = 'doc'),
                                         array['custom:' || (select id from ids where name = 'doc')]) $$,
  'a dependent screen of the document screen is deleted'
);
select ok(
  (select is_archived from public.intake_screens where id = (select id from ids where name = 'doc')),
  'the screen is archived'
);
select ok(
  not exists (select 1 from public.intake_flow_orders f
               where f.org_id = '5eed0000-0000-4000-8000-000000000000'
                 and 'custom:' || (select id from ids where name = 'doc') = any (f.step_order)),
  'and leaves the Onboarding order'
);
select is(
  (select a.target_type || ':' || a.target_id from public.audit_log a
    where a.action = 'intake.screen_delete'
      and a.changes -> 'screens' ? ('custom:' || (select id from ids where name = 'doc'))),
  'organization:5eed0000-0000-4000-8000-000000000000',
  'the audit row names the organization'
);

-- 2. A screen with its follow-up --------------------------------------------------------------------------

insert into ids values
  ('s1', public.save_intake_screen(null, '{"ca":"Primer"}'::jsonb, null, 'season')),
  ('s2', public.save_intake_screen(null, '{"ca":"Segon"}'::jsonb, null, 'season'));
insert into ids values ('f1', public.save_profile_field(
  null, (select id from public.profile_sections
          where org_id = '5eed0000-0000-4000-8000-000000000000' and key = 'support'),
  'yes_no', '{"ca":"Pregunta"}'::jsonb, null, 'normal', false));
select public.place_field((select id from ids where name = 'f1'), 'onboarding',
                          (select id::text from ids where name = 's1'));
select public.save_screen_condition((select id from ids where name = 's2'),
                                    (select id from ids where name = 'f1'), array['yes']);

-- 3. A confirmation that missed the follow-up --------------------------------------------------------------

select throws_ok(
  $$ select public.delete_builder_screen('onboarding', 'custom:' || (select id from ids where name = 's1'),
                                         array['custom:' || (select id from ids where name = 's1')]) $$,
  '23514', 'the screen dependencies changed; reopen the confirmation',
  'a confirmation that misses a dependent screen is refused'
);
select ok(
  not (select is_archived from public.intake_screens where id = (select id from ids where name = 's1')),
  'and deletes nothing'
);
select lives_ok(
  $$ select public.delete_builder_screen('onboarding', 'custom:' || (select id from ids where name = 's1'),
                                         array['custom:' || (select id from ids where name = 's1'),
                                               'custom:' || (select id from ids where name = 's2')]) $$,
  'a screen is deleted with the screen that depends on it'
);
select is(
  (select count(*)::integer from public.intake_screens
    where id in (select id from ids where name in ('s1', 's2')) and is_archived),
  2,
  'both screens are archived'
);
select ok(
  not exists (select 1 from public.field_placements
               where field_id = (select id from ids where name = 'f1') and surface = 'onboarding'),
  'their questions leave Onboarding'
);

-- 4. A custom form's screen -----------------------------------------------------------------------------

insert into ids values ('form', public.create_custom_form('{"ca":"Material"}'::jsonb, 'player', 'optional', null::date, 'all', false));
insert into ids values
  ('c1', public.save_custom_form_screen(null, (select id from ids where name = 'form'), '{"ca":"U"}', null)),
  ('c2', public.save_custom_form_screen(null, (select id from ids where name = 'form'), '{"ca":"Dos"}', null));
select lives_ok(
  $$ select public.delete_builder_screen('custom_form', (select id::text from ids where name = 'c2'),
                                         array[(select id::text from ids where name = 'c2')]) $$,
  'a custom form''s screen is deleted'
);
select ok(
  (select is_archived from public.custom_form_screens where id = (select id from ids where name = 'c2')),
  'the form''s screen is archived'
);
select is(
  (select a.target_type || ':' || a.target_id from public.audit_log a
    where a.action = 'intake.screen_delete' and a.changes ->> 'surface' = 'custom_form'),
  'custom_form:' || (select id from ids where name = 'form'),
  'the audit row names the form'
);

select * from finish();
rollback;
