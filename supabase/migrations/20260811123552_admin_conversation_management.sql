-- Staff conversation queue, assignment continuity and participant timeline (RAPP-48).

create table public.conversation_assignment_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null,
  user_id uuid not null,
  changed_by uuid not null,
  previous_staff_id uuid,
  assigned_staff_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  constraint conversation_assignment_history_conversation_fkey
    foreign key (org_id, conversation_id)
    references public.conversations (org_id, id) on delete cascade,
  constraint conversation_assignment_history_user_fkey
    foreign key (org_id, user_id)
    references public.profiles (org_id, id) on delete cascade,
  constraint conversation_assignment_history_actor_fkey
    foreign key (org_id, changed_by)
    references public.profiles (org_id, id),
  constraint conversation_assignment_history_previous_staff_fkey
    foreign key (org_id, previous_staff_id)
    references public.profiles (org_id, id),
  constraint conversation_assignment_history_assigned_staff_fkey
    foreign key (org_id, assigned_staff_id)
    references public.profiles (org_id, id)
);

comment on table public.conversation_assignment_history is
  'Append-only staff assignment changes. The participant id makes RGPD erasure explicit while the conversation foreign key keeps history scoped to one thread.';

create index conversation_assignment_history_conversation_created_idx
  on public.conversation_assignment_history (conversation_id, created_at desc, id desc);
create index conversation_assignment_history_user_idx
  on public.conversation_assignment_history (user_id, id);
create index conversation_assignment_history_actor_idx
  on public.conversation_assignment_history (changed_by, created_at desc);
create index conversation_assignment_history_previous_staff_idx
  on public.conversation_assignment_history (previous_staff_id, id)
  where previous_staff_id is not null;
create index conversation_assignment_history_assigned_staff_idx
  on public.conversation_assignment_history (assigned_staff_id, created_at desc)
  where assigned_staff_id is not null;

alter table public.conversation_assignment_history enable row level security;
alter table public.conversation_assignment_history force row level security;

create policy conversation_assignment_history_select_staff
  on public.conversation_assignment_history for select to authenticated
  using (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  );

revoke all on table public.conversation_assignment_history from public, anon, authenticated;
grant select on table public.conversation_assignment_history to authenticated;

create or replace function private.record_conversation_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if new.assigned_staff_id is not distinct from old.assigned_staff_id then
    return new;
  end if;

  if actor is null or not exists (
    select 1
    from public.profiles as profile
    where profile.id = actor
      and profile.org_id = new.org_id
      and profile.role in ('staff', 'admin')
  ) then
    raise exception 'only staff may change a conversation assignment'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.conversation_assignment_history (
    org_id,
    conversation_id,
    user_id,
    changed_by,
    previous_staff_id,
    assigned_staff_id
  ) values (
    new.org_id,
    new.id,
    new.user_id,
    actor,
    old.assigned_staff_id,
    new.assigned_staff_id
  );
  return new;
end;
$$;

create trigger conversations_record_assignment
  after update of assigned_staff_id on public.conversations
  for each row execute function private.record_conversation_assignment();

