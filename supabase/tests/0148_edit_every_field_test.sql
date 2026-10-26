-- Every field is edited on Dades de les jugadores, answered ones included (RAPP-665, D8).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Previewing and saving a change need the question builder's permission.
--   2. Her names change type and privacy like any field (RAPP-693) and are
--      never archived; they can be renamed.
--   3. Each conversion: text to a number when it reads as one, a choice to
--      text keeps its label, one choice to several keeps the option, text to
--      a choice matches an option's label, a choice with keys yes and no
--      becomes yes/no. What does not fit leaves the field and is set aside in
--      her history, encrypted; the audit row holds counts and no value.
--   4. A feature that reads the field stops when its type no longer fits, and
--      the preview says so; a one-choice field that stops being one frees the
--      fields that opened on it.
--   5. Privacy up encrypts the answers and a reader loses them; privacy down
--      decrypts them and a reader gains them. The preview counts both.
--   6. An app field is archived and placed on any screen; an older setup
--      file's option wording lands on the field's options.
--   7. Erasure removes what a change set aside about her.
--   8. The helpers stay private; the preview is for signed-in builders only.
--
-- Seed: organization ...000, admin ...001 (builder, every level), staff
-- ...002 (every level, no builder), staff ...003 (every level until trimmed
-- below), players ...011 (Síria, Vic, no dependents) and ...012.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(49);

create temp table run (label text primary key, id uuid);
grant all on run to authenticated;

create function pg_temp.id(p_label text) returns uuid language sql as $$
  select id from run where label = p_label;
$$;
create function pg_temp.sys(p_key text) returns uuid language sql security definer as $$
  select id from public.profile_fields
   where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = p_key;
$$;
-- Her answer to a field, in clear, whatever its level.
create function pg_temp.answer(p_profile uuid, p_field uuid) returns jsonb language sql security definer as $$
  select coalesce(a.value, public.decrypt_field(a.value_encrypted)::jsonb)
    from public.custom_answers a where a.profile_id = p_profile and a.question_id = p_field;
$$;
create function pg_temp.option(p_field uuid, p_ca text) returns uuid language sql security definer as $$
  select id from public.custom_question_options where question_id = p_field and label ->> 'ca' = p_ca;
$$;
create function pg_temp.label(p_field uuid) returns jsonb language sql security definer as $$
  select label from public.profile_fields where id = p_field;
$$;
create function pg_temp.section() returns uuid language sql security definer as $$
  select id from public.profile_sections where org_id = '5eed0000-0000-4000-8000-000000000000' and key = 'support';
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1. Permission ------------------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$ select public.preview_field_change(pg_temp.sys('nationality'), 'short_text', 'personal') $$,
  '42501', null::text, 'a player previews nothing');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.preview_field_change(pg_temp.sys('nationality'), 'short_text', 'personal') $$,
  '42501', null::text, 'staff without the question builder preview nothing');
select throws_ok(
  $$ select public.save_profile_field(pg_temp.sys('nationality'), null, 'short_text',
       pg_temp.label(pg_temp.sys('nationality')), null, 'personal') $$,
  '42501', null::text, 'and change nothing');

-- 2. Her names -------------------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
-- Since RAPP-693 her names change type and privacy like any field.
select lives_ok(
  $$ select public.preview_field_change(pg_temp.sys('first_name'), 'long_text', 'normal') $$,
  'her first name may change type');
select lives_ok(
  $$ select public.preview_field_change(pg_temp.sys('last_name'), 'short_text', 'sensitive') $$,
  'her last name may change privacy');
select throws_ok(
  $$ select public.archive_profile_field(pg_temp.sys('first_name')) $$,
  '23514', 'her names are always asked', 'her names are never archived');
select lives_ok(
  $$ select public.save_profile_field(pg_temp.sys('first_name'), null, 'short_text',
       '{"ca": "Nom de pila", "es": "Nombre de pila"}'::jsonb, null, 'normal') $$,
  'her names are renamed');

-- 3. Conversions -----------------------------------------------------------------------------------------------

insert into run select 'size', public.save_profile_field(
  null, pg_temp.section(), 'short_text', '{"ca": "Talla de samarreta"}'::jsonb, null, 'normal');
