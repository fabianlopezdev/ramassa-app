-- Forum flags, race-safe auto-hide, moderation, soft bans, and staff push (RAPP-51).

begin;
select no_plan();

select has_table('public', 'forum_flags', 'forum flags exist');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.forum_flags'::regclass),
  'forum flag RLS is enabled and forced'
);
select has_function(
  'public', 'flag_forum_content', array['text', 'uuid', 'text', 'text'],
  'player flagging crosses one validated boundary'
);
select has_function(
  'public', 'moderate_forum_target', array['text', 'uuid', 'text'],
  'moderation actions cross one staff-only boundary'
);
select has_function(
  'public', 'list_forum_moderation_queue', array[]::text[],
  'the staff queue has one read boundary'
);
select has_function(
  'public', 'set_forum_posting_disabled', array['uuid', 'boolean'],
  'the posting ban has one staff-only boundary'
);
select has_function(
  'public', 'get_or_create_staff_conversation', array['uuid'],
  'contact author creates or reuses the RAPP-47 conversation'
);
select has_function(
  'public', 'save_forum_category', array['uuid', 'jsonb', 'text', 'text', 'text', 'integer'],
  'category create and edit share one staff-only boundary'
);
select has_function(
  'public', 'delete_forum_category', array['uuid'],
  'category deletion has one staff-only boundary'
);

