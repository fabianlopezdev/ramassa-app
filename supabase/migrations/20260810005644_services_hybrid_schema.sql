-- Hybrid services directory with category-owned metadata contracts (RAPP-41).

create schema if not exists private;

create or replace function public.is_service_metadata_schema_valid(metadata_schema jsonb)
returns boolean
language plpgsql
immutable
parallel safe
security invoker
set search_path = ''
as $$
declare
  field jsonb;
  field_type text;
begin
  if jsonb_typeof(metadata_schema) <> 'object'
    or jsonb_typeof(metadata_schema -> 'fields') <> 'array' then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(metadata_schema -> 'fields') as candidate(field)
    group by candidate.field ->> 'key'
    having count(*) > 1
  ) then
    return false;
  end if;

  for field in select value from jsonb_array_elements(metadata_schema -> 'fields') loop
    field_type := field ->> 'type';
    if jsonb_typeof(field) <> 'object'
      or coalesce(field ->> 'key', '') !~ '^[a-z][a-z0-9_]*$'
      or field_type not in ('select', 'string-array', 'boolean', 'number', 'text', 'date')
      or jsonb_typeof(field -> 'required') <> 'boolean'
      or jsonb_typeof(field -> 'filterable') <> 'boolean'
      or jsonb_typeof(field -> 'label') <> 'object'
      or not (field -> 'label' ?& array['ca', 'es', 'en', 'ar', 'fa']) then
      return false;
    end if;

    if field_type in ('select', 'string-array')
      and (
        jsonb_typeof(field -> 'options') <> 'array'
        or jsonb_array_length(field -> 'options') = 0
        or exists (
          select 1 from jsonb_array_elements(field -> 'options') as option(value)
          where jsonb_typeof(option.value) <> 'string'
        )
      ) then
      return false;
    end if;

    if field ? 'minimum' and jsonb_typeof(field -> 'minimum') <> 'number' then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.is_service_metadata_valid(
  metadata jsonb,
  metadata_schema jsonb
)
returns boolean
language plpgsql
stable
parallel safe
security invoker
set search_path = ''
as $$
declare
  field jsonb;
  field_key text;
  field_type text;
  field_value jsonb;
