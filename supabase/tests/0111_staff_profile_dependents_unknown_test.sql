-- Pending fixes 16 and 17 (RAPP-624, RAPP-611).
-- Run with: bunx supabase test db
--
-- 16. The staff edit of a participant (`update_participant_profile`) needs an
--     account: neither PUBLIC nor anon holds execute, authenticated does. The
--     checks read the privileges only; a refused function is never called as
--     anon here (local Postgres crashes on that).
-- 17. A profile staff create (an invitation) starts with her dependants
--     unknown (null), never "no", until she or staff answer; the test player
--     scenario's reset and "clear the answer" do the same.
--
-- Seed: staff ...002 (participants.invite), organization ...000, the
-- onboarding drive address with an auth user and no profile.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(8);

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

-- 16. Privileges -------------------------------------------------------------------------------------------

select ok(
  not has_function_privilege('public', 'public.update_participant_profile(uuid, jsonb)', 'execute'),
  'PUBLIC cannot run the staff edit of a participant'
);
select ok(
  not has_function_privilege('anon', 'public.update_participant_profile(uuid, jsonb)', 'execute'),
  'nor anon'
);
select ok(
  has_function_privilege('authenticated', 'public.update_participant_profile(uuid, jsonb)', 'execute'),
  'staff clients, signed in, still call it'
);
select is(
  (select count(*)::integer
     from pg_proc p, aclexplode(p.proacl) acl
    where p.oid = 'public.update_participant_profile(uuid, jsonb)'::regprocedure
      and (acl.grantee = 0 or acl.grantee = 'anon'::regrole)),
  0,
  'its access list names neither PUBLIC nor anon'
);

-- 17. Dependants unknown -----------------------------------------------------------------------------------

select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'has_dependents'),
  null,
  'a new profile has no default answer for her dependants'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
create temporary table sent_invite as
select * from public.create_participant_invite(
  jsonb_build_object('email', 'onboarding@example.test', 'first_name', 'Nova', 'last_name', 'Jugadora'));
reset role;

select is(
  (select p.has_dependents from public.profiles p join sent_invite s on s.profile_id = p.id),
  null,
  'an invitation leaves her dependants unknown until she answers'
);
select ok(
  not exists (select 1 from public.profile_answers a join sent_invite s on s.profile_id = a.profile_id
               where a.question = 'dependents'),
  'and nobody is recorded as having answered it'
);

-- The scenario reset gives a test player the state of a new invitation.
update public.profiles set is_test_account = true, has_dependents = true, num_dependents = 2
 where id = (select profile_id from sent_invite);
select private.scenario_reset((select p from public.profiles p where p.id = (select profile_id from sent_invite)));
-- Her answers are by field since RAPP-661: the reset leaves none.
select ok(
  pg_temp.stored((select profile_id from sent_invite), 'has_dependents') is null
  and pg_temp.stored((select profile_id from sent_invite), 'num_dependents') is null,
  'the test player reset clears her dependants to unknown'
);

select * from finish();
rollback;
