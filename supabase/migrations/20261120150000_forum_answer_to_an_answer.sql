-- An answer can belong to another answer of the same post (RAPP-884).
--
-- Until now every forum answer belonged only to a post, so a post's answers
-- were one flat list. The post screen now shows each answer with the answers to
-- it underneath, two levels at most. `parent_reply_id` is null for an answer to
-- the post and names another answer of the same post for an answer to an
-- answer. Every existing row keeps null, so it stays an answer to the post.
--
-- The rules, and where each one lives:
--
-- * Same post, same organization. The foreign key carries `org_id` and
--   `post_id` with the parent id, so the database itself refuses a parent from
--   another post or another organization, whoever writes the row.
--
-- * Two levels at most. A trigger refuses a parent that itself has a parent.
--   It cannot be raced: the same trigger only lets `parent_reply_id` change
--   to null, so an answer never moves down a level after it is written. A
--   parent that was at level one when the check ran is still at level one
--   when the row commits. The foreign key lock keeps that parent from
--   disappearing in between.
--
-- * Only a visible parent. A new answer may not attach to an answer that is
--   hidden, waiting for review, or deleted. The insert policy treats a post
--   the same way: a player answers only a post whose visibility is 'visible'.
--
-- * Deleting a parent. A deleted answer normally stays as a tombstone
--   (`visibility = 'deleted'`) and keeps the answers to it. A row is removed
--   for real in two cases: its post is removed, which removes every answer of
--   the post anyway, and its author's account is erased under the RGPD, which
--   removes everything she wrote. In the second case the answers other players
--   wrote to her answer belong to them, so erasing her must not erase them. The
--   foreign key sets only `parent_reply_id` to null (Postgres 15 and later
--   accept a column list on SET NULL, as `conversations` and
--   `entity_referrals` already use), so those answers stay and become answers
--   to the post. Her words go; theirs stay where the post can show them.
--
-- `forum_posts.reply_count` keeps counting every answer of the post at any
-- level: its trigger fires on insert and delete of any row, and setting a
-- parent to null is an update, which it leaves alone.
--
-- Reading rights do not change. The select policy decides by the answer's own
-- visibility and its post's, and the new column opens no new row to anyone. A
-- player may still read an answer whose parent is hidden from her; the app
-- leaves such an answer out of the thread because it reads out of context.

-- 1. The column and its foreign key ---------------------------------------------------------------------------

alter table public.forum_replies
  add column parent_reply_id uuid;

-- The target of the composite foreign key below. `id` alone is already unique,
-- so this adds no rule of its own.
alter table public.forum_replies
  add constraint forum_replies_org_post_id_unique unique (org_id, post_id, id);

alter table public.forum_replies
  add constraint forum_replies_parent_tenant_fkey
    foreign key (org_id, post_id, parent_reply_id)
    references public.forum_replies (org_id, post_id, id)
    on delete set null (parent_reply_id),
  add constraint forum_replies_parent_not_self_check
    check (parent_reply_id is distinct from id);

comment on column public.forum_replies.parent_reply_id is
  'Null for an answer to the post. Otherwise the answer of the same post this one answers, which itself answers the post (two levels at most, RAPP-884).';

-- Finds the answers to an answer: the foreign key's own lookup when a parent is
-- removed, and any read of one answer's answers. Most rows are null and stay
-- out of the index.
create index forum_replies_parent_idx
  on public.forum_replies (parent_reply_id)
  where parent_reply_id is not null;

-- 2. The depth and visibility rules ---------------------------------------------------------------------------

create or replace function private.guard_forum_reply_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_parent_id uuid;
  parent_visibility text;
begin
  if tg_op = 'UPDATE' then
    -- An answer never moves under another answer after it is written. The
    -- only change allowed is to null, which is what the foreign key does when
    -- the parent is removed.
    if new.parent_reply_id is not null
      and new.parent_reply_id is distinct from old.parent_reply_id
    then
      raise exception 'a forum answer cannot move under another answer'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.parent_reply_id is null then
    return new;
  end if;

  -- Reads the parent whatever its visibility, so a hidden parent gets the
  -- visibility error below instead of looking like a missing one.
  select parent.parent_reply_id, parent.visibility
  into parent_parent_id, parent_visibility
  from public.forum_replies as parent
  where parent.id = new.parent_reply_id
    and parent.org_id = new.org_id
    and parent.post_id = new.post_id;

  if not found then
    raise exception 'the forum answer to answer is not in this post'
      using errcode = 'foreign_key_violation';
  end if;
  if parent_parent_id is not null then
    raise exception 'a forum answer can answer only an answer to the post'
      using errcode = 'check_violation';
  end if;
  if parent_visibility <> 'visible' then
    raise exception 'the forum answer to answer is not available'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- Runs after `forum_replies_set_authorship` (triggers of one event fire in
-- name order), so `org_id` is already the author's own organization.
create trigger forum_replies_thread_guard
  before insert or update of parent_reply_id on public.forum_replies
  for each row execute function private.guard_forum_reply_parent();

revoke all on function private.guard_forum_reply_parent()
  from public, anon, authenticated, service_role;

-- 3. The write boundary ---------------------------------------------------------------------------------------

-- The parent is a third argument with a default, so a call that names only the
-- post and the text, as every app build so far does, still resolves to this
-- function and answers the post.
drop function public.create_forum_reply(uuid, text);

create function public.create_forum_reply(
  p_post_id uuid,
  p_content text,
  p_parent_reply_id uuid default null
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
    org_id, post_id, parent_reply_id, author_id, author_first_name, content
  ) values (
    (select public.current_org_id()),
    p_post_id,
    p_parent_reply_id,
    (select auth.uid()),
    'pending',
    nullif(btrim(p_content), '')
  ) returning id into result;
  return result;
end;
$$;

revoke all on function public.create_forum_reply(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.create_forum_reply(uuid, text, uuid) to authenticated;
