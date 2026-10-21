-- Creating a test player never confirms that a real person has an account (RAPP-615).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. A caller who may create test players only (no participants.invite)
--      gets ONE refusal, with one code and one message, for a malformed
--      address, an address of a real player, an address of an invited woman,
--      and an address that has an account but no profile yet.
--   2. A free address still creates the test player.
--   3. Staff with participants.invite still learn that the address is in use,
--      so they can find her in the list.
--
-- Seed: staff ...002 (participants.invite), the design account ...097, the
-- real player amina.alhassan@example.test (...011), the invited woman
-- invited@example.test (...098).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(7);

set local role authenticated;

-- An account without a profile: an email-only invitation by staff.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select * from public.create_participant_invite('{"email":"nomes.correu@example.test"}'::jsonb) $$,
  'staff invite a woman by address only'
);

-- 1. One refusal for the design role --------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select * from public.create_participant_invite(
       '{"email":"amina.alhassan@example.test","first_name":"Prova","last_name":"U","is_test_account":true}'::jsonb) $$,
  '22023', 'this address cannot be used for a test player',
  'a real player''s address gets the neutral refusal'
);
select throws_ok(
  $$ select * from public.create_participant_invite(
       '{"email":"invited@example.test","first_name":"Prova","last_name":"Dos","is_test_account":true}'::jsonb) $$,
  '22023', 'this address cannot be used for a test player',
  'an invited woman''s address gets the same refusal'
);
select throws_ok(
  $$ select * from public.create_participant_invite(
       '{"email":"nomes.correu@example.test","first_name":"Prova","last_name":"Tres","is_test_account":true}'::jsonb) $$,
  '22023', 'this address cannot be used for a test player',
  'an address with an account and no profile gets the same refusal'
);
select throws_ok(
  $$ select * from public.create_participant_invite(
       '{"email":"no-es-una-adreca","first_name":"Prova","last_name":"Quatre","is_test_account":true}'::jsonb) $$,
  '22023', 'this address cannot be used for a test player',
  'a malformed address gets the same refusal'
);

-- 2. A free address works ---------------------------------------------------------------------------

select lives_ok(
  $$ select * from public.create_participant_invite(
       '{"email":"prova.lliure@example.test","first_name":"Prova","last_name":"Lliure","is_test_account":true}'::jsonb) $$,
  'a free address creates the test player'
);

-- 3. Staff who invite real players still learn the address is in use --------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select * from public.create_participant_invite(
       '{"email":"amina.alhassan@example.test","first_name":"A","last_name":"B"}'::jsonb) $$,
  '23505', 'this address already belongs to an account',
  'staff with participants.invite are told the address is in use'
);

select * from finish();
rollback;
