-- Direct player/entity to staff messaging security and read-state contract (RAPP-47).

begin;
select plan(45);

select has_table('public', 'conversations', 'direct conversations exist');
select has_table('public', 'messages', 'conversation messages exist');
select has_table('public', 'conversation_read_states', 'read state exists per reader');
select has_column('public', 'messages', 'content', 'messages carry bounded text');
select has_column('public', 'messages', 'image_url', 'messages reserve an optional R2 object key');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.conversations'::regclass),
  'conversation RLS is enabled and forced'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.messages'::regclass),
  'message RLS is enabled and forced'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.conversation_read_states'::regclass),
  'read-state RLS is enabled and forced'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ),
  'message inserts are published to Supabase Realtime'
);
select is(
  (select disposition || ':' || participant_column from public.personal_data_disposition() where table_name = 'conversations'),
  'purge:user_id',
  'participant conversations are registered for erasure'
);
select is(
  (select disposition || ':' || participant_column from public.personal_data_disposition() where table_name = 'messages'),
  'purge:sender_id',
  'participant-authored messages are registered for erasure'
);
select is(
  (select disposition || ':' || participant_column from public.personal_data_disposition() where table_name = 'conversation_read_states'),
  'purge:user_id',
  'participant read state is registered for erasure'
);
select has_function('public', 'get_or_create_own_conversation', array[]::text[], 'non-staff users get one team conversation');
select has_function('public', 'send_message', array['uuid', 'uuid', 'text', 'text'], 'sending crosses one idempotent database boundary');
select has_function('public', 'mark_conversation_read', array['uuid', 'uuid'], 'read state advances through one authorized boundary');
select has_function('public', 'get_unread_message_count', array['uuid'], 'unread math has one server-owned boundary');

-- Seeded threads make the direct QA surfaces reachable. This transaction owns
-- an isolated messaging dataset so its counts prove only the behavior below.
delete from public.push_publications where content_type = 'message';
delete from public.conversations;

insert into public.push_tokens (id, user_id, token, platform, device_id)
values (
  'a4700000-0000-4000-8000-000000000001',
  '5eed0000-0000-4000-8000-000000000011',
  'ExponentPushToken[rapp47-player]',
  'android',
  'rapp47-player-device'
)
on conflict do nothing;

create or replace function pg_temp.message_publication_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.push_publications
  where content_type = 'message';
$$;

create or replace function pg_temp.message_delivery_count(recipient uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct delivery.publication_id)::integer
  from public.push_deliveries as delivery
  join public.push_publications as publication
    on publication.org_id = delivery.org_id
   and publication.id = delivery.publication_id
  where delivery.recipient_id = recipient
    and publication.content_type = 'message';
$$;

grant execute on function pg_temp.message_publication_count() to authenticated;
grant execute on function pg_temp.message_delivery_count(uuid) to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated"}';

select lives_ok(
  $$ select public.get_or_create_own_conversation() $$,
  'a player can open her single team conversation'
);
select lives_ok(
  $$ select public.get_or_create_own_conversation() $$,
  'opening the same team conversation is idempotent'
);
select is((select count(*) from public.conversations)::integer, 1, 'the player still sees exactly one conversation');
select throws_ok(
  $$ insert into public.conversations (org_id, user_id)
     values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-000000000012') $$,
  '42501', null::text,
  'DENIAL: a player cannot create a conversation for another player'
);
select lives_ok(
  $$ select public.send_message(
    (select id from public.conversations limit 1),
    'a4700000-0000-4000-8001-000000000001',
    'rapp47-player-message',
    null
  ) $$,
  'the participant can send to the team'
);
select lives_ok(
  $$ select public.send_message(
    (select id from public.conversations limit 1),
    'a4700000-0000-4000-8001-000000000001',
    'rapp47-player-message',
    null
  ) $$,
  'retrying the same client message id is idempotent'
);
select is((select count(*) from public.messages)::integer, 1, 'the retry leaves one message row');
select is(
  pg_temp.message_publication_count(),
  0,
  'participant messages do not notify the participant'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000012","role":"authenticated"}';
select throws_ok(
  $$ select public.send_message(
    (select id from public.conversations),
    'a4700000-0000-4000-8001-000000000002',
    'rapp47-cross-player-attempt',
    null
  ) $$,
  '42501', null::text,
  'DENIAL: a second player cannot write into another player conversation'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000004","role":"authenticated"}';
select lives_ok($$ select public.get_or_create_own_conversation() $$, 'an entity contact gets one general staff conversation');
select lives_ok(
  $$ select public.send_message(
    (select id from public.conversations limit 1),
    'a4700000-0000-4000-8001-000000000003',
    'rapp47-entity-message',
    null
  ) $$,
  'the entity contact can send in its own general thread'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*) from public.conversations)::integer, 2, 'same-org staff can read player and entity conversations');
