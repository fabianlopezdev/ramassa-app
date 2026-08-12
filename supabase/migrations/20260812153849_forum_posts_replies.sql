-- Category forum, player posts, replies, ownership, and tombstones (RAPP-50).

create table public.forum_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name jsonb not null,
  slug text not null,
  icon text not null,
  color text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint forum_categories_org_id_id_unique unique (org_id, id),
  constraint forum_categories_org_slug_unique unique (org_id, slug),
  constraint forum_categories_name_object_check check (jsonb_typeof(name) = 'object'),
  constraint forum_categories_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint forum_categories_icon_check check (length(btrim(icon)) between 1 and 64),
  constraint forum_categories_color_check check (length(btrim(color)) between 1 and 64)
);

create table public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  category_id uuid not null,
  author_id uuid not null,
  author_first_name text not null,
  content text,
  image_url text,
  visibility text not null default 'visible',
  is_pinned boolean not null default false,
  flag_count integer not null default 0,
  reply_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forum_posts_org_id_id_unique unique (org_id, id),
  constraint forum_posts_category_tenant_fkey
    foreign key (org_id, category_id)
    references public.forum_categories (org_id, id) on delete restrict,
  constraint forum_posts_author_tenant_fkey
    foreign key (org_id, author_id)
    references public.profiles (org_id, id) on delete cascade,
  constraint forum_posts_visibility_check check (visibility in ('visible', 'hidden', 'deleted')),
  constraint forum_posts_content_check check (
    (visibility = 'deleted' and content is null and image_url is null)
    or (
      visibility <> 'deleted'
      and content is not null
      and length(btrim(content)) between 1 and 2000
    )
  ),
  constraint forum_posts_image_url_check check (
    image_url is null
    or (
      length(image_url) between 1 and 1024
      and image_url like org_id::text || '/forum/' || author_id::text || '/%'
      and image_url !~ '[[:space:]]'
      and image_url !~ '(^|/)\.\.(/|$)'
    )
  ),
  constraint forum_posts_author_name_check check (length(btrim(author_first_name)) between 1 and 120),
  constraint forum_posts_flag_count_check check (flag_count >= 0),
  constraint forum_posts_reply_count_check check (reply_count >= 0)
);

create table public.forum_replies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  post_id uuid not null,
  author_id uuid not null,
  author_first_name text not null,
  content text,
  image_url text,
  visibility text not null default 'visible',
  flag_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forum_replies_post_tenant_fkey
    foreign key (org_id, post_id)
    references public.forum_posts (org_id, id) on delete cascade,
  constraint forum_replies_author_tenant_fkey
    foreign key (org_id, author_id)
    references public.profiles (org_id, id) on delete cascade,
  constraint forum_replies_visibility_check check (visibility in ('visible', 'hidden', 'deleted')),
  constraint forum_replies_content_check check (
    (visibility = 'deleted' and content is null and image_url is null)
    or (
      visibility <> 'deleted'
      and content is not null
      and length(btrim(content)) between 1 and 1000
    )
  ),
  constraint forum_replies_image_url_check check (
    image_url is null
    or (
      length(image_url) between 1 and 1024
      and image_url like org_id::text || '/forum/' || author_id::text || '/%'
      and image_url !~ '[[:space:]]'
      and image_url !~ '(^|/)\.\.(/|$)'
    )
  ),
  constraint forum_replies_author_name_check check (length(btrim(author_first_name)) between 1 and 120),
  constraint forum_replies_flag_count_check check (flag_count >= 0)
);

comment on table public.forum_categories is
  'Organization-owned forum vocabulary. Four default player categories are seeded.';
comment on table public.forum_posts is
  'Attributed player forum posts. Author deletion becomes a content-free tombstone; account erasure hard-deletes authored rows.';
comment on table public.forum_replies is
  'Attributed replies inside a forum post. Content stays plain text at every boundary.';
comment on column public.forum_posts.image_url is
  'Optional authenticated R2 object key under the author forum prefix, never an arbitrary URL.';

create index forum_categories_org_sort_idx
  on public.forum_categories (org_id, sort_order, id);
