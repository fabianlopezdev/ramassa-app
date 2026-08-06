-- Knowledge base CRUD, structured content, story review, and tenant isolation.
-- Runs with: bunx supabase test db

begin;
select plan(47);

select has_table('public', 'knowledge_categories', 'knowledge categories exist');
select has_table('public', 'knowledge_articles', 'knowledge articles exist');
select has_column('public', 'knowledge_articles', 'body', 'article bodies are structured JSONB');
select has_column('public', 'knowledge_articles', 'video_url', 'articles can embed one allowlisted video');
select has_column('public', 'knowledge_articles', 'content_type', 'article content types are explicit');
select has_column('public', 'knowledge_articles', 'story_status', 'participant story review state is explicit');
select has_column('public', 'knowledge_articles', 'author_id', 'participant story ownership is explicit');
select has_column('public', 'knowledge_articles', 'author_first_name', 'published attribution stores first name only');
select has_column('public', 'knowledge_articles', 'reviewer_note', 'review outcomes can carry an in-app note');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.knowledge_categories'::regclass),
  'category RLS is enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.knowledge_articles'::regclass),
  'article RLS is enabled'
);
select has_function(
  'public', 'is_knowledge_body_valid', array['jsonb', 'boolean'],
  'the database validates structured blocks independently of the client'
);
select has_function(
  'public', 'is_allowed_video_url', array['text'],
  'the database owns the video host allowlist too'
);
select has_function(
  'public', 'is_story_status_transition_allowed', array['text', 'text'],
  'the story transition graph is a database invariant'
);

select is(
  (select count(*) from public.knowledge_categories)::int,
  4,
  'the four canonical categories are seeded'
);

select throws_ok(
  $$ insert into public.knowledge_articles
       (org_id, category_id, title, body, video_url)
     values (
       '5eed0000-0000-4000-8000-000000000000',
       '5eed0000-0000-4000-8004-000000000001',
       '{"ca":"Enllaç hostil"}',
       '{"ca":[{"type":"paragraph","text":"Text segur"}]}'::jsonb,
       'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ'
     ) $$,
  '23514',
  null::text,
  'deceptive video hosts are rejected in Postgres'
);

select throws_ok(
  $$ insert into public.knowledge_articles
       (org_id, category_id, title, body, is_published, published_at)
     values (
       '5eed0000-0000-4000-8000-000000000000',
       '5eed0000-0000-4000-8004-000000000001',
       '{"ca":"Guia","es":"Guía","en":"Guide","ar":"دليل","fa":"راهنما"}',
       '{"ca":[{"type":"paragraph","text":"Text"}],"es":[{"type":"paragraph","text":"Texto"}],"en":[],"ar":[{"type":"paragraph","text":"نص"}],"fa":[{"type":"paragraph","text":"متن"}]}'::jsonb,
       true,
       now()
     ) $$,
  '23514',
  null::text,
  'published translations cannot drift from the Catalan block structure'
);

select throws_ok(
  $$ insert into public.knowledge_articles
       (org_id, category_id, title, body, content_type, story_status, author_id)
     values (
       '5eed0000-0000-4000-8000-000000000000',
       '5eed0000-0000-4000-8004-000000000004',
       '{"ca":"Sense autora"}',
       '{"ca":[{"type":"paragraph","text":"Text"}]}'::jsonb,
       'participant_story',
       'submitted',
       null
     ) $$,
  '23514',
  null::text,
  'a participant story cannot exist without its author'
);

insert into public.organizations (id, name, slug)
values ('5eed0000-0000-4000-8000-999999999999', 'Another club', 'knowledge-other-club')
on conflict (id) do nothing;

insert into public.knowledge_categories (id, org_id, name, slug, icon)
values (
  '5eed0000-0000-4000-8004-999999999999',
  '5eed0000-0000-4000-8000-999999999999',
  '{"ca":"Altres","es":"Otros","en":"Other","ar":"أخرى","fa":"دیگر"}',
  'other',
  'book-open'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.knowledge_articles (category_id, title, body)
     values (
       '5eed0000-0000-4000-8004-000000000001',
       '{"ca":"Nova guia"}',
       '{"ca":[{"type":"paragraph","text":"Cos"}]}'::jsonb
     ) $$,
  'staff can save a Catalan structured draft'
);

select is(
  (select count(*) from public.knowledge_articles where title->>'ca' = 'Nova guia')::int,
  1,
  'staff reads the draft it created'
);

select throws_ok(
  $$ insert into public.knowledge_articles (org_id, category_id, title, body)
     values (
       '5eed0000-0000-4000-8000-999999999999',
       '5eed0000-0000-4000-8004-999999999999',
       '{"ca":"Fora"}',
       '{"ca":[{"type":"paragraph","text":"Fora"}]}'::jsonb
     ) $$,
  '42501',
  null::text,
  'staff cannot write into another organization'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.knowledge_articles
       (category_id, title, body, content_type, story_status, author_id,
        submission_language, publication_consent, publication_consent_version)
     values (
       '5eed0000-0000-4000-8004-000000000004',
       '{"ca":"El meu primer partit"}',
       '{"ca":[{"type":"paragraph","text":"Vaig sentir que formava part de l’equip."}]}'::jsonb,
       'participant_story',
       'submitted',
       '5eed0000-0000-4000-8000-000000000011',
       'ca',
       true,
       'story-publication-v1'
     ) $$,
  'a player can submit only her own unpublished story'
);

select is(
  (select author_first_name from public.knowledge_articles where title->>'ca' = 'El meu primer partit'),
  (select first_name from public.profiles where id = '5eed0000-0000-4000-8000-000000000011'),
  'the server snapshots first-name-only attribution'
);

