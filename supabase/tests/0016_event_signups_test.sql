begin;
select plan(27);

-- The local seed deliberately includes signup fixtures. This file owns the
-- state machine it exercises, so start with a clean ledger and let the delete
-- trigger put every event count back at zero.
delete from public.event_signups;

select has_table('public', 'event_signups', 'the event signup state machine exists');
select columns_are(
  'public',
  'event_signups',
  array['id', 'org_id', 'event_id', 'player_id', 'state', 'created_at', 'updated_at'],
  'one signup row records one player state for one event series'
);
select has_column(
  'public',
  'events',
  'active_signup_count',
  'events expose a trigger-maintained active signup count'
);

update public.events
set max_participants = 1
where id = '5eed0000-0000-4000-8003-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.event_signups (event_id, player_id, state)
     values (
       '5eed0000-0000-4000-8003-000000000001',
       '5eed0000-0000-4000-8000-000000000011',
       'confirmed'
     ) $$,
  'the first player claims the last place'
);

select is(
  (select active_signup_count from public.events
   where id = '5eed0000-0000-4000-8003-000000000001'),
  1,
  'an active signup increments the event count'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.event_signups (event_id, player_id, state)
     values (
       '5eed0000-0000-4000-8003-000000000001',
       '5eed0000-0000-4000-8000-000000000012',
       'confirmed'
     ) $$,
  'P0001',
  'EVENTS/CAPACITY_FULL',
  'the server rejects a signup after capacity is reached'
);

select is(
  (select active_signup_count from public.events
   where id = '5eed0000-0000-4000-8003-000000000001'),
  1,
  'a rejected signup leaves the count unchanged'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';

select lives_ok(
  $$ update public.event_signups
     set state = 'cancelled'
     where event_id = '5eed0000-0000-4000-8003-000000000001'
       and player_id = '5eed0000-0000-4000-8000-000000000011' $$,
  'the player can cancel her signup'
);

select is(
  (select active_signup_count from public.events
   where id = '5eed0000-0000-4000-8003-000000000001'),
  0,
  'cancelling releases the place'
);

select lives_ok(
  $$ insert into public.event_signups (event_id, player_id, state)
     values (
       '5eed0000-0000-4000-8003-000000000001',
       '5eed0000-0000-4000-8000-000000000011',
       'confirmed'
     )
     on conflict (event_id, player_id) do update set state = excluded.state $$,
  'the direct Supabase upsert path reactivates a cancelled signup'
);

select is(
  (select active_signup_count from public.events
   where id = '5eed0000-0000-4000-8003-000000000001'),
  1,
  'reactivating through upsert consumes one place, not two'
);

select lives_ok(
  $$ insert into public.event_signups (event_id, player_id, state)
     values (
       '5eed0000-0000-4000-8003-000000000001',
       '5eed0000-0000-4000-8000-000000000011',
       'cancelled'
     )
     on conflict (event_id, player_id) do update set state = excluded.state $$,
  'the same upsert path cancels an active signup'
);

select is(
  (select active_signup_count from public.events
   where id = '5eed0000-0000-4000-8003-000000000001'),
  0,
  'cancelling through upsert releases the place exactly once'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.event_signups (event_id, player_id, state)
     values (
       '5eed0000-0000-4000-8003-000000000001',
       '5eed0000-0000-4000-8000-000000000012',
       'confirmed'
     ) $$,
  'another player can claim the released place'
);

reset role;

select ok(
  (select relrowsecurity from pg_class where oid = 'public.event_signups'::regclass),
  'event signup RLS is enabled'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';

select is(
  (select count(*) from public.event_signups)::int,
  1,
  'a player reads only her own signup state'
);

select throws_ok(
  $$ update public.event_signups
     set event_id = '5eed0000-0000-4000-8003-000000000002', state = 'interested'
     where player_id = '5eed0000-0000-4000-8000-000000000011' $$,
  '42501',
  'EVENTS/IDENTITY_IMMUTABLE',
  'upsert-compatible grants do not let a player move signup identity columns'
);

select throws_ok(
  $$ insert into public.event_signups (event_id, player_id, state)
     values (
       '5eed0000-0000-4000-8003-000000000002',
       '5eed0000-0000-4000-8000-000000000013',
       'interested'
     ) $$,
  '42501',
  'new row violates row-level security policy for table "event_signups"',
  'a player cannot create a signup for another player'
);

select is_empty(
  $$ update public.event_signups
     set state = 'cancelled'
     where player_id = '5eed0000-0000-4000-8000-000000000012'
     returning id $$,
  'a player cannot update another player signup'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated"}';

select is(
  (select count(*) from public.event_signups)::int,
  2,
  'staff can read every signup in their organization'
);

select throws_ok(
  $$ insert into public.event_signups (event_id, player_id, state)
     values (
       '5eed0000-0000-4000-8003-000000000002',
       '5eed0000-0000-4000-8000-000000000013',
       'interested'
     ) $$,
  '42501',
  'new row violates row-level security policy for table "event_signups"',
  'staff cannot impersonate a player signup'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated"}';

select is(
  (select count(*) from public.event_signups)::int,
  0,
  'entity contacts cannot read player signups'
);

reset role;

select is(
  (select disposition from public.personal_data_disposition()
   where table_name = 'event_signups' and participant_column = 'player_id'),
  'purge',
  'event signups are purged with the participant'
);

insert into public.event_signups (event_id, player_id, state)
values (
  '5eed0000-0000-4000-8003-000000000002',
  '5eed0000-0000-4000-8000-000000000013',
  'interested'
);

select is(
  (select count(*) from public.event_signups
   where player_id = '5eed0000-0000-4000-8000-000000000013')::int,
  1,
  'the participant has event activity before erasure'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated"}';

insert into public.audit_log (org_id, actor_id, action, target_type, target_id)
values (
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8000-000000000001',
  'profile.media_purged',
  'profile',
  '5eed0000-0000-4000-8000-000000000013'
);

select lives_ok(
  $$ select public.delete_participant_permanently('5eed0000-0000-4000-8000-000000000013') $$,
  'the real erasure workflow accepts the signup table'
);

reset role;

select is(
  (select count(*) from public.event_signups
   where player_id = '5eed0000-0000-4000-8000-000000000013')::int,
  0,
  'erasure removes the participant signup activity'
);

select is(
  (select active_signup_count from public.events
   where id = '5eed0000-0000-4000-8003-000000000002'),
  0,
  'erasure releases the participant place'
);

select * from finish();
rollback;
