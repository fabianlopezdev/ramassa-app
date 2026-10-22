begin;
select plan(17);

-- The unsigned path is closed to clients (RAPP-624); this file checks its merge
-- rules as the participant, so it grants it inside this rolled-back transaction.
grant execute on function public.complete_onboarding(jsonb) to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal1"}';
select lives_ok($$ select public.update_own_profile(
  (select to_jsonb(p) from public.get_own_profile() p) ||
  '{"place_of_birth":"Aleppo","document_type":"other","document_name":"Residence permit","document_number":null}'::jsonb) $$,
  'Other has a name and may omit its number');
select is((select document_name from public.get_own_profile()), 'Residence permit', 'the document name survives the own-profile RPC');
select is((select document_number from public.get_own_profile()), null, 'no number is fabricated for Other');
select lives_ok($$ select public.update_own_profile(
  (select to_jsonb(p) - 'document_name' from public.get_own_profile() p) || '{"place_of_birth":"Aleppo"}'::jsonb) $$,
  'an older client may omit the new field');
select is((select document_name from public.get_own_profile()), 'Residence permit', 'an unrelated edit preserves its name');
select lives_ok($$ select public.update_own_profile(
  (select to_jsonb(p) from public.get_own_profile() p) || '{"document_name":""}'::jsonb) $$, 'legacy edits may clear the optional metadata');
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
select lives_ok($$ select public.update_own_profile(
  (select to_jsonb(p) from public.get_own_profile() p) || '{"document_type":"passport","document_number":"AB12345"}'::jsonb) $$, 'passport still accepts a number');
select is((select document_name from public.get_own_profile()), null, 'changing type clears the old document name');
select throws_ok($$ select public.update_own_profile(
  (select to_jsonb(p) from public.get_own_profile() p) || '{"document_number":null}'::jsonb) $$,
  '23502', null::text, 'passport still requires its number');
select is((select document_number from public.get_own_profile()), 'AB12345', 'a rejected edit preserves the document');
reset role;
create temp table onboarding_account as select id from auth.users where email = 'onboarding@example.test';
grant select on onboarding_account to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from onboarding_account), 'role', 'authenticated', 'aal', 'aal1')::text, true);
select lives_ok($$ select public.complete_onboarding('{"first_name":"Nadia","last_name":"Khoury","date_of_birth":"1993-11-02","place_of_birth":"Homs","nationality":"Síria","preferred_language":"ca","document_type":"other","document_name":"Residence permit","document_number":null,"has_dependents":false,"num_dependents":0,"reference_entity":null,"clothing_size":"M","shoe_size":"38","media_consent":false,"terms_version":"2026-07-01","locale_shown":"ca"}'::jsonb) $$, 'wizard completion stores Other with an optional number');
select is((select document_name from public.get_own_profile()), 'Residence permit', 'wizard document name is returned on the next read');
select throws_ok($$ select public.complete_onboarding('{"document_type":"other","document_name":"","document_number":null,"media_consent":false,"terms_version":"2026-07-01","locale_shown":"ca"}'::jsonb) $$, '23502', null::text, 'a new Other choice requires its document name');
reset role;
-- An erasure clears this added personal field as well as the existing ones.
update public.profiles set document_type = 'other', document_name = 'Permit' where id = '5eed0000-0000-4000-8000-000000000011';
set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","amr":[{"method":"totp","timestamp":4102444800}]}';
select lives_ok($$ select public.anonymize_participant('5eed0000-0000-4000-8000-000000000011') $$, 'existing erasure includes the new name');
reset role;
select is((select document_name from public.profiles where id = '5eed0000-0000-4000-8000-000000000011'), null, 'erasure leaves no document name');
select * from finish();
rollback;
