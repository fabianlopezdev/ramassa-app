-- The app's answers live in the answer store only (RAPP-660, RAPP-666, D3, D13).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. After a reset, the seed's app answers are answers of their fields, at
--      their level: a choice by its option, a Sensitive answer encrypted. Her
--      names are never answers.
--   2. Her page reads every field's answers, the app's included.
--   3. The old storage is gone (RAPP-666): the app's profile columns,
--      `season_answers`, `profile_answers`, the copy and the sync.
--
-- Seed: organization ...000, staff ...002 (every level), 20 players ...011 to
-- ...030 (player ...011: Síria, NIE, Vic, no dependents), invited ...098
-- (answers the team gave).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

create temp table run (label text primary key, n integer) on commit drop;

create function pg_temp.field(p_key text) returns uuid language sql as $$
  select id from public.profile_fields where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = p_key;
$$;
create function pg_temp.option(p_key text, p_option text) returns jsonb language sql as $$
  select to_jsonb(o.id::text) from public.custom_question_options o
   where o.question_id = pg_temp.field(p_key) and o.key = p_option;
$$;
-- Her answer to an app field, decrypted; for a season when one is given.
create function pg_temp.answer(p_profile uuid, p_key text, p_season uuid default null) returns jsonb language sql as $$
  select coalesce(a.value, (public.decrypt_field(a.value_encrypted))::jsonb) from public.custom_answers a
   where a.profile_id = p_profile and a.question_id = pg_temp.field(p_key)
     and a.season_key = coalesce(p_season, '00000000-0000-0000-0000-000000000000');
$$;
-- 1. The seed -------------------------------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.custom_answers a
     join public.profiles p on p.id = a.profile_id and p.role = 'player'
    where a.question_id in (pg_temp.field('date_of_birth'), pg_temp.field('nationality'), pg_temp.field('city'),
                            pg_temp.field('phone'), pg_temp.field('document_type'), pg_temp.field('has_dependents'),
                            pg_temp.field('clothing_size'), pg_temp.field('shoe_size'))),
  160,
  'every seeded player answers her app fields by field'
);
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', 'nationality'), '"Síria"'::jsonb,
          'a country is its canonical name');
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', 'document_type'),
          pg_temp.option('document_type', 'nie'), 'a choice is the option with the stored key');
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', 'has_dependents'),
          pg_temp.option('has_dependents', 'no'), 'no dependents is the no option');
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', 'num_dependents'), null,
          'and leaves no number');
select is(
  (select value is null and public.decrypt_field(value_encrypted) = '"+34600000011"'
     from public.custom_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000011' and question_id = pg_temp.field('phone')),
  true,
  'a Sensitive answer is stored encrypted'
);
select ok(
  (select count(*)::integer from public.custom_answers
    where question_id in (pg_temp.field('first_name'), pg_temp.field('last_name'))) > 0,
  'her names are answers (RAPP-693)'
);
select is(
  (select string_agg(a.source, ',' order by a.source) from public.custom_answers a
    where a.profile_id = '5eed0000-0000-4000-8000-000000000098'),
  -- Her two names included (RAPP-693).
  'staff,staff,staff,staff,staff,staff',
  'an answer the team gave says so'
);
select is(
  (select a.source from public.custom_answers a
    where a.profile_id = '5eed0000-0000-4000-8000-000000000011' and a.question_id = pg_temp.field('city')),
  'player',
  'and a joined player''s answer with no other record is hers'
);

-- 2. The readers ----------------------------------------------------------------------------------------------

-- Since RAPP-662 her page reads every field's answers, the app's included.
create temp table expected_answers on commit drop as
  select count(*)::integer as n from public.custom_answers where profile_id = '5eed0000-0000-4000-8000-000000000098';
grant select on expected_answers to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select count(*)::integer from public.participant_custom_answers('5eed0000-0000-4000-8000-000000000098')),
  (select n from expected_answers),
  'her page reads every field''s answers, the app''s included'
);
reset role;

-- 3. The old storage is gone ---------------------------------------------------------------------------------

select ok(
  to_regclass('public.season_answers') is null and to_regclass('public.profile_answers') is null
  and not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name in ('date_of_birth', 'place_of_birth', 'nationality', 'document_type', 'document_number',
                           'document_name', 'phone', 'address', 'city', 'postal_code', 'reference_entity',
                           'reference_contact_name', 'has_dependents', 'num_dependents', 'clothing_size',
                           'shoe_size', 'applicant_status', 'applicant_status_details', 'supporting_entities',
                           'childcare_need', 'specific_needs', 'search_document')),
  'the app''s columns, season_answers and profile_answers are gone'
);
select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.proname in ('copy_app_answers', 'mirror_app_answer', 'mirror_app_answers_from_profile',
                         'mirror_app_answers_from_season', 'mirror_app_answer_origin', 'app_field_raw_values',
                         'season_field_raw_values', 'app_answer_value', 'referral_blob_answers',
                         'mirror_referral_blob_answers')),
  'and so are the copy and the sync'
);

select * from finish();
rollback;
