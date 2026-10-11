-- Remote sign-out (RAPP-234, part of RAPP-211).
--
-- WHY
--
-- A lost or shared phone keeps a signed-in session. Deleting the person's
-- refreshable sessions stops new access tokens, but one already issued stays
-- valid until it expires (an hour). So each profile gets a "sessions valid
-- after" time, and the helpers every access rule calls deny a token issued
-- before it, at once and on every device: the immediate-deny pattern of
-- ADR-025.
--
-- WHO
--
-- Anyone signs herself out everywhere. A team.manage holder signs out a team
-- member, and an entities.manage holder an entity contact. Every remote sign-out
-- is audited. The column is protected from direct writes (RAPP-239), so a
-- revoked token cannot write itself valid again.

alter table public.profiles add column sessions_valid_after timestamptz;

comment on column public.profiles.sessions_valid_after is 'Access tokens issued before this time are denied by the access helpers (RAPP-234). Set by sign_out_everywhere.';

-- True unless the access token was issued before the person's last remote
-- sign-out. A token without an issue time (a test or service context) and a
-- person never signed out remotely both count as current.
create or replace function private.session_is_current()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select to_timestamp(((select auth.jwt()) ->> 'iat')::bigint) > profile.sessions_valid_after
    from public.profiles as profile
    where profile.id = (select auth.uid())
  ), true);
$$;

revoke all on function private.session_is_current() from public, anon, authenticated;

-- The signed-in apps ask this on sign-in and when they come back to the front,
-- and sign out on this device when it says no.
create or replace function public.my_session_is_current()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.session_is_current());
$$;

revoke all on function public.my_session_is_current() from public, anon;
grant execute on function public.my_session_is_current() to authenticated;

-- The access helpers, with the session check added to the second-factor rule.

create or replace function public.has_permission(p_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.session_is_aal2())
    and (select private.session_is_current())
    and exists (
      select 1
      from public.team_member_permissions as grant_row
      join public.profiles as profile on profile.id = grant_row.profile_id
      where grant_row.profile_id = (select auth.uid())
        and grant_row.permission_code = p_code
        and grant_row.org_id = profile.org_id
        and profile.is_active
        and profile.role in ('staff', 'admin')
    );
$$;

create or replace function public.my_permissions()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select grant_row.permission_code
  from public.team_member_permissions as grant_row
  join public.profiles as profile on profile.id = grant_row.profile_id
  where (select private.session_is_aal2())
    and (select private.session_is_current())
    and grant_row.profile_id = (select auth.uid())
    and grant_row.org_id = profile.org_id
    and profile.is_active
    and profile.role in ('staff', 'admin')
  order by grant_row.permission_code;
$$;

create or replace function public.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.session_is_aal2())
    and (select private.session_is_current())
    and exists (
      select 1
      from public.team_member_permissions as grant_row
      join public.profiles as profile on profile.id = grant_row.profile_id
      where grant_row.profile_id = (select auth.uid())
        and grant_row.org_id = profile.org_id
        and profile.is_active
        and profile.role in ('staff', 'admin')
    );
$$;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.profiles
  where id = (select auth.uid())
    and is_active
    and (select private.session_is_current())
    and (role = 'player' or (select private.session_is_aal2()));
$$;

create or replace function public.current_collaborating_entity_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select profile.collaborating_entity_id
  from public.profiles as profile
  join public.collaborating_entities as entity
    on entity.org_id = profile.org_id
   and entity.id = profile.collaborating_entity_id
  where (select private.session_is_aal2())
    and (select private.session_is_current())
    and profile.id = (select auth.uid())
    and profile.role = 'entity'
    and profile.is_active
    and entity.is_active;
$$;

-- Signing out everywhere -------------------------------------------------------------------

create or replace function public.sign_out_everywhere(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  subject_role text;
begin
  if actor is null then
    raise exception 'SESSIONS/SIGNED_OUT' using errcode = '42501';
  end if;

  if p_profile_id <> actor then
    select role into subject_role
    from public.profiles
    where id = p_profile_id and org_id = actor_org;
    if subject_role is null then
      raise exception 'SESSIONS/NOT_FOUND' using errcode = 'P0002';
    end if;
    if subject_role = 'entity' and not (select public.has_permission('entities.manage')) then
      raise exception 'SESSIONS/ENTITIES_MANAGE_REQUIRED' using errcode = '42501';
    end if;
    if subject_role in ('staff', 'admin') and not (select public.has_permission('team.manage')) then
      raise exception 'SESSIONS/TEAM_MANAGE_REQUIRED' using errcode = '42501';
    end if;
    if subject_role = 'player' then
      raise exception 'SESSIONS/PLAYERS_SIGN_THEMSELVES_OUT' using errcode = '42501';
    end if;
  end if;

  update public.profiles set sessions_valid_after = now() where id = p_profile_id;
  delete from auth.refresh_tokens where user_id = p_profile_id::text;
  delete from auth.sessions where user_id = p_profile_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    (select org_id from public.profiles where id = p_profile_id),
    actor, 'sessions.sign_out_everywhere', 'profile', p_profile_id, '{}'::jsonb
  );
end;
$$;

comment on function public.sign_out_everywhere is 'Ends every session of a person at once (RAPP-234): herself, a team member (team.manage) or an entity contact (entities.manage). Audited.';

revoke all on function public.sign_out_everywhere(uuid) from public, anon;
grant execute on function public.sign_out_everywhere(uuid) to authenticated;

-- The column is protected from direct writes, with the others (RAPP-239).
create or replace function private.guard_profile_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
begin
  -- A SECURITY DEFINER function runs as its owner. The five SECURITY INVOKER
  -- functions that write profiles mark their one write as trusted (below).
  if current_user not in ('authenticated', 'anon')
    or current_setting('ramassa.trusted_profile_write', true) = 'on'
  then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Profiles are created by onboarding or an invitation, never by a direct insert.
    raise exception 'PROFILES/DIRECT_INSERT' using errcode = '42501';
  end if;

  if new.id is distinct from old.id
    or new.org_id is distinct from old.org_id
    or new.role is distinct from old.role
    or new.is_active is distinct from old.is_active
    or new.is_forum_banned is distinct from old.is_forum_banned
    or new.anonymized_at is distinct from old.anonymized_at
    or new.terms_accepted_at is distinct from old.terms_accepted_at
    or new.media_consent_at is distinct from old.media_consent_at
    or new.auth_method is distinct from old.auth_method
    or new.collaborating_entity_id is distinct from old.collaborating_entity_id
    or new.created_at is distinct from old.created_at
    or new.sessions_valid_after is distinct from old.sessions_valid_after
  then
    -- These columns change only through their own action (an RPC).
    raise exception 'PROFILES/PRIVILEGED_COLUMN' using errcode = '42501';
  end if;

  return new;
end;
$$;
