-- Entity-owned service submission writes and the staff notification queue
-- for immediately live published edits (RAPP-43).

create table public.service_submission_notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  service_id uuid not null,
  kind text not null check (kind in ('published_edit')),
  created_by uuid references public.profiles (id) on delete set null
    deferrable initially deferred,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  read_by uuid references public.profiles (id) on delete set null
    deferrable initially deferred,
  constraint service_submission_notifications_service_tenant_fkey
    foreign key (org_id, service_id)
    references public.services (org_id, id) on delete cascade,
  constraint service_submission_notifications_read_consistent check (
    (read_at is null and read_by is null)
    or (read_at is not null and read_by is not null)
  )
);

comment on table public.service_submission_notifications is
  'Durable staff work generated when an entity edit changes a published service that stays live.';

create index service_submission_notifications_org_unread_idx
  on public.service_submission_notifications (org_id, created_at desc, id)
  where read_at is null;
create index service_submission_notifications_service_idx
  on public.service_submission_notifications (org_id, service_id, created_at desc);
create index service_submission_notifications_created_by_idx
  on public.service_submission_notifications (created_by)
  where created_by is not null;
create index service_submission_notifications_read_by_idx
  on public.service_submission_notifications (read_by)
  where read_by is not null;

alter table public.service_submission_notifications enable row level security;
alter table public.service_submission_notifications force row level security;

create policy service_submission_notifications_select_staff
  on public.service_submission_notifications for select to authenticated
  using (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  );

create policy service_submission_notifications_update_staff
  on public.service_submission_notifications for update to authenticated
  using (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  )
  with check (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
    and read_by = (select auth.uid())
  );

revoke all on table public.service_submission_notifications
  from public, anon, authenticated;
grant select on table public.service_submission_notifications to authenticated;
grant update (read_at, read_by)
  on table public.service_submission_notifications to authenticated;

create or replace function private.notify_entity_published_service_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select public.current_app_role()) = 'entity'
    and old.status = 'published'
    and new.status = 'published'
    and (
      to_jsonb(new) - array[
        'updated_at', 'reviewed_by', 'reviewed_at', 'rejection_reason'
      ]::text[]
    ) is distinct from (
      to_jsonb(old) - array[
        'updated_at', 'reviewed_by', 'reviewed_at', 'rejection_reason'
      ]::text[]
    ) then
    insert into public.service_submission_notifications (
      org_id, service_id, kind, created_by
    ) values (
      new.org_id, new.id, 'published_edit', auth.uid()
    );
  end if;
  return new;
end;
$$;

revoke all on function private.notify_entity_published_service_edit()
  from public, anon, authenticated;

create trigger services_notify_entity_published_edit
  after update on public.services
  for each row execute function private.notify_entity_published_service_edit();

create or replace function public.save_entity_service(p_payload jsonb)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  allowed_keys constant text[] := array[
    'serviceId', 'categoryId', 'title', 'description', 'providerName',
    'location', 'zone', 'costType', 'costAmount', 'costDetails',
    'contactName', 'contactPhone', 'contactEmail', 'contactRole',
    'schedule', 'externalUrl', 'availability', 'metadata',
    'publishedAt', 'expiresAt'
  ];
  existing_service public.services%rowtype;
  saved_service_id uuid;
  selected_category_id uuid;
  requested_published_at timestamptz;
  requested_expires_at timestamptz;
  submitted_title text;
  submitted_description text;
