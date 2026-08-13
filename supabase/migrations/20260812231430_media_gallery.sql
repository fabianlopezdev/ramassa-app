-- Tenant-safe media gallery with consent, privacy, moderation, and two-phase object deletion (RAPP-52).

create table public.media_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  uploaded_by uuid not null,
  uploader_first_name text not null check (length(btrim(uploader_first_name)) between 1 and 100),
  file_url text not null check (
    file_url ~ '^[0-9a-f-]+/gallery/[0-9a-f-]+/[0-9]{4}/[0-9]{2}/[0-9a-f]{32}\.(jpg|png|webp|mp4|mov|pdf)$'
  ),
  thumbnail_url text check (
    thumbnail_url is null
    or thumbnail_url ~ '^[0-9a-f-]+/gallery/[0-9a-f-]+/[0-9]{4}/[0-9]{2}/[0-9a-f]{32}\.(jpg|png|webp)$'
  ),
  file_type text not null check (file_type in ('image', 'video')),
  file_size integer not null check (
    file_size > 0
    and (
      (file_type = 'image' and file_size <= 1048576)
      or (file_type = 'video' and file_size <= 10485760)
    )
  ),
  caption text check (caption is null or length(btrim(caption)) between 1 and 500),
  privacy_level text not null check (privacy_level in ('community', 'staff_only')),
  moderation_state text not null default 'visible'
    check (moderation_state in ('visible', 'hidden_pending_review', 'hidden')),
  flag_count integer not null default 0 check (flag_count >= 0),
  consent_acknowledged_at timestamptz not null,
  consent_version text not null check (length(btrim(consent_version)) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_items_org_id_id_unique unique (org_id, id),
  constraint media_items_uploader_tenant_fkey
    foreign key (org_id, uploaded_by)
    references public.profiles (org_id, id) on delete cascade
);

comment on table public.media_items is
  'Participant gallery records. file_url and thumbnail_url are private R2 object keys, never public URLs.';
comment on column public.media_items.consent_acknowledged_at is
  'Server-recorded time when the uploader confirmed that depicted people agreed to sharing.';

create index media_items_gallery_idx
  on public.media_items (org_id, moderation_state, privacy_level, created_at desc, id desc);
create index media_items_uploader_idx
  on public.media_items (uploaded_by, created_at desc, id desc);
create unique index media_items_file_object_key_idx on public.media_items (file_url);
create unique index media_items_thumbnail_object_key_idx
  on public.media_items (thumbnail_url) where thumbnail_url is not null;

create trigger media_items_set_updated_at
  before update on public.media_items
  for each row execute function public.set_updated_at();

alter table public.media_items enable row level security;
alter table public.media_items force row level security;

create policy media_items_select_tenant_privacy
  on public.media_items for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.is_staff_or_admin())
      or (
        moderation_state = 'visible'
        and (uploaded_by = (select auth.uid()) or privacy_level = 'community')
      )
    )
  );

create policy media_items_update_staff_moderation
  on public.media_items for update to authenticated
  using (org_id = (select public.current_org_id()) and (select public.is_staff_or_admin()))
  with check (org_id = (select public.current_org_id()) and (select public.is_staff_or_admin()));

revoke all on table public.media_items from public, anon, authenticated;
grant select, update on table public.media_items to authenticated;

