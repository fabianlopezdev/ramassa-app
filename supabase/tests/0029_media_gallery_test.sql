-- Media gallery privacy, consent, moderation, ownership, and deletion boundaries (RAPP-52).

begin;
select no_plan();

select has_table('public', 'media_items', 'media items exist');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.media_items'::regclass),
  'media item RLS is enabled and forced'
);
select has_function(
  'public', 'create_media_item',
  array['text', 'text', 'text', 'integer', 'text', 'text', 'boolean', 'text'],
  'media creation crosses one consent-aware boundary'
);
select has_function(
  'public', 'can_read_media_object', array['text'],
  'private R2 delivery rechecks gallery row visibility through RLS'
);
select is(
  has_table_privilege('authenticated', 'public.media_items', 'DELETE'),
  false,
  'DENIAL: clients cannot bypass R2 cleanup with a direct row delete'
);
select has_function(
  'public', 'set_media_item_privacy', array['uuid', 'text'],
  'privacy editing crosses one ownership boundary'
);
select has_function(
  'public', 'prepare_media_item_deletion', array['uuid'],
  'row-authorized deletion prepares the exact R2 keys'
);
select has_function(
  'public', 'complete_media_item_deletion', array['uuid', 'text', 'text'],
  'row deletion completes only after the Worker presents the deleted keys'
);

