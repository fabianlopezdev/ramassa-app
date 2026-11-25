-- The part of a photo that stays visible on a card (RAPP-932): a focus point
-- stored with each cropped photo, written only by whoever may write the photo.
-- Runs with: bunx supabase test db

begin;
select plan(30);

-- The columns and their checks -------------------------------------------------
select has_column('public', 'announcements', 'image_focus_x', 'an avís photo has a focus across');
select has_column('public', 'announcements', 'image_focus_y', 'and down');
select has_column('public', 'forum_posts', 'image_focus_x', 'a forum post photo has a focus');
select has_column('public', 'knowledge_articles', 'image_focus_x', 'a guide or story cover has a focus');
select has_column('public', 'service_images', 'focus_x', 'each service photo has a focus');
select has_column('public', 'media_items', 'focus_x', 'each gallery item has a focus');

select is(
  (select count(*) from public.announcements where image_focus_x is not null or image_focus_y is not null)
  + (select count(*) from public.forum_posts where image_focus_x is not null)
  + (select count(*) from public.knowledge_articles where image_focus_x is not null)
  + (select count(*) from public.media_items where focus_x is not null),
  0::bigint,
  'stored rows start with no focus, so they keep the default crop'
);

select throws_ok(
  $$ update public.announcements set image_focus_x = 0.5
     where id = '5eed0000-0000-4000-8001-000000000002' $$,
  '23514', null::text,
  'a focus is both numbers or neither'
);
select throws_ok(
  $$ update public.announcements set image_focus_x = 1.2, image_focus_y = 0.3
     where id = '5eed0000-0000-4000-8001-000000000002' $$,
  '23514', null::text,
  'a focus outside the photo is refused'
);
select throws_ok(
  $$ update public.media_items set focus_x = 0.5, focus_y = -0.1
     where id = '5eed0000-0000-4000-8014-000000000001' $$,
  '23514', null::text,
  'a gallery focus outside the photo is refused'
);

