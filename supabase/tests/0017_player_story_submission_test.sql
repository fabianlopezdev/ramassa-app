-- Player story consent evidence, media caps, language fidelity, and owner-only state access.
-- Runs with: bunx supabase test db

begin;
select plan(27);

select has_column(
  'public', 'knowledge_articles', 'submission_language',
  'participant stories preserve the language in which they were submitted'
);
select has_column(
  'public', 'knowledge_articles', 'story_image_urls',
  'participant stories support a bounded list of authenticated media keys'
);
select has_column(
  'public', 'knowledge_articles', 'publication_consent',
  'participant stories retain explicit publication consent'
);
select has_column(
  'public', 'knowledge_articles', 'publication_consent_at',
  'participant story consent has a server-recorded timestamp'
);
select has_column(
  'public', 'knowledge_articles', 'publication_consent_version',
  'participant story consent records the reviewed copy version'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.knowledge_articles (
       category_id, title, body, content_type, story_status, author_id,
       submission_language, story_image_urls, publication_consent,
       publication_consent_version
     ) values (
       '5eed0000-0000-4000-8004-000000000004',
       '{"ar":"قصتي مع الفريق"}',
       '{"ar":[{"type":"paragraph","text":"وجدت مساحة آمنة للعب والتعلم."}]}'::jsonb,
       'participant_story',
       'submitted',
       '5eed0000-0000-4000-8000-000000000011',
       'ar',
       array[
         '5eed0000-0000-4000-8000-000000000000/stories/5eed0000-0000-4000-8000-000000000011/2026/08/11111111111111111111111111111111.jpg',
         '5eed0000-0000-4000-8000-000000000000/stories/5eed0000-0000-4000-8000-000000000011/2026/08/22222222222222222222222222222222.jpg'
       ],
       true,
       'story-publication-v1'
     ) $$,
  'a player can submit her own Arabic story with consent and bounded images'
);

select is(
  (select title->>'ar' from public.knowledge_articles where submission_language = 'ar' and author_id = auth.uid()),
  'قصتي مع الفريق',
  'the original title remains under the truthful submission language'
);
select is(
  (select submission_language from public.knowledge_articles where submission_language = 'ar' and author_id = auth.uid()),
  'ar',
  'the original language is available to the staff translation workflow'
);
select is(
  (select cardinality(story_image_urls) from public.knowledge_articles where submission_language = 'ar' and author_id = auth.uid()),
  2,
  'the submitted authenticated media keys are retained'
);
select ok(
  (select publication_consent_at is not null from public.knowledge_articles where submission_language = 'ar' and author_id = auth.uid()),
  'the server stamps consent at insertion time'
);
select is(
  (select story_status from public.knowledge_articles where submission_language = 'ar' and author_id = auth.uid()),
  'submitted',
  'the author can read her pending review state'
);

select throws_ok(
  $$ insert into public.knowledge_articles (
       category_id, title, body, content_type, story_status, author_id,
       submission_language, publication_consent, publication_consent_version
     ) values (
       '5eed0000-0000-4000-8004-000000000004',
       '{"ca":"Sense consentiment"}',
       '{"ca":[{"type":"paragraph","text":"Text"}]}'::jsonb,
       'participant_story', 'submitted',
       '5eed0000-0000-4000-8000-000000000011',
       'ca', false, 'story-publication-v1'
     ) $$,
  '42501',
  null::text,
  'a player cannot submit a story without explicit consent'
);

select throws_ok(
  $$ insert into public.knowledge_articles (
       category_id, title, body, content_type, story_status, author_id,
       submission_language, story_image_urls, publication_consent,
       publication_consent_version
     ) values (
       '5eed0000-0000-4000-8004-000000000004',
       '{"ca":"Massa fotos"}',
       '{"ca":[{"type":"paragraph","text":"Text"}]}'::jsonb,
       'participant_story', 'submitted',
       '5eed0000-0000-4000-8000-000000000011',
       'ca', array['one', 'two', 'three', 'four'], true, 'story-publication-v1'
     ) $$,
  '42501',
  null::text,
  'the database rejects more than three story images'
);

