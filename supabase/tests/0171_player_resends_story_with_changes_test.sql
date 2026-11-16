-- RAPP-814: a player edits and resends her own story while the team asks for changes.
-- Runs with: bunx supabase test db

begin;
select plan(21);

select has_function(
  'public', 'resend_participant_story', array['uuid', 'text', 'text'],
  'the resend path exists'
);
select ok(
  not has_function_privilege('anon', 'public.resend_participant_story(uuid, text, text)', 'execute'),
  'a signed-out client cannot call the resend path'
);
select ok(
  has_function_privilege('authenticated', 'public.resend_participant_story(uuid, text, text)', 'execute'),
  'a signed-in client can call the resend path'
);

-- Fixtures, written as the database owner: her stories, one per state, and
-- one story of another player.
insert into public.knowledge_articles (
  id, org_id, category_id, title, body, content_type, story_status, author_id,
  submission_language, story_image_urls, publication_consent, publication_consent_at,
  publication_consent_version
)
select
  story.id::uuid,
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8004-000000000004',
  jsonb_build_object('ar', story.title),
  jsonb_build_object('ar', jsonb_build_array(jsonb_build_object('type', 'paragraph', 'text', 'نص أول'))),
  'participant_story', 'submitted', story.author_id::uuid, 'ar',
  case when story.id like '%0001' then array[
    '5eed0000-0000-4000-8000-000000000000/stories/5eed0000-0000-4000-8000-000000000011/2026/11/11111111111111111111111111111111.jpg'
  ] else '{}'::text[] end,
  true, now(), 'story-publication-v1'
from (values
  ('5eed0000-0000-4000-8814-000000000001', 'تحتاج تغييرات', '5eed0000-0000-4000-8000-000000000011'),
  ('5eed0000-0000-4000-8814-000000000002', 'مرسلة', '5eed0000-0000-4000-8000-000000000011'),
  ('5eed0000-0000-4000-8814-000000000003', 'قيد المراجعة', '5eed0000-0000-4000-8000-000000000011'),
  ('5eed0000-0000-4000-8814-000000000004', 'منشورة', '5eed0000-0000-4000-8000-000000000011'),
  ('5eed0000-0000-4000-8814-000000000005', 'مرفوضة', '5eed0000-0000-4000-8000-000000000011'),
  ('5eed0000-0000-4000-8814-000000000006', 'قصة أخرى', '5eed0000-0000-4000-8000-000000000012')
) as story(id, title, author_id);

update public.knowledge_articles set story_status = 'in_review'
 where id in (
   '5eed0000-0000-4000-8814-000000000001', '5eed0000-0000-4000-8814-000000000003',
   '5eed0000-0000-4000-8814-000000000004', '5eed0000-0000-4000-8814-000000000005',
   '5eed0000-0000-4000-8814-000000000006'
 );
update public.knowledge_articles
   set story_status = 'changes_requested', reviewer_note = 'Explica una mica més el primer entrenament.'
 where id in ('5eed0000-0000-4000-8814-000000000001', '5eed0000-0000-4000-8814-000000000006');
update public.knowledge_articles set story_status = 'rejected'
 where id = '5eed0000-0000-4000-8814-000000000005';
update public.knowledge_articles
   set title = '{"ca":"Publicada","es":"Publicada","en":"Published","ar":"منشورة","fa":"منتشر شده"}',
       body = '{"ca":[{"type":"paragraph","text":"Text"}],"es":[{"type":"paragraph","text":"Texto"}],"en":[{"type":"paragraph","text":"Text"}],"ar":[{"type":"paragraph","text":"نص"}],"fa":[{"type":"paragraph","text":"متن"}]}'::jsonb,
       story_status = 'published', is_published = true, published_at = now()
 where id = '5eed0000-0000-4000-8814-000000000004';

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select results_eq(
  $$ select id::text, story_status from public.knowledge_articles
      where id::text like '5eed0000-0000-4000-8814-%' order by id $$,
  $$ values
       ('5eed0000-0000-4000-8814-000000000001', 'changes_requested'),
       ('5eed0000-0000-4000-8814-000000000002', 'submitted'),
       ('5eed0000-0000-4000-8814-000000000003', 'in_review'),
       ('5eed0000-0000-4000-8814-000000000004', 'published'),
       ('5eed0000-0000-4000-8814-000000000005', 'rejected'),
       ('5eed0000-0000-4000-8814-000000000006', 'changes_requested') $$,
  'the fixtures cover every story state'
);