select is(
  (select story_status from public.knowledge_articles where title->>'ca' = 'El meu primer partit'),
  'submitted',
  'the author can read her in-app review state'
);

update public.knowledge_articles
set story_status = 'published', is_published = true, published_at = now()
where title->>'ca' = 'El meu primer partit';

select is(
  (select story_status from public.knowledge_articles where title->>'ca' = 'El meu primer partit'),
  'submitted',
  'a player update affects zero rows and cannot publish her own story'
);

select throws_ok(
  $$ insert into public.knowledge_articles
       (category_id, title, body, content_type, story_status, author_id,
        submission_language, publication_consent, publication_consent_version)
     values (
       '5eed0000-0000-4000-8004-000000000004',
       '{"ca":"Suplantació"}',
       '{"ca":[{"type":"paragraph","text":"No"}]}'::jsonb,
       'participant_story',
       'submitted',
       '5eed0000-0000-4000-8000-000000000012',
       'ca',
       true,
       'story-publication-v1'
     ) $$,
  '42501',
  null::text,
  'a player cannot submit in another participant’s name'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated"}';

select is(
  (select count(*) from public.knowledge_articles where title->>'ca' = 'El meu primer partit')::int,
  0,
  'another player cannot read an unpublished story'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated"}';

select throws_ok(
  $$ update public.knowledge_articles set story_status = 'published'
       where title->>'ca' = 'El meu primer partit' $$,
  '23514',
  null::text,
  'staff cannot skip review and publish directly from submitted'
);

select lives_ok(
  $$ update public.knowledge_articles set story_status = 'in_review'
       where title->>'ca' = 'El meu primer partit' $$,
  'staff can start reviewing a submitted story'
);

select lives_ok(
  $$ update public.knowledge_articles
       set title = '{"ca":"El meu primer partit","es":"Mi primer partido","en":"My first match","ar":"مباراتي الأولى","fa":"اولین بازی من"}',
           body = '{"ca":[{"type":"paragraph","text":"Vaig sentir que formava part de l’equip."}],"es":[{"type":"paragraph","text":"Sentí que formaba parte del equipo."}],"en":[{"type":"paragraph","text":"I felt part of the team."}],"ar":[{"type":"paragraph","text":"شعرت أنني جزء من الفريق."}],"fa":[{"type":"paragraph","text":"احساس کردم بخشی از تیم هستم."}]}'::jsonb,
           story_status = 'published',
           is_published = true,
           published_at = now()
       where title->>'ca' = 'El meu primer partit' $$,
  'staff can translate and publish a story that is in review'
);

select is(
  (select story_status from public.knowledge_articles where title->>'ca' = 'El meu primer partit'),
  'published',
  'the published outcome is persisted for the author'
);

select is(
  (select author_first_name from public.knowledge_articles where title->>'ca' = 'El meu primer partit'),
  (select first_name from public.profiles where id = '5eed0000-0000-4000-8000-000000000011'),
  'published attribution exposes only the author first name'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated"}';

select is(
  (select count(*) from public.knowledge_articles where title->>'ca' = 'El meu primer partit')::int,
  1,
  'another player can read the story once it is published'
);

select is(
  (select count(*) from public.knowledge_articles where not is_published)::int,
  0,
  'a player cannot read organization drafts'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated"}';

select is(
  (select count(*) from public.knowledge_articles)::int,
  0,
  'entity contacts have no knowledge-base access under the role matrix'
);

reset role;

select is(
  (select disposition from public.personal_data_disposition()
    where table_name = 'knowledge_articles' and participant_column = 'author_id'),
  'purge',
  'participant-authored stories are registered for erasure'
);

insert into public.knowledge_articles
  (org_id, category_id, title, body, content_type, story_status, author_id)
values (
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8004-000000000004',
  '{"ca":"Història per anonimitzar"}',
  '{"ca":[{"type":"paragraph","text":"Text personal"}]}'::jsonb,
  'participant_story',
  'submitted',
  '5eed0000-0000-4000-8000-000000000012'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated"}';
select lives_ok(
  $$ select public.anonymize_participant('5eed0000-0000-4000-8000-000000000012') $$,
  'staff can anonymize the participant who authored a story'
);
reset role;

select is(
  (select count(*) from public.knowledge_articles where title->>'ca' = 'Història per anonimitzar')::int,
  0,
  'anonymization removes the participant story and its attribution'
);

select is(
  (select delete_rule from information_schema.referential_constraints
    where constraint_name = 'knowledge_articles_author_same_org'),
  'CASCADE',
  'permanent profile erasure cascades to authored stories'
);

select cmp_ok(
  (select count(*) from pg_indexes
   where schemaname = 'public' and tablename = 'knowledge_articles' and indexdef like '%org_id%'),
  '>=',
  4::bigint,
  'tenant, list, visibility, and review queue paths are indexed'
);

select is(
  (select count(*) from information_schema.table_privileges
   where table_schema = 'public'
     and table_name in ('knowledge_categories', 'knowledge_articles')
     and grantee = 'anon')::int,
  0,
  'anonymous clients receive no table privileges'
);

select is(public.is_story_status_transition_allowed('submitted', 'in_review'), true, 'submitted enters review');
select is(public.is_story_status_transition_allowed('submitted', 'published'), false, 'submitted cannot skip to published');
select is(public.is_story_status_transition_allowed('in_review', 'changes_requested'), true, 'review can request changes');
select is(public.is_story_status_transition_allowed('in_review', 'rejected'), true, 'review can decline');
select is(public.is_story_status_transition_allowed('in_review', 'published'), true, 'review can publish');
select is(public.is_story_status_transition_allowed('published', 'in_review'), false, 'published is terminal');

select * from finish();
rollback;
