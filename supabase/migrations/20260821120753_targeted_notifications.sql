-- Multilingual templates, targeted staff sends, curated groups, and send history (RAPP-59).
-- The existing RAPP-36 outbox remains the sole Expo delivery pipeline.

create table public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  category text not null check (category in ('transactional', 'engagement', 'marketing')),
  title jsonb not null,
  body jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_templates_org_name_unique unique (org_id, name),
  constraint notification_templates_org_id_id_unique unique (org_id, id),
  constraint notification_templates_creator_tenant_fkey
    foreign key (org_id, created_by)
    references public.profiles (org_id, id) on delete set null (created_by)
);

create table public.custom_notification_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_notification_groups_org_name_unique unique (org_id, name),
  constraint custom_notification_groups_org_id_id_unique unique (org_id, id),
  constraint custom_notification_groups_creator_tenant_fkey
    foreign key (org_id, created_by)
    references public.profiles (org_id, id) on delete set null (created_by)
);

create table public.custom_notification_group_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  group_id uuid not null,
  participant_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (group_id, participant_id),
  constraint custom_notification_group_members_group_tenant_fkey
    foreign key (org_id, group_id)
    references public.custom_notification_groups (org_id, id) on delete cascade,
  constraint custom_notification_group_members_participant_tenant_fkey
    foreign key (org_id, participant_id)
    references public.profiles (org_id, id) on delete cascade
);

create table public.targeted_notification_sends (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  template_id uuid,
  title jsonb not null,
  body jsonb not null,
  audience_kind text not null check (
    audience_kind in ('all', 'interest', 'signup', 'entity', 'custom_group')
  ),
  audience_config jsonb not null default '{}'::jsonb,
  recipient_count integer not null check (recipient_count >= 0),
  sent_by uuid,
  created_at timestamptz not null default now(),
  constraint targeted_notification_sends_org_id_id_unique unique (org_id, id),
  constraint targeted_notification_sends_template_tenant_fkey
    foreign key (org_id, template_id)
    references public.notification_templates (org_id, id) on delete set null (template_id),
  constraint targeted_notification_sends_sender_tenant_fkey
    foreign key (org_id, sent_by)
    references public.profiles (org_id, id) on delete set null (sent_by)
);

comment on table public.notification_templates is
  'Staff-managed five-language push copy. Production ownership remains blocked by RAPP-83.';
comment on table public.custom_notification_groups is
  'Staff-curated reusable participant audiences.';
comment on table public.custom_notification_group_members is
  'Participant membership in a staff-curated notification audience.';
comment on table public.targeted_notification_sends is
  'Immutable confirmed audience and aggregate delivery history for targeted pushes.';

create trigger notification_templates_set_updated_at
  before update on public.notification_templates
  for each row execute function public.set_updated_at();
create trigger custom_notification_groups_set_updated_at
  before update on public.custom_notification_groups
  for each row execute function public.set_updated_at();

create index custom_notification_group_members_participant_idx
  on public.custom_notification_group_members (org_id, participant_id, group_id);
create index targeted_notification_sends_history_idx
  on public.targeted_notification_sends (org_id, created_at desc, id);

alter table public.notification_templates enable row level security;
alter table public.notification_templates force row level security;
alter table public.custom_notification_groups enable row level security;
alter table public.custom_notification_groups force row level security;
alter table public.custom_notification_group_members enable row level security;
alter table public.custom_notification_group_members force row level security;
alter table public.targeted_notification_sends enable row level security;
alter table public.targeted_notification_sends force row level security;

create policy notification_templates_select_staff
  on public.notification_templates for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (select public.is_staff_or_admin())
  );
create policy custom_notification_groups_select_staff
  on public.custom_notification_groups for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (select public.is_staff_or_admin())
  );
create policy custom_notification_group_members_select_staff
  on public.custom_notification_group_members for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (select public.is_staff_or_admin())
  );
create policy targeted_notification_sends_select_staff
  on public.targeted_notification_sends for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (select public.is_staff_or_admin())
  );

