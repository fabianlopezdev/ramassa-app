-- Typed player feedback, private attachments, staff workflow, and chat handoff (RAPP-58).

create table public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  author_id uuid not null,
  type text not null check (type in ('activity_proposal', 'idea', 'problem', 'general')),
  content_encrypted bytea not null check (octet_length(content_encrypted) between 1 and 8192),
  image_url text check (
    image_url is null
    or image_url ~ '^[0-9a-f-]+/feedback/[0-9a-f-]+/[0-9]{4}/[0-9]{2}/[0-9a-f]{32}\.(jpg|png|webp)$'
  ),
  status text not null default 'new' check (status in ('new', 'read', 'in_progress', 'resolved')),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feedback_submissions_org_id_id_unique unique (org_id, id),
  constraint feedback_submissions_author_tenant_fkey
    foreign key (org_id, author_id)
    references public.profiles (org_id, id) on delete cascade,
  constraint feedback_submissions_resolver_tenant_fkey
    foreign key (org_id, resolved_by)
    references public.profiles (org_id, id) on delete set null (resolved_by),
  constraint feedback_submissions_resolution_shape check (
    (status = 'resolved' and resolved_by is not null and resolved_at is not null)
    or (status <> 'resolved' and resolved_by is null and resolved_at is null)
  )
);

comment on table public.feedback_submissions is
  'Private typed player feedback. Prose is encrypted and image_url is a private R2 object key.';

create index feedback_submissions_author_created_idx
  on public.feedback_submissions (org_id, author_id, created_at desc, id desc);
create index feedback_submissions_staff_inbox_idx
  on public.feedback_submissions (org_id, status, type, created_at desc, id desc);
create unique index feedback_submissions_image_object_key_idx
  on public.feedback_submissions (image_url) where image_url is not null;

create trigger feedback_submissions_set_updated_at
  before update on public.feedback_submissions
  for each row execute function public.set_updated_at();

alter table public.feedback_submissions enable row level security;
alter table public.feedback_submissions force row level security;

create policy feedback_submissions_select_owner_or_staff
  on public.feedback_submissions for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (author_id = (select auth.uid()) or (select public.is_staff_or_admin()))
  );

revoke all on table public.feedback_submissions from public, anon, authenticated;
grant select on table public.feedback_submissions to authenticated;

