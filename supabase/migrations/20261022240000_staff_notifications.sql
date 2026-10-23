-- The Control Center bell keeps stored notifications (RAPP-640).
--
-- WHY
--
-- The first bell (RAPP-635) counted the queues on every refresh, so it could
-- say "3 referrals" but never "Creu Roja sent a referral", and nothing could
-- be marked read or cleared. This keeps one row per recipient per event, the
-- way the Studio Portal bell does: unread until she opens it, hidden when she
-- deletes it, never erased.
--
-- WHAT THIS MIGRATION DOES
--
--   1. public.staff_notifications: id, org_id, recipient_id, event, source_id,
--      params, path, created_at, read_at, deleted_at. `source_id` is the row
--      the event is about (the conversation, the referral, the request), so
--      the bell renders names at display time from the live row: an erased
--      participant's name is gone from the bell the moment she is erased, and
--      copy changes reach old rows. `params` holds only non-personal values
--      (a message count, a report's target type).
--   2. Row security: a recipient reads her own rows that are not deleted, as
--      a verified team member. No client may insert, update or delete; the
--      changes go through the functions below.
--   3. public.list_staff_notifications(limit): her latest rows with the name
--      each event shows, resolved now and only while she still holds the
--      event's permission. public.mark_staff_notification_read(id) and
--      public.delete_staff_notifications(ids) change only her own rows.
--   4. One trigger per queue the first bell counted, with the same pending
--      definition and permission (see each trigger). Recipients: active
--      staff and admins of the row's organization who hold the permission,
--      test accounts included, never the person who caused the event.
--   5. Chat dedupe: a new message from a player bumps her unread, not deleted
--      notification for that conversation (newer created_at, count + 1)
--      instead of adding a row.
--
-- A trigger never blocks the write it follows: a failure to notify is logged
-- as a warning and the player's message, request or report is still saved.
--
-- Docs: https://supabase.com/docs/guides/database/postgres/row-level-security
-- and https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker

-- 1. The table ------------------------------------------------------------------------------------

create table public.staff_notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  event text not null check (event in (
    'message', 'referral', 'walk_in', 'deletion_request', 'mentoring_request',
    'feedback', 'forum_report', 'gallery_report'
  )),
  source_id uuid,
  params jsonb not null default '{}'::jsonb
    check (jsonb_typeof(params) = 'object' and pg_column_size(params) <= 1024),
  path text not null check (path ~ '^/' and length(path) <= 200),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  deleted_at timestamptz
);

comment on table public.staff_notifications is
  'The Control Center bell: one row per recipient per event, read_at when opened, deleted_at when cleared, never erased (RAPP-640).';

create index staff_notifications_recipient_created_idx
  on public.staff_notifications (recipient_id, created_at desc);
-- The chat dedupe looks up her open notification for a conversation.
create index staff_notifications_open_source_idx
  on public.staff_notifications (recipient_id, event, source_id)
  where read_at is null and deleted_at is null;

-- 2. Row security and grants -----------------------------------------------------------------------

alter table public.staff_notifications enable row level security;
alter table public.staff_notifications force row level security;

create policy staff_notifications_select_own
  on public.staff_notifications
  for select
  to authenticated
  using (
    recipient_id = (select auth.uid())
    and deleted_at is null
    and org_id = (select public.current_org_id())
    and (select public.is_team_member())
  );

revoke all on table public.staff_notifications from public, anon, authenticated;
grant select on table public.staff_notifications to authenticated;

-- 3. Her own rows ----------------------------------------------------------------------------------