revoke all on table public.notification_templates from public, anon, authenticated;
revoke all on table public.custom_notification_groups from public, anon, authenticated;
revoke all on table public.custom_notification_group_members from public, anon, authenticated;
revoke all on table public.targeted_notification_sends from public, anon, authenticated;
grant select on table public.notification_templates to authenticated;
grant select on table public.custom_notification_groups to authenticated;
grant select on table public.custom_notification_group_members to authenticated;
grant select on table public.targeted_notification_sends to authenticated;

create or replace function private.valid_notification_copy(copy jsonb, max_length integer)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_typeof(copy) = 'object'
    and (select count(*) from jsonb_object_keys(copy)) = 5
    and copy ?& array['ca', 'es', 'en', 'ar', 'fa']
    and not exists (
      select 1
      from jsonb_each(copy) as item(language, value)
      where item.language not in ('ca', 'es', 'en', 'ar', 'fa')
        or jsonb_typeof(item.value) <> 'string'
        or length(btrim(item.value #>> '{}')) not between 1 and max_length
    );
$$;

create or replace function public.preview_notification_audience(
  p_audience_kind text,
  p_audience_config jsonb default '{}'::jsonb
)
returns table (
  participant_id uuid,
  full_name text,
  language text,
  device_count integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not (select public.is_staff_or_admin()) then
    raise exception 'NOTIFICATIONS/STAFF_ONLY' using errcode = '42501';
  end if;
  if p_audience_kind not in ('all', 'interest', 'signup', 'entity', 'custom_group') then
    raise exception 'NOTIFICATIONS/INVALID_AUDIENCE' using errcode = '22023';
  end if;

  return query
  select
    profile.id,
    btrim(profile.first_name || ' ' || profile.last_name),
    case
      when profile.preferred_language in ('ca', 'es', 'en', 'ar', 'fa')
        then profile.preferred_language
      else 'ca'
    end,
    count(distinct push_token.id)::integer
  from public.profiles as profile
  join public.push_tokens as push_token on push_token.user_id = profile.id
  where profile.org_id = (select public.current_org_id())
    and profile.role = 'player'
    and profile.is_active
    and profile.push_notifications_enabled
    and (
      p_audience_kind = 'all'
      or (
        p_audience_kind = 'interest'
        and exists (
          select 1
          from public.service_interests as interest
          join public.services as service
            on service.org_id = interest.org_id
           and service.id = interest.service_id
          where interest.org_id = profile.org_id
            and interest.user_id = profile.id
            and service.category_id = nullif(p_audience_config->>'service_category_id', '')::uuid
        )
      )
      or (
        p_audience_kind = 'signup'
        and exists (
          select 1
          from public.event_signups as signup
          where signup.org_id = profile.org_id
            and signup.player_id = profile.id
            and signup.event_id = nullif(p_audience_config->>'event_id', '')::uuid
            and signup.state in ('interested', 'confirmed')
        )
      )
      or (
        p_audience_kind = 'entity'
        and lower(btrim(profile.reference_entity)) =
          lower(btrim(nullif(p_audience_config->>'entity_name', '')))
      )
      or (
        p_audience_kind = 'custom_group'
        and exists (
          select 1
          from public.custom_notification_group_members as membership
          where membership.org_id = profile.org_id
            and membership.participant_id = profile.id
            and membership.group_id = nullif(p_audience_config->>'custom_group_id', '')::uuid
        )
      )
    )
  group by profile.id, profile.first_name, profile.last_name, profile.preferred_language
  order by profile.last_name, profile.first_name, profile.id;
end;
$$;

create or replace function private.save_notification_template(
  p_id uuid,
  p_name text,
  p_category text,
  p_title jsonb,
  p_body jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  saved_id uuid;
begin
  if not (select public.is_staff_or_admin()) then
    raise exception 'NOTIFICATIONS/STAFF_ONLY' using errcode = '42501';
  end if;
  if length(btrim(p_name)) not between 1 and 80
    or p_category not in ('transactional', 'engagement', 'marketing')
    or not private.valid_notification_copy(p_title, 120)
    or not private.valid_notification_copy(p_body, 1000)
  then
    raise exception 'NOTIFICATIONS/INVALID_TEMPLATE' using errcode = '23514';
  end if;

  if p_id is null then
    insert into public.notification_templates (org_id, name, category, title, body, created_by)
    values (actor_org, btrim(p_name), p_category, p_title, p_body, actor)
    returning id into saved_id;
  else
    update public.notification_templates
    set name = btrim(p_name), category = p_category, title = p_title, body = p_body
    where id = p_id and org_id = actor_org
    returning id into saved_id;
    if saved_id is null then
      raise exception 'NOTIFICATIONS/TEMPLATE_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;
  return saved_id;
end;
$$;

create or replace function public.save_notification_template(
  p_id uuid,
  p_name text,
  p_category text,
  p_title jsonb,
  p_body jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.save_notification_template(p_id, p_name, p_category, p_title, p_body);
$$;

create or replace function private.save_custom_notification_group(
  p_id uuid,
  p_name text,
  p_participant_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  saved_id uuid;
  normalized_ids uuid[] := array(
    select distinct participant_id from unnest(coalesce(p_participant_ids, '{}'::uuid[])) participant_id
  );
begin
  if not (select public.is_staff_or_admin()) then
    raise exception 'NOTIFICATIONS/STAFF_ONLY' using errcode = '42501';
  end if;
  if length(btrim(p_name)) not between 1 and 80 then
    raise exception 'NOTIFICATIONS/INVALID_GROUP' using errcode = '23514';
  end if;
  if (select count(*) from public.profiles
      where org_id = actor_org and id = any(normalized_ids) and role = 'player')
     <> cardinality(normalized_ids)
  then
    raise exception 'NOTIFICATIONS/INVALID_GROUP_MEMBERS' using errcode = '23514';
  end if;

  if p_id is null then
    insert into public.custom_notification_groups (org_id, name, created_by)
    values (actor_org, btrim(p_name), actor)
    returning id into saved_id;
  else
    update public.custom_notification_groups
    set name = btrim(p_name)
    where id = p_id and org_id = actor_org
    returning id into saved_id;
    if saved_id is null then
      raise exception 'NOTIFICATIONS/GROUP_NOT_FOUND' using errcode = 'P0002';
    end if;
    delete from public.custom_notification_group_members
    where org_id = actor_org and group_id = saved_id;
  end if;

  insert into public.custom_notification_group_members (org_id, group_id, participant_id)
  select actor_org, saved_id, participant_id from unnest(normalized_ids) participant_id;
  return saved_id;
end;
$$;

create or replace function public.save_custom_notification_group(
  p_id uuid,
  p_name text,
  p_participant_ids uuid[]
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.save_custom_notification_group(p_id, p_name, p_participant_ids);
$$;

create or replace function private.delete_notification_template(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_staff_or_admin()) then
    raise exception 'NOTIFICATIONS/STAFF_ONLY' using errcode = '42501';
  end if;
  delete from public.notification_templates
  where id = p_id and org_id = (select public.current_org_id());
end;
$$;

create or replace function public.delete_notification_template(p_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.delete_notification_template(p_id); $$;

create or replace function private.delete_custom_notification_group(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_staff_or_admin()) then
    raise exception 'NOTIFICATIONS/STAFF_ONLY' using errcode = '42501';
  end if;
  delete from public.custom_notification_groups
  where id = p_id and org_id = (select public.current_org_id());
end;
$$;

create or replace function public.delete_custom_notification_group(p_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.delete_custom_notification_group(p_id); $$;

alter table public.push_publications
  drop constraint push_publications_content_type_check;
alter table public.push_publications
  add constraint push_publications_content_type_check
  check (content_type in (
    'announcement', 'event', 'message', 'forum_flag', 'referral_update',
    'mentoring_update', 'targeted_notification'
  ));

create or replace function private.create_targeted_notification_send(
  p_template_id uuid,
  p_title jsonb,
  p_body jsonb,
  p_audience_kind text,
  p_audience_config jsonb,
  p_expected_recipient_count integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  recipient_ids uuid[];
  actual_recipient_count integer;
  actual_device_count integer;
  send_id uuid;
  publication_id uuid;
begin
  if not (select public.is_staff_or_admin()) then
    raise exception 'NOTIFICATIONS/STAFF_ONLY' using errcode = '42501';
  end if;
  if not private.valid_notification_copy(p_title, 120)
    or not private.valid_notification_copy(p_body, 1000)
    or p_expected_recipient_count < 1
  then
    raise exception 'NOTIFICATIONS/INVALID_SEND' using errcode = '23514';
  end if;
  if p_template_id is not null and not exists (
    select 1 from public.notification_templates
    where id = p_template_id and org_id = actor_org
  ) then
    raise exception 'NOTIFICATIONS/TEMPLATE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select
    coalesce(array_agg(audience.participant_id), '{}'::uuid[]),
    count(*)::integer,
    coalesce(sum(audience.device_count), 0)::integer
  into recipient_ids, actual_recipient_count, actual_device_count
  from public.preview_notification_audience(p_audience_kind, coalesce(p_audience_config, '{}'::jsonb)) audience;

  if actual_recipient_count <> p_expected_recipient_count then
    raise exception 'NOTIFICATIONS/AUDIENCE_CHANGED' using errcode = 'P0001';
  end if;

  insert into public.targeted_notification_sends (
    org_id, template_id, title, body, audience_kind, audience_config,
    recipient_count, sent_by
  ) values (
    actor_org, p_template_id, p_title, p_body, p_audience_kind,
    coalesce(p_audience_config, '{}'::jsonb), actual_recipient_count, actor
  ) returning id into send_id;

  insert into public.push_publications (
    org_id, content_type, content_id, scheduled_for, recipient_count
  ) values (
    actor_org, 'targeted_notification', send_id, now(), actual_device_count
  ) returning id into publication_id;

  insert into public.push_deliveries (
    org_id, publication_id, push_token_id, recipient_id, language, next_attempt_at
  )
  select
    actor_org,
    publication_id,
    push_token.id,
    profile.id,
    case when profile.preferred_language in ('ca', 'es', 'en', 'ar', 'fa')
      then profile.preferred_language else 'ca' end,
    now()
  from public.profiles as profile
  join public.push_tokens as push_token on push_token.user_id = profile.id
  where profile.org_id = actor_org
    and profile.id = any(recipient_ids)
    and profile.role = 'player'
    and profile.is_active
    and profile.push_notifications_enabled;

  insert into public.audit_log (
    org_id, actor_id, action, target_type, target_id, changes
  ) values (
    actor_org,
    actor,
    'targeted_notification_sent',
    'targeted_notification_send',
    send_id,
    jsonb_build_object(
      'audience_kind', p_audience_kind,
      'recipient_count', actual_recipient_count,
      'template_id', p_template_id
    )
  );

  perform private.invoke_push_dispatch('targeted');
  return send_id;
end;
$$;

create or replace function public.create_targeted_notification_send(
  p_template_id uuid,
  p_title jsonb,
  p_body jsonb,
  p_audience_kind text,
  p_audience_config jsonb,
  p_expected_recipient_count integer
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_targeted_notification_send(
    p_template_id, p_title, p_body, p_audience_kind,
    p_audience_config, p_expected_recipient_count
  );
$$;

create or replace function private.list_notification_send_history()
returns table (
  id uuid,
  template_id uuid,
  audience_kind text,
  audience_config jsonb,
  recipient_count integer,
  device_count integer,
  sent_count integer,
  delivered_count integer,
  failed_count integer,
  state text,
  sent_by uuid,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_staff_or_admin()) then
    raise exception 'NOTIFICATIONS/STAFF_ONLY' using errcode = '42501';
  end if;
  return query
  select
    send.id,
    send.template_id,
    send.audience_kind,
    send.audience_config,
    send.recipient_count,
    publication.recipient_count,
    publication.sent_count,
    publication.delivered_count,
    publication.failed_count,
    publication.state,
    send.sent_by,
    send.created_at
  from public.targeted_notification_sends as send
  join public.push_publications as publication
    on publication.org_id = send.org_id
   and publication.content_type = 'targeted_notification'
   and publication.content_id = send.id
  where send.org_id = (select public.current_org_id())
  order by send.created_at desc, send.id;
end;
$$;

create or replace function public.list_notification_send_history()
returns table (
  id uuid,
  template_id uuid,
  audience_kind text,
  audience_config jsonb,
  recipient_count integer,
  device_count integer,
  sent_count integer,
  delivered_count integer,
  failed_count integer,
  state text,
  sent_by uuid,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.list_notification_send_history(); $$;

create or replace function private.claim_push_deliveries(
  dispatch_secret text,
  claiming_worker_id uuid,
  claimed_at timestamptz default now(),
  claim_limit integer default 500
)
returns table (
  delivery_id uuid,
  publication_id uuid,
  push_token_id uuid,
  recipient_id uuid,
  token text,
  language text,
  content_type text,
  content_id uuid,
  title jsonb,
  body jsonb,
  expires_at timestamptz,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.push_dispatch_secret_matches(dispatch_secret) then
    raise exception 'PUSH-1' using errcode = '28000';
  end if;
  if claim_limit < 1 or claim_limit > 1000 then
    raise exception 'claim_limit must be between 1 and 1000'
      using errcode = 'invalid_parameter_value';
  end if;

  perform private.enqueue_due_push_publications(claimed_at);
  update public.push_deliveries as stale
  set
    state = case when stale.expo_ticket_id is null then 'retry' else 'ticketed' end,
    worker_id = null,
    lease_expires_at = null,
    next_attempt_at = claimed_at,
    receipt_due_at = case when stale.expo_ticket_id is null then null else claimed_at end,
    last_error_code = 'PUSH-8'
  where stale.state in ('sending', 'checking_receipt')
    and stale.lease_expires_at <= claimed_at;

  with pending_publications as (
    select publication.id, publication.org_id
    from public.push_publications as publication
    where publication.state = 'pending'
      and publication.content_type <> 'targeted_notification'
      and publication.scheduled_for <= claimed_at
    order by publication.scheduled_for, publication.id
    for update skip locked
  )
  insert into public.push_deliveries (
    org_id, publication_id, push_token_id, recipient_id, language, next_attempt_at
  )
  select
    publication.org_id,
    publication.id,
    push_token.id,
    profile.id,
    case when profile.preferred_language in ('ca', 'es', 'en', 'ar', 'fa')
      then profile.preferred_language else 'ca' end,
    claimed_at
  from pending_publications as publication
  join public.profiles as profile
    on profile.org_id = publication.org_id
   and profile.role = 'player'
   and profile.is_active
   and profile.push_notifications_enabled
  join public.push_tokens as push_token on push_token.user_id = profile.id
  on conflict on constraint push_deliveries_publication_token_unique do nothing;

  perform private.refresh_push_publication_states(claimed_at);

  return query
  with candidates as (
    select delivery.id
    from public.push_deliveries as delivery
    join public.push_publications as publication
      on publication.org_id = delivery.org_id
     and publication.id = delivery.publication_id
    where delivery.state in ('pending', 'retry')
      and delivery.next_attempt_at <= claimed_at
      and delivery.push_token_id is not null
      and publication.scheduled_for <= claimed_at
    order by delivery.next_attempt_at, delivery.id
    limit claim_limit
    for update of delivery skip locked
  ), claimed as (
    update public.push_deliveries as delivery
    set state = 'sending', worker_id = claiming_worker_id,
      lease_expires_at = claimed_at + interval '5 minutes',
      attempt_count = delivery.attempt_count + 1
    from candidates
    where delivery.id = candidates.id
    returning delivery.*
  ), marked_publications as (
    update public.push_publications as publication
    set state = 'processing', completed_at = null
    where (publication.org_id, publication.id) in (
      select distinct claimed.org_id, claimed.publication_id from claimed
    )
    returning publication.id
  )
  select
    claimed.id,
    claimed.publication_id,
    claimed.push_token_id,
    claimed.recipient_id,
    push_token.token,
    claimed.language,
    publication.content_type,
    publication.content_id,
    case
      when publication.content_type = 'announcement' then announcement.title
      when publication.content_type = 'targeted_notification' then targeted_send.title
      else event.title
    end,
    case
      when publication.content_type = 'announcement' then announcement.body
      when publication.content_type = 'targeted_notification' then targeted_send.body
      else event.description
    end,
    case
      when publication.content_type = 'announcement' then announcement.expires_at
      when publication.content_type = 'event' then event.expires_at
      else null
    end,
    claimed.attempt_count
  from claimed
  join marked_publications on marked_publications.id = claimed.publication_id
  join public.push_publications as publication
    on publication.org_id = claimed.org_id and publication.id = claimed.publication_id
  join public.push_tokens as push_token
    on push_token.user_id = claimed.recipient_id and push_token.id = claimed.push_token_id
  left join public.announcements as announcement
    on publication.content_type = 'announcement'
   and announcement.org_id = publication.org_id and announcement.id = publication.content_id
  left join public.events as event
    on publication.content_type = 'event'
   and event.org_id = publication.org_id and event.id = publication.content_id
  left join public.targeted_notification_sends as targeted_send
    on publication.content_type = 'targeted_notification'
   and targeted_send.org_id = publication.org_id and targeted_send.id = publication.content_id
  order by claimed.id;
end;
$$;

revoke all on function private.valid_notification_copy(jsonb, integer)
  from public, anon, authenticated, service_role;
revoke all on function private.save_notification_template(uuid, text, text, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.save_custom_notification_group(uuid, text, uuid[])
  from public, anon, authenticated, service_role;
revoke all on function private.delete_notification_template(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.delete_custom_notification_group(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.create_targeted_notification_send(uuid, jsonb, jsonb, text, jsonb, integer)
  from public, anon, authenticated, service_role;
revoke all on function private.list_notification_send_history()
  from public, anon, authenticated, service_role;

grant usage on schema private to authenticated;
grant execute on function private.save_notification_template(uuid, text, text, jsonb, jsonb)
  to authenticated;
grant execute on function private.save_custom_notification_group(uuid, text, uuid[])
  to authenticated;
grant execute on function private.delete_notification_template(uuid) to authenticated;
grant execute on function private.delete_custom_notification_group(uuid) to authenticated;
grant execute on function private.create_targeted_notification_send(uuid, jsonb, jsonb, text, jsonb, integer)
  to authenticated;
grant execute on function private.list_notification_send_history() to authenticated;

revoke all on function public.preview_notification_audience(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.save_notification_template(uuid, text, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.save_custom_notification_group(uuid, text, uuid[])
  from public, anon, authenticated;
revoke all on function public.delete_notification_template(uuid)
  from public, anon, authenticated;
revoke all on function public.delete_custom_notification_group(uuid)
  from public, anon, authenticated;
revoke all on function public.create_targeted_notification_send(uuid, jsonb, jsonb, text, jsonb, integer)
  from public, anon, authenticated;
revoke all on function public.list_notification_send_history()
  from public, anon, authenticated;

grant execute on function public.preview_notification_audience(text, jsonb) to authenticated;
grant execute on function public.save_notification_template(uuid, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.save_custom_notification_group(uuid, text, uuid[]) to authenticated;
grant execute on function public.delete_notification_template(uuid) to authenticated;
grant execute on function public.delete_custom_notification_group(uuid) to authenticated;
grant execute on function public.create_targeted_notification_send(uuid, jsonb, jsonb, text, jsonb, integer)
  to authenticated;
grant execute on function public.list_notification_send_history() to authenticated;

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
    ('custom_notification_group_members', 'participant_id', 'purge', 'Curated notification membership.'),
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
    ('notification_templates', null, 'not_personal', 'Organization-owned notification copy.'),
    ('custom_notification_groups', null, 'not_personal', 'Organization-owned audience definitions.'),
    ('targeted_notification_sends', null, 'not_personal', 'Aggregate organization send history.'),
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