create or replace function public.create_feedback_submission(
  p_type text,
  p_content text,
  p_image_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  clean_content text := btrim(p_content);
  expected_prefix text;
  result uuid;
begin
  select profile.* into actor
  from public.profiles as profile
  where profile.id = (select auth.uid())
    and profile.role = 'player'
    and profile.is_active;

  if not found then
    raise exception 'only active players may submit feedback'
      using errcode = 'insufficient_privilege';
  end if;

  expected_prefix := actor.org_id::text || '/feedback/' || actor.id::text || '/';
  if p_type not in ('activity_proposal', 'idea', 'problem', 'general')
    or length(clean_content) not between 1 and 2000
    or (p_image_url is not null and (
      p_image_url not like expected_prefix || '%'
      or p_image_url like '%..%'
      or p_image_url !~ '^[0-9a-f-]+/feedback/[0-9a-f-]+/[0-9]{4}/[0-9]{2}/[0-9a-f]{32}\.(jpg|png|webp)$'
    ))
  then
    raise check_violation using message = 'invalid feedback submission';
  end if;

  insert into public.conversations (org_id, user_id)
  values (actor.org_id, actor.id)
  on conflict (org_id, user_id) do nothing;

  insert into public.feedback_submissions (
    org_id, author_id, type, content_encrypted, image_url
  ) values (
    actor.org_id, actor.id, p_type, public.encrypt_field(clean_content), p_image_url
  ) returning id into result;
  return result;
end;
$$;

create or replace function public.list_own_feedback_submissions()
returns table (
  id uuid,
  type text,
  content text,
  image_url text,
  status text,
  resolved_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    submission.id,
    submission.type,
    public.decrypt_field(submission.content_encrypted),
    submission.image_url,
    submission.status,
    submission.resolved_at,
    submission.created_at,
    submission.updated_at
  from public.feedback_submissions as submission
  where submission.org_id = (select public.current_org_id())
    and submission.author_id = (select auth.uid())
    and public.current_app_role() = 'player'
  order by submission.created_at desc, submission.id desc;
$$;

create or replace function public.list_staff_feedback_submissions(
  p_type text default null,
  p_status text default null
)
returns table (
  id uuid,
  author_id uuid,
  author_first_name text,
  author_last_name text,
  type text,
  content text,
  image_url text,
  status text,
  resolved_by uuid,
  resolved_at timestamptz,
  conversation_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not public.is_staff_or_admin() then
    raise exception 'only staff may list feedback' using errcode = 'insufficient_privilege';
  end if;
  if p_type is not null and p_type not in ('activity_proposal', 'idea', 'problem', 'general') then
    raise check_violation using message = 'invalid feedback type filter';
  end if;
  if p_status is not null and p_status not in ('new', 'read', 'in_progress', 'resolved') then
    raise check_violation using message = 'invalid feedback status filter';
  end if;

  return query
  select
    submission.id,
    submission.author_id,
    author.first_name,
    author.last_name,
    submission.type,
    public.decrypt_field(submission.content_encrypted),
    submission.image_url,
    submission.status,
    submission.resolved_by,
    submission.resolved_at,
    conversation.id,
    submission.created_at,
    submission.updated_at
  from public.feedback_submissions as submission
  join public.profiles as author
    on author.org_id = submission.org_id and author.id = submission.author_id
  join public.conversations as conversation
    on conversation.org_id = submission.org_id and conversation.user_id = submission.author_id
  where submission.org_id = (select public.current_org_id())
    and (p_type is null or submission.type = p_type)
    and (p_status is null or submission.status = p_status)
  order by submission.created_at desc, submission.id desc;
end;
$$;

create or replace function public.transition_feedback_submission(
  p_submission_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  current_status text;
begin
  if not public.is_staff_or_admin() then
    raise exception 'only staff may transition feedback' using errcode = 'insufficient_privilege';
  end if;

  select submission.status into current_status
  from public.feedback_submissions as submission
  where submission.id = p_submission_id
    and submission.org_id = (select public.current_org_id())
  for update;

  if current_status is null then
    raise no_data_found using message = 'feedback submission not found';
  end if;
  if p_status not in ('read', 'in_progress', 'resolved')
    or (current_status = 'read' and p_status = 'read')
    or (current_status = 'in_progress' and p_status in ('read', 'in_progress'))
    or current_status = 'resolved'
  then
    raise check_violation using message = 'invalid feedback state transition';
  end if;

  update public.feedback_submissions
  set status = p_status,
      resolved_by = case when p_status = 'resolved' then actor else null end,
      resolved_at = case when p_status = 'resolved' then now() else null end
  where id = p_submission_id and org_id = (select public.current_org_id());
end;
$$;

create or replace function public.feedback_monthly_counts()
returns table (month date, type text, count bigint)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not public.is_staff_or_admin() then
    raise exception 'only staff may view feedback counts' using errcode = 'insufficient_privilege';
  end if;
  return query
  select date_trunc('month', submission.created_at)::date, submission.type, count(*)
  from public.feedback_submissions as submission
  where submission.org_id = (select public.current_org_id())
  group by 1, submission.type
  order by 1 desc, submission.type;
end;
$$;

create or replace function public.can_read_feedback_object(p_object_key text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.feedback_submissions as submission
    where submission.image_url = p_object_key
      and submission.org_id = (select public.current_org_id())
      and (submission.author_id = (select auth.uid()) or (select public.is_staff_or_admin()))
  );
$$;

revoke all on function public.create_feedback_submission(text, text, text) from public, anon, authenticated;
revoke all on function public.list_own_feedback_submissions() from public, anon, authenticated;
revoke all on function public.list_staff_feedback_submissions(text, text) from public, anon, authenticated;
revoke all on function public.transition_feedback_submission(uuid, text) from public, anon, authenticated;
revoke all on function public.feedback_monthly_counts() from public, anon, authenticated;
revoke all on function public.can_read_feedback_object(text) from public, anon, authenticated;
grant execute on function public.create_feedback_submission(text, text, text) to authenticated;
grant execute on function public.list_own_feedback_submissions() to authenticated;
grant execute on function public.list_staff_feedback_submissions(text, text) to authenticated;
grant execute on function public.transition_feedback_submission(uuid, text) to authenticated;
grant execute on function public.feedback_monthly_counts() to authenticated;
grant execute on function public.can_read_feedback_object(text) to authenticated;

create or replace function public.participant_activity(participant_id uuid)
returns table (id uuid, kind text, occurred_at timestamptz, title text, detail text)
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
      nullif(concat_ws(' · ', nullif(service.provider_name, ''), nullif(category.name->>'ca', '')), '') as detail,
      interest.user_id as profile_id
    from public.service_interests as interest
    join public.services as service
      on service.org_id = interest.org_id and service.id = interest.service_id
    join public.service_categories as category
      on category.org_id = service.org_id and category.id = service.category_id

    union all

    select
      message.id,
      'message'::text,
      message.created_at,
      concat_ws(' ', sender.first_name, sender.last_name),
      message.content,
      conversation.user_id
    from public.messages as message
    join public.conversations as conversation
      on conversation.org_id = message.org_id and conversation.id = message.conversation_id
    join public.profiles as sender
      on sender.org_id = message.org_id and sender.id = message.sender_id
    where conversation.user_id = participant_id

    union all

    select
      referral_update.id,
      'referral_update'::text,
      referral_update.created_at,
      concat_ws(' ', entity.first_name, entity.last_name),
      public.decrypt_field(referral_update.content),
      referral.referred_profile_id
    from public.referral_updates as referral_update
    join public.entity_referrals as referral
      on referral.org_id = referral_update.org_id and referral.id = referral_update.referral_id
    join public.profiles as entity
      on entity.org_id = referral.org_id and entity.id = referral.entity_user_id
    where referral.referred_profile_id = participant_id

    union all

    select
      submission.id,
      'feedback'::text,
      submission.created_at,
      submission.type,
      public.decrypt_field(submission.content_encrypted),
      submission.author_id
    from public.feedback_submissions as submission
    where submission.author_id = participant_id
  ) as events
  where events.profile_id = participant_id
  order by events.occurred_at desc, events.id;
$$;

comment on function public.participant_activity is
  'Staff participant timeline including service interests, messages, referral updates, and encrypted feedback.';

create or replace function public.personal_data_disposition()
returns table (table_name text, participant_column text, disposition text, reason text)
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
    ('entity_invitations', 'profile_id', 'purge', 'The invitation that admitted an entity collaborator.'),
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
    ('entity_referrals', 'referred_profile_id', 'purge', 'Referral intake cascades with the linked participant.'),
    ('referral_updates', 'author_id', 'purge', 'Referral updates authored by the participant.'),
    ('mentoring_requests', 'player_id', 'purge', 'Private support requests belonging to the player.'),
    ('mentoring_notification_events', 'recipient_id', 'purge', 'Technical mentoring schedule notifications.'),
    ('feedback_submissions', 'author_id', 'purge', 'Encrypted feedback and its private attachment key.'),
    ('audit_log', 'actor_id', 'purge', 'Rows where the participant acted.'),
    ('audit_log', 'target_id', 'retain', 'Opaque lawful-access and erasure record.'),
    ('entity_referrals', null, 'retain_limited', 'Unlinked referral intake is purged after 24 months.'),
    ('entity_invitations', null, 'retain_limited', 'Expired entity invitations are purged after 24 months.'),
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
    ('service_submission_comments', null, 'not_personal', 'Organization review correspondence.'),
    ('service_submission_notifications', null, 'not_personal', 'Organization staff queue.'),
    ('forum_categories', null, 'not_personal', 'Organization-owned forum vocabulary.'),
    ('collaborating_entities', null, 'not_personal', 'A tenant-owned partner organization.'),
    ('organizations', null, 'not_personal', 'A tenant, not a person.'),
    ('municipality_catalog', null, 'not_personal', 'Official geography with no participant data.');
$$;
