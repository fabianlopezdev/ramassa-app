begin;
select plan(17);

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

-- The unsigned path is closed to clients (RAPP-624); this file checks its merge
-- rules as the participant, so it grants it inside this rolled-back transaction.
grant execute on function public.complete_onboarding(jsonb) to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal1"}';
-- Her answers travel by field (RAPP-661); what she saved is read from them.
select lives_ok($$ select public.update_own_profile(jsonb_build_object('answers', pg_temp.answers(
  '{"place_of_birth":"Aleppo","document_type":"other","document_name":"Residence permit","document_number":null}'))) $$,
  'Other has a name and may omit its number');
select is(pg_temp.stored('5eed0000-0000-4000-8000-000000000011', 'document_name') #>> '{}', 'Residence permit', 'the document name survives the own-profile RPC');
select is(pg_temp.stored('5eed0000-0000-4000-8000-000000000011', 'document_number'), null, 'no number is fabricated for Other');
select lives_ok($$ select public.update_own_profile(jsonb_build_object('answers', pg_temp.answers(
  '{"place_of_birth":"Aleppo"}'))) $$,
  'an older client may omit the new field');
select is(pg_temp.stored('5eed0000-0000-4000-8000-000000000011', 'document_name') #>> '{}', 'Residence permit', 'an unrelated edit preserves its name');
select lives_ok($$ select public.update_own_profile(jsonb_build_object('answers', pg_temp.answers(
  '{"document_name":""}'))) $$, 'legacy edits may clear the optional metadata');
reset role;
-- Inspect the denied ACL: invoking it crashes the local Supabase 17.6 image.
-- https://github.com/supabase/supautils/issues/214
select ok(not has_function_privilege('anon', 'public.get_own_profile()', 'execute'),
  'anonymous clients cannot read document names');
set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000012","role":"authenticated","aal":"aal1"}';
select is((select count(*)::integer from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011')), 0, 'another player cannot read the participant document');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal1"}';
select lives_ok($$ select public.update_own_profile(jsonb_build_object('answers', pg_temp.answers(
  '{"document_type":"passport","document_number":"AB12345"}'))) $$, 'passport still accepts a number');
select is(pg_temp.stored('5eed0000-0000-4000-8000-000000000011', 'document_name'), null, 'changing type clears the old document name');
select throws_ok($$ select public.update_own_profile(jsonb_build_object('answers', pg_temp.answers(
  '{"document_number":null}'))) $$,
  '23502', null::text, 'passport still requires its number');
select is(pg_temp.stored('5eed0000-0000-4000-8000-000000000011', 'document_number') #>> '{}', 'AB12345', 'a rejected edit preserves the document');
reset role;
create temp table onboarding_account as select id from auth.users where email = 'onboarding@example.test';
grant select on onboarding_account to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from onboarding_account), 'role', 'authenticated', 'aal', 'aal1')::text, true);
select lives_ok($$ select public.complete_onboarding(jsonb_build_object('first_name','Nadia','last_name','Khoury','preferred_language','ca','media_consent',false,'terms_version','2026-07-01','locale_shown','ca','answers',pg_temp.answers('{"date_of_birth":"1993-11-02","place_of_birth":"Homs","nationality":"Síria","document_type":"other","document_name":"Residence permit","document_number":null,"has_dependents":"no","reference_entity":null,"clothing_size":"M","shoe_size":"38"}'))) $$, 'wizard completion stores Other with an optional number');
select is(pg_temp.stored((select id from onboarding_account), 'document_name') #>> '{}', 'Residence permit', 'wizard document name is returned on the next read');
select throws_ok($$ select public.complete_onboarding(jsonb_build_object('media_consent',false,'terms_version','2026-07-01','locale_shown','ca','answers',pg_temp.answers('{"document_type":"other","document_name":"","document_number":null}'))) $$, '23502', null::text, 'a new Other choice requires its document name');
reset role;
-- An erasure clears this added personal field as well as the existing ones.
select private.write_custom_answer('5eed0000-0000-4000-8000-000000000011', f, '"Permit"', 'player')
  from public.profile_fields f
 where f.org_id = '5eed0000-0000-4000-8000-000000000000' and f.system_key = 'document_name';
set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","amr":[{"method":"totp","timestamp":4102444800}]}';
select lives_ok($$ select public.anonymize_participant('5eed0000-0000-4000-8000-000000000011') $$, 'existing erasure includes the new name');
reset role;
select is(pg_temp.stored('5eed0000-0000-4000-8000-000000000011', 'document_name'), null, 'erasure leaves no document name');
select * from finish();
rollback;
