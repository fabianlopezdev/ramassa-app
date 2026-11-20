-- An answer can belong to another answer of the same post, two levels at most (RAPP-884).

begin;
select no_plan();

select has_column('public', 'forum_replies', 'parent_reply_id', 'an answer can name the answer it answers');
select col_is_null('public', 'forum_replies', 'parent_reply_id', 'an answer to the post has no parent');
select has_function(
  'public', 'create_forum_reply', array['uuid', 'text', 'uuid'],
  'answering an answer crosses the same validated boundary as answering a post'
);
select hasnt_function(
  'public', 'create_forum_reply', array['uuid', 'text'],
  'the two-argument boundary is replaced, so a call by name has one function to resolve to'
);
select is(
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'forum_replies_parent_tenant_fkey'),
  'FOREIGN KEY (org_id, post_id, parent_reply_id) REFERENCES forum_replies(org_id, post_id, id) ON DELETE SET NULL (parent_reply_id)',
  'the parent is held to the same post and organization, and only the parent id clears when it is removed'
);
select is(
  (select count(*)::integer from public.forum_replies where parent_reply_id is not null
     and post_id <> '5eed0000-0000-4000-8010-000000000001'),
  0,
  'outside the seeded example, every answer is still an answer to its post'
);

create temporary table rapp884_ids (kind text primary key, id uuid not null);
grant select, insert, update, delete on table pg_temp.rapp884_ids to authenticated;

-- A post, an answer to it, and an answer to that answer -----------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into pg_temp.rapp884_ids values (
  'post', public.create_forum_post('5eed0000-0000-4000-8006-000000000004', 'Algú sap on puc aprendre català?', null)
);
insert into pg_temp.rapp884_ids values (
  'other-post', public.create_forum_post('5eed0000-0000-4000-8006-000000000004', 'Un altre fil', null)
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000012","role":"authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ insert into pg_temp.rapp884_ids values (
    'level-one',
    public.create_forum_reply((select id from pg_temp.rapp884_ids where kind = 'post'), 'A la biblioteca fan classes')
  ) $$,
  'a player answers the post with the two arguments every app build sends'
);
select is(
  (select parent_reply_id from public.forum_replies where id = (select id from pg_temp.rapp884_ids where kind = 'level-one')),
  null,
  'an answer sent without a parent answers the post'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000014","role":"authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ insert into pg_temp.rapp884_ids values (
    'level-two',
    public.create_forum_reply(
      p_post_id => (select id from pg_temp.rapp884_ids where kind = 'post'),
      p_content => 'Quin dia?',
      p_parent_reply_id => (select id from pg_temp.rapp884_ids where kind = 'level-one')
    )
  ) $$,
  'another player answers the answer'
);
select is(
  (select parent_reply_id from public.forum_replies where id = (select id from pg_temp.rapp884_ids where kind = 'level-two')),
  (select id from pg_temp.rapp884_ids where kind = 'level-one'),
  'the answer to an answer keeps its parent'
);
select is(
  (select count(*)::integer from public.forum_replies where post_id = (select id from pg_temp.rapp884_ids where kind = 'post')),
  2,
  'another player reads both levels of the thread'
);
select is(
  (select reply_count from public.forum_posts where id = (select id from pg_temp.rapp884_ids where kind = 'post')),
  2,
  'the post counts every answer, at either level'
);

-- What the database refuses ------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000015","role":"authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.create_forum_reply(
    (select id from pg_temp.rapp884_ids where kind = 'post'),
    'Un tercer nivell',
    (select id from pg_temp.rapp884_ids where kind = 'level-two')
  ) $$,
  '23514', null::text,
  'DENIAL: an answer to an answer to an answer is refused'
);
select throws_ok(
  $$ select public.create_forum_reply(
    (select id from pg_temp.rapp884_ids where kind = 'other-post'),
    'A un altre fil',
    (select id from pg_temp.rapp884_ids where kind = 'level-one')
  ) $$,
  '23503', null::text,
  'DENIAL: an answer cannot answer an answer of another post'
);
select is(
  (select reply_count from public.forum_posts where id = (select id from pg_temp.rapp884_ids where kind = 'post')),
  2,
  'refused answers leave the count alone'
);

