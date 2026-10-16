-- Renewing and cancelling a participant invite (RAPP-284, part of RAPP-213).
--
-- An invite sends no email: it records her address and creates the empty
-- account that lets her first code request succeed (login is closed to unknown
-- addresses). So "resend" is a renewal: the invite gets 30 more days. And a
-- cancellation removes the invite and, when nothing else needs it, the empty
-- account it made, so the address can no longer sign in.
--
-- Both are staff actions for participants.invite holders in the invite's own
-- organization, only on an invite she has not used yet, and both are audited
-- without the address, as create_participant_invite() is.

create or replace function public.renew_participant_invite(p_invite_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  next_expiry timestamptz := now() + interval '30 days';
begin
  if not (select public.has_permission('participants.invite')) then
    raise exception 'renewing an invitation is a staff action'
      using errcode = 'insufficient_privilege';
  end if;

  perform public.assert_within_hourly_limit('invite.renew', 30);

  update public.invites
     set expires_at = next_expiry
   where id = p_invite_id
     and org_id = actor_org
     and accepted_at is null;
  if not found then
    raise exception 'no open invitation with that id in this organization'
      using errcode = 'no_data_found';
  end if;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'invite.renew', 'invite', p_invite_id,
    jsonb_build_object('expires_at', next_expiry));

  return next_expiry;
end;
$$;
revoke all on function public.renew_participant_invite(uuid) from public, anon;
grant execute on function public.renew_participant_invite(uuid) to authenticated;

create or replace function public.revoke_participant_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  invite_email text;
  removed_account boolean := false;
begin
  if not (select public.has_permission('participants.invite')) then
    raise exception 'cancelling an invitation is a staff action'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.invites
   where id = p_invite_id
     and org_id = actor_org
     and accepted_at is null
  returning email into invite_email;
  if invite_email is null then
    raise exception 'no open invitation with that id in this organization'
      using errcode = 'no_data_found';
  end if;

  -- The empty account goes only when nothing else stands on it: no profile,
  -- no other open participant invite, and no staff or entity invitation for
  -- the same address.
  delete from auth.users account
   where lower(account.email) = invite_email
     and not exists (select 1 from public.profiles profile where profile.id = account.id)
     and not exists (
       select 1 from public.invites other
        where other.email = invite_email and other.accepted_at is null
     )
     and not exists (
       select 1 from public.staff_invitations staff
        where lower(staff.email) = invite_email and staff.accepted_at is null
     )
     and not exists (
       select 1 from public.entity_invitations entity
        where lower(entity.email) = invite_email and entity.accepted_at is null
     );
  removed_account := found;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'invite.revoke', 'invite', p_invite_id,
    jsonb_build_object('account_removed', removed_account));
end;
$$;
revoke all on function public.revoke_participant_invite(uuid) from public, anon;
grant execute on function public.revoke_participant_invite(uuid) to authenticated;
