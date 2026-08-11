-- Direct player and entity conversations with Ramassa staff (RAPP-47).
--
-- One conversation has exactly one non-staff participant. Staff access is
-- organization-wide. This shape makes a player-to-player thread impossible to
-- represent, while RLS makes another participant's thread impossible to read or
-- write. Message ids come from the client so persisted outbox retries are safe.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null,
  assigned_staff_id uuid,
  created_at timestamptz not null default now(),
  constraint conversations_org_id_id_unique unique (org_id, id),
  constraint conversations_user_unique unique (org_id, user_id),
  constraint conversations_user_tenant_fkey
    foreign key (org_id, user_id)
    references public.profiles (org_id, id) on delete cascade,
  constraint conversations_staff_tenant_fkey
    foreign key (org_id, assigned_staff_id)
    references public.profiles (org_id, id) on delete set null (assigned_staff_id)
);

create table public.messages (
  id uuid primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null,
  sender_id uuid not null,
  content text,
  image_url text,
  created_at timestamptz not null default now(),
  constraint messages_conversation_tenant_fkey
    foreign key (org_id, conversation_id)
    references public.conversations (org_id, id) on delete cascade,
  constraint messages_sender_tenant_fkey
    foreign key (org_id, sender_id)
    references public.profiles (org_id, id) on delete cascade,
  constraint messages_conversation_id_unique unique (org_id, conversation_id, id),
  constraint messages_content_length_check check (
    content is null or (length(btrim(content)) between 1 and 4000)
  ),
  constraint messages_image_url_length_check check (
    image_url is null or (length(btrim(image_url)) between 1 and 1024)
  ),
  constraint messages_payload_check check (content is not null or image_url is not null)
);

create table public.conversation_read_states (
  org_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null,
  user_id uuid not null,
  last_read_message_id uuid,
  read_at timestamptz not null default now(),
  primary key (conversation_id, user_id),
  constraint conversation_read_states_conversation_tenant_fkey
    foreign key (org_id, conversation_id)
    references public.conversations (org_id, id) on delete cascade,
  constraint conversation_read_states_user_tenant_fkey
    foreign key (org_id, user_id)
    references public.profiles (org_id, id) on delete cascade,
  constraint conversation_read_states_message_fkey
    foreign key (last_read_message_id)
    references public.messages (id) on delete set null
);

comment on table public.conversations is
  'One direct team conversation per player or entity user. The non-staff participant is user_id.';
comment on table public.messages is
  'Direct conversation messages. Client-generated ids make outbox retries idempotent.';
comment on column public.messages.image_url is
  'Optional authenticated R2 object key. RAPP-47 ships text first and keeps the schema path ready.';
comment on table public.conversation_read_states is
  'Per-reader read-through cursor used for exact unread counts.';

create index conversations_assigned_staff_idx
  on public.conversations (org_id, assigned_staff_id, id)
  where assigned_staff_id is not null;
create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at, id);
create index messages_sender_idx on public.messages (sender_id, id);
create index conversation_read_states_user_idx
  on public.conversation_read_states (user_id, conversation_id);

create or replace function private.enforce_conversation_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  participant_role text;
  staff_role text;
begin
  select profile.role into participant_role
  from public.profiles as profile
  where profile.org_id = new.org_id and profile.id = new.user_id;

  if participant_role not in ('player', 'entity') then
    raise exception 'a conversation participant must be a player or entity user'
      using errcode = 'check_violation';
  end if;

  if new.assigned_staff_id is not null then
    select profile.role into staff_role
    from public.profiles as profile
    where profile.org_id = new.org_id and profile.id = new.assigned_staff_id;
    if staff_role not in ('staff', 'admin') then
      raise exception 'an assigned conversation owner must be staff or admin'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger conversations_enforce_roles
  before insert or update of org_id, user_id, assigned_staff_id on public.conversations
  for each row execute function private.enforce_conversation_roles();

alter table public.conversations enable row level security;
alter table public.conversations force row level security;
alter table public.messages enable row level security;
alter table public.messages force row level security;
alter table public.conversation_read_states enable row level security;
alter table public.conversation_read_states force row level security;

create policy conversations_select_participant_or_staff
  on public.conversations for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      user_id = (select auth.uid())
      or (select public.is_staff_or_admin())
    )
  );

create policy conversations_insert_self
  on public.conversations for insert to authenticated
  with check (
    org_id = (select public.current_org_id())
    and user_id = (select auth.uid())
    and assigned_staff_id is null
    and (select public.current_app_role()) in ('player', 'entity')
  );

