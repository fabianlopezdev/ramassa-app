-- Community forum schema, tenant isolation, ownership, tombstones, and erasure (RAPP-50).

begin;
select plan(42);

select has_table('public', 'forum_categories', 'forum categories exist');
select has_table('public', 'forum_posts', 'forum posts exist');
select has_table('public', 'forum_replies', 'forum replies exist');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.forum_categories'::regclass),
  'forum category RLS is enabled and forced'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.forum_posts'::regclass),
  'forum post RLS is enabled and forced'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.forum_replies'::regclass),
  'forum reply RLS is enabled and forced'
);
select has_function('public', 'create_forum_post', array['uuid', 'text', 'text'], 'post creation crosses one validated boundary');
select has_function('public', 'create_forum_reply', array['uuid', 'text'], 'reply creation crosses one validated boundary');
select has_function('public', 'edit_own_forum_post', array['uuid', 'text'], 'post editing has one ownership boundary');
select has_function('public', 'delete_own_forum_post', array['uuid'], 'post deletion has one tombstone boundary');
select is((select count(*) from public.forum_categories)::integer, 4, 'four board categories are seeded');
select is(
  (select (name->>'ca') || ':' || (name->>'ar') from public.forum_categories where slug = 'housing'),
  'Habitatge:السكن',
  'category labels include Catalan and Arabic'
);
select is(
  (select disposition || ':' || participant_column from public.personal_data_disposition() where table_name = 'forum_posts'),
  'purge:author_id',
  'participant-authored forum posts are registered for erasure'
);
select is(
  (select disposition || ':' || participant_column from public.personal_data_disposition() where table_name = 'forum_replies'),
  'purge:author_id',
  'participant-authored forum replies are registered for erasure'
);

create temporary table rapp50_ids (kind text primary key, id uuid not null);
grant select, insert, update, delete on table pg_temp.rapp50_ids to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated"}';
select is((select count(*) from public.forum_categories)::integer, 4, 'a player reads same-org categories');
select lives_ok(
  $$ insert into pg_temp.rapp50_ids values (
    'post',
    public.create_forum_post(
      '5eed0000-0000-4000-8006-000000000002',
      '  <script>alert(1)</script> فرصة feina  ',
      '5eed0000-0000-4000-8000-000000000000/forum/5eed0000-0000-4000-8000-000000000011/2026/08/photo.jpg'
    )
  ) $$,
  'a player creates one attributed forum post'
);
select is((select count(*) from public.forum_posts where id = (select id from pg_temp.rapp50_ids where kind = 'post'))::integer, 1, 'the author can read her post');
select is((select content from public.forum_posts where id = (select id from pg_temp.rapp50_ids where kind = 'post')), '<script>alert(1)</script> فرصة feina', 'database validation trims without interpreting markup');
select is((select image_url is not null from public.forum_posts where id = (select id from pg_temp.rapp50_ids where kind = 'post')), true, 'the post keeps its authenticated R2 object key');
select lives_ok(
  $$ insert into pg_temp.rapp50_ids values (
    'reply',
    public.create_forum_reply(
      (select id from pg_temp.rapp50_ids where kind = 'post'),
      'أنا أعرف una feina'
    )
  ) $$,
  'the player replies with mixed-direction plain text'
);
select is((select reply_count from public.forum_posts where id = (select id from pg_temp.rapp50_ids where kind = 'post')), 1, 'reply count increments transactionally');

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000012","role":"authenticated"}';
select is((select count(*) from public.forum_posts where id = (select id from pg_temp.rapp50_ids where kind = 'post'))::integer, 1, 'another same-org player reads a visible post');
select is((select count(*) from public.forum_replies where post_id = (select id from pg_temp.rapp50_ids where kind = 'post'))::integer, 1, 'another same-org player reads visible replies');
select throws_ok(
  $$ select public.edit_own_forum_post((select id from pg_temp.rapp50_ids where kind = 'post'), 'stolen') $$,
  '42501', null::text,
  'DENIAL: another player cannot edit the post'
);
select throws_ok(
  $$ select public.delete_own_forum_post((select id from pg_temp.rapp50_ids where kind = 'post')) $$,
  '42501', null::text,
  'DENIAL: another player cannot delete the post'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000017","role":"authenticated"}';
select throws_ok(
  $$ select public.create_forum_post('5eed0000-0000-4000-8006-000000000004', 'banned', null) $$,
  '42501', null::text,
  'DENIAL: a forum-banned player cannot create a post'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated"}';
select lives_ok(
  $$ select public.edit_own_forum_post((select id from pg_temp.rapp50_ids where kind = 'post'), 'Editat per mi') $$,
  'the author edits her own visible post'
);
select is((select content from public.forum_posts where id = (select id from pg_temp.rapp50_ids where kind = 'post')), 'Editat per mi', 'the edit is stored');
select lives_ok(
  $$ select public.delete_own_forum_post((select id from pg_temp.rapp50_ids where kind = 'post')) $$,
  'the author soft-deletes her post'
);
select is((select visibility from public.forum_posts where id = (select id from pg_temp.rapp50_ids where kind = 'post')), 'deleted', 'the deleted thread becomes a tombstone');
select is((select content from public.forum_posts where id = (select id from pg_temp.rapp50_ids where kind = 'post')), null, 'the tombstone removes personal text');
select is((select image_url from public.forum_posts where id = (select id from pg_temp.rapp50_ids where kind = 'post')), null, 'the tombstone removes its media reference');
select is((select count(*) from public.forum_replies where post_id = (select id from pg_temp.rapp50_ids where kind = 'post'))::integer, 1, 'the tombstone preserves its reply thread');

reset role;
insert into public.forum_posts (
  id, org_id, category_id, author_id, content, visibility
) values (
  '5eed0000-0000-4000-8006-000000000099',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8006-000000000004',
  '5eed0000-0000-4000-8000-000000000011',
  'moderation hidden',
  'hidden'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000012","role":"authenticated"}';
select is((select count(*) from public.forum_posts where id = '5eed0000-0000-4000-8006-000000000099')::integer, 0, 'players cannot read moderation-hidden posts');
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*) from public.forum_posts where id = '5eed0000-0000-4000-8006-000000000099')::integer, 1, 'same-org staff reads moderation-hidden posts');
select lives_ok(
  $$ select public.edit_own_forum_post('5eed0000-0000-4000-8006-000000000099', 'staff correction') $$,
  'staff can edit any same-org post'
);