-- The permissions that let her act on an event: the queue's own permission.
create function private.staff_notification_permissions(p_event text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_event
    when 'message' then array['messages.inbox']
    when 'referral' then array['referrals.manage']
    when 'walk_in' then array['participants.invite']
    when 'deletion_request' then array['rgpd.erase']
    when 'mentoring_request' then array['mentoring.manage']
    when 'feedback' then array['feedback.view']
    when 'forum_report' then array['forum.moderate']
    when 'gallery_report' then array['gallery.moderate']
    else array[]::text[]
  end;
$$;

-- The name an event shows, read from its row now: null once the person is
-- erased, the row is gone, or the event names nobody (a report).
create function private.staff_notification_name(p_event text, p_source_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case p_event
    when 'message' then (
      select person.first_name
        from public.conversations as conversation
        join public.profiles as person on person.id = conversation.user_id
       where conversation.id = p_source_id and person.anonymized_at is null)
    when 'referral' then (
      select entity.name
        from public.entity_referrals as referral
        join public.collaborating_entities as entity
          on entity.org_id = referral.org_id and entity.id = referral.collaborating_entity_id
       where referral.id = p_source_id)
    when 'walk_in' then (
      select signing.first_name from public.walk_in_signings as signing
       where signing.id = p_source_id)
    when 'deletion_request' then (
      select person.first_name
        from public.deletion_requests as request
        join public.profiles as person on person.id = request.profile_id
       where request.id = p_source_id and person.anonymized_at is null)
    when 'mentoring_request' then (
      select person.first_name
        from public.mentoring_requests as request
        join public.profiles as person on person.id = request.player_id
       where request.id = p_source_id and person.anonymized_at is null)
    when 'feedback' then (
      select person.first_name
        from public.feedback_submissions as submission
        join public.profiles as person on person.id = submission.author_id
       where submission.id = p_source_id and person.anonymized_at is null)
    else null
  end;
$$;

revoke all on function private.staff_notification_permissions(text) from public, anon, authenticated;
revoke all on function private.staff_notification_name(text, uuid) from public, anon, authenticated;

create function public.list_staff_notifications(p_limit integer default 30)
returns table (
  id uuid, event text, params jsonb, path text, name text,
  created_at timestamptz, read_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select notification.id, notification.event, notification.params, notification.path,
         -- The name only while she may still act on the event.
         case
           when exists (
             select 1 from unnest(private.staff_notification_permissions(notification.event)) as code
              where (select public.has_permission(code))
           )
           then private.staff_notification_name(notification.event, notification.source_id)
         end,
         notification.created_at, notification.read_at
    from public.staff_notifications as notification
   where notification.recipient_id = (select auth.uid())
     and notification.org_id = (select public.current_org_id())
     and notification.deleted_at is null
     and (select public.is_team_member())
   order by notification.created_at desc, notification.id desc
   limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

comment on function public.list_staff_notifications(integer) is
  'Her latest bell notifications, with the name each shows resolved now (RAPP-640).';

create function public.mark_staff_notification_read(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.staff_notifications
     set read_at = now()
   where id = p_id
     and recipient_id = (select auth.uid())
     and read_at is null
     and deleted_at is null
     and (select public.is_team_member());
$$;

create function public.delete_staff_notifications(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  if not (select public.is_team_member()) then
    return 0;
  end if;
  update public.staff_notifications
     set deleted_at = now()
   where id = any (coalesce(p_ids, array[]::uuid[]))
     and recipient_id = (select auth.uid())
     and deleted_at is null;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.list_staff_notifications(integer) from public, anon;
revoke all on function public.mark_staff_notification_read(uuid) from public, anon;
revoke all on function public.delete_staff_notifications(uuid[]) from public, anon;
grant execute on function public.list_staff_notifications(integer) to authenticated;
grant execute on function public.mark_staff_notification_read(uuid) to authenticated;
grant execute on function public.delete_staff_notifications(uuid[]) to authenticated;

-- 4. Writing notifications -------------------------------------------------------------------------

-- Active staff and admins of the organization who hold one of the
-- permissions, test accounts included, never the excluded people.
create function private.staff_notification_recipients(
  p_org_id uuid,
  p_permissions text[],
  p_exclude uuid[]
)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct profile.id
    from public.profiles as profile
    join public.team_member_permissions as grant_row
      on grant_row.profile_id = profile.id and grant_row.org_id = profile.org_id
   where profile.org_id = p_org_id
     and profile.role in ('staff', 'admin')
     and profile.is_active
     and profile.anonymized_at is null
     and grant_row.permission_code = any (p_permissions)
     -- array_remove: an unknown actor (null) must not hide everyone.
     and not (profile.id = any (array_remove(coalesce(p_exclude, array[]::uuid[]), null)));
$$;

create function private.notify_staff(
  p_org_id uuid,
  p_event text,
  p_source_id uuid,
  p_path text,
  p_exclude uuid[],
  p_params jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.staff_notifications (org_id, recipient_id, event, source_id, params, path)
  select p_org_id, recipient, p_event, p_source_id, p_params, p_path
    from private.staff_notification_recipients(
      p_org_id, private.staff_notification_permissions(p_event), p_exclude) as recipient;
$$;

-- A message from a player: bump her open notification for the conversation,
-- or add one with a count of 1.
create function private.notify_staff_of_message(
  p_org_id uuid,
  p_conversation_id uuid,
  p_sender_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  with recipient as (
    select recipient_id
      from private.staff_notification_recipients(
        p_org_id, array['messages.inbox'], array[p_sender_id, (select auth.uid())]) as recipient_id
  ),
  bumped as (
    update public.staff_notifications as notification
       set created_at = now(),
           params = jsonb_set(
             notification.params, '{count}',
             to_jsonb(coalesce((notification.params ->> 'count')::integer, 1) + 1))
      from recipient
     where notification.recipient_id = recipient.recipient_id
       and notification.event = 'message'
       and notification.source_id = p_conversation_id
       and notification.read_at is null
       and notification.deleted_at is null
    returning notification.recipient_id
  )
  insert into public.staff_notifications (org_id, recipient_id, event, source_id, params, path)
  select p_org_id, recipient.recipient_id, 'message', p_conversation_id,
         jsonb_build_object('count', 1), '/messages/' || p_conversation_id::text
    from recipient
   where recipient.recipient_id not in (select bumped.recipient_id from bumped);
$$;

revoke all on function private.staff_notification_recipients(uuid, text[], uuid[]) from public, anon, authenticated;
revoke all on function private.notify_staff(uuid, text, uuid, text, uuid[], jsonb) from public, anon, authenticated;
revoke all on function private.notify_staff_of_message(uuid, uuid, uuid) from public, anon, authenticated;

-- 5. The triggers, one per queue ---------------------------------------------------------------------

create function private.staff_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  owner_id uuid;
  owner_org uuid;
begin
  begin
    case tg_table_name
      -- A message in a player's conversation, written by that player.
      when 'messages' then
        select conversation.user_id into owner_id
          from public.conversations as conversation
         where conversation.id = new.conversation_id;
        if owner_id is not null and new.sender_id = owner_id then
          perform private.notify_staff_of_message(new.org_id, new.conversation_id, new.sender_id);
        end if;

      -- A referral waiting for review: status 'pending', the referrals queue's filter.
      when 'entity_referrals' then
        if new.status = 'pending' then
          perform private.notify_staff(new.org_id, 'referral', new.id,
            '/participants/referrals', array[actor, new.entity_user_id]);
        end if;

      -- A tablet signing waiting for review: status 'pending', as list_walk_in_signings.
      when 'walk_in_signings' then
        if new.status = 'pending' then
          perform private.notify_staff(new.org_id, 'walk_in', new.id,
            '/participants/walk-ins', array[actor, new.collected_by]);
        end if;

      -- An open erasure request: state 'open', the requests page's filter.
      when 'deletion_requests' then
        if new.state = 'open' then
          select person.org_id into owner_org
            from public.profiles as person where person.id = new.profile_id;
          if owner_org is not null then
            perform private.notify_staff(owner_org, 'deletion_request', new.id,
              '/participants/deletion-requests', array[actor, new.profile_id]);
          end if;
        end if;

      -- A mentoring request not yet scheduled: status 'requested'.
      when 'mentoring_requests' then
        if new.status = 'requested' then
          perform private.notify_staff(new.org_id, 'mentoring_request', new.id,
            '/mentoring', array[actor, new.player_id]);
        end if;

      -- New feedback: status 'new'.
      when 'feedback_submissions' then
        if new.status = 'new' then
          perform private.notify_staff(new.org_id, 'feedback', new.id,
            '/feedback', array[actor, new.author_id]);
        end if;

      -- A pending report on a post, a reply or a gallery photo.
      when 'forum_flags' then
        if new.state = 'pending' then
          if new.media_id is not null then
            perform private.notify_staff(new.org_id, 'gallery_report', new.id,
              '/forum', array[actor, new.flagger_id], jsonb_build_object('target', 'media'));
          else
            perform private.notify_staff(new.org_id, 'forum_report', new.id,
              '/forum', array[actor, new.flagger_id],
              jsonb_build_object('target', case when new.reply_id is null then 'post' else 'reply' end));
          end if;
        end if;
      else
        null;
    end case;
  exception when others then
    -- The bell is a hint: never refuse her message or request over it.
    raise warning 'staff notification for % % failed: %', tg_table_name, new.id, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function private.staff_notification_trigger() from public, anon, authenticated;

create trigger messages_notify_staff
  after insert on public.messages
  for each row execute function private.staff_notification_trigger();
create trigger entity_referrals_notify_staff
  after insert on public.entity_referrals
  for each row execute function private.staff_notification_trigger();
create trigger walk_in_signings_notify_staff
  after insert on public.walk_in_signings
  for each row execute function private.staff_notification_trigger();
create trigger deletion_requests_notify_staff
  after insert on public.deletion_requests
  for each row execute function private.staff_notification_trigger();
create trigger mentoring_requests_notify_staff
  after insert on public.mentoring_requests
  for each row execute function private.staff_notification_trigger();
create trigger feedback_submissions_notify_staff
  after insert on public.feedback_submissions
  for each row execute function private.staff_notification_trigger();
create trigger forum_flags_notify_staff
  after insert on public.forum_flags
  for each row execute function private.staff_notification_trigger();
