-- Screens that depend on an answer of another screen (RAPP-715).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. A screen depends on a choice question asked on an earlier screen of
--      the same form: never its own question, a later screen's, or one of its
--      own follow-ups' (a loop). Placing the question later is refused too.
--   2. Nesting has no limit: each level opens only when every answer above
--      it matches, and a hidden screen hides its follow-ups.
--   3. The ordering rule: a follow-up sits right after its parent, and the
--      stored order says so for older builds. A form keeps its follow-ups
--      after their parents when it is reordered.
--   4. A required field on a screen that does not open for her is not
--      required. The catalog, a form's published version and the setup file
--      carry the condition.
--   5. The document follow-up is one screen per answer.
--
-- Seed: admin ...001, player ...011, the seeded Onboarding screens ...8044-1..3.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(34);

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';

-- Four screens after the season screens, a yes/no question on each of the first three.
insert into ids values
  ('s1', public.save_intake_screen(null, '{"ca":"Primer"}'::jsonb, null, 'season')),
  ('s2', public.save_intake_screen(null, '{"ca":"Segon"}'::jsonb, null, 'season')),
  ('s3', public.save_intake_screen(null, '{"ca":"Tercer"}'::jsonb, null, 'season')),
  ('s4', public.save_intake_screen(null, '{"ca":"Quart"}'::jsonb, null, 'season')),
  ('s5', public.save_intake_screen(null, '{"ca":"Cinquè"}'::jsonb, null, 'season')),
  ('s6', public.save_intake_screen(null, '{"ca":"Sisè"}'::jsonb, null, 'season'));
insert into ids
select 'f' || n, public.save_profile_field(
  null, (select id from public.profile_sections
          where org_id = '5eed0000-0000-4000-8000-000000000000' and key = 'support'),
  'yes_no', jsonb_build_object('ca', 'Pregunta ' || n), null, 'normal', false)
  from generate_series(1, 3) n;
insert into ids values ('f5', public.save_profile_field(
  null, (select id from public.profile_sections
          where org_id = '5eed0000-0000-4000-8000-000000000000' and key = 'support'),
  'short_text', '{"ca":"Detall"}'::jsonb, null, 'normal', false));
select public.place_field((select id from ids where name = 'f' || n), 'onboarding',
                          (select id::text from ids where name = 's' || n))
  from generate_series(1, 3) n;

-- 1. Where the question lives ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.save_screen_condition((select id from ids where name = 's2'),
                                         (select id from ids where name = 'f1'), array['yes']) $$,
  'a screen depends on a question of an earlier screen'
);
select lives_ok(
  $$ select public.save_screen_condition((select id from ids where name = 's3'),
                                         (select id from ids where name = 'f2'), array['yes']) $$,
  'a follow-up has its own follow-up'
);
select lives_ok(
  $$ select public.save_screen_condition((select id from ids where name = 's4'),
                                         (select id from ids where name = 'f3'), array['yes']) $$,
  'and that one its own: no depth limit'
);
select throws_ok(
  $$ select public.save_screen_condition('5eed0000-0000-4000-8044-000000000001',
                                         (select id from ids where name = 'f1'), array['yes']) $$,
  '23514', 'the question is asked on an earlier screen of the same form',
  'a screen never depends on a later screen'
);
select throws_ok(
  $$ select public.save_screen_condition((select id from ids where name = 's1'),
                                         (select id from ids where name = 'f3'), array['yes']) $$,
  '23514', 'that condition would make a loop',
  'a screen never depends on its own follow-up'
);
select throws_ok(
  $$ select public.save_screen_condition((select id from ids where name = 's2'),
                                         (select id from ids where name = 'f2'), array['yes']) $$,
  '23514', 'a screen cannot depend on a question asked on it',
  'a screen never depends on its own question'
);
select throws_ok(
  $$ select public.save_screen_condition((select id from ids where name = 's5'),
                                         '5eed0000-0000-4000-8045-000000000003', array['yes']) $$,
  '23514', 'a screen depends on the answer to a choice question',
  'only a choice question opens a screen'
);
select throws_ok(
  $$ select public.save_screen_condition((select id from ids where name = 's5'),
                                         (select id from ids where name = 'f1'), array['maybe']) $$,
  '23514', 'an answer of this question',
  'the answers are the question''s own'
);
select throws_ok(
  $$ select public.save_screen_condition((select id from ids where name = 's5'),
                                         (select id from ids where name = 'f1'), array[]::text[]) $$,
  '23514', 'a screen depends on at least one answer',
  'at least one answer opens it'
);

