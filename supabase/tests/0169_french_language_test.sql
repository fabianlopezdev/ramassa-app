-- French is a supported language (RAPP-781).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Every row written before French stays valid: a text complete in the
--      five languages is still complete, and a published announcement without
--      French can still be updated.
--   2. French is accepted wherever a language is checked, and a blank French
--      is refused like any other blank text.
--   3. French is required nowhere: notification and survey copy, knowledge
--      bodies and forum names publish with the five languages.
--   4. A French knowledge body, when present, keeps the Catalan blocks.
--   5. A French text is read in French, and one without French reads the
--      Catalan.
--   6. Every organization offers French, in the picker order.
--
-- Seed: admin ...001 of organization ...000, announcement ...8001-...001.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(20);

select is(
  public.is_localized_content_valid('{"ca":"a","es":"a","en":"a","ar":"a","fa":"a"}', 10, true),
  true,
  'a text in the five languages is still complete'
);
select is(
  public.is_localized_content_valid('{"ca":"a","es":"a","en":"a","fr":"a","ar":"a","fa":"a"}', 10, true),
  true,
  'a complete text may hold French'
);
select is(
  public.is_localized_content_valid('{"ca":"a","fr":""}', 10, false),
  false,
  'a blank French is refused'
);
select is(
  public.is_localized_content_valid('{"ca":"a","xx":"a"}', 10, false),
  false,
  'an unknown language is still refused'
);

select is(
  private.valid_notification_copy('{"ca":"a","es":"a","en":"a","ar":"a","fa":"a"}', 100),
  true,
  'notification copy without French is valid'
);
select is(
  private.valid_notification_copy('{"ca":"a","es":"a","en":"a","fr":"a","ar":"a","fa":"a"}', 100),
  true,
  'notification copy with French is valid'
);
select is(
  private.valid_notification_copy('{"ca":"a","es":"a","en":"a","fr":"a","ar":"a"}', 100),
  false,
  'French does not stand in for a missing language'
);
select is(
  private.valid_survey_copy('{"ca":"a","es":"a","en":"a","fr":"a","ar":"a","fa":"a"}', 100),
  true,
  'survey copy with French is valid'
);

select is(
  public.is_knowledge_body_valid(
    '{"ca":[{"type":"paragraph","text":"a"}],"es":[{"type":"paragraph","text":"a"}],"en":[{"type":"paragraph","text":"a"}],"ar":[{"type":"paragraph","text":"a"}],"fa":[{"type":"paragraph","text":"a"}]}',
    true),
  true,
  'a knowledge body in the five languages is still complete'
);
select is(
  public.is_knowledge_body_valid(
    '{"ca":[{"type":"paragraph","text":"a"}],"es":[{"type":"paragraph","text":"a"}],"en":[{"type":"paragraph","text":"a"}],"fr":[{"type":"paragraph","text":"b"},{"type":"paragraph","text":"c"}],"ar":[{"type":"paragraph","text":"a"}],"fa":[{"type":"paragraph","text":"a"}]}',
    true),
  false,
  'a French body keeps the Catalan blocks'
);

select is(
  private.localized_text_in('{"ca":"Hola","fr":"Bonjour"}', 'fr'),
  'Bonjour',
  'a French text is read in French'
);
select is(
  private.localized_text_in('{"ca":"Hola","es":"Hola"}', 'fr'),
  'Hola',
  'a text without French reads the Catalan'
);
select is(private.member_label(7, 'fr'), 'Joueuse 0007', 'a test player has a French label');

select is(
  (select available_languages from public.organizations
    where id = '5eed0000-0000-4000-8000-000000000000'),
  array['ca', 'es', 'en', 'fr', 'ar', 'fa'],
  'the organization offers French, in the picker order'
);

-- A published announcement from before French.
update public.announcements
   set title = '{"ca":"T","es":"T","en":"T","ar":"T","fa":"T"}',
       body = '{"ca":"B","es":"B","en":"B","ar":"B","fa":"B"}',
       image_url = null, image_alt = null, status = 'published',
       published_at = now() - interval '1 day', expires_at = null
 where id = '5eed0000-0000-4000-8001-000000000001';
select lives_ok(
  $$ update public.announcements set is_pinned = not is_pinned
      where id = '5eed0000-0000-4000-8001-000000000001' $$,
  'a published announcement without French can still be updated'
);
select lives_ok(
  $$ update public.announcements
        set title = title || '{"fr":"T"}', body = body || '{"fr":"B"}'
      where id = '5eed0000-0000-4000-8001-000000000001' $$,
  'French is added to a published announcement'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000001","role":"authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.save_forum_category(null, '{"ca":"A","es":"A","en":"A","ar":"A","fa":"A"}',
       'french-five', 'heart', 'primary', 90) $$,
  'a forum category is saved without French'
);
select lives_ok(
  $$ select public.save_forum_category(null, '{"ca":"A","es":"A","en":"A","fr":"A","ar":"A","fa":"A"}',
       'french-six', 'heart', 'primary', 91) $$,
  'a forum category is saved with French'
);
select throws_ok(
  $$ select public.save_forum_category(null, '{"ca":"A","es":"A","en":"A","fr":" ","ar":"A","fa":"A"}',
       'french-blank', 'heart', 'primary', 92) $$,
  '42501', null::text,
  'a blank French name is refused'
);
select throws_ok(
  $$ select public.save_forum_category(null, '{"ca":"A","es":"A","en":"A","fr":"A","ar":"A"}',
       'french-no-farsi', 'heart', 'primary', 93) $$,
  '42501', null::text,
  'French does not stand in for a missing name'
);

select * from finish();
rollback;