begin
  if jsonb_typeof(metadata) <> 'object'
    or not public.is_service_metadata_schema_valid(metadata_schema) then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_object_keys(metadata) as metadata_key(key)
    where not exists (
      select 1
      from jsonb_array_elements(metadata_schema -> 'fields') as declared(field)
      where declared.field ->> 'key' = metadata_key.key
    )
  ) then
    return false;
  end if;

  for field in select value from jsonb_array_elements(metadata_schema -> 'fields') loop
    field_key := field ->> 'key';
    field_type := field ->> 'type';

    if (field ->> 'required')::boolean and not metadata ? field_key then
      return false;
    end if;
    if not metadata ? field_key then
      continue;
    end if;

    field_value := metadata -> field_key;
    case field_type
      when 'select' then
        if jsonb_typeof(field_value) <> 'string'
          or not (field -> 'options' @> jsonb_build_array(field_value)) then
          return false;
        end if;
      when 'string-array' then
        if jsonb_typeof(field_value) <> 'array'
          or jsonb_array_length(field_value) = 0
          or not (field -> 'options' @> field_value)
          or exists (
            select 1 from jsonb_array_elements(field_value) as item(value)
            where jsonb_typeof(item.value) <> 'string'
          ) then
          return false;
        end if;
      when 'boolean' then
        if jsonb_typeof(field_value) <> 'boolean' then
          return false;
        end if;
      when 'number' then
        if jsonb_typeof(field_value) <> 'number'
          or (
            field ? 'minimum'
            and (field_value #>> '{}')::numeric < (field ->> 'minimum')::numeric
          ) then
          return false;
        end if;
      when 'text' then
        if jsonb_typeof(field_value) <> 'string'
          or length(btrim(field_value #>> '{}')) not between 1 and 2000 then
          return false;
        end if;
      when 'date' then
        if jsonb_typeof(field_value) <> 'string'
          or field_value #>> '{}' !~ '^\d{4}-\d{2}-\d{2}$' then
          return false;
        end if;
    end case;
  end loop;

  return true;
end;
$$;

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id()
    references public.organizations (id) on delete cascade,
  name jsonb not null,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  icon text not null check (length(btrim(icon)) > 0),
  color text not null check (length(btrim(color)) > 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  metadata_schema jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_categories_org_id_id_unique unique (org_id, id),
  constraint service_categories_org_id_slug_unique unique (org_id, slug),
  constraint service_categories_name_valid
    check (public.is_localized_content_valid(name, 200, true)),
  constraint service_categories_metadata_schema_valid
    check (public.is_service_metadata_schema_valid(metadata_schema))
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id()
    references public.organizations (id) on delete cascade,
  category_id uuid not null,
  title jsonb not null,
  description jsonb,
  provider_name text check (provider_name is null or length(btrim(provider_name)) between 1 and 200),
  location text check (location is null or length(btrim(location)) between 1 and 500),
  zone text check (zone is null or length(btrim(zone)) between 1 and 200),
  cost_type text not null default 'free'
    check (cost_type in ('free', 'subsidized', 'paid', 'varies')),
  cost_amount numeric(12, 2) check (cost_amount is null or cost_amount >= 0),
  cost_details text check (cost_details is null or length(btrim(cost_details)) between 1 and 1000),
  contact_name text check (contact_name is null or length(btrim(contact_name)) between 1 and 200),
  contact_phone text check (contact_phone is null or length(btrim(contact_phone)) between 1 and 50),
  contact_email text check (
    contact_email is null
    or contact_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  contact_role text check (contact_role is null or length(btrim(contact_role)) between 1 and 200),
  schedule text check (schedule is null or length(btrim(schedule)) between 1 and 1000),
  external_url text check (external_url is null or external_url ~ '^https://'),
  availability text not null default 'available'
    check (availability in ('available', 'waiting_list', 'by_appointment', 'full')),
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'approved', 'rejected', 'published')),
  published_at timestamptz,
  expires_at timestamptz,
  submitted_by uuid references public.profiles (id) on delete set null
    deferrable initially deferred,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
    deferrable initially deferred,
  reviewed_by uuid references public.profiles (id) on delete set null
    deferrable initially deferred,
  reviewed_at timestamptz,
  rejection_reason text check (
    rejection_reason is null or length(btrim(rejection_reason)) between 1 and 2000
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_org_id_id_unique unique (org_id, id),
  constraint services_category_tenant_fkey
    foreign key (org_id, category_id)
    references public.service_categories (org_id, id) on delete restrict,
  constraint services_title_valid
    check (public.is_localized_content_valid(title, 200, false)),
  constraint services_description_valid
    check (description is null or public.is_localized_content_valid(description, 10000, false)),
  constraint services_cost_amount_consistent check (
    (cost_type = 'free' and cost_amount is null)
    or (cost_type in ('paid', 'subsidized') and cost_amount is not null)
    or cost_type = 'varies'
  ),
  constraint services_published_at_required
    check (status <> 'published' or published_at is not null),
  constraint services_expiry_after_publication check (
    expires_at is null
    or (published_at is not null and expires_at > published_at)
  ),
  constraint services_published_languages_complete check (
    status <> 'published'
    or (
      public.is_localized_content_valid(title, 200, true)
      and (
        description is null
        or public.is_localized_content_valid(description, 10000, true)
      )
    )
  ),
  constraint services_review_fields_consistent check (
    (status <> 'rejected' or rejection_reason is not null)
    and (
      status not in ('approved', 'rejected')
      or (reviewed_by is not null and reviewed_at is not null)
    )
  )
);

create table public.service_images (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id()
    references public.organizations (id) on delete cascade,
  service_id uuid not null,
  url text not null check (length(btrim(url)) > 0),
  alt_text jsonb not null,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  constraint service_images_service_position_unique unique (service_id, position),
  constraint service_images_service_tenant_fkey
    foreign key (org_id, service_id)
    references public.services (org_id, id) on delete cascade,
  constraint service_images_alt_text_valid
    check (public.is_localized_content_valid(alt_text, 500, false))
);

create table public.service_interests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id()
    references public.organizations (id) on delete cascade,
  service_id uuid not null,
  user_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade deferrable initially deferred,
  created_at timestamptz not null default now(),
  constraint service_interests_service_user_unique unique (service_id, user_id),
  constraint service_interests_service_tenant_fkey
    foreign key (org_id, service_id)
    references public.services (org_id, id) on delete cascade
);

comment on table public.service_categories is
  'Organization service categories. metadata_schema is the serializable contract used to render fields, validate metadata, and build JSONB filters.';
comment on table public.services is
  'Services and entity submissions share relational directory fields plus category-specific metadata validated against service_categories.metadata_schema.';
comment on table public.service_images is
  'Ordered service images with multilingual alternative text.';
comment on table public.service_interests is
  'A participant-owned signal that she wants to follow up on a published service.';

create or replace function private.validate_service_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  category_schema jsonb;
begin
  select category.metadata_schema
  into category_schema
  from public.service_categories as category
  where category.org_id = new.org_id and category.id = new.category_id;

  if category_schema is null
    or not public.is_service_metadata_valid(new.metadata, category_schema) then
    raise check_violation using message =
      'service metadata does not match the selected category definition';
  end if;
  return new;
end;
$$;

create or replace function private.prevent_invalid_service_category_schema_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.metadata_schema is distinct from old.metadata_schema
    and exists (
      select 1
      from public.services as service
      where service.org_id = old.org_id
        and service.category_id = old.id
        and not public.is_service_metadata_valid(service.metadata, new.metadata_schema)
    ) then
    raise check_violation using message =
      'category schema change would invalidate existing services';
  end if;
  return new;
end;
$$;

create or replace function private.enforce_service_status_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_role text := public.current_app_role();
  actor_id uuid := auth.uid();
  transition_allowed boolean;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    transition_allowed := case old.status
      when 'draft' then new.status in ('pending', 'published')
      when 'pending' then new.status in ('approved', 'rejected')
      when 'approved' then new.status in ('published', 'rejected')
      when 'rejected' then new.status in ('draft', 'pending')
      when 'published' then new.status = 'draft'
      else false
    end;
    if not transition_allowed then
      raise check_violation using message = 'invalid service status transition';
    end if;
  end if;

  if actor_role = 'entity' then
    if tg_op = 'INSERT' then
      if new.created_by is distinct from actor_id
        or new.submitted_by is distinct from actor_id
        or new.status not in ('draft', 'pending') then
        raise insufficient_privilege using message =
          'entities may create only their own draft or pending submissions';
      end if;
    else
      if old.submitted_by is distinct from actor_id
        or new.submitted_by is distinct from old.submitted_by
        or new.created_by is distinct from old.created_by
        or (
          new.status = old.status
          and old.status not in ('draft', 'rejected', 'published')
        )
        or (
          new.status is distinct from old.status
          and not (
            (old.status = 'draft' and new.status = 'pending')
            or (old.status = 'rejected' and new.status in ('draft', 'pending'))
          )
        ) then
        raise insufficient_privilege using message =
          'entities cannot review, approve, or publish submissions';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_service_metadata() from public, anon, authenticated;
revoke all on function private.prevent_invalid_service_category_schema_change()
  from public, anon, authenticated;
revoke all on function private.enforce_service_status_transition()
  from public, anon, authenticated;

create trigger service_categories_set_updated_at
  before update on public.service_categories
  for each row execute function public.set_updated_at();

create trigger service_categories_prevent_invalid_schema_change
  before update of metadata_schema on public.service_categories
  for each row execute function private.prevent_invalid_service_category_schema_change();

create trigger services_validate_metadata
  before insert or update of org_id, category_id, metadata on public.services
  for each row execute function private.validate_service_metadata();

create trigger services_enforce_status_transition
  before insert or update on public.services
  for each row execute function private.enforce_service_status_transition();

create trigger services_set_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

create index service_categories_org_sort_idx
  on public.service_categories (org_id, sort_order, slug);
create index services_org_category_visibility_idx
  on public.services (org_id, category_id, status, published_at, expires_at);
create index services_visible_directory_idx
  on public.services (org_id, category_id, zone, cost_type, availability, published_at desc)
  where status = 'published';
create index services_submitted_by_idx
  on public.services (org_id, submitted_by, status, updated_at desc)
  where submitted_by is not null;
create index services_created_by_idx
  on public.services (org_id, created_by)
  where created_by is not null;
create index services_reviewed_by_idx
  on public.services (org_id, reviewed_by)
  where reviewed_by is not null;
create index services_metadata_gin_idx
  on public.services using gin (metadata jsonb_path_ops);
create index service_images_org_service_idx
  on public.service_images (org_id, service_id, position);
create index service_interests_org_user_idx
  on public.service_interests (org_id, user_id, created_at desc);
create index service_interests_org_service_idx
  on public.service_interests (org_id, service_id, created_at desc);

alter table public.service_categories enable row level security;
alter table public.service_categories force row level security;
alter table public.services enable row level security;
alter table public.services force row level security;
alter table public.service_images enable row level security;
alter table public.service_images force row level security;
alter table public.service_interests enable row level security;
alter table public.service_interests force row level security;

create policy service_categories_select_org_members
  on public.service_categories for select to authenticated
  using (org_id = (select public.current_org_id()));

create policy service_categories_insert_org_staff
  on public.service_categories for insert to authenticated
  with check (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  );

create policy service_categories_update_org_staff
  on public.service_categories for update to authenticated
  using (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  )
  with check (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  );

create policy service_categories_delete_org_staff
  on public.service_categories for delete to authenticated
  using (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  );

create policy services_select_role_matrix
  on public.services for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.is_staff_or_admin())
      or public.is_content_visible(status, published_at, expires_at)
      or (
        (select public.current_app_role()) = 'entity'
        and submitted_by = (select auth.uid())
      )
    )
  );