-- The app's own choice field: her document, asked on the document screen.
select lives_ok(
  $$ select public.save_screen_condition(
       (select id from ids where name = 's5'),
       (select id from public.profile_fields
         where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = 'document_type'),
       array[(select o.id::text from public.custom_question_options o
                join public.profile_fields f on f.id = o.question_id
               where f.org_id = '5eed0000-0000-4000-8000-000000000000'
                 and f.system_key = 'document_type' and o.key = 'passport')]) $$,
  'a screen depends on an app question, such as her document'
);

-- 2. The ordering rule ----------------------------------------------------------------------------------

reset role;
create temporary table steps on commit drop as
select private.onboarding_step_order('5eed0000-0000-4000-8000-000000000000') as o;
select ok(
  (select array_position(o, 'custom:' || (select id from ids where name = 's2'))
            = array_position(o, 'custom:' || (select id from ids where name = 's1')) + 1
      and array_position(o, 'custom:' || (select id from ids where name = 's3'))
            = array_position(o, 'custom:' || (select id from ids where name = 's2')) + 1
      and array_position(o, 'custom:' || (select id from ids where name = 's4'))
            = array_position(o, 'custom:' || (select id from ids where name = 's3')) + 1
     from steps),
  'each follow-up sits right after its parent, depth first'
);
select is(
  (select o[array_position(o, 'documentation') + 1] from steps),
  'custom:' || (select id from ids where name = 's5'),
  'a follow-up of an app screen sits right after it'
);
select is(
  (select step_order from public.intake_flow_orders where org_id = '5eed0000-0000-4000-8000-000000000000'),
  (select o from steps),
  'the stored order is the ordering rule: older builds walk it'
);
select is(
  (select after_screen from public.intake_screens where id = (select id from ids where name = 's5')),
  'documentation',
  'and the follow-up is anchored to its parent''s step'
);

-- Placing the question on a later screen, or on a follow-up, is refused.
insert into ids select 'f1-placement', p.id from public.field_placements p
 where p.field_id = (select id from ids where name = 'f1') and p.surface = 'onboarding';
set local role authenticated;
select public.remove_placement((select id from ids where name = 'f1-placement'));
select throws_ok(
  $$ select public.place_field((select id from ids where name = 'f1'), 'onboarding',
                               (select id::text from ids where name = 's3')) $$,
  '23514', 'that condition would make a loop',
  'the question never moves onto a follow-up of the screen it opens'
);
select throws_ok(
  $$ select public.place_field((select id from ids where name = 'f1'), 'onboarding',
                               (select id::text from ids where name = 's6')) $$,
  '23514', 'the question is asked on an earlier screen of the same form',
  'nor onto a screen after it'
);
select lives_ok(
  $$ select public.place_field((select id from ids where name = 'f1'), 'onboarding',
                               (select id::text from ids where name = 's1')) $$,
  'back on its own screen'
);
select public.place_field((select id from ids where name = 'f5'), 'onboarding',
                          (select id::text from ids where name = 's4'), true);

-- 3. Her answers open each level ------------------------------------------------------------------------

reset role;
insert into public.custom_answers (profile_id, question_id, org_id, value, source)
select '5eed0000-0000-4000-8000-000000000011', id, '5eed0000-0000-4000-8000-000000000000', '"yes"', 'staff'
  from ids where name in ('f1', 'f2', 'f3');
select ok(
  private.screen_opens_for('5eed0000-0000-4000-8000-000000000011', '5eed0000-0000-4000-8000-000000000000',
                           'onboarding', (select id::text from ids where name = 's4')),
  'the third level opens when every answer above it matches'
);
select ok(
  (select id from ids where name = 'f5') = any (
    private.missing_required_custom_answers('5eed0000-0000-4000-8000-000000000011', 'wizard')),
  'a required field on an open screen needs her answer'
);
update public.custom_answers set value = '"no"'
 where profile_id = '5eed0000-0000-4000-8000-000000000011' and question_id = (select id from ids where name = 'f1');
select ok(
  not private.screen_opens_for('5eed0000-0000-4000-8000-000000000011', '5eed0000-0000-4000-8000-000000000000',
                               'onboarding', (select id::text from ids where name = 's4')),
  'one answer above that does not match closes every level below it'
);
select ok(
  not ((select id from ids where name = 'f5') = any (
    private.missing_required_custom_answers('5eed0000-0000-4000-8000-000000000011', 'wizard'))),
  'a required field on a screen that does not open is not required'
);

