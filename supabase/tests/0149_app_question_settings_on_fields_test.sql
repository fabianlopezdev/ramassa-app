-- The app's question settings live on fields and placements (RAPP-666, D13).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. The text-keyed side tables and the app screen map are gone; each app
--      field names its own screen; the new helpers stay private.
--   2. Staff's Ask or Don't ask on an app question is a state of its first
--      field, read back by the question's name.
--   3. Staff wording of an app question is its first field's onboarding
--      wording; hiding takes the question's fields off her onboarding and her
--      season form, showing places them back on their own screen. The
--      catalog's `overrides` list reads both.
--   4. An app question is required on her onboarding and her season form
--      alike; requiring a hidden question asks it again.
--   5. A screen and a flow step are the app's screens; a screen with a
--      required placement cannot be hidden.
--   6. The setup file: export writes the two old lists empty; an older file's
--      lists land on the placements and the field's options.
--
-- Seed: organization ...000, admin ...001 (every permission), invited ...098
-- (staff asked her clothing size, skipped her phone), Ramassà field ...8045-...001.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(41);

create temp table run (label text primary key, doc jsonb) on commit drop;
grant all on run to authenticated;

create function pg_temp.field(p_org uuid, p_key text) returns uuid language sql security definer as $$
  select id from public.profile_fields where org_id = p_org and system_key = p_key;
$$;
create function pg_temp.seed_field(p_key text) returns uuid language sql security definer as $$
  select pg_temp.field('5eed0000-0000-4000-8000-000000000000', p_key);
$$;
-- Where a field is placed on one surface, as "screen/required".
create function pg_temp.placed(p_field uuid, p_surface text) returns text language sql security definer as $$
  select coalesce(p.screen_key, '-') || '/' || p.required::text
    from public.field_placements p where p.field_id = p_field and p.surface = p_surface;
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1. The old storage is gone ------------------------------------------------------------------------------

