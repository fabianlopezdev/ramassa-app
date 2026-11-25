-- Protocols i documents base (RAPP-972): the club's base documents (season
-- start guide, safeguarding, code of conduct) are written with the guides
-- editor in one category per club marked as base documents. Players reach them
-- from their own card in Ajuda; they stay out of the Guies list and out of the
-- guides' "new" count.

alter table public.knowledge_categories
  add column is_base_documents boolean not null default false;

comment on column public.knowledge_categories.is_base_documents is
  'The club''s base documents (RAPP-972): shown from their own card in Ajuda, never in the Guies list.';

-- One base-documents category per club.
create unique index knowledge_categories_one_base_documents_per_org
  on public.knowledge_categories (org_id)
  where is_base_documents;

insert into public.knowledge_categories (org_id, name, slug, icon, sort_order, is_base_documents)
select
  organization.id,
  jsonb_build_object(
    'ca', 'Protocols i documents base',
    'es', 'Protocolos y documentos base',
    'en', 'Protocols and core documents',
    'fr', 'Protocoles et documents de base',
    'ar', 'البروتوكولات والوثائق الأساسية',
    'fa', 'پروتکل‌ها و اسناد پایه'
  ),
  'protocols-i-documents-base',
  'document',
  0,
  true
from public.organizations as organization
where not exists (
  select 1 from public.knowledge_categories as category
  where category.org_id = organization.id
    and (category.is_base_documents or category.slug = 'protocols-i-documents-base')
);

