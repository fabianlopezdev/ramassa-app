-- Service publication times need services.publish (RAPP-360).
--
-- The permission catalog says services.publish is "Publish, schedule,
-- unpublish and delete services" and services.review is "Approve or reject the
-- services partner entities submit".
--
-- 1. The status trigger already needed services.publish when the status moves
--    to or from published. It now also needs it when a team member changes
--    published_at or expires_at, as private.guard_content_publish does for
--    announcements, events and knowledge.
-- 2. Approval needed services.review AND services.publish, because
--    review_entity_service publishes through save_admin_service. It now needs
--    services.review only: review_entity_service marks the one service it
--    approves with the transaction-local setting ramassa.service_review_approval,
--    and save_admin_service and the trigger accept that mark for that service.

CREATE OR REPLACE FUNCTION private.enforce_service_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
declare
  actor_role text := public.current_app_role();
  actor_id uuid := auth.uid();
  transition_allowed boolean;
  -- review_entity_service marks the one service it approves (RAPP-360).
  is_review_approval boolean := tg_op = 'UPDATE'
    and coalesce(current_setting('ramassa.service_review_approval', true), '') = new.id::text;
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

  -- Team members: publishing, scheduling or unpublishing needs
  -- services.publish, and approving or rejecting an entity submission needs
  -- services.review (RAPP-230). The publication times count as publishing, as
  -- in private.guard_content_publish, so services.edit alone cannot set an
  -- expiry or move the publish time of a service (RAPP-360). Approving an
  -- entity submission publishes it with services.review alone.
  if (select public.is_team_member()) and not is_review_approval then
    if (tg_op = 'INSERT' and new.status = 'published')
      or (tg_op = 'UPDATE' and new.status is distinct from old.status
        and 'published' in (new.status, old.status))
      or (tg_op = 'UPDATE' and (
        new.published_at is distinct from old.published_at
        or new.expires_at is distinct from old.expires_at))
    then
      if not (select public.has_permission('services.publish')) then
        raise insufficient_privilege using message = 'publishing a service needs services.publish';
      end if;
    end if;
    if tg_op = 'UPDATE' and new.status is distinct from old.status
      and old.status = 'pending' and new.status in ('approved', 'rejected')
      and not (select public.has_permission('services.review'))
    then
      raise insufficient_privilege using message = 'reviewing a submission needs services.review';
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

CREATE OR REPLACE FUNCTION public.review_entity_service(p_service_id uuid, p_decision text, p_payload jsonb, p_comment text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
declare
  reviewed_service public.services%rowtype;
  public_comment text := nullif(btrim(p_comment), '');
  public_comment_id uuid;
begin
  if not (select public.has_permission('services.review')) then
    raise insufficient_privilege using message =
      'only staff may review entity service submissions';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise check_violation using message = 'invalid entity service review decision';
  end if;
  if public_comment is not null and length(public_comment) > 4000 then
    raise check_violation using message = 'review comments accept at most 4000 characters';
  end if;
  if p_decision = 'reject' and public_comment is null then
    raise check_violation using message = 'rejection requires a human comment';
  end if;

  select service.*
  into reviewed_service
  from public.services as service
  where service.id = p_service_id
    and service.org_id = (select public.current_org_id())
    and service.submitted_by is not null
    and service.status = 'pending'
  for update;

  if not found then
    raise insufficient_privilege using message =
      'only a pending entity submission can be reviewed';
  end if;

  if p_decision = 'approve' then
    if jsonb_typeof(p_payload) <> 'object'
      or p_payload ->> 'serviceId' is distinct from p_service_id::text
      or p_payload ->> 'status' is distinct from 'published' then
      raise check_violation using message =
        'approval requires the reviewed service publication payload';
    end if;

    update public.services as service
    set status = 'approved',
        reviewed_by = (select auth.uid()),
        reviewed_at = now(),
        rejection_reason = null
    where service.id = reviewed_service.id;

    -- services.review alone publishes the approved submission (RAPP-360). The
    -- mark is transaction-local and names this one service. A client cannot
    -- set it: the API calls only functions in the exposed schemas, and
    -- set_config is not one of them.
    perform set_config('ramassa.service_review_approval', reviewed_service.id::text, true);
    perform public.save_admin_service(p_payload);
    perform set_config('ramassa.service_review_approval', '', true);

    if public_comment is not null then
      insert into public.service_submission_comments (
        service_id,
        body,
        is_internal
      ) values (
        reviewed_service.id,
        public_comment,
        false
      ) returning id into public_comment_id;
    end if;

    insert into public.service_submission_notifications (
      org_id,
      service_id,
      kind,
      created_by,
      recipient_id,
      decision_comment_id
    ) values (
      reviewed_service.org_id,
      reviewed_service.id,
      'approved',
      (select auth.uid()),
      reviewed_service.submitted_by,
      public_comment_id
    );

    return reviewed_service.id;
  end if;

  if p_payload is not null then
    raise check_violation using message = 'rejection does not accept a service payload';
  end if;

  update public.services as service
  set status = 'rejected',
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      rejection_reason = public_comment
  where service.id = reviewed_service.id;

  insert into public.service_submission_comments (
    service_id,
    body,
    is_internal
  ) values (
    reviewed_service.id,
    public_comment,
    false
  ) returning id into public_comment_id;

  insert into public.service_submission_notifications (
    org_id,
    service_id,
    kind,
    created_by,
    recipient_id,
    decision_comment_id
  ) values (
    reviewed_service.org_id,
    reviewed_service.id,
    'rejected',
    (select auth.uid()),
    reviewed_service.submitted_by,
    public_comment_id
  );

  return reviewed_service.id;
end;
$$;

CREATE OR REPLACE FUNCTION public.save_admin_service(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
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
  if not (
    public.has_permission('services.edit')
    or public.has_permission('services.publish')
    or (
      p_payload ->> 'serviceId' is not null
      and coalesce(current_setting('ramassa.service_review_approval', true), '') = p_payload ->> 'serviceId'
    )
  ) then
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