create policy services_insert_staff_or_entity
  on public.services for insert to authenticated
  with check (
    org_id = (select public.current_org_id())
    and created_by = (select auth.uid())
    and (
      (select public.is_staff_or_admin())
      or (
        (select public.current_app_role()) = 'entity'
        and submitted_by = (select auth.uid())
        and status in ('draft', 'pending')
      )
    )
  );

create policy services_update_staff_or_own_entity_submission
  on public.services for update to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.is_staff_or_admin())
      or (
        (select public.current_app_role()) = 'entity'
        and submitted_by = (select auth.uid())
      )
    )
  )
  with check (
    org_id = (select public.current_org_id())
    and (
      (select public.is_staff_or_admin())
      or (
        (select public.current_app_role()) = 'entity'
        and submitted_by = (select auth.uid())
      )
    )
  );

create policy services_delete_staff_or_own_editable_entity_submission
  on public.services for delete to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.is_staff_or_admin())
      or (
        (select public.current_app_role()) = 'entity'
        and submitted_by = (select auth.uid())
        and status in ('draft', 'rejected')
      )
    )
  );

create policy service_images_select_with_parent_service
  on public.service_images for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and exists (
      select 1 from public.services as service
      where service.org_id = service_images.org_id
        and service.id = service_images.service_id
    )
  );

