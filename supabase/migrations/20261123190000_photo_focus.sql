-- The part of a photo that stays visible when a card, a tile or the photo at
-- the top of a screen crops it (RAPP-932).
--
-- Whoever adds a photo may choose a focus point: two numbers between 0 and 1,
-- across and down the photo. Null on both means no choice, and the apps keep
-- the top third of a tall photo and the middle of a wide one. The columns sit
-- beside each stored photo shown cropped: an avís, a forum post, the cover of
-- a guide or a story, each photo of a service and each gallery item.
--
-- Write rules follow the photo's own: whoever may write `image_url` (or the
-- image row) may write its focus, through the same column grants, policies,
-- triggers and functions. No new policy.

-- 1. The columns, each pair with one check: both null, or both set inside the photo.
alter table public.announcements
  add column image_focus_x real,
  add column image_focus_y real,
  add constraint announcements_image_focus_valid check (
    (image_focus_x is null) = (image_focus_y is null)
    and (image_focus_x is null or (image_focus_x between 0 and 1 and image_focus_y between 0 and 1))
  );

alter table public.forum_posts
  add column image_focus_x real,
  add column image_focus_y real,
  add constraint forum_posts_image_focus_valid check (
    (image_focus_x is null) = (image_focus_y is null)
    and (image_focus_x is null or (image_focus_x between 0 and 1 and image_focus_y between 0 and 1))
  );

alter table public.knowledge_articles
  add column image_focus_x real,
  add column image_focus_y real,
  add constraint knowledge_articles_image_focus_valid check (
    (image_focus_x is null) = (image_focus_y is null)
    and (image_focus_x is null or (image_focus_x between 0 and 1 and image_focus_y between 0 and 1))
  );

alter table public.service_images
  add column focus_x real,
  add column focus_y real,
  add constraint service_images_focus_valid check (
    (focus_x is null) = (focus_y is null)
    and (focus_x is null or (focus_x between 0 and 1 and focus_y between 0 and 1))
  );

alter table public.media_items
  add column focus_x real,
  add column focus_y real,
  add constraint media_items_focus_valid check (
    (focus_x is null) = (focus_y is null)
    and (focus_x is null or (focus_x between 0 and 1 and focus_y between 0 and 1))
  );

comment on column public.announcements.image_focus_x is
  'RAPP-932: across the photo, 0 left to 1 right, the point a cropped photo keeps in view. Null with image_focus_y: the default crop.';
comment on column public.announcements.image_focus_y is
  'RAPP-932: down the photo, 0 top to 1 bottom, the point a cropped photo keeps in view.';
comment on column public.forum_posts.image_focus_x is
  'RAPP-932: across the photo, 0 left to 1 right, the point a cropped photo keeps in view. Null with image_focus_y: the default crop.';
comment on column public.forum_posts.image_focus_y is
  'RAPP-932: down the photo, 0 top to 1 bottom, the point a cropped photo keeps in view.';
comment on column public.knowledge_articles.image_focus_x is
  'RAPP-932: across the cover photo, 0 left to 1 right, the point a cropped photo keeps in view. Null with image_focus_y: the default crop.';
comment on column public.knowledge_articles.image_focus_y is
  'RAPP-932: down the cover photo, 0 top to 1 bottom, the point a cropped photo keeps in view.';
comment on column public.service_images.focus_x is
  'RAPP-932: across the photo, 0 left to 1 right, the point a cropped photo keeps in view. Null with focus_y: the default crop.';
comment on column public.service_images.focus_y is
  'RAPP-932: down the photo, 0 top to 1 bottom, the point a cropped photo keeps in view.';
comment on column public.media_items.focus_x is
  'RAPP-932: across the photo, 0 left to 1 right, the point a cropped tile keeps in view. Null with focus_y: the default crop. Set at upload only.';
comment on column public.media_items.focus_y is
  'RAPP-932: down the photo, 0 top to 1 bottom, the point a cropped tile keeps in view.';

-- 2. Column grants: the focus is writable exactly where the photo is.
--    forum_posts has table-wide grants already; media_items is written only
--    by create_media_item, so its focus gets no direct write grant.
grant insert (image_focus_x, image_focus_y), update (image_focus_x, image_focus_y)
  on public.announcements to authenticated;
grant insert (image_focus_x, image_focus_y), update (image_focus_x, image_focus_y)
  on public.knowledge_articles to authenticated;
grant insert (focus_x, focus_y), update (focus_x, focus_y)
  on public.service_images to authenticated;

-- 3. A forum post: the focus is protected like the photo itself. Her own
--    visible post cannot change it, and a post that loses its photo (deleted
--    by her or by moderation) loses its focus too.
create or replace function private.guard_forum_post_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.image_url is null then
    new.image_focus_x := null;
    new.image_focus_y := null;
  end if;

  if pg_trigger_depth() > 1
    or (select auth.uid()) is null
    or (select public.has_permission('forum.moderate'))
  then
    return new;
  end if;

  if old.author_id <> (select auth.uid())
    or new.org_id is distinct from old.org_id
    or new.category_id is distinct from old.category_id
    or new.author_id is distinct from old.author_id
    or new.author_first_name is distinct from old.author_first_name
    or new.is_pinned is distinct from old.is_pinned
    or new.flag_count is distinct from old.flag_count
    or new.reply_count is distinct from old.reply_count
    or new.created_at is distinct from old.created_at
    or old.visibility <> 'visible'
    or new.visibility not in ('visible', 'deleted')
    or (new.visibility = 'visible' and new.image_url is distinct from old.image_url)
    or (new.visibility = 'visible' and (
      new.image_focus_x is distinct from old.image_focus_x
      or new.image_focus_y is distinct from old.image_focus_y
    ))
    or (new.visibility = 'deleted' and (new.content is not null or new.image_url is not null))
  then
    raise exception 'forum post ownership or protected columns rejected'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- 4. Creating a forum post takes the focus with the photo. The old three