create or replace function private.set_conversation_assignment(
  p_conversation_id uuid,
  p_staff_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  current_staff uuid;
begin
  if actor is null or not (select public.is_staff_or_admin()) then
    raise exception 'only staff may change a conversation assignment'
      using errcode = 'insufficient_privilege';
  end if;

  select conversation.assigned_staff_id
  into current_staff
  from public.conversations as conversation
  where conversation.id = p_conversation_id
    and conversation.org_id = actor_org;

  if not found then
    raise exception 'conversation assignment access denied'
      using errcode = 'insufficient_privilege';
  end if;

  if p_staff_id is not null and not exists (
    select 1
    from public.profiles as profile
    where profile.id = p_staff_id
      and profile.org_id = actor_org
      and profile.role in ('staff', 'admin')
  ) then
    raise exception 'assigned owner must be staff in this organization'
      using errcode = 'insufficient_privilege';
  end if;

  if current_staff is not distinct from p_staff_id then
    return;
  end if;

  update public.conversations
  set assigned_staff_id = p_staff_id
  where id = p_conversation_id and org_id = actor_org;
end;
$$;

create or replace function public.set_conversation_assignment(
  p_conversation_id uuid,
  p_staff_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_conversation_assignment(p_conversation_id, p_staff_id);
$$;

create or replace function private.conversation_prefix_tsquery(value text)
returns tsquery
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when count(*) = 0 then null
    else to_tsquery('simple', string_agg(format('%L:*', token), ' & '))
  end
  from regexp_split_to_table(
    regexp_replace(coalesce(value, ''), '[^[:alnum:][:space:]]', ' ', 'g'),
    '[[:space:]]+'
  ) as token
  where token <> '';
$$;

create or replace function public.list_staff_conversations(
  p_unread_only boolean default false,
  p_assigned_to_me boolean default false,
  p_participant_role text default 'all',
  p_query text default ''
)
returns table (
  conversation_id uuid,
  participant_id uuid,
  participant_first_name text,
  participant_last_name text,
  participant_role text,
  participant_city text,
  participant_language text,
  assigned_staff_id uuid,
  assigned_staff_first_name text,
  assigned_staff_last_name text,
  unread_count bigint,
  latest_message_at timestamptz,
  latest_message_preview text,
  latest_sender_id uuid,
  conversation_created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  search_query tsquery := private.conversation_prefix_tsquery(left(coalesce(p_query, ''), 200));
begin
  if actor is null or not (select public.is_staff_or_admin()) then
    raise exception 'only staff may list organization conversations'
      using errcode = 'insufficient_privilege';
  end if;
  if p_participant_role not in ('all', 'player', 'entity') then
    raise exception 'invalid conversation participant filter'
      using errcode = 'check_violation';
  end if;

  return query
  select
    conversation.id,
    participant.id,
    participant.first_name,
    participant.last_name,
    participant.role,
    participant.city,
    participant.preferred_language,
    conversation.assigned_staff_id,
    assigned.first_name,
    assigned.last_name,
    unread.total,
    latest.created_at,
    left(latest.content, 160),
    latest.sender_id,
    conversation.created_at
  from public.conversations as conversation
  join public.profiles as participant
    on participant.org_id = conversation.org_id
   and participant.id = conversation.user_id
  left join public.profiles as assigned
    on assigned.org_id = conversation.org_id
   and assigned.id = conversation.assigned_staff_id
  left join public.conversation_read_states as read_state
    on read_state.conversation_id = conversation.id
   and read_state.user_id = actor
  left join public.messages as read_message
    on read_message.id = read_state.last_read_message_id
  left join lateral (
    select message.sender_id, message.content, message.created_at
    from public.messages as message
    where message.conversation_id = conversation.id
    order by message.created_at desc, message.id desc
    limit 1
  ) as latest on true
  cross join lateral (
    select count(*)::bigint as total
    from public.messages as message
    where message.conversation_id = conversation.id
      and message.sender_id <> actor
      and (
        read_message.id is null
        or (message.created_at, message.id) > (read_message.created_at, read_message.id)
      )
  ) as unread
  where conversation.org_id = (select public.current_org_id())
    and (not p_unread_only or unread.total > 0)
    and (not p_assigned_to_me or conversation.assigned_staff_id = actor)
    and (p_participant_role = 'all' or participant.role = p_participant_role)
    and (
      search_query is null
      or to_tsvector(
        'simple',
        public.immutable_unaccent(
          concat_ws(' ', participant.first_name, participant.last_name)
        ) || ' ' || concat_ws(' ', participant.first_name, participant.last_name)
      ) @@ search_query
    )
  order by
    (unread.total > 0) desc,
    latest.created_at desc nulls last,
    conversation.created_at desc,
    conversation.id
  limit 200;
end;
$$;

revoke all on function private.record_conversation_assignment()
  from public, anon, authenticated, service_role;
revoke all on function private.set_conversation_assignment(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.conversation_prefix_tsquery(text)
  from public, anon, authenticated, service_role;
revoke all on function public.set_conversation_assignment(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.list_staff_conversations(boolean, boolean, text, text)
  from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.set_conversation_assignment(uuid, uuid) to authenticated;
grant execute on function private.conversation_prefix_tsquery(text) to authenticated;
grant execute on function public.set_conversation_assignment(uuid, uuid) to authenticated;
grant execute on function public.list_staff_conversations(boolean, boolean, text, text)
  to authenticated;

alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.conversation_read_states;

create or replace function public.participant_activity(participant_id uuid)
returns table (
  id uuid,
  kind text,
  occurred_at timestamptz,
  title text,
  detail text
)
language sql
security invoker
set search_path = ''
stable
as $$
  select events.id, events.kind, events.occurred_at, events.title, events.detail
  from (
    select
      interest.id,
      'service_interest'::text as kind,
      interest.created_at as occurred_at,
      coalesce(service.title->>'ca', service.title->>'en', '') as title,
      nullif(
        concat_ws(
          ' · ',
          nullif(service.provider_name, ''),
          nullif(category.name->>'ca', '')
        ),
        ''
      ) as detail,
      interest.user_id as profile_id
    from public.service_interests as interest
    join public.services as service
      on service.org_id = interest.org_id
     and service.id = interest.service_id
    join public.service_categories as category
      on category.org_id = service.org_id
     and category.id = service.category_id

    union all

    select
      message.id,
      'message'::text as kind,
      message.created_at as occurred_at,
      concat_ws(' ', sender.first_name, sender.last_name) as title,
      message.content as detail,
      conversation.user_id as profile_id
    from public.messages as message
    join public.conversations as conversation
      on conversation.org_id = message.org_id
     and conversation.id = message.conversation_id
    join public.profiles as sender
      on sender.org_id = message.org_id
     and sender.id = message.sender_id
    where conversation.user_id = participant_id
  ) as events
  where events.profile_id = participant_id
  order by events.occurred_at desc, events.id;
$$;

comment on function public.participant_activity is
  'Staff participant timeline. Service interests and direct conversation entries remain constrained by each source table RLS.';

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
    ('conversation_assignment_history', 'user_id', 'purge',
     'Who handled her conversation is care-history metadata and cascades with the thread.'),
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
