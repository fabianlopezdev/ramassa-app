-- Built-in onboarding screens editable, and one flow order (RAPP-612).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Both tables keep row level security; anon reaches nothing; the new
--      functions need an account.
--   2. Only onboarding designers (settings.organization or onboarding.design)
--      word a screen or arrange the flow; a player and a staff member without
--      either are refused. Every write is audited with field names, never text.
--   3. A screen takes only its own fields: the terms screens never take a
--      title (their title is the terms version), and nothing is too long.
--   4. A screen hides only when none of its questions is required, read from
--      the one required list; the summary and the terms never hide.
--   5. The flow order holds each movable step once; the summary, the terms
--      and the authorization never enter it; a staff screen of another
--      organization or an archived one is refused. Saving it re-anchors the
--      staff screens, and moving a screen in the question builder takes it out.
--   6. Her phone reads both through the one catalog call.
--
-- Seed: admin ...001, staff ...002 (no settings.organization), design role
-- ...097, player ...011, organization ...000, staff screen ...8044...001
-- (after logistics) and ...002.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(37);

-- 1. Row security -----------------------------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.intake_builtin_screens'::regclass),
  'screen wording keeps row level security'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.intake_flow_orders'::regclass),
  'the flow order keeps row level security'
);
select ok(
  not has_table_privilege('anon', 'public.intake_builtin_screens', 'select')
  and not has_table_privilege('anon', 'public.intake_flow_orders', 'select'),
  'anon reads neither table'
);
select ok(
  not has_table_privilege('authenticated', 'public.intake_builtin_screens', 'insert')
  and not has_table_privilege('authenticated', 'public.intake_flow_orders', 'update'),
  'nobody writes them directly'
);
select ok(
  not has_function_privilege('anon', 'public.save_builtin_screen(text, jsonb, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.save_intake_flow_order(text[])', 'execute'),
  'the new functions need an account'
);
select ok(
  exists (select 1 from public.personal_data_disposition() where table_name = 'intake_builtin_screens')
  and exists (select 1 from public.personal_data_disposition() where table_name = 'intake_flow_orders'),
  'both tables are in the RGPD register'
);

-- 2. Who may change them -----------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select throws_ok(
  $$ select public.save_builtin_screen('summary', '{"title": {"ca": "Hola"}}'::jsonb, false) $$,
  '42501', null::text,
  'a player cannot word a screen'
);
select throws_ok(
  $$ select public.save_intake_flow_order(array['season', 'identity']) $$,
  '42501', null::text,
  'nor arrange the flow'
);
select is(
  (select texts -> 'title' from public.intake_builtin_screens where screen = 'summary'),
  null::jsonb,
  'and nothing was written'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.save_builtin_screen('summary', '{"title": {"ca": "Hola"}}'::jsonb, false) $$,
  '42501', null::text,
  'staff without settings.organization or onboarding.design cannot word a screen'
);
select throws_ok(
  $$ select public.save_intake_flow_order(array['season', 'identity']) $$,
  '42501', null::text,
  'nor arrange the flow'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.save_builtin_screen('summary',
       '{"title": {"ca": "Revisa-ho tot", "ar": "راجعي كل شيء"}, "continue_label": {"ca": "Tot correcte"}}'::jsonb,
       false) $$,
  'the design role words the summary'
);
select is(
  (select texts -> 'title' ->> 'ar' from public.intake_builtin_screens where screen = 'summary'),
  'راجعي كل شيء',
  'in any language'
);
reset role;
select is(
  (select changes from public.audit_log where action = 'intake.builtin_screen_save' order by created_at desc limit 1),
  '{"screen": "summary", "hidden": false, "fields": ["continue_label", "title"]}'::jsonb,
  'the change is audited with the field names and never the text'
);
set local role authenticated;

-- 3. A screen's own fields -----------------------------------------------------------------------------------

select throws_ok(
  $$ select public.save_builtin_screen('terms', '{"title": {"ca": "Termes"}}'::jsonb, false) $$,
  '23514', null::text,
  'the terms screen takes no title: it is the terms version''s'
);
select lives_ok(
  $$ select public.save_builtin_screen('terms',
       '{"continue_label": {"ca": "Acabar"}, "decline_label": {"ca": "Ara no, gràcies"}}'::jsonb, false) $$,
  'its buttons are worded'
);
select throws_ok(
  $$ select public.save_builtin_screen('identity', '{"decline_label": {"ca": "No"}}'::jsonb, false) $$,
  '23514', null::text,
  'a screen without a decline button takes no decline label'
);
select throws_ok(
  $$ select public.save_builtin_screen('somewhere', '{}'::jsonb, false) $$,
  '23514', null::text,
  'an unknown screen is refused'
);
select throws_ok(
  format($$ select public.save_builtin_screen('identity', '{"help": {"ca": "%s"}}'::jsonb, false) $$,
         repeat('a', 2001)),
  '23514', null::text,
  'a text over 2000 characters is refused'
);

