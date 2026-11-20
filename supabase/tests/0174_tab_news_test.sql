begin;
select plan(54);

-- What is new for her on Comunitat, Ajuda and Contacte (RAPP-873). A thing is
-- new until she opens that thing. She is player ...0011. Another player,
-- ...0012, writes most of the content.

select has_table('public', 'forum_post_reads', 'opened forum posts are recorded per person');
select has_table('public', 'media_item_reads', 'opened gallery items are recorded per person');
select has_table('public', 'knowledge_article_reads', 'opened guides and stories are recorded per person');
select has_table('public', 'service_reads', 'opened services are recorded per person');
select has_table('public', 'mentoring_request_reads', 'opened mentoring requests are recorded per person');
select has_table('public', 'feedback_submission_reads', 'opened suggestions are recorded per person');

-- Opening a section clears nothing, so there is no record of it.
select hasnt_table('public', 'section_visits', 'opening a section is not recorded');
select hasnt_function('public', 'mark_section_visited', 'there is no way to mark a section as visited');
select hasnt_function('public', 'mark_help_items_seen', 'one function marks every kind of thing');

select is(
  (select array_agg(table_name order by table_name)
   from public.personal_data_disposition()
   where table_name in (
     'forum_post_reads', 'media_item_reads', 'knowledge_article_reads',
     'service_reads', 'mentoring_request_reads', 'feedback_submission_reads')
     and disposition = 'purge' and participant_column = 'user_id'),
  array[
    'feedback_submission_reads', 'forum_post_reads', 'knowledge_article_reads',
    'media_item_reads', 'mentoring_request_reads', 'service_reads'],
  'every record of what she opened is purged with her'
);

-- Content written before her record started counts as seen. Everything else
-- below is written in this transaction, so after the start of her record.

-- Forum: an old post, two new posts by another player, her own post, a hidden post.
insert into public.forum_posts (id, org_id, category_id, author_id, author_first_name, content, created_at)
values
  ('5eed0000-0000-4000-8873-000000000101', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8006-000000000001', '5eed0000-0000-4000-8000-000000000012', 'x',
   'An old post', now() - interval '30 days'),
  ('5eed0000-0000-4000-8873-000000000102', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8006-000000000001', '5eed0000-0000-4000-8000-000000000012', 'x',
   'A new post by another player', now()),
  ('5eed0000-0000-4000-8873-000000000103', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8006-000000000001', '5eed0000-0000-4000-8000-000000000011', 'x',
   'Her own post', now());
insert into public.forum_posts (id, org_id, category_id, author_id, author_first_name, content, visibility)
values
  ('5eed0000-0000-4000-8873-000000000104', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8006-000000000001', '5eed0000-0000-4000-8000-000000000012', 'x',
   'A hidden post', 'hidden');
insert into public.forum_posts (id, org_id, category_id, author_id, author_first_name, content)
values
  ('5eed0000-0000-4000-8873-000000000105', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8006-000000000001', '5eed0000-0000-4000-8000-000000000012', 'x',
   'A second new post by another player');

-- Replies: two by another player on her post, one of her own on her post, one
-- on another player's post.
insert into public.forum_replies (org_id, post_id, author_id, author_first_name, content)
values
  ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8873-000000000103',
   '5eed0000-0000-4000-8000-000000000012', 'x', 'First reply'),
  ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8873-000000000103',
   '5eed0000-0000-4000-8000-000000000013', 'x', 'Second reply'),
  ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8873-000000000103',
   '5eed0000-0000-4000-8000-000000000011', 'x', 'Her own reply'),
  ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8873-000000000102',
   '5eed0000-0000-4000-8000-000000000013', 'x', 'A reply on another post');