create policy messages_select_participant_or_staff
  on public.messages for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and exists (
      select 1
      from public.conversations as conversation
      where conversation.id = messages.conversation_id
        and conversation.org_id = messages.org_id
        and (
          conversation.user_id = (select auth.uid())
          or (select public.is_staff_or_admin())
        )
    )
  );

create policy messages_insert_participant_or_staff
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and org_id = (select public.current_org_id())
    and exists (
      select 1
      from public.conversations as conversation
      where conversation.id = messages.conversation_id
        and conversation.org_id = messages.org_id
        and (
          conversation.user_id = (select auth.uid())
          or (select public.is_staff_or_admin())
        )
    )
  );

create policy conversation_read_states_select_self
  on public.conversation_read_states for select to authenticated
  using (
    user_id = (select auth.uid())
    and org_id = (select public.current_org_id())
  );

revoke all on table public.conversations from public, anon, authenticated;
revoke all on table public.messages from public, anon, authenticated;
revoke all on table public.conversation_read_states from public, anon, authenticated;
grant select, insert on table public.conversations to authenticated;
grant select, insert on table public.messages to authenticated;
grant select on table public.conversation_read_states to authenticated;

create or replace function public.get_or_create_own_conversation()
returns public.conversations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  own_org uuid := (select public.current_org_id());
  result public.conversations;
begin
  if (select public.current_app_role()) not in ('player', 'entity') then
    raise exception 'only a player or entity user has an own conversation'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.conversations (org_id, user_id)
  values (own_org, (select auth.uid()))
  on conflict (org_id, user_id) do nothing;

  select conversation.* into result
  from public.conversations as conversation
  where conversation.org_id = own_org
    and conversation.user_id = (select auth.uid());

  if result.id is null then
    raise exception 'conversation is not available'
      using errcode = 'insufficient_privilege';
  end if;
  return result;
end;
$$;

create or replace function public.send_message(
  p_conversation_id uuid,
  p_message_id uuid,
  p_content text,
  p_image_url text
)
returns public.messages
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  result public.messages;
begin
  if actor is null then
    raise exception 'authentication is required' using errcode = 'insufficient_privilege';
  end if;

  insert into public.messages (
    id, org_id, conversation_id, sender_id, content, image_url
  )
  select
    p_message_id,
    conversation.org_id,
    conversation.id,
    actor,
    nullif(btrim(p_content), ''),
    nullif(btrim(p_image_url), '')
  from public.conversations as conversation
  where conversation.id = p_conversation_id
    and conversation.org_id = actor_org
    and (
      conversation.user_id = actor
      or (select public.is_staff_or_admin())
    )
  on conflict (id) do nothing;

  select message.* into result
  from public.messages as message
  where message.id = p_message_id
    and message.conversation_id = p_conversation_id
    and message.sender_id = actor
    and message.content is not distinct from nullif(btrim(p_content), '')
    and message.image_url is not distinct from nullif(btrim(p_image_url), '');

  if result.id is null then
    raise exception 'message is not writable or the id belongs to another payload'
      using errcode = 'insufficient_privilege';
  end if;
  return result;
end;
$$;