-- The guides' "new" count leaves the base documents out.
create or replace function private.my_tab_news()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select
      profile.id as user_id,
      profile.org_id,
      greatest(private.tab_news_started_at(), profile.created_at) as since,
      (select private.sees_only_test_players()) as sees_only_test_players
    from public.profiles as profile
    where profile.id = (select auth.uid())
      and profile.org_id = (select public.current_org_id())
  ),
  unopened_posts as (
    select post.id, post.created_at,
      (select visit.visited_at from public.list_visits as visit
       where visit.user_id = actor.user_id and visit.list_key = 'forum') as list_seen_at
    from actor
    join public.forum_posts as post on post.org_id = actor.org_id
    where post.visibility = 'visible'
      and post.author_id <> actor.user_id
      and post.created_at > actor.since
      and (not actor.sees_only_test_players
        or private.authored_by_test_or_team(post.author_id))
      and not exists (
        select 1 from public.forum_post_reads as seen
        where seen.post_id = post.id and seen.user_id = actor.user_id
      )
    order by post.created_at desc, post.id desc
    limit 200
  ),
  -- Replies count from the last time she opened her post.
  new_replies as (
    select reply.post_id, count(*)::integer as reply_count, max(reply.created_at) as latest_at
    from actor
    join public.forum_posts as post
      on post.org_id = actor.org_id
     and post.author_id = actor.user_id
     and post.visibility = 'visible'
    left join public.forum_post_reads as seen
      on seen.post_id = post.id
     and seen.user_id = actor.user_id
    join public.forum_replies as reply
      on reply.org_id = post.org_id
     and reply.post_id = post.id
    where reply.visibility = 'visible'
      and reply.author_id <> actor.user_id
      and reply.created_at > greatest(actor.since, seen.seen_at)
      and (not actor.sees_only_test_players
        or private.authored_by_test_or_team(reply.author_id))
    group by reply.post_id
    order by latest_at desc, reply.post_id desc
    limit 200
  ),
  -- A gallery item has no approval or publication time: it is visible to the
  -- other players from the moment it is uploaded, unless the team hides it, so
  -- `created_at` is the moment it became visible.
  unopened_gallery_items as (
    select item.id, item.created_at,
      (select visit.visited_at from public.list_visits as visit
       where visit.user_id = actor.user_id and visit.list_key = 'gallery') as list_seen_at
    from actor
    join public.media_items as item on item.org_id = actor.org_id
    where item.moderation_state = 'visible'
      and item.privacy_level = 'community'
      and item.uploaded_by <> actor.user_id
      and item.created_at > actor.since
      and (not actor.sees_only_test_players
        or private.authored_by_test_or_team(item.uploaded_by))
      and not exists (
        select 1 from public.media_item_reads as seen
        where seen.media_item_id = item.id and seen.user_id = actor.user_id
      )
    order by item.created_at desc, item.id desc
    limit 200
  ),
  -- A story becomes visible at `published_at`, which the team sets when it
  -- approves the story.
  unopened_stories as (
    select article.id, article.published_at,
      (select visit.visited_at from public.list_visits as visit
       where visit.user_id = actor.user_id and visit.list_key = 'stories') as list_seen_at
    from actor
    join public.knowledge_articles as article on article.org_id = actor.org_id
    where article.content_type = 'participant_story'
      and article.is_published
      and article.published_at <= now()
      and (article.expires_at is null or article.expires_at > now())
      and article.author_id is distinct from actor.user_id
      and article.published_at > actor.since
      and (not actor.sees_only_test_players
        or private.authored_by_test_or_team(article.author_id))
      and not exists (
        select 1 from public.knowledge_article_reads as seen
        where seen.article_id = article.id and seen.user_id = actor.user_id
      )
    order by article.published_at desc, article.id desc
    limit 200
  ),
  unopened_guides as (
    select article.id, article.category_id, article.published_at,
      (select visit.visited_at from public.list_visits as visit
       where visit.user_id = actor.user_id and visit.list_key = 'guides:' || article.category_id::text) as list_seen_at
    from actor
    join public.knowledge_articles as article on article.org_id = actor.org_id
    where article.content_type <> 'participant_story'
      and article.is_published
      and article.published_at <= now()
      and (article.expires_at is null or article.expires_at > now())
      and article.published_at > actor.since
      -- The base documents have their own card in Ajuda and are not guides (RAPP-972).
      and not exists (
        select 1 from public.knowledge_categories as category
        where category.id = article.category_id and category.is_base_documents
      )
      and not exists (
        select 1 from public.knowledge_article_reads as seen
        where seen.article_id = article.id and seen.user_id = actor.user_id
      )
    order by article.published_at desc, article.id desc
    limit 200
  ),
  -- A service becomes visible at `published_at` (RAPP-360 made it the
  -- publication time the team sets or schedules).
  unopened_services as (
    select service.id, service.category_id, service.published_at,
      (select visit.visited_at from public.list_visits as visit
       where visit.user_id = actor.user_id and visit.list_key = 'services:' || service.category_id::text) as list_seen_at
    from actor
    join public.services as service on service.org_id = actor.org_id
    where public.is_content_visible(service.status, service.published_at, service.expires_at)
      and service.published_at > actor.since
      and not exists (
        select 1 from public.service_reads as seen
        where seen.service_id = service.id and seen.user_id = actor.user_id
      )
    order by service.published_at desc, service.id desc
    limit 200
  ),
  -- She can only create a mentoring request; every later change is the staff's.
  -- Scheduling and rescheduling write a `mentoring_notification_events` row
  -- addressed to her, and completing sets `completed_at`. Her own creation
  -- writes neither, so it never counts. A change counts from the last time she
  -- opened the request.
  changed_requests as (
    select request.id, change.changed_at
    from actor
    join public.mentoring_requests as request
      on request.org_id = actor.org_id
     and request.player_id = actor.user_id
    left join public.mentoring_request_reads as seen
      on seen.request_id = request.id
     and seen.user_id = actor.user_id
    cross join lateral (
      select greatest(
        (select max(event.created_at)
         from public.mentoring_notification_events as event
         where event.org_id = request.org_id
           and event.request_id = request.id
           and event.recipient_id = actor.user_id),
        request.completed_at
      ) as changed_at
    ) as change
    where change.changed_at > greatest(actor.since, seen.seen_at)
    order by change.changed_at desc, request.id desc
    limit 200
  ),
  -- Only the staff change the status of a suggestion
  -- (`transition_feedback_submission`), and nothing else updates the row, so
  -- `updated_at` on a suggestion that left `new` is the moment of the staff's
  -- last change. It counts from the last time she opened the suggestion.
  changed_submissions as (
    select submission.id, submission.updated_at
    from actor
    join public.feedback_submissions as submission
      on submission.org_id = actor.org_id
     and submission.author_id = actor.user_id
    left join public.feedback_submission_reads as seen
      on seen.submission_id = submission.id
     and seen.user_id = actor.user_id
    where submission.status <> 'new'
      and submission.updated_at > greatest(actor.since, seen.seen_at)
    order by submission.updated_at desc, submission.id desc
    limit 200
  )
  -- `unopened` drives the word "Nou" on a card: published for everyone, not
  -- hers, and she has not opened it. `unseen` drives the numbers: the unopened
  -- things that became visible after she last saw the list that shows their
  -- card. Replies on her post, her mentoring and her suggestions count until
  -- she opens them, whatever list she has seen.
  select jsonb_build_object(
    'since', coalesce(
      (select actor.since from actor),
      private.tab_news_started_at()
    ),
    'list_seen_at', coalesce(
      (select jsonb_object_agg(visit.list_key, visit.visited_at)
       from actor
       join public.list_visits as visit on visit.user_id = actor.user_id),
      '{}'::jsonb
    ),
    'forum', jsonb_build_object(
      'unseen_post_ids', coalesce(
        (select jsonb_agg(unopened_posts.id
           order by unopened_posts.created_at desc, unopened_posts.id desc)
         from unopened_posts
         where unopened_posts.created_at > coalesce(unopened_posts.list_seen_at, '-infinity'::timestamptz)),
        '[]'::jsonb
      ),
      'unopened_post_ids', coalesce(
        (select jsonb_agg(unopened_posts.id
           order by unopened_posts.created_at desc, unopened_posts.id desc)
         from unopened_posts),
        '[]'::jsonb
      ),
      'new_replies', coalesce(
        (select jsonb_agg(
           jsonb_build_object('post_id', new_replies.post_id, 'count', new_replies.reply_count)
           order by new_replies.latest_at desc, new_replies.post_id desc)
         from new_replies),
        '[]'::jsonb
      )
    ),
    'gallery', jsonb_build_object(
      'unseen_item_ids', coalesce(
        (select jsonb_agg(unopened_gallery_items.id
           order by unopened_gallery_items.created_at desc, unopened_gallery_items.id desc)
         from unopened_gallery_items
         where unopened_gallery_items.created_at > coalesce(unopened_gallery_items.list_seen_at, '-infinity'::timestamptz)),
        '[]'::jsonb
      ),
      'unopened_item_ids', coalesce(
        (select jsonb_agg(unopened_gallery_items.id
           order by unopened_gallery_items.created_at desc, unopened_gallery_items.id desc)
         from unopened_gallery_items),
        '[]'::jsonb
      )
    ),
    'stories', jsonb_build_object(
      'unseen_article_ids', coalesce(
        (select jsonb_agg(unopened_stories.id
           order by unopened_stories.published_at desc, unopened_stories.id desc)
         from unopened_stories
         where unopened_stories.published_at > coalesce(unopened_stories.list_seen_at, '-infinity'::timestamptz)),
        '[]'::jsonb
      ),
      'unopened_article_ids', coalesce(
        (select jsonb_agg(unopened_stories.id
           order by unopened_stories.published_at desc, unopened_stories.id desc)
         from unopened_stories),
        '[]'::jsonb
      )
    ),
    'guides', jsonb_build_object(
      'unseen_articles', coalesce(
        (select jsonb_agg(
           jsonb_build_object('id', unopened_guides.id, 'category_id', unopened_guides.category_id)
           order by unopened_guides.published_at desc, unopened_guides.id desc)
         from unopened_guides
         where unopened_guides.published_at > coalesce(unopened_guides.list_seen_at, '-infinity'::timestamptz)),
        '[]'::jsonb
      ),
      'unopened_articles', coalesce(
        (select jsonb_agg(
           jsonb_build_object('id', unopened_guides.id, 'category_id', unopened_guides.category_id)
           order by unopened_guides.published_at desc, unopened_guides.id desc)
         from unopened_guides),
        '[]'::jsonb
      )
    ),
    'services', jsonb_build_object(
      'unseen_services', coalesce(
        (select jsonb_agg(
           jsonb_build_object('id', unopened_services.id, 'category_id', unopened_services.category_id)
           order by unopened_services.published_at desc, unopened_services.id desc)
         from unopened_services
         where unopened_services.published_at > coalesce(unopened_services.list_seen_at, '-infinity'::timestamptz)),
        '[]'::jsonb
      ),
      'unopened_services', coalesce(
        (select jsonb_agg(
           jsonb_build_object('id', unopened_services.id, 'category_id', unopened_services.category_id)
           order by unopened_services.published_at desc, unopened_services.id desc)
         from unopened_services),
        '[]'::jsonb
      )
    ),
    'mentoring', jsonb_build_object(
      'changed_request_ids', coalesce(
        (select jsonb_agg(changed_requests.id
           order by changed_requests.changed_at desc, changed_requests.id desc)
         from changed_requests),
        '[]'::jsonb
      )
    ),
    'feedback', jsonb_build_object(
      'changed_submission_ids', coalesce(
        (select jsonb_agg(changed_submissions.id
           order by changed_submissions.updated_at desc, changed_submissions.id desc)
         from changed_submissions),
        '[]'::jsonb
      )
    )
  );
$$;