-- Gallery: new by another player, her own, only for the team, hidden.
insert into public.media_items (
  id, org_id, uploaded_by, uploader_first_name, file_url, file_type, file_size,
  privacy_level, moderation_state, consent_acknowledged_at, consent_version
)
values
  ('5eed0000-0000-4000-8873-000000000201', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8000-000000000012', 'x',
   '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000012/2026/11/87300000000000000000000000000201.jpg',
   'image', 1000, 'community', 'visible', now(), 'v1'),
  ('5eed0000-0000-4000-8873-000000000202', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8000-000000000011', 'x',
   '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000011/2026/11/87300000000000000000000000000202.jpg',
   'image', 1000, 'community', 'visible', now(), 'v1'),
  ('5eed0000-0000-4000-8873-000000000203', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8000-000000000012', 'x',
   '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000012/2026/11/87300000000000000000000000000203.jpg',
   'image', 1000, 'staff_only', 'visible', now(), 'v1'),
  ('5eed0000-0000-4000-8873-000000000204', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8000-000000000012', 'x',
   '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000012/2026/11/87300000000000000000000000000204.jpg',
   'image', 1000, 'community', 'hidden', now(), 'v1');

-- Stories: copies of the seeded published story, by another player, by her,
-- and one still waiting for review.
insert into public.knowledge_articles (
  id, org_id, category_id, title, body, content_type, story_status, author_id, author_first_name,
  is_published, published_at, submission_language, publication_consent, publication_consent_at,
  publication_consent_version
)
select
  copy.id, story.org_id, story.category_id, story.title, story.body, story.content_type,
  copy.story_status, copy.author_id, 'x', copy.story_status = 'published',
  case when copy.story_status = 'published' then now() end,
  story.submission_language, story.publication_consent, story.publication_consent_at,
  story.publication_consent_version
from public.knowledge_articles as story
cross join (values
  ('5eed0000-0000-4000-8873-000000000301'::uuid, 'published', '5eed0000-0000-4000-8000-000000000012'::uuid),
  ('5eed0000-0000-4000-8873-000000000302'::uuid, 'published', '5eed0000-0000-4000-8000-000000000011'::uuid),
  ('5eed0000-0000-4000-8873-000000000303'::uuid, 'submitted', '5eed0000-0000-4000-8000-000000000012'::uuid)
) as copy (id, story_status, author_id)
where story.id = '5eed0000-0000-4000-8005-000000000003';

-- Guides: copies of the seeded tutorial: new, old, scheduled for tomorrow, and
-- one that expired a moment ago.
insert into public.knowledge_articles (
  id, org_id, category_id, title, body, content_type, is_published, published_at, expires_at
)
select copy.id, guide.org_id, guide.category_id, guide.title, guide.body, guide.content_type,
  true, copy.published_at, copy.expires_at
from public.knowledge_articles as guide
cross join (values
  ('5eed0000-0000-4000-8873-000000000401'::uuid, now(), null::timestamptz),
  ('5eed0000-0000-4000-8873-000000000402'::uuid, now() - interval '30 days', null::timestamptz),
  ('5eed0000-0000-4000-8873-000000000403'::uuid, now() + interval '1 day', null::timestamptz),
  ('5eed0000-0000-4000-8873-000000000404'::uuid,
   now() - interval '2 microseconds', now() - interval '1 microsecond')
) as copy (id, published_at, expires_at)
where guide.id = '5eed0000-0000-4000-8005-000000000001';

-- Services: copies of a seeded published service: two new, a draft, an expired one.
insert into public.services (
  id, org_id, category_id, title, description, cost_type, cost_amount, availability,
  metadata, status, published_at, expires_at
)
select copy.id, service.org_id, service.category_id, service.title, service.description,
  service.cost_type, service.cost_amount, service.availability,
  service.metadata, copy.status, copy.published_at, copy.expires_at
from (
  select * from public.services where status = 'published' order by id limit 1
) as service
cross join (values
  ('5eed0000-0000-4000-8873-000000000501'::uuid, 'published', now(), null::timestamptz),
  ('5eed0000-0000-4000-8873-000000000502'::uuid, 'published', now(), null::timestamptz),
  ('5eed0000-0000-4000-8873-000000000503'::uuid, 'draft', null::timestamptz, null::timestamptz),
  ('5eed0000-0000-4000-8873-000000000504'::uuid, 'published',
   now() - interval '2 microseconds', now() - interval '1 microsecond')
) as copy (id, status, published_at, expires_at);