create index forum_posts_board_idx
  on public.forum_posts (org_id, category_id, is_pinned desc, created_at desc, id desc)
  where visibility = 'visible';
create index forum_posts_author_idx
  on public.forum_posts (author_id, created_at desc, id);
create index forum_replies_thread_idx
  on public.forum_replies (post_id, created_at, id)
  where visibility in ('visible', 'deleted');
create index forum_replies_author_idx
  on public.forum_replies (author_id, created_at desc, id);

create or replace function private.set_forum_authorship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := coalesce((select auth.uid()), new.author_id);
  actor_org uuid;
  actor_first_name text;
begin
  select profile.org_id, profile.first_name
  into actor_org, actor_first_name
  from public.profiles as profile
  where profile.id = actor;

  if actor_org is null or actor_first_name is null then
    raise exception 'forum author is not available' using errcode = 'foreign_key_violation';
  end if;

  new.org_id := actor_org;
  new.author_id := actor;
  new.author_first_name := actor_first_name;
  return new;
end;
$$;

create trigger forum_posts_set_authorship
  before insert on public.forum_posts
  for each row execute function private.set_forum_authorship();
create trigger forum_replies_set_authorship
  before insert on public.forum_replies
  for each row execute function private.set_forum_authorship();

create or replace function private.guard_forum_post_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1
    or (select auth.uid()) is null
    or (select public.is_staff_or_admin())
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
    or (new.visibility = 'deleted' and (new.content is not null or new.image_url is not null))
  then
    raise exception 'forum post ownership or protected columns rejected'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger forum_posts_guard_update
  before update on public.forum_posts
  for each row execute function private.guard_forum_post_update();
create trigger forum_posts_set_updated_at
  before update on public.forum_posts
  for each row execute function public.set_updated_at();
create trigger forum_replies_set_updated_at
  before update on public.forum_replies
  for each row execute function public.set_updated_at();

create or replace function private.adjust_forum_reply_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.forum_posts
    set reply_count = reply_count + 1
    where org_id = new.org_id and id = new.post_id;
    return new;
  end if;

  update public.forum_posts
  set reply_count = greatest(reply_count - 1, 0)
  where org_id = old.org_id and id = old.post_id;
  return old;
end;
$$;

create trigger forum_replies_adjust_count
  after insert or delete on public.forum_replies
  for each row execute function private.adjust_forum_reply_count();

alter table public.forum_categories enable row level security;
alter table public.forum_categories force row level security;
alter table public.forum_posts enable row level security;
alter table public.forum_posts force row level security;
alter table public.forum_replies enable row level security;
alter table public.forum_replies force row level security;

create policy forum_categories_select_org_member
  on public.forum_categories for select to authenticated
  using (org_id = (select public.current_org_id()));
create policy forum_categories_insert_staff
  on public.forum_categories for insert to authenticated
  with check (org_id = (select public.current_org_id()) and (select public.is_staff_or_admin()));
create policy forum_categories_update_staff
  on public.forum_categories for update to authenticated
  using (org_id = (select public.current_org_id()) and (select public.is_staff_or_admin()))
  with check (org_id = (select public.current_org_id()) and (select public.is_staff_or_admin()));
create policy forum_categories_delete_staff
  on public.forum_categories for delete to authenticated
  using (org_id = (select public.current_org_id()) and (select public.is_staff_or_admin()));

create policy forum_posts_select_org_member
  on public.forum_posts for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (visibility in ('visible', 'deleted') or (select public.is_staff_or_admin()))
  );
create policy forum_posts_insert_player_or_staff
  on public.forum_posts for insert to authenticated
  with check (
    org_id = (select public.current_org_id())
    and author_id = (select auth.uid())
    and visibility = 'visible'
    and not is_pinned
    and flag_count = 0
    and reply_count = 0
    and (
      (select public.is_staff_or_admin())
      or (
        (select public.current_app_role()) = 'player'
        and exists (
          select 1 from public.profiles as actor
          where actor.id = (select auth.uid())
            and actor.org_id = forum_posts.org_id
            and actor.is_active
            and not actor.is_forum_banned
        )
      )
    )
  );
