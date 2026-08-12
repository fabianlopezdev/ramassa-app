-- Forum flags, atomic auto-hide, moderation, soft bans, and staff push (RAPP-51).

alter table public.forum_posts
  drop constraint forum_posts_visibility_check;
alter table public.forum_posts
  add constraint forum_posts_visibility_check
  check (visibility in ('visible', 'hidden_pending_review', 'hidden', 'deleted'));

alter table public.forum_replies
  drop constraint forum_replies_visibility_check;
alter table public.forum_replies
  add constraint forum_replies_visibility_check
  check (visibility in ('visible', 'hidden_pending_review', 'hidden', 'deleted'));
alter table public.forum_replies
  add constraint forum_replies_org_id_id_unique unique (org_id, id);

create table public.forum_flags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  flagger_id uuid not null,
  target_type text not null check (target_type in ('post', 'reply')),
  post_id uuid,
  reply_id uuid,
  reason text not null check (
    reason in ('harassment', 'hate', 'violence', 'sexual', 'privacy', 'spam', 'other')
  ),
  comment text,
  state text not null default 'pending' check (state in ('pending', 'dismissed', 'actioned')),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint forum_flags_org_id_id_unique unique (org_id, id),
  constraint forum_flags_flagger_tenant_fkey
    foreign key (org_id, flagger_id)
    references public.profiles (org_id, id) on delete cascade,
  constraint forum_flags_post_tenant_fkey
    foreign key (org_id, post_id)
    references public.forum_posts (org_id, id) on delete cascade,
  constraint forum_flags_reply_tenant_fkey
    foreign key (org_id, reply_id)
    references public.forum_replies (org_id, id) on delete cascade,
  constraint forum_flags_target_shape_check check (
    (target_type = 'post' and post_id is not null and reply_id is null)
    or (target_type = 'reply' and reply_id is not null and post_id is null)
  ),
  constraint forum_flags_comment_check check (
    comment is null or length(btrim(comment)) between 1 and 500
  ),
  constraint forum_flags_review_shape_check check (
    (state = 'pending' and reviewed_at is null and reviewed_by is null)
    or (state <> 'pending' and reviewed_at is not null and reviewed_by is not null)
  )
);

comment on table public.forum_flags is
  'Player safety reports. Flaggers are visible only to themselves and same-organization staff.';
comment on column public.forum_flags.comment is
  'Optional player context for staff. It is never exposed to other players or copied into push.';

create unique index forum_flags_flagger_post_unique
  on public.forum_flags (flagger_id, post_id)
  where post_id is not null;
create unique index forum_flags_flagger_reply_unique
  on public.forum_flags (flagger_id, reply_id)
  where reply_id is not null;
create index forum_flags_pending_queue_idx
  on public.forum_flags (org_id, created_at, id)
  where state = 'pending';
create index forum_flags_post_pending_idx
  on public.forum_flags (post_id, created_at, id)
  where state = 'pending' and post_id is not null;
create index forum_flags_reply_pending_idx
  on public.forum_flags (reply_id, created_at, id)
  where state = 'pending' and reply_id is not null;
create index forum_flags_reviewed_by_idx
  on public.forum_flags (reviewed_by, reviewed_at, id)
  where reviewed_by is not null;

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
    select post.org_id, post.author_id
    into target_org, target_author
    from public.forum_posts as post
    where post.id = new.post_id and post.visibility = 'visible';
    new.reply_id := null;
  elsif new.target_type = 'reply' then
    select reply.org_id, reply.author_id
    into target_org, target_author
    from public.forum_replies as reply
    join public.forum_posts as post
      on post.org_id = reply.org_id and post.id = reply.post_id
    where reply.id = new.reply_id
      and reply.visibility = 'visible'
      and post.visibility = 'visible';
    new.post_id := null;
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

create trigger forum_flags_set_context
  before insert on public.forum_flags
  for each row execute function private.set_forum_flag_context();

alter table public.push_publications
  drop constraint push_publications_content_type_check;