insert into run select 'shift', public.save_profile_field(
  null, pg_temp.section(), 'single_choice', '{"ca": "Torn"}'::jsonb, null, 'personal', false,
  '[{"label": {"ca": "Matí", "es": "Mañana"}}, {"label": {"ca": "Tarda"}}]'::jsonb);
insert into run select 'days', public.save_profile_field(
  null, pg_temp.section(), 'single_choice', '{"ca": "Dia"}'::jsonb, null, 'personal', false,
  '[{"label": {"ca": "Dilluns"}}, {"label": {"ca": "Dimarts"}}]'::jsonb);

reset role;
select private.write_custom_answer('5eed0000-0000-4000-8000-000000000011',
  (select f from public.profile_fields f where f.id = pg_temp.id('size')), '"38"', 'staff',
  '5eed0000-0000-4000-8000-000000000001');
select private.write_custom_answer('5eed0000-0000-4000-8000-000000000012',
  (select f from public.profile_fields f where f.id = pg_temp.id('size')), '"gran"', 'staff',
  '5eed0000-0000-4000-8000-000000000001');
select private.write_custom_answer('5eed0000-0000-4000-8000-000000000011',
  (select f from public.profile_fields f where f.id = pg_temp.id('shift')),
  to_jsonb(pg_temp.option(pg_temp.id('shift'), 'Matí')::text), 'staff', '5eed0000-0000-4000-8000-000000000001');
select private.write_custom_answer('5eed0000-0000-4000-8000-000000000011',
  (select f from public.profile_fields f where f.id = pg_temp.id('days')),
  to_jsonb(pg_temp.option(pg_temp.id('days'), 'Dimarts')::text), 'staff', '5eed0000-0000-4000-8000-000000000001');

set local role authenticated;
select is(
  (select concat_ws('/', p ->> 'answers', p ->> 'converted', p ->> 'not_converted')
     from public.preview_field_change(pg_temp.id('size'), 'number', 'normal', null, '{"integer": true}'::jsonb) p),
  '2/1/1', 'the preview counts the answers, the ones that convert and the ones that do not');
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000012', pg_temp.id('size')), '"gran"'::jsonb,
  'the preview changes nothing');
select lives_ok(
  $$ select public.save_profile_field(pg_temp.id('size'), null, 'number', '{"ca": "Talla de samarreta"}'::jsonb,
       null, 'normal', false, '[]'::jsonb, '{"integer": true}'::jsonb) $$,
  'short text becomes a number');

reset role;
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', pg_temp.id('size')), '38'::jsonb,
  'text that reads as a number becomes one');
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000012', pg_temp.id('size')), null,
  'text that does not leaves the field');
select is(
  (select count(*)::integer from public.audit_log
    where action = 'intake.answer_set_aside' and target_type = 'profile'
      and target_id = '5eed0000-0000-4000-8000-000000000012' and changes ->> 'field_id' = pg_temp.id('size')::text),
  1, 'it is set aside in her history');
select is(
  (select public.decrypt_field(decode(changes ->> 'value_encrypted', 'base64'))::jsonb from public.audit_log
    where action = 'intake.answer_set_aside' and changes ->> 'field_id' = pg_temp.id('size')::text),
  '"gran"'::jsonb, 'her history keeps the answer, encrypted');
select is(
  (select count(*)::integer from public.audit_log
    where changes ->> 'field_id' = pg_temp.id('size')::text and changes::text like '%gran%'),
  0, 'no answer is in the audit log in clear');
select is(
  (select concat_ws('/', changes ->> 'type_from', changes ->> 'type_to', changes ->> 'answers',
                    changes ->> 'converted', changes ->> 'not_converted')
     from public.audit_log where action = 'intake.field_change' and target_id = pg_temp.id('size')),
  'short_text/number/2/1/1', 'one audit row holds the counts of the change');

set local role authenticated;
select lives_ok(
  $$ select public.save_profile_field(pg_temp.id('shift'), null, 'short_text', '{"ca": "Torn"}'::jsonb,
       null, 'personal', false, '[]'::jsonb, '{}'::jsonb) $$,
  'a choice becomes text');