select throws_ok(
  $$ insert into public.knowledge_articles (
       category_id, title, body, content_type, story_status, author_id,
       submission_language, story_image_urls, publication_consent,
       publication_consent_version
     ) values (
       '5eed0000-0000-4000-8004-000000000004',
       '{"ca":"Foto aliena"}',
       '{"ca":[{"type":"paragraph","text":"Text"}]}'::jsonb,
       'participant_story', 'submitted',
       '5eed0000-0000-4000-8000-000000000011',
       'ca',
       array['5eed0000-0000-4000-8000-000000000000/stories/5eed0000-0000-4000-8000-000000000012/2026/08/33333333333333333333333333333333.jpg'],
       true,
       'story-publication-v1'
     ) $$,
  '42501',
  null::text,
  'a player cannot attach a media key minted for another participant'
);

select throws_ok(
  $$ insert into public.knowledge_articles (
       category_id, title, body, content_type, story_status, author_id,
       submission_language, publication_consent, publication_consent_at,
       publication_consent_version
     ) values (
       '5eed0000-0000-4000-8004-000000000004',
       '{"ca":"Hora inventada"}',
       '{"ca":[{"type":"paragraph","text":"Text"}]}'::jsonb,
       'participant_story', 'submitted',
       '5eed0000-0000-4000-8000-000000000011',
       'ca', true, '2020-01-01T00:00:00Z', 'story-publication-v1'
     ) $$,
  '42501',
  null::text,
  'a player cannot supply her own consent timestamp'
);

update public.knowledge_articles
set story_status = 'published', is_published = true, published_at = now()
where submission_language = 'ar' and author_id = auth.uid();

select is(
  (select story_status from public.knowledge_articles where submission_language = 'ar' and author_id = auth.uid()),
  'submitted',
  'a player cannot update her own review state'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated"}';

select is(
  (select count(*) from public.knowledge_articles where submission_language = 'ar')::int,
  0,
  'another player cannot read an unpublished story or its consent evidence'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated"}';

select is(
  (select publication_consent from public.knowledge_articles where submission_language = 'ar'),
  true,
  'staff can verify the recorded publication consent'
);
select is(
  (select publication_consent_version from public.knowledge_articles where submission_language = 'ar'),
  'story-publication-v1',
  'staff can verify which consent copy the player accepted'
);

select throws_ok(
  $$ update public.knowledge_articles
       set publication_consent = false
       where submission_language = 'ar' $$,
  '42501',
  null::text,
  'consent evidence is immutable after submission'
);

select lives_ok(
  $$ update public.knowledge_articles
       set story_status = 'in_review'
       where submission_language = 'ar' $$,
  'staff can begin reviewing the submitted story'
);

select is(
  (select story_status from public.knowledge_articles where submission_language = 'ar'),
  'in_review',
  'the staff review transition is retained'
);

select lives_ok(
  $$ update public.knowledge_articles
       set title = '{"ca":"La meva història","es":"Mi historia","en":"My story","ar":"قصتي مع الفريق","fa":"داستان من"}',
           body = '{"ca":[{"type":"paragraph","text":"Vaig trobar un espai segur."}],"es":[{"type":"paragraph","text":"Encontré un espacio seguro."}],"en":[{"type":"paragraph","text":"I found a safe space."}],"ar":[{"type":"paragraph","text":"وجدت مساحة آمنة للعب والتعلم."}],"fa":[{"type":"paragraph","text":"فضایی امن پیدا کردم."}]}'::jsonb,
           story_status = 'published',
           is_published = true,
           published_at = now()
       where submission_language = 'ar' $$,
  'staff can translate and publish without rewriting the original Arabic block'
);

select is(
  (select body->'ar'->0->>'text' from public.knowledge_articles where title->>'ca' = 'La meva història'),
  'وجدت مساحة آمنة للعب والتعلم.',
  'publishing preserves the player original exactly'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated"}';

select is(
  (select count(*) from public.knowledge_articles where title->>'ca' = 'La meva història')::int,
  1,
  'other players can read the story only after publication'
);

select is(
  (select count(*) from information_schema.column_privileges
   where table_schema = 'public'
     and table_name = 'knowledge_articles'
     and column_name = 'publication_consent_at'
     and grantee = 'authenticated'
     and privilege_type in ('INSERT', 'UPDATE'))::int,
  0,
  'authenticated clients have no direct write privilege on the server consent timestamp'
);

select is(
  (select count(*) from information_schema.column_privileges
   where table_schema = 'public'
     and table_name = 'knowledge_articles'
     and column_name = 'author_id'
     and grantee = 'authenticated'
     and privilege_type = 'UPDATE')::int,
  0,
  'authenticated clients cannot rewrite story attribution after submission'
);

select * from finish();
rollback;