create temporary table rapp51_ids (kind text primary key, id uuid not null);
grant select, insert, update, delete on table pg_temp.rapp51_ids to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated"}';
insert into pg_temp.rapp51_ids values (
  'post',
  public.create_forum_post(
    '5eed0000-0000-4000-8006-000000000002',
    'A post that the community can flag',
    null
  )
);
insert into pg_temp.rapp51_ids values (
  'reply',
  public.create_forum_reply(
    (select id from pg_temp.rapp51_ids where kind = 'post'),
    'A reply that the community can flag'
  )
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000012","role":"authenticated"}';
select lives_ok(
  $$ select public.flag_forum_content(
    'post',
    (select id from pg_temp.rapp51_ids where kind = 'post'),
    'harassment',
    'Em fa sentir insegura'
  ) $$,
  'a player flags a post with a reason and optional comment'
);
select is(
  (select flag_count from public.forum_posts where id = (select id from pg_temp.rapp51_ids where kind = 'post')),
  1,
  'the first distinct flag increments the durable count once'
);
select is(
  (select visibility from public.forum_posts where id = (select id from pg_temp.rapp51_ids where kind = 'post')),
  'visible',
  'one flag does not hide the post'
);
select throws_ok(
  $$ select public.flag_forum_content(
    'post',
    (select id from pg_temp.rapp51_ids where kind = 'post'),
    'spam',
    null
  ) $$,
  '23505', null::text,
  'DENIAL: one player cannot flag the same target twice'
);
select is(
  (select flag_count from public.forum_posts where id = (select id from pg_temp.rapp51_ids where kind = 'post')),
  1,
  'repeated attempts by one user never count as distinct flags'
);
select is(
  (select count(*) from public.forum_flags where post_id = (select id from pg_temp.rapp51_ids where kind = 'post'))::integer,
  1,
  'a player sees only her own flag'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000014","role":"authenticated"}';
select lives_ok(
  $$ select public.flag_forum_content(
    'post',
    (select id from pg_temp.rapp51_ids where kind = 'post'),
    'privacy',
    null
  ) $$,
  'a second player adds the second distinct flag'
);
select is(
  (select visibility from public.forum_posts where id = (select id from pg_temp.rapp51_ids where kind = 'post')),
  'visible',
  'two distinct flags still leave the post visible'
);
select is(
  (select count(*) from public.forum_flags where post_id = (select id from pg_temp.rapp51_ids where kind = 'post'))::integer,
  1,
  'flagger anonymity hides the first player from the second'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000015","role":"authenticated"}';
select lives_ok(
  $$ select public.flag_forum_content(
    'post',
    (select id from pg_temp.rapp51_ids where kind = 'post'),
    'hate',
    null
  ) $$,
  'a third player adds the third distinct flag'
);
select is(
  (select count(*) from public.forum_posts where id = (select id from pg_temp.rapp51_ids where kind = 'post'))::integer,
  0,
  'RLS hides a three-flag post from players immediately'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select visibility from public.forum_posts where id = (select id from pg_temp.rapp51_ids where kind = 'post')),
  'hidden_pending_review',
  'staff sees the server-enforced pending-review state'
);
select is(
  (select flag_count from public.forum_posts where id = (select id from pg_temp.rapp51_ids where kind = 'post')),
  3,
  'the hidden post records exactly three distinct pending flags'
);
select is(
  (select count(*) from public.forum_flags where post_id = (select id from pg_temp.rapp51_ids where kind = 'post'))::integer,
  3,
  'staff can review every flag on the target'
);
select is(
  (select count(*) from public.list_forum_moderation_queue() where target_id = (select id from pg_temp.rapp51_ids where kind = 'post'))::integer,
  1,
  'the staff queue groups flags into one target, flagged first'
);
select lives_ok(
  $$ select public.moderate_forum_target(
    'post',
    (select id from pg_temp.rapp51_ids where kind = 'post'),
    'dismiss'
  ) $$,
  'staff dismisses the flags'
);
select is(
  (select visibility || ':' || flag_count::text from public.forum_posts where id = (select id from pg_temp.rapp51_ids where kind = 'post')),
  'visible:0',
  'dismissal restores only the pending-review target and clears its pending count'
);
select is(
  (select count(*) from public.forum_flags where state = 'pending' and post_id = (select id from pg_temp.rapp51_ids where kind = 'post'))::integer,
  0,
  'dismissal leaves no pending flags in the queue'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000012","role":"authenticated"}';
select is(
  (select count(*) from public.forum_posts where id = (select id from pg_temp.rapp51_ids where kind = 'post'))::integer,
  1,
  'the restored post is visible to players again'
);
select lives_ok(
  $$ select public.flag_forum_content(
    'reply',
    (select id from pg_temp.rapp51_ids where kind = 'reply'),
    'spam',
    null
  ) $$,
  'a player can flag a reply'
);
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000014","role":"authenticated"}';
select lives_ok(
  $$ select public.flag_forum_content(
    'reply',
    (select id from pg_temp.rapp51_ids where kind = 'reply'),
    'spam',
    null
  ) $$,
  'a second player flags the reply'
);
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000015","role":"authenticated"}';
select lives_ok(
  $$ select public.flag_forum_content(
    'reply',
    (select id from pg_temp.rapp51_ids where kind = 'reply'),
    'spam',
    null
  ) $$,
  'a third player flags the reply'
);
select is(
  (select count(*) from public.forum_replies where id = (select id from pg_temp.rapp51_ids where kind = 'reply'))::integer,
  0,
  'RLS hides a three-flag reply from players immediately'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok(
  $$ select public.moderate_forum_target(
    'reply',
    (select id from pg_temp.rapp51_ids where kind = 'reply'),
    'hide'
  ) $$,
  'staff permanently hides a flagged reply'
);
select is(
  (select visibility from public.forum_replies where id = (select id from pg_temp.rapp51_ids where kind = 'reply')),
  'hidden',
  'the hide action does not restore on resolution'
);
select lives_ok(
  $$ select public.set_forum_post_pinned(
    (select id from pg_temp.rapp51_ids where kind = 'post'),
    true
  ) $$,
  'staff pins a visible post'
);
select is(
  (select is_pinned from public.forum_posts where id = (select id from pg_temp.rapp51_ids where kind = 'post')),
  true,
  'the pin state is persisted'
);
select lives_ok(
  $$ select public.set_forum_post_category(
    (select id from pg_temp.rapp51_ids where kind = 'post'),
    '5eed0000-0000-4000-8006-000000000003'
  ) $$,
  'staff moves a post to another category'
);
select is(
  (select category_id from public.forum_posts where id = (select id from pg_temp.rapp51_ids where kind = 'post')),
  '5eed0000-0000-4000-8006-000000000003'::uuid,
  'the category change is persisted'
);
insert into pg_temp.rapp51_ids values (
  'category',
  public.save_forum_category(
    null,
    '{"ca":"Suport","es":"Apoyo","en":"Support","ar":"الدعم","fa":"پشتیبانی"}'::jsonb,
    'support',
    'heart',
    'primary',
    50
  )
);
select lives_ok(
  $$ select public.save_forum_category(
    (select id from pg_temp.rapp51_ids where kind = 'category'),
    '{"ca":"Ajuda","es":"Ayuda","en":"Help","ar":"مساعدة","fa":"کمک"}'::jsonb,
    'help',
    'heart',
    'primary',
    51
  ) $$,
  'staff edits a forum category'
);
select is(
  (select slug || ':' || sort_order::text from public.forum_categories where id = (select id from pg_temp.rapp51_ids where kind = 'category')),
  'help:51',
  'the category edit is persisted'
);
select lives_ok(
  $$ select public.delete_forum_category((select id from pg_temp.rapp51_ids where kind = 'category')) $$,
  'staff deletes an unused forum category'
);

select lives_ok(
  $$ select public.set_forum_posting_disabled(
    '5eed0000-0000-4000-8000-000000000012',
    true
  ) $$,
  'staff disables forum posting for a participant'
);
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000012","role":"authenticated"}';
select throws_ok(
  $$ select public.create_forum_post(
    '5eed0000-0000-4000-8006-000000000002',
    'server must reject this post',
    null
  ) $$,
  '42501', null::text,
  'DENIAL: a soft-banned player cannot create a post at the API'
);
select throws_ok(
  $$ select public.create_forum_reply(
    (select id from pg_temp.rapp51_ids where kind = 'post'),
    'server must reject this reply'
  ) $$,
  '42501', null::text,
  'DENIAL: a soft-banned player cannot create a reply at the API'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  public.get_or_create_staff_conversation('5eed0000-0000-4000-8000-000000000011'),
  public.get_or_create_staff_conversation('5eed0000-0000-4000-8000-000000000011'),
  'contact author reuses the same deep-link conversation'
);
reset role;
select ok(
  exists (
    select 1
    from public.push_publications
    where content_type = 'forum_flag'
      and content_id in (select id from public.forum_flags)
  ),
  'a new forum flag enters the existing RAPP-36 push publication pipeline'
);
select ok(
  exists (
    select 1
    from public.push_deliveries as delivery
    join public.profiles as recipient on recipient.id = delivery.recipient_id
    join public.push_publications as publication on publication.id = delivery.publication_id
    where publication.content_type = 'forum_flag'
      and recipient.role in ('staff', 'admin')
  ),
  'forum flag push deliveries target staff devices only'
);

delete from vault.secrets where name = 'push_dispatch_secret';
select vault.create_secret(
  'rapp51-test-push-dispatch-secret-000000000000000000000000',
  'push_dispatch_secret',
  'RAPP-51 pgTAP delivery proof'
);
create temporary table rapp51_push_claim as
select *
from public.claim_push_deliveries(
  'rapp51-test-push-dispatch-secret-000000000000000000000000',
  '5eed0000-0000-4000-8013-000000000001',
  '2099-08-12 12:00:00+00',
  1000
);
select ok(
  exists (
    select 1
    from pg_temp.rapp51_push_claim as claim
    join public.push_deliveries as delivery on delivery.id = claim.delivery_id
    join public.profiles as recipient on recipient.id = delivery.recipient_id
    where claim.content_type = 'forum_flag'
      and recipient.role in ('staff', 'admin')
  ),
  'the dispatcher claims a forum flag delivery for a staff device'
);
create temporary table rapp51_ticket as
select claim.delivery_id
from pg_temp.rapp51_push_claim as claim
join public.push_deliveries as delivery on delivery.id = claim.delivery_id
join public.profiles as recipient on recipient.id = delivery.recipient_id
where claim.content_type = 'forum_flag'
  and recipient.role in ('staff', 'admin')
order by claim.delivery_id
limit 1;
select is(
  public.record_push_delivery_results(
    'rapp51-test-push-dispatch-secret-000000000000000000000000',
    '5eed0000-0000-4000-8013-000000000001',
    jsonb_build_array(
      jsonb_build_object(
        'delivery_id', (select delivery_id from pg_temp.rapp51_ticket),
        'state', 'ticketed',
        'ticket_id', 'rapp51-forum-ticket-1'
      )
    ),
    '2099-08-12 12:00:01+00'
  ),
  1,
  'Expo ticket acceptance is durably recorded for the staff flag alert'
);
create temporary table rapp51_receipt_claim as
select *
from public.claim_push_receipts(
  'rapp51-test-push-dispatch-secret-000000000000000000000000',
  '5eed0000-0000-4000-8013-000000000002',
  '2099-08-12 12:15:01+00',
  1000
);
select is(
  (select count(*) from pg_temp.rapp51_receipt_claim where delivery_id = (select delivery_id from pg_temp.rapp51_ticket))::integer,
  1,
  'the staff flag ticket becomes receipt-eligible after fifteen minutes'
);
select is(
  public.record_push_receipt_results(
    'rapp51-test-push-dispatch-secret-000000000000000000000000',
    '5eed0000-0000-4000-8013-000000000002',
    jsonb_build_array(
      jsonb_build_object(
        'delivery_id', (select delivery_id from pg_temp.rapp51_ticket),
        'state', 'delivered'
      )
    ),
    '2099-08-12 12:15:02+00'
  ),
  1,
  'the successful staff-device receipt is durably recorded'
);
select is(
  (select state from public.push_deliveries where id = (select delivery_id from pg_temp.rapp51_ticket)),
  'delivered',
  'forum flag push proof reaches the terminal delivered state'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated"}';
insert into pg_temp.rapp51_ids values (
  'erasure-post',
  public.create_forum_post(
    '5eed0000-0000-4000-8006-000000000002',
    'A post used to prove flag erasure',
    null
  )
);
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000027","role":"authenticated"}';
select public.flag_forum_content(
  'post',
  (select id from pg_temp.rapp51_ids where kind = 'erasure-post'),
  'other',
  'This flag must be erased with its author'
);
reset role;
delete from auth.users where id = '5eed0000-0000-4000-8000-000000000027';
select is(
  (select count(*) from public.forum_flags where flagger_id = '5eed0000-0000-4000-8000-000000000027')::integer,
  0,
  'account deletion cascades participant-authored forum flags'
);

select is(
  (select disposition || ':' || participant_column from public.personal_data_disposition() where table_name = 'forum_flags'),
  'purge:flagger_id',
  'participant-authored flags are registered for erasure'
);

select * from finish();
rollback;