select lives_ok(
  $$ select public.send_message(
    (select id from public.conversations where user_id = '5eed0000-0000-4000-8000-000000000011'),
    'a4700000-0000-4000-8001-000000000004',
    'rapp47-staff-reply-one',
    null
  ) $$,
  'staff can reply in the player conversation'
);
select lives_ok(
  $$ select public.send_message(
    (select id from public.conversations where user_id = '5eed0000-0000-4000-8000-000000000011'),
    'a4700000-0000-4000-8001-000000000005',
    'rapp47-staff-reply-two',
    null
  ) $$,
  'rapid staff replies remain distinct'
);
select is(
  pg_temp.message_publication_count(),
  2,
  'each new staff reply creates one durable push publication'
);
select is(
  pg_temp.message_delivery_count('5eed0000-0000-4000-8000-000000000011'),
  2,
  'the opted-in player receives one targeted delivery per staff reply'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated"}';
select is(public.get_unread_message_count(null), 2::bigint, 'both staff replies are initially unread');
select lives_ok(
  $$ select public.mark_conversation_read(
    (select id from public.conversations limit 1),
    'a4700000-0000-4000-8001-000000000004'
  ) $$,
  'the participant can advance read state through the first reply'
);
select is(public.get_unread_message_count(null), 1::bigint, 'one later reply remains unread');
select lives_ok(
  $$ select public.mark_conversation_read(
    (select id from public.conversations limit 1),
    'a4700000-0000-4000-8001-000000000005'
  ) $$,
  'the participant can advance through the latest reply'
);
select is(public.get_unread_message_count(null), 0::bigint, 'read-through clears the participant badge');

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000012","role":"authenticated"}';
select throws_ok(
  $$ select public.mark_conversation_read(
    (select id from public.conversations),
    'a4700000-0000-4000-8001-000000000005'
  ) $$,
  '42501', null::text,
  'DENIAL: another player cannot alter read state in the thread'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated"}';
select throws_ok(
  $$ select public.send_message(
    (select id from public.conversations limit 1),
    'a4700000-0000-4000-8001-000000000006',
    '   ',
    null
  ) $$,
  '23514', null::text,
  'blank messages are rejected'
);
select throws_ok(
  $$ select public.send_message(
    (select id from public.conversations limit 1),
    'a4700000-0000-4000-8001-000000000007',
    repeat('x', 4001),
    null
  ) $$,
  '23514', null::text,
  'messages longer than 4000 characters are rejected'
);

reset role;
update public.profiles set push_notifications_enabled = false where id = '5eed0000-0000-4000-8000-000000000012';
set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000012","role":"authenticated"}';
select public.get_or_create_own_conversation();
reset role;
insert into public.push_tokens (id, user_id, token, platform, device_id)
values (
  'a4700000-0000-4000-8000-000000000002',
  '5eed0000-0000-4000-8000-000000000012',
  'ExponentPushToken[rapp47-opt-out]',
  'ios',
  'rapp47-opt-out-device'
)
on conflict do nothing;
set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';
select public.send_message(
  (select id from public.conversations where user_id = '5eed0000-0000-4000-8000-000000000012'),
  'a4700000-0000-4000-8001-000000000008',
  'rapp47-opt-out-reply',
  null
);
select is(
  pg_temp.message_delivery_count('5eed0000-0000-4000-8000-000000000012'),
  0,
  'push opt-out prevents a delivery row for a staff reply'
);
reset role;

insert into public.organizations (id, name, slug)
values ('a4700000-0000-4000-8002-000000000001', 'RAPP-47 Other Org', 'rapp47-other-org');
insert into auth.users (id, email) values ('a4700000-0000-4000-8002-000000000002', 'rapp47-other-staff@example.test');
insert into public.profiles (id, org_id, role, first_name, last_name)
values (
  'a4700000-0000-4000-8002-000000000002',
  'a4700000-0000-4000-8002-000000000001',
  'staff',
  'Other',
  'Staff'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"a4700000-0000-4000-8002-000000000002","role":"authenticated"}';
select is((select count(*) from public.conversations)::integer, 0, 'cross-org staff cannot enumerate conversations');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000026","role":"authenticated"}';
select public.get_or_create_own_conversation();
select public.send_message(
  (select id from public.conversations limit 1),
  'a4700000-0000-4000-8001-000000000009',
  'rapp47-erasure-message',
  null
);
select public.mark_conversation_read(
  (select id from public.conversations limit 1),
  'a4700000-0000-4000-8001-000000000009'
);
reset role;
delete from auth.users where id = '5eed0000-0000-4000-8000-000000000026';
select is((select count(*) from public.conversations where user_id = '5eed0000-0000-4000-8000-000000000026')::integer, 0, 'user deletion removes the conversation');
select is((select count(*) from public.messages where sender_id = '5eed0000-0000-4000-8000-000000000026')::integer, 0, 'user deletion removes authored messages');
select is((select count(*) from public.conversation_read_states where user_id = '5eed0000-0000-4000-8000-000000000026')::integer, 0, 'user deletion removes read state');

select * from finish();
rollback;
