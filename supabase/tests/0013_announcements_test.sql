-- Announcements CRUD, multilingual publication, scheduling, and tenant isolation.
-- Runs with: bunx supabase test db

begin;
select plan(32);

select has_table('public', 'announcements', 'the announcements table exists');
select has_column('public', 'announcements', 'org_id', 'every announcement belongs to one tenant');
select has_column('public', 'announcements', 'title', 'titles are multilingual JSONB');
select has_column('public', 'announcements', 'body', 'bodies are multilingual JSONB');
select has_column('public', 'announcements', 'image_alt', 'image alt text is multilingual');
select has_column('public', 'announcements', 'status', 'draft and published states are explicit');
select has_column('public', 'announcements', 'published_at', 'publishing can be scheduled');
select has_column('public', 'announcements', 'expires_at', 'publishing can expire');
select has_column('public', 'announcements', 'is_pinned', 'announcements can be pinned');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.announcements'::regclass),
  'row-level security is enabled'
);

select has_function(
  'public', 'is_content_visible', array['text', 'timestamp with time zone', 'timestamp with time zone', 'timestamp with time zone'],
  'the database owns the same visibility predicate as clients'
);

select is(
  public.is_content_visible('draft', now() - interval '1 day', null, now()),
  false,
  'draft content is not visible'
);
select is(
  public.is_content_visible('published', now() + interval '1 second', null, now()),
  false,
  'scheduled content is not visible early'
);
select is(
  public.is_content_visible('published', now() - interval '1 day', null, now()),
  true,
  'published content with no expiry is visible'
);
select is(
  public.is_content_visible('published', now() - interval '1 day', now(), now()),
  false,
  'content stops being visible at its expiry boundary'
);

select throws_ok(
  $$ insert into public.announcements (org_id, category, title, body, status, published_at)
     values (
       '5eed0000-0000-4000-8000-000000000000',
       'other',
       '{"ca":"Títol"}',
       '{"ca":"Cos"}',
       'draft',
       null
     ) $$,
  '23514',
  null::text,
  'the database refuses a category outside the catalog'
);

select throws_ok(
  $$ insert into public.announcements (org_id, category, title, body, status, published_at)
     values (
       '5eed0000-0000-4000-8000-000000000000',
       'info',
       '{"ca":"Títol"}',
       '{"ca":"Cos"}',
       'published',
       now()
     ) $$,
  '23514',
  null::text,
  'published content cannot omit required languages'
);

select throws_ok(
  $$ insert into public.announcements
       (org_id, category, title, body, image_url, image_alt, status, published_at)
     values (
       '5eed0000-0000-4000-8000-000000000000',
       'info',
       '{"ca":"Títol","es":"Título","en":"Title","ar":"عنوان","fa":"عنوان"}',
       '{"ca":"Cos","es":"Cuerpo","en":"Body","ar":"نص","fa":"متن"}',
       'org/announcements/photo.jpg',
       '{"ca":"Equip al camp"}',
       'published',
       now()
     ) $$,
  '23514',
  null::text,
  'a published image needs alt text in every language'
);

insert into public.organizations (id, name, slug)
values ('5eed0000-0000-4000-8000-999999999999', 'Another club', 'another-club');

insert into public.announcements
  (org_id, category, title, body, status, published_at, created_by)
values (
  '5eed0000-0000-4000-8000-999999999999',
  'info',
  '{"ca":"Altre club","es":"Otro club","en":"Other club","ar":"ناد آخر","fa":"باشگاه دیگر"}',
  '{"ca":"No és de Ramassà","es":"No es de Ramassà","en":"Not Ramassà","ar":"ليس راماسا","fa":"راماسا نیست"}',
  'published',
  now() - interval '1 day',
  null
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.announcements (category, title, body)
     values ('training', '{"ca":"Canvi de camp"}', '{"ca":"Demà entrenem al camp dos"}') $$,
  'staff can save a Catalan draft in their organization'
);

select is(
  (select count(*) from public.announcements where status = 'draft')::int,
  2,
  'staff can read seeded and newly created drafts'
);

select throws_ok(
  $$ insert into public.announcements (org_id, category, title, body)
     values ('5eed0000-0000-4000-8000-999999999999', 'info', '{"ca":"Altre"}', '{"ca":"Cos"}') $$,
  '42501',
  null::text,
  'staff cannot write into another organization'
);

select lives_ok(
  $$ update public.announcements set is_pinned = true where title->>'ca' = 'Canvi de camp' $$,
  'staff can update their own announcement'
);

select is(
  (select count(*) from public.announcements where title->>'ca' = 'Canvi de camp' and is_pinned)::int,
  1,
  'the update affects the intended row'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';

select is(
  (select count(*) from public.announcements)::int,
  2,
  'a player reads only currently visible announcements from her organization'
);

select is(
  (select count(*) from public.announcements where status = 'draft')::int,
  0,
  'a player cannot read drafts'
);

select is(
  (select count(*) from public.announcements where published_at > now())::int,
  0,
  'a player cannot read scheduled announcements early'
);

select is(
  (select count(*) from public.announcements where expires_at <= now())::int,
  0,
  'a player cannot read expired announcements'
);

select throws_ok(
  $$ insert into public.announcements (category, title, body)
     values ('info', '{"ca":"No"}', '{"ca":"No"}') $$,
  '42501',
  null::text,
  'a player cannot create announcements'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated"}';

select is(
  (select count(*) from public.announcements)::int,
  0,
  'an entity contact has no announcement access under the role matrix'
);

reset role;

select is(
  (select disposition from public.personal_data_disposition() where table_name = 'announcements'),
  'not_personal',
  'organization announcements are registered as non-personal content'
);

select is(
  (select delete_rule from information_schema.referential_constraints
    where constraint_name = 'announcements_created_by_fkey'),
  'SET NULL',
  'content survives removal of its staff author without retaining the reference'
);

select is(
  (
    select count(*)::int
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'announcements'
      and indexdef like '%org_id%'
  ),
  4,
  'tenant, list, schedule, and author access paths are indexed'
);

select * from finish();
rollback;