-- 4. Hiding ----------------------------------------------------------------------------------------------------

select lives_ok(
  $$ select public.save_builtin_screen('documentation', '{}'::jsonb, true) $$,
  'a screen with no required question hides'
);
select throws_ok(
  $$ select public.save_builtin_screen('logistics', '{}'::jsonb, true) $$,
  '23514', null::text,
  'a screen with a required question does not'
);
select throws_ok(
  $$ select public.save_builtin_screen('summary', '{}'::jsonb, true) $$,
  '23514', null::text,
  'the summary never hides'
);
select throws_ok(
  $$ select public.save_builtin_screen('terms', '{}'::jsonb, true) $$,
  '23514', null::text,
  'nor the terms'
);
select lives_ok(
  $$ select public.save_builtin_screen('terms', '{}'::jsonb, false) $$,
  'clearing a screen''s wording'
);
select is(
  (select count(*)::integer from public.intake_builtin_screens where screen = 'terms'),
  0,
  'removes its row: the bundled text shows again'
);

-- 5. The flow order ---------------------------------------------------------------------------------------------

select throws_ok(
  $$ select public.save_intake_flow_order(array['season', 'summary']) $$,
  '23514', null::text,
  'the summary never moves'
);
select throws_ok(
  $$ select public.save_intake_flow_order(array['season', 'season']) $$,
  '23514', null::text,
  'a step appears once'
);
select throws_ok(
  $$ select public.save_intake_flow_order(array['custom:5eed0000-0000-4000-8099-0000000000ff']) $$,
  '23514', null::text,
  'a staff screen that does not exist is refused'
);
select lives_ok(
  $$ select public.save_intake_flow_order(array[
       'custom:5eed0000-0000-4000-8044-000000000001', 'identity', 'season', 'background',
       'documentation', 'logistics', 'equipment', 'custom:5eed0000-0000-4000-8044-000000000002',
       'supporting-entities', 'participation-support', 'specific-needs']) $$,
  'the design role puts her own screen first and the season second'
);
select is(
  (select after_screen from public.intake_screens where id = '5eed0000-0000-4000-8044-000000000002'),
  'logistics',
  'a staff screen is anchored to the built-in step before it'
);
reset role;
select is(
  (select changes -> 'order' ->> 0 from public.audit_log where action = 'intake.flow_reorder' order by created_at desc limit 1),
  'custom:5eed0000-0000-4000-8044-000000000001',
  'the new order is audited'
);
set local role authenticated;
select lives_ok(
  $$ select public.reorder_intake_screens('logistics',
       array['5eed0000-0000-4000-8044-000000000002'::uuid]) $$,
  'moving a screen in the question builder'
);
select ok(
  array_position(
    (select step_order from public.intake_flow_orders where org_id = '5eed0000-0000-4000-8000-000000000000'),
    'custom:5eed0000-0000-4000-8044-000000000002') is null,
  'takes it out of the stored order, so it follows its step again'
);

-- 6. Her phone reads both in the one catalog call ------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(
  public.intake_catalog() -> 'flow_order' ->> 1,
  'identity',
  'the catalog carries the flow order'
);
select is(
  (select entry -> 'texts' -> 'title' ->> 'ca'
     from jsonb_array_elements(public.intake_catalog() -> 'builtin_screens') entry
    where entry ->> 'screen' = 'summary'),
  'Revisa-ho tot',
  'and the screen wording'
);

-- A hide stored before a question became required no longer counts.
reset role;
insert into public.intake_builtin_screens (org_id, screen, is_hidden)
values ('5eed0000-0000-4000-8000-000000000000', 'logistics', true);
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(
  (select (entry ->> 'is_hidden')::boolean
     from jsonb_array_elements(public.intake_catalog() -> 'builtin_screens') entry
    where entry ->> 'screen' = 'logistics'),
  false,
  'a screen with a required question shows, whatever was stored'
);
select is(
  (select (entry ->> 'is_hidden')::boolean
     from jsonb_array_elements(public.intake_catalog() -> 'builtin_screens') entry
    where entry ->> 'screen' = 'documentation'),
  true,
  'and a hidden optional screen stays hidden'
);

select * from finish();
rollback;