-- Another organization, with a player, a forum post and a gallery item.
insert into public.organizations (id, name, slug)
values ('87300000-0000-4000-8000-000000000000', 'Una altra', 'una-altra-873');
insert into auth.users (id, email) values ('87300000-0000-4000-8000-000000000011', 'player-873@example.test');
insert into public.profiles (id, org_id, role, first_name, last_name)
values ('87300000-0000-4000-8000-000000000011', '87300000-0000-4000-8000-000000000000', 'player', 'Altra', 'Jugadora')
on conflict (id) do update set org_id = excluded.org_id, role = excluded.role;
insert into public.forum_categories (id, org_id, name, slug, icon, color)
values ('87300000-0000-4000-8006-000000000001', '87300000-0000-4000-8000-000000000000',
  '{"ca": "General"}', 'general', 'chat', 'blue');
insert into public.forum_posts (id, org_id, category_id, author_id, author_first_name, content)
values ('87300000-0000-4000-8873-000000000101', '87300000-0000-4000-8000-000000000000',
  '87300000-0000-4000-8006-000000000001', '87300000-0000-4000-8000-000000000011', 'x',
  'A post in another organization');
insert into public.media_items (
  id, org_id, uploaded_by, uploader_first_name, file_url, file_type, file_size,
  privacy_level, moderation_state, consent_acknowledged_at, consent_version
)
values ('87300000-0000-4000-8873-000000000201', '87300000-0000-4000-8000-000000000000',
  '87300000-0000-4000-8000-000000000011', 'x',
  '87300000-0000-4000-8000-000000000000/gallery/87300000-0000-4000-8000-000000000011/2026/11/87300000000000000000000000000299.jpg',
  'image', 1000, 'community', 'visible', now(), 'v1');

