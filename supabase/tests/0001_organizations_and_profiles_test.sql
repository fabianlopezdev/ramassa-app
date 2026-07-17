-- RLS + field-encryption tests for migration 0001 (organizations + profiles).
-- Run with: bunx supabase test db  (pgTAP, executed against the local stack).
--
-- The heart of RAPP-10: these assertions prove the DENIALS RLS must guarantee:
-- a player cannot read another player's profile, an entity cannot read a
-- non-referred profile, cross-org reads are impossible, and anon gets nothing,
-- plus that the encrypted columns actually store ciphertext and round-trip.
--
-- Self-contained: it seeds its own Vault key and its own tenants/users so it does
-- not depend on seed.sql. Everything runs inside a transaction and rolls back.

begin;
select plan(15);

-- Setup (runs as the superuser test role, which bypasses RLS) -------------------

-- Ensure the encryption key exists for encrypt_field/decrypt_field.
select vault.create_secret('test-encryption-key', 'app_encryption_key', 'pgTAP test key')
where not exists (select 1 from vault.secrets where name = 'app_encryption_key');

-- Two tenants.
insert into public.organizations (id, name, slug) values
  ('00000000-0000-0000-0000-00000000a001', 'Org A', 'org-a'),
  ('00000000-0000-0000-0000-00000000b001', 'Org B', 'org-b');

-- auth.users rows the profiles reference (FK target).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'playerA1@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'playerA2@test.local'),
  ('00000000-0000-0000-0000-0000000000a3', 'staffA@test.local'),
  ('00000000-0000-0000-0000-0000000000a4', 'entityA@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'playerB1@test.local');

-- Profiles. playerA1 carries encrypted PII to exercise the crypto helpers.
insert into public.profiles (id, org_id, role, first_name, last_name, phone, document_number) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000a001', 'player',
    'Amina', 'One', public.encrypt_field('600111222'), public.encrypt_field('X1234567L')),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000a001', 'player',
    'Bea', 'Two', null, null),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000a001', 'staff',
    'Carla', 'Staff', null, null),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000a001', 'entity',
    'Dolors', 'Entity', null, null),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000b001', 'player',
    'Eva', 'OtherOrg', null, null);

-- Encryption assertions (read raw column as superuser; crypto is independent of RLS)
select is(
  pg_typeof(phone)::text, 'bytea',
  'phone is stored as bytea (encrypted), not text'
) from public.profiles where id = '00000000-0000-0000-0000-0000000000a1';

select isnt(
  encode(phone, 'escape'), '600111222',
  'raw phone column contents are ciphertext, not the plaintext'
) from public.profiles where id = '00000000-0000-0000-0000-0000000000a1';

select is(
  public.decrypt_field(phone), '600111222',
  'phone round-trips back to plaintext through decrypt_field'
) from public.profiles where id = '00000000-0000-0000-0000-0000000000a1';

select is(
  public.decrypt_field(document_number), 'X1234567L',
  'document_number round-trips back to plaintext through decrypt_field'
) from public.profiles where id = '00000000-0000-0000-0000-0000000000a1';

-- Impersonation helper macro is inline: set the authenticated role + JWT sub.

-- Player A1 -------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is(
  (select count(*) from public.profiles)::int, 1,
  'player sees exactly one profile (their own)'
);
select is(
  (select id from public.profiles)::text, '00000000-0000-0000-0000-0000000000a1',
  'the one profile a player sees is their own'
);
select is_empty(
  $$ select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000a2' $$,
  'DENIAL: player cannot read another player''s profile'
);
select is(
  (select count(*) from public.organizations)::int, 1,
  'player sees exactly their own organization'
);
select is(
  (select id from public.organizations)::text, '00000000-0000-0000-0000-00000000a001',
  'the org a player sees is their own'
);

-- Entity A --------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';

select is(
  (select count(*) from public.profiles)::int, 1,
  'entity sees exactly one profile (their own)'
);
select is_empty(
  $$ select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000a1' $$,
  'DENIAL: entity cannot read a non-referred profile'
);

-- Staff A ---------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';

select is(
  (select count(*) from public.profiles)::int, 4,
  'staff sees every profile in their own org (4)'
);
select is_empty(
  $$ select 1 from public.profiles where org_id = '00000000-0000-0000-0000-00000000b001' $$,
  'DENIAL: staff cannot read profiles from another org (cross-org isolation)'
);

-- Anonymous -------------------------------------------------------------------
reset role;
set local role anon;
set local request.jwt.claims to '';

select is(
  (select count(*) from public.profiles)::int, 0,
  'DENIAL: anon reads zero profiles'
);
select is(
  (select count(*) from public.organizations)::int, 0,
  'DENIAL: anon reads zero organizations'
);

reset role;
select * from finish();
rollback;