-- Column grants: the focus is writable where the photo is ----------------------
select ok(
  has_column_privilege('authenticated', 'public.announcements', 'image_focus_x', 'UPDATE')
    and has_column_privilege('authenticated', 'public.announcements', 'image_focus_y', 'INSERT')
    and has_column_privilege('authenticated', 'public.knowledge_articles', 'image_focus_x', 'UPDATE')
    and has_column_privilege('authenticated', 'public.knowledge_articles', 'image_focus_y', 'INSERT')
    and has_column_privilege('authenticated', 'public.service_images', 'focus_x', 'INSERT'),
  'the focus columns carry the same grants as the photo columns beside them'
);
select ok(
  not has_column_privilege('authenticated', 'public.media_items', 'focus_x', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.media_items', 'focus_y', 'UPDATE'),
  'nobody rewrites a gallery focus directly; it is set at upload'
);

create temporary table rapp932_ids (kind text primary key, id uuid not null);
grant select, insert on table pg_temp.rapp932_ids to authenticated;

-- Staff with the editing permissions set the focus -----------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","amr":[{"method":"totp","timestamp":4102444800}]}';

update public.announcements set image_focus_x = 0.5, image_focus_y = 0.2
where id = '5eed0000-0000-4000-8001-000000000002';
update public.knowledge_articles set image_focus_x = 0.4, image_focus_y = 0.1
where id = '5eed0000-0000-4000-8005-000000000001';

select lives_ok(
  $$ select public.save_admin_service(jsonb_build_object(
       'serviceId', null, 'categoryId', service.category_id,
       'title', '{"ca":"Prova focus"}'::jsonb, 'description', null,
       'providerName', null, 'location', null, 'zone', null, 'costType', 'free',
       'costAmount', null, 'costDetails', null, 'contactName', null,
       'contactPhone', null, 'contactEmail', null, 'contactRole', null,
       'schedule', null, 'externalUrl', null, 'availability', 'available',
       'metadata', service.metadata, 'status', 'draft', 'publishedAt', null,
       'expiresAt', null,
       'images', jsonb_build_array(
         jsonb_build_object('url', 'org/services/focus/one.webp', 'altText', '{"ca":"Una"}'::jsonb,
           'focus', jsonb_build_object('x', 0.25, 'y', 0.75)),
         jsonb_build_object('url', 'org/services/focus/two.webp', 'altText', '{"ca":"Dues"}'::jsonb,
           'focus', null),
         jsonb_build_object('url', 'org/services/focus/three.webp', 'altText', '{"ca":"Tres"}'::jsonb)
       )
     ))
     from public.services as service where service.id = '5eed0000-0000-4000-800a-000000000003' $$,
  'staff save a service with a focus on one photo, null on another, none on a third'
);
select results_eq(
  $$ select focus_x, focus_y from public.service_images
     where url like 'org/services/focus/%' order by position $$,
  $$ values (0.25::real, 0.75::real), (null::real, null::real), (null::real, null::real) $$,
  'each service photo keeps its own focus, and no choice stores null'
);
select throws_ok(
  $$ select public.save_admin_service(jsonb_build_object(
       'serviceId', null, 'categoryId', service.category_id,
       'title', '{"ca":"Prova focus"}'::jsonb, 'description', null,
       'providerName', null, 'location', null, 'zone', null, 'costType', 'free',
       'costAmount', null, 'costDetails', null, 'contactName', null,
       'contactPhone', null, 'contactEmail', null, 'contactRole', null,
       'schedule', null, 'externalUrl', null, 'availability', 'available',
       'metadata', service.metadata, 'status', 'draft', 'publishedAt', null,
       'expiresAt', null,
       'images', jsonb_build_array(
         jsonb_build_object('url', 'org/services/focus/bad.webp', 'altText', '{"ca":"Mala"}'::jsonb,
           'focus', jsonb_build_object('x', 'top', 'y', 0.5))
       )
     ))
     from public.services as service where service.id = '5eed0000-0000-4000-800a-000000000003' $$,
  '23514', null::text,
  'a service focus that is not two numbers is refused'
);

reset role;
select is(
  (select array[image_focus_x, image_focus_y] from public.announcements
   where id = '5eed0000-0000-4000-8001-000000000002'),
  array[0.5, 0.2]::real[],
  'staff with announcements.edit set the focus of an avís photo'
);
select is(
  (select array[image_focus_x, image_focus_y] from public.knowledge_articles
   where id = '5eed0000-0000-4000-8005-000000000001'),
  array[0.4, 0.1]::real[],
  'staff with knowledge.edit set the focus of a guide cover'
);

-- A player cannot set the focus on rows she cannot write -----------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal1"}';

update public.announcements set image_focus_x = 0, image_focus_y = 1
where id = '5eed0000-0000-4000-8001-000000000002';
update public.knowledge_articles set image_focus_x = 0, image_focus_y = 1
where id = '5eed0000-0000-4000-8005-000000000001';
update public.service_images set focus_x = 0, focus_y = 0
where url = 'org/services/focus/one.webp';
update public.forum_posts set image_focus_x = 0, image_focus_y = 0
where id = '5eed0000-0000-4000-8010-000000000002';

select throws_ok(
  $$ update public.media_items set focus_x = 0, focus_y = 0
     where id = '5eed0000-0000-4000-8014-000000000001' $$,
  '42501', null::text,
  'DENIAL: the uploader cannot rewrite a gallery focus directly'
);
select throws_ok(
  $$ select public.save_admin_service(jsonb_build_object('images', '[]'::jsonb)) $$,
  '42501', null::text,
  'DENIAL: a player cannot save a service and its photos'' focus'
);

-- Her own forum post takes a focus when she posts it --------------------------
insert into pg_temp.rapp932_ids values (
  'with-photo',
  public.create_forum_post(
    '5eed0000-0000-4000-8006-000000000004',
    'Una foto amb el gos',
    '5eed0000-0000-4000-8000-000000000000/forum/5eed0000-0000-4000-8000-000000000011/dog.jpg',
    0.5, 0.15
  )
);
insert into pg_temp.rapp932_ids values (
  'without-photo',
  public.create_forum_post(
    '5eed0000-0000-4000-8006-000000000004', 'Sense foto', null, 0.5, 0.15
  )
);
insert into pg_temp.rapp932_ids values (
  'three-arguments',
  public.create_forum_post('5eed0000-0000-4000-8006-000000000004', 'Com abans', null)
);
select throws_ok(
  format(
    $$ update public.forum_posts set image_focus_y = 0.9 where id = %L $$,
    (select id from pg_temp.rapp932_ids where kind = 'with-photo')
  ),
  '42501', null::text,
  'DENIAL: her visible post keeps its focus, like its photo'
);
select lives_ok(
  format(
    $$ select public.delete_own_forum_post(%L) $$,
    (select id from pg_temp.rapp932_ids where kind = 'with-photo')
  ),
  'she can still delete her post with a photo'
);

select throws_ok(
  $$ select public.create_media_item(
    '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000011/2026/11/93293293293293293293293293293293.jpg',
    null, 'image', 640000, null, 'community', true, 'gallery-consent-v1', 2, 0.5
  ) $$,
  '23514', null::text,
  'a gallery upload with a focus outside the photo is refused'
);
insert into pg_temp.rapp932_ids values (
  'gallery',
  public.create_media_item(
    '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000011/2026/11/93293293293293293293293293293293.jpg',
    null, 'image', 640000, null, 'community', true, 'gallery-consent-v1', 0.5, 0.2
  )
);
insert into pg_temp.rapp932_ids values (
  'gallery-no-focus',
  public.create_media_item(
    '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000011/2026/11/93393393393393393393393393393393.jpg',
    null, 'image', 640000, null, 'community', true, 'gallery-consent-v1'
  )
);

reset role;
select is(
  (select array[image_focus_x, image_focus_y] from public.announcements
   where id = '5eed0000-0000-4000-8001-000000000002'),
  array[0.5, 0.2]::real[],
  'DENIAL: a player leaves an avís focus untouched'
);
select is(
  (select array[image_focus_x, image_focus_y] from public.knowledge_articles
   where id = '5eed0000-0000-4000-8005-000000000001'),
  array[0.4, 0.1]::real[],
  'DENIAL: a player leaves a guide focus untouched'
);
select is(
  (select array[focus_x, focus_y] from public.service_images
   where url = 'org/services/focus/one.webp'),
  array[0.25, 0.75]::real[],
  'DENIAL: a player leaves a service photo focus untouched'
);
select is(
  (select image_focus_x from public.forum_posts where id = '5eed0000-0000-4000-8010-000000000002'),
  null::real,
  'DENIAL: a player cannot set the focus of another player''s post'
);
select is(
  (select array[image_focus_x, image_focus_y] from public.forum_posts
   where id = (select id from pg_temp.rapp932_ids where kind = 'with-photo')),
  array[null, null]::real[],
  'a post that loses its photo loses its focus'
);
select is(
  (select image_focus_x from public.forum_posts
   where id = (select id from pg_temp.rapp932_ids where kind = 'without-photo')),
  null::real,
  'a post without a photo stores no focus'
);
select is(
  (select array[focus_x, focus_y] from public.media_items
   where id = (select id from pg_temp.rapp932_ids where kind = 'gallery')),
  array[0.5, 0.2]::real[],
  'a gallery upload stores the focus she chose'
);
select is(
  (select array[focus_x, focus_y] from public.media_items
   where id = (select id from pg_temp.rapp932_ids where kind = 'gallery-no-focus')),
  array[null, null]::real[],
  'an upload without a choice stores no focus'
);

select * from finish();
rollback;
