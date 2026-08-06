-- Push outbox, scheduling, opt-out, idempotency, and pruning tests.
-- The Edge Function's HTTP batching and Expo response parsing are covered by
-- supabase/functions/_shared/push.test.ts. These assertions cover the database
-- state machine that makes retries and concurrent invocations safe.

begin;
select plan(28);

select has_column(
  'public',
  'profiles',
  'push_notifications_enabled',
  'profiles carry the simple push opt-out preference'
);

select col_default_is(
  'public',
  'profiles',
  'push_notifications_enabled',
  'true',
  'push is enabled by default until the player opts out'
);

select has_table('public', 'push_publications', 'the per-content push outbox exists');
select has_table('public', 'push_deliveries', 'per-device delivery state is durable');

select is(
  (select relrowsecurity from pg_class where oid = 'public.push_publications'::regclass),
  true,
  'push publication RLS is enabled'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.push_deliveries'::regclass),
  true,
  'push delivery RLS is enabled'
);

select is(
  (select count(*) from cron.job where jobname = 'ramassa-push-dispatch')::integer,
  1,
  'one minute scheduler is installed exactly once'
);

-- The repository seed intentionally publishes content. Keep this test's claim
-- counts scoped to the fixtures below while preserving its idempotency rows.
update public.push_publications set state = 'complete', completed_at = now();

insert into public.organizations (id, name, slug) values
  ('90000000-0000-4000-8000-000000000001', 'Push Test Org', 'push-test-org');

insert into auth.users (id, email) values
  ('90000000-0000-4000-8000-000000000011', 'push-one@test.local'),
  ('90000000-0000-4000-8000-000000000012', 'push-two@test.local'),
  ('90000000-0000-4000-8000-000000000013', 'push-three@test.local'),
  ('90000000-0000-4000-8000-000000000019', 'push-staff@test.local');

insert into public.profiles (
  id, org_id, role, first_name, last_name, preferred_language,
  push_notifications_enabled
) values
  ('90000000-0000-4000-8000-000000000011', '90000000-0000-4000-8000-000000000001', 'player', 'Amina', 'One', 'ar', true),
  ('90000000-0000-4000-8000-000000000012', '90000000-0000-4000-8000-000000000001', 'player', 'Bea', 'Two', 'es', false),
  ('90000000-0000-4000-8000-000000000013', '90000000-0000-4000-8000-000000000001', 'player', 'Cara', 'Three', 'unsupported', true),
  ('90000000-0000-4000-8000-000000000019', '90000000-0000-4000-8000-000000000001', 'staff', 'Dina', 'Staff', 'ca', true);

insert into public.push_tokens (id, user_id, token, platform, device_id) values
  ('91000000-0000-4000-8000-000000000011', '90000000-0000-4000-8000-000000000011', 'ExponentPushToken[push-one]', 'android', 'push-device-one'),
  ('91000000-0000-4000-8000-000000000012', '90000000-0000-4000-8000-000000000012', 'ExponentPushToken[push-two]', 'android', 'push-device-two'),
  ('91000000-0000-4000-8000-000000000013', '90000000-0000-4000-8000-000000000013', 'ExponentPushToken[push-three]', 'ios', 'push-device-three'),
  ('91000000-0000-4000-8000-000000000019', '90000000-0000-4000-8000-000000000019', 'ExponentPushToken[push-staff]', 'android', 'push-device-staff');

insert into public.announcements (
  id, org_id, category, title, body, status, published_at, created_by
) values (
  '92000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001',
  'urgent',
  '{"ca":"Avís","es":"Aviso","en":"Notice","ar":"إشعار","fa":"اطلاعیه"}',
  '{"ca":"Cos","es":"Cuerpo","en":"Body","ar":"النص","fa":"متن"}',
  'published',
  '2020-01-01 12:00:00+00',
  '90000000-0000-4000-8000-000000000019'
);

select is(
  (select count(*) from public.push_publications
    where content_type = 'announcement'
      and content_id = '92000000-0000-4000-8000-000000000001')::integer,
  1,
  'an immediate publication enters the outbox during the publish transaction'
);

update public.announcements
set is_pinned = true
where id = '92000000-0000-4000-8000-000000000001';

select is(
  (select count(*) from public.push_publications
    where content_type = 'announcement'
      and content_id = '92000000-0000-4000-8000-000000000001')::integer,
  1,
  'later edits cannot create a duplicate publication'
);

select is(
  public.enqueue_due_push_publications('2020-01-01 12:01:00+00'),
  0,
  'a second enqueue invocation adds zero rows for the same content item'
);

insert into public.event_categories (id, org_id, name, icon, color, sort_order)
values (
  '93000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001',
  '{"ca":"Curs","es":"Curso","en":"Course","ar":"دورة","fa":"دوره"}',
  'graduation-cap',
  'primary',
  10
);

insert into public.events (
  id, org_id, category_id, title, location, starts_at, status, published_at, created_by
) values (
  '94000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  '{"ca":"Curs nou","es":"Curso nuevo","en":"New course","ar":"دورة جديدة","fa":"دوره جدید"}',
  'Camp',
  '2026-08-10 16:00:00+00',
  'published',
  '2099-08-06 12:05:00+00',
  '90000000-0000-4000-8000-000000000019'
);