-- Her two mentoring requests and two suggestions, as she creates them.
insert into public.mentoring_requests (id, org_id, player_id, topic)
values
  ('5eed0000-0000-4000-8873-000000000601', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8000-000000000011', 'digital_skills'),
  ('5eed0000-0000-4000-8873-000000000602', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8000-000000000011', 'empowerment');
insert into public.feedback_submissions (id, org_id, author_id, type, content_encrypted)
values
  ('5eed0000-0000-4000-8873-000000000701', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8000-000000000011', 'idea', public.encrypt_field('An idea')),
  ('5eed0000-0000-4000-8873-000000000702', '5eed0000-0000-4000-8000-000000000000',
   '5eed0000-0000-4000-8000-000000000011', 'idea', public.encrypt_field('Another idea'));

-- The staff schedule one request and read one suggestion.
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select lives_ok(
  $$ select public.schedule_mentoring_request(
       '5eed0000-0000-4000-8873-000000000601',
       now() + interval '2 days',
       '5eed0000-0000-4000-8000-000000000002',
       null
     ) $$,
  'the staff schedule her first mentoring request'
);
select lives_ok(
  $$ select public.transition_feedback_submission('5eed0000-0000-4000-8873-000000000701', 'read') $$,
  'the staff read her first suggestion'
);

-- She opens the app.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select ok(
  (select (public.my_tab_news() ->> 'since')::timestamptz) < now(),
  'her record starts at a moment in the past'
);

select is(
  (select public.my_tab_news() -> 'forum' -> 'new_post_ids'),
  '["5eed0000-0000-4000-8873-000000000105", "5eed0000-0000-4000-8873-000000000102"]'::jsonb,
  'the two new posts by another player count; the old one, her own and the hidden one do not'
);
select is(
  (select public.my_tab_news() -> 'forum' -> 'new_replies'),
  '[{"post_id": "5eed0000-0000-4000-8873-000000000103", "count": 2}]'::jsonb,
  'the two replies by others on her post count; hers and the one on another post do not'
);
select is(
  (select public.my_tab_news() -> 'gallery' -> 'new_item_ids'),
  '["5eed0000-0000-4000-8873-000000000201"]'::jsonb,
  'the new gallery item by another player counts; hers, the team-only one and the hidden one do not'
);
select is(
  (select public.my_tab_news() -> 'stories' -> 'new_article_ids'),
  '["5eed0000-0000-4000-8873-000000000301"]'::jsonb,
  'the new story by another player counts; hers and the one under review do not'
);
select ok(
  (select public.my_tab_news() -> 'guides' -> 'new_articles') @> '[{"id": "5eed0000-0000-4000-8873-000000000401"}]'::jsonb,
  'the new guide counts'
);
select is(
  (select count(*)::integer from jsonb_array_elements(public.my_tab_news() -> 'guides' -> 'new_articles') as guide
   where guide ->> 'id' in (
     '5eed0000-0000-4000-8873-000000000402',
     '5eed0000-0000-4000-8873-000000000403',
     '5eed0000-0000-4000-8873-000000000404',
     '5eed0000-0000-4000-8873-000000000301')),
  0,
  'the old guide, the scheduled one, the expired one and the stories are not guides that count'
);
select ok(
  (select (guide ->> 'category_id') is not null
   from jsonb_array_elements(public.my_tab_news() -> 'guides' -> 'new_articles') as guide
   where guide ->> 'id' = '5eed0000-0000-4000-8873-000000000401'),
  'a new guide carries its category'
);
select ok(
  (select public.my_tab_news() -> 'services' -> 'new_services')
    @> '[{"id": "5eed0000-0000-4000-8873-000000000501"}, {"id": "5eed0000-0000-4000-8873-000000000502"}]'::jsonb,
  'the two new services count'
);
select is(
  (select count(*)::integer from jsonb_array_elements(public.my_tab_news() -> 'services' -> 'new_services') as service
   where service ->> 'id' in ('5eed0000-0000-4000-8873-000000000503', '5eed0000-0000-4000-8873-000000000504')),
  0,
  'the draft service and the expired one do not count'
);
select is(
  (select public.my_tab_news() -> 'mentoring' -> 'changed_request_ids'),
  '["5eed0000-0000-4000-8873-000000000601"]'::jsonb,
  'the request the staff scheduled counts; the one she only created does not'
);
select is(
  (select public.my_tab_news() -> 'feedback' -> 'changed_submission_ids'),
  '["5eed0000-0000-4000-8873-000000000701"]'::jsonb,
  'the suggestion the staff read counts; the one nobody touched does not'
);
select ok(
  not (public.my_tab_news()::text like '%87300000-0000-4000-8873-%'),
  'nothing from another organization appears'
);


-- Opening a post removes that post only; her replies still count.
select lives_ok(
  $$ select public.mark_tab_items_seen(p_forum_post_ids => array['5eed0000-0000-4000-8873-000000000102']::uuid[]) $$,
  'she opens a post by another player'
);
select is(
  (select public.my_tab_news() -> 'forum'),
  '{"new_post_ids": ["5eed0000-0000-4000-8873-000000000105"], "new_replies": [{"post_id": "5eed0000-0000-4000-8873-000000000103", "count": 2}]}'::jsonb,
  'only the opened post stops counting'
);

-- Opening her own post clears its replies.
select lives_ok(
  $$ select public.mark_tab_items_seen(p_forum_post_ids => array['5eed0000-0000-4000-8873-000000000103']::uuid[]) $$,
  'she opens her own post'
);
select is(
  (select public.my_tab_news() -> 'forum' -> 'new_replies'),
  '[]'::jsonb,
  'the replies on her post stop counting once she opened it'
);

-- A reply written after she opened her post counts again. The time of one
-- transaction is fixed, so the later reply carries a time a minute ahead.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into public.forum_replies (org_id, post_id, author_id, author_first_name, content, created_at)
values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8873-000000000103',
  '5eed0000-0000-4000-8000-000000000012', 'x', 'A later reply', now() + interval '1 minute');
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select public.my_tab_news() -> 'forum' -> 'new_replies'),
  '[{"post_id": "5eed0000-0000-4000-8873-000000000103", "count": 1}]'::jsonb,
  'a reply written after she opened her post counts again'
);

