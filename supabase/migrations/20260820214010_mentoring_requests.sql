-- Privacy-scoped mentoring requests and staff scheduling (RAPP-57).

create table public.mentoring_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  player_id uuid not null,
  topic text not null check (
    topic in (
      'personal_development',
      'labor_orientation',
      'asylum_rights',
      'gender_violence',
      'empowerment',
      'digital_skills',
      'other'
    )
  ),
  topic_detail_encrypted bytea,
  preferred_date date,
  preferred_time time without time zone,
  status text not null default 'requested' check (
    status in ('requested', 'scheduled', 'completed', 'cancelled')
  ),
  scheduled_at timestamptz,
  assigned_staff_id uuid,
  staff_notes_encrypted bytea,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mentoring_requests_org_id_id_unique unique (org_id, id),
  constraint mentoring_requests_player_tenant_fkey
    foreign key (org_id, player_id)
    references public.profiles (org_id, id) on delete cascade,
  constraint mentoring_requests_staff_tenant_fkey
    foreign key (org_id, assigned_staff_id)
    references public.profiles (org_id, id) on delete restrict,
  constraint mentoring_requests_topic_detail_length check (
    topic_detail_encrypted is null or octet_length(topic_detail_encrypted) <= 8192
  ),
  constraint mentoring_requests_staff_notes_length check (
    staff_notes_encrypted is null or octet_length(staff_notes_encrypted) <= 8192
  ),
  constraint mentoring_requests_schedule_shape check (
    (status = 'requested' and scheduled_at is null and assigned_staff_id is null and completed_at is null)
    or (status = 'scheduled' and scheduled_at is not null and assigned_staff_id is not null and completed_at is null)
    or (status = 'completed' and scheduled_at is not null and assigned_staff_id is not null and completed_at is not null)
    or (status = 'cancelled' and completed_at is null)
  )
);

comment on table public.mentoring_requests is
  'Sensitive player support requests. Topics never enter logs or notification text.';

create index mentoring_requests_player_created_idx
  on public.mentoring_requests (org_id, player_id, created_at desc, id);
create index mentoring_requests_staff_queue_idx
  on public.mentoring_requests (org_id, status, created_at, id);
create index mentoring_requests_assignee_schedule_idx
  on public.mentoring_requests (org_id, assigned_staff_id, scheduled_at, id)
  where assigned_staff_id is not null;

create trigger mentoring_requests_set_updated_at
  before update on public.mentoring_requests
  for each row execute function public.set_updated_at();

alter table public.mentoring_requests enable row level security;
alter table public.mentoring_requests force row level security;

create policy mentoring_requests_select_owner_or_staff
  on public.mentoring_requests for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      player_id = (select auth.uid())
      or (select public.is_staff_or_admin())
    )
  );

revoke all on table public.mentoring_requests from public, anon, authenticated;
grant select on table public.mentoring_requests to authenticated;

