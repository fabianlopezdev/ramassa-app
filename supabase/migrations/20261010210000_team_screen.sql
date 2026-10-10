-- The Team screen (RAPP-231).
--
-- Removing a team member keeps at least one active team.manage holder, the same
-- rule set_team_member_permissions applies to toggles (RAPP-229). Before, the
-- removal only kept "another active admin", and since RAPP-230 team.manage, not
-- the admin role, is what lets someone change access.

create or replace function public.remove_staff_member(p_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  subject_role text;
begin
  if not (select public.has_permission('team.manage')) then
    raise insufficient_privilege using message = 'only active admins may remove staff members';
  end if;
  perform private.lock_staff_admin_count(actor_org);
  perform private.lock_team_permissions(actor_org);
  select role into subject_role
  from public.profiles
  where id = p_profile_id and org_id = actor_org and role in ('staff', 'admin') and is_active
  for update;
  if subject_role is null then
    raise no_data_found using message = 'active staff member not found';
  end if;
  if subject_role = 'admin' then
    perform private.assert_another_active_admin(actor_org, p_profile_id);
  end if;

  update public.profiles set is_active = false where id = p_profile_id;
  -- Removing the last person who can manage the team would lock everyone out
  -- of access changes; the whole removal is undone instead (RAPP-231).
  perform private.assert_team_manage_remains(actor_org);
  update auth.users
  set banned_until = now() + interval '100 years', updated_at = now()
  where id = p_profile_id;
  delete from auth.refresh_tokens where user_id = p_profile_id::text;
  delete from auth.sessions where user_id = p_profile_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org, actor, 'staff.remove', 'profile', p_profile_id,
    jsonb_build_object('role', subject_role, 'sessions_revoked', true)
  );
end;
$$;
