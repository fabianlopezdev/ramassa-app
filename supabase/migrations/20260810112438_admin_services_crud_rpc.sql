-- Atomic staff writes for RAPP-42. All functions are security invoker so the
-- existing table grants, RLS policies, tenant checks, metadata trigger, and
-- publication constraints remain the authority for every changed row.

create or replace function public.count_services_incompatible_with_category_schema(
  p_category_id uuid,
  p_metadata_schema jsonb
)
returns bigint
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  incompatible_count bigint;
begin
  if not public.is_staff_or_admin() then
    raise insufficient_privilege using message =
      'only staff may inspect service category migrations';
  end if;
  if not public.is_service_metadata_schema_valid(p_metadata_schema) then
    raise check_violation using message = 'invalid service metadata schema';
  end if;

  select count(*)
  into incompatible_count
  from public.services as service
  where service.org_id = public.current_org_id()
    and service.category_id = p_category_id
    and not public.is_service_metadata_valid(service.metadata, p_metadata_schema);

  return incompatible_count;
end;
$$;

create or replace function public.reorder_service_categories(p_category_ids uuid[])
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  category_count integer;
begin
  if not public.is_staff_or_admin() then
    raise insufficient_privilege using message = 'only staff may reorder service categories';
  end if;
  if p_category_ids is null or cardinality(p_category_ids) = 0 then
    raise check_violation using message = 'the complete category order is required';
  end if;
  if cardinality(p_category_ids) <> (
    select count(distinct category_id) from unnest(p_category_ids) as category_id
  ) then
    raise check_violation using message = 'category order contains duplicate ids';
  end if;

  select count(*)
  into category_count
  from public.service_categories as category
  where category.org_id = public.current_org_id();

  if cardinality(p_category_ids) <> category_count
    or exists (
      select 1
      from unnest(p_category_ids) as requested(category_id)
      where not exists (
        select 1
        from public.service_categories as category
        where category.org_id = public.current_org_id()
          and category.id = requested.category_id
      )
    ) then
    raise check_violation using message =
      'category order must contain every category in the current organization exactly once';
  end if;

  update public.service_categories as category
  set sort_order = requested.ordinality::integer * 10
  from unnest(p_category_ids) with ordinality as requested(category_id, ordinality)
  where category.org_id = public.current_org_id()
    and category.id = requested.category_id;
end;
$$;

create or replace function public.save_admin_service(p_payload jsonb)
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
    'schedule', 'externalUrl', 'availability', 'metadata', 'status',
    'publishedAt', 'expiresAt', 'images'
  ];
  saved_service_id uuid;
  selected_category_id uuid;
  publication_status text;
  images jsonb;
begin
  if not public.is_staff_or_admin() then
    raise insufficient_privilege using message =
      'only staff may create or edit directory services';
  end if;
  if jsonb_typeof(p_payload) <> 'object'
    or not p_payload ?& allowed_keys
    or p_payload - allowed_keys <> '{}'::jsonb then
    raise check_violation using message = 'invalid admin service payload shape';
  end if;

  selected_category_id := (p_payload ->> 'categoryId')::uuid;
  publication_status := p_payload ->> 'status';
  images := p_payload -> 'images';

  if publication_status not in ('draft', 'published') then
    raise check_violation using message = 'staff CRUD accepts only draft or published status';
  end if;
  if jsonb_typeof(images) <> 'array' or jsonb_array_length(images) > 12 then
    raise check_violation using message = 'services accept an array of at most twelve images';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(images) as image(value)
    where jsonb_typeof(image.value) <> 'object'
      or not image.value ?& array['url', 'altText']
      or image.value - array['url', 'altText'] <> '{}'::jsonb
      or length(btrim(image.value ->> 'url')) = 0
      or not public.is_localized_content_valid(
        image.value -> 'altText',
        500,
        publication_status = 'published'
      )
  ) then
    raise check_violation using message = 'invalid service image or multilingual alt text';
  end if;

  saved_service_id := nullif(p_payload ->> 'serviceId', '')::uuid;
  if saved_service_id is null then
    insert into public.services (
      category_id, title, description, provider_name, location, zone,
      cost_type, cost_amount, cost_details, contact_name, contact_phone,
      contact_email, contact_role, schedule, external_url, availability,
      metadata, status, published_at, expires_at, created_by
    ) values (
      selected_category_id,
      p_payload -> 'title',
      case
        when jsonb_typeof(p_payload -> 'description') = 'null' then null
        else p_payload -> 'description'
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
      publication_status,
      (p_payload ->> 'publishedAt')::timestamptz,
      (p_payload ->> 'expiresAt')::timestamptz,
      auth.uid()
    )
    returning id into saved_service_id;
  else
    update public.services as service
    set category_id = selected_category_id,
        title = p_payload -> 'title',
        description = case
          when jsonb_typeof(p_payload -> 'description') = 'null' then null
          else p_payload -> 'description'
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
        status = publication_status,
        published_at = (p_payload ->> 'publishedAt')::timestamptz,
        expires_at = (p_payload ->> 'expiresAt')::timestamptz
    where service.id = saved_service_id
      and service.org_id = public.current_org_id()
    returning service.id into saved_service_id;

    if not found then
      raise insufficient_privilege using message =
        'service is unavailable in the current organization';
    end if;
  end if;

  delete from public.service_images as image
  where image.service_id = saved_service_id
    and image.org_id = public.current_org_id();

  insert into public.service_images (service_id, url, alt_text, position)
  select
    saved_service_id,
    image.value ->> 'url',
    image.value -> 'altText',
    image.ordinality::integer - 1
  from jsonb_array_elements(images) with ordinality as image(value, ordinality);

  return saved_service_id;
end;
$$;

revoke all on function public.count_services_incompatible_with_category_schema(uuid, jsonb)
  from public, anon;
revoke all on function public.reorder_service_categories(uuid[]) from public, anon;
revoke all on function public.save_admin_service(jsonb) from public, anon;
grant execute on function public.count_services_incompatible_with_category_schema(uuid, jsonb)
  to authenticated;
grant execute on function public.reorder_service_categories(uuid[]) to authenticated;
grant execute on function public.save_admin_service(jsonb) to authenticated;

comment on function public.count_services_incompatible_with_category_schema(uuid, jsonb) is
  'Preflight count for the RAPP-42 category migration warning; the update trigger remains the final guard.';
comment on function public.reorder_service_categories(uuid[]) is
  'Atomically assigns deterministic sort positions to the complete current-organization category list.';
comment on function public.save_admin_service(jsonb) is
  'Atomic staff-only service and ordered-image save. RLS, constraints, and metadata triggers validate every write.';