-- Opening a gallery item, a story, a guide and a service removes exactly those.
select lives_ok(
  $$ select public.mark_tab_items_seen(
       p_media_item_ids => array['5eed0000-0000-4000-8873-000000000201']::uuid[],
       p_article_ids => array[
         '5eed0000-0000-4000-8873-000000000301',
         '5eed0000-0000-4000-8873-000000000401']::uuid[],
       p_service_ids => array['5eed0000-0000-4000-8873-000000000501']::uuid[]
     ) $$,
  'she opens a gallery item, a story, a guide and a service'
);
select is(
  (select public.my_tab_news() -> 'gallery' -> 'new_item_ids'),
  '[]'::jsonb,
  'the opened gallery item stops counting'
);
select is(
  (select public.my_tab_news() -> 'stories' -> 'new_article_ids'),
  '[]'::jsonb,
  'the opened story stops counting'
);
select ok(
  not ((select public.my_tab_news() -> 'guides' -> 'new_articles') @> '[{"id": "5eed0000-0000-4000-8873-000000000401"}]'::jsonb),
  'the opened guide stops counting'
);
select ok(
  not ((select public.my_tab_news() -> 'services' -> 'new_services') @> '[{"id": "5eed0000-0000-4000-8873-000000000501"}]'::jsonb)
    and (select public.my_tab_news() -> 'services' -> 'new_services') @> '[{"id": "5eed0000-0000-4000-8873-000000000502"}]'::jsonb,
  'the opened service stops counting and the other new service still counts'
);
select lives_ok(
  $$ select public.mark_tab_items_seen(p_media_item_ids => array['5eed0000-0000-4000-8873-000000000201']::uuid[]) $$,
  'opening the same gallery item again changes nothing'
);
select is(
  (select count(*)::integer from public.knowledge_article_reads),
  2,
  'the story and the guide are both recorded'
);

-- A staff change to her request counts until she opens it.
select lives_ok(
  $$ select public.mark_tab_items_seen(p_mentoring_request_ids => array['5eed0000-0000-4000-8873-000000000601']::uuid[]) $$,
  'she opens the request the staff scheduled'
);
select is(
  (select public.my_tab_news() -> 'mentoring' -> 'changed_request_ids'),
  '[]'::jsonb,
  'the opened request stops counting'
);

-- A later staff change counts again. The staff reschedule, a minute later.
reset role;
insert into public.mentoring_notification_events (org_id, request_id, recipient_id, kind, created_at)
values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8873-000000000601',
  '5eed0000-0000-4000-8000-000000000011', 'changed', now() + interval '1 minute');
set local role authenticated;
select is(
  (select public.my_tab_news() -> 'mentoring' -> 'changed_request_ids'),
  '["5eed0000-0000-4000-8873-000000000601"]'::jsonb,
  'a staff change after she opened the request counts again'
);

-- The same for a suggestion.
select lives_ok(
  $$ select public.mark_tab_items_seen(p_feedback_submission_ids => array['5eed0000-0000-4000-8873-000000000701']::uuid[]) $$,
  'she taps the suggestion the staff read'
);
select is(
  (select public.my_tab_news() -> 'feedback' -> 'changed_submission_ids'),
  '[]'::jsonb,
  'the opened suggestion stops counting'
);

-- The staff move it on a minute later. The time trigger would write the fixed
-- time of this transaction, so it is paused for this one update.
reset role;
alter table public.feedback_submissions disable trigger feedback_submissions_set_updated_at;
update public.feedback_submissions
set status = 'in_progress', updated_at = now() + interval '1 minute'
where id = '5eed0000-0000-4000-8873-000000000701';
alter table public.feedback_submissions enable trigger feedback_submissions_set_updated_at;
set local role authenticated;
select is(
  (select public.my_tab_news() -> 'feedback' -> 'changed_submission_ids'),
  '["5eed0000-0000-4000-8873-000000000701"]'::jsonb,
  'a status change after she opened the suggestion counts again'
);