begin
  if (select public.current_app_role()) <> 'entity' then
    raise insufficient_privilege using message =
      'only entity contacts may save entity service submissions';
  end if;
  if jsonb_typeof(p_payload) <> 'object'
    or not p_payload ?& allowed_keys
    or p_payload - allowed_keys <> '{}'::jsonb then
    raise check_violation using message = 'invalid entity service payload shape';
  end if;

  selected_category_id := (p_payload ->> 'categoryId')::uuid;
  saved_service_id := nullif(p_payload ->> 'serviceId', '')::uuid;
  requested_published_at := (p_payload ->> 'publishedAt')::timestamptz;
  requested_expires_at := (p_payload ->> 'expiresAt')::timestamptz;
  submitted_title := btrim(p_payload ->> 'title');
  submitted_description := nullif(btrim(p_payload ->> 'description'), '');

  if length(submitted_title) not between 1 and 200 then
    raise check_violation using message = 'invalid entity service title';
  end if;
  if requested_expires_at is not null
    and (
      requested_published_at is null
      or requested_expires_at <= requested_published_at
    ) then
    raise check_violation using message =
      'service expiry must follow requested publication';
  end if;

  if saved_service_id is null then
    insert into public.services (
      category_id, title, description, provider_name, location, zone,
      cost_type, cost_amount, cost_details, contact_name, contact_phone,
      contact_email, contact_role, schedule, external_url, availability,
      metadata, status, published_at, expires_at, submitted_by, created_by
    ) values (
      selected_category_id,
      jsonb_build_object('ca', submitted_title),
      case
        when submitted_description is null then null
        else jsonb_build_object('ca', submitted_description)
      end,
      p_payload ->> 'providerName',
      p_payload ->> 'location',
      p_payload ->> 'zone',
      p_payload ->> 'costType',
      (p_payload ->> 'costAmount')::numeric,
      p_payload ->> 'costDetails',
      p_payload ->> 'contactName',
      p_payload ->> 'contactPhone',
      p_payload ->> 'contactEmail',
      p_payload ->> 'contactRole',
      p_payload ->> 'schedule',
      p_payload ->> 'externalUrl',
      p_payload ->> 'availability',
      p_payload -> 'metadata',
      'pending',
      requested_published_at,
      requested_expires_at,
      auth.uid(),
      auth.uid()
    )
    returning id into saved_service_id;
    return saved_service_id;
  end if;

  select service.*
  into existing_service
  from public.services as service
  where service.id = saved_service_id
    and service.org_id = (select public.current_org_id())
    and service.submitted_by = (select auth.uid())
  for update;

  if not found then
    raise insufficient_privilege using message =
      'service submission is unavailable to this entity';
  end if;
  if existing_service.status not in ('draft', 'rejected', 'published') then
    raise insufficient_privilege using message =
      'this submission is read-only while staff review it';
  end if;

  update public.services as service
  set category_id = selected_category_id,
      title = case
        when existing_service.status = 'published'
          then existing_service.title || jsonb_build_object('ca', submitted_title)
        else jsonb_build_object('ca', submitted_title)
      end,
      description = case
        when submitted_description is null then null
        when existing_service.status = 'published'
          then coalesce(existing_service.description, '{}'::jsonb)
            || jsonb_build_object('ca', submitted_description)
        else jsonb_build_object('ca', submitted_description)
      end,
      provider_name = p_payload ->> 'providerName',
      location = p_payload ->> 'location',
      zone = p_payload ->> 'zone',
      cost_type = p_payload ->> 'costType',
      cost_amount = (p_payload ->> 'costAmount')::numeric,
      cost_details = p_payload ->> 'costDetails',
      contact_name = p_payload ->> 'contactName',
      contact_phone = p_payload ->> 'contactPhone',
      contact_email = p_payload ->> 'contactEmail',
      contact_role = p_payload ->> 'contactRole',
      schedule = p_payload ->> 'schedule',
      external_url = p_payload ->> 'externalUrl',
      availability = p_payload ->> 'availability',
      metadata = p_payload -> 'metadata',
      status = case
        when existing_service.status = 'published' then 'published'
        else 'pending'
      end,
      published_at = case
        when existing_service.status = 'published' then now()
        else requested_published_at
      end,
      expires_at = requested_expires_at,
      reviewed_by = case
        when existing_service.status = 'published' then existing_service.reviewed_by
        else null
      end,
      reviewed_at = case
        when existing_service.status = 'published' then existing_service.reviewed_at
        else null
      end,
      rejection_reason = null
  where service.id = saved_service_id;

  return saved_service_id;
end;
$$;

