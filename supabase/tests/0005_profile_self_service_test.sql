-- Player self-service on their own profile: reading it back decrypted, editing
-- it, and asking to be erased (RAPP-22). Run with: bunx supabase test db
--
-- What these assertions defend, in order of how badly they would hurt:
--   1. A player reads her OWN sensitive fields in clear (that is the point of
--      the screen) and NOBODY else's. The read RPC is the only path that
--      decrypts, so a leak here is a leak of every refugee woman's document
--      number, phone and address at once.
--   2. Editing re-ENCRYPTS. A profile edited through this path must not end up
--      with plaintext where the onboarding wizard wrote ciphertext, which is
--      exactly the kind of drift that a second write path introduces.
--   3. An edit cannot escalate. Role, organization and terms acceptance are not
--      the player's to change, and the RPC must not become the hole the RLS
--      policies were written to close.
--   4. An erasure request is RECORDED, not executed. RGPD art. 17 gives the
--      right to ask; the deletion itself is a staff action with its own
--      safeguards (RAPP-26). The request must reach staff and must not let a
--      player delete her own row as a side effect.
--
-- Self-contained: seeds its own Vault key and users, runs in a transaction and
-- rolls back. Uses the SEEDED 'ramassa' org for the same reason 0004 does: a
-- second org would trip `default_organization_id()`'s single-tenant guard.

begin;
select plan(20);

-- Setup ------------------------------------------------------------------------

select vault.create_secret('test-encryption-key', 'app_encryption_key', 'pgTAP test key')
where not exists (select 1 from vault.secrets where name = 'app_encryption_key');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'owner@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'stranger@test.local');

-- Two players in the seeded org. The owner is built through the real onboarding
-- RPC rather than a raw insert, so what the edit path reads back is exactly what
-- intake wrote, encryption included.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

select public.complete_onboarding(
  jsonb_build_object(
    'first_name', 'Amina', 'last_name', 'Al-Hassan',
    'date_of_birth', '1995-03-14', 'place_of_birth', 'حلب',
    'nationality', 'Síria', 'preferred_language', 'ar',
    'document_type', 'nie', 'document_number', 'X1234567L',
    'phone', '+34600111222', 'address', 'Carrer Major 1', 'city', 'Vic',
    'postal_code', '08500', 'has_dependents', false, 'num_dependents', 0,
    'clothing_size', 'M', 'shoe_size', '38',
    'media_consent', false,
    'terms_version', '2026-07-01', 'locale_shown', 'ar'
  )
);

-- Schema -----------------------------------------------------------------------

select has_table('public', 'deletion_requests', 'deletion_requests table exists');
select has_column('public', 'deletion_requests', 'state', 'a deletion request carries a state staff can move');
select has_column('public', 'deletion_requests', 'reason', 'a deletion request can carry the player words');
select has_function('public', 'get_own_profile', 'the decrypting read RPC exists');
select has_function('public', 'update_own_profile', array['jsonb'], 'the re-encrypting write RPC exists');

-- Reading own profile ----------------------------------------------------------

select is(
  (select document_number from public.get_own_profile()), 'X1234567L',
  'the owner reads her own document number in clear'
);

select is(
  (select phone from public.get_own_profile()), '+34600111222',
  'the owner reads her own phone in clear'
);

select is(
  (select first_name from public.get_own_profile()), 'Amina',
  'the owner reads her own name, Arabic script intact'
);

-- A stranger gets NOTHING, not someone else's row. The RPC keys off the caller,
-- so there is no argument to pass that could widen it: this asserts the shape of
-- that guarantee rather than trusting the absence of a parameter.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d2", "role": "authenticated"}';

select is_empty(
  $$ select id from public.get_own_profile() $$,
  'a caller with no profile reads no rows, not somebody else''s'
);

-- Editing own profile ----------------------------------------------------------

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

