-- On staging, test accounts skip the second factor (RAPP-628).
--
-- WHY
--
-- The people testing the onboarding on staging (Marc and Fabián) sign in with
-- test accounts (RAPP-615, RAPP-616) many times a day. A test account that is
-- a team account still had to verify an authenticator app (RAPP-233) each
-- time. On staging that protects nothing: a test account reads test players
-- only. Production must never allow it.
--
-- HOW
--
--   1. `private.staging_switches` holds named switches. This migration inserts
--      NO row, so on production and on every fresh database the switch is off
--      and nothing changes. On staging an operator inserts the row by hand
--      (supabase/functions/test-sign-in/README.md). No client reads or writes
--      the table.
--   2. `private.second_factor_waived()` is true only when the switch row
--      exists and is enabled AND the caller's own profile is an active test
--      account. A real account is never waived.
--   3. `private.session_is_aal2()`, the one helper every access rule already
--      asks (RAPP-233), now also holds for a waived session. Its grants stay:
--      no client calls it.
--   4. `public.my_second_factor_waived()` lets both apps skip the
--      authenticator screen for a waived session.

-- 1. The switches --------------------------------------------------------------------------------------

create table private.staging_switches (
  name text primary key check (name in ('test_accounts_skip_second_factor')),
  enabled boolean not null default false,
  changed_at timestamptz not null default now()
);

alter table private.staging_switches enable row level security;
alter table private.staging_switches force row level security;
revoke all on private.staging_switches from public, anon, authenticated;

comment on table private.staging_switches is
  'Staging-only switches (RAPP-628). Production never has a row. No row policy and no client grant: only the functions below read it.';
comment on column private.staging_switches.name is
  'The switch. test_accounts_skip_second_factor: active test accounts reach their data without the second factor (RAPP-628).';
comment on column private.staging_switches.enabled is
  'Whether the switch is on (RAPP-628). A missing row is off.';
comment on column private.staging_switches.changed_at is
  'When the switch was last set (RAPP-628).';

-- 2. The waiver --------------------------------------------------------------------------------------------

create or replace function private.second_factor_waived()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.staging_switches as switch
    where switch.name = 'test_accounts_skip_second_factor'
      and switch.enabled
  ) and exists (
    select 1
    from public.profiles as profile
    where profile.id = (select auth.uid())
      and profile.is_test_account
      and profile.is_active
  );
$$;

comment on function private.second_factor_waived is
  'True only on a database whose test_accounts_skip_second_factor switch is on (staging), for an active test account (RAPP-628).';

revoke all on function private.second_factor_waived() from public, anon, authenticated;

-- 3. The access rules' helper ------------------------------------------------------------------------------

-- A real session at aal2 never reads the switch: the CASE asks the waiver only
-- below aal2.
create or replace function private.session_is_aal2()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2' then true
    else (select private.second_factor_waived())
  end;
$$;

comment on function private.session_is_aal2 is
  'True when the current access token was verified with a second factor (RAPP-233), or, on staging only, when the session is a waived test account (RAPP-628).';

revoke all on function private.session_is_aal2() from public, anon, authenticated;

-- 4. For the apps ----------------------------------------------------------------------------------------------

create or replace function public.my_second_factor_waived()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.second_factor_waived());
$$;

comment on function public.my_second_factor_waived is
  'Whether the signed-in account skips the second factor: an active test account on a staging database whose switch is on (RAPP-628). False everywhere else.';

revoke all on function public.my_second_factor_waived() from public, anon;
grant execute on function public.my_second_factor_waived() to authenticated;