create policy forum_posts_update_author_or_staff
  on public.forum_posts for update to authenticated
  using (
    org_id = (select public.current_org_id())
    and (author_id = (select auth.uid()) or (select public.is_staff_or_admin()))
  )
  with check (
    org_id = (select public.current_org_id())
    and (author_id = (select auth.uid()) or (select public.is_staff_or_admin()))
  );
create policy forum_posts_delete_staff
  on public.forum_posts for delete to authenticated
  using (org_id = (select public.current_org_id()) and (select public.is_staff_or_admin()));

create policy forum_replies_select_org_member
  on public.forum_replies for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.is_staff_or_admin())
      or (
        visibility in ('visible', 'deleted')
        and exists (
          select 1 from public.forum_posts as post
          where post.org_id = forum_replies.org_id
            and post.id = forum_replies.post_id
            and post.visibility in ('visible', 'deleted')
        )
      )
    )
  );
create policy forum_replies_insert_player_or_staff
  on public.forum_replies for insert to authenticated
  with check (
    org_id = (select public.current_org_id())
    and author_id = (select auth.uid())
    and visibility = 'visible'
    and flag_count = 0
    and exists (
      select 1 from public.forum_posts as post
      where post.org_id = forum_replies.org_id
        and post.id = forum_replies.post_id
        and post.visibility = 'visible'
    )
    and (
      (select public.is_staff_or_admin())
      or (
        (select public.current_app_role()) = 'player'
        and exists (
          select 1 from public.profiles as actor
          where actor.id = (select auth.uid())
            and actor.org_id = forum_replies.org_id
            and actor.is_active
            and not actor.is_forum_banned
        )
      )
    )
  );
create policy forum_replies_update_staff
  on public.forum_replies for update to authenticated
  using (org_id = (select public.current_org_id()) and (select public.is_staff_or_admin()))
  with check (org_id = (select public.current_org_id()) and (select public.is_staff_or_admin()));
create policy forum_replies_delete_staff
  on public.forum_replies for delete to authenticated
  using (org_id = (select public.current_org_id()) and (select public.is_staff_or_admin()));

revoke all on table public.forum_categories from public, anon, authenticated;
revoke all on table public.forum_posts from public, anon, authenticated;
revoke all on table public.forum_replies from public, anon, authenticated;
grant select, insert, update, delete on table public.forum_categories to authenticated;
grant select, insert, update, delete on table public.forum_posts to authenticated;
grant select, insert, update, delete on table public.forum_replies to authenticated;

