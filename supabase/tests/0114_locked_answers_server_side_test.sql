-- Pending fix 22 (RAPP-624): her first and last name are never saved empty,
-- by her (update_own_profile) or by staff (update_participant_profile).
-- Run with: bunx supabase test db
--
-- Seed: player ...011, staff ...002 (participants.view_personal), player ...022.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(4);

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

select vault.create_secret('test-encryption-key', 'app_encryption_key', 'pgTAP test key')
where not exists (select 1 from vault.secrets where name = 'app_encryption_key');

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
-- The locked answers ---------------------------------------------------------------------------------

select throws_ok(
  $$ select public.update_own_profile('{"first_name": " ", "last_name": "Khoury", "media_consent": false}'::jsonb) $$,
  '23514', 'her first name, last name and app language are always required',
  'she cannot empty her first name'
);
select throws_ok(
  $$ select public.update_own_profile('{"first_name": "Nadia", "last_name": "", "media_consent": false}'::jsonb) $$,
  '23514', null::text, 'nor her last name'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.update_participant_profile('5eed0000-0000-4000-8000-000000000022',
       jsonb_build_object('first_name', '', 'last_name', 'Prova',
         'answers', pg_temp.answers('{"place_of_birth": "Vic", "document_type": "none"}'))) $$,
  '23514', null::text, 'staff cannot empty it either'
);

select lives_ok(
  $$ select public.update_participant_profile('5eed0000-0000-4000-8000-000000000098',
       jsonb_build_object('answers', pg_temp.answers('{"clothing_size": "L"}'))) $$,
  'a partial staff edit of an invited woman that sends no name still saves'
);

select * from finish();
rollback;
