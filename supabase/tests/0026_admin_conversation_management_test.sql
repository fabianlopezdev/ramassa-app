-- Admin conversation assignment, filtering, timeline and permission contracts (RAPP-48).

begin;
select plan(38);

select has_table(
  'public', 'conversation_assignment_history',
  'conversation assignment changes have a durable history'
);
select has_column(
  'public', 'conversation_assignment_history', 'changed_by',
  'assignment history records the staff actor'
);
select has_column(
  'public', 'conversation_assignment_history', 'previous_staff_id',
  'assignment history preserves the previous owner'
);
select has_column(
  'public', 'conversation_assignment_history', 'assigned_staff_id',
  'assignment history preserves assign and unassign outcomes'
);
select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'public.conversation_assignment_history'::regclass
  ),
  'assignment history RLS is enabled and forced'
);
select has_function(
  'public', 'list_staff_conversations', array['boolean', 'boolean', 'text', 'text'],
  'one staff list boundary owns ordering and filters'
);
select has_function(
  'public', 'set_conversation_assignment', array['uuid', 'uuid'],
  'assignment crosses one staff-only boundary'
);
select ok(
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversations'
  ),
  'assignment changes are published to Supabase Realtime'
);

delete from public.push_publications where content_type = 'message';
delete from public.conversations;

insert into public.conversations (id, org_id, user_id, created_at)
values
  (
    'a4800000-0000-4000-8000-000000000001',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8000-000000000011',
    '2026-08-11 10:00:00+00'
  ),
  (
    'a4800000-0000-4000-8000-000000000002',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8000-000000000020',
    '2026-08-11 10:05:00+00'
  ),
  (
    'a4800000-0000-4000-8000-000000000003',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8000-000000000024',
    '2026-08-11 10:10:00+00'
  ),
  (
    'a4800000-0000-4000-8000-000000000004',
    '5eed0000-0000-4000-8000-000000000000',
    '5eed0000-0000-4000-8000-000000000004',
    '2026-08-11 10:15:00+00'
  );

alter table public.messages disable trigger messages_enqueue_push;
insert into public.messages (id, org_id, conversation_id, sender_id, content, created_at)
values
  (
    'a4800000-0000-4000-8001-000000000001',
    '5eed0000-0000-4000-8000-000000000000',
    'a4800000-0000-4000-8000-000000000001',
    '5eed0000-0000-4000-8000-000000000011',
    'rapp48-player-arabic',
    '2026-08-11 11:00:00+00'
  ),
  (
    'a4800000-0000-4000-8001-000000000002',
    '5eed0000-0000-4000-8000-000000000000',
    'a4800000-0000-4000-8000-000000000002',
    '5eed0000-0000-4000-8000-000000000020',
    'rapp48-player-cyrillic',
    '2026-08-11 11:05:00+00'
  ),
  (
    'a4800000-0000-4000-8001-000000000003',
    '5eed0000-0000-4000-8000-000000000000',
    'a4800000-0000-4000-8000-000000000003',
    '5eed0000-0000-4000-8000-000000000024',
    'rapp48-player-accent',
    '2026-08-11 11:10:00+00'
  ),
  (
    'a4800000-0000-4000-8001-000000000004',
    '5eed0000-0000-4000-8000-000000000000',
    'a4800000-0000-4000-8000-000000000004',
    '5eed0000-0000-4000-8000-000000000004',
    'rapp48-entity-latest',
    '2026-08-11 11:15:00+00'
  );
alter table public.messages enable trigger messages_enqueue_push;

insert into public.conversation_read_states (
  org_id, conversation_id, user_id, last_read_message_id, read_at
)
values (
  '5eed0000-0000-4000-8000-000000000000',
  'a4800000-0000-4000-8000-000000000002',
  '5eed0000-0000-4000-8000-000000000002',
  'a4800000-0000-4000-8001-000000000002',
  '2026-08-11 11:06:00+00'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::integer from public.list_staff_conversations(false, false, 'all', '')),
  4,
  'staff can list every conversation in their organization'
);
select is(
  (select participant_role from public.list_staff_conversations(false, false, 'all', '') limit 1),
  'entity',
  'unread conversations are ordered first and then by latest activity'
);
select is(
  (select count(*)::integer from public.list_staff_conversations(true, false, 'all', '')),
  3,
  'unread filter excludes a conversation already read by this staff member'
);
select is(
  (select count(*)::integer from public.list_staff_conversations(false, false, 'player', '')),
  3,
  'player filter excludes entity conversations'
);
select is(
  (select count(*)::integer from public.list_staff_conversations(false, false, 'entity', '')),
  1,
  'entity filter excludes player conversations'
);
select is(
  (select participant_first_name from public.list_staff_conversations(false, false, 'all', 'أمي')),
  'أمينة',
  'Arabic names match from a half-typed prefix'
);
select is(
  (select participant_first_name from public.list_staff_conversations(false, false, 'all', 'Окса')),
  'Оксана',
  'Cyrillic names match from a half-typed prefix'
);
select is(
  (select participant_first_name from public.list_staff_conversations(false, false, 'all', 'Maria')),
  'María Fernanda',
  'an unaccented query matches an accented participant name'
);
select is(
  (select participant_first_name from public.list_staff_conversations(false, false, 'all', 'María')),
  'María Fernanda',
  'an accented query matches the name as written'
);
select is(
  (select count(*)::integer from public.list_staff_conversations(false, false, 'all', 'Silv')),
  1,
  'name search does not match another participant through unrelated reference contact text'
);
select lives_ok(
  $$ select * from public.list_staff_conversations(false, false, 'all', 'x'') | (1=1--') $$,
  'hostile search text is data, not query syntax'
);
select is(
  (select count(*)::integer from public.list_staff_conversations(false, false, 'all', 'nobody-here')),
  0,
  'a search with no match returns an honest empty result'
);

