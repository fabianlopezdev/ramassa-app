-- What is new for her on Comunitat, Ajuda and Contacte (RAPP-873).
--
-- Two rules from the owner: nothing new goes unseen, because every new thing
-- raises a number on some tab, and one thing counts in one place only. Inici
-- keeps its own count (RAPP-821, RAPP-848). Comunitat counts new forum posts,
-- new replies on her posts, new gallery items and new stories by others. Ajuda
-- counts new services and new guides. Contacte adds a change the staff made to
-- her mentoring request or to her suggestion.
--
-- Two levels. What is published for everyone (posts, gallery items, stories,
-- guides and services) raises a number until she has seen the list that shows
-- its card, and keeps the word "Nou" on the card until she opens the thing.
-- What is addressed to her (replies on her post, a staff change to her
-- mentoring request or to her suggestion) keeps the number and the mark until
-- she opens that thing, the rule announcements follow since RAPP-848; a later
-- reply or change counts again.

-- 1. The records ---------------------------------------------------------------------------------------------

create table public.forum_post_reads (
  org_id uuid not null references public.organizations (id) on delete cascade,
  post_id uuid not null,
  user_id uuid not null,
  seen_at timestamptz not null default now(),
  primary key (post_id, user_id),
  constraint forum_post_reads_post_tenant_fkey
    foreign key (org_id, post_id)
    references public.forum_posts (org_id, id) on delete cascade,
  constraint forum_post_reads_user_tenant_fkey
    foreign key (org_id, user_id)
    references public.profiles (org_id, id) on delete cascade
);

create table public.media_item_reads (
  org_id uuid not null references public.organizations (id) on delete cascade,
  media_item_id uuid not null,
  user_id uuid not null,
  seen_at timestamptz not null default now(),
  primary key (media_item_id, user_id),
  constraint media_item_reads_item_tenant_fkey
    foreign key (org_id, media_item_id)
    references public.media_items (org_id, id) on delete cascade,
  constraint media_item_reads_user_tenant_fkey
    foreign key (org_id, user_id)
    references public.profiles (org_id, id) on delete cascade
);

create table public.knowledge_article_reads (
  org_id uuid not null references public.organizations (id) on delete cascade,
  article_id uuid not null references public.knowledge_articles (id) on delete cascade,
  user_id uuid not null,
  seen_at timestamptz not null default now(),
  primary key (article_id, user_id),
  constraint knowledge_article_reads_user_tenant_fkey
    foreign key (org_id, user_id)
    references public.profiles (org_id, id) on delete cascade
);

create table public.service_reads (
  org_id uuid not null references public.organizations (id) on delete cascade,
  service_id uuid not null,
  user_id uuid not null,
  seen_at timestamptz not null default now(),
  primary key (service_id, user_id),
  constraint service_reads_service_tenant_fkey
    foreign key (org_id, service_id)
    references public.services (org_id, id) on delete cascade,
  constraint service_reads_user_tenant_fkey
    foreign key (org_id, user_id)
    references public.profiles (org_id, id) on delete cascade
);

create table public.mentoring_request_reads (
  org_id uuid not null references public.organizations (id) on delete cascade,
  request_id uuid not null,
  user_id uuid not null,
  seen_at timestamptz not null default now(),
  primary key (request_id, user_id),
  constraint mentoring_request_reads_request_tenant_fkey
    foreign key (org_id, request_id)
    references public.mentoring_requests (org_id, id) on delete cascade,
  constraint mentoring_request_reads_user_tenant_fkey
    foreign key (org_id, user_id)
    references public.profiles (org_id, id) on delete cascade
);

create table public.feedback_submission_reads (
  org_id uuid not null references public.organizations (id) on delete cascade,
  submission_id uuid not null,
  user_id uuid not null,
  seen_at timestamptz not null default now(),
  primary key (submission_id, user_id),
  constraint feedback_submission_reads_submission_tenant_fkey
    foreign key (org_id, submission_id)
    references public.feedback_submissions (org_id, id) on delete cascade,
  constraint feedback_submission_reads_user_tenant_fkey
    foreign key (org_id, user_id)
    references public.profiles (org_id, id) on delete cascade
);