create policy service_images_insert_staff_or_own_entity_service
  on public.service_images for insert to authenticated
  with check (
    org_id = (select public.current_org_id())
    and exists (
      select 1 from public.services as service
      where service.org_id = service_images.org_id
        and service.id = service_images.service_id
        and (
          (select public.is_staff_or_admin())
          or service.submitted_by = (select auth.uid())
        )
    )
  );

create policy service_images_update_staff_or_own_entity_service
  on public.service_images for update to authenticated
  using (
    org_id = (select public.current_org_id())
    and exists (
      select 1 from public.services as service
      where service.org_id = service_images.org_id
        and service.id = service_images.service_id
        and (
          (select public.is_staff_or_admin())
          or service.submitted_by = (select auth.uid())
        )
    )
  )
  with check (
    org_id = (select public.current_org_id())
    and exists (
      select 1 from public.services as service
      where service.org_id = service_images.org_id
        and service.id = service_images.service_id
        and (
          (select public.is_staff_or_admin())
          or service.submitted_by = (select auth.uid())
        )
    )
  );

create policy service_images_delete_staff_or_own_entity_service
  on public.service_images for delete to authenticated
  using (
    org_id = (select public.current_org_id())
    and exists (
      select 1 from public.services as service
      where service.org_id = service_images.org_id
        and service.id = service_images.service_id
        and (
          (select public.is_staff_or_admin())
          or service.submitted_by = (select auth.uid())
        )
    )
  );