select lives_ok(
  $$ select public.save_profile_field(pg_temp.id('days'), null, 'multiple_choice', '{"ca": "Dies"}'::jsonb,
       null, 'personal', false,
       jsonb_build_array(
         jsonb_build_object('id', pg_temp.option(pg_temp.id('days'), 'Dilluns'), 'label', '{"ca": "Dilluns"}'::jsonb),
         jsonb_build_object('id', pg_temp.option(pg_temp.id('days'), 'Dimarts'), 'label', '{"ca": "Dimarts"}'::jsonb)),
       '{}'::jsonb) $$,
  'one choice becomes several');

reset role;
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', pg_temp.id('shift')), '"Matí"'::jsonb,
  'a choice that becomes text keeps its label');
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', pg_temp.id('days')),
  jsonb_build_array(pg_temp.option(pg_temp.id('days'), 'Dimarts')),
  'one choice that becomes several keeps the option');

set local role authenticated;
select is(
  public.preview_field_change(pg_temp.id('shift'), 'single_choice', 'personal',
    '[{"label": {"ca": "Nit"}}, {"label": {"ca": "Vespre", "es": "Matí"}}]'::jsonb) ->> 'converted',
  '1', 'text matches a new option by a label in any language');
select lives_ok(
  $$ select public.save_profile_field(pg_temp.id('shift'), null, 'single_choice', '{"ca": "Torn"}'::jsonb,
       null, 'personal', false, '[{"label": {"ca": "Matí"}}, {"label": {"ca": "Nit"}}]'::jsonb, '{}'::jsonb) $$,
  'text becomes a choice again');
reset role;
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', pg_temp.id('shift')),
  to_jsonb((select id from public.custom_question_options
             where question_id = pg_temp.id('shift') and not is_archived and label ->> 'ca' = 'Matí')::text),
  'and her answer is the option with her text');

-- 4. Keys, conditions and features -----------------------------------------------------------------------------

set local role authenticated;
select is(
  public.preview_field_change(pg_temp.sys('has_dependents'), 'yes_no', 'personal') ->> 'conditions_cleared',
  '1', 'the preview says the number of dependants stops depending on the answer');
select is(
  (select count(*)::integer
     from jsonb_array_elements(public.preview_field_change(pg_temp.sys('nationality'), 'short_text', 'personal') -> 'features') f
    where (f ->> 'fits_now')::boolean and not (f ->> 'fits_after')::boolean),
  2, 'the preview names the two features that stop reading the nationality as text');
select lives_ok(
  $$ select public.save_profile_field(pg_temp.sys('has_dependents'), null, 'yes_no',
       pg_temp.label(pg_temp.sys('has_dependents')), null, 'personal', false, '[]'::jsonb, '{}'::jsonb) $$,
  'the dependants question becomes yes/no');
select lives_ok(
  $$ select public.save_profile_field(pg_temp.sys('nationality'), null, 'short_text',
       pg_temp.label(pg_temp.sys('nationality')), null, 'personal', false, '[]'::jsonb, '{}'::jsonb) $$,
  'the nationality becomes short text');

reset role;
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', pg_temp.sys('has_dependents')), '"no"'::jsonb,
  'the option keyed no becomes no');
select is(
  (select show_when_field_id from public.profile_fields where id = pg_temp.sys('num_dependents')), null,
  'the number of dependants no longer opens on it');
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', pg_temp.sys('nationality')), '"Síria"'::jsonb,
  'a country becomes its name as text');
select is((private.feature_field('5eed0000-0000-4000-8000-000000000000', 'impact.nationalities')).id, null,
  'the impact report no longer reads it');

-- 5. Privacy up and down ---------------------------------------------------------------------------------------

delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000003' and permission_code = 'participants.view_sensitive';

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select count(*)::integer from public.participant_custom_answers('5eed0000-0000-4000-8000-000000000011')
    where question_id = pg_temp.id('size')),
  1, 'a reader without the Sensitive level reads the Normal answer');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select concat_ws('/', p ->> 'to_encrypt', p ->> 'readers_losing', p ->> 'permission_before', p ->> 'permission_after')
     from public.preview_field_change(pg_temp.id('size'), 'number', 'sensitive') p),
  '1/1/participants.view/participants.view_sensitive',
  'the preview counts the answers to encrypt and the reader who loses them');
