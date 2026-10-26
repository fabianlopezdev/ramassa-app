-- The app's old answer storage is dropped (RAPP-666, D13).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. `profiles` keeps her names and her account settings only: no app
--      column, no search document, no foreign key to the municipality catalog.
--   2. No old trigger or old-storage function is left.
--   3. A referral's blob holds her season count only.
--   4. The team's, an entity's and the preview accounts get no answers.
--   5. The erasure registry lists no dropped table.
--
-- Seed: organization ...000, admin ...001, pending referral ...8010-...001
-- (season count 2), the entity Creu Roja Osona ...8030-...001.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

create temp table run (label text primary key, id uuid) on commit drop;
grant all on run to authenticated;

-- 1. Her profile -------------------------------------------------------------------------------------------

select is(
  (select array_agg(column_name::text order by column_name) from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name not in ('id', 'org_id', 'role', 'created_at', 'updated_at')),
  array['anonymized_at', 'avatar_url', 'collaborating_entity_id', 'emergency_contact_name',
        'emergency_contact_phone', 'emergency_contact_privacy', 'emergency_contact_relation', 'first_name',
        'health_info', 'is_active', 'is_forum_banned', 'is_test_account', 'last_name', 'media_consent_at',
        -- Her number, where her name is private (RAPP-693).
        'member_number', 'preferred_language', 'prior_seasons', 'push_notifications_enabled', 'season_number',
        'sessions_valid_after', 'terms_accepted_at'],
  'a profile holds her names and her account settings only'
);
select ok(
  not exists (select 1 from pg_constraint c
               where c.conrelid = 'public.profiles'::regclass and c.confrelid = 'public.municipality_catalog'::regclass),
  'no foreign key ties her profile to the municipality catalog'
);
select ok(
  not exists (select 1 from pg_indexes
               where schemaname = 'public' and tablename = 'profiles' and indexdef ilike '%search_document%'),
  'the search document index is gone'
);

-- 2. Old triggers and functions --------------------------------------------------------------------------

select is(
  (select count(*)::integer from pg_trigger t
    where not t.tgisinternal
      and t.tgname in ('profiles_temporary_app_answers_sync', 'entity_referrals_temporary_blob_answers',
                       'profiles_snapshot_season_answers', 'profiles_record_joined_answers',
                       'normalize_applicant_status_details', 'normalize_document_name',
                       'profiles_erase_applicant_status_details', 'builtin_question_overrides_fold_options')),
  0,
  'no old trigger is left'
);
select ok(
  to_regprocedure('private.season_answers_valid(jsonb)') is null
  and to_regprocedure('private.referral_answers_valid(jsonb)') is null
  and to_regprocedure('private.snapshot_season_answers(uuid)') is null
  and to_regprocedure('private.record_joined_profile_answers()') is null
  and to_regprocedure('private.support_needs_valid(text)') is null
  and to_regprocedure('private.scenario_answer_keys()') is null
  and to_regprocedure('private.text_array_answer(jsonb)') is null
  and to_regprocedure('private.sync_builtin_placements_required(uuid)') is null
  and to_regprocedure('private.system_field_required(text, uuid)') is null
  and to_regprocedure('private.builtin_intake_questions()') is null,
  'no function is left for the old storage'
);

-- 3. A referral's blob -----------------------------------------------------------------------------------

select is(
  (select public.decrypt_field(r.intake_answers)::jsonb from public.entity_referrals r
    where r.id = '5eed0000-0000-4000-8010-000000000001'),
  '{"season_number": 2}'::jsonb,
  'the pending referral''s blob holds her season count only'
);
select ok(
  (select count(*) from public.referral_custom_answers r
    where r.referral_id = '5eed0000-0000-4000-8010-000000000001') >= 11,
  'its answers are by field'
);

-- 4. Accounts that are not participants -----------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into run (label, id)
select 'staff', i.profile_id from public.invite_staff_member('rapp666.staff@example.test', 'Clara', 'Prova', 'staff') i;
insert into run (label, id)
select 'entity', i.profile_id
  from public.invite_entity_collaborator('5eed0000-0000-4000-8030-000000000001',
                                         'rapp666.entity@example.test', 'Pau', 'Prova') i;
reset role;
select is(
  (select count(*)::integer from public.profiles p where p.id in (select id from run)),
  2,
  'a team member and an entity contact get a profile'
);
select is(
  (select count(*)::integer from public.custom_answers a where a.profile_id in (select id from run)),
  0,
  'and no answer: they are not participants'
);

-- 5. The erasure registry ------------------------------------------------------------------------------

select ok(
  not exists (select 1 from public.personal_data_disposition() d
               where d.table_name in ('season_answers', 'profile_answers', 'intake_question_states',
                                      'builtin_question_overrides', 'intake_required_questions')),
  'the erasure registry names no dropped table'
);

select * from finish();
rollback;