create or replace function public.create_forum_post(
  p_category_id uuid,
  p_content text,
  p_image_url text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result uuid;
begin
  insert into public.forum_posts (
    org_id, category_id, author_id, author_first_name, content, image_url
  ) values (
    (select public.current_org_id()),
    p_category_id,
    (select auth.uid()),
    'pending',
    nullif(btrim(p_content), ''),
    nullif(btrim(p_image_url), '')
  ) returning id into result;
  return result;
end;
$$;

create or replace function public.create_forum_reply(
  p_post_id uuid,
  p_content text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result uuid;
begin
  insert into public.forum_replies (
    org_id, post_id, author_id, author_first_name, content
  ) values (
    (select public.current_org_id()),
    p_post_id,
    (select auth.uid()),
    'pending',
    nullif(btrim(p_content), '')
  ) returning id into result;
  return result;
end;
$$;

create or replace function public.edit_own_forum_post(
  p_post_id uuid,
  p_content text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.forum_posts
  set content = nullif(btrim(p_content), '')
  where id = p_post_id and org_id = (select public.current_org_id());
  if not found then
    raise exception 'forum post is not editable' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function public.delete_own_forum_post(p_post_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.forum_posts
  set visibility = 'deleted', content = null, image_url = null
  where id = p_post_id and org_id = (select public.current_org_id());
  if not found then
    raise exception 'forum post is not deletable' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

revoke all on function private.set_forum_authorship()
  from public, anon, authenticated, service_role;
revoke all on function private.guard_forum_post_update()
  from public, anon, authenticated, service_role;
revoke all on function private.adjust_forum_reply_count()
  from public, anon, authenticated, service_role;
revoke all on function public.create_forum_post(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.create_forum_reply(uuid, text)
  from public, anon, authenticated;
revoke all on function public.edit_own_forum_post(uuid, text)
  from public, anon, authenticated;
revoke all on function public.delete_own_forum_post(uuid)
  from public, anon, authenticated;
grant execute on function public.create_forum_post(uuid, text, text) to authenticated;
grant execute on function public.create_forum_reply(uuid, text) to authenticated;
grant execute on function public.edit_own_forum_post(uuid, text) to authenticated;
grant execute on function public.delete_own_forum_post(uuid) to authenticated;

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
     'Carries reason written in her own words. The audit trail records fulfillment.'),
    ('invites', 'accepted_by', 'purge',
     'The invitation that admitted her, and separately every row carrying her email address.'),
    ('equipment_deliveries', 'profile_id', 'purge',
     'What she was given and when is an inference about her circumstances.'),
    ('event_signups', 'player_id', 'purge',
     'Her interest or confirmed attendance at an event is participant activity.'),
    ('attendance', 'player_id', 'purge',
     'Whether she attended, missed, or was excused is participant activity.'),
    ('service_interests', 'user_id', 'purge',
     'Her interest in a service is participant activity.'),
    ('conversations', 'user_id', 'purge',
     'Her direct team thread is personal correspondence and cascades its full history.'),
    ('messages', 'sender_id', 'purge',
     'Messages she authored are personal correspondence. Thread deletion also removes staff replies.'),
    ('conversation_read_states', 'user_id', 'purge',
     'Her message read history is participant activity.'),
    ('conversation_assignment_history', 'user_id', 'purge',
     'Who handled her conversation is care-history metadata and cascades with the thread.'),
    ('forum_posts', 'author_id', 'purge',
     'Forum posts contain her words, first-name attribution, and optional image reference.'),
    ('forum_replies', 'author_id', 'purge',
     'Forum replies contain her words and first-name attribution.'),
    ('audit_log', 'actor_id', 'purge',
     'Rows where she acted. The non-cascading reference would otherwise block erasure.'),
    ('audit_log', 'target_id', 'retain',
     'Kept under ADR-023 as an opaque lawful-access and erasure record with no personal content.'),
    ('announcements', null, 'not_personal',
     'Organization-owned operational content. Removed staff authors detach.'),
    ('event_categories', null, 'not_personal',
     'Organization-owned event vocabulary with no participant data.'),
    ('events', null, 'not_personal',
     'Organization-owned schedules. Removed staff authors detach.'),
    ('event_occurrences', null, 'not_personal',
     'Materialized organization schedule instances with no participant data.'),
    ('knowledge_categories', null, 'not_personal',
     'Organization-owned knowledge vocabulary with no participant data.'),
    ('knowledge_articles', 'author_id', 'purge',
     'Participant stories contain her words and first-name attribution.'),
    ('push_publications', 'recipient_id', 'purge',
     'A message push publication points at its participant recipient but stores no message text.'),
    ('service_categories', null, 'not_personal',
     'Organization-owned service vocabulary with no participant data.'),
    ('services', null, 'not_personal',
     'Organization-owned directory content. Removed authors detach.'),
    ('service_images', null, 'not_personal',
     'Organization-owned service media that cascades with its service.'),
    ('service_submission_comments', null, 'not_personal',
     'Organization service-review correspondence whose removed authors detach.'),
    ('service_submission_notifications', null, 'not_personal',
     'Organization staff work queue whose entity and staff references detach.'),
    ('forum_categories', null, 'not_personal',
     'Organization-owned forum vocabulary with no participant data.'),
    ('organizations', null, 'not_personal',
     'A tenant, not a person. No participant column exists to purge.'),
    ('municipality_catalog', null, 'not_personal',
     'Official IDESCAT geography with no participant data.');
$$;

comment on function public.personal_data_disposition is
  'What happens to each table when a participant is erased. Every public table must appear and the erasure RPC checks this registry.';