select lives_ok(
  $$ select public.set_conversation_assignment(
    'a4800000-0000-4000-8000-000000000001',
    '5eed0000-0000-4000-8000-000000000002'
  ) $$,
  'staff can assign a conversation to themselves'
);
select is(
  (select count(*)::integer from public.list_staff_conversations(false, true, 'all', '')),
  1,
  'assigned-to-me filter surfaces the newly assigned conversation'
);
select is(
  (select count(*)::integer from public.conversation_assignment_history),
  1,
  'the assignment creates one durable history row'
);
select is(
  (select changed_by from public.conversation_assignment_history limit 1),
  '5eed0000-0000-4000-8000-000000000002'::uuid,
  'the history records who assigned the conversation'
);
select is(
  (select assigned_staff_id from public.conversation_assignment_history limit 1),
  '5eed0000-0000-4000-8000-000000000002'::uuid,
  'the history records the assigned staff member'
);
select lives_ok(
  $$ select public.set_conversation_assignment(
    'a4800000-0000-4000-8000-000000000001',
    '5eed0000-0000-4000-8000-000000000002'
  ) $$,
  'repeating the current assignment is idempotent'
);
select is(
  (select count(*)::integer from public.conversation_assignment_history),
  1,
  'an idempotent assignment does not invent history'
);
select lives_ok(
  $$ select public.set_conversation_assignment(
    'a4800000-0000-4000-8000-000000000001', null
  ) $$,
  'staff can unassign a conversation'
);
select is(
  (select count(*)::integer from public.conversation_assignment_history),
  2,
  'unassigning appends rather than overwrites assignment history'
);
select is(
  (select previous_staff_id from public.conversation_assignment_history order by created_at desc, id desc limit 1),
  '5eed0000-0000-4000-8000-000000000002'::uuid,
  'the unassignment keeps the previous owner'
);
select is(
  (select assigned_staff_id from public.conversation_assignment_history order by created_at desc, id desc limit 1),
  null::uuid,
  'the unassignment records an empty new owner'
);

select lives_ok(
  $$ select public.mark_conversation_read(
    'a4800000-0000-4000-8000-000000000001',
    'a4800000-0000-4000-8001-000000000001'
  ) $$,
  'staff reading a thread advances their own read cursor'
);
select is(
  (select unread_count from public.list_staff_conversations(false, false, 'all', '')
   where conversation_id = 'a4800000-0000-4000-8000-000000000001'),
  0::bigint,
  'the staff list clears unread state after the read transition'
);
select is(
  (select kind from public.participant_activity('5eed0000-0000-4000-8000-000000000011')
   where id = 'a4800000-0000-4000-8001-000000000001'),
  'message',
  'conversation messages appear in the participant timeline'
);

set local request.jwt.claims =
  '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated"}';
select throws_ok(
  $$ select public.set_conversation_assignment(
    'a4800000-0000-4000-8000-000000000001',
    '5eed0000-0000-4000-8000-000000000002'
  ) $$,
  '42501', null::text,
  'DENIAL: a player cannot assign a conversation'
);
select throws_ok(
  $$ select * from public.list_staff_conversations(false, false, 'all', '') $$,
  '42501', null::text,
  'DENIAL: a player cannot call the staff conversation list'
);
select is(
  (select count(*)::integer from public.conversation_assignment_history),
  0,
  'DENIAL: a player cannot read assignment history'
);

set local request.jwt.claims =
  '{"sub":"5eed0000-0000-4000-8000-000000000004","role":"authenticated"}';
select throws_ok(
  $$ select public.set_conversation_assignment(
    'a4800000-0000-4000-8000-000000000004',
    '5eed0000-0000-4000-8000-000000000002'
  ) $$,
  '42501', null::text,
  'DENIAL: an entity user cannot assign a conversation'
);

select * from finish();
rollback;