alter table public.push_publications
  add constraint push_publications_content_type_check
  check (content_type in ('announcement', 'event', 'message', 'forum_flag'));

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
    set
      flag_count = flag_count + 1,
      visibility = case
        when visibility = 'visible' and flag_count + 1 >= 3 then 'hidden_pending_review'
        else visibility
      end
    where org_id = new.org_id and id = new.post_id;
  else
    update public.forum_replies
    set
      flag_count = flag_count + 1,
      visibility = case
        when visibility = 'visible' and flag_count + 1 >= 3 then 'hidden_pending_review'
        else visibility
      end
    where org_id = new.org_id and id = new.reply_id;
  end if;

  insert into public.push_publications (
    org_id, content_type, content_id, scheduled_for, state
  ) values (
    new.org_id, 'forum_flag', new.id, new.created_at, 'processing'
  )
  on conflict (content_type, content_id) do nothing
  returning id into publication_id;

  if publication_id is not null then
    insert into public.push_deliveries (
      org_id, publication_id, push_token_id, recipient_id, language, next_attempt_at
    )
    select
      new.org_id,
      publication_id,
      push_token.id,
      profile.id,
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

create trigger forum_flags_apply
  after insert on public.forum_flags
  for each row execute function private.apply_forum_flag();

alter table public.forum_flags enable row level security;
alter table public.forum_flags force row level security;

create policy forum_flags_select_own_or_staff
  on public.forum_flags for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (flagger_id = (select auth.uid()) or (select public.is_staff_or_admin()))
  );
create policy forum_flags_insert_player
  on public.forum_flags for insert to authenticated
  with check (
    org_id = (select public.current_org_id())
    and flagger_id = (select auth.uid())
    and (select public.current_app_role()) = 'player'
    and state = 'pending'
  );
create policy forum_flags_update_staff
  on public.forum_flags for update to authenticated
  using (org_id = (select public.current_org_id()) and (select public.is_staff_or_admin()))
  with check (org_id = (select public.current_org_id()) and (select public.is_staff_or_admin()));

revoke all on table public.forum_flags from public, anon, authenticated;
grant select, insert, update on table public.forum_flags to authenticated;

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
declare
  result uuid;
begin
  insert into public.forum_flags (
    org_id, flagger_id, target_type, post_id, reply_id, reason, comment
  ) values (
    (select public.current_org_id()),
    (select auth.uid()),
    p_target_type,
    case when p_target_type = 'post' then p_target_id end,
    case when p_target_type = 'reply' then p_target_id end,
    p_reason,
    p_comment
  ) returning id into result;
  return result;
end;
$$;