create temporary table rapp52_ids (kind text primary key, id uuid not null);
grant select, insert, update, delete on table pg_temp.rapp52_ids to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated"}';
select throws_ok(
  $$ select public.create_media_item(
    '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000011/2026/08/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg',
    '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000011/2026/08/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg',
    'image', 640000, 'No consent', 'community', false, 'gallery-consent-v1'
  ) $$,
  '23514', null::text,
  'DENIAL: upload creation requires an explicit consent acknowledgment'
);
insert into pg_temp.rapp52_ids values (
  'community',
  public.create_media_item(
    '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000011/2026/08/cccccccccccccccccccccccccccccccc.jpg',
    '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000011/2026/08/dddddddddddddddddddddddddddddddd.jpg',
    'image', 640000, '  Entrenament de dimarts  ', 'community', true, 'gallery-consent-v1'
  )
);
select is(
  (select caption from public.media_items where id = (select id from pg_temp.rapp52_ids where kind = 'community')),
  'Entrenament de dimarts',
  'creation trims the caption and records the row'
);
select ok(
  (select consent_acknowledged_at is not null from public.media_items where id = (select id from pg_temp.rapp52_ids where kind = 'community')),
  'the acknowledgment time is recorded server-side'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000012","role":"authenticated"}';
insert into pg_temp.rapp52_ids values (
  'staff-only',
  public.create_media_item(
    '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000012/2026/08/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.mov',
    '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000012/2026/08/ffffffffffffffffffffffffffffffff.jpg',
    'video', 10485760, 'Només equip', 'staff_only', true, 'gallery-consent-v1'
  )
);
select is(
  (select count(*) from public.media_items where id in (select id from pg_temp.rapp52_ids))::integer,
  2,
  'the owner sees community media and her own staff-only media'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000014","role":"authenticated"}';
select is(
  (select count(*) from public.media_items where id = (select id from pg_temp.rapp52_ids where kind = 'community'))::integer,
  1,
  'another same-org player sees community media'
);
select is(
  public.can_read_media_object(
    '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000011/2026/08/cccccccccccccccccccccccccccccccc.jpg'
  ),
  true,
  'another same-org player can stream a visible community object'
);
select is(
  (select count(*) from public.media_items where id = (select id from pg_temp.rapp52_ids where kind = 'staff-only'))::integer,
  0,
  'DENIAL: another player cannot see staff-only media'
);
select is(
  public.can_read_media_object(
    '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000012/2026/08/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.mov'
  ),
  false,
  'DENIAL: another player cannot stream the staff-only R2 object by key'
);
select throws_ok(
  $$ select public.set_media_item_privacy(
    (select id from pg_temp.rapp52_ids where kind = 'community'), 'staff_only'
  ) $$,
  '42501', null::text,
  'DENIAL: another player cannot edit media privacy'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000012","role":"authenticated"}';
select lives_ok(
  $$ select public.set_media_item_privacy(
    (select id from pg_temp.rapp52_ids where kind = 'staff-only'), 'community'
  ) $$,
  'the owner can make her item visible to the community'
);
select is(
  (select privacy_level from public.media_items where id = (select id from pg_temp.rapp52_ids where kind = 'staff-only')),
  'community',
  'the privacy change is persisted'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select count(*) from public.media_items where id in (select id from pg_temp.rapp52_ids))::integer,
  2,
  'same-org staff sees both privacy levels'
);
select is(
  (select count(*) from public.prepare_media_item_deletion((select id from pg_temp.rapp52_ids where kind = 'community')))::integer,
  1,
  'same-org staff can prepare deletion'
);

reset role;
insert into public.organizations (id, name, slug)
values ('5eed0000-0000-4000-8014-000000000200', 'RAPP-52 Other Org', 'rapp52-other-org');
insert into auth.users (id, email)
values ('5eed0000-0000-4000-8014-000000000201', 'rapp52-other@example.test');
insert into public.profiles (id, org_id, role, first_name, last_name)
values (
  '5eed0000-0000-4000-8014-000000000201',
  '5eed0000-0000-4000-8014-000000000200',
  'player', 'Other', 'Player'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8014-000000000201","role":"authenticated"}';
select is(
  (select count(*) from public.media_items where id in (select id from pg_temp.rapp52_ids))::integer,
  0,
  'DENIAL: another tenant cannot enumerate media'
);
select throws_ok(
  $$ select * from public.prepare_media_item_deletion(
    (select id from pg_temp.rapp52_ids where kind = 'community')
  ) $$,
  '42501', null::text,
  'DENIAL: another tenant cannot prepare R2 deletion'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000014","role":"authenticated"}';
select lives_ok(
  $$ select public.flag_forum_content(
    'media', (select id from pg_temp.rapp52_ids where kind = 'community'), 'privacy', null
  ) $$,
  'a player flags a visible media item through the RAPP-51 boundary'
);
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000015","role":"authenticated"}';
select lives_ok(
  $$ select public.flag_forum_content(
    'media', (select id from pg_temp.rapp52_ids where kind = 'community'), 'privacy', null
  ) $$,
  'a second player flags the media item'
);
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000016","role":"authenticated"}';
select lives_ok(
  $$ select public.flag_forum_content(
    'media', (select id from pg_temp.rapp52_ids where kind = 'community'), 'privacy', null
  ) $$,
  'a third player flags the media item'
);
select is(
  (select count(*) from public.media_items where id = (select id from pg_temp.rapp52_ids where kind = 'community'))::integer,
  0,
  'three flags hide media from players immediately'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated"}';
select is(
  (select count(*) from public.media_items where id = (select id from pg_temp.rapp52_ids where kind = 'community'))::integer,
  0,
  'three flags also hide media from its player owner'
);
select is(
  public.can_read_media_object(
    '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000011/2026/08/cccccccccccccccccccccccccccccccc.jpg'
  ),
  false,
  'DENIAL: hidden media cannot be streamed by its player owner using the object key'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  public.can_read_media_object(
    '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000011/2026/08/cccccccccccccccccccccccccccccccc.jpg'
  ),
  true,
  'same-org staff can stream hidden media for moderation'
);
select is(
  (select target_type from public.list_forum_moderation_queue()
   where target_id = (select id from pg_temp.rapp52_ids where kind = 'community')),
  'media',
  'flagged media enters the existing staff moderation queue'
);
select lives_ok(
  $$ select public.moderate_forum_target(
    'media', (select id from pg_temp.rapp52_ids where kind = 'community'), 'dismiss'
  ) $$,
  'staff can dismiss media flags'
);
select is(
  (select moderation_state || ':' || flag_count::text
   from public.media_items where id = (select id from pg_temp.rapp52_ids where kind = 'community')),
  'visible:0',
  'dismissal restores media and clears its pending count'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated"}';
select throws_ok(
  $$ select public.complete_media_item_deletion(
    (select id from pg_temp.rapp52_ids where kind = 'community'),
    'wrong/key.jpg', null
  ) $$,
  '42501', null::text,
  'DENIAL: a row cannot be removed without presenting its exact deleted R2 keys'
);
select lives_ok(
  $$ select public.complete_media_item_deletion(
    (select id from pg_temp.rapp52_ids where kind = 'community'),
    '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000011/2026/08/cccccccccccccccccccccccccccccccc.jpg',
    '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000011/2026/08/dddddddddddddddddddddddddddddddd.jpg'
  ) $$,
  'the owner completes row deletion after the Worker deletes both R2 keys'
);
select is(
  (select count(*) from public.media_items where id = (select id from pg_temp.rapp52_ids where kind = 'community'))::integer,
  0,
  'the completed deletion removes the row'
);

reset role;
select is(
  (select disposition || ':' || participant_column
   from public.personal_data_disposition() where table_name = 'media_items'),
  'purge:uploaded_by',
  'participant media rows are registered for erasure after the R2 sweep'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'media_items'
      and indexdef like '%(org_id, moderation_state, privacy_level, created_at%'
  ),
  'the tenant, moderation, privacy, and gallery ordering path is indexed'
);

select * from finish();
rollback;
