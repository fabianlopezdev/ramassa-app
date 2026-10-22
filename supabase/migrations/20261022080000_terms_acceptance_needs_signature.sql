-- The app terms gate opens only on a signed acceptance (RAPP-613, verifier finding 1).
--
-- WHY
--
-- `terms_acceptances_insert_self` (20260731090000_onboarding_intake.sql) still
-- let a player insert her own acceptance row. Since RAPP-613 the gate
-- (`my_terms_acceptance_needed`) only looks for a row naming the current
-- version, which the insert trigger fills in, so one raw insert passed the gate
-- with no signature and no photo choice. No client writes the table directly:
-- every real acceptance goes through `complete_onboarding_signed`,
-- `accept_current_app_terms` or the test scenario tool, and each of them
-- writes the `app_terms_signatures` row in the same transaction.
--
-- WHAT THIS MIGRATION DOES
--
--   1. Drops the insert policy and every write privilege of the client roles
--      on `terms_acceptances`. They keep SELECT (RLS still decides which rows).
--   2. The gate needs an acceptance of the current version that has its
--      signature record (`private.signed_terms_version`). An acceptance made
--      before app terms signatures existed (RAPP-584) is marked
--      `accepted_before_signatures` here, once, so nobody who joined is asked
--      again at deploy; no function ever sets the mark on a new row.
--
-- Docs: https://supabase.com/docs/guides/database/postgres/row-level-security
-- (policies only filter rows a role is GRANTed; revoking the privilege refuses
-- the statement) and https://www.postgresql.org/docs/current/sql-revoke.html

-- 1. No direct writes ------------------------------------------------------------------------------------

drop policy if exists terms_acceptances_insert_self on public.terms_acceptances;
revoke all on table public.terms_acceptances from anon, authenticated;
grant select on table public.terms_acceptances to authenticated;

-- 2. Signed acceptances only -------------------------------------------------------------------------------

alter table public.terms_acceptances
  add column accepted_before_signatures boolean not null default false;
comment on column public.terms_acceptances.accepted_before_signatures is
  'An acceptance recorded before app terms signatures existed (RAPP-584). It counts for the gate without a signature row. Set once by migration 20261022080000; never set on a new row.';

update public.terms_acceptances t
   set accepted_before_signatures = true
 where not exists (select 1 from public.app_terms_signatures s where s.acceptance_id = t.id);

-- Whether this woman has a signed acceptance of this version.
create or replace function private.signed_terms_version(p_profile_id uuid, p_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_version_id is not null and exists (
    select 1 from public.terms_acceptances t
     where t.profile_id = p_profile_id
       and t.version_id = p_version_id
       and (t.accepted_before_signatures
            or exists (select 1 from public.app_terms_signatures s where s.acceptance_id = t.id)));
$$;

revoke all on function private.signed_terms_version(uuid, uuid) from public, anon, authenticated;

create or replace function public.my_terms_acceptance_needed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select current_version.id is not null
       and not private.signed_terms_version(p.id, current_version.id)
      from public.profiles p
      left join lateral private.current_app_terms_version(p.org_id) current_version on true
     where p.id = (select auth.uid()) and p.role = 'player'), false);
$$;

revoke all on function public.my_terms_acceptance_needed() from public, anon;
grant execute on function public.my_terms_acceptance_needed() to authenticated;
