-- Anonymizing her removes every answer (RAPP-662, D11).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Anonymizing deletes every answer of hers: the app's fields, the team's
--      fields, every season, and the old stores; only her birth year stays, in
--      her date of birth field.
--   2. A date of birth field that is no longer a date keeps nothing, and the
--      erasure still runs.
--   3. The search index forgets her, and the audit row names no value.
--   4. The registry says what anonymizing does; PUBLIC and anon cannot call it.
--
-- Seed: organization ...000, staff ...002 (rgpd.erase), player ...011 (staff
-- fields and a season answer, born 1996-12-12), player ...013.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

select ok(
  (select count(*) from public.custom_answers a join public.profile_fields f on f.id = a.question_id
    where a.profile_id = '5eed0000-0000-4000-8000-000000000011' and f.kind = 'custom') >= 2
    and (select count(*) from public.custom_answers
          where profile_id = '5eed0000-0000-4000-8000-000000000011' and season_id is not null) >= 1,
  'she starts with answers to the team''s fields and a season answer');

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok($$select public.anonymize_participant('5eed0000-0000-4000-8000-000000000011')$$,
  'staff anonymize her');
reset role;

-- 1. Every answer goes but the birth year -------------------------------------------------------------------

select results_eq(
  $$select f.system_key, coalesce(a.value, (public.decrypt_field(a.value_encrypted))::jsonb) #>> '{}'
      from public.custom_answers a join public.profile_fields f on f.id = a.question_id
     where a.profile_id = '5eed0000-0000-4000-8000-000000000011'$$,
  $$values ('date_of_birth'::text, '1996-01-01'::text)$$,
  'one answer is left: the first of January of her birth year');
select is(
  (select count(*)::int from public.season_answers where profile_id = '5eed0000-0000-4000-8000-000000000011')
    + (select count(*)::int from public.profile_answers where profile_id = '5eed0000-0000-4000-8000-000000000011'),
  0, 'the old season and source rows go too');
select ok(
  (select first_name = '' and last_name = '' and nationality is null and city is null and phone is null
          and document_number is null and applicant_status is null and specific_needs is null
          and supporting_entities is null and date_of_birth is null
     from public.profiles where id = '5eed0000-0000-4000-8000-000000000011'),
  'her names are empty and the old columns hold nothing');

-- 3. Search and audit ------------------------------------------------------------------------------------------

select ok(
  (select personal_document = ''::tsvector
     from public.participant_search_documents where profile_id = '5eed0000-0000-4000-8000-000000000011'),
  'the search index holds nothing of her');
select is(
  (select changes from public.audit_log
    where action = 'profile.anonymize' and target_id = '5eed0000-0000-4000-8000-000000000011'),
  '{"fields_cleared": true, "notes_deleted": true, "answers_deleted": true, "birth_year_kept": true}'::jsonb,
  'the audit row says what went, never a value');

-- 2. A date of birth that is no longer a date ------------------------------------------------------------------

update public.profile_fields set question_type = 'short_text'
 where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = 'date_of_birth';
set local role authenticated;
select lives_ok($$select public.anonymize_participant('5eed0000-0000-4000-8000-000000000013')$$,
  'anonymizing works when her date of birth field changed type');
reset role;
select is(
  (select count(*)::int from public.custom_answers where profile_id = '5eed0000-0000-4000-8000-000000000013'),
  0, 'and keeps no answer at all');
select is(
  (select changes ->> 'birth_year_kept' from public.audit_log
    where action = 'profile.anonymize' and target_id = '5eed0000-0000-4000-8000-000000000013'),
  'false', 'the audit row says no birth year was kept');

-- 4. Registry and grants -----------------------------------------------------------------------------------------

select ok(
  (select reason like '%Anonymizing deletes them all%' from public.personal_data_disposition()
    where table_name = 'custom_answers'),
  'the registry says anonymizing deletes every answer');
select ok(
  not has_function_privilege('anon', 'public.anonymize_participant(uuid)', 'execute')
    and not has_function_privilege('public', 'public.anonymize_participant(uuid)', 'execute'),
  'PUBLIC and anon cannot call it');

select * from finish();
rollback;