-- A hidden screen hides its follow-ups.
set local role authenticated;
select public.set_screen_hidden((select id from ids where name = 's1'), true);
reset role;
select ok(
  private.screen_is_hidden('5eed0000-0000-4000-8000-000000000000', 'onboarding',
                           (select id::text from ids where name = 's3')),
  'a hidden screen hides its follow-ups, at any depth'
);
set local role authenticated;
select public.set_screen_hidden((select id from ids where name = 's1'), false);

-- 4. Where the condition travels ------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(
  (select s -> 'show_when_values' from jsonb_array_elements(public.intake_catalog() -> 'screens') s
    where s ->> 'id' = (select id::text from ids where name = 's2')),
  '["yes"]'::jsonb,
  'her catalog carries the answer that opens a screen'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select is(
  (select s ->> 'show_when_field_id' from jsonb_array_elements(public.export_onboarding_setup() -> 'screens') s
    where s ->> 'id' = (select id::text from ids where name = 's2')),
  (select id::text from ids where name = 'f1'),
  'the setup file carries the condition'
);
select public.save_screen_condition((select id from ids where name = 's4'), null, null);
select ok(
  (select show_when_field_id is null and show_when_values is null
     from public.intake_screens where id = (select id from ids where name = 's4')),
  'a condition is removed: the screen always shows again'
);

-- A form: the same rule.
insert into ids values ('form', public.create_custom_form('{"ca":"Material"}'::jsonb, 'player', 'optional', null::date, 'all', false));
insert into ids values
  ('c1', public.save_custom_form_screen(null, (select id from ids where name = 'form'), '{"ca":"U"}', null)),
  ('c2', public.save_custom_form_screen(null, (select id from ids where name = 'form'), '{"ca":"Dos"}', null)),
  ('c3', public.save_custom_form_screen(null, (select id from ids where name = 'form'), '{"ca":"Tres"}', null));
select public.place_field((select id from ids where name = 'f2'), 'custom_form',
                          (select id::text from ids where name = 'c1'));
select throws_ok(
  $$ select public.save_screen_condition((select id from ids where name = 'c3'),
                                         (select id from ids where name = 'f3'), array['yes']) $$,
  '23514', 'the question is asked on an earlier screen of the same form',
  'a form''s screen depends on a question of that form'
);
select public.save_screen_condition((select id from ids where name = 'c3'),
                                    (select id from ids where name = 'f2'), array['yes']);
select is(
  array(select id from public.custom_form_screens where form_id = (select id from ids where name = 'form')
         order by sort_order),
  array[(select id from ids where name = 'c1'), (select id from ids where name = 'c3'),
        (select id from ids where name = 'c2')],
  'a form''s follow-up moves right after its parent'
);
select public.reorder_custom_form_screens((select id from ids where name = 'form'),
  array[(select id from ids where name = 'c2'), (select id from ids where name = 'c1')]);
select is(
  array(select id from public.custom_form_screens where form_id = (select id from ids where name = 'form')
         order by sort_order),
  array[(select id from ids where name = 'c2'), (select id from ids where name = 'c1'),
        (select id from ids where name = 'c3')],
  'and moves with it when the form is reordered'
);
reset role;
select is(
  (select s -> 'show_when_values'
     from jsonb_array_elements(private.custom_form_content((select id from ids where name = 'form')) -> 'screens') s
    where s ->> 'id' = (select id::text from ids where name = 'c3')),
  '["yes"]'::jsonb,
  'a published version carries the condition'
);
update public.custom_form_screens set is_hidden = true where id = (select id from ids where name = 'c1');
select ok(
  not exists (
    select 1 from jsonb_array_elements(private.custom_form_content((select id from ids where name = 'form')) -> 'screens') s
     where s ->> 'id' = (select id::text from ids where name = 'c3')),
  'a hidden screen''s follow-up is left out of the published version'
);
select ok(
  private.answer_matches('["a", "b"]', array['b']) and not private.answer_matches('["a"]', array['b']),
  'a multiple choice opens a screen when one of its answers is ticked'
);

-- 5. The document follow-up, one screen per answer ------------------------------------------------------

select ok(
  private.builtin_screen_text_fields('documentation-details') is null
    and private.builtin_screen_text_fields('documentation-nie') is not null
    and private.builtin_screen_text_fields('documentation-passport') is not null
    and private.builtin_screen_text_fields('documentation-other') is not null,
  'the document follow-up is three screens: NIE, passport and another document'
);
select is(
  (select count(*)::integer from public.intake_builtin_screens where screen = 'documentation-details'),
  0, 'no wording is left on the old single screen'
);
set local role authenticated;
select lives_ok(
  $$ select public.save_builtin_screen('documentation-passport', '{"title": {"ca": "El teu passaport"}}', false) $$,
  'each of the three has its own wording'
);

select * from finish();
rollback;
