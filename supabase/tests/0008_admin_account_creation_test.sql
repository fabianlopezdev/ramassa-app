-- Staff creating an account for a participant who has no email, and resetting
-- its password later (RAPP-25). Run with: bunx supabase test db
--
-- WHY THIS IS A DATABASE FUNCTION AND NOT AN EDGE FUNCTION
--
-- The obvious way to create an auth user is the Admin API with the
-- service-role key. That key bypasses RLS on every table in the project, so
-- wherever it lives it is a single secret whose loss exposes the entire roster
-- of refugee women at once. Doing the work inside a SECURITY DEFINER function
-- means no such key exists anywhere: the elevated authority is scoped to one
-- function that does exactly one thing and refuses anyone who is not staff.
-- Decided by Fabián 2026-08-01; the trade-off (coupling to `auth.users`, which
-- Supabase does not document as a public surface) is recorded in ADR-022.
--
-- What these assertions defend, in order of how badly they would hurt:
--
--   1. **Only staff can mint accounts.** A function that creates authenticated
--      identities is the most dangerous thing in this schema. An entity
--      contact or a participant reaching it is a full compromise, so both are
--      asserted explicitly rather than assumed from the guard's existence.
--   2. **The account actually works.** An account nobody can log into is worse
--      than no account: staff hand a woman a slip of paper and she is turned
--      away at the door. The password hash is verified the way GoTrue verifies
--      it, and the browser suite signs in with a real generated credential.
--   3. **The address can never receive mail.** Generated addresses live under
--      `ramassa.invalid`, reserved by RFC 2606 so it can never resolve. A real
--      domain here would mean a recovery mail for a participant's account
--      could one day be delivered to whoever holds that mailbox.
--   4. **Consent is still hers.** Staff create the ACCOUNT, never the consent:
--      `terms_accepted_at` stays NULL, so her first login lands in the wizard
--      and she accepts the terms herself.
--   5. **Every mint and every reset is audited**, under the append-only trail
--      RAPP-24 built, and rate-limited so a compromised staff session cannot
--      mint accounts in bulk.
--
-- Runs in a transaction and rolls back. Counts are scoped to `created_at >=
-- now()` (the transaction timestamp) so a suite that has already driven these
-- screens in a browser cannot turn this file red.

begin;
select plan(32);

select vault.create_secret('test-encryption-key', 'app_encryption_key', 'pgTAP test key')
where not exists (select 1 from vault.secrets where name = 'app_encryption_key');

-- Marta Puig is staff (…002), Sílvia Bosch an entity contact (…004), Rosa
-- Mamani a participant (…026).

-- Schema -------------------------------------------------------------------------

select has_column('public', 'profiles', 'auth_method', 'a profile records how its owner signs in');
select has_function(
  'public', 'create_participant_account', array['jsonb'],
  'the staff account-creation RPC exists'
);
select has_function(
  'public', 'reset_participant_password', array['uuid'],
  'the staff password-reset RPC exists'
);

-- Existing accounts are magic-link accounts: the column arrives with a default
-- that describes the world as it already is, not one that relabels it.
select is(
  (select auth_method from public.profiles where id = '5eed0000-0000-4000-8000-000000000026'),
  'magic_link',
  'a seeded participant is a magic-link account'
);

-- Creating an account, as staff ------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated"}';

create temporary table created_account as
select * from public.create_participant_account(
  jsonb_build_object('first_name', 'Núria', 'last_name', 'Bosch i Prat')
);

select is(
  (select count(*) from created_account)::int, 1,
  'staff create an account and get exactly one credential set back'
);

-- THE DOMAIN ASSERTION. `.invalid` is reserved by RFC 2606 precisely so it can
-- never resolve; a real domain here would mean mail for a participant's account
-- could one day reach a real mailbox.
select ok(
  (select email like '%@ramassa.invalid' from created_account),
  'the generated address is under the reserved, permanently unroutable domain'
);

select ok(
  (select email ~ '^[abcdefghjkmnpqrstuvwxyz23456789]{4}@ramassa\.invalid$' from created_account),
  'group one is the complete internal login identifier'
);

select ok(
  (select password ~ '^[abcdefghjkmnpqrstuvwxyz23456789]{4}(-[abcdefghjkmnpqrstuvwxyz23456789]{4}){2}$' from created_account),
  'the generated access code is exactly three unambiguous groups'
);

select is(
  (select split_part(email, '@', 1) from created_account),
  (select split_part(password, '-', 1) from created_account),
  'group one is shared by the internal identifier and the complete credential'
);

-- The password is handed over on paper and typed on a phone by someone who may
-- not read the Latin alphabet fluently. Characters that look alike are the
-- difference between logging in and being turned away.
select ok(
  (select password !~ '[il1oO0]' from created_account),
  'and holds no character that could be mistaken for another'
);

-- THE ONE THAT MATTERS MOST. An account nobody can sign into is worse than no
-- account. This is the check GoTrue itself performs on login.
--
-- `reset role` for the next two: they read `auth.users`, which `authenticated`
-- cannot, and they are OBSERVER queries rather than steps a staff member takes.
-- The product path above already ran as the staff member it belongs to.
reset role;

select ok(
  (select u.encrypted_password = extensions.crypt(c.password, u.encrypted_password)
     from created_account c join auth.users u on u.id = c.profile_id),
  'the generated password verifies against the stored hash'
);

-- Without an email identity row, GoTrue cannot resolve the address to the user
-- and the login fails even though the hash is right.
select ok(
  (select exists (
     select 1 from auth.identities i
     join created_account c on c.profile_id = i.user_id
     where i.provider = 'email'
   )),
  'the account has the email identity a password login resolves through'
);