reset role;
-- Clears the player so the authorship trigger keeps the authors named below.
set local request.jwt.claims = '{}';
insert into public.organizations (id, name, slug)
values ('5eed0000-0000-4000-8884-000000000200', 'RAPP-884 Other Org', 'rapp884-other-org');
insert into auth.users (id, email) values ('5eed0000-0000-4000-8884-000000000201', 'rapp884-other@example.test');
insert into public.profiles (id, org_id, role, first_name, last_name)
values ('5eed0000-0000-4000-8884-000000000201', '5eed0000-0000-4000-8884-000000000200', 'player', 'Other', 'Player');
insert into public.forum_categories (id, org_id, name, slug, icon, color)
values (
  '5eed0000-0000-4000-8884-000000000202', '5eed0000-0000-4000-8884-000000000200',
  '{"ca":"General","es":"General","en":"General","ar":"عام","fa":"عمومی"}', 'general', 'bubble', 'neutral'
);
insert into public.forum_posts (id, org_id, category_id, author_id, author_first_name, content)
values (
  '5eed0000-0000-4000-8884-000000000203', '5eed0000-0000-4000-8884-000000000200',
  '5eed0000-0000-4000-8884-000000000202', '5eed0000-0000-4000-8884-000000000201', 'pending', 'Other org post'
);
insert into public.forum_replies (id, org_id, post_id, author_id, author_first_name, content)
values (
  '5eed0000-0000-4000-8884-000000000204', '5eed0000-0000-4000-8884-000000000200',
  '5eed0000-0000-4000-8884-000000000203', '5eed0000-0000-4000-8884-000000000201', 'pending', 'Other org answer'
);
select throws_ok(
  $$ insert into public.forum_replies (org_id, post_id, parent_reply_id, author_id, author_first_name, content)
     values (
       '5eed0000-0000-4000-8000-000000000000',
       (select id from pg_temp.rapp884_ids where kind = 'post'),
       '5eed0000-0000-4000-8884-000000000204',
       '5eed0000-0000-4000-8000-000000000011',
       'pending',
       'Cross-tenant answer'
     ) $$,
  '23503', null::text,
  'DENIAL: even a privileged write cannot attach an answer to another organization''s answer'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000015","role":"authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.create_forum_reply(
    (select id from pg_temp.rapp884_ids where kind = 'post'),
    'Cross-tenant answer',
    '5eed0000-0000-4000-8884-000000000204'
  ) $$,
  '23503', null::text,
  'DENIAL: a player cannot answer another organization''s answer'
);

-- A parent that is not visible ---------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000012","role":"authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into pg_temp.rapp884_ids values (
  'to-hide', public.create_forum_reply((select id from pg_temp.rapp884_ids where kind = 'post'), 'Una resposta que s''amagarà')
);
insert into pg_temp.rapp884_ids values (
  'to-delete', public.create_forum_reply((select id from pg_temp.rapp884_ids where kind = 'post'), 'Una resposta que s''esborrarà')
);
insert into pg_temp.rapp884_ids values (
  'to-review', public.create_forum_reply((select id from pg_temp.rapp884_ids where kind = 'post'), 'Una resposta per revisar')
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select public.moderate_forum_target('reply', (select id from pg_temp.rapp884_ids where kind = 'to-hide'), 'hide');
select public.moderate_forum_target('reply', (select id from pg_temp.rapp884_ids where kind = 'to-delete'), 'delete');
reset role;
update public.forum_replies set visibility = 'hidden_pending_review'
where id = (select id from pg_temp.rapp884_ids where kind = 'to-review');

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000014","role":"authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.create_forum_reply((select id from pg_temp.rapp884_ids where kind = 'post'), 'Hola', (select id from pg_temp.rapp884_ids where kind = 'to-hide')) $$,
  '42501', null::text,
  'DENIAL: a player cannot answer a hidden answer'
);
select throws_ok(
  $$ select public.create_forum_reply((select id from pg_temp.rapp884_ids where kind = 'post'), 'Hola', (select id from pg_temp.rapp884_ids where kind = 'to-delete')) $$,
  '42501', null::text,
  'DENIAL: a player cannot answer a deleted answer'
);
select throws_ok(
  $$ select public.create_forum_reply((select id from pg_temp.rapp884_ids where kind = 'post'), 'Hola', (select id from pg_temp.rapp884_ids where kind = 'to-review')) $$,
  '42501', null::text,
  'DENIAL: a player cannot answer an answer waiting for review'
);
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.create_forum_reply((select id from pg_temp.rapp884_ids where kind = 'post'), 'Hola', (select id from pg_temp.rapp884_ids where kind = 'to-hide')) $$,
  '42501', null::text,
  'DENIAL: staff cannot answer a hidden answer either, as with a hidden post'
);

-- An answer never moves under another answer -------------------------------------------------------------------

