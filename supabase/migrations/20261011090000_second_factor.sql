-- A second factor for every team member and entity contact (RAPP-233, part of
-- RAPP-211, design: docs/plans/2026-10-08-native-management-app-design.md).
--
-- WHY
--
-- Team members read participants' personal data, and entity contacts read the
-- referrals of the women they sent. An email code alone is one factor: whoever
-- reads the inbox signs in. So a team member's or entity contact's session
-- reaches nothing until it is verified with an authenticator app (TOTP), which
-- Supabase marks as assurance level `aal2` in the access token.
--
-- HOW
--
-- The rule lives in the few helpers every access rule already calls, so no rule
-- can be missed:
--   - has_permission, my_permissions and is_team_member hold for aal2 only;
--   - current_collaborating_entity_id (every entity rule) holds for aal2 only;
--   - current_app_role returns nothing for a staff, admin or entity session
--     below aal2, so any role check fails closed. Players are unaffected: their
--     sign-in is the email code, and they read only their own data.
-- A person with team.manage resets a team member's lost factor, and a person
-- with entities.manage an entity contact's. Email alone never resets it.

create or replace function private.session_is_aal2()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2';
$$;

comment on function private.session_is_aal2 is 'True when the current access token was verified with a second factor (RAPP-233).';

revoke all on function private.session_is_aal2() from public, anon, authenticated;

create or replace function public.has_permission(p_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.session_is_aal2()) and exists (
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
  select (select private.session_is_aal2()) and exists (
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
    and profile.id = (select auth.uid())
    and profile.role = 'entity'
    and profile.is_active
    and entity.is_active;
$$;

-- Recovery --------------------------------------------------------------------------------

-- Removes a person's second factor and ends her sessions, so her next sign-in
-- asks her to set up a new one. team.manage resets a team member, and
-- entities.manage an entity contact. Nobody resets her own: whoever lost the
-- device would otherwise reset it with the email code alone.
create or replace function public.reset_second_factor(p_profile_id uuid)
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
  if p_profile_id = actor then
    raise exception 'SECOND_FACTOR/OWN_RESET' using errcode = '42501';
  end if;

  select role into subject_role
  from public.profiles
  where id = p_profile_id and org_id = actor_org and role in ('staff', 'admin', 'entity');
  if subject_role is null then
    raise exception 'SECOND_FACTOR/NOT_FOUND' using errcode = 'P0002';
  end if;
  if subject_role = 'entity' and not (select public.has_permission('entities.manage')) then
    raise exception 'SECOND_FACTOR/ENTITIES_MANAGE_REQUIRED' using errcode = '42501';
  end if;
  if subject_role <> 'entity' and not (select public.has_permission('team.manage')) then
    raise exception 'SECOND_FACTOR/TEAM_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  delete from auth.mfa_factors where user_id = p_profile_id;
  delete from auth.refresh_tokens where user_id = p_profile_id::text;
  delete from auth.sessions where user_id = p_profile_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'team.second_factor_reset', 'profile', p_profile_id, '{}'::jsonb);
end;
$$;

comment on function public.reset_second_factor is 'Removes a team member''s (team.manage) or entity contact''s (entities.manage) second factor and ends her sessions. Never one''s own. Audited.';

revoke all on function public.reset_second_factor(uuid) from public, anon;
grant execute on function public.reset_second_factor(uuid) to authenticated;
