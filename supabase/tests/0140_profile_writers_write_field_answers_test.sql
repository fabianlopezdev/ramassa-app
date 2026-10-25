-- Her writers save answers by field (RAPP-661).
-- Run with: bunx supabase test db
--
-- What these assertions defend, writer by writer:
--   1. Registration (`complete_onboarding_signed`): her names on her account,
--      every other answer by field, hers, Sensitive ones encrypted; a column
--      key refused; required placements, the
--      entity question's "none", the document rule and conditions applied.
--   2. Her own edit (`update_own_profile`).
--   3. The team's edit (`update_participant_profile`): answers named after
--      the team member, a Sensitive field left alone for a caller who cannot
--      read it, the audit redacted by the field's level, the document rule
--      only on a joined record.
--   4. The team's prefill at invitation (`create_participant_invite`), and
--      hiding a required question she has an answer to.
--   5. Her season answers (`update_my_season_answers`): only season fields,
--      conditions, required season placements.
--   6. `set_participant_custom_answers` takes the app's fields too.
--   7. The test player switches take field ids.
--   8. Signing no longer copies season columns; the helpers stay private.
--
-- Seed: organization ...000 (current season ...8040-...001), admin ...001
-- (test players), staff ...002 and ...003 (every level), entity ...004,
-- player ...011 (Síria, NIE, Vic), invited ...098, test player ...096.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(52);

create temp table run (label text primary key, id uuid) on commit drop;
grant all on run to authenticated;

create function pg_temp.field(p_key text) returns uuid language sql security definer as $$
  select id from public.profile_fields where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = p_key;
$$;
create function pg_temp.option(p_key text, p_option text) returns text language sql security definer as $$
  select o.id::text from public.custom_question_options o
   where o.question_id = pg_temp.field(p_key) and o.key = p_option;
$$;
-- Her current answer to a field, decrypted.
create function pg_temp.answer(p_profile uuid, p_field uuid) returns jsonb language sql security definer as $$
  select private.field_answer_now(p_profile, f) from public.profile_fields f where f.id = p_field;
$$;
create function pg_temp.source(p_profile uuid, p_field uuid) returns text language sql security definer as $$
  select a.source || '/' || coalesce(a.answered_by::text, '-') from public.custom_answers a
   where a.profile_id = p_profile and a.question_id = p_field;
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1. Registration ------------------------------------------------------------------------------------------

insert into auth.users (id, email) values ('5eed0000-0000-4000-8000-0000000006b1', 'rapp661.new@test.local');

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-0000000006b1", "role": "authenticated", "aal": "aal1"}';

select throws_ok(
  $$select public.complete_onboarding_signed(
      '{"first_name": "Nora", "last_name": "Prova", "place_of_birth": "Vic", "terms_version": "t", "locale_shown": "ca", "media_consent": false}',
      '{"terms_accepted": true, "media_consent": false, "signature": null, "unable_to_draw": true}')$$,
  '22023', null, 'a column key is refused, so an older build never loses what she typed');

select throws_ok(
  format($$select public.complete_onboarding_signed(%L, '{"terms_accepted": true, "media_consent": false, "signature": null, "unable_to_draw": true}')$$,
    jsonb_build_object('first_name', 'Nora', 'last_name', 'Prova', 'terms_version', 't', 'locale_shown', 'ca',
      'media_consent', false, 'answers', jsonb_build_object(
        pg_temp.field('place_of_birth'), 'Vic', pg_temp.field('nationality'), 'Síria',
        pg_temp.field('clothing_size'), pg_temp.option('clothing_size', 'M'),
        pg_temp.field('shoe_size'), pg_temp.option('shoe_size', '38'),
        pg_temp.field('has_dependents'), pg_temp.option('has_dependents', 'no'),
        pg_temp.field('reference_entity'), null))),
  '23502', 'complete_onboarding requires an answer to a required question',
  'a required placement with no answer refuses her registration');

select throws_ok(
  format($$select public.complete_onboarding_signed(%L, '{"terms_accepted": true, "media_consent": false, "signature": null, "unable_to_draw": true}')$$,
    jsonb_build_object('first_name', 'Nora', 'last_name', 'Prova', 'terms_version', 't', 'locale_shown', 'ca',
      'media_consent', false, 'answers', jsonb_build_object(
        pg_temp.field('date_of_birth'), '1996-03-04', pg_temp.field('place_of_birth'), 'Vic',
        pg_temp.field('nationality'), 'Síria',
        pg_temp.field('clothing_size'), pg_temp.option('clothing_size', 'M'),
        pg_temp.field('shoe_size'), pg_temp.option('shoe_size', '38'),
        pg_temp.field('has_dependents'), pg_temp.option('has_dependents', 'no'),
        pg_temp.field('reference_entity'), null,
        pg_temp.field('document_type'), pg_temp.option('document_type', 'passport')))),
  '23502', 'a document needs its number', 'a document type without its number is refused');

