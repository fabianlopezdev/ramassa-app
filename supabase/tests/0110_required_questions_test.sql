-- Required or optional for every onboarding question (RAPP-611).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. The staff choices live on the placements (RAPP-666): the old table is
--      gone, and only the functions write them.
--   2. With no choice the required list is the app's own (the default block).
--   3. Only onboarding designers change it; her first name, last name and app
--      language are refused; every change is audited.
--   4. Every reader follows the one list: the catalog, the RAPP-301 Don't ask
--      rule, the RAPP-612 screen hide, the question hide.
--   5. A Ramassà field is required only on a placement where she answers it
--      herself, and only designers make a placement required.
--   6. The server re-checks: joining refuses a missing required answer,
--      built-in or staff, and saves her staff answers in the same call;
--      an optional dependants question left unanswered is unknown, not "no";
--      re-registration refuses a missing required season answer.
--
-- Seed: admin ...001 (settings.organization), staff ...002 (no design
-- permission), design role ...097, player ...011, invited ...098 (answered:
-- names, birth date, nationality, entity, clothing size), organization ...000,
-- staff screen ...8044...001 with the wizard question ...8045...001.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(41);

-- An app answer given by option key, as the app's screens send it by option id.
create function pg_temp.by_option_key(f public.profile_fields, v jsonb) returns jsonb language sql stable security definer as $$
  select case
    when f.question_type in ('single_choice', 'search_choice') and jsonb_typeof(v) = 'string' then
      coalesce((select to_jsonb(o.id::text) from public.custom_question_options o
                 where o.question_id = f.id and o.key = v #>> '{}'), v)
    when f.question_type = 'multiple_choice' and jsonb_typeof(v) = 'array' then
      coalesce((select jsonb_agg(o.id::text order by o.sort_order) from public.custom_question_options o
                 where o.question_id = f.id and o.key in (select jsonb_array_elements_text(v))
                having count(*) = jsonb_array_length(v)), v)
    else v
  end;
$$;
-- Her answers travel by field (RAPP-661). Helpers: the app's keys of a payload
-- keyed by their fields (a choice by its option), a field's id, and her stored
-- answer to an app field (decrypted).
create function pg_temp.answers(p jsonb) returns jsonb language sql security definer as $$
  select coalesce(jsonb_object_agg(f.id::text, pg_temp.by_option_key(f, e.value)), '{}'::jsonb)
    from jsonb_each(p) e
    join public.profile_fields f on f.org_id = '5eed0000-0000-4000-8000-000000000000' and f.system_key = e.key;
$$;
create function pg_temp.field(p_key text) returns text language sql security definer as $$
  select id::text from public.profile_fields
   where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = p_key;
$$;
create function pg_temp.stored(p_profile uuid, p_key text) returns jsonb language sql security definer as $$
  select private.system_field_answer(p_profile, p_key);
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1. Row security -----------------------------------------------------------------------------------------

select ok(
  to_regclass('public.intake_required_questions') is null,
  'the required choices live on the placements: the old table is gone'
);
select ok(
  not has_function_privilege('anon', 'public.save_builtin_question_required(text, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.save_placement(uuid, boolean, jsonb, jsonb)', 'execute'),
  'the new functions need an account'
);

-- 2. The default ------------------------------------------------------------------------------------------

select is(
  private.required_intake_questions('5eed0000-0000-4000-8000-000000000000'),
  private.default_required_intake_questions(),
  'with no choice the required list is the app''s own'
);

-- 3. Who may change it ------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select throws_ok(
  $$ select public.save_builtin_question_required('phone', true) $$,
  '42501', null::text, 'a player cannot change it'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.save_builtin_question_required('phone', true) $$,
  '42501', null::text, 'nor staff without the design permission'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.save_builtin_question_required('first_name', false) $$,
  '23514', 'her first name, last name and app language are always required',
  'her first name stays required'
);
select throws_ok(
  $$ select public.save_builtin_question_required('preferred_language', false) $$,
  '23514', null::text, 'and her app language'
);
select throws_ok(
  $$ select public.save_builtin_question_required('avatar', true) $$,
  '23514', null::text, 'a question no screen asks cannot be required'
);
select lives_ok(
  $$ select public.save_builtin_question_required('clothing_size', false) $$,
  'the design role makes the clothing size optional'
);
select lives_ok(
  $$ select public.save_builtin_question_required('shoe_size', false) $$,
  'and the shoe size'
);
select lives_ok(
  $$ select public.save_builtin_question_required('phone', true) $$,
  'and the phone required'
);
reset role;
select ok(
  not ('clothing_size' = any (private.required_intake_questions('5eed0000-0000-4000-8000-000000000000')))
  and 'phone' = any (private.required_intake_questions('5eed0000-0000-4000-8000-000000000000')),
  'the one list follows'
);
select ok(
  exists (select 1 from public.audit_log where action = 'intake.required_question_save'
           and changes = '{"question": "phone", "required": true}'::jsonb)
  and exists (select 1 from public.audit_log where action = 'intake.required_question_save'
               and changes = '{"question": "clothing_size", "required": false}'::jsonb),
  'every change is audited'
);
select ok(
  (select bool_and(p.required) from public.field_placements p
     join public.profile_fields f on f.id = p.field_id
    where f.org_id = '5eed0000-0000-4000-8000-000000000000' and f.system_key = 'phone'
      and p.surface = 'onboarding'),
  'the phone''s onboarding placement carries the choice'
);

-- 4. Every reader follows ---------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select ok(
  public.intake_catalog() -> 'required_questions' ? 'phone'
  and not (public.intake_catalog() -> 'required_questions' ? 'clothing_size'),
  'her phone reads the list in the one catalog call'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.set_intake_question_states('5eed0000-0000-4000-8000-000000000098', '{"shoe_size": "skip"}') $$,
  'Don''t ask is allowed on a question made optional (RAPP-301)'
);
select throws_ok(
  $$ select public.set_intake_question_states('5eed0000-0000-4000-8000-000000000098', '{"phone": "skip"}') $$,
  '23514', null::text, 'and refused on an unanswered question made required'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.save_builtin_screen('equipment', '{}'::jsonb, true) $$,
  'the sizes screen hides once both sizes are optional (RAPP-612)'
);
select throws_ok(
  $$ select public.save_builtin_question_override('phone', null, null, true) $$,
  '23514', null::text, 'a required question cannot be hidden'
);
select lives_ok(
  $$ select public.save_builtin_question_override('address', null, null, true) $$,
  'an optional one can'
);
select lives_ok(
  $$ select public.save_builtin_question_required('address', true) $$,
  'then made required'
);
select is(
  coalesce((select (entry ->> 'is_hidden')::boolean
              from jsonb_array_elements(public.intake_catalog() -> 'overrides') entry
             where entry ->> 'question' = 'address'), false),
  false,
  'a required question is asked again: it is placed back on its screen'
);
select lives_ok(
  $$ select public.save_builtin_question_required('address', false) $$,
  'back to optional'
);

-- 5. Ramassà fields --------------------------------------------------------------------------------------

reset role;
insert into public.profile_fields (id, org_id, section_id, kind, question_type, label, privacy, default_required, sort_order)
select v.id::uuid, '5eed0000-0000-4000-8000-000000000000', s.id, 'custom', 'short_text', v.label::jsonb, 'normal',
       v.default_required, v.sort_order
  from (values ('00000000-0000-0000-0000-0000000006c1', '{"ca": "Només l''equip"}', true, 90),
               ('00000000-0000-0000-0000-0000000006c2', '{"ca": "Com ens vas conèixer?"}', false, 91))
       as v(id, label, default_required, sort_order)
  join public.profile_sections s
    on s.org_id = '5eed0000-0000-4000-8000-000000000000' and s.key = 'support';
insert into public.field_placements (id, org_id, field_id, surface, screen_key, sort_order)
values ('00000000-0000-0000-0000-0000000006d2', '5eed0000-0000-4000-8000-000000000000',
        '00000000-0000-0000-0000-0000000006c2', 'onboarding', '5eed0000-0000-4000-8044-000000000001', 91),
       ('00000000-0000-0000-0000-0000000006d3', '5eed0000-0000-4000-8000-000000000000',
        '00000000-0000-0000-0000-0000000006c2', 'entity_form', null, 91);
select ok(
  not private.field_required_for_her('00000000-0000-0000-0000-0000000006c1')
  and not private.field_required_for_her('00000000-0000-0000-0000-0000000006c2'),
  'a field is optional for her unless a placement she answers says so, a team-only one always'
);
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.save_placement('00000000-0000-0000-0000-0000000006d2', true, null, null) $$,
  '42501', null::text, 'staff without the design permission cannot make a placement required'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.save_placement('00000000-0000-0000-0000-0000000006d2', true, null, null) $$,
  'the design role makes it required on her onboarding'
);
reset role;
select ok(
  exists (select 1 from public.audit_log where action = 'intake.placement_save'
           and target_id = '00000000-0000-0000-0000-0000000006c2'
           and (changes ->> 'required')::boolean)
  and private.field_required_for_her('00000000-0000-0000-0000-0000000006c2'),
  'and the change is audited'
);

-- 6. The server re-checks ---------------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000006c3', 'required-check@test.local');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000006c3", "role": "authenticated"}';
select throws_like(
  $$ select public.complete_onboarding_signed(
       jsonb_build_object('first_name', 'Nadia', 'last_name', 'Khoury', 'media_consent', false,
         'terms_version', '2026-07-01', 'locale_shown', 'ca',
         'answers', pg_temp.answers('{"date_of_birth": "1993-11-02", "place_of_birth": "Homs",
           "nationality": "Síria", "reference_entity": null, "has_dependents": "no"}')),
       '{"terms_accepted": true, "media_consent": false, "unable_to_draw": true}'::jsonb) $$,
  -- Built-in and staff fields are required the same way since RAPP-661.
  '%requires an answer to a required question%',
  'joining is refused while a built-in question made required has no answer'
);
select throws_like(
  $$ select public.complete_onboarding_signed(
       jsonb_build_object('first_name', 'Nadia', 'last_name', 'Khoury', 'media_consent', false,
         'terms_version', '2026-07-01', 'locale_shown', 'ca',
         'answers', pg_temp.answers('{"date_of_birth": "1993-11-02", "place_of_birth": "Homs",
           "nationality": "Síria", "reference_entity": null, "has_dependents": "no",
           "phone": "+34600111222"}')),
       '{"terms_accepted": true, "media_consent": false, "unable_to_draw": true}'::jsonb) $$,
  '%requires an answer to a required question%',
  'and while a required staff question has no answer'
);
select lives_ok(
  $$ select public.complete_onboarding_signed(
       jsonb_build_object('first_name', 'Nadia', 'last_name', 'Khoury', 'media_consent', false,
         'terms_version', '2026-07-01', 'locale_shown', 'ca',
         'answers', pg_temp.answers('{"date_of_birth": "1993-11-02", "place_of_birth": "Homs",
           "nationality": "Síria", "reference_entity": null, "has_dependents": "no",
           "phone": "+34600111222"}')
           || '{"00000000-0000-0000-0000-0000000006c2": " Per una amiga "}'),
       '{"terms_accepted": true, "media_consent": false, "unable_to_draw": true}'::jsonb) $$,
  'with every required answer, optional sizes left out, she joins'
);
reset role;
select is(
  (select value from public.custom_answers
    where profile_id = '00000000-0000-0000-0000-0000000006c3'
      and question_id = '00000000-0000-0000-0000-0000000006c2'),
  '"Per una amiga"'::jsonb,
  'her staff answer is saved in the same call'
);
select is(
  pg_temp.stored('00000000-0000-0000-0000-0000000006c3', 'clothing_size'),
  null::jsonb,
  'an optional size she did not give stays unknown'
);

-- Dependants made optional and not given: unknown, never "no".
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.save_builtin_question_required('dependents', false) $$,
  'the design role makes dependants optional'
);
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000006c4', 'no-dependants-answer@test.local');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000006c4", "role": "authenticated"}';
select public.complete_onboarding_signed(
  jsonb_build_object('first_name', 'Aya', 'last_name', 'Haddad', 'media_consent', false,
    'terms_version', '2026-07-01', 'locale_shown', 'ca',
    'answers', pg_temp.answers('{"date_of_birth": "1990-01-02", "place_of_birth": "Alep",
      "nationality": "Síria", "reference_entity": null, "phone": "+34600111223"}')
      || '{"00000000-0000-0000-0000-0000000006c2": "Instagram"}'),
  '{"terms_accepted": true, "media_consent": false, "unable_to_draw": true}'::jsonb);
reset role;
select is(
  pg_temp.stored('00000000-0000-0000-0000-0000000006c4', 'has_dependents'),
  null::jsonb,
  'an optional dependants question she did not answer is unknown, not "no"'
);

-- Readers of an answer that may now be missing: unknown, never miscounted.
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select count(*)::integer from public.list_participants(p_dependents => 'with', p_page_size => 500)
    where id = '00000000-0000-0000-0000-0000000006c4')
  + (select count(*)::integer from public.list_participants(p_dependents => 'without', p_page_size => 500)
      where id = '00000000-0000-0000-0000-0000000006c4'),
  0,
  'the dependants filter counts her neither with nor without'
);
select is(
  (select r.has_dependents from public.list_participants(p_page_size => 500) r
    where r.id = '00000000-0000-0000-0000-0000000006c4'),
  null::boolean,
  'the roster shows her dependants as unknown'
);
select ok(
  (select array_position(o.entities, null) is null from public.participant_filter_options() o),
  'an unknown entity never becomes a filter choice'
);

-- Her own edit is never stricter than registration, and keeps unknown unknown.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000006c4", "role": "authenticated"}';
select lives_ok(
  $$ select public.update_own_profile(jsonb_build_object('first_name', 'Aya', 'last_name', 'Haddad',
       'media_consent', false, 'answers', pg_temp.answers('{"place_of_birth": ""}'))) $$,
  'she saves her profile with her place of birth left empty'
);
reset role;
select is(
  pg_temp.stored('00000000-0000-0000-0000-0000000006c4', 'has_dependents'),
  null::jsonb,
  'and her dependants stay unknown'
);

-- Re-registration: a season question made required.
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.save_builtin_question_required('childcare_need', true) $$,
  'the design role makes the childcare question required'
);
reset role;
delete from public.custom_answers a
 using public.profile_fields f
 where f.id = a.question_id and f.system_key = 'childcare_need'
   and a.profile_id = '5eed0000-0000-4000-8000-000000000011';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select throws_ok(
  $$ select public.update_my_season_answers(jsonb_build_object('answers', pg_temp.answers('{"applicant_status": "refugee"}'))) $$,
  '23502', null::text,
  'her re-registration is refused while it has no answer'
);

select * from finish();
rollback;
