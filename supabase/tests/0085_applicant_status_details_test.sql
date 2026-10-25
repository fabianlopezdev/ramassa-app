begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(18);

-- Her answers travel by field (RAPP-661). Helpers: the app's keys of a payload
-- keyed by their fields (a choice by its option), a field's id, and her stored
-- answer to an app field (decrypted).
create function pg_temp.answers(p jsonb) returns jsonb language sql security definer as $$
  select coalesce(jsonb_object_agg(f.id::text, private.app_answer_value(f, e.value)), '{}'::jsonb)
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
select has_column('public', 'profiles', 'applicant_status_details', 'Other situation has its own encrypted field');
select has_column('public', 'season_answers', 'applicant_status_details', 'the explanation belongs to the seasonal record too');
set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal1"}';
-- Her season answers travel by field (RAPP-661).
select lives_ok($$ select public.update_my_season_answers(jsonb_build_object('answers', pg_temp.answers('{"applicant_status":"other","applicant_status_details":"Example explanation"}'))) $$, 'a player can save their explanation through the existing validated API');
select is((select applicant_status_details from public.get_own_profile()), 'Example explanation', 'the owner can recover their explanation');
select throws_ok($$ select public.update_my_season_answers(jsonb_build_object('answers', pg_temp.answers(jsonb_build_object('applicant_status_details',repeat('x',4001))))) $$, '23514', null::text, 'the server rejects text beyond the long text limit');
reset role;
select ok((select value is null and encode(value_encrypted,'escape') not like '%Example explanation%' from public.custom_answers where profile_id='5eed0000-0000-4000-8000-000000000011' and question_id::text=pg_temp.field('applicant_status_details')), 'the explanation is encrypted at rest');
select is((select public.decrypt_field(value_encrypted) from public.custom_answers where profile_id='5eed0000-0000-4000-8000-000000000011' and question_id::text=pg_temp.field('applicant_status_details') and season_id='5eed0000-0000-4000-8040-000000000001'), '"Example explanation"', 'the season''s answer keeps the encrypted explanation');
set local role authenticated;
select lives_ok($$ select public.update_my_season_answers(jsonb_build_object('answers', pg_temp.answers('{"childcare_need":"no"}'))) $$, 'a partial update preserves the situation explanation');
select is(pg_temp.stored('5eed0000-0000-4000-8000-000000000011', 'applicant_status_details') #>> '{}', 'Example explanation', 'a sibling answer cannot wipe details');
select public.update_my_season_answers(jsonb_build_object('answers', pg_temp.answers('{"applicant_status":"migrant"}')));
select is(pg_temp.stored('5eed0000-0000-4000-8000-000000000011', 'applicant_status_details'), null, 'choosing another status clears obsolete text');

reset role;
-- Denial is checked without triggering the local Supabase error-hint crash.
-- https://github.com/supabase/supautils/issues/214
select ok(not has_function_privilege('anon', 'public.get_own_profile()', 'execute'),
  'anonymous clients cannot read situation explanations');
set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000012","role":"authenticated","aal":"aal1"}';
select is((select count(*)::integer from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011')),0,'another player cannot read the explanation');
reset role;
create temp table onboarding_account as select id from auth.users where email='onboarding@example.test';
grant select on onboarding_account to authenticated;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',(select id from onboarding_account),'role','authenticated','aal','aal1')::text,true);
select lives_ok($$ select public.complete_onboarding(jsonb_build_object('first_name','Nadia','last_name','Khoury','preferred_language','ca','media_consent',false,'terms_version','2026-07-01','locale_shown','ca','answers',pg_temp.answers('{"date_of_birth":"1993-11-02","place_of_birth":"Homs","nationality":"Síria","document_type":"none","has_dependents":"no","reference_entity":null,"clothing_size":"M","shoe_size":"38","applicant_status":"other","applicant_status_details":"Wizard explanation"}'))) $$,'wizard completion saves the explanation atomically');
select is(pg_temp.stored((select id from onboarding_account), 'applicant_status_details') #>> '{}','Wizard explanation','wizard explanation is recoverable after completion');
reset role;
update public.profiles set applicant_status=public.encrypt_field('other'),applicant_status_details=public.encrypt_field('Example explanation') where id='5eed0000-0000-4000-8000-000000000011';
set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","amr":[{"method":"totp","timestamp":4102444800}]}';
select is((select applicant_status_details from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011')),'Example explanation','staff with sensitive access can read the explanation');
select lives_ok($$ select public.anonymize_participant('5eed0000-0000-4000-8000-000000000011') $$,'existing erasure includes the explanation');
reset role;
select ok((select applicant_status_details is null from public.profiles where id='5eed0000-0000-4000-8000-000000000011'),'erasure clears the profile explanation');
select is((select count(*)::integer from public.season_answers where profile_id='5eed0000-0000-4000-8000-000000000011' and applicant_status_details is not null),0,'erasure clears every seasonal copy');

select * from finish();
rollback;
