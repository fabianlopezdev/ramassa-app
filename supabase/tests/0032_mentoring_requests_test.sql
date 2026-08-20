-- Mentoring requests, scheduling, private calendar visibility, and topic privacy (RAPP-57).
begin;
select plan(23);

select has_table('public', 'mentoring_requests', 'mentoring requests exist');
select hasnt_column(
  'public', 'mentoring_notification_events', 'topic',
  'notification storage has no mentoring topic column'
);
select hasnt_column(
  'public', 'mentoring_notification_events', 'staff_notes',
  'notification storage has no staff note column'
);

select is(
  (select disposition || ':' || participant_column
   from public.personal_data_disposition()
   where table_name = 'mentoring_requests'),
  'purge:player_id',
  'mentoring requests are registered for participant erasure'
);

select is(
  (select disposition || ':' || participant_column
   from public.personal_data_disposition()
   where table_name = 'mentoring_notification_events'),
  'purge:recipient_id',
  'mentoring notification events are registered for participant erasure'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000012","role":"authenticated"}';

select lives_ok(
  $$ select public.create_mentoring_request(
    'gender_violence',
    'Necessito parlar amb algú amb calma.',
    current_date + 7,
    '10:30'::time
  ) $$,
  'a player can create a private mentoring request'
);

select throws_ok(
  $$ insert into public.mentoring_requests (org_id, player_id, topic)
     values (
       '5eed0000-0000-4000-8000-000000000001',
       '5eed0000-0000-4000-8000-000000000012',
       'other'
     ) $$,
  '42501',
  null,
  'DENIAL: players cannot bypass the validated request RPC with a direct insert'
);

select is(
  (select count(*) from public.list_own_mentoring_requests())::integer,
  1,
  'the player can list her own request'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000013","role":"authenticated"}';
select is(
  (select count(*) from public.mentoring_requests)::integer,
  0,
  'DENIAL: another player cannot see the request'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000004","role":"authenticated"}';
select is(
  (select count(*) from public.mentoring_requests)::integer,
  0,
  'DENIAL: an entity user cannot see any mentoring request'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select count(*) from public.mentoring_requests)::integer,
  2,
  'staff can see the organization request queue'
);

select lives_ok(
  $$ select public.schedule_mentoring_request(
    (select id from public.mentoring_requests where player_id = '5eed0000-0000-4000-8000-000000000012'),
    now() + interval '8 days',
    '5eed0000-0000-4000-8000-000000000003',
    'Preparar una sala tranquil·la.'
  ) $$,
  'staff can schedule and assign the request'
);

select is(
  (select status || '|' || assigned_staff_id::text
   from public.mentoring_requests
   where player_id = '5eed0000-0000-4000-8000-000000000012'),
  'scheduled|5eed0000-0000-4000-8000-000000000003',
  'scheduling performs the requested to scheduled transition'
);

reset role;
select is(
  (select content_type || '|' || recipient_id::text
   from public.push_publications
   where content_type = 'mentoring_update'),
  'mentoring_update|5eed0000-0000-4000-8000-000000000012',
  'the schedule notification targets only the requesting player'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';

select lives_ok(
  $$ select public.schedule_mentoring_request(
    (select id from public.mentoring_requests where player_id = '5eed0000-0000-4000-8000-000000000012'),
    now() + interval '9 days',
    '5eed0000-0000-4000-8000-000000000003',
    'Confirmar una sala tranquil·la.'
  ) $$,
  'staff can change a scheduled appointment'
);

reset role;
select is(
  (select count(*)::integer
   from public.mentoring_notification_events as notification
   join public.mentoring_requests as request on request.id = notification.request_id
   where request.player_id = '5eed0000-0000-4000-8000-000000000012'
     and notification.kind = 'changed'),
  1,
  'a schedule change creates a technical changed event'
);
select is(
  (select count(*) from public.push_publications where content_type = 'mentoring_update')::integer,
  2,
  'each schedule or change creates one targeted push publication'
);

update public.profiles
set push_notifications_enabled = false
where id = '5eed0000-0000-4000-8000-000000000012';

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok(
  $$ select public.schedule_mentoring_request(
    (select id from public.mentoring_requests where player_id = '5eed0000-0000-4000-8000-000000000012'),
    now() + interval '10 days',
    '5eed0000-0000-4000-8000-000000000003',
    'Confirmar una sala tranquil·la.'
  ) $$,
  'schedule changes still succeed after the player opts out of push'
);

reset role;
select is(
  (select count(*)
   from public.push_deliveries as delivery
   join public.push_publications as publication on publication.id = delivery.publication_id
   where publication.content_type = 'mentoring_update')::integer,
  2,
  'push opt-out prevents a new mentoring delivery while preserving the schedule change'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select count(*) from public.list_staff_mentoring_requests())::integer,
  2,
  'the staff queue returns the organization request'
);

select is(
  (select topic_detail || '|' || staff_notes
   from public.list_staff_mentoring_requests()
   where player_id = '5eed0000-0000-4000-8000-000000000012'),
  'Necessito parlar amb algú amb calma.|Confirmar una sala tranquil·la.',
  'authorized staff receive decrypted request and scheduling notes'
);

select lives_ok(
  $$ select public.complete_mentoring_request(
    (select id from public.mentoring_requests where player_id = '5eed0000-0000-4000-8000-000000000012')
  ) $$,
  'staff can mark a scheduled request completed'
);

select is(
  (select status || '|' || (completed_at is not null)::text
   from public.mentoring_requests
   where player_id = '5eed0000-0000-4000-8000-000000000012'),
  'completed|true',
  'completion records the terminal state and timestamp'
);

select * from finish();
rollback;