create or replace function private.mark_conversation_read(
  p_conversation_id uuid,
  p_message_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  target_created_at timestamptz;
  current_created_at timestamptz;
  current_message_id uuid;
begin
  if not exists (
    select 1
    from public.conversations as conversation
    where conversation.id = p_conversation_id
      and conversation.org_id = actor_org
      and (
        conversation.user_id = actor
        or (select public.is_staff_or_admin())
      )
  ) then
    raise exception 'conversation read access denied' using errcode = 'insufficient_privilege';
  end if;

  select message.created_at into target_created_at
  from public.messages as message
  where message.id = p_message_id
    and message.conversation_id = p_conversation_id
    and message.org_id = actor_org;

  if target_created_at is null then
    raise exception 'message read access denied' using errcode = 'insufficient_privilege';
  end if;

  select message.created_at, state.last_read_message_id
  into current_created_at, current_message_id
  from public.conversation_read_states as state
  left join public.messages as message on message.id = state.last_read_message_id
  where state.conversation_id = p_conversation_id and state.user_id = actor;

  if current_created_at is null
    or (target_created_at, p_message_id) >= (current_created_at, current_message_id) then
    insert into public.conversation_read_states (
      org_id, conversation_id, user_id, last_read_message_id, read_at
    ) values (
      actor_org, p_conversation_id, actor, p_message_id, now()
    )
    on conflict (conversation_id, user_id) do update
    set last_read_message_id = excluded.last_read_message_id,
        read_at = excluded.read_at;
  end if;
end;
$$;

create or replace function public.mark_conversation_read(
  p_conversation_id uuid,
  p_message_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.mark_conversation_read(p_conversation_id, p_message_id);
$$;

create or replace function public.get_unread_message_count(
  p_conversation_id uuid default null
)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)
  from public.messages as message
  join public.conversations as conversation
    on conversation.org_id = message.org_id
   and conversation.id = message.conversation_id
  left join public.conversation_read_states as state
    on state.conversation_id = conversation.id
   and state.user_id = (select auth.uid())
  left join public.messages as read_message
    on read_message.id = state.last_read_message_id
  where message.sender_id <> (select auth.uid())
    and (p_conversation_id is null or conversation.id = p_conversation_id)
    and (
      read_message.id is null
      or (message.created_at, message.id) > (read_message.created_at, read_message.id)
    );
$$;

revoke all on function private.enforce_conversation_roles()
  from public, anon, authenticated, service_role;
revoke all on function private.mark_conversation_read(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_or_create_own_conversation()
  from public, anon, authenticated;
revoke all on function public.send_message(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.mark_conversation_read(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.get_unread_message_count(uuid)
  from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.mark_conversation_read(uuid, uuid) to authenticated;
grant execute on function public.get_or_create_own_conversation() to authenticated;
grant execute on function public.send_message(uuid, uuid, text, text) to authenticated;
grant execute on function public.mark_conversation_read(uuid, uuid) to authenticated;
grant execute on function public.get_unread_message_count(uuid) to authenticated;

alter publication supabase_realtime add table public.messages;

-- Messaging push uses the existing RAPP-36 publication and delivery state
-- machine. No message body is copied into the outbox. The Edge function maps a
-- message claim to fixed localized copy from the push catalogs.
alter table public.push_publications
  drop constraint push_publications_content_type_check;
alter table public.push_publications
  add constraint push_publications_content_type_check
  check (content_type in ('announcement', 'event', 'message'));
alter table public.push_publications
  add column recipient_id uuid;
alter table public.push_publications
  add constraint push_publications_recipient_tenant_fkey
  foreign key (org_id, recipient_id)
  references public.profiles (org_id, id) on delete cascade;
alter table public.push_publications
  add constraint push_publications_recipient_shape_check check (
    (content_type = 'message' and recipient_id is not null)
    or (content_type <> 'message' and recipient_id is null)
  );
create index push_publications_recipient_idx
  on public.push_publications (recipient_id, created_at, id)
  where recipient_id is not null;

create or replace function private.enqueue_message_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
  recipient_role text;
  publication_id uuid;
begin
  if not exists (
    select 1 from public.profiles as sender
    where sender.id = new.sender_id
      and sender.org_id = new.org_id
      and sender.role in ('staff', 'admin')
  ) then
    return new;
  end if;

  select conversation.user_id, profile.role
  into recipient, recipient_role
  from public.conversations as conversation
  join public.profiles as profile
    on profile.org_id = conversation.org_id and profile.id = conversation.user_id
  where conversation.org_id = new.org_id and conversation.id = new.conversation_id;

  if recipient_role <> 'player' then
    return new;
  end if;

  insert into public.push_publications (
    org_id, content_type, content_id, recipient_id, scheduled_for, state
  ) values (
    new.org_id, 'message', new.id, recipient, new.created_at, 'processing'
  )
  on conflict (content_type, content_id) do nothing
  returning id into publication_id;

  if publication_id is null then
    return new;
  end if;

  insert into public.push_deliveries (
    org_id, publication_id, push_token_id, recipient_id, language, next_attempt_at
  )
  select
    new.org_id,
    publication_id,
    push_token.id,
    profile.id,
    case when profile.preferred_language in ('ca', 'es', 'en', 'ar', 'fa')
      then profile.preferred_language else 'ca' end,
    new.created_at
  from public.profiles as profile
  join public.push_tokens as push_token on push_token.user_id = profile.id
  where profile.org_id = new.org_id
    and profile.id = recipient
    and profile.is_active
    and profile.push_notifications_enabled
  on conflict on constraint push_deliveries_publication_token_unique do nothing;

  perform private.invoke_push_dispatch('message');
  return new;
end;
$$;

create trigger messages_enqueue_push
  after insert on public.messages
  for each row execute function private.enqueue_message_push();

revoke all on function private.enqueue_message_push()
  from public, anon, authenticated, service_role;

create or replace function private.purge_conversation_on_anonymize()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.anonymized_at is null and new.anonymized_at is not null then
    delete from public.conversations where user_id = new.id;
  end if;
  return new;
end;
$$;

create trigger profiles_purge_conversation_on_anonymize
  after update of anonymized_at on public.profiles
  for each row execute function private.purge_conversation_on_anonymize();

revoke all on function private.purge_conversation_on_anonymize()
  from public, anon, authenticated, service_role;

create or replace function public.personal_data_disposition()
returns table (
  table_name text,
  participant_column text,
  disposition text,
  reason text
)
language sql
immutable
security invoker
set search_path = ''
as $$
  values
    ('profiles', 'id', 'purge',
     'The record itself, including the four columns encrypted under ADR-004.'),
    ('participant_notes', 'profile_id', 'purge',
     'The team''s prose about her life. Append-only against editing, not against erasure.'),
    ('push_tokens', 'user_id', 'purge',
     'Device tokens. Anything left here could still deliver a notification to her phone.'),
    ('push_deliveries', 'recipient_id', 'purge',
     'Per-device notification delivery history is participant activity and must be erased.'),
    ('terms_acceptances', 'profile_id', 'purge',
     'Her consent records; there is nothing left for them to be consent to.'),
    ('deletion_requests', 'profile_id', 'purge',
     'Carries reason written in her own words. The audit trail records fulfillment.'),
    ('invites', 'accepted_by', 'purge',
     'The invitation that admitted her, and separately every row carrying her email address.'),
    ('equipment_deliveries', 'profile_id', 'purge',
     'What she was given and when is an inference about her circumstances.'),
    ('event_signups', 'player_id', 'purge',
     'Her interest or confirmed attendance at an event is participant activity.'),
    ('attendance', 'player_id', 'purge',
     'Whether she attended, missed, or was excused is participant activity.'),
    ('service_interests', 'user_id', 'purge',
     'Her interest in a service is participant activity.'),
    ('conversations', 'user_id', 'purge',
     'Her direct team thread is personal correspondence and cascades its full history.'),
    ('messages', 'sender_id', 'purge',
     'Messages she authored are personal correspondence. Thread deletion also removes staff replies.'),
    ('conversation_read_states', 'user_id', 'purge',
     'Her message read history is participant activity.'),
    ('audit_log', 'actor_id', 'purge',
     'Rows where she acted. The non-cascading reference would otherwise block erasure.'),
    ('audit_log', 'target_id', 'retain',
     'Kept under ADR-023 as an opaque lawful-access and erasure record with no personal content.'),
    ('announcements', null, 'not_personal',
     'Organization-owned operational content. Removed staff authors detach.'),
    ('event_categories', null, 'not_personal',
     'Organization-owned event vocabulary with no participant data.'),
    ('events', null, 'not_personal',
     'Organization-owned schedules. Removed staff authors detach.'),
    ('event_occurrences', null, 'not_personal',
     'Materialized organization schedule instances with no participant data.'),
    ('knowledge_categories', null, 'not_personal',
     'Organization-owned knowledge vocabulary with no participant data.'),
    ('knowledge_articles', 'author_id', 'purge',
     'Participant stories contain her words and first-name attribution.'),
    ('push_publications', 'recipient_id', 'purge',
     'A message push publication points at its participant recipient but stores no message text.'),
    ('service_categories', null, 'not_personal',
     'Organization-owned service vocabulary with no participant data.'),
    ('services', null, 'not_personal',
     'Organization-owned directory content. Removed authors detach.'),
    ('service_images', null, 'not_personal',
     'Organization-owned service media that cascades with its service.'),
    ('service_submission_comments', null, 'not_personal',
     'Organization service-review correspondence whose removed authors detach.'),
    ('service_submission_notifications', null, 'not_personal',
     'Organization staff work queue whose entity and staff references detach.'),
    ('organizations', null, 'not_personal',
     'A tenant, not a person. No participant column exists to purge.'),
    ('municipality_catalog', null, 'not_personal',
     'Official IDESCAT geography with no participant data.');
$$;

comment on function public.personal_data_disposition is
  'What happens to each table when a participant is erased. Every public table must appear and the erasure RPC checks this registry.';