-- A team member is no player: the resend path is not hers.
select throws_ok(
  $$ select public.resend_participant_story('5eed0000-0000-4000-8814-000000000001', 'Títol', 'Text') $$,
  '42501', null::text,
  'a team member cannot resend a player story'
);

-- The author.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select throws_ok(
  $$ select public.resend_participant_story('5eed0000-0000-4000-8814-000000000006', 'Títol', 'Text') $$,
  'P0002', null::text,
  'a player cannot resend another player story'
);
select throws_ok(
  $$ select public.resend_participant_story('5eed0000-0000-4000-8005-000000000001', 'Títol', 'Text') $$,
  'P0002', null::text,
  'a player cannot rewrite a team resource'
);
select throws_ok(
  $$ select public.resend_participant_story('5eed0000-0000-4000-8814-000000000002', 'Títol', 'Text') $$,
  'P0002', null::text,
  'a submitted story cannot be resent'
);
select throws_ok(
  $$ select public.resend_participant_story('5eed0000-0000-4000-8814-000000000003', 'Títol', 'Text') $$,
  'P0002', null::text,
  'a story in review cannot be resent'
);
select throws_ok(
  $$ select public.resend_participant_story('5eed0000-0000-4000-8814-000000000004', 'Títol', 'Text') $$,
  'P0002', null::text,
  'a published story cannot be resent'
);
select throws_ok(
  $$ select public.resend_participant_story('5eed0000-0000-4000-8814-000000000005', 'Títol', 'Text') $$,
  'P0002', null::text,
  'a rejected story cannot be resent'
);
select throws_ok(
  $$ select public.resend_participant_story('5eed0000-0000-4000-8814-000000000001', '   ', 'Text') $$,
  '23514', null::text,
  'a blank title is refused'
);
select throws_ok(
  $$ select public.resend_participant_story('5eed0000-0000-4000-8814-000000000001', 'Títol', repeat('a', 10001)) $$,
  '23514', null::text,
  'a text over 10,000 characters is refused'
);
select throws_ok(
  $$ select public.resend_participant_story('5eed0000-0000-4000-8814-000000000001', repeat('a', 201), 'Text') $$,
  '23514', null::text,
  'a title over 200 characters is refused'
);

select lives_ok(
  $$ select public.resend_participant_story(
       '5eed0000-0000-4000-8814-000000000001',
       '  قصتي الجديدة  ',
       'أول تدريب كان في يوم ممطر.'
     ) $$,
  'the author resends her story while the team asks for changes'
);

select results_eq(
  $$ select story_status, reviewer_note, title, body, submission_language,
            cardinality(story_image_urls), publication_consent
       from public.knowledge_articles where id = '5eed0000-0000-4000-8814-000000000001' $$,
  $$ values (
       'submitted'::text, null::text,
       '{"ar":"قصتي الجديدة"}'::jsonb,
       '{"ar":[{"type":"paragraph","text":"أول تدريب كان في يوم ممطر."}]}'::jsonb,
       'ar'::text, 1, true
     ) $$,
  'the story is submitted again with her new title and text; language, photos and consent are kept'
);

select throws_ok(
  $$ select public.resend_participant_story('5eed0000-0000-4000-8814-000000000001', 'Títol', 'Text') $$,
  'P0002', null::text,
  'a resent story cannot be resent again until the team asks for changes'
);

-- The team sees it in its review queue with her new text.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select is(
  (select title->>'ar' from public.knowledge_articles
    where content_type = 'participant_story' and story_status = 'submitted'
      and id = '5eed0000-0000-4000-8814-000000000001'),
  'قصتي الجديدة',
  'the team finds the resent story among the submitted stories'
);

-- Signed in without an identity.
set local request.jwt.claims = '{"role": "authenticated"}';

select throws_ok(
  $$ select public.resend_participant_story('5eed0000-0000-4000-8814-000000000006', 'Títol', 'Text') $$,
  '42501', null::text,
  'a caller without an identity cannot resend'
);

-- Signed out: the anon role holds no execute right (checked at the top), and
-- PUBLIC holds none either. Calling an ungranted function as anon is not
-- exercised here because it crashes the local Postgres image.
reset role;

select ok(
  not exists (
    select 1
    from aclexplode((select proacl from pg_proc
                     where oid = 'public.resend_participant_story(uuid, text, text)'::regprocedure)) as acl
    where acl.grantee = 0
  ),
  'PUBLIC cannot call the resend path'
);

select is(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'knowledge_articles' and cmd = 'UPDATE')::int,
  1,
  'the team update policy stays the only update policy on knowledge articles'
);

select * from finish();
rollback;