set local role authenticated;

select is(
  (select p.role from public.profiles p join created_account c on c.profile_id = p.id),
  'player',
  'the account is a participant, never staff'
);

select is(
  (select p.org_id from public.profiles p join created_account c on c.profile_id = p.id),
  '5eed0000-0000-4000-8000-000000000000'::uuid,
  'and belongs to the organization of the staff member who made it'
);

select is(
  (select p.auth_method from public.profiles p join created_account c on c.profile_id = p.id),
  'admin_created',
  'it is marked as an admin-created account, which is what makes a reset possible'
);

-- RGPD: staff create the ACCOUNT, never the CONSENT. Her first login lands in
-- the wizard and she accepts the terms herself.
select ok(
  (select p.terms_accepted_at is null from public.profiles p join created_account c on c.profile_id = p.id),
  'the terms are NOT accepted on her behalf: she still meets the wizard'
);

select is(
  (select p.first_name from public.profiles p join created_account c on c.profile_id = p.id),
  'Núria',
  'her real name is stored as typed, accents intact, whatever the address became'
);

select is(
  (select count(*) from public.audit_log
    where action = 'account.create'
      and actor_id = '5eed0000-0000-4000-8000-000000000002'
      and created_at >= now())::int,
  1,
  'minting an account is audited under the actor who did it'
);

-- A name in a script GoTrue's address validation would reject must still
-- produce a usable account, because most of this roster writes in one.
create temporary table arabic_account as
select * from public.create_participant_account(
  jsonb_build_object('first_name', 'أمينة', 'last_name', 'الحسن')
);

select ok(
  (select email ~ '^[abcdefghjkmnpqrstuvwxyz23456789]{4}@ramassa\.invalid$' from arabic_account),
  'an Arabic name gets the same name-free ASCII identifier contract'
);

select ok(
  (select a.email <> c.email from arabic_account a, created_account c),
  'two accounts never share an address'
);

-- Who may mint --------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated"}';

select throws_ok(
  $$ select public.create_participant_account(
       jsonb_build_object('first_name', 'Intrusa', 'last_name', 'Prova')
     ) $$,
  '42501',
  null::text,
  'an entity contact cannot mint an account'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000026", "role": "authenticated"}';

select throws_ok(
  $$ select public.create_participant_account(
       jsonb_build_object('first_name', 'Intrusa', 'last_name', 'Prova')
     ) $$,
  '42501',
  null::text,
  'and neither can a participant'
);

-- Resetting a password -------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated"}';

create temporary table reset_result as
select public.reset_participant_password((select profile_id from created_account)) as password;

select ok(
  (select r.password <> c.password from reset_result r, created_account c),
  'a reset issues a genuinely new password'
);

select ok(
  (select password ~ '^[abcdefghjkmnpqrstuvwxyz23456789]{4}(-[abcdefghjkmnpqrstuvwxyz23456789]{4}){2}$' from reset_result),
  'the reset code keeps the exact three-group shape'
);

select is(
  (select split_part(r.password, '-', 1) from reset_result r),
  (select split_part(c.email, '@', 1) from created_account c),
  'a reset preserves the stable group-one identifier'
);

reset role;

select ok(
  (select u.encrypted_password = extensions.crypt(r.password, u.encrypted_password)
     from reset_result r, created_account c join auth.users u on u.id = c.profile_id),
  'the new password verifies against the stored hash'
);

-- The point of a reset is that the old slip of paper stops working.
select ok(
  (select u.encrypted_password <> extensions.crypt(c.password, u.encrypted_password)
     from created_account c join auth.users u on u.id = c.profile_id),
  'and the old one no longer does'
);

set local role authenticated;

select is(
  (select count(*) from public.audit_log
    where action = 'account.password_reset'
      and target_id = (select profile_id from created_account)
      and created_at >= now())::int,
  1,
  'the reset is audited too'
);

-- A magic-link account has no password to reset. Setting one would silently
-- turn her account into something she was never told about, and would leave a
-- credential nobody has ever seen.
select throws_ok(
  $$ select public.reset_participant_password('5eed0000-0000-4000-8000-000000000026') $$,
  'P0001',
  null::text,
  'resetting a magic-link account is refused: there is no password to replace'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000026", "role": "authenticated"}';

select throws_ok(
  $$ select public.reset_participant_password((select profile_id from created_account)) $$,
  '42501',
  null::text,
  'a participant cannot reset anybody password, including her own this way'
);

-- Rate limiting -----------------------------------------------------------------------

-- A staff session that has been taken over must not be able to mint a hundred
-- identities before anyone notices. The cap is per actor per hour and is read
-- off the audit trail itself, so there is no second store to keep in sync.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated"}';

insert into public.audit_log (org_id, actor_id, action, target_type, target_id)
select
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8000-000000000003',
  'account.create',
  'profile',
  gen_random_uuid()
from generate_series(1, 20);

select throws_ok(
  $$ select public.create_participant_account(
       jsonb_build_object('first_name', 'Massa', 'last_name', 'Depressa')
     ) $$,
  'P0001',
  null::text,
  'minting stops at the hourly cap for one staff member'
);

-- The cap is PER ACTOR: one staff member hitting it must not lock out her
-- colleague, or an attacker could deny the whole team by burning one account.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated"}';

select lives_ok(
  $$ select public.create_participant_account(
       jsonb_build_object('first_name', 'Alta', 'last_name', 'Normal')
     ) $$,
  'and does not lock out a colleague who has minted nothing'
);

select * from finish();
rollback;