select throws_ok(
  format($$select public.complete_onboarding_signed(%L, '{"terms_accepted": true, "media_consent": false, "signature": null, "unable_to_draw": true}')$$,
    jsonb_build_object('first_name', 'Nora', 'last_name', 'Prova', 'terms_version', 't', 'locale_shown', 'ca',
      'media_consent', false, 'answers', jsonb_build_object(
        '5eed0000-0000-4000-8045-000000000004', 'Sants'))),
  '42501', 'not a question she is asked', 'a team-only field is not hers to answer');

select lives_ok(
  format($$select public.complete_onboarding_signed(%L, '{"terms_accepted": true, "media_consent": false, "signature": null, "unable_to_draw": true}')$$,
    jsonb_build_object('first_name', ' Nora ', 'last_name', 'Prova', 'preferred_language', 'es',
      'terms_version', 't', 'locale_shown', 'ca', 'media_consent', false, 'answers', jsonb_build_object(
        pg_temp.field('date_of_birth'), '1996-03-04', pg_temp.field('place_of_birth'), 'Vic',
        pg_temp.field('nationality'), 'Síria',
        pg_temp.field('clothing_size'), pg_temp.option('clothing_size', 'M'),
        pg_temp.field('shoe_size'), pg_temp.option('shoe_size', '38'),
        pg_temp.field('has_dependents'), pg_temp.option('has_dependents', 'no'),
        pg_temp.field('num_dependents'), 3,
        -- "None" is an answer to the entity question.
        pg_temp.field('reference_entity'), '',
        pg_temp.field('document_type'), pg_temp.option('document_type', 'passport'),
        pg_temp.field('document_number'), 'PA123456',
        pg_temp.field('phone'), '+34600006661',
        '5eed0000-0000-4000-8045-000000000001', 'yes'))),
  'her registration saves her names and her answers by field');

reset role;
select is(
  (select first_name || ' ' || last_name || ' ' || role || ' ' || preferred_language
     from public.profiles where id = '5eed0000-0000-4000-8000-0000000006b1'),
  'Nora Prova player es', 'her names and language are on her account');
select is(pg_temp.answer('5eed0000-0000-4000-8000-0000000006b1', pg_temp.field('date_of_birth')),
          '"1996-03-04"'::jsonb, 'a date is her answer by field');
select is(pg_temp.source('5eed0000-0000-4000-8000-0000000006b1', pg_temp.field('nationality')),
          'player/-', 'and hers');
select is(
  (select value is null and (public.decrypt_field(value_encrypted))::jsonb = '"+34600006661"'::jsonb
     from public.custom_answers
    where profile_id = '5eed0000-0000-4000-8000-0000000006b1' and question_id = pg_temp.field('phone')),
  true, 'a Sensitive answer is encrypted');
select is(pg_temp.answer('5eed0000-0000-4000-8000-0000000006b1', pg_temp.field('num_dependents')), null,
          'a number of dependents on no is cleared by its condition');
select is(pg_temp.answer('5eed0000-0000-4000-8000-0000000006b1', '5eed0000-0000-4000-8045-000000000001'),
          '"yes"'::jsonb, 'a staff field travels in the same answers');

-- 2. Her own edit --------------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select lives_ok(
  format($$select public.update_own_profile(%L)$$, jsonb_build_object(
    'media_consent', true, 'answers', jsonb_build_object(
      pg_temp.field('city'), 'Manlleu',
      pg_temp.field('document_type'), pg_temp.option('document_type', 'none')))),
  'she edits her answers by field');
reset role;
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', pg_temp.field('city')), '"Manlleu"'::jsonb,
          'her answer changed');
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', pg_temp.field('document_number')), null,
          'no document takes the number away');
select is((select media_consent_at is not null from public.profiles where id = '5eed0000-0000-4000-8000-000000000011'),
          true, 'her account settings change on her account');

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select throws_ok($$select public.update_own_profile('{"city": "Olot"}')$$, '22023', null,
                 'her own edit refuses a column key');
select throws_ok($$select public.update_own_profile('{"role": "staff"}')$$, '22023', null,
                 'and a key that is not hers to change');
set local request.jwt.claims = '{}';
select throws_ok($$select public.update_own_profile('{}')$$, '42501', null, 'nobody signed in edits nothing');
reset role;