select throws_ok(
  $$ update public.forum_replies
     set parent_reply_id = (select id from pg_temp.rapp884_ids where kind = 'level-one')
     where id = (select id from pg_temp.rapp884_ids where kind = 'to-hide') $$,
  '23514', null::text,
  'DENIAL: staff cannot move an answer under another answer'
);
reset role;
select throws_ok(
  $$ update public.forum_replies
     set parent_reply_id = (select id from pg_temp.rapp884_ids where kind = 'level-two')
     where id = (select id from pg_temp.rapp884_ids where kind = 'to-hide') $$,
  '23514', null::text,
  'DENIAL: not even a privileged write can push an answer to a third level'
);

-- A tombstone keeps the answers to it ----------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select public.moderate_forum_target('reply', (select id from pg_temp.rapp884_ids where kind = 'level-one'), 'delete');
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000015","role":"authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select visibility || ':' || coalesce(content, 'no text') from public.forum_replies where id = (select id from pg_temp.rapp884_ids where kind = 'level-one')),
  'deleted:no text',
  'a deleted parent stays as a tombstone a player can read'
);
select is(
  (select parent_reply_id from public.forum_replies where id = (select id from pg_temp.rapp884_ids where kind = 'level-two')),
  (select id from pg_temp.rapp884_ids where kind = 'level-one'),
  'the answers to a tombstone stay under it'
);

-- Erasing an author keeps the answers other players wrote to her ---------------------------------------------

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000027","role":"authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into pg_temp.rapp884_ids values (
  'erased-parent', public.create_forum_reply((select id from pg_temp.rapp884_ids where kind = 'post'), 'Esborreu les meves paraules')
);
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000012","role":"authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into pg_temp.rapp884_ids values (
  'kept-one', public.create_forum_reply((select id from pg_temp.rapp884_ids where kind = 'post'), 'La meva resposta', (select id from pg_temp.rapp884_ids where kind = 'erased-parent'))
);
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000014","role":"authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into pg_temp.rapp884_ids values (
  'kept-two', public.create_forum_reply((select id from pg_temp.rapp884_ids where kind = 'post'), 'I la meva', (select id from pg_temp.rapp884_ids where kind = 'erased-parent'))
);
reset role;
create temporary table rapp884_count_before as
  select reply_count from public.forum_posts where id = (select id from pg_temp.rapp884_ids where kind = 'post');
select lives_ok(
  $$ delete from auth.users where id = '5eed0000-0000-4000-8000-000000000027' $$,
  'erasing an author who has answers to her answer succeeds'
);
select is(
  (select count(*)::integer from public.forum_replies where id = (select id from pg_temp.rapp884_ids where kind = 'erased-parent')),
  0,
  'her answer is removed with her account'
);
select is(
  (select count(*)::integer from public.forum_replies
   where id in (select id from pg_temp.rapp884_ids where kind in ('kept-one', 'kept-two'))
     and parent_reply_id is null
     and content is not null),
  2,
  'the answers other players wrote to her answer stay, as answers to the post'
);
select is(
  (select reply_count from public.forum_posts where id = (select id from pg_temp.rapp884_ids where kind = 'post')),
  (select reply_count - 1 from pg_temp.rapp884_count_before),
  'the post count drops by her one answer'
);
select is(
  (select count(*)::integer from public.forum_replies
   where post_id = (select id from pg_temp.rapp884_ids where kind = 'post')),
  (select reply_count from public.forum_posts where id = (select id from pg_temp.rapp884_ids where kind = 'post')),
  'the post count still equals the answers it has at every level'
);

-- Removing a post removes both levels -----------------------------------------------------------------------------

select lives_ok(
  $$ delete from public.forum_posts where id = (select id from pg_temp.rapp884_ids where kind = 'post') $$,
  'a post with answers to answers can be removed'
);
select is(
  (select count(*)::integer from public.forum_replies where post_id = (select id from pg_temp.rapp884_ids where kind = 'post')),
  0,
  'removing the post removes every answer at both levels'
);

-- The seeded example ------------------------------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.forum_replies
   where parent_reply_id = '5eed0000-0000-4000-8010-000000000011'),
  2,
  'the seeded answer has two answers'
);
select is(
  (select count(distinct author_id)::integer from public.forum_replies
   where parent_reply_id = '5eed0000-0000-4000-8010-000000000011'),
  2,
  'two different players wrote the seeded answers to an answer'
);
select is(
  (select count(*)::integer from public.forum_replies
   where post_id = '5eed0000-0000-4000-8010-000000000001' and parent_reply_id is null),
  2,
  'the seeded post has two answers to the post'
);

select * from finish();
rollback;