create policy service_interests_select_self_or_staff
  on public.service_interests for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.is_staff_or_admin())
      or user_id = (select auth.uid())
    )
  );

create policy service_interests_insert_player_self
  on public.service_interests for insert to authenticated
  with check (
    org_id = (select public.current_org_id())
    and (select public.current_app_role()) = 'player'
    and user_id = (select auth.uid())
    and exists (
      select 1 from public.services as service
      where service.org_id = service_interests.org_id
        and service.id = service_interests.service_id
        and public.is_content_visible(service.status, service.published_at, service.expires_at)
    )
  );

create policy service_interests_delete_player_self
  on public.service_interests for delete to authenticated
  using (
    org_id = (select public.current_org_id())
    and (select public.current_app_role()) = 'player'
    and user_id = (select auth.uid())
  );

revoke all on table public.service_categories from anon, authenticated;
revoke all on table public.services from anon, authenticated;
revoke all on table public.service_images from anon, authenticated;
revoke all on table public.service_interests from anon, authenticated;

grant select on table public.service_categories, public.services,
  public.service_images, public.service_interests to authenticated;
grant insert (name, slug, icon, color, sort_order, metadata_schema)
  on table public.service_categories to authenticated;
grant update (name, slug, icon, color, sort_order, metadata_schema)
  on table public.service_categories to authenticated;
grant delete on table public.service_categories to authenticated;

grant insert (
  category_id, title, description, provider_name, location, zone,
  cost_type, cost_amount, cost_details, contact_name, contact_phone,
  contact_email, contact_role, schedule, external_url, availability,
  metadata, status, published_at, expires_at, submitted_by, created_by,
  reviewed_by, reviewed_at, rejection_reason
) on table public.services to authenticated;
grant update (
  category_id, title, description, provider_name, location, zone,
  cost_type, cost_amount, cost_details, contact_name, contact_phone,
  contact_email, contact_role, schedule, external_url, availability,
  metadata, status, published_at, expires_at, submitted_by, created_by,
  reviewed_by, reviewed_at, rejection_reason
) on table public.services to authenticated;
grant delete on table public.services to authenticated;

grant insert (service_id, url, alt_text, position)
  on table public.service_images to authenticated;
grant update (url, alt_text, position)
  on table public.service_images to authenticated;
grant delete on table public.service_images to authenticated;

grant insert (service_id) on table public.service_interests to authenticated;
grant delete on table public.service_interests to authenticated;

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
    ('organizations', null, 'not_personal',
     'A tenant, not a person. No participant column exists to purge.'),
    ('municipality_catalog', null, 'not_personal',
     'Official IDESCAT administrative geography; it contains no participant data.');
$$;

comment on function public.personal_data_disposition is
  'What happens to each table when a participant is erased. Every table in public must appear; pgTAP fails when one does not, and delete_participant_permanently() sweeps from this list at runtime so the registry and the behaviour cannot drift apart.';
