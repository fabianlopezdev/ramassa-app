-- Questions added to the app's own screens (RAPP-642).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. An app screen staff may move gets one holder for its added questions,
--      made on first use and found again after; the summary, the terms and
--      the authorization never get one, and the table refuses a second live
--      holder or a holder of an end screen.
--   2. A question of any type is saved, reordered and made required on a
--      holder with the functions staff screens use.
--   3. The catalog carries the holder with its app screen and its questions.
--   4. A holder is never a step: the flow order refuses `custom:<holder id>`.
--   5. A required added question keeps its app screen shown.
--   6. The export carries `builtin_screen`.
--
-- Seed: admin ...001 of organization ...000.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(16);

create temp table run (label text primary key, id uuid) on commit drop;
grant all on run to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

-- 1. The holder --------------------------------------------------------------------------------------------

insert into run (label, id)
values ('holder', public.ensure_builtin_screen_holder(
  'participation-support', '{"ca": "Suport per participar", "es": "Apoyo para participar"}'::jsonb));

select isnt((select id from run where label = 'holder'), null, 'an app screen gets a holder for its added questions');
select is(
  public.ensure_builtin_screen_holder('participation-support', '{"ca": "Un altre títol"}'::jsonb),
  (select id from run where label = 'holder'),
  'the same holder is found again'
);
select throws_ok(
  $$ select public.ensure_builtin_screen_holder('summary', '{"ca": "Resum"}'::jsonb) $$,
  '23514', 'questions are added to an app screen staff may move',
  'the summary never gets added questions'
);
select throws_ok(
  $$ select public.ensure_builtin_screen_holder('authorization', '{"ca": "Autorització"}'::jsonb) $$,
  '23514', 'questions are added to an app screen staff may move',
  'nor does the season authorization'
);
select throws_ok(
  $$ select public.ensure_builtin_screen_holder('equipment', '{"es": "Tallas"}'::jsonb) $$,
  '23514', 'a screen needs a title in Catalan',
  'a holder is titled in Catalan'
);

-- 2. Questions on it ---------------------------------------------------------------------------------------

insert into run (label, id)
select 'text', public.save_custom_question(
  null, (select id from run where label = 'holder'), 'short_text', '{"ca": "Qui t''acompanya?"}'::jsonb,
  null, 'personal', array['wizard']);
insert into run (label, id)
select 'choice', public.save_custom_question(
  null, (select id from run where label = 'holder'), 'single_choice', '{"ca": "Horari"}'::jsonb,
  null, 'normal', array['wizard', 'season'],
  '[{"label": {"ca": "Matí"}}, {"label": {"ca": "Tarda"}}]'::jsonb);

select is(
  (select count(*)::integer from public.custom_questions
    where screen_id = (select id from run where label = 'holder') and not is_archived),
  2,
  'questions of any type are saved on the holder'
);

select lives_ok(
  $$ select public.reorder_custom_questions(
       (select id from run where label = 'holder'),
       array[(select id from run where label = 'choice'), (select id from run where label = 'text')]) $$,
  'and reordered'
);
select is(
  (select sort_order from public.custom_questions where id = (select id from run where label = 'choice')),
  0,
  'in the order staff gave'
);

-- 3. The catalog -------------------------------------------------------------------------------------------

select is(
  (select s ->> 'builtin_screen'
     from jsonb_array_elements(public.intake_catalog() -> 'screens') s
    where (s ->> 'id')::uuid = (select id from run where label = 'holder')),
  'participation-support',
  'the catalog names the app screen the holder belongs to'
);
select is(
  (select jsonb_array_length(s -> 'questions')
     from jsonb_array_elements(public.intake_catalog() -> 'screens') s
    where (s ->> 'id')::uuid = (select id from run where label = 'holder')),
  2,
  'with its questions'
);

-- 4. Never a step ------------------------------------------------------------------------------------------

select throws_ok(
  format($$ select public.save_intake_flow_order(array['identity', 'custom:%s']) $$,
         (select id from run where label = 'holder')),
  '23514', 'not a step of this onboarding',
  'a holder is never a step of the flow'
);

-- 5. A required added question keeps the screen shown --------------------------------------------------------

select lives_ok(
  $$ select public.save_builtin_screen('participation-support', '{}'::jsonb, true) $$,
  'an app screen with optional added questions can be hidden'
);
select public.save_custom_question_required((select id from run where label = 'text'), true);
select is(
  (select (b ->> 'is_hidden')::boolean
     from jsonb_array_elements(public.intake_catalog() -> 'builtin_screens') b
    where b ->> 'screen' = 'participation-support'),
  false,
  'a required added question shows its screen again'
);
select throws_ok(
  $$ select public.save_builtin_screen('participation-support', '{}'::jsonb, true) $$,
  '23514', 'a screen with a required question, the summary or the terms cannot be hidden',
  'and the screen cannot be hidden while it is required'
);

-- 6. The export --------------------------------------------------------------------------------------------

select is(
  (select s ->> 'builtin_screen'
     from jsonb_array_elements(public.export_onboarding_setup(null) -> 'screens') s
    where (s ->> 'id')::uuid = (select id from run where label = 'holder')),
  'participation-support',
  'the export carries the app screen of a holder'
);

-- 1. The table's own guards ----------------------------------------------------------------------------------

reset role;
select throws_ok(
  $$ insert into public.intake_screens (org_id, title, after_screen, home_after_screen, home_sort_order, builtin_screen)
     values ('5eed0000-0000-4000-8000-000000000000', '{"ca": "Dues"}', 'season', 'season', 0, 'participation-support') $$,
  '23505', null,
  'one live holder per app screen and organization'
);

select * from finish();
rollback;
