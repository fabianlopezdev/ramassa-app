-- Entity referral intake, staff completion and participant status updates (RAPP-54).

create table public.entity_referrals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  entity_user_id uuid not null,
  referred_profile_id uuid,
  assigned_staff_id uuid,
  referred_first_name text not null,
  referred_last_name text not null,
  referred_phone bytea,
  referred_email bytea,
  documentation_status text not null,
  notes bytea,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entity_referrals_org_id_id_unique unique (org_id, id),
  constraint entity_referrals_entity_tenant_fkey
    foreign key (org_id, entity_user_id)
    references public.profiles (org_id, id) on delete cascade,
  constraint entity_referrals_profile_tenant_fkey
    foreign key (org_id, referred_profile_id)
    references public.profiles (org_id, id) on delete cascade,
  constraint entity_referrals_staff_tenant_fkey
    foreign key (org_id, assigned_staff_id)
    references public.profiles (org_id, id) on delete set null (assigned_staff_id),
  constraint entity_referrals_profile_unique unique (referred_profile_id),
  constraint entity_referrals_first_name_length check (
    length(btrim(referred_first_name)) between 1 and 100
  ),
  constraint entity_referrals_last_name_length check (
    length(btrim(referred_last_name)) between 1 and 100
  ),
  constraint entity_referrals_documentation_status_check check (
    documentation_status in ('none', 'missing', 'in_progress', 'complete')
  ),
  constraint entity_referrals_status_check check (
    status in ('pending', 'active', 'inactive')
  ),
  constraint entity_referrals_link_state_check check (
    (status = 'pending' and referred_profile_id is null and assigned_staff_id is null)
    or (status in ('active', 'inactive')
      and referred_profile_id is not null
      and assigned_staff_id is not null)
  )
);

create table public.referral_updates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  referral_id uuid not null,
  author_id uuid not null,
  update_type text not null,
  content bytea not null,
  created_at timestamptz not null default now(),
  constraint referral_updates_org_id_id_unique unique (org_id, id),
  constraint referral_updates_referral_tenant_fkey
    foreign key (org_id, referral_id)
    references public.entity_referrals (org_id, id) on delete cascade,
  constraint referral_updates_author_tenant_fkey
    foreign key (org_id, author_id)
    references public.profiles (org_id, id) on delete cascade,
  constraint referral_updates_type_check check (
    update_type in (
      'housing', 'documentation', 'education', 'employment', 'health', 'other'
    )
  )
);

comment on table public.entity_referrals is
  'Minimal entity referral intake. Contact details and notes are Vault-backed pgcrypto ciphertext. Unlinked rows expire after 24 months.';
comment on table public.referral_updates is
  'Typed entity updates for a linked participant. Content is encrypted and appears on the staff participant timeline.';

-- Decryption reads the stable Vault key and is deterministic for one statement.
-- Declaring that contract lets read-only referral RPCs remain STABLE without
-- misrepresenting a volatile expression to the planner.
alter function public.decrypt_field(bytea) stable;

create index entity_referrals_entity_updated_idx
  on public.entity_referrals (org_id, entity_user_id, updated_at desc, id);
create index entity_referrals_staff_queue_idx
  on public.entity_referrals (org_id, status, created_at, id);
create index entity_referrals_assigned_staff_idx
  on public.entity_referrals (org_id, assigned_staff_id, updated_at desc, id)
  where assigned_staff_id is not null;
create index referral_updates_referral_created_idx
  on public.referral_updates (org_id, referral_id, created_at desc, id);
create index referral_updates_author_idx
  on public.referral_updates (author_id, created_at desc, id);

create trigger entity_referrals_set_updated_at
  before update on public.entity_referrals
  for each row execute function public.set_updated_at();

alter table public.entity_referrals enable row level security;
alter table public.entity_referrals force row level security;
alter table public.referral_updates enable row level security;
alter table public.referral_updates force row level security;

create policy entity_referrals_select_own_or_staff
  on public.entity_referrals for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      entity_user_id = (select auth.uid())
      or (select public.is_staff_or_admin())
    )
  );

create policy referral_updates_select_own_entity_or_staff
  on public.referral_updates for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.is_staff_or_admin())
      or exists (
        select 1
        from public.entity_referrals as referral
        where referral.org_id = referral_updates.org_id
          and referral.id = referral_updates.referral_id
          and referral.entity_user_id = (select auth.uid())
      )
    )
  );

revoke all on table public.entity_referrals, public.referral_updates
  from public, anon, authenticated;
grant select on table public.entity_referrals, public.referral_updates
  to authenticated;