--    argument form is replaced, so PostgREST sees one function.
drop function public.create_forum_post(uuid, text, text);

create function public.create_forum_post(
  p_category_id uuid,
  p_content text,
  p_image_url text,
  p_image_focus_x real default null,
  p_image_focus_y real default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  result uuid;
  stored_image_url text := nullif(btrim(p_image_url), '');
begin
  insert into public.forum_posts (
    org_id, category_id, author_id, author_first_name, content, image_url,
    image_focus_x, image_focus_y
  ) values (
    (select public.current_org_id()),
    p_category_id,
    (select auth.uid()),
    'pending',
    nullif(btrim(p_content), ''),
    stored_image_url,
    case when stored_image_url is null then null else p_image_focus_x end,
    case when stored_image_url is null then null else p_image_focus_y end
  ) returning id into result;
  return result;
end;
$$;

revoke all on function public.create_forum_post(uuid, text, text, real, real) from public, anon;
grant execute on function public.create_forum_post(uuid, text, text, real, real)
  to authenticated, service_role;

-- 5. A gallery upload takes the focus with the photo.
drop function public.create_media_item(text, text, text, integer, text, text, boolean, text);

create function public.create_media_item(
  p_file_url text,
  p_thumbnail_url text,
  p_file_type text,
  p_file_size integer,
  p_caption text,
  p_privacy_level text,
  p_consent_acknowledged boolean,
  p_consent_version text,
  p_focus_x real default null,
  p_focus_y real default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid;
  actor_first_name text;
  result uuid;
  expected_prefix text;
begin
  select profile.org_id, profile.first_name
  into actor_org, actor_first_name
  from public.profiles as profile
  where profile.id = actor
    and profile.is_active
    and profile.role in ('player', 'staff', 'admin');

  expected_prefix := actor_org::text || '/gallery/' || actor::text || '/';
  if actor_org is null
    or not p_consent_acknowledged
    or nullif(btrim(p_consent_version), '') is null
    or p_privacy_level not in ('community', 'staff_only')
    or p_file_type not in ('image', 'video')
    or p_file_size <= 0
    or (p_file_type = 'image' and p_file_size > 1048576)
    or (p_file_type = 'video' and p_file_size > 10485760)
    or p_file_url not like expected_prefix || '%'
    or p_file_url like '%..%'
    or (p_thumbnail_url is not null and (
      p_thumbnail_url not like expected_prefix || '%' or p_thumbnail_url like '%..%'
    ))
  then
    raise exception 'invalid media item or missing consent' using errcode = 'check_violation';
  end if;

  insert into public.media_items (
    org_id, uploaded_by, uploader_first_name, file_url, thumbnail_url,
    file_type, file_size, caption, privacy_level,
    consent_acknowledged_at, consent_version, focus_x, focus_y
  ) values (
    actor_org, actor, actor_first_name, p_file_url, p_thumbnail_url,
    p_file_type, p_file_size, nullif(btrim(p_caption), ''), p_privacy_level,
    now(), btrim(p_consent_version), p_focus_x, p_focus_y
  ) returning id into result;
  return result;
end;
$$;

revoke all on function public.create_media_item(
  text, text, text, integer, text, text, boolean, text, real, real
) from public, anon;
grant execute on function public.create_media_item(
  text, text, text, integer, text, text, boolean, text, real, real
) to authenticated, service_role;

-- 6. A service's photos carry their focus in the staff save. `focus` is
--    optional on each image: null or {x, y}; a missing key stores no focus.
create or replace function public.save_admin_service(p_payload jsonb)
returns uuid
language plpgsql
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
      or image.value - array['url', 'altText', 'focus'] <> '{}'::jsonb
      or length(btrim(image.value ->> 'url')) = 0
      or not public.is_localized_content_valid(
        image.value -> 'altText',
        500,
        publication_status = 'published'
      )
      or coalesce(jsonb_typeof(image.value -> 'focus'), 'null') not in ('null', 'object')
      or (
        jsonb_typeof(image.value -> 'focus') = 'object'
        and (
          (image.value -> 'focus') - array['x', 'y'] <> '{}'::jsonb
          or coalesce(jsonb_typeof(image.value -> 'focus' -> 'x'), '') <> 'number'
          or coalesce(jsonb_typeof(image.value -> 'focus' -> 'y'), '') <> 'number'
        )
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

  insert into public.service_images (service_id, url, alt_text, position, focus_x, focus_y)
  select
    saved_service_id,
    image.value ->> 'url',
    image.value -> 'altText',
    image.ordinality::integer - 1,
    (image.value -> 'focus' ->> 'x')::real,
    (image.value -> 'focus' ->> 'y')::real
  from jsonb_array_elements(images) with ordinality as image(value, ordinality);

  return saved_service_id;
end;
$$;