revoke all on function public.save_entity_service(jsonb) from public, anon;
grant execute on function public.save_entity_service(jsonb) to authenticated;

comment on function public.save_entity_service(jsonb) is
  'Entity-only atomic save. New and rejected submissions become pending; published edits stay published, become live immediately, and notify staff.';

create or replace function public.get_own_service_contacts()
returns table (
  contact_name text,
  contact_phone text,
  contact_email text,
  contact_role text,
  provider_name text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if (select public.current_app_role()) <> 'entity' then
    raise insufficient_privilege using message =
      'contact reuse is available only to entity contacts';
  end if;

  return query
  select distinct
    service.contact_name,
    service.contact_phone,
    service.contact_email,
    service.contact_role,
    service.provider_name
  from public.services as service
  where service.org_id = (select public.current_org_id())
    and service.submitted_by = (select auth.uid())
    and (
      service.contact_name is not null
      or service.contact_phone is not null
      or service.contact_email is not null
      or service.contact_role is not null
    )
  order by
    service.contact_name nulls last,
    service.contact_email nulls last,
    service.contact_phone nulls last,
    service.contact_role nulls last,
    service.provider_name nulls last;
end;
$$;

revoke all on function public.get_own_service_contacts() from public, anon;
grant execute on function public.get_own_service_contacts() to authenticated;

comment on function public.get_own_service_contacts() is
  'No-argument entity-only contact autocomplete. Scope is always auth.uid(), never a client-supplied entity id.';

create or replace function public.resubmit_entity_service(p_service_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if (select public.current_app_role()) <> 'entity' then
    raise insufficient_privilege using message =
      'only entity contacts may resubmit rejected services';
  end if;

  update public.services as service
  set status = 'pending',
      reviewed_by = null,
      reviewed_at = null,
      rejection_reason = null
  where service.id = p_service_id
    and service.org_id = (select public.current_org_id())
    and service.submitted_by = (select auth.uid())
    and service.status = 'rejected';

  if not found then
    raise insufficient_privilege using message =
      'only an owned rejected submission can be resubmitted';
  end if;
end;
$$;

revoke all on function public.resubmit_entity_service(uuid) from public, anon;
grant execute on function public.resubmit_entity_service(uuid) to authenticated;

comment on function public.resubmit_entity_service(uuid) is
  'Entity-only rejected-to-pending transition. The service id is still constrained by tenant, ownership, and RLS.';

create table public.service_submission_comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id()
    references public.organizations (id) on delete cascade,
  service_id uuid not null,
  author_id uuid default auth.uid()
    references public.profiles (id) on delete set null deferrable initially deferred,
  author_role text not null default public.current_app_role()
    check (author_role in ('entity', 'staff', 'admin')),
  body text not null check (length(btrim(body)) between 1 and 4000),
  is_internal boolean not null default false,
  created_at timestamptz not null default now(),
  constraint service_submission_comments_service_tenant_fkey
    foreign key (org_id, service_id)
    references public.services (org_id, id) on delete cascade
);

comment on table public.service_submission_comments is
  'Append-only service submission conversation. Internal staff notes are denied to entity sessions by RLS.';
comment on column public.service_submission_comments.is_internal is
  'True only for staff notes. Entity SELECT and INSERT policies both deny these rows.';

create index service_submission_comments_service_idx
  on public.service_submission_comments (org_id, service_id, created_at, id);
create index service_submission_comments_author_idx
  on public.service_submission_comments (author_id, created_at desc)
  where author_id is not null;

alter table public.service_submission_comments enable row level security;
alter table public.service_submission_comments force row level security;

create policy service_submission_comments_select_thread
  on public.service_submission_comments for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.is_staff_or_admin())
      or (
        (select public.current_app_role()) = 'entity'
        and not is_internal
        and exists (
          select 1
          from public.services as service
          where service.org_id = service_submission_comments.org_id
            and service.id = service_submission_comments.service_id
            and service.submitted_by = (select auth.uid())
        )
      )
    )
  );

