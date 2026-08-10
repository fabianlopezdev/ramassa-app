-- Player service browsing, idempotent interest state, staff evidence, and timeline.
-- Runs with: bunx supabase test db supabase/tests/0023_player_services_test.sql

begin;
select plan(26);

select has_table('public', 'service_submission_notifications', 'the staff service notification queue exists');
select has_column(
  'public', 'service_submission_notifications', 'service_interest_id',
  'staff notifications can identify the interest that created them'
);
select has_function(
  'public', 'set_service_interest', array['uuid', 'boolean'],
  'players have an idempotent desired-state interest RPC'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.service_submission_notifications'::regclass),
  'staff notification RLS is enabled'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.service_submission_notifications'::regclass),
  'staff notification RLS is forced'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated"}';

select is(
  (select id from public.services
    where category_id = '5eed0000-0000-4000-8009-000000000001'
      and zone = 'Osona'
      and cost_type = 'subsidized'
      and availability = 'available'
      and metadata @> '{"housing_type":"shared_flat","duration":"long_term"}'::jsonb),
  '5eed0000-0000-4000-800a-000000000003'::uuid,
  'the combined category, relational, and JSONB player filters find the intended service'
);
select is(
  public.set_service_interest('5eed0000-0000-4000-800a-000000000003', true),
  true,
  'a player can set her desired interest state to true'
);
select is(
  (select count(*) from public.service_interests
   where service_id = '5eed0000-0000-4000-800a-000000000003')::integer,
  1,
  'the player reads the interest she created'
);
select is(
  (select count(*) from public.service_interests
   where user_id <> '5eed0000-0000-4000-8000-000000000011')::integer,
  0,
  'the player cannot read another participant interest'
);
select lives_ok(
  $$ delete from public.service_interests
     where user_id = '5eed0000-0000-4000-8000-000000000012' $$,
  'an attempted delete of another participant interest reveals no row'
);
select is(
  public.set_service_interest('5eed0000-0000-4000-800a-000000000003', true),
  true,
  'repeating the true desired state succeeds'
);
select is(
  (select count(*) from public.service_interests
   where service_id = '5eed0000-0000-4000-800a-000000000003')::integer,
  1,
  'repeating true does not duplicate the interest'
);
select is(
  (select count(*) from public.service_submission_notifications
   where kind = 'service_interest')::integer,
  0,
  'a player cannot read staff notifications'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select count(*) from public.service_submission_notifications
   where kind = 'service_interest'
     and service_id = '5eed0000-0000-4000-800a-000000000003'
     and created_by = '5eed0000-0000-4000-8000-000000000011')::integer,
  1,
  'the first true transition creates one staff notification'
);
select is(
  (select count(*) from public.service_interests
   where service_id = '5eed0000-0000-4000-800a-000000000003')::integer,
  1,
  'staff reads the exact participant interest count'
);
select is(
  (select count(*) from public.service_interests
   where id = '5eed0000-0000-4000-800c-000000000001')::integer,
  1,
  'the player could not delete another participant interest'
);
select is(
  (select kind from public.participant_activity('5eed0000-0000-4000-8000-000000000011')
   where kind = 'service_interest' limit 1),
  'service_interest',
  'the participant timeline contains the service interest kind'
);
select is(
  (select title from public.participant_activity('5eed0000-0000-4000-8000-000000000011')
   where kind = 'service_interest' limit 1),
  'Habitació compartida per a dones',
  'the participant timeline names the service'
);
select is(
  (select detail from public.participant_activity('5eed0000-0000-4000-8000-000000000011')
   where kind = 'service_interest' limit 1),
  'Fundació Habitat3 · Allotjament',
  'the participant timeline gives staff the provider and category context'
);
select throws_ok(
  $$ select public.set_service_interest('5eed0000-0000-4000-800a-000000000003', false) $$,
  '42501',
  null::text,
  'staff cannot mutate a participant interest through the player RPC'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated"}';

select is(
  public.set_service_interest('5eed0000-0000-4000-800a-000000000003', false),
  false,
  'a player can set her desired interest state to false'
);
select is(
  (select count(*) from public.service_interests
   where service_id = '5eed0000-0000-4000-800a-000000000003')::integer,
  0,
  'the false state removes her interest'
);
select is(
  public.set_service_interest('5eed0000-0000-4000-800a-000000000003', false),
  false,
  'repeating the false desired state succeeds'
);
select is(
  (select count(*) from public.service_interests
   where service_id = '5eed0000-0000-4000-800a-000000000003')::integer,
  0,
  'repeating false leaves no duplicate or negative state'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select count(*) from public.service_submission_notifications
   where kind = 'service_interest'
     and service_id = '5eed0000-0000-4000-800a-000000000003'
     and created_by = '5eed0000-0000-4000-8000-000000000011')::integer,
  1,
  'the staff notification remains as evidence after the player removes interest'
);
select is_empty(
  $$ select id from public.participant_activity('5eed0000-0000-4000-8000-000000000011')
     where kind = 'service_interest' $$,
  'the participant timeline reflects current interest after removal'
);

select * from finish();
rollback;