create or replace function public.can_read_media_object(p_object_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with matching as (
    select item.*
    from public.media_items item
    where item.file_url = p_object_key or item.thumbnail_url = p_object_key
  ), authorized as (
    select item.id
    from matching item
    where item.org_id = (select public.current_org_id())
      and (
        (select public.is_staff_or_admin())
        or (
          item.moderation_state = 'visible'
          and (item.uploaded_by = (select auth.uid()) or item.privacy_level = 'community')
        )
      )
  )
  select exists (select 1 from matching)
    and not exists (
      select 1 from matching item
      where not exists (select 1 from authorized visible where visible.id = item.id)
    );
$$;

revoke all on function public.can_read_media_object(text) from public;
grant execute on function public.can_read_media_object(text) to authenticated;

create or replace function public.create_media_item(
  p_file_url text,
  p_thumbnail_url text,
  p_file_type text,
  p_file_size integer,
  p_caption text,
  p_privacy_level text,
  p_consent_acknowledged boolean,
  p_consent_version text
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
    consent_acknowledged_at, consent_version
  ) values (
    actor_org, actor, actor_first_name, p_file_url, p_thumbnail_url,
    p_file_type, p_file_size, nullif(btrim(p_caption), ''), p_privacy_level,
    now(), btrim(p_consent_version)
  ) returning id into result;
  return result;
end;
$$;

create or replace function public.set_media_item_privacy(
  p_media_item_id uuid,
  p_privacy_level text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
begin
  if p_privacy_level not in ('community', 'staff_only') then
    raise exception 'invalid media privacy' using errcode = 'check_violation';
  end if;

  update public.media_items
  set privacy_level = p_privacy_level
  where id = p_media_item_id
    and org_id = actor_org
    and (uploaded_by = (select auth.uid()) or (select public.is_staff_or_admin()));
  if not found then
    raise exception 'media privacy action denied' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function public.prepare_media_item_deletion(p_media_item_id uuid)
returns table (file_object_key text, thumbnail_object_key text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select item.file_url, item.thumbnail_url
  from public.media_items as item
  where item.id = p_media_item_id
    and item.org_id = (select public.current_org_id())
    and (item.uploaded_by = (select auth.uid()) or (select public.is_staff_or_admin()));
  if not found then
    raise exception 'media deletion denied' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function public.complete_media_item_deletion(
  p_media_item_id uuid,
  p_file_object_key text,
  p_thumbnail_object_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.media_items as item
  where item.id = p_media_item_id
    and item.org_id = (select public.current_org_id())
    and (item.uploaded_by = (select auth.uid()) or (select public.is_staff_or_admin()))
    and item.file_url = p_file_object_key
    and item.thumbnail_url is not distinct from p_thumbnail_object_key;
  if not found then
    raise exception 'media deletion denied or object keys differ'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

revoke all on function public.create_media_item(text, text, text, integer, text, text, boolean, text)
  from public, anon, authenticated;
revoke all on function public.set_media_item_privacy(uuid, text)
  from public, anon, authenticated;
revoke all on function public.prepare_media_item_deletion(uuid)
  from public, anon, authenticated;
revoke all on function public.complete_media_item_deletion(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.create_media_item(text, text, text, integer, text, text, boolean, text)
  to authenticated;
grant execute on function public.set_media_item_privacy(uuid, text) to authenticated;
grant execute on function public.prepare_media_item_deletion(uuid) to authenticated;
grant execute on function public.complete_media_item_deletion(uuid, text, text) to authenticated;

alter table public.forum_flags
  add column media_id uuid;
alter table public.forum_flags
  add constraint forum_flags_media_tenant_fkey
  foreign key (org_id, media_id)
  references public.media_items (org_id, id) on delete cascade;
alter table public.forum_flags
  drop constraint forum_flags_target_type_check;
alter table public.forum_flags
  add constraint forum_flags_target_type_check check (target_type in ('post', 'reply', 'media'));
alter table public.forum_flags
  drop constraint forum_flags_target_shape_check;
alter table public.forum_flags
  add constraint forum_flags_target_shape_check check (
    (target_type = 'post' and post_id is not null and reply_id is null and media_id is null)
    or (target_type = 'reply' and reply_id is not null and post_id is null and media_id is null)
    or (target_type = 'media' and media_id is not null and post_id is null and reply_id is null)
  );
create unique index forum_flags_flagger_media_unique
  on public.forum_flags (flagger_id, media_id) where media_id is not null;
create index forum_flags_media_pending_idx
  on public.forum_flags (media_id, created_at, id)
  where state = 'pending' and media_id is not null;

create or replace function private.set_forum_flag_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid;
  actor_role text;
  target_org uuid;
  target_author uuid;
begin
  select profile.org_id, profile.role
  into actor_org, actor_role
  from public.profiles as profile
  where profile.id = actor and profile.is_active;

  if actor_org is null or actor_role <> 'player' then
    raise exception 'forum flagging is available to active players'
      using errcode = 'insufficient_privilege';
  end if;

  if new.target_type = 'post' then
    select post.org_id, post.author_id into target_org, target_author
    from public.forum_posts as post
    where post.id = new.post_id and post.visibility = 'visible';
    new.reply_id := null;
    new.media_id := null;
  elsif new.target_type = 'reply' then
    select reply.org_id, reply.author_id into target_org, target_author
    from public.forum_replies as reply
    join public.forum_posts as post on post.org_id = reply.org_id and post.id = reply.post_id
    where reply.id = new.reply_id and reply.visibility = 'visible' and post.visibility = 'visible';
    new.post_id := null;
    new.media_id := null;
  elsif new.target_type = 'media' then
    select item.org_id, item.uploaded_by into target_org, target_author
    from public.media_items as item
    where item.id = new.media_id
      and item.privacy_level = 'community'
      and item.moderation_state = 'visible';
    new.post_id := null;
    new.reply_id := null;
  else
    raise exception 'invalid forum flag target' using errcode = 'invalid_parameter_value';
  end if;

  if target_org is null or target_org <> actor_org or target_author = actor then
    raise exception 'forum flag target is not available' using errcode = 'insufficient_privilege';
  end if;

  new.org_id := actor_org;
  new.flagger_id := actor;
  new.comment := nullif(btrim(new.comment), '');
  new.state := 'pending';
  new.reviewed_at := null;
  new.reviewed_by := null;
  return new;
end;
$$;

create or replace function private.apply_forum_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  publication_id uuid;
begin
  if new.target_type = 'post' then
    update public.forum_posts
    set flag_count = flag_count + 1,
      visibility = case when visibility = 'visible' and flag_count + 1 >= 3
        then 'hidden_pending_review' else visibility end
    where org_id = new.org_id and id = new.post_id;
  elsif new.target_type = 'reply' then
    update public.forum_replies
    set flag_count = flag_count + 1,
      visibility = case when visibility = 'visible' and flag_count + 1 >= 3
        then 'hidden_pending_review' else visibility end
    where org_id = new.org_id and id = new.reply_id;
  else
    update public.media_items
    set flag_count = flag_count + 1,
      moderation_state = case when moderation_state = 'visible' and flag_count + 1 >= 3
        then 'hidden_pending_review' else moderation_state end
    where org_id = new.org_id and id = new.media_id;
  end if;

  insert into public.push_publications (org_id, content_type, content_id, scheduled_for, state)
  values (new.org_id, 'forum_flag', new.id, new.created_at, 'processing')
  on conflict (content_type, content_id) do nothing
  returning id into publication_id;

  if publication_id is not null then
    insert into public.push_deliveries (
      org_id, publication_id, push_token_id, recipient_id, language, next_attempt_at
    )
    select new.org_id, publication_id, push_token.id, profile.id,
      case when profile.preferred_language in ('ca', 'es', 'en', 'ar', 'fa')
        then profile.preferred_language else 'ca' end,
      new.created_at
    from public.profiles as profile
    join public.push_tokens as push_token on push_token.user_id = profile.id
    where profile.org_id = new.org_id
      and profile.role in ('staff', 'admin')
      and profile.is_active
      and profile.push_notifications_enabled
    on conflict on constraint push_deliveries_publication_token_unique do nothing;
    perform private.invoke_push_dispatch('forum_flag');
  end if;
  return new;
end;
$$;

create or replace function public.flag_forum_content(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_comment text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare result uuid;
begin
  insert into public.forum_flags (
    org_id, flagger_id, target_type, post_id, reply_id, media_id, reason, comment
  ) values (
    (select public.current_org_id()), (select auth.uid()), p_target_type,
    case when p_target_type = 'post' then p_target_id end,
    case when p_target_type = 'reply' then p_target_id end,
    case when p_target_type = 'media' then p_target_id end,
    p_reason, p_comment
  ) returning id into result;
  return result;
end;
$$;

drop function public.list_forum_moderation_queue();
create function public.list_forum_moderation_queue()
returns table (
  target_type text,
  target_id uuid,
  post_id uuid,
  author_id uuid,
  author_first_name text,
  content text,
  visibility text,
  is_pinned boolean,
  category_id uuid,
  flag_count integer,
  first_flagged_at timestamptz,
  reasons jsonb,
  comments jsonb,
  media_file_url text,
  media_thumbnail_url text,
  media_file_type text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from (
    select 'post'::text, post.id, post.id, post.author_id, post.author_first_name,
      post.content, post.visibility, post.is_pinned, post.category_id,
      count(flag.id)::integer, min(flag.created_at),
      jsonb_agg(flag.reason order by flag.created_at, flag.id),
      coalesce(jsonb_agg(flag.comment order by flag.created_at, flag.id)
        filter (where flag.comment is not null), '[]'::jsonb),
      null::text, null::text, null::text
    from public.forum_posts as post
    join public.forum_flags as flag
      on flag.org_id = post.org_id and flag.post_id = post.id and flag.state = 'pending'
    where post.org_id = (select public.current_org_id()) and (select public.is_staff_or_admin())
    group by post.id
    union all
    select 'reply'::text, reply.id, reply.post_id, reply.author_id, reply.author_first_name,
      reply.content, reply.visibility, false, post.category_id,
      count(flag.id)::integer, min(flag.created_at),
      jsonb_agg(flag.reason order by flag.created_at, flag.id),
      coalesce(jsonb_agg(flag.comment order by flag.created_at, flag.id)
        filter (where flag.comment is not null), '[]'::jsonb),
      null::text, null::text, null::text
    from public.forum_replies as reply
    join public.forum_posts as post on post.org_id = reply.org_id and post.id = reply.post_id
    join public.forum_flags as flag
      on flag.org_id = reply.org_id and flag.reply_id = reply.id and flag.state = 'pending'
    where reply.org_id = (select public.current_org_id()) and (select public.is_staff_or_admin())
    group by reply.id, post.category_id
    union all
    select 'media'::text, item.id, null::uuid, item.uploaded_by, item.uploader_first_name,
      item.caption, item.moderation_state, false, null::uuid,
      count(flag.id)::integer, min(flag.created_at),
      jsonb_agg(flag.reason order by flag.created_at, flag.id),
      coalesce(jsonb_agg(flag.comment order by flag.created_at, flag.id)
        filter (where flag.comment is not null), '[]'::jsonb),
      item.file_url, item.thumbnail_url, item.file_type
    from public.media_items as item
    join public.forum_flags as flag
      on flag.org_id = item.org_id and flag.media_id = item.id and flag.state = 'pending'
    where item.org_id = (select public.current_org_id()) and (select public.is_staff_or_admin())
    group by item.id
  ) as queue(
    target_type, target_id, post_id, author_id, author_first_name, content,
    visibility, is_pinned, category_id, flag_count, first_flagged_at,
    reasons, comments, media_file_url, media_thumbnail_url, media_file_type
  )
  order by first_flagged_at, target_id;
$$;

create or replace function public.moderate_forum_target(
  p_target_type text,
  p_target_id uuid,
  p_action text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
begin
  if not (select public.is_staff_or_admin())
    or p_target_type not in ('post', 'reply', 'media')
    or p_action not in ('dismiss', 'hide', 'delete')
    or (p_target_type = 'media' and p_action = 'delete')
  then
    raise exception 'forum moderation action denied' using errcode = 'insufficient_privilege';
  end if;

  if p_target_type = 'post' then
    perform 1 from public.forum_posts where org_id = actor_org and id = p_target_id for update;
  elsif p_target_type = 'reply' then
    perform 1 from public.forum_replies where org_id = actor_org and id = p_target_id for update;
  else
    perform 1 from public.media_items where org_id = actor_org and id = p_target_id for update;
  end if;
  if not found then
    raise exception 'forum moderation target not found' using errcode = 'no_data_found';
  end if;

  update public.forum_flags
  set state = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
    reviewed_at = now(), reviewed_by = actor
  where org_id = actor_org and state = 'pending' and (
    (p_target_type = 'post' and post_id = p_target_id)
    or (p_target_type = 'reply' and reply_id = p_target_id)
    or (p_target_type = 'media' and media_id = p_target_id)
  );

  if p_target_type = 'post' then
    update public.forum_posts
    set visibility = case p_action
        when 'dismiss' then case when visibility = 'hidden_pending_review' then 'visible' else visibility end
        when 'hide' then case when visibility = 'deleted' then 'deleted' else 'hidden' end
        else 'deleted' end,
      content = case when p_action = 'delete' then null else content end,
      image_url = case when p_action = 'delete' then null else image_url end,
      is_pinned = case when p_action = 'delete' then false else is_pinned end,
      flag_count = 0
    where org_id = actor_org and id = p_target_id;
  elsif p_target_type = 'reply' then
    update public.forum_replies
    set visibility = case p_action
        when 'dismiss' then case when visibility = 'hidden_pending_review' then 'visible' else visibility end
        when 'hide' then case when visibility = 'deleted' then 'deleted' else 'hidden' end
        else 'deleted' end,
      content = case when p_action = 'delete' then null else content end,
      image_url = case when p_action = 'delete' then null else image_url end,
      flag_count = 0
    where org_id = actor_org and id = p_target_id;
  else
    update public.media_items
    set moderation_state = case p_action
        when 'dismiss' then case when moderation_state = 'hidden_pending_review'
          then 'visible' else moderation_state end
        else 'hidden' end,
      flag_count = 0
    where org_id = actor_org and id = p_target_id;
  end if;
end;
$$;

revoke all on function public.list_forum_moderation_queue() from public, anon, authenticated;
grant execute on function public.list_forum_moderation_queue() to authenticated;

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
    ('audit_log', 'actor_id', 'purge', 'Rows where the participant acted.'),
    ('audit_log', 'target_id', 'retain', 'Opaque lawful-access and erasure record.'),
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