create policy service_submission_comments_insert_thread
  on public.service_submission_comments for insert to authenticated
  with check (
    org_id = (select public.current_org_id())
    and author_id = (select auth.uid())
    and author_role = (select public.current_app_role())
    and exists (
      select 1
      from public.services as service
      where service.org_id = service_submission_comments.org_id
        and service.id = service_submission_comments.service_id
        and (
          (
            (select public.is_staff_or_admin())
            and author_role in ('staff', 'admin')
          )
          or (
            (select public.current_app_role()) = 'entity'
            and author_role = 'entity'
            and not is_internal
            and service.submitted_by = (select auth.uid())
          )
        )
    )
  );

revoke all on table public.service_submission_comments
  from public, anon, authenticated;
grant select on table public.service_submission_comments to authenticated;
grant insert (service_id, body, is_internal)
  on table public.service_submission_comments to authenticated;

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
     'Carries `reason`, written in her own words. The audit trail records that the request was fulfilled.'),
    ('invites', 'accepted_by', 'purge',
     'The invitation that admitted her, and separately every row carrying her email address.'),
    ('equipment_deliveries', 'profile_id', 'purge',
     'What she was given and when. Not neutral inventory: it says which women needed boots and in what month, which is an inference about her circumstances.'),
    ('event_signups', 'player_id', 'purge',
     'Her interest or confirmed attendance at an event is participant activity and must be erased.'),
    ('attendance', 'player_id', 'purge',
     'Whether she attended, missed, or was excused from an event is participant activity and must be erased.'),
    ('service_interests', 'user_id', 'purge',
     'Her interest in a service is participant activity and must be erased.'),
    ('audit_log', 'actor_id', 'purge',
     'Rows where SHE acted. The FK does not cascade, so leaving these would make her undeletable.'),
    ('audit_log', 'target_id', 'retain',
     'Kept on purpose (ADR-023): opaque ids only, never personal data (ADR-021). This is the evidence that access to her record was lawful and that the erasure happened, which art. 17(3) permits keeping and which erasing would destroy along with the thing it proves.'),
    ('announcements', null, 'not_personal',
     'Organization-owned operational content. Players cannot author it, and a removed staff author is detached with ON DELETE SET NULL.'),
    ('event_categories', null, 'not_personal',
     'Organization-owned event vocabulary with no participant data.'),
    ('events', null, 'not_personal',
     'Organization-owned schedules. A removed staff author is detached with ON DELETE SET NULL.'),
    ('event_occurrences', null, 'not_personal',
     'Materialized organization schedule instances with no participant data.'),
    ('knowledge_categories', null, 'not_personal',
     'Organization-owned knowledge vocabulary with no participant data.'),
    ('knowledge_articles', 'author_id', 'purge',
     'Participant stories contain her words and first-name attribution. Anonymization and erasure remove the whole story.'),
    ('push_publications', null, 'not_personal',
     'Organization-content idempotency and aggregate delivery counts contain no participant identity or notification text.'),
    ('service_categories', null, 'not_personal',
     'Organization-owned service vocabulary with no participant data.'),
    ('services', null, 'not_personal',
     'Organization-owned directory content. Removed authors are detached with ON DELETE SET NULL.'),
    ('service_images', null, 'not_personal',
     'Organization-owned service media. It cascades when its service is removed.'),
    ('service_submission_comments', null, 'not_personal',
     'Organization service-review correspondence. Entity and staff authors detach on account removal.'),
    ('service_submission_notifications', null, 'not_personal',
     'Organization staff work queue. Entity and staff references detach on account removal.'),
    ('organizations', null, 'not_personal',
     'A tenant, not a person. No participant column exists to purge.'),
    ('municipality_catalog', null, 'not_personal',
     'Official IDESCAT administrative geography; it contains no participant data.');
$$;

comment on function public.personal_data_disposition is
  'What happens to each table when a participant is erased. Every table in public must appear; pgTAP fails when one does not, and delete_participant_permanently() sweeps from this list at runtime so the registry and the behaviour cannot drift apart.';