create or replace function private.assert_referral_actor()
returns table (actor_id uuid, actor_org_id uuid, actor_role text)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  return query
  select profile.id, profile.org_id, profile.role
  from public.profiles as profile
  where profile.id = (select auth.uid())
    and profile.role in ('entity', 'staff', 'admin');

  if not found then
    raise exception 'only entity contacts and staff may manage referrals'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

revoke all on function private.assert_referral_actor()
  from public, anon, authenticated, service_role;

create or replace function public.create_entity_referral(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  actor_org uuid;
  actor_role text;
  first_name text := nullif(btrim(p_payload ->> 'firstName'), '');
  last_name text := nullif(btrim(p_payload ->> 'lastName'), '');
  phone text := nullif(btrim(p_payload ->> 'phone'), '');
  email text := nullif(lower(btrim(p_payload ->> 'email')), '');
  documentation text := p_payload ->> 'documentationStatus';
  referral_notes text := nullif(btrim(p_payload ->> 'notes'), '');
  result uuid;
begin
  select actor_id, actor_org_id, assert_referral_actor.actor_role
  into actor, actor_org, actor_role
  from private.assert_referral_actor();

  if actor_role <> 'entity' then
    raise exception 'only entity contacts may submit referrals'
      using errcode = 'insufficient_privilege';
  end if;

  if p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
    or p_payload - array[
      'firstName', 'lastName', 'phone', 'email', 'documentationStatus', 'notes'
    ] <> '{}'::jsonb
    or first_name is null
    or length(first_name) > 100
    or last_name is null
    or length(last_name) > 100
    or (phone is not null and length(phone) > 50)
    or (email is not null and (length(email) > 254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+$'))
    or documentation not in ('none', 'missing', 'in_progress', 'complete')
    or (referral_notes is not null and length(referral_notes) > 4000)
  then
    raise check_violation using message = 'invalid entity referral payload';
  end if;

  insert into public.entity_referrals (
    org_id,
    entity_user_id,
    referred_first_name,
    referred_last_name,
    referred_phone,
    referred_email,
    documentation_status,
    notes
  ) values (
    actor_org,
    actor,
    first_name,
    last_name,
    public.encrypt_field(phone),
    public.encrypt_field(email),
    documentation,
    public.encrypt_field(referral_notes)
  )
  returning id into result;

  return result;
end;
$$;

create or replace function public.list_entity_referrals()
returns table (
  id uuid,
  entity_user_id uuid,
  referred_profile_id uuid,
  assigned_staff_id uuid,
  referred_first_name text,
  referred_last_name text,
  referred_phone text,
  referred_email text,
  documentation_status text,
  notes text,
  status text,
  entity_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security invoker
set search_path = ''
stable
as $$
  select
    referral.id,
    referral.entity_user_id,
    referral.referred_profile_id,
    referral.assigned_staff_id,
    referral.referred_first_name,
    referral.referred_last_name,
    public.decrypt_field(referral.referred_phone),
    public.decrypt_field(referral.referred_email),
    referral.documentation_status,
    public.decrypt_field(referral.notes),
    referral.status,
    entity.reference_entity,
    referral.created_at,
    referral.updated_at
  from public.entity_referrals as referral
  join public.profiles as entity
    on entity.org_id = referral.org_id
   and entity.id = referral.entity_user_id
  where referral.entity_user_id = (select auth.uid())
  order by referral.updated_at desc, referral.id;
$$;

create or replace function public.get_entity_referral(p_referral_id uuid)
returns table (
  id uuid,
  entity_user_id uuid,
  referred_profile_id uuid,
  assigned_staff_id uuid,
  referred_first_name text,
  referred_last_name text,
  referred_phone text,
  referred_email text,
  documentation_status text,
  notes text,
  status text,
  entity_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
stable
as $$
begin
  return query
  select
    referral.id,
    referral.entity_user_id,
    referral.referred_profile_id,
    referral.assigned_staff_id,
    referral.referred_first_name,
    referral.referred_last_name,
    public.decrypt_field(referral.referred_phone),
    public.decrypt_field(referral.referred_email),
    referral.documentation_status,
    public.decrypt_field(referral.notes),
    referral.status,
    entity.reference_entity,
    referral.created_at,
    referral.updated_at
  from public.entity_referrals as referral
  join public.profiles as entity
    on entity.org_id = referral.org_id
   and entity.id = referral.entity_user_id
  where referral.id = p_referral_id;

  if not found then
    raise no_data_found using message = 'referral not found';
  end if;
end;
$$;

create or replace function public.list_staff_referrals(p_status text default null)
returns table (
  id uuid,
  entity_user_id uuid,
  referred_profile_id uuid,
  assigned_staff_id uuid,
  referred_first_name text,
  referred_last_name text,
  referred_phone text,
  referred_email text,
  documentation_status text,
  notes text,
  status text,
  entity_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security invoker
set search_path = ''
stable
as $$
  select
    referral.id,
    referral.entity_user_id,
    referral.referred_profile_id,
    referral.assigned_staff_id,
    referral.referred_first_name,
    referral.referred_last_name,
    public.decrypt_field(referral.referred_phone),
    public.decrypt_field(referral.referred_email),
    referral.documentation_status,
    public.decrypt_field(referral.notes),
    referral.status,
    entity.reference_entity,
    referral.created_at,
    referral.updated_at
  from public.entity_referrals as referral
  join public.profiles as entity
    on entity.org_id = referral.org_id
   and entity.id = referral.entity_user_id
  where (select public.is_staff_or_admin())
    and (p_status is null or referral.status = p_status)
  order by
    case when referral.status = 'pending' then 0 else 1 end,
    referral.created_at,
    referral.id;
$$;

create or replace function public.complete_entity_referral(
  p_referral_id uuid,
  p_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  actor_org uuid;
  actor_role text;
  profile_active boolean;
begin
  select actor_id, actor_org_id, assert_referral_actor.actor_role
  into actor, actor_org, actor_role
  from private.assert_referral_actor();

  if actor_role not in ('staff', 'admin') then
    raise exception 'only staff may complete referrals'
      using errcode = 'insufficient_privilege';
  end if;

  select profile.is_active into profile_active
  from public.profiles as profile
  where profile.id = p_profile_id
    and profile.org_id = actor_org
    and profile.role = 'player';

  if profile_active is null then
    raise exception 'linked profile must be a player in this organization'
      using errcode = 'foreign_key_violation';
  end if;

  update public.entity_referrals
  set
    referred_profile_id = p_profile_id,
    assigned_staff_id = actor,
    status = case when profile_active then 'active' else 'inactive' end
  where id = p_referral_id
    and org_id = actor_org
    and status = 'pending';

  if not found then
    raise exception 'pending referral not found'
      using errcode = 'no_data_found';
  end if;
end;
$$;

create or replace function public.add_referral_update(
  p_referral_id uuid,
  p_update_type text,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  actor_org uuid;
  actor_role text;
  clean_content text := nullif(btrim(p_content), '');
  result uuid;
begin
  select actor_id, actor_org_id, assert_referral_actor.actor_role
  into actor, actor_org, actor_role
  from private.assert_referral_actor();

  if p_update_type not in (
    'housing', 'documentation', 'education', 'employment', 'health', 'other'
  )
    or clean_content is null
    or length(clean_content) > 4000
  then
    raise check_violation using message = 'invalid referral update';
  end if;

  if not exists (
    select 1
    from public.entity_referrals as referral
    where referral.id = p_referral_id
      and referral.org_id = actor_org
      and referral.referred_profile_id is not null
      and (
        actor_role in ('staff', 'admin')
        or referral.entity_user_id = actor
      )
  ) then
    raise exception 'referral update is outside the caller boundary'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.referral_updates (
    org_id, referral_id, author_id, update_type, content
  ) values (
    actor_org, p_referral_id, actor, p_update_type, public.encrypt_field(clean_content)
  )
  returning id into result;

  return result;
end;
$$;

create or replace function public.list_referral_updates(p_referral_id uuid)
returns table (
  id uuid,
  update_type text,
  content text,
  author_name text,
  created_at timestamptz
)
language sql
security invoker
set search_path = ''
stable
as $$
  select
    referral_update.id,
    referral_update.update_type,
    public.decrypt_field(referral_update.content),
    concat_ws(' ', author.first_name, author.last_name),
    referral_update.created_at
  from public.referral_updates as referral_update
  join public.profiles as author
    on author.org_id = referral_update.org_id
   and author.id = referral_update.author_id
  where referral_update.referral_id = p_referral_id
  order by referral_update.created_at desc, referral_update.id;
$$;

create or replace function private.sync_referral_profile_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'player' and new.is_active is distinct from old.is_active then
    update public.entity_referrals
    set status = case when new.is_active then 'active' else 'inactive' end
    where org_id = new.org_id and referred_profile_id = new.id;
  end if;
  return new;
end;
$$;

create trigger profiles_sync_referral_status
  after update of is_active on public.profiles
  for each row execute function private.sync_referral_profile_status();

revoke all on function private.sync_referral_profile_status()
  from public, anon, authenticated, service_role;

alter table public.push_publications
  drop constraint push_publications_content_type_check;
alter table public.push_publications
  add constraint push_publications_content_type_check
  check (
    content_type in ('announcement', 'event', 'message', 'forum_flag', 'referral_update')
  );
alter table public.push_publications
  drop constraint push_publications_recipient_shape_check;
alter table public.push_publications
  add constraint push_publications_recipient_shape_check check (
    (content_type in ('message', 'referral_update') and recipient_id is not null)
    or (content_type not in ('message', 'referral_update') and recipient_id is null)
  );

create or replace function private.enqueue_referral_update_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
  publication uuid;
begin
  select referral.assigned_staff_id into recipient
  from public.entity_referrals as referral
  where referral.org_id = new.org_id and referral.id = new.referral_id;

  if recipient is null or recipient = new.author_id then
    return new;
  end if;

  insert into public.push_publications (
    org_id, content_type, content_id, recipient_id, scheduled_for, state
  ) values (
    new.org_id, 'referral_update', new.id, recipient, new.created_at, 'processing'
  )
  on conflict (content_type, content_id) do nothing
  returning id into publication;

  if publication is not null then
    insert into public.push_deliveries (
      org_id, publication_id, push_token_id, recipient_id, language, next_attempt_at
    )
    select
      new.org_id,
      publication,
      push_token.id,
      profile.id,
      case when profile.preferred_language in ('ca', 'es', 'en', 'ar', 'fa')
        then profile.preferred_language else 'ca' end,
      new.created_at
    from public.profiles as profile
    join public.push_tokens as push_token on push_token.user_id = profile.id
    where profile.org_id = new.org_id
      and profile.id = recipient
      and profile.role in ('staff', 'admin')
      and profile.is_active
      and profile.push_notifications_enabled
    on conflict on constraint push_deliveries_publication_token_unique do nothing;

    perform private.invoke_push_dispatch('referral_update');
  end if;

  return new;
end;
$$;

create trigger referral_updates_enqueue_push
  after insert on public.referral_updates
  for each row execute function private.enqueue_referral_update_push();

revoke all on function private.enqueue_referral_update_push()
  from public, anon, authenticated, service_role;

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

    union all

    select
      referral_update.id,
      'referral_update'::text as kind,
      referral_update.created_at as occurred_at,
      concat_ws(' ', entity.first_name, entity.last_name) as title,
      public.decrypt_field(referral_update.content) as detail,
      referral.referred_profile_id as profile_id
    from public.referral_updates as referral_update
    join public.entity_referrals as referral
      on referral.org_id = referral_update.org_id
     and referral.id = referral_update.referral_id
    join public.profiles as entity
      on entity.org_id = referral.org_id
     and entity.id = referral.entity_user_id
    where referral.referred_profile_id = participant_id
  ) as events
  where events.profile_id = participant_id
  order by events.occurred_at desc, events.id;
$$;

comment on function public.participant_activity is
  'Staff participant timeline including service interests, messages and encrypted referral updates.';

create or replace function public.purge_expired_entity_referrals(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  if (select auth.role()) <> 'service_role' and not (select public.is_admin()) then
    raise exception 'only service role or admin may purge expired referral intake'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.entity_referrals
  where referred_profile_id is null
    and created_at < p_now - interval '24 months';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_expired_entity_referrals(timestamptz)
  from public, anon, authenticated;
grant execute on function public.purge_expired_entity_referrals(timestamptz)
  to service_role;

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
    ('audit_log', 'actor_id', 'purge', 'Rows where the participant acted.'),
    ('audit_log', 'target_id', 'retain', 'Opaque lawful-access and erasure record.'),
    ('entity_referrals', null, 'retain_limited',
     'Unlinked referral intake is encrypted and purged after 24 months.'),
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
    ('organizations', null, 'not_personal', 'A tenant, not a person.'),
    ('municipality_catalog', null, 'not_personal', 'Official geography with no participant data.');
$$;

revoke all on function public.create_entity_referral(jsonb)
  from public, anon;
revoke all on function public.list_entity_referrals()
  from public, anon;
revoke all on function public.get_entity_referral(uuid)
  from public, anon;
revoke all on function public.list_staff_referrals(text)
  from public, anon;
revoke all on function public.complete_entity_referral(uuid, uuid)
  from public, anon;
revoke all on function public.add_referral_update(uuid, text, text)
  from public, anon;
revoke all on function public.list_referral_updates(uuid)
  from public, anon;
grant execute on function public.create_entity_referral(jsonb) to authenticated;
grant execute on function public.list_entity_referrals() to authenticated;
grant execute on function public.get_entity_referral(uuid) to authenticated;
grant execute on function public.list_staff_referrals(text) to authenticated;
grant execute on function public.complete_entity_referral(uuid, uuid) to authenticated;
grant execute on function public.add_referral_update(uuid, text, text) to authenticated;
grant execute on function public.list_referral_updates(uuid) to authenticated;