select throws_ok(
  $$ insert into public.forum_post_reads (org_id, post_id, user_id)
     values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8873-000000000105',
       '5eed0000-0000-4000-8000-000000000011') $$,
  '42501', null, 'an opened post is never written by a direct insert'
);
select throws_ok(
  $$ insert into public.media_item_reads (org_id, media_item_id, user_id)
     values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8873-000000000201',
       '5eed0000-0000-4000-8000-000000000011') $$,
  '42501', null, 'an opened gallery item is never written by a direct insert'
);
select throws_ok(
  $$ insert into public.knowledge_article_reads (org_id, article_id, user_id)
     values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8873-000000000401',
       '5eed0000-0000-4000-8000-000000000011') $$,
  '42501', null, 'an opened guide or story is never written by a direct insert'
);
select throws_ok(
  $$ insert into public.service_reads (org_id, service_id, user_id)
     values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8873-000000000502',
       '5eed0000-0000-4000-8000-000000000011') $$,
  '42501', null, 'an opened service is never written by a direct insert'
);
select throws_ok(
  $$ insert into public.mentoring_request_reads (org_id, request_id, user_id)
     values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8873-000000000602',
       '5eed0000-0000-4000-8000-000000000011') $$,
  '42501', null, 'an opened request is never written by a direct insert'
);
select throws_ok(
  $$ insert into public.feedback_submission_reads (org_id, submission_id, user_id)
     values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8873-000000000702',
       '5eed0000-0000-4000-8000-000000000011') $$,
  '42501', null, 'an opened suggestion is never written by a direct insert'
);

-- Another player sees none of her rows and cannot mark her request or suggestion.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select count(*) from public.forum_post_reads)
    + (select count(*) from public.media_item_reads)
    + (select count(*) from public.knowledge_article_reads)
    + (select count(*) from public.service_reads)
    + (select count(*) from public.mentoring_request_reads)
    + (select count(*) from public.feedback_submission_reads),
  0::bigint,
  'another player sees none of her rows'
);
select lives_ok(
  $$ select public.mark_tab_items_seen(
       p_mentoring_request_ids => array['5eed0000-0000-4000-8873-000000000602']::uuid[],
       p_feedback_submission_ids => array['5eed0000-0000-4000-8873-000000000702']::uuid[]
     ) $$,
  'another player tries to mark her request and her suggestion'
);
reset role;
select is(
  (select count(*) from public.mentoring_request_reads
   where user_id = '5eed0000-0000-4000-8000-000000000012')
    + (select count(*) from public.feedback_submission_reads
       where user_id = '5eed0000-0000-4000-8000-000000000012'),
  0::bigint,
  'nothing is recorded for a request or a suggestion that is not hers'
);
set local role authenticated;

-- A signed-in role with no person behind it is turned away.
set local request.jwt.claims = '{"role": "authenticated"}';
select throws_ok(
  $$ select public.mark_tab_items_seen(p_service_ids => array['5eed0000-0000-4000-8873-000000000502']::uuid[]) $$,
  '42501',
  null,
  'marking without a session is rejected'
);

-- An anonymous caller cannot reach any of it. The privilege is checked
-- directly: on the local image any statement run as anon ends the server
-- process, also for tables and functions older than RAPP-873.
reset role;
select ok(
  not has_function_privilege('anon', 'public.my_tab_news()', 'execute')
    and not has_function_privilege(
      'anon', 'public.mark_tab_items_seen(uuid[], uuid[], uuid[], uuid[], uuid[], uuid[])', 'execute'),
  'an anonymous caller cannot read what is new or mark anything'
);

select * from finish();
rollback;