select hasnt_table('public', 'intake_question_states', 'staff states on app questions have no table of their own');
select hasnt_table('public', 'builtin_question_overrides', 'app question wording has no table of its own');
select hasnt_table('public', 'intake_required_questions', 'the required list has no table of its own');
select ok(to_regprocedure('private.wizard_screen_questions()') is null, 'the app screen map is gone');
select is(
  (select array_agg(s.system_key || '@' || s.screen order by s.system_key)
     from private.system_profile_fields() s where s.question = 'document'),
  array['document_name@documentation', 'document_number@documentation', 'document_type@documentation'],
  'each app field names the screen whose own control asks it'
);
select ok(
  not has_function_privilege('authenticated', 'private.set_app_question_hidden(uuid, text, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'private.set_app_question_required(uuid, text, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'private.set_app_question_wording(uuid, text, jsonb, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'private.place_app_question(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'private.app_question_field(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'private.fold_app_option_overrides(uuid, text, jsonb)', 'execute'),
  'the new helpers stay private'
);
select ok(
  has_function_privilege('authenticated', 'public.save_builtin_question_override(text, jsonb, jsonb, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.save_builtin_question_override(text, jsonb, jsonb, boolean)', 'execute'),
  'the wording save takes no option changes and is for signed-in staff only'
);

-- 2. Ask or Don't ask, by field ---------------------------------------------------------------------------

select is(
  (select array_agg(s.state order by s.state) from public.custom_question_states s
    where s.profile_id = '5eed0000-0000-4000-8000-000000000098'
      and s.question_id in (pg_temp.seed_field('clothing_size'), pg_temp.seed_field('phone'))),
  array['ask', 'skip'],
  'the seed keeps staff choices on the fields'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select lives_ok(
  $$ select public.set_intake_question_states('5eed0000-0000-4000-8000-000000000098', '{"date_of_birth": "ask"}') $$,
  'staff ask an app question again'
);
reset role;
select is(
  (select s.state from public.custom_question_states s
    where s.profile_id = '5eed0000-0000-4000-8000-000000000098' and s.question_id = pg_temp.seed_field('date_of_birth')),
  'ask',
  'the choice is a state of the question''s first field'
);
set local role authenticated;
select is(
  (select array_agg(q.question || '=' || q.state order by q.question)
     from public.participant_question_states('5eed0000-0000-4000-8000-000000000098') q),
  array['clothing_size=ask', 'custom:5eed0000-0000-4000-8045-000000000001=ask', 'date_of_birth=ask', 'phone=skip'],
  'staff read the states back by the question''s name'
);
select lives_ok(
  $$ select public.set_intake_question_states('5eed0000-0000-4000-8000-000000000098', '{"date_of_birth": "auto"}') $$,
  'Auto clears the choice'
);
reset role;
select is(
  (select count(*)::integer from public.custom_question_states s
    where s.profile_id = '5eed0000-0000-4000-8000-000000000098' and s.question_id = pg_temp.seed_field('date_of_birth')),
  0,
  'and leaves no state on the field'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000098", "role": "authenticated"}';
select ok(
  'clothing_size' in (select q from public.my_questions_to_ask() q)
  and 'phone' not in (select q from public.my_questions_to_ask() q),
  'her wizard asks the size staff want to review and skips the phone'
);

-- 3. Wording and hiding -----------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select lives_ok(
  $$ select public.save_builtin_question_override('postal_code', '{"ca": "Codi"}', null, false) $$,
  'staff reword an app question'
);
reset role;
select is(
  (select p.label_override from public.field_placements p
    where p.field_id = pg_temp.seed_field('postal_code') and p.surface = 'onboarding'),
  '{"ca": "Codi"}'::jsonb,
  'the wording is on its field''s onboarding placement'
);
set local role authenticated;
select is(
  (select o -> 'label' from jsonb_array_elements(public.intake_catalog() -> 'overrides') o
    where o ->> 'question' = 'postal_code'),
  '{"ca": "Codi"}'::jsonb,
  'and the catalog''s overrides read it'
);

select lives_ok(
  $$ select public.save_builtin_question_override('childcare_need', null, null, true) $$,
  'staff hide an optional season question'
);
reset role;
select is(
  (select count(*)::integer from public.field_placements p
    where p.field_id = pg_temp.seed_field('childcare_need') and p.surface in ('onboarding', 'season')),
  0,
  'hidden, it is on neither her onboarding nor her season form'
);
set local role authenticated;
select is(
  (select (o ->> 'is_hidden')::boolean from jsonb_array_elements(public.intake_catalog() -> 'overrides') o
    where o ->> 'question' = 'childcare_need'),
  true,
  'the catalog says it is hidden'
);
select lives_ok(
  $$ select public.save_builtin_question_override('childcare_need', null, null, false) $$,
  'staff show it again'
);
reset role;
select is(
  pg_temp.placed(pg_temp.seed_field('childcare_need'), 'onboarding') || ' ' ||
  pg_temp.placed(pg_temp.seed_field('childcare_need'), 'season'),
  'participation-support/false -/false',
  'it is back on its own screen and on the season form'
);

set local role authenticated;
select lives_ok(
  $$ select public.save_builtin_question_override('document', null, null, true) $$,
  'staff hide the document question'
);
select lives_ok(
  $$ select public.save_builtin_question_override('document', null, null, false) $$,
  'and show it again'
);
reset role;
select is(
  (select array_agg(f.system_key order by p.sort_order) from public.field_placements p
     join public.profile_fields f on f.id = p.field_id
    where p.org_id = '5eed0000-0000-4000-8000-000000000000' and p.surface = 'onboarding'
      and p.screen_key = 'documentation'),
  array['document_type', 'document_number', 'document_name'],
  'every part of a split question comes back, in order'
);

set local role authenticated;
select throws_ok(
  $$ select public.save_builtin_question_override('date_of_birth', null, null, true) $$,
  '23514', 'the app needs this question, so it cannot be hidden',
  'a required question cannot be hidden'
);

-- 4. Required -----------------------------------------------------------------------------------------------

select lives_ok(
  $$ select public.save_builtin_question_required('childcare_need', true) $$,
  'staff make a season question required'
);
reset role;
select is(
  pg_temp.placed(pg_temp.seed_field('childcare_need'), 'onboarding') || ' ' ||
  pg_temp.placed(pg_temp.seed_field('childcare_need'), 'season'),
  'participation-support/true -/true',
  'required on her onboarding and her season form alike'
);
select ok('childcare_need' = any (private.required_intake_questions('5eed0000-0000-4000-8000-000000000000')),
          'the required list reads the placements');

set local role authenticated;
select lives_ok(
  format($$ select public.save_placement(%L, false) $$,
         (select p.id from public.field_placements p
           where p.field_id = pg_temp.seed_field('childcare_need') and p.surface = 'season')),
  'staff make it optional from the season form'
);
reset role;
select is(
  pg_temp.placed(pg_temp.seed_field('childcare_need'), 'onboarding'),
  'participation-support/false',
  'and her onboarding follows'
);

set local role authenticated;
select lives_ok(
  $$ select public.save_builtin_question_override('address', null, null, true) $$,
  'staff hide the address'
);
select lives_ok(
  $$ select public.save_builtin_question_required('address', true) $$,
  'then make it required'
);
reset role;
select is(
  pg_temp.placed(pg_temp.seed_field('address'), 'onboarding'),
  'logistics/true',
  'a required question is asked again, on its own screen'
);

-- 5. Screens and the flow order -----------------------------------------------------------------------------

select is(
  private.intake_flow_order_problem('5eed0000-0000-4000-8000-000000000000', array['identity', 'nowhere']),
  'unknown_step',
  'a flow step is an app screen or a Ramassà screen'
);
select ok(
  not private.builtin_screen_hideable('equipment') and private.builtin_screen_hideable('specific-needs'),
  'a screen with a required placement cannot be hidden; one without can'
);

-- 6. The setup file -----------------------------------------------------------------------------------------

set local role authenticated;
insert into run (label, doc) values ('export', public.export_onboarding_setup(null));
reset role;
select is(
  (select (doc -> 'builtin_question_overrides') || (doc -> 'required_questions') from run where label = 'export'),
  '[]'::jsonb,
  'an export writes the two old lists empty: the placements carry them'
);

-- An older file: the same layout, with the two lists filled.
insert into public.organizations (id, name, slug)
values ('5eed0000-0000-4000-8000-0000000006c0', 'Prova 666', 'prova-666');
select private.apply_onboarding_setup(
  (select jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(doc,
     '{required_questions}', '[{"question": "phone", "is_required": true}]'),
     '{builtin_question_overrides}', '[
        {"question": "phone", "label": {"ca": "Mòbil"}, "help": null, "is_hidden": false, "option_overrides": {}},
        {"question": "reference_contact_name", "label": null, "help": null, "is_hidden": true, "option_overrides": {}},
        {"question": "clothing_size", "label": null, "help": null, "is_hidden": false,
         "option_overrides": {"XL": {"label": {"ca": "Extra gran"}}}}]'),
     '{seasons}', '[]'), '{app_terms}', '{"published": [], "draft": null}'),
     '{authorization}', '{"published": [], "draft": null}')
     from run where label = 'export'),
  '5eed0000-0000-4000-8000-0000000006c0', null);
select is(
  (select p.required::text || ' ' || (p.label_override ->> 'ca') from public.field_placements p
    where p.field_id = pg_temp.field('5eed0000-0000-4000-8000-0000000006c0', 'phone') and p.surface = 'onboarding'),
  'true Mòbil',
  'an older file''s required list and wording land on the placement'
);
select is(
  (select count(*)::integer from public.field_placements p
    where p.field_id = pg_temp.field('5eed0000-0000-4000-8000-0000000006c0', 'reference_contact_name')
      and p.surface = 'onboarding'),
  0,
  'its hidden question is placed nowhere on her onboarding'
);
select is(
  (select o.label ->> 'ca' from public.custom_question_options o
    where o.question_id = pg_temp.field('5eed0000-0000-4000-8000-0000000006c0', 'clothing_size') and o.key = 'XL'),
  'Extra gran',
  'its option wording lands on the field''s option'
);
select ok(
  private.onboarding_setup_blockers('5eed0000-0000-4000-8000-0000000006c0')
    @> array['builtin_question_overrides', 'required_questions'],
  'staff wording and a changed required flag on the placements block a second import'
);

select * from finish();
rollback;
