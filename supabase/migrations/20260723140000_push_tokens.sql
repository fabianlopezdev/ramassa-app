-- Migration 0002: push_tokens.
--
-- Registration plumbing for push notifications (RAPP-17, SPEC Phase 1 item 11):
-- stores the Expo push token for each device a user signs in on, so a later phase
-- can send to them. SENDING (targeting, templates, auto-translation) is Phase 3/8
-- and is deliberately not modeled here.
--
-- Schema authority: SPEC.md § Database Schema (push_tokens), with two additions:
--   * `device_id` + `unique (user_id, device_id)` so a device whose token rotates
--     UPDATES its row instead of accumulating a stale one. Without it, "dedupe per
--     device" (RAPP-17 scope 3) is impossible: Expo rotates tokens, and every
--     rotation would leave an undeliverable row behind that a future send would
--     still try to push to.
--   * `updated_at` so token freshness is observable (scope 3: "refresh on app
--     start"). A row's age otherwise tells you nothing about the token's.
-- `user_id` and `platform` are additionally NOT NULL: a token with no owner or no
-- platform cannot be delivered to, so it has no reason to exist.
--
-- RLS (ADR-009): a user reads and writes ONLY their own tokens; staff/admin read
-- tokens within their own org so a later sending feature can target them. No role
-- may write another user's token, which is the denial that matters here: a
-- writable token is a hijackable notification channel.

-- Table -------------------------------------------------------------------------

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('android', 'ios', 'web')),
  -- Client-generated and persisted per install: the OS no longer exposes a stable
  -- hardware id, so the app mints a UUID on first launch and reuses it.
  device_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The dedupe key: one row per user per device (upsert target).
  unique (user_id, device_id),
  -- SPEC's constraint: the same token is never registered twice for one user.
  unique (user_id, token)
);

comment on table public.push_tokens is 'Expo push token per user per device (RAPP-17). Registration only; sending is Phase 3/8.';
comment on column public.push_tokens.device_id is 'Client-generated install UUID. Dedupe key so a rotated token updates in place.';

create trigger push_tokens_set_updated_at
  before update on public.push_tokens
  for each row
  execute function public.set_updated_at();

-- Authorization helper ----------------------------------------------------------
-- SECURITY DEFINER so the org lookup is not itself filtered by the profiles
-- policies: a staff member must be able to confirm a token's owner shares their
-- org even for rows they would otherwise evaluate one at a time. Locked
-- search_path blocks search-path injection, matching migration 0001's helpers.

create or replace function public.user_is_in_current_org(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = target_user_id
      and org_id = public.current_org_id()
  );
$$;

comment on function public.user_is_in_current_org is 'True when the given user shares the caller''s org. SECURITY DEFINER to avoid RLS recursion in cross-table policies.';

-- Row-Level Security ------------------------------------------------------------
-- FORCE so the owner is subject to policies too (ADR-009). With RLS on and no
-- matching policy, access is denied by default: anon gets nothing.

alter table public.push_tokens enable row level security;
alter table public.push_tokens force row level security;

-- SELECT: your own tokens, plus (staff/admin) every token inside your org.
create policy push_tokens_select_self_or_org_staff
  on public.push_tokens
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (
      (select public.is_staff_or_admin())
      and (select public.user_is_in_current_org(user_id))
    )
  );

-- INSERT/UPDATE/DELETE: self only, with no staff exception. Registration is
-- always an act of the device that owns the token, and sign-out removal is the
-- same device withdrawing it. Staff read to target sends; they never write.
create policy push_tokens_insert_self
  on public.push_tokens
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy push_tokens_update_self
  on public.push_tokens
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy push_tokens_delete_self
  on public.push_tokens
  for delete
  to authenticated
  using (user_id = (select auth.uid()));