reset role;
insert into public.organizations (id, name, slug)
values ('5eed0000-0000-4000-8006-000000000200', 'RAPP-50 Other Org', 'rapp50-other-org');
insert into auth.users (id, email) values ('5eed0000-0000-4000-8006-000000000201', 'rapp50-other@example.test');
insert into public.profiles (id, org_id, role, first_name, last_name)
values ('5eed0000-0000-4000-8006-000000000201', '5eed0000-0000-4000-8006-000000000200', 'player', 'Other', 'Player');
set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8006-000000000201","role":"authenticated"}';
select is((select count(*) from public.forum_categories)::integer, 0, 'another organization cannot enumerate categories');
select is((select count(*) from public.forum_posts)::integer, 0, 'another organization cannot enumerate posts');

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated"}';
select throws_ok(
  $$ select public.create_forum_post('5eed0000-0000-4000-8006-000000000004', repeat('x', 2001), null) $$,
  '23514', null::text,
  'post text over the server cap is rejected'
);
select throws_ok(
  $$ select public.create_forum_reply('5eed0000-0000-4000-8010-000000000001', repeat('x', 1001)) $$,
  '23514', null::text,
  'reply text over the server cap is rejected'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000027","role":"authenticated"}';
insert into pg_temp.rapp50_ids values (
  'erasure-post',
  public.create_forum_post('5eed0000-0000-4000-8006-000000000004', 'erase my forum words', null)
);
insert into pg_temp.rapp50_ids values (
  'erasure-reply',
  public.create_forum_reply((select id from pg_temp.rapp50_ids where kind = 'erasure-post'), 'erase my reply')
);
reset role;
delete from auth.users where id = '5eed0000-0000-4000-8000-000000000027';
select is((select count(*) from public.forum_posts where author_id = '5eed0000-0000-4000-8000-000000000027')::integer, 0, 'user deletion removes authored forum posts');
select is((select count(*) from public.forum_replies where author_id = '5eed0000-0000-4000-8000-000000000027')::integer, 0, 'user deletion removes authored forum replies');

select * from finish();
rollback;