create or replace function public.list_forum_moderation_queue()
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
  comments jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from (
    select
      'post'::text as target_type,
      post.id as target_id,
      post.id as post_id,
      post.author_id,
      post.author_first_name,
      post.content,
      post.visibility,
      post.is_pinned,
      post.category_id,
      count(flag.id)::integer as flag_count,
      min(flag.created_at) as first_flagged_at,
      jsonb_agg(flag.reason order by flag.created_at, flag.id) as reasons,
      coalesce(
        jsonb_agg(flag.comment order by flag.created_at, flag.id)
          filter (where flag.comment is not null),
        '[]'::jsonb
      ) as comments
    from public.forum_posts as post
    join public.forum_flags as flag
      on flag.org_id = post.org_id and flag.post_id = post.id and flag.state = 'pending'
    where post.org_id = (select public.current_org_id())
      and (select public.is_staff_or_admin())
    group by post.id
    union all
    select
      'reply'::text,
      reply.id,
      reply.post_id,
      reply.author_id,
      reply.author_first_name,
      reply.content,
      reply.visibility,
      false,
      post.category_id,
      count(flag.id)::integer,
      min(flag.created_at),
      jsonb_agg(flag.reason order by flag.created_at, flag.id),
      coalesce(
        jsonb_agg(flag.comment order by flag.created_at, flag.id)
          filter (where flag.comment is not null),
        '[]'::jsonb
      )
    from public.forum_replies as reply
    join public.forum_posts as post
      on post.org_id = reply.org_id and post.id = reply.post_id
    join public.forum_flags as flag
      on flag.org_id = reply.org_id and flag.reply_id = reply.id and flag.state = 'pending'
    where reply.org_id = (select public.current_org_id())
      and (select public.is_staff_or_admin())
    group by reply.id, post.category_id
  ) as queue
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
    or p_target_type not in ('post', 'reply')
    or p_action not in ('dismiss', 'hide', 'delete')
  then
    raise exception 'forum moderation action denied' using errcode = 'insufficient_privilege';
  end if;

  if p_target_type = 'post' then
    perform 1 from public.forum_posts where org_id = actor_org and id = p_target_id for update;
  else
    perform 1 from public.forum_replies where org_id = actor_org and id = p_target_id for update;
  end if;
  if not found then
    raise exception 'forum moderation target not found' using errcode = 'no_data_found';
  end if;

  update public.forum_flags
  set
    state = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
    reviewed_at = now(),
    reviewed_by = actor
  where org_id = actor_org
    and state = 'pending'
    and (
      (p_target_type = 'post' and post_id = p_target_id)
      or (p_target_type = 'reply' and reply_id = p_target_id)
    );

  if p_target_type = 'post' then
    update public.forum_posts
    set
      visibility = case p_action
        when 'dismiss' then case when visibility = 'hidden_pending_review' then 'visible' else visibility end
        when 'hide' then case when visibility = 'deleted' then 'deleted' else 'hidden' end
        else 'deleted'
      end,
      content = case when p_action = 'delete' then null else content end,
      image_url = case when p_action = 'delete' then null else image_url end,
      is_pinned = case when p_action = 'delete' then false else is_pinned end,
      flag_count = 0
    where org_id = actor_org and id = p_target_id;
  else
    update public.forum_replies
    set
      visibility = case p_action
        when 'dismiss' then case when visibility = 'hidden_pending_review' then 'visible' else visibility end
        when 'hide' then case when visibility = 'deleted' then 'deleted' else 'hidden' end
        else 'deleted'
      end,
      content = case when p_action = 'delete' then null else content end,
      image_url = case when p_action = 'delete' then null else image_url end,
      flag_count = 0
    where org_id = actor_org and id = p_target_id;
  end if;
end;
$$;

create or replace function public.set_forum_post_pinned(p_post_id uuid, p_is_pinned boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select public.is_staff_or_admin()) then
    raise exception 'forum pin action denied' using errcode = 'insufficient_privilege';
  end if;
  update public.forum_posts
  set is_pinned = p_is_pinned
  where id = p_post_id
    and org_id = (select public.current_org_id())
    and visibility <> 'deleted';
  if not found then
    raise exception 'forum post not found' using errcode = 'no_data_found';
  end if;
end;
$$;

create or replace function public.set_forum_post_category(p_post_id uuid, p_category_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select public.is_staff_or_admin()) then
    raise exception 'forum category action denied' using errcode = 'insufficient_privilege';
  end if;
  update public.forum_posts
  set category_id = p_category_id
  where id = p_post_id
    and org_id = (select public.current_org_id())
    and visibility <> 'deleted';
  if not found then
    raise exception 'forum post not found' using errcode = 'no_data_found';
  end if;
end;
$$;

