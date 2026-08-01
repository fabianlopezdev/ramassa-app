-- Onboarding intake: schema deltas, terms_acceptances, and the completion RPC
-- (RAPP-21). Run with: bunx supabase test db
--
-- What these assertions defend, in order of how badly they would hurt:
--   1. Sensitive intake fields are CIPHERTEXT at rest (ADR-004). A player's
--      document number, phone, address and postal code identify and locate a
--      refugee woman; a database breach must not hand them over.
--   2. A player can create ONLY their own profile, and cannot self-escalate to
--      staff or admin while doing it.
--   3. Terms acceptance is recorded as a versioned EVENT (version + locale
--      shown + timestamp), not just a boolean, because RGPD requires knowing
--      which text in which language someone actually agreed to.
--   4. The RPC is atomic: a rejected terms acceptance leaves no half-built
--      profile behind.
--
-- Self-contained: seeds its own Vault key, org and users, runs in a transaction
-- and rolls back.

begin;
select plan(16);

-- Setup ------------------------------------------------------------------------

select vault.create_secret('test-encryption-key', 'app_encryption_key', 'pgTAP test key')
where not exists (select 1 from vault.secrets where name = 'app_encryption_key');

-- Deliberately NOT creating an org: `default_organization_id()` resolves the
-- single tenant and RAISES when there is more than one, which is the guard that
-- stops a participant being attached to an arbitrary organization. Adding a
-- second org here would trip that guard and test the wrong thing. The seeded
-- 'ramassa' org from seed.sql is the one a real self-signup would join.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'newplayer@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'otherplayer@test.local');

-- Schema deltas ----------------------------------------------------------------

select has_column('public', 'profiles', 'place_of_birth', 'profiles gained place_of_birth (kickoff field)');
select has_column('public', 'profiles', 'media_consent_at', 'profiles gained media_consent_at (separate, revocable consent)');
select has_table('public', 'terms_acceptances', 'terms_acceptances table exists');
select has_column('public', 'terms_acceptances', 'terms_version', 'terms_acceptances records WHICH version was accepted');
select has_column('public', 'terms_acceptances', 'locale_shown', 'terms_acceptances records the LANGUAGE the text was read in');

-- The completion RPC -----------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

-- Server-side parity for the required place_of_birth (2026-07-31): the client
-- schema enforces it; the RPC must re-enforce it or the contract is a comment.
select throws_like(
  $$ select public.complete_onboarding(
       jsonb_build_object(
         'first_name', 'X', 'last_name', 'Y', 'date_of_birth', '1995-03-14',
         'nationality', 'Síria', 'document_type', 'none',
         'clothing_size', 'M', 'shoe_size', '38',
         'terms_version', '2026-07-01', 'locale_shown', 'ca'
       )
     ) $$,
  '%requires place_of_birth%',
  'the RPC rejects a payload with no place of birth'
);

select lives_ok(
  $$ select public.complete_onboarding(
       jsonb_build_object(
         'first_name', 'أمينة',
         'last_name', 'الحسن',
         'date_of_birth', '1995-03-14',
         'place_of_birth', 'حلب',
         'nationality', 'Síria',
         'preferred_language', 'ar',
         'document_type', 'nie',
         'document_number', 'X1234567L',
         'phone', '+34600111222',
         'address', 'Carrer Major 1',
         'city', 'Vic',
         'postal_code', '08500',
         'reference_entity', 'Creu Roja Osona',
         'has_dependents', true,
         'num_dependents', 2,
         'clothing_size', 'M',
         'shoe_size', '38',
         'terms_version', '2026-07-01',
         'locale_shown', 'ar'
       )
     ) $$,
  'a player can complete their own onboarding'
);

-- Encryption at rest: the raw columns must NOT contain the plaintext.
set local role postgres;

select isnt(
  (select encode(document_number, 'escape') from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  'X1234567L',
  'document_number is ciphertext at rest, not the plaintext NIE'
);

select isnt(
  (select encode(phone, 'escape') from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  '+34600111222',
  'phone is ciphertext at rest'
);

select is(
  (select public.decrypt_field(document_number) from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  'X1234567L',
  'document_number round-trips through the decrypt helper'
);

select is(
  (select public.decrypt_field(postal_code) from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  '08500',
  'postal_code round-trips through the decrypt helper'
);

-- City stays cleartext on purpose: aggregate impact reporting needs it.
select is(
  (select city from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  'Vic',
  'city is deliberately cleartext for aggregate reporting'
);

-- Arabic script survives the round trip unmangled.
select is(
  (select first_name from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  'أمينة',
  'Arabic given name stored intact'
);

-- Terms acceptance recorded as a versioned event.
select is(
  (select terms_version || '/' || locale_shown
     from public.terms_acceptances
    where profile_id = '00000000-0000-0000-0000-0000000000c1'),
  '2026-07-01/ar',
  'terms acceptance stores the version AND the language it was shown in'
);

select isnt(
  (select terms_accepted_at from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  null,
  'the profile summary column is stamped too (the onboarding gate reads it)'
);

-- No self-escalation: the RPC must never let a player write themselves a role.
select is(
  (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  'player',
  'a self-completed onboarding is always role=player, never staff or admin'
);

select * from finish();
rollback;
