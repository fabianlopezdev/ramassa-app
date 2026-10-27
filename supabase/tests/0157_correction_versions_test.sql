-- Saving a legal form is a Correcció or a Nova versió (RAPP-696).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Authorization: a correction keeps whoever signed the version before it
--      covered, and her signature still names the version she saw. A new
--      version after it asks everyone again, also across an earlier
--      correction. Someone who never signed still has to.
--   2. App terms: the same for the acceptances.
--   3. A correction needs a published version to correct, and the lists say
--      which versions are corrections.
--   4. The authorization's screen order is stored only as both movable
--      screens once.
--
-- Seed: admin ...001 (settings.organization), player ...011 (signed
-- authorization version 1 of the current season and app terms version 1),
-- player ...022 (has not signed the authorization).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(19);

create temp table run (label text primary key, content jsonb, id uuid) on commit drop;
grant all on run to authenticated;
insert into run (label, content)
select 'auth', content from public.authorization_versions where id = '5eed0000-0000-4000-8041-000000000001';
insert into run (label, content)
select 'terms', content from public.app_terms_versions
 where org_id = '5eed0000-0000-4000-8000-000000000000' and version_number = 1;
insert into run (label, id)
select 'signed', sig.id from public.authorization_signatures sig
 where sig.profile_id = '5eed0000-0000-4000-8000-000000000011'
   and sig.version_id = '5eed0000-0000-4000-8041-000000000001';

-- 1. The authorization ---------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is((select required from public.my_authorization_status()), false,
  'she signed version 1 of this season');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select public.save_authorization_draft(
  jsonb_set((select content from run where label = 'auth'), '{title,ca}', '"Autorització corregida"'));
select is(public.publish_authorization_draft(null, true), 2, 'an admin publishes a correction as version 2');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(
  (select (version_number, required)::text from public.my_authorization_status()),
  '(2,f)',
  'the correction is shown and her signature on version 1 still covers it'
);
reset role;
select is(
  (select version_id from public.authorization_signatures where id = (select id from run where label = 'signed')),
  '5eed0000-0000-4000-8041-000000000001'::uuid,
  'her signature still names the version she saw'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000022", "role": "authenticated"}';
select is((select required from public.my_authorization_status()), true,
  'a player who never signed still signs the correction');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select public.save_authorization_draft(
  jsonb_set((select content from run where label = 'auth'), '{title,ca}', '"Autorització nova"'));
select is(public.publish_authorization_draft(), 3, 'a new version is published as version 3');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is((select required from public.my_authorization_status()), true,
  'a new version asks her again');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select public.save_authorization_draft(
  jsonb_set((select content from run where label = 'auth'), '{title,ca}', '"Autorització nova, corregida"'));
select is(public.publish_authorization_draft(null, true), 4, 'a correction of the new version is version 4');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is((select required from public.my_authorization_status()), true,
  'version 1 does not cover a correction made after a new version');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select array_agg(is_correction order by version_number)
     from public.list_authorization_versions()
    where season_id = (select season_id from public.authorization_versions
                        where id = '5eed0000-0000-4000-8041-000000000001')),
  array[false, true, false, true],
  'the list says which versions are corrections'
);
select ok(
  (select signature_count from public.list_authorization_versions()
    where id = '5eed0000-0000-4000-8041-000000000001') > 0
  and (select signature_count from public.list_authorization_versions() where version_number = 4
         and season_id = (select season_id from public.authorization_versions
                           where id = '5eed0000-0000-4000-8041-000000000001')) = 0,
  'and counts each version''s signatures'
);

-- 2. The app terms ------------------------------------------------------------------------------------------

select public.save_app_terms_draft(
  jsonb_set((select content from run where label = 'terms'), '{body,ca}', '"Text corregit."'));
select is(public.publish_app_terms_draft(true), 2, 'an admin publishes a terms correction as version 2');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(public.my_terms_acceptance_needed(), false,
  'her acceptance of version 1 still covers the correction');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select public.save_app_terms_draft(
  jsonb_set((select content from run where label = 'terms'), '{body,ca}', '"Text nou."'));
select is(public.publish_app_terms_draft(), 3, 'a new terms version is version 3');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(public.my_terms_acceptance_needed(), true, 'a new terms version asks her again');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select array_agg(is_correction order by version_number)
     from public.list_app_terms_versions() where version_number is not null),
  array[false, true, false],
  'the terms list says which versions are corrections'
);

-- 3. A correction needs something to correct ----------------------------------------------------------------

reset role;
insert into public.seasons (id, org_id, name, starts_on, is_current) values
  ('00000000-0000-0000-0000-000000069601', '5eed0000-0000-4000-8000-000000000000', '2030/31', '2030-09-01', false);
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select public.save_authorization_draft((select content from run where label = 'auth'));
select throws_ok(
  $$ select public.publish_authorization_draft('00000000-0000-0000-0000-000000069601', true) $$,
  '55000', null::text,
  'a season with no version has nothing to correct'
);

-- 4. The screen order ---------------------------------------------------------------------------------------

select lives_ok(
  $$ select public.save_authorization_draft(
       (select content from run where label = 'auth') || '{"screen_order": ["health", "document"]}'::jsonb) $$,
  'the health screen may come before the document'
);
select throws_ok(
  $$ select public.save_authorization_draft(
       (select content from run where label = 'auth') || '{"screen_order": ["health", "health"]}'::jsonb) $$,
  null::text, null::text,
  'an order that leaves a screen out is refused'
);

select * from finish();
rollback;