select lives_ok(
  $$ select public.save_profile_field(pg_temp.id('size'), null, 'number', '{"ca": "Talla de samarreta"}'::jsonb,
       null, 'sensitive', false, '[]'::jsonb, '{"integer": true}'::jsonb) $$,
  'privacy goes up');

reset role;
select ok(
  (select value is null and value_encrypted is not null from public.custom_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000011' and question_id = pg_temp.id('size')),
  'the answer is stored encrypted');
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', pg_temp.id('size')), '38'::jsonb,
  'and decrypts to the same answer');

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select count(*)::integer from public.participant_custom_answers('5eed0000-0000-4000-8000-000000000011')
    where question_id = pg_temp.id('size')),
  0, 'that reader no longer reads it');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select concat_ws('/', (p ->> 'to_decrypt')::integer > 0, p ->> 'readers_gaining')
     from public.preview_field_change(pg_temp.sys('phone'), 'phone', 'personal') p),
  't/1', 'the preview counts the answers to decrypt and the reader who gains them');
select lives_ok(
  $$ select public.save_profile_field(pg_temp.sys('phone'), null, 'phone', pg_temp.label(pg_temp.sys('phone')),
       null, 'personal', false, '[]'::jsonb, '{}'::jsonb) $$,
  'privacy goes down');

reset role;
select ok(
  (select value is not null and value_encrypted is null from public.custom_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000011' and question_id = pg_temp.sys('phone')),
  'the phone is stored in clear at the Personal level');

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select count(*)::integer from public.participant_custom_answers('5eed0000-0000-4000-8000-000000000011')
    where question_id = pg_temp.sys('phone')),
  1, 'and the reader without the Sensitive level reads it');

-- 6. Archive, place and option wording -------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok($$ select public.archive_profile_field(pg_temp.sys('shoe_size')) $$, 'an app field is archived');
select lives_ok(
  $$ select public.remove_placement((select id from public.field_placements
                                      where field_id = pg_temp.sys('postal_code') and surface = 'onboarding')) $$,
  'an app field leaves its own screen');
select lives_ok(
  $$ select public.place_field(pg_temp.sys('postal_code'), 'onboarding',
       public.save_intake_screen(null, '{"ca": "Adreça"}'::jsonb, null, 'logistics')::text) $$,
  'and is placed on a Ramassà screen');
-- An older setup file still carries option wording on the app question
-- (RAPP-666): its import folds it into the field's options.
reset role;
select lives_ok(
  $$ select private.fold_app_option_overrides('5eed0000-0000-4000-8000-000000000000', 'clothing_size',
       '{"M": {"label": {"ca": "Mitjana"}}}'::jsonb) $$,
  'an older setup file''s option wording is applied');
select is(
  (select o.label ->> 'ca' from public.custom_question_options o
    where o.question_id = pg_temp.sys('clothing_size') and o.key = 'M'),
  'Mitjana', 'the wording lands on the field''s option');

-- 7. Erasure ---------------------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select public.anonymize_participant('5eed0000-0000-4000-8000-000000000012');
reset role;
select is(
  (select count(*)::integer from public.audit_log
    where action = 'intake.answer_set_aside' and target_id = '5eed0000-0000-4000-8000-000000000012'),
  0, 'anonymizing her removes what a change set aside');

-- 8. Grants ----------------------------------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.preview_field_change(uuid, text, text, jsonb, jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.preview_field_change(uuid, text, text, jsonb, jsonb)', 'execute'),
  'the preview is for signed-in callers, who must be builders');
select is(
  (select count(*)::integer from unnest(array[
     'private.converted_answer(text, jsonb, text, jsonb, jsonb)',
     'private.apply_field_change(public.profile_fields, public.profile_fields)',
     'private.answer_items(text, jsonb)',
     'private.matching_option(jsonb, text, text, text)',
     'private.field_options_json(uuid)',
     'private.fold_app_option_overrides(uuid, text, jsonb)',
     'private.is_name_field(public.profile_fields)',
     'private.privacy_permission(text)']) fn
    where has_function_privilege('authenticated', fn, 'execute')
       or has_function_privilege('anon', fn, 'execute')),
  0, 'every helper stays private');

select * from finish();
rollback;