-- 3. The team's edit -----------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  format($$select public.update_participant_profile('5eed0000-0000-4000-8000-000000000011', %L)$$,
    jsonb_build_object('answers', jsonb_build_object(
      pg_temp.field('nationality'), 'Marroc', pg_temp.field('phone'), '+34600006662'))),
  'the team edits her answers by field');
reset role;
select is(pg_temp.source('5eed0000-0000-4000-8000-000000000011', pg_temp.field('nationality')),
          'staff/5eed0000-0000-4000-8000-000000000002', 'an answer the team gives names who gave it');
select is(
  (select changes from public.audit_log
    where action = 'profile.update' and target_id = '5eed0000-0000-4000-8000-000000000011'
    order by created_at desc limit 1),
  jsonb_build_object(pg_temp.field('nationality')::text, jsonb_build_object('old', 'Síria', 'new', 'Marroc'),
                     pg_temp.field('phone')::text, jsonb_build_object('changed', true)),
  'the audit names each change, and a Sensitive field''s value never enters it');

delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000003' and permission_code = 'participants.view_sensitive';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  format($$select public.update_participant_profile('5eed0000-0000-4000-8000-000000000011', %L)$$,
    jsonb_build_object('answers', jsonb_build_object(
      pg_temp.field('postal_code'), null, pg_temp.field('place_of_birth'), 'Tànger'))),
  'a team member who cannot read Sensitive answers edits the rest');
reset role;
select is(
  (select public.decrypt_field(value_encrypted) from public.custom_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000011' and question_id = pg_temp.field('postal_code')) is not null,
  true, 'and the Sensitive one she sent stays as stored');
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', pg_temp.field('place_of_birth')),
          '"Tànger"'::jsonb, 'while the other one changed');

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  format($$select public.update_participant_profile('5eed0000-0000-4000-8000-000000000011', %L)$$,
    jsonb_build_object('answers', jsonb_build_object(
      pg_temp.field('document_type'), pg_temp.option('document_type', 'nie')))),
  '23502', 'a document needs its number', 'a joined record keeps the document rule');
select lives_ok(
  format($$select public.update_participant_profile('5eed0000-0000-4000-8000-000000000098', %L)$$,
    jsonb_build_object('season_number', 3, 'answers', jsonb_build_object(
      pg_temp.field('document_type'), pg_temp.option('document_type', 'nie')))),
  'a woman the team is still completing may get her number later');
select throws_ok(
  $$select public.update_participant_profile('5eed0000-0000-4000-8000-000000000011', '{"first_name": " "}')$$,
  '23514', null, 'her name is never emptied');
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$select public.update_participant_profile('5eed0000-0000-4000-8000-000000000011', '{"answers": {}}')$$,
  '42501', null, 'an entity contact cannot edit her record');
reset role;
select is((select season_number::text || '/' || prior_seasons from public.profiles
            where id = '5eed0000-0000-4000-8000-000000000098'), '3/2',
          'her season count stays on her account');

-- 4. The team's prefill at invitation -----------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$select public.create_participant_invite('{"email": "rapp661.old@example.test", "first_name": "Aya", "last_name": "Prova", "city": "Vic"}')$$,
  '22023', null, 'an invitation refuses a column key');
select throws_ok(
  format($$select public.create_participant_invite(%L)$$, jsonb_build_object(
    'email', 'rapp661.skip@example.test', 'first_name', 'Aya', 'last_name', 'Prova',
    'question_states', jsonb_build_object('date_of_birth', 'skip'))),
  '23514', null, 'a required question she has no answer to cannot be hidden');
insert into run select 'invited', (select profile_id from public.create_participant_invite(jsonb_build_object(
  'email', 'rapp661.invite@example.test', 'first_name', 'Aya', 'last_name', 'Prova',
  'reference_entity', 'CEAR Catalunya',
  'question_states', jsonb_build_object('date_of_birth', 'skip'),
  'answers', jsonb_build_object(
    pg_temp.field('date_of_birth'), '1998-01-02', pg_temp.field('reference_entity'), 'CEAR Catalunya'))));
reset role;
select is(pg_temp.source((select id from run where label = 'invited'), pg_temp.field('date_of_birth')),
          'staff/5eed0000-0000-4000-8000-000000000002', 'the team''s answers land on her fields as theirs');
select is((select reference_entity from public.invites where email = 'rapp661.invite@example.test'),
          'CEAR Catalunya', 'the invitation keeps the entity her wizard offers first');
select is((select state from public.custom_question_states
            where profile_id = (select id from run where label = 'invited')
              and question_id = pg_temp.field('date_of_birth')),
          'skip', 'and a required question she has an answer to can be hidden');