create or replace function public.save_forum_category(
  p_category_id uuid,
  p_name jsonb,
  p_slug text,
  p_icon text,
  p_color text,
  p_sort_order integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
  result uuid;
begin
  if not (select public.is_staff_or_admin())
    or jsonb_typeof(p_name) <> 'object'
    or exists (
      select 1
      from unnest(array['ca', 'es', 'en', 'ar', 'fa']) as language(code)
      where nullif(btrim(p_name ->> language.code), '') is null
    )
  then
    raise exception 'forum category action denied or invalid'
      using errcode = 'insufficient_privilege';
  end if;

  if p_category_id is null then
    insert into public.forum_categories (org_id, name, slug, icon, color, sort_order)
    values (
      actor_org,
      p_name,
      lower(btrim(p_slug)),
      btrim(p_icon),
      btrim(p_color),
      p_sort_order
    )
    returning id into result;
    return result;
  end if;

  update public.forum_categories
  set
    name = p_name,
    slug = lower(btrim(p_slug)),
    icon = btrim(p_icon),
    color = btrim(p_color),
    sort_order = p_sort_order
  where id = p_category_id and org_id = actor_org
  returning id into result;
  if result is null then
    raise exception 'forum category not found' using errcode = 'no_data_found';
  end if;
  return result;
end;
$$;

create or replace function public.delete_forum_category(p_category_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select public.is_staff_or_admin()) then
    raise exception 'forum category action denied' using errcode = 'insufficient_privilege';
  end if;
  delete from public.forum_categories
  where id = p_category_id and org_id = (select public.current_org_id());
  if not found then
    raise exception 'forum category not found' using errcode = 'no_data_found';
  end if;
end;
$$;

create or replace function public.set_forum_posting_disabled(
  p_participant_id uuid,
  p_disabled boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select public.is_staff_or_admin()) then
    raise exception 'forum posting status action denied' using errcode = 'insufficient_privilege';
  end if;
  update public.profiles
  set is_forum_banned = p_disabled
  where id = p_participant_id
    and org_id = (select public.current_org_id())
    and role = 'player';
  if not found then
    raise exception 'participant not found' using errcode = 'no_data_found';
  end if;
end;
$$;

create or replace function private.get_or_create_staff_conversation(p_participant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
  result uuid;
begin
  if not (select public.is_staff_or_admin())
    or not exists (
      select 1 from public.profiles
      where id = p_participant_id and org_id = actor_org and role = 'player'
    )
  then
    raise exception 'forum author contact denied' using errcode = 'insufficient_privilege';
  end if;

  insert into public.conversations (org_id, user_id)
  values (actor_org, p_participant_id)
  on conflict (org_id, user_id) do update set org_id = excluded.org_id
  returning id into result;
  return result;
end;
$$;

create or replace function public.get_or_create_staff_conversation(p_participant_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.get_or_create_staff_conversation(p_participant_id);
$$;

revoke all on function private.set_forum_flag_context()
  from public, anon, authenticated, service_role;
revoke all on function private.apply_forum_flag()
  from public, anon, authenticated, service_role;
revoke all on function private.get_or_create_staff_conversation(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.flag_forum_content(text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.list_forum_moderation_queue()
  from public, anon, authenticated;
revoke all on function public.moderate_forum_target(text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.set_forum_post_pinned(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.set_forum_post_category(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.save_forum_category(uuid, jsonb, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.delete_forum_category(uuid)
  from public, anon, authenticated;
revoke all on function public.set_forum_posting_disabled(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.get_or_create_staff_conversation(uuid)
  from public, anon, authenticated;
grant execute on function private.get_or_create_staff_conversation(uuid) to authenticated;
grant execute on function public.flag_forum_content(text, uuid, text, text) to authenticated;
grant execute on function public.list_forum_moderation_queue() to authenticated;
grant execute on function public.moderate_forum_target(text, uuid, text) to authenticated;
grant execute on function public.set_forum_post_pinned(uuid, boolean) to authenticated;
grant execute on function public.set_forum_post_category(uuid, uuid) to authenticated;
grant execute on function public.save_forum_category(uuid, jsonb, text, text, text, integer)
  to authenticated;
grant execute on function public.delete_forum_category(uuid) to authenticated;
grant execute on function public.set_forum_posting_disabled(uuid, boolean) to authenticated;
grant execute on function public.get_or_create_staff_conversation(uuid) to authenticated;

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

comment on function public.personal_data_disposition is
  'What happens to each table when a participant is erased. Every public table must appear.';
