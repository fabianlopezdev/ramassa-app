-- Seed-data tests for RAPP-18.
-- Run with: bunx supabase test db  (pgTAP, executed against the local stack).
--
-- Unlike 0001/0002, this file is deliberately NOT self-contained: it asserts on
-- what `supabase db reset` actually left in the database, because that is the
-- thing under test. A seed file that silently stops populating a table is
-- invisible until a dev menu screen or a Maestro flow mysteriously has nothing
-- to show; these assertions turn that into a failing test instead.
--
-- Three properties matter here:
--   1. The dataset EXISTS and is complete (every role, every one of the five
--      languages, real Arabic/Farsi/Cyrillic script preserved byte-for-byte).
--   2. Seeded accounts can actually SIGN IN (auth.users + an email identity +
--      a password that verifies), or the dev menu and Maestro flows that depend
--      on them are dead on arrival.
--   3. The STANDING RULE holds: every table in `public` has seed rows, so a
--      later phase cannot add a table and forget its fixtures.
--
-- It reads only, and still runs in a transaction that rolls back.

begin;
select plan(16);

-- Tenant -------------------------------------------------------------------------

select is(
  (select count(*) from public.organizations where slug = 'ramassa')::int, 1,
  'the demo organization is seeded'
);

select is(
  (select array_length(available_languages, 1) from public.organizations where slug = 'ramassa'), 5,
  'the seeded organization offers all five grant languages'
);

-- Roster -------------------------------------------------------------------------
-- The onboarding drive account (…0099) is seeded WITHOUT a profile so the wizard
-- gate fires; completing the wizard on a dev device gives it an app-created
-- player profile. That profile is not the seed's doing, so roster equality
-- assertions must ignore it or they flap with device usage.

select is(
  (select count(*) from public.profiles
    where role = 'player'
      and id <> '5eed0000-0000-4000-8000-000000000099')::int, 20,
  'twenty participants are seeded'
);

select is(
  (select count(*) from public.profiles where role = 'staff')::int, 2,
  'two staff accounts are seeded'
);

select is(
  (select count(*) from public.profiles where role = 'admin')::int, 1,
  'one admin account is seeded'
);

select is(
  (select count(*) from public.profiles where role = 'entity')::int, 2,
  'two entity accounts are seeded'
);

-- Multilingual coverage ----------------------------------------------------------
-- RTL and script rendering can only be tested honestly against real script, so
-- the roster must carry it: transliterated "Amina Al-Hassan" would prove nothing
-- about how the Arabic font renders or how the layout mirrors.

select is(
  (select count(distinct preferred_language) from public.profiles)::int, 5,
  'the seeded roster spans all five supported languages'
);

select cmp_ok(
  (select count(*) from public.profiles where first_name ~ '[؀-ۿ]')::int,
  '>=', 5,
  'participants carry Arabic-script names, not transliterations'
);

select cmp_ok(
  (select count(*) from public.profiles where first_name ~ '[Ѐ-ӿ]')::int,
  '>=', 1,
  'participants carry Cyrillic names (Ukrainian arrivals; there is no Ukrainian UI locale)'
);

-- Encryption ---------------------------------------------------------------------
-- Detail views decrypt through the pgcrypto helpers (ADR-004), so the seed has to
-- exercise that path: plaintext in the column would let a broken decrypt pass.

select is_empty(
  $$ select id from public.profiles
     where phone is not null and public.decrypt_field(phone) !~ '^\+34'
       and id <> '5eed0000-0000-4000-8000-000000000099' $$,
  'every seeded phone decrypts back to a well-formed number through decrypt_field'
);

select cmp_ok(
  (select count(*) from public.profiles where document_number is not null)::int,
  '>=', 1,
  'at least one seeded participant carries an encrypted document number'
);

select is_empty(
  $$ select id from public.profiles where document_type = 'none' and document_number is not null $$,
  'participants with no document have no document number (the not-yet-documented case is seeded too)'
);

-- Sign-in ------------------------------------------------------------------------
-- A profile with no auth identity is a row nobody can log in as. The dev menu
-- (RAPP-19) and the Maestro flows sign in as these accounts.

select is_empty(
  $$ select p.id from public.profiles p
     left join auth.identities i on i.user_id = p.id and i.provider = 'email'
     where i.user_id is null $$,
  'every seeded profile has an email identity, so it can actually sign in'
);

select is_empty(
  $$ select u.id from auth.users u
     join public.profiles p on p.id = u.id
     where u.encrypted_password is distinct from
           extensions.crypt('ramassa-dev-password', u.encrypted_password)
        or u.email_confirmed_at is null $$,
  'every seeded account has the shared dev password and a confirmed email'
);

select is_empty(
  $$ select id from auth.users where email not like '%@example.test' $$,
  'no seeded account uses an address outside the reserved fake domain'
);

-- STANDING RULE (RAPP-18 scope 4) -------------------------------------------------
-- Each new table ships with seed entries and a factory in the SAME issue. This
-- assertion is what makes that rule self-enforcing: add a table, forget its
-- fixtures, and `supabase test db` fails with the table's name. A table that
-- genuinely cannot be seeded should be excluded here, deliberately and in writing.

select is_empty(
  $$ select t.table_name
     from information_schema.tables t
     where t.table_schema = 'public'
       and t.table_type = 'BASE TABLE'
       and (xpath(
             '/row/count/text()',
             query_to_xml(format('select count(*) from public.%I', t.table_name), false, true, '')
           ))[1]::text::int = 0 $$,
  'STANDING RULE: every table in public has seed rows (add seeds + a factory with the table)'
);

select * from finish();
rollback;