-- 5. Her season answers --------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select lives_ok(
  format($$select public.update_my_season_answers(%L)$$, jsonb_build_object('answers', jsonb_build_object(
    pg_temp.field('applicant_status'), pg_temp.option('applicant_status', 'other'),
    pg_temp.field('applicant_status_details'), 'Ho explicarà'))),
  'her season answers are saved by field');
reset role;
select is(
  (select season_id::text || '/' || source from public.custom_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000011' and question_id = pg_temp.field('applicant_status_details')),
  '5eed0000-0000-4000-8040-000000000001/player', 'for the current season, as hers');
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select lives_ok(
  format($$select public.update_my_season_answers(%L)$$, jsonb_build_object('answers', jsonb_build_object(
    pg_temp.field('applicant_status'), pg_temp.option('applicant_status', 'refugee')))),
  'she changes her status');
reset role;
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', pg_temp.field('applicant_status_details')), null,
          'details that open on other go when the status is no longer other');
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  format($$select public.update_my_season_answers(%L)$$, jsonb_build_object('answers', jsonb_build_object(
    pg_temp.field('date_of_birth'), '1990-01-01'))),
  '22023', null, 'a field off the season form is refused');
select lives_ok(
  format($$select public.update_my_season_answers(%L)$$, jsonb_build_object('answers', jsonb_build_object(
    pg_temp.field('date_of_birth'), null))),
  'an empty answer to a field off the season form changes nothing');
reset role;
update public.field_placements set required = true
 where field_id = pg_temp.field('childcare_need') and surface = 'season';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  format($$select public.update_my_season_answers(%L)$$, jsonb_build_object('answers', jsonb_build_object(
    pg_temp.field('childcare_need'), null))),
  '23502', null, 'a required season placement needs this season''s answer');
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2"}';
select throws_ok($$select public.update_my_season_answers('{"answers": {}}')$$, '42501', null,
                 'only a player answers her season questions');
reset role;

-- 6. Her answers on her page take every field ---------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  format($$select public.set_participant_custom_answers('5eed0000-0000-4000-8000-000000000011', %L)$$,
    jsonb_build_object(pg_temp.field('city'), 'Olot')),
  'her page saves an app field like any other');
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  format($$select public.set_participant_custom_answers('5eed0000-0000-4000-8000-000000000011', %L)$$,
    jsonb_build_object(pg_temp.field('phone'), '+34600000000')),
  '42501', null, 'and refuses a Sensitive one to a team member who cannot read it');
select throws_ok(
  format($$select public.set_participant_custom_answers('5eed0000-0000-4000-8000-000000000011', %L)$$,
    jsonb_build_object(pg_temp.field('first_name'), 'Una altra')),
  '23514', 'her names stay on her account', 'her names are never answers');
reset role;
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', pg_temp.field('city')), '"Olot"'::jsonb,
          'the app field changed');

-- 7. The test player switches -------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  format($$select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096', %L)$$,
    jsonb_build_object('kind', 'answers', 'fill', jsonb_build_object('answers', jsonb_build_object(
      pg_temp.field('city'), 'Vic', pg_temp.field('phone'), '+34600006663')))),
  'a sample answer is filled by field');
select lives_ok(
  format($$select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096', %L)$$,
    jsonb_build_object('kind', 'answers', 'clear', jsonb_build_array(pg_temp.field('city')))),
  'and cleared by field');
select throws_ok(
  $$select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096', '{"kind": "custom_answers", "fill": {}}')$$,
  '22023', null, 'the staff fields'' switch folded into answers');
reset role;
select is(
  (select string_agg(f.system_key, ',' order by f.system_key) from public.custom_answers a
     join public.profile_fields f on f.id = a.question_id
    where a.profile_id = '5eed0000-0000-4000-8000-000000000096' and f.system_key in ('city', 'phone')),
  'phone', 'what was filled and cleared shows');

-- 8. Signing and the helpers --------------------------------------------------------------------------------

select hasnt_trigger('public', 'authorization_signatures', 'authorization_signatures_snapshot_season_answers',
                     'signing no longer copies season columns over her answers');
select ok(not has_function_privilege('authenticated',
            'private.write_field_answers(uuid, jsonb, text, uuid, boolean, text)', 'execute')
          and not has_function_privilege('authenticated', 'private.apply_profile_prefill(uuid, jsonb, text, uuid)', 'execute')
          and not has_function_privilege('authenticated', 'private.apply_document_rule(uuid, boolean, boolean)', 'execute')
          and not has_function_privilege('anon', 'public.update_own_profile(jsonb)', 'execute'),
          'the writers'' helpers stay private, and her own edit needs an account');

select * from finish();
rollback;
