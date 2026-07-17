-- Migration 0001: organizations + profiles.
--
-- First schema migration for the Ramassà platform. Establishes the white-label
-- tenant table (organizations, ADR-010), the user profile table that extends
-- Supabase auth.users, field-level encryption for a refugee's identifying/locating
-- data (pgcrypto, ADR-004), and Row-Level Security from the very first table
-- (ADR-009). Every table ships with RLS enabled and forced.
--
-- Schema authority: SPEC.md § Database Schema (organizations + profiles).

-- Extensions --------------------------------------------------------------------
-- pgcrypto provides pgp_sym_encrypt/decrypt; on Supabase it lives in the
-- `extensions` schema, so every call below is schema-qualified. supabase_vault
-- stores the symmetric encryption key out of band (never in client code or repo).
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- Tables ------------------------------------------------------------------------

-- Organizations: one row per club/NGO. White-label theming and language config
-- travel with the tenant so a second org can be onboarded without code changes.
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  logo_url text,
  primary_color text not null default '#0077B6',
  secondary_color text not null default '#FFD166',
  default_language text not null default 'ca',
  available_languages text[] not null default array['ca', 'es', 'en', 'ar', 'fa'],
  contact_email text,
  contact_phone text,
  created_at timestamptz not null default now()
);

comment on table public.organizations is 'White-label tenant. One row per club/NGO (ADR-010).';

-- Profiles: extends auth.users 1:1. Columns that identify or physically locate a
-- refugee woman are stored encrypted at rest as BYTEA (ADR-004): a database breach
-- yields ciphertext, not addresses and document numbers. Admins still read the
-- plaintext through the app via the decrypt helper. Aggregate-reporting fields
-- (city, nationality) stay in cleartext by design.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id),
  role text not null default 'player' check (role in ('player', 'staff', 'entity', 'admin')),
  first_name text not null,
  last_name text not null,
  date_of_birth date,
  nationality text,
  address bytea,                          -- ENCRYPTED: physical location
  city text,                              -- cleartext: needed for aggregate reporting
  postal_code bytea,                      -- ENCRYPTED: location data
  phone bytea,                            -- ENCRYPTED: personal contact
  document_type text check (document_type in ('nie', 'passport', 'other', 'none')),
  document_number bytea,                  -- ENCRYPTED: identity document (NIE/passport)
  reference_entity text,                  -- e.g. "Creu Roja", "CEAR"
  reference_contact_name text,
  has_dependents boolean not null default false,
  num_dependents integer not null default 0,
  clothing_size text,
  shoe_size text,
  preferred_language text not null default 'ca',
  avatar_url text,
  is_active boolean not null default true,
  is_forum_banned boolean not null default false,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'App user, 1:1 with auth.users. Encrypted BYTEA columns hold RGPD-sensitive PII (ADR-004).';

-- Index the tenant key: every RLS policy and every staff query filters by org_id.
create index profiles_org_id_idx on public.profiles (org_id);

-- updated_at maintenance --------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- Encryption helpers ------------------------------------------------------------
-- The symmetric key never lives in code or this repo. It is read from Supabase
-- Vault at call time. These helpers are the ONLY sanctioned way to write/read the
-- encrypted columns, so the key handling stays in one place.
--
-- SECURITY DEFINER + empty search_path: the functions run as their owner so they
-- can read vault.decrypted_secrets, and the locked search_path blocks
-- search-path-injection. Callers still need column access, which RLS governs.

create or replace function public.encryption_key()
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'app_encryption_key'
  limit 1;
$$;

comment on function public.encryption_key is 'Reads the field-encryption key from Supabase Vault. Prod key is set out of band; local/test keys are seeded per environment. Never hardcode a key.';

create or replace function public.encrypt_field(plaintext text)
returns bytea
language sql
security definer
set search_path = ''
as $$
  select case
    when plaintext is null then null
    else extensions.pgp_sym_encrypt(plaintext, public.encryption_key())
  end;
$$;