select is(
  (select count(*) from public.push_publications
    where content_type = 'event'
      and content_id = '94000000-0000-4000-8000-000000000001')::integer,
  0,
  'a future scheduled event is not enqueued early'
);

do $$ begin
  perform public.enqueue_due_push_publications('2099-08-06 12:04:59+00');
end $$;

select is(
  (select count(*) from public.push_publications
    where content_type = 'event'
      and content_id = '94000000-0000-4000-8000-000000000001')::integer,
  0,
  'the scheduled sweep does nothing before published_at'
);

do $$ begin
  perform public.enqueue_due_push_publications('2099-08-06 12:05:00+00');
end $$;

select is(
  (select count(*) from public.push_publications
    where content_type = 'event'
      and content_id = '94000000-0000-4000-8000-000000000001')::integer,
  1,
  'the scheduled sweep enqueues the event at published_at'
);

do $$ begin
  perform public.enqueue_due_push_publications('2099-08-06 12:06:00+00');
end $$;

select is(
  (select count(*) from public.push_publications
    where content_type = 'event'
      and content_id = '94000000-0000-4000-8000-000000000001')::integer,
  1,
  'the scheduled event is enqueued exactly once'
);

update public.push_publications
set state = 'complete', completed_at = now()
where org_id <> '90000000-0000-4000-8000-000000000001';

create temporary table first_claim as
select *
from public.claim_push_deliveries(
  '95000000-0000-4000-8000-000000000001',
  '2099-08-06 12:06:00+00',
  100
);

select is(
  (select count(*) from first_claim)::integer,
  4,
  'two publications create deliveries for two opted-in players each'
);

select is(
  (select count(*) from first_claim where recipient_id = '90000000-0000-4000-8000-000000000012')::integer,
  0,
  'the opted-out player is excluded from every publication'
);

select is(
  (select count(*) from first_claim where recipient_id = '90000000-0000-4000-8000-000000000019')::integer,
  0,
  'staff tokens are not part of player broadcasts'
);

select is(
  (select count(*) from first_claim where recipient_id = '90000000-0000-4000-8000-000000000011' and language = 'ar')::integer,
  2,
  'the supported player locale is retained for both deliveries'
);

select is(
  (select count(*) from first_claim where recipient_id = '90000000-0000-4000-8000-000000000013' and language = 'ca')::integer,
  2,
  'an unsupported profile locale falls back to Catalan'
);

select is(
  (select count(*) from public.claim_push_deliveries(
    '95000000-0000-4000-8000-000000000002',
    '2099-08-06 12:06:01+00',
    100
  ))::integer,
  0,
  'a concurrent or repeated invocation sends zero already claimed deliveries'
);

select is(
  public.record_push_delivery_results(
    '95000000-0000-4000-8000-000000000001',
    jsonb_build_array(
      jsonb_build_object(
        'delivery_id', (select delivery_id from first_claim order by delivery_id limit 1),
        'state', 'pruned',
        'error_code', 'DeviceNotRegistered'
      )
    ),
    '2099-08-06 12:06:02+00'
  ),
  1,
  'one DeviceNotRegistered result is recorded'
);

select is(
  (select count(*) from public.push_tokens
    where id = (
      select push_token_id
      from first_claim
      order by delivery_id
      limit 1
    ))::integer,
  0,
  'DeviceNotRegistered prunes the invalid token'
);

create temporary table ticketed_delivery as
select delivery_id
from first_claim
where push_token_id in (select id from public.push_tokens)
order by delivery_id
limit 1;

select is(
  public.record_push_delivery_results(
    '95000000-0000-4000-8000-000000000001',
    jsonb_build_array(
      jsonb_build_object(
        'delivery_id', (select delivery_id from ticketed_delivery),
        'state', 'ticketed',
        'ticket_id', 'test-ticket-1'
      )
    ),
    '2099-08-06 12:06:03+00'
  ),
  1,
  'an accepted Expo ticket schedules receipt processing'
);

create temporary table receipt_claim as
select *
from public.claim_push_receipts(
  '95000000-0000-4000-8000-000000000003',
  '2099-08-06 12:21:03+00',
  1000
);

select is(
  (select count(*) from receipt_claim)::integer,
  1,
  'a ticket becomes receipt-eligible after fifteen minutes'
);

select is(
  public.record_push_receipt_results(
    '95000000-0000-4000-8000-000000000003',
    jsonb_build_array(
      jsonb_build_object(
        'delivery_id', (select delivery_id from receipt_claim),
        'state', 'delivered'
      )
    ),
    '2099-08-06 12:21:04+00'
  ),
  1,
  'a successful Expo receipt is recorded'
);

select is(
  (select state from public.push_deliveries
    where id = (select delivery_id from ticketed_delivery)),
  'delivered',
  'receipt processing reaches the terminal delivered state'
);

select is(
  (select count(*) from public.personal_data_disposition()
    where table_name = 'push_deliveries'
      and participant_column = 'recipient_id'
      and disposition = 'purge')::integer,
  1,
  'delivery recipient rows are registered for RGPD erasure'
);

select is(
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('push_publications', 'push_deliveries')
      and grantee in ('anon', 'authenticated'))::integer,
  0,
  'clients have no direct grants on push pipeline tables'
);

select * from finish();
rollback;
