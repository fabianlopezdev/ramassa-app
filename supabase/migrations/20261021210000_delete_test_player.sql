-- Delete a test player and start again (RAPP-617).
--
-- WHY
--
-- The person designing the onboarding repeats it with the same made-up woman:
-- create her, sign in as her, go through the onboarding, delete her, create
-- her again with the same address. So deleting a test player removes all of
-- her (account, profile, answers, custom answers, consents, signatures, files,
-- intake states, invitations), exactly as the RGPD erasure does (RAPP-26), so
-- the address can be invited again at once.
--
-- HOW
--
-- The erasure's record half moves into `private.erase_participant_records`,
-- unchanged, and two doors call it:
--   - `delete_participant_permanently`: anyone, for rgpd.erase and team.manage
--     with a recent authenticator code, as before;
--   - `delete_test_player`: test players only, for test_players.manage or
--     rgpd.erase. The database refuses it for a real player whatever the
--     caller holds. No new authenticator code: she is made up.
-- Both still need the media Worker's fresh receipt (ADR-023): her files go
-- first, then her record. `is_deletable_test_player` is what the Worker asks
-- before it sweeps a test player's files.

-- 1. The record half of the erasure, shared ----------------------------------------------------------

create or replace function private.erase_participant_records(
  p_participant_id uuid,
  p_actor uuid,
  p_org_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject_email text;
  entry record;
  remaining bigint;
  leftovers text[] := array[]::text[];
begin
  select u.email into subject_email from auth.users u where u.id = p_participant_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (p_org_id, p_actor, p_action, 'profile', p_participant_id, jsonb_build_object('erased', true));

  delete from public.invites
   where accepted_by = p_participant_id
      or (subject_email is not null and email = subject_email);

  delete from public.audit_log where actor_id = p_participant_id;

  delete from auth.users where id = p_participant_id;

  for entry in
    select d.table_name, d.participant_column
    from public.personal_data_disposition() d
    where d.disposition = 'purge'
  loop
    execute format(
      'select count(*) from public.%I where %I = $1',
      entry.table_name, entry.participant_column
    ) into remaining using p_participant_id;
    if remaining > 0 then
      leftovers := leftovers || format('%s.%s', entry.table_name, entry.participant_column);
    end if;
  end loop;

  if array_length(leftovers, 1) > 0 then
    raise exception 'DELETION_INCOMPLETE: rows survived in %', array_to_string(leftovers, ', ')
      using errcode = 'raise_exception';
  end if;
end;
$$;

revoke all on function private.erase_participant_records(uuid, uuid, uuid, text) from public, anon, authenticated;

-- The media Worker's receipt: her files were swept, by this caller, just now.
create or replace function private.has_fresh_media_receipt(p_participant_id uuid, p_actor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.audit_log
     where action = 'profile.media_purged'
       and target_id = p_participant_id
       and actor_id = p_actor
       and created_at > now() - interval '30 minutes'
  );
$$;

revoke all on function private.has_fresh_media_receipt(uuid, uuid) from public, anon, authenticated;

-- 2. Permanent erasure, unchanged in what it allows ----------------------------------------------------

create or replace function public.delete_participant_permanently(participant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid;
  subject_role text;
begin
  perform private.require_recent_second_factor();
  if not (select (public.has_permission('rgpd.erase') and public.has_permission('team.manage'))) then
    raise exception 'erasing a participant is an admin action'
      using errcode = 'insufficient_privilege';
  end if;

  actor_org := (select public.current_org_id());

  select p.role into subject_role
  from public.profiles p
  where p.id = participant_id and p.org_id = actor_org;

  if subject_role is null then
    raise exception 'DELETION_NO_SUBJECT: no such participant in this organization'
      using errcode = 'raise_exception';
  end if;

  if subject_role <> 'player' then
    raise exception 'DELETION_NOT_A_PARTICIPANT: only a participant record can be erased here'
      using errcode = 'raise_exception';
  end if;

  if participant_id = actor then
    raise exception 'DELETION_SELF: an admin cannot erase her own account through this path'
      using errcode = 'raise_exception';
  end if;

  if not private.has_fresh_media_receipt(participant_id, actor) then
    raise exception 'DELETION_MEDIA_NOT_PURGED: her uploaded media must be removed before the record'
      using errcode = 'raise_exception';
  end if;

  perform private.erase_participant_records(participant_id, actor, actor_org, 'profile.delete');
end;
$$;

-- 3. Test players -----------------------------------------------------------------------------------

-- What the media Worker asks before it sweeps a test player's files.
create or replace function public.is_deletable_test_player(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select ((select public.has_permission('test_players.manage'))
          or (select public.has_permission('rgpd.erase')))
     and private.is_test_player(p_profile_id);
$$;

create or replace function public.delete_test_player(p_participant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  subject_role text;
  subject_is_test boolean;
begin
  if not ((select public.has_permission('test_players.manage'))
          or (select public.has_permission('rgpd.erase'))) then
    raise exception 'TEST_PLAYER/PERMISSION: deleting a test player needs test_players.manage'
      using errcode = 'insufficient_privilege';
  end if;

  select p.role, p.is_test_account into subject_role, subject_is_test
    from public.profiles p
   where p.id = p_participant_id and p.org_id = actor_org;

  if subject_role is null then
    raise exception 'DELETION_NO_SUBJECT: no such participant in this organization'
      using errcode = 'raise_exception';
  end if;

  -- A real player is never deleted here, whatever the caller holds: her
  -- erasure is the RGPD path, with its own permissions and checks.
  if not subject_is_test or subject_role not in ('player', 'invited') then
    raise exception 'TEST_PLAYER/NOT_A_TEST_PLAYER: only a test player is deleted here'
      using errcode = 'insufficient_privilege';
  end if;

  if not private.has_fresh_media_receipt(p_participant_id, actor) then
    raise exception 'DELETION_MEDIA_NOT_PURGED: her uploaded media must be removed before the record'
      using errcode = 'raise_exception';
  end if;

  perform private.erase_participant_records(p_participant_id, actor, actor_org, 'profile.delete_test_player');
end;
$$;

comment on function public.delete_test_player is
  'Deletes a test player completely so her address can be invited again (RAPP-617). Test players only, for test_players.manage or rgpd.erase, after the media receipt. Audited.';

revoke all on function public.is_deletable_test_player(uuid) from public, anon;
revoke all on function public.delete_test_player(uuid) from public, anon;
grant execute on function public.is_deletable_test_player(uuid) to authenticated;
grant execute on function public.delete_test_player(uuid) to authenticated;