comment on function public.encrypt_field is 'Encrypts a value for an encrypted BYTEA column using the Vault key. Returns NULL for NULL input.';

create or replace function public.decrypt_field(ciphertext bytea)
returns text
language sql
security definer
set search_path = ''
as $$
  select case
    when ciphertext is null then null
    else extensions.pgp_sym_decrypt(ciphertext, public.encryption_key())
  end;
$$;

comment on function public.decrypt_field is 'Decrypts an encrypted BYTEA column back to text using the Vault key. Returns NULL for NULL input.';

-- Authorization helpers ---------------------------------------------------------
-- These read the caller's own profile. They are SECURITY DEFINER so they bypass
-- RLS: a policy ON profiles that queried profiles directly would recurse forever.
-- Wrapping them in `(select ...)` inside a policy lets Postgres cache the result
-- once per statement instead of per row.

create or replace function public.current_org_id()
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select org_id from public.profiles where id = (select auth.uid());
$$;

comment on function public.current_org_id is 'org_id of the calling user. SECURITY DEFINER to avoid RLS recursion in profiles policies.';

create or replace function public.current_app_role()
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

comment on function public.current_app_role is 'role of the calling user. SECURITY DEFINER to avoid RLS recursion in profiles policies.';

create or replace function public.is_staff_or_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('staff', 'admin')
  );
$$;

comment on function public.is_staff_or_admin is 'True when the caller is staff or admin. SECURITY DEFINER to avoid RLS recursion.';

-- Row-Level Security ------------------------------------------------------------
-- FORCE so the table owner is subject to policies too; RLS is the security
-- boundary, not a convenience filter (ADR-009). With RLS enabled and no matching
-- policy, access is denied by default, which is exactly what anon and cross-org
-- callers must get.

alter table public.organizations enable row level security;
alter table public.organizations force row level security;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

-- Organizations: a signed-in user sees only their own org. Staff/admin may edit it.
create policy organizations_select_own
  on public.organizations
  for select
  to authenticated
  using (id = (select public.current_org_id()));

create policy organizations_update_staff
  on public.organizations
  for update
  to authenticated
  using (id = (select public.current_org_id()) and (select public.is_staff_or_admin()))
  with check (id = (select public.current_org_id()) and (select public.is_staff_or_admin()));

-- Profiles SELECT: you can read your own row; staff/admin read every row in their
-- org. Players and entities therefore see only themselves; an entity cannot read
-- an arbitrary (non-referred) profile, and no role can read across orgs. (Entity
-- access to *referred* participants arrives with the referrals table in a later
-- migration.)
create policy profiles_select_self_or_org_staff
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or ((select public.is_staff_or_admin()) and org_id = (select public.current_org_id()))
  );

-- Profiles UPDATE: users update their own row but cannot escalate: the WITH CHECK
-- pins role and org_id to their current committed values (the SECURITY DEFINER
-- helpers read the pre-update row). Staff/admin update any row within their org.
create policy profiles_update_self_no_escalation
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and role = (select public.current_app_role())
    and org_id = (select public.current_org_id())
  );

create policy profiles_update_org_staff
  on public.profiles
  for update
  to authenticated
  using ((select public.is_staff_or_admin()) and org_id = (select public.current_org_id()))
  with check ((select public.is_staff_or_admin()) and org_id = (select public.current_org_id()));

-- Profiles INSERT: staff/admin create profiles within their own org. First-login
-- self-provisioning (magic-link onboarding, ADR-005) will be handled by an
-- auth.users trigger in the auth issue; it is intentionally not modeled here.
create policy profiles_insert_org_staff
  on public.profiles
  for insert
  to authenticated
  with check ((select public.is_staff_or_admin()) and org_id = (select public.current_org_id()));

-- Profiles DELETE: staff/admin only, within their org (RGPD erasure is a staff
-- action). Players and entities cannot delete profile rows.
create policy profiles_delete_org_staff
  on public.profiles
  for delete
  to authenticated
  using ((select public.is_staff_or_admin()) and org_id = (select public.current_org_id()));