create or replace function public.create_mentoring_request(
  p_topic text,
  p_topic_detail text,
  p_preferred_date date,
  p_preferred_time time without time zone
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  normalized_detail text := nullif(btrim(p_topic_detail), '');
  request_id uuid;
begin
  select profile.* into actor
  from public.profiles as profile
  where profile.id = (select auth.uid())
    and profile.role = 'player'
    and profile.is_active;

  if not found then
    raise exception 'only active players may request mentoring'
      using errcode = 'insufficient_privilege';
  end if;

  if p_topic not in (
      'personal_development',
      'labor_orientation',
      'asylum_rights',
      'gender_violence',
      'empowerment',
      'digital_skills',
      'other'
    )
    or (normalized_detail is not null and length(normalized_detail) > 2000)
    or (p_preferred_time is not null and p_preferred_date is null)
  then
    raise check_violation using message = 'invalid mentoring request';
  end if;

  insert into public.mentoring_requests (
    org_id,
    player_id,
    topic,
    topic_detail_encrypted,
    preferred_date,
    preferred_time
  ) values (
    actor.org_id,
    actor.id,
    p_topic,
    case when normalized_detail is null then null else public.encrypt_field(normalized_detail) end,
    p_preferred_date,
    p_preferred_time
  )
  returning id into request_id;

  return request_id;
end;
$$;

create or replace function public.list_own_mentoring_requests()
returns table (
  id uuid,
  topic text,
  topic_detail text,
  preferred_date date,
  preferred_time time without time zone,
  status text,
  scheduled_at timestamptz,
  assigned_staff_name text,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    request.id,
    request.topic,
    case
      when request.topic_detail_encrypted is null then null
      else public.decrypt_field(request.topic_detail_encrypted)
    end,
    request.preferred_date,
    request.preferred_time,
    request.status,
    request.scheduled_at,
    case
      when staff.id is null then null
      else concat_ws(' ', staff.first_name, staff.last_name)
    end,
    request.completed_at,
    request.created_at,
    request.updated_at
  from public.mentoring_requests as request
  left join public.profiles as staff
    on staff.org_id = request.org_id
   and staff.id = request.assigned_staff_id
  where request.org_id = (select public.current_org_id())
    and request.player_id = (select auth.uid())
    and public.current_app_role() = 'player'
  order by request.created_at desc, request.id desc;
$$;

revoke all on function public.create_mentoring_request(text, text, date, time without time zone)
  from public, anon, authenticated;
revoke all on function public.list_own_mentoring_requests()
  from public, anon, authenticated;
grant execute on function public.create_mentoring_request(text, text, date, time without time zone)
  to authenticated;
grant execute on function public.list_own_mentoring_requests()
  to authenticated;

create table public.mentoring_notification_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  request_id uuid not null,
  recipient_id uuid not null,
  kind text not null check (kind in ('scheduled', 'changed')),
  created_at timestamptz not null default now(),
  constraint mentoring_notification_events_request_tenant_fkey
    foreign key (org_id, request_id)
    references public.mentoring_requests (org_id, id) on delete cascade,
  constraint mentoring_notification_events_recipient_tenant_fkey
    foreign key (org_id, recipient_id)
    references public.profiles (org_id, id) on delete cascade
);

comment on table public.mentoring_notification_events is
  'Technical schedule-change events. No mentoring topic or note is copied into notification storage.';

create index mentoring_notification_events_request_idx
  on public.mentoring_notification_events (org_id, request_id, created_at desc, id);

alter table public.mentoring_notification_events enable row level security;
alter table public.mentoring_notification_events force row level security;
revoke all on table public.mentoring_notification_events
  from public, anon, authenticated, service_role;

alter table public.push_publications
  drop constraint push_publications_content_type_check;
alter table public.push_publications
  add constraint push_publications_content_type_check check (
    content_type in (
      'announcement',
      'event',
      'message',
      'forum_flag',
      'referral_update',
      'mentoring_update'
    )
  );
alter table public.push_publications
  drop constraint push_publications_recipient_shape_check;
alter table public.push_publications
  add constraint push_publications_recipient_shape_check check (
    (content_type in ('message', 'referral_update', 'mentoring_update') and recipient_id is not null)
    or (content_type not in ('message', 'referral_update', 'mentoring_update') and recipient_id is null)
  );

create or replace function public.schedule_mentoring_request(
  p_request_id uuid,
  p_scheduled_at timestamptz,
  p_assigned_staff_id uuid,
  p_staff_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := public.current_org_id();
  request public.mentoring_requests%rowtype;
  normalized_notes text := nullif(btrim(p_staff_notes), '');
  notification_kind text;
  notification_id uuid;
  publication_id uuid;
begin
  if actor_org is null or not public.is_staff_or_admin() then
    raise exception 'only staff may schedule mentoring'
      using errcode = 'insufficient_privilege';
  end if;

  select row.* into request
  from public.mentoring_requests as row
  where row.org_id = actor_org and row.id = p_request_id
  for update;

  if not found then
    raise no_data_found using message = 'mentoring request not found';
  end if;

  if request.status not in ('requested', 'scheduled')
    or p_scheduled_at <= now()
    or normalized_notes is not null and length(normalized_notes) > 2000
    or not exists (
      select 1 from public.profiles as staff
      where staff.org_id = actor_org
        and staff.id = p_assigned_staff_id
        and staff.role in ('staff', 'admin')
        and staff.is_active
    )
  then
    raise check_violation using message = 'invalid mentoring schedule';
  end if;

  notification_kind := case when request.status = 'requested' then 'scheduled' else 'changed' end;

  update public.mentoring_requests
  set
    status = 'scheduled',
    scheduled_at = p_scheduled_at,
    assigned_staff_id = p_assigned_staff_id,
    staff_notes_encrypted = case
      when normalized_notes is null then null
      else public.encrypt_field(normalized_notes)
    end,
    completed_at = null
  where id = request.id;

  insert into public.mentoring_notification_events (
    org_id, request_id, recipient_id, kind
  ) values (
    request.org_id, request.id, request.player_id, notification_kind
  )
  returning id into notification_id;

  insert into public.push_publications (
    org_id, content_type, content_id, recipient_id, scheduled_for, state
  ) values (
    request.org_id,
    'mentoring_update',
    notification_id,
    request.player_id,
    now(),
    'processing'
  )
  returning id into publication_id;

  insert into public.push_deliveries (
    org_id, publication_id, push_token_id, recipient_id, language, next_attempt_at
  )
  select
    request.org_id,
    publication_id,
    push_token.id,
    player.id,
    case
      when player.preferred_language in ('ca', 'es', 'en', 'ar', 'fa')
        then player.preferred_language
      else 'ca'
    end,
    now()
  from public.profiles as player
  join public.push_tokens as push_token on push_token.user_id = player.id
  where player.org_id = request.org_id
    and player.id = request.player_id
    and player.role = 'player'
    and player.is_active
    and player.push_notifications_enabled
  on conflict on constraint push_deliveries_publication_token_unique do nothing;

  perform private.invoke_push_dispatch('mentoring_update');
end;
$$;

revoke all on function public.schedule_mentoring_request(uuid, timestamptz, uuid, text)
  from public, anon, authenticated;
grant execute on function public.schedule_mentoring_request(uuid, timestamptz, uuid, text)
  to authenticated;

create or replace function public.list_staff_mentoring_requests()
returns table (
  id uuid,
  player_id uuid,
  player_first_name text,
  player_last_name text,
  topic text,
  topic_detail text,
  preferred_date date,
  preferred_time time without time zone,
  status text,
  scheduled_at timestamptz,
  assigned_staff_id uuid,
  assigned_staff_name text,
  staff_notes text,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    request.id,
    request.player_id,
    player.first_name,
    player.last_name,
    request.topic,
    case
      when request.topic_detail_encrypted is null then null
      else public.decrypt_field(request.topic_detail_encrypted)
    end,
    request.preferred_date,
    request.preferred_time,
    request.status,
    request.scheduled_at,
    request.assigned_staff_id,
    case
      when staff.id is null then null
      else concat_ws(' ', staff.first_name, staff.last_name)
    end,
    case
      when request.staff_notes_encrypted is null then null
      else public.decrypt_field(request.staff_notes_encrypted)
    end,
    request.completed_at,
    request.created_at,
    request.updated_at
  from public.mentoring_requests as request
  join public.profiles as player
    on player.org_id = request.org_id
   and player.id = request.player_id
  left join public.profiles as staff
    on staff.org_id = request.org_id
   and staff.id = request.assigned_staff_id
  where request.org_id = (select public.current_org_id())
    and public.is_staff_or_admin()
  order by
    case request.status
      when 'requested' then 0
      when 'scheduled' then 1
      when 'completed' then 2
      else 3
    end,
    request.created_at,
    request.id;
$$;

create or replace function public.complete_mentoring_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := public.current_org_id();
begin
  if actor_org is null or not public.is_staff_or_admin() then
    raise exception 'only staff may complete mentoring'
      using errcode = 'insufficient_privilege';
  end if;

  update public.mentoring_requests
  set status = 'completed', completed_at = now()
  where org_id = actor_org
    and id = p_request_id
    and status = 'scheduled';

  if not found then
    raise check_violation using message = 'only a scheduled mentoring request can be completed';
  end if;
end;
$$;

revoke all on function public.list_staff_mentoring_requests()
  from public, anon, authenticated;
revoke all on function public.complete_mentoring_request(uuid)
  from public, anon, authenticated;
grant execute on function public.list_staff_mentoring_requests()
  to authenticated;
grant execute on function public.complete_mentoring_request(uuid)
  to authenticated;

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
    ('profiles', 'id', 'purge', 'The participant profile and its encrypted fields.'),
    ('participant_notes', 'profile_id', 'purge', 'Staff prose about the participant.'),
    ('push_tokens', 'user_id', 'purge', 'Registered participant devices.'),
    ('push_deliveries', 'recipient_id', 'purge', 'Per-device notification delivery history.'),
    ('terms_acceptances', 'profile_id', 'purge', 'Participant consent records.'),
    ('deletion_requests', 'profile_id', 'purge', 'Participant erasure requests.'),
    ('invites', 'accepted_by', 'purge', 'The invitation that admitted the participant.'),
    ('entity_invitations', 'profile_id', 'purge', 'The address-bound invitation that admitted an entity collaborator.'),
    ('equipment_deliveries', 'profile_id', 'purge', 'Participant equipment history.'),
    ('event_signups', 'player_id', 'purge', 'Participant event activity.'),
    ('attendance', 'player_id', 'purge', 'Participant attendance history.'),
    ('service_interests', 'user_id', 'purge', 'Participant service interests.'),
    ('conversations', 'user_id', 'purge', 'Participant direct correspondence.'),
    ('messages', 'sender_id', 'purge', 'Participant-authored messages.'),
    ('conversation_read_states', 'user_id', 'purge', 'Participant message read history.'),
    ('conversation_assignment_history', 'user_id', 'purge', 'Participant conversation handling history.'),
    ('forum_posts', 'author_id', 'purge', 'Participant-authored forum posts.'),
    ('forum_replies', 'author_id', 'purge', 'Participant-authored forum replies.'),
    ('forum_flags', 'flagger_id', 'purge', 'Participant safety reports and optional comments.'),
    ('media_items', 'uploaded_by', 'purge', 'Participant gallery media and its consent record.'),
    ('entity_referrals', 'referred_profile_id', 'purge',
     'Referral intake and every child update cascade with the linked participant.'),
    ('referral_updates', 'author_id', 'purge',
     'Any referral update authored by the participant is personal activity.'),
    ('mentoring_requests', 'player_id', 'purge',
     'Private support requests and encrypted topic details belonging to the player.'),
    ('mentoring_notification_events', 'recipient_id', 'purge',
     'Technical mentoring schedule notifications addressed to the player.'),
    ('audit_log', 'actor_id', 'purge', 'Rows where the participant acted.'),
    ('audit_log', 'target_id', 'retain', 'Opaque lawful-access and erasure record.'),
    ('entity_referrals', null, 'retain_limited',
     'Unlinked referral intake is encrypted and purged after 24 months.'),
    ('entity_invitations', null, 'retain_limited',
     'Expired and accepted entity invitations are purged after 24 months.'),
    ('announcements', null, 'not_personal', 'Organization-owned operational content.'),
    ('event_categories', null, 'not_personal', 'Organization-owned event vocabulary.'),
    ('events', null, 'not_personal', 'Organization-owned schedules.'),
    ('event_occurrences', null, 'not_personal', 'Materialized organization schedules.'),
    ('knowledge_categories', null, 'not_personal', 'Organization-owned knowledge vocabulary.'),
    ('knowledge_articles', 'author_id', 'purge', 'Participant-authored knowledge stories.'),
    ('push_publications', 'recipient_id', 'purge', 'Recipient-specific push publications.'),
    ('service_categories', null, 'not_personal', 'Organization-owned service vocabulary.'),
    ('services', null, 'not_personal', 'Organization-owned directory content.'),
    ('service_images', null, 'not_personal', 'Organization-owned service media.'),
    ('service_submission_comments', null, 'not_personal', 'Organization service-review correspondence.'),
    ('service_submission_notifications', null, 'not_personal', 'Organization staff work queue.'),
    ('forum_categories', null, 'not_personal', 'Organization-owned forum vocabulary.'),
    ('collaborating_entities', null, 'not_personal', 'A tenant-owned partner organization, not a person.'),
    ('organizations', null, 'not_personal', 'A tenant, not a person.'),
    ('municipality_catalog', null, 'not_personal', 'Official geography with no participant data.');
$$;