-- The lists she has seen. A key names the list that shows a card: the forum,
-- the gallery, the stories, the activities, Inici, or the services or guides
-- of one category. `activities` and `home` are recorded for the app, which
-- works their counts out itself.
create table public.list_visits (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null,
  list_key text not null,
  visited_at timestamptz not null default now(),
  primary key (user_id, list_key),
  constraint list_visits_list_key_check check (
    list_key in ('forum', 'gallery', 'stories', 'activities', 'home')
    or list_key ~ '^(services|guides):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  constraint list_visits_user_tenant_fkey
    foreign key (org_id, user_id)
    references public.profiles (org_id, id) on delete cascade
);

comment on table public.list_visits is
  'When a person last saw each list that shows new things (RAPP-873).';

comment on table public.forum_post_reads is
  'One row per forum post a person has opened; on her own post, when she last opened it (RAPP-873).';
comment on table public.media_item_reads is
  'One row per gallery item a person has opened (RAPP-873).';
comment on table public.knowledge_article_reads is
  'One row per guide or story a person has opened (RAPP-873).';
comment on table public.service_reads is
  'One row per service a person has opened (RAPP-873).';
comment on table public.mentoring_request_reads is
  'When a person last opened each of her mentoring requests (RAPP-873).';
comment on table public.feedback_submission_reads is
  'When a person last opened each of her suggestions (RAPP-873).';

create index list_visits_org_user_idx
  on public.list_visits (org_id, user_id);
create index forum_post_reads_user_idx
  on public.forum_post_reads (user_id, post_id);
create index forum_post_reads_org_user_idx
  on public.forum_post_reads (org_id, user_id);
create index forum_post_reads_org_post_idx
  on public.forum_post_reads (org_id, post_id);
create index media_item_reads_user_idx
  on public.media_item_reads (user_id, media_item_id);
create index media_item_reads_org_user_idx
  on public.media_item_reads (org_id, user_id);
create index media_item_reads_org_item_idx
  on public.media_item_reads (org_id, media_item_id);
create index knowledge_article_reads_user_idx
  on public.knowledge_article_reads (user_id, article_id);
create index knowledge_article_reads_org_user_idx
  on public.knowledge_article_reads (org_id, user_id);
create index service_reads_user_idx
  on public.service_reads (user_id, service_id);
create index service_reads_org_user_idx
  on public.service_reads (org_id, user_id);
create index service_reads_org_service_idx
  on public.service_reads (org_id, service_id);
create index mentoring_request_reads_user_idx
  on public.mentoring_request_reads (user_id, request_id);
create index mentoring_request_reads_org_user_idx
  on public.mentoring_request_reads (org_id, user_id);
create index mentoring_request_reads_org_request_idx
  on public.mentoring_request_reads (org_id, request_id);
create index feedback_submission_reads_user_idx
  on public.feedback_submission_reads (user_id, submission_id);
create index feedback_submission_reads_org_user_idx
  on public.feedback_submission_reads (org_id, user_id);
create index feedback_submission_reads_org_submission_idx
  on public.feedback_submission_reads (org_id, submission_id);

alter table public.list_visits enable row level security;
alter table public.list_visits force row level security;
alter table public.forum_post_reads enable row level security;
alter table public.forum_post_reads force row level security;
alter table public.media_item_reads enable row level security;
alter table public.media_item_reads force row level security;
alter table public.knowledge_article_reads enable row level security;
alter table public.knowledge_article_reads force row level security;
alter table public.service_reads enable row level security;
alter table public.service_reads force row level security;
alter table public.mentoring_request_reads enable row level security;
alter table public.mentoring_request_reads force row level security;
alter table public.feedback_submission_reads enable row level security;
alter table public.feedback_submission_reads force row level security;

create policy list_visits_select_self
  on public.list_visits for select to authenticated
  using (
    user_id = (select auth.uid())
    and org_id = (select public.current_org_id())
  );

create policy forum_post_reads_select_self
  on public.forum_post_reads for select to authenticated
  using (
    user_id = (select auth.uid())
    and org_id = (select public.current_org_id())
  );

create policy media_item_reads_select_self
  on public.media_item_reads for select to authenticated
  using (
    user_id = (select auth.uid())
    and org_id = (select public.current_org_id())
  );

create policy knowledge_article_reads_select_self
  on public.knowledge_article_reads for select to authenticated
  using (
    user_id = (select auth.uid())
    and org_id = (select public.current_org_id())
  );

create policy service_reads_select_self
  on public.service_reads for select to authenticated
  using (
    user_id = (select auth.uid())
    and org_id = (select public.current_org_id())
  );

create policy mentoring_request_reads_select_self
  on public.mentoring_request_reads for select to authenticated
  using (
    user_id = (select auth.uid())
    and org_id = (select public.current_org_id())
  );

create policy feedback_submission_reads_select_self
  on public.feedback_submission_reads for select to authenticated
  using (
    user_id = (select auth.uid())
    and org_id = (select public.current_org_id())
  );

-- Rows are written only by `mark_lists_seen` and `mark_tab_items_seen`, never
-- by a direct insert.
revoke all on table public.list_visits from public, anon, authenticated;
revoke all on table public.forum_post_reads from public, anon, authenticated;
revoke all on table public.media_item_reads from public, anon, authenticated;
revoke all on table public.knowledge_article_reads from public, anon, authenticated;
revoke all on table public.service_reads from public, anon, authenticated;
revoke all on table public.mentoring_request_reads from public, anon, authenticated;
revoke all on table public.feedback_submission_reads from public, anon, authenticated;
grant select on table public.list_visits to authenticated;
grant select on table public.forum_post_reads to authenticated;
grant select on table public.media_item_reads to authenticated;
grant select on table public.knowledge_article_reads to authenticated;
grant select on table public.service_reads to authenticated;
grant select on table public.mentoring_request_reads to authenticated;
grant select on table public.feedback_submission_reads to authenticated;

-- 2. When the record starts ----------------------------------------------------------------------------------

-- Everything that became visible before this migration ran counts as seen, so
-- nobody opens the app to a number for every old post, story or service. The
-- moment is fixed when the migration runs on each database.
do $do$
begin
  execute format(
    'create function private.tab_news_started_at() returns timestamptz '
    'language sql immutable set search_path = '''' as %L',
    format('select %L::timestamptz', now())
  );
end;
$do$;

comment on function private.tab_news_started_at() is
  'When this database started recording what is new on Comunitat, Ajuda and Contacte (RAPP-873).';

-- 3. What is new for her -------------------------------------------------------------------------------------

-- Each list copies the conditions under which a player sees that content
-- today: the select policies of `forum_posts`, `forum_replies`, `media_items`,
-- `knowledge_articles` and `services`, including the rule that a test player
-- sees only what test players and the team wrote. Anything she wrote herself
-- never counts. Each list holds at most 200 entries, newest first.
create function private.my_tab_news()
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

create function public.my_tab_news()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.my_tab_news();
$$;

comment on function public.my_tab_news() is
  'What is new for the signed-in person on Comunitat, Ajuda and Contacte (RAPP-873).';

-- 4. Opening a thing -----------------------------------------------------------------------------------------

-- A thing is recorded only when she can see it: content of her organization
-- under the same conditions as the player lists, and only her own mentoring
-- requests and suggestions. A forum post, a mentoring request and a suggestion
-- keep the moment she last opened them, so a reply or a staff change after it
-- counts again. The other three are seen once and seen for good.
create function private.mark_tab_items_seen(
  p_forum_post_ids uuid[],
  p_media_item_ids uuid[],
  p_article_ids uuid[],
  p_service_ids uuid[],
  p_mentoring_request_ids uuid[],
  p_feedback_submission_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  sees_only_test_players boolean;
  max_items constant integer := 200;
begin
  if actor is null or actor_org is null then
    raise exception 'tab news access denied' using errcode = 'insufficient_privilege';
  end if;

  if coalesce(cardinality(p_forum_post_ids), 0) > max_items
    or coalesce(cardinality(p_media_item_ids), 0) > max_items
    or coalesce(cardinality(p_article_ids), 0) > max_items
    or coalesce(cardinality(p_service_ids), 0) > max_items
    or coalesce(cardinality(p_mentoring_request_ids), 0) > max_items
    or coalesce(cardinality(p_feedback_submission_ids), 0) > max_items then
    raise exception 'too many items marked as seen' using errcode = 'program_limit_exceeded';
  end if;

  sees_only_test_players := (select private.sees_only_test_players());

  insert into public.forum_post_reads (org_id, post_id, user_id, seen_at)
  select actor_org, post.id, actor, now()
  from public.forum_posts as post
  where post.id = any (coalesce(p_forum_post_ids, '{}'::uuid[]))
    and post.org_id = actor_org
    and post.visibility in ('visible', 'deleted')
    and (not sees_only_test_players or private.authored_by_test_or_team(post.author_id))
  on conflict (post_id, user_id) do update set seen_at = excluded.seen_at;

  insert into public.media_item_reads (org_id, media_item_id, user_id)
  select actor_org, item.id, actor
  from public.media_items as item
  where item.id = any (coalesce(p_media_item_ids, '{}'::uuid[]))
    and item.org_id = actor_org
    and item.moderation_state = 'visible'
    and (item.uploaded_by = actor or item.privacy_level = 'community')
    and (not sees_only_test_players or private.authored_by_test_or_team(item.uploaded_by))
  on conflict (media_item_id, user_id) do nothing;

  insert into public.knowledge_article_reads (org_id, article_id, user_id)
  select actor_org, article.id, actor
  from public.knowledge_articles as article
  where article.id = any (coalesce(p_article_ids, '{}'::uuid[]))
    and article.org_id = actor_org
    and article.is_published
    and article.published_at <= now()
    and (article.expires_at is null or article.expires_at > now())
    and (article.content_type <> 'participant_story'
      or not sees_only_test_players
      or private.authored_by_test_or_team(article.author_id))
  on conflict (article_id, user_id) do nothing;

  insert into public.service_reads (org_id, service_id, user_id)
  select actor_org, service.id, actor
  from public.services as service
  where service.id = any (coalesce(p_service_ids, '{}'::uuid[]))
    and service.org_id = actor_org
    and public.is_content_visible(service.status, service.published_at, service.expires_at)
  on conflict (service_id, user_id) do nothing;

  insert into public.mentoring_request_reads (org_id, request_id, user_id, seen_at)
  select actor_org, request.id, actor, now()
  from public.mentoring_requests as request
  where request.id = any (coalesce(p_mentoring_request_ids, '{}'::uuid[]))
    and request.org_id = actor_org
    and request.player_id = actor
  on conflict (request_id, user_id) do update set seen_at = excluded.seen_at;

  insert into public.feedback_submission_reads (org_id, submission_id, user_id, seen_at)
  select actor_org, submission.id, actor, now()
  from public.feedback_submissions as submission
  where submission.id = any (coalesce(p_feedback_submission_ids, '{}'::uuid[]))
    and submission.org_id = actor_org
    and submission.author_id = actor
  on conflict (submission_id, user_id) do update set seen_at = excluded.seen_at;
end;
$$;

create function public.mark_tab_items_seen(
  p_forum_post_ids uuid[] default '{}'::uuid[],
  p_media_item_ids uuid[] default '{}'::uuid[],
  p_article_ids uuid[] default '{}'::uuid[],
  p_service_ids uuid[] default '{}'::uuid[],
  p_mentoring_request_ids uuid[] default '{}'::uuid[],
  p_feedback_submission_ids uuid[] default '{}'::uuid[]
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.mark_tab_items_seen(
    p_forum_post_ids,
    p_media_item_ids,
    p_article_ids,
    p_service_ids,
    p_mentoring_request_ids,
    p_feedback_submission_ids
  );
$$;

comment on function public.mark_tab_items_seen(uuid[], uuid[], uuid[], uuid[], uuid[], uuid[]) is
  'Records the posts, gallery items, guides, stories, services, mentoring requests and suggestions the signed-in person has opened (RAPP-873).';

revoke all on function private.my_tab_news() from public, anon, authenticated;
revoke all on function public.my_tab_news() from public, anon, authenticated;
revoke all on function private.mark_tab_items_seen(uuid[], uuid[], uuid[], uuid[], uuid[], uuid[])
  from public, anon, authenticated;
revoke all on function public.mark_tab_items_seen(uuid[], uuid[], uuid[], uuid[], uuid[], uuid[])
  from public, anon, authenticated;
revoke all on function private.tab_news_started_at() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.my_tab_news() to authenticated;
grant execute on function public.my_tab_news() to authenticated;
grant execute on function private.mark_tab_items_seen(uuid[], uuid[], uuid[], uuid[], uuid[], uuid[])
  to authenticated;
grant execute on function public.mark_tab_items_seen(uuid[], uuid[], uuid[], uuid[], uuid[], uuid[])
  to authenticated;

-- 5. Seeing a list ------------------------------------------------------------------------------------------

-- A list of services or guides is one category of her organization; any
-- other key is rejected.
create function private.mark_lists_seen(p_list_keys text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  max_keys constant integer := 50;
  key_to_mark text;
  list_category_id uuid;
begin
  if actor is null or actor_org is null then
    raise exception 'tab news access denied' using errcode = 'insufficient_privilege';
  end if;

  if coalesce(cardinality(p_list_keys), 0) > max_keys then
    raise exception 'too many lists marked as seen' using errcode = 'program_limit_exceeded';
  end if;

  foreach key_to_mark in array coalesce(p_list_keys, '{}'::text[]) loop
    if key_to_mark is null then
      raise invalid_parameter_value using message = 'unknown list';
    elsif key_to_mark in ('forum', 'gallery', 'stories', 'activities', 'home') then
      null;
    elsif key_to_mark ~ '^services:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      list_category_id := substr(key_to_mark, length('services:') + 1)::uuid;
      if not exists (
        select 1 from public.service_categories as category
        where category.id = list_category_id and category.org_id = actor_org
      ) then
        raise invalid_parameter_value using message = 'unknown list';
      end if;
    elsif key_to_mark ~ '^guides:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      list_category_id := substr(key_to_mark, length('guides:') + 1)::uuid;
      if not exists (
        select 1 from public.knowledge_categories as category
        where category.id = list_category_id and category.org_id = actor_org
      ) then
        raise invalid_parameter_value using message = 'unknown list';
      end if;
    else
      raise invalid_parameter_value using message = 'unknown list';
    end if;

    insert into public.list_visits (org_id, user_id, list_key, visited_at)
    values (actor_org, actor, key_to_mark, now())
    on conflict (user_id, list_key) do update
      set visited_at = excluded.visited_at, org_id = excluded.org_id;
  end loop;
end;
$$;

create function public.mark_lists_seen(p_list_keys text[])
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.mark_lists_seen(p_list_keys);
$$;

comment on function public.mark_lists_seen(text[]) is
  'Records that the signed-in person has seen these lists, so their numbers clear; the cards keep "Nou" until she opens them (RAPP-873).';

revoke all on function private.mark_lists_seen(text[]) from public, anon, authenticated;
revoke all on function public.mark_lists_seen(text[]) from public, anon, authenticated;
grant execute on function private.mark_lists_seen(text[]) to authenticated;
grant execute on function public.mark_lists_seen(text[]) to authenticated;

-- 6. What happens to these rows when she asks to be erased -------------------------------------------------

-- The body of `20261118130000_onboarding_form_chains_in_erasure_registry.sql`, plus the seven new tables.
CREATE OR REPLACE FUNCTION public.personal_data_disposition()
 RETURNS TABLE(table_name text, participant_column text, disposition text, reason text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select * from (values
    ('app_terms_signatures', 'profile_id', 'purge', 'The app terms signature and photo/video choice.'),
    ('profiles', 'id', 'purge', 'The participant profile and its encrypted fields.'),
    ('participant_notes', 'profile_id', 'purge', 'Staff prose about the participant.'),
    ('push_tokens', 'user_id', 'purge', 'Registered participant devices.'),
    ('push_deliveries', 'recipient_id', 'purge', 'Per-device notification delivery history.'),
    ('custom_notification_group_members', 'participant_id', 'purge', 'Curated notification membership.'),
    ('terms_acceptances', 'profile_id', 'purge', 'Participant consent records.'),
    ('deletion_requests', 'profile_id', 'purge', 'Participant erasure requests.'),
    ('invites', 'accepted_by', 'purge', 'The invitation that admitted the participant.'),
    ('entity_invitations', 'profile_id', 'purge', 'The invitation that admitted an entity collaborator.'),
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
    ('entity_referrals', 'referred_profile_id', 'purge', 'Referral intake cascades with the linked participant.'),
    ('referral_updates', 'author_id', 'purge', 'Referral updates authored by the participant.'),
    ('mentoring_requests', 'player_id', 'purge', 'Private support requests belonging to the player.'),
    ('mentoring_notification_events', 'recipient_id', 'purge', 'Technical mentoring schedule notifications.'),
    ('feedback_submissions', 'author_id', 'purge', 'Encrypted feedback and its private attachment key.'),
    ('survey_responses', 'player_id', 'purge', 'Attributed encrypted survey responses.'),
    ('audit_log', 'actor_id', 'purge', 'Rows where the participant acted.'),
    ('audit_log', 'target_id', 'retain', 'Opaque lawful-access and erasure record.'),
    ('entity_referrals', null, 'retain_limited', 'Unlinked referral intake is purged after 24 months.'),
    ('entity_invitations', null, 'retain_limited', 'Expired entity invitations are purged after 24 months.'),
    ('notification_templates', null, 'not_personal', 'Organization-owned notification copy.'),
    ('custom_notification_groups', null, 'not_personal', 'Organization-owned audience definitions.'),
    ('targeted_notification_sends', null, 'not_personal', 'Aggregate organization send history.'),
    ('surveys', null, 'not_personal', 'Organization-owned survey definitions.'),
    ('survey_questions', null, 'not_personal', 'Organization-owned survey questions.'),
    ('staff_invitations', null, 'not_personal', 'Organization staff access administration history.'),
    ('internal_documents', null, 'not_personal', 'Organization-owned private operational documents.'),
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
    ('service_submission_comments', null, 'not_personal', 'Organization review correspondence.'),
    ('service_submission_notifications', null, 'not_personal', 'Organization staff queue.'),
    ('forum_categories', null, 'not_personal', 'Organization-owned forum vocabulary.'),
    ('collaborating_entities', null, 'not_personal', 'A tenant-owned partner organization.'),
    ('organizations', null, 'not_personal', 'A tenant, not a person.'),
    ('municipality_catalog', null, 'not_personal', 'Official geography with no participant data.'),
    ('permissions', null, 'not_personal', 'The product permission catalog.'),
    ('permission_preset_defaults', null, 'not_personal', 'Product default permissions of the built-in presets.'),
    ('permission_presets', null, 'not_personal', 'Organization-owned access presets.'),
    ('permission_preset_permissions', null, 'not_personal', 'Organization-owned access presets.'),
    ('team_member_access', null, 'not_personal', 'Team access administration; players never hold permissions.'),
    ('team_member_permissions', null, 'not_personal', 'Team access administration; players never hold permissions.'),
    ('equipment_item_types', null, 'not_personal', 'The organization''s material catalog.'),
    ('stock_movements', 'participant_id', 'purge', 'Stock movements keep their quantity so stock stays right; her link is cleared by ON DELETE SET NULL.'),
    ('stock_alerts', null, 'not_personal', 'Stock that went below zero, for the team to count.'),
    ('equipment_arrivals', null, 'not_personal', 'Goods received: source, problems and cost. No participant data.'),
    ('equipment_arrival_photos', null, 'not_personal', 'Photos of goods received and their receipts.'),
    ('stock_counts', null, 'not_personal', 'Stock counts: what was expected and what was on the shelf.'),
    ('staff_checkouts', null, 'not_personal', 'Material lent to a staff member for a trip or an event.'),
    ('photo_handoffs', null, 'not_personal', 'A staff member''s request to take a document photo with the phone.'),
    ('seasons', null, 'not_personal', 'The organization''s seasons.'),
    ('authorization_versions', null, 'not_personal', 'The organization''s published authorization texts.'),
    ('app_terms_versions', null, 'not_personal', 'The organization''s app terms texts, draft and published.'),
    ('authorization_signatures', 'profile_id', 'purge', 'Her signed or paper authorizations, with her drawn signature.'),
    ('consent_events', 'profile_id', 'purge', 'Each consent she gave or withdrew, with the text she was shown. Anonymizing keeps them as proof without her name and clears a staff reason; deleting her account deletes them.'),
    ('consents', null, 'not_personal', 'The consents of the organization, defined once (Dades legals).'),
    ('consent_placements', null, 'not_personal', 'Where each consent is asked.'),
    ('walk_in_signings', null, 'retain_limited', 'A walk-in''s tablet signing until staff confirm it; purged after 60 days.'),
    ('intake_screens', null, 'not_personal', 'Registration screens staff built.'),
    ('profile_sections', null, 'not_personal', 'Sections of the player profile layout.'),
    ('profile_fields', null, 'not_personal', 'The pieces of information the profile holds, and who created each.'),
    ('field_placements', null, 'not_personal', 'Where each piece of information is asked.'),
    ('form_blocks', null, 'not_personal', 'The blocks of the forms: a signature with the text it asks to accept, a text, a list of points.'),
    ('form_signatures', 'profile_id', 'purge', 'Her signatures of the form blocks, and the entity''s for her on a referral, with the strokes.'),
    ('walk_in_consents', null, 'retain_limited', 'A walk-in''s ticks of the Onboarding consents on the tablet until staff confirm her; moved to her consent history then, or purged with the walk-in.'),
    ('walk_in_form_signatures', null, 'retain_limited', 'A walk-in''s signatures of the Onboarding blocks until staff confirm her; moved to her profile then, or purged with the walk-in.'),
    ('custom_question_options', null, 'not_personal', 'Options of those questions.'),
    ('intake_builtin_screens', null, 'not_personal', 'Staff wording of the built-in onboarding screens and which are hidden.'),
    ('intake_flow_orders', null, 'not_personal', 'The order of the onboarding screens staff arranged.'),
    ('intake_state_presets', null, 'not_personal', 'Organization presets for which questions are asked.'),
    ('custom_answers', 'profile_id', 'purge', 'Every answer of her record, the app''s fields and the team''s. Anonymizing deletes them all and keeps only her birth year.'),
    ('referral_custom_answers', null, 'retain_limited', 'Extra answers sent with a referral; moved to her profile when she is invited, or purged with the referral.'),
    ('custom_question_states', 'profile_id', 'purge', 'Which fields staff chose to ask or not ask her, the app''s and the team''s.'),
    ('participant_search_documents', 'profile_id', 'purge', 'Her names and her Normal and Personal text answers, indexed for the participants search.'),
    ('staff_notifications', null, 'not_personal', 'The team''s bell: one row per team member; names render live from the source row and params hold no personal value.'),
    ('custom_forms', null, 'not_personal', 'Forms the team created: their names and choices.'),
    ('custom_form_screens', null, 'not_personal', 'The screens of the forms the team created.'),
    ('custom_form_responses', 'profile_id', 'purge', 'Each time she was asked a form, and when and by whom it was answered.'),
    ('custom_form_recipients', 'profile_id', 'purge', 'The forms the team picked her for.'),
    ('custom_form_versions', null, 'not_personal', 'The forms the team created as each was published.'),
    ('custom_form_reminders', null, 'not_personal', 'When the team was reminded to renew a repeating form.'),
    ('announcement_reads', 'user_id', 'purge', 'The announcements she has seen.'),
    ('event_reads', 'user_id', 'purge', 'The activities she has opened.'),
    ('onboarding_form_chains', null, 'not_personal', 'The order of the forms after Onboarding, set by the team.'),
    ('list_visits', 'user_id', 'purge', 'When she last saw each list of posts, photos, stories, activities, services or guides.'),
    ('forum_post_reads', 'user_id', 'purge', 'The forum posts she has opened, and when she last opened her own.'),
    ('media_item_reads', 'user_id', 'purge', 'The gallery items she has opened.'),
    ('knowledge_article_reads', 'user_id', 'purge', 'The guides and stories she has opened.'),
    ('service_reads', 'user_id', 'purge', 'The services she has opened.'),
    ('mentoring_request_reads', 'user_id', 'purge', 'When she last opened each of her mentoring requests.'),
    ('feedback_submission_reads', 'user_id', 'purge', 'When she last opened each of her suggestions.')
  ) as disposition(table_name, participant_column, disposition, reason);
$function$;