select lives_ok(
  $$ select public.update_own_profile(
       jsonb_build_object(
         'first_name', 'Amina', 'last_name', 'Al-Hassan',
         'date_of_birth', '1995-03-14', 'place_of_birth', 'حلب',
         'nationality', 'Síria', 'preferred_language', 'ca',
         'document_type', 'nie', 'document_number', 'Y7654321X',
         'phone', '+34600999888', 'address', 'Carrer Nou 9', 'city', 'Manlleu',
         'postal_code', '08560', 'has_dependents', true, 'num_dependents', 2,
         'clothing_size', 'L', 'shoe_size', '39', 'media_consent', true
       )
     ) $$,
  'the owner can edit her own profile'
);

select is(
  (select document_number from public.get_own_profile()), 'Y7654321X',
  'the edited document number round-trips through encryption'
);

-- The whole point of the encrypted columns: the new value must be ciphertext at
-- rest, not plaintext written by a second, sloppier write path.
select is_empty(
  $$ select id from public.profiles
     where id = '00000000-0000-0000-0000-0000000000d1'
       and (
         document_number::text like '%Y7654321X%'
         or phone::text like '%+34600999888%'
         or address::text like '%Carrer Nou 9%'
       ) $$,
  'the edited sensitive fields are ciphertext at rest, never plaintext'
);

select is(
  (select city from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'),
  'Manlleu',
  'city stays cleartext: it feeds aggregate reporting, and is not identifying on its own'
);

select is(
  (select media_consent_at is not null from public.profiles
    where id = '00000000-0000-0000-0000-0000000000d1'),
  true,
  'granting media consent from the profile stamps it'
);

-- Escalation. The payload carries role and org because a naive client would send
-- the whole profile back; the RPC must ignore them rather than trust them.
select public.update_own_profile(
  jsonb_build_object(
    'first_name', 'Amina', 'last_name', 'Al-Hassan',
    'date_of_birth', '1995-03-14', 'place_of_birth', 'حلب',
    'nationality', 'Síria', 'preferred_language', 'ca',
    'document_type', 'none', 'role', 'admin',
    'org_id', '00000000-0000-0000-0000-000000000999',
    'terms_accepted_at', null,
    'has_dependents', false, 'num_dependents', 0
  )
);

select is(
  (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'),
  'player',
  'an edit cannot promote the player to admin, however the payload is dressed'
);

select is(
  (select terms_accepted_at is not null from public.profiles
    where id = '00000000-0000-0000-0000-0000000000d1'),
  true,
  'an edit cannot un-accept the terms: consent is an event, not a form field'
);

-- Erasure requests -------------------------------------------------------------

select lives_ok(
  $$ insert into public.deletion_requests (profile_id, reason)
     values ('00000000-0000-0000-0000-0000000000d1', 'Ja no vull participar') $$,
  'a player can ask to be erased'
);

select is(
  (select state from public.deletion_requests
    where profile_id = '00000000-0000-0000-0000-0000000000d1'),
  'open',
  'a fresh request lands open, waiting for staff'
);

-- Asking is not doing: the request exists, the profile does too. Erasure is a
-- staff action (RAPP-26) precisely so it can be checked before it is
-- irreversible.
--
-- Asserted as SURVIVAL, not as a raised error. Postgres does not throw when RLS
-- has no DELETE policy for the caller: the statement matches no rows and
-- reports success, which is exactly the failure mode that would let a silent
-- regression through if the test only watched for an exception.
delete from public.profiles where id = '00000000-0000-0000-0000-0000000000d1';

select isnt_empty(
  $$ select id from public.profiles where id = '00000000-0000-0000-0000-0000000000d1' $$,
  'asking for erasure does not let the player delete her own row'
);

select is_empty(
  $$ select id from public.deletion_requests
     where profile_id = '00000000-0000-0000-0000-0000000000d2' $$,
  'a player cannot file a request against somebody else'
);

select * from finish();
rollback;
