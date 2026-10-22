-- The app terms gate opens only on a signed acceptance (RAPP-613, verifier finding 1).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Nobody writes `terms_acceptances` directly: a player's raw insert is
--      refused, and no client role holds a write privilege on the table.
--      Acceptance goes only through the signing functions.
--   2. The gate needs an acceptance of the current version WITH its
--      signature record. A bare acceptance row (an older unsigned path, a
--      row written by hand) does not open it.
--   3. Acceptances made before signatures existed still count, so nobody who
--      joined is asked again at deploy.
--
-- Seed: admin ...001, real players ...011 (signed) and ...012 (accepted
-- before signatures existed), organization ...000.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(11);

create temp table ids (label text primary key, id uuid) on commit drop;
grant all on ids to authenticated;

-- 1. No direct writes ---------------------------------------------------------------------------------

select is(
  (select array_agg(privilege_type::text order by privilege_type)
     from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'terms_acceptances'
      and grantee in ('anon', 'authenticated')),
  array['SELECT'],
  'client roles only read the acceptances; anon holds nothing'
);
select is(
  (select count(*)::integer from pg_policy
    where polrelid = 'public.terms_acceptances'::regclass and polcmd <> 'r'),
  0,
  'no write policy is left on the table'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated"}';
select is(public.my_terms_acceptance_needed(), false,
  'a player who accepted before signatures existed is not asked again');
select throws_ok(
  $$ insert into public.terms_acceptances (profile_id, terms_version, locale_shown)
     values ('5eed0000-0000-4000-8000-000000000012', '2', 'ca') $$,
  '42501', null::text,
  'a player cannot write an acceptance of her own'
);

-- 2. A new version: only a signed acceptance opens the gate ---------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.save_app_terms_draft(
       jsonb_set((select content from public.app_terms_versions where version_number = 1),
                 '{body}', '{"ca": "Text legal nou."}'::jsonb)) $$,
  'an admin writes new terms'
);
select is(public.publish_app_terms_draft(), 2, 'and publishes them as version 2');
reset role;
insert into ids select 'v2', id from public.app_terms_versions
 where org_id = '5eed0000-0000-4000-8000-000000000000' and version_number = 2;

-- A bare row for version 2, as an unsigned path would leave it.
insert into public.terms_acceptances (profile_id, terms_version, locale_shown, version_id)
values ('5eed0000-0000-4000-8000-000000000012', '2', 'ca', (select id from ids where label = 'v2'));

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated"}';
select is(public.my_terms_acceptance_needed(), true,
  'an acceptance row without her signature does not open the gate');
select lives_ok(
  $$ select public.accept_current_app_terms((select id from ids where label = 'v2'), 'ca',
       '{"terms_accepted": true, "media_consent": false, "signature": null, "unable_to_draw": true}'::jsonb) $$,
  'she signs version 2'
);
select is(public.my_terms_acceptance_needed(), false, 'and the gate opens');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(public.my_terms_acceptance_needed(), true, 'another player still has version 2 to sign');
select throws_ok(
  $$ update public.terms_acceptances set version_id = (select id from ids where label = 'v2')
      where profile_id = '5eed0000-0000-4000-8000-000000000011' $$,
  '42501', null::text,
  'and cannot move an old acceptance onto it'
);

select * from finish();
rollback;
