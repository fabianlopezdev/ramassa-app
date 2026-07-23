-- RLS tests for migration 0002 (push_tokens).
-- Run with: bunx supabase test db  (pgTAP, executed against the local stack).
--
-- The heart of RAPP-17: a push token is a delivery channel, so the assertions
-- that matter are the WRITE denials. If another user can insert or update your
-- token row, they can redirect your notifications; if a staff member can, the
-- channel is no longer owned by the device that holds it. Staff may READ within
-- their org (a later phase targets sends off these rows) and nothing more.
--
-- NOTE on how denials are asserted here. Postgres raises 42501 only when a
-- WITH CHECK fails on a row the caller could otherwise write (our INSERT case).
-- An UPDATE whose USING clause matches no row simply affects ZERO rows and
-- raises nothing. So the update denials are proved by reading the value back as
-- the superuser and showing it is unchanged, which is the property we actually
-- care about; expecting a throw there would be testing the wrong mechanism.
--
-- Self-contained: seeds its own tenants/users, runs in a transaction, rolls back.

begin;
select plan(13);

-- Setup (runs as the superuser test role, which bypasses RLS) -------------------

insert into public.organizations (id, name, slug) values
  ('00000000-0000-0000-0000-00000000a001', 'Org A', 'org-a'),
  ('00000000-0000-0000-0000-00000000b001', 'Org B', 'org-b');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'playerA1@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'playerA2@test.local'),
  ('00000000-0000-0000-0000-0000000000a3', 'staffA@test.local'),
  ('00000000-0000-0000-0000-0000000000b3', 'staffB@test.local');

insert into public.profiles (id, org_id, role, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000a001', 'player', 'Amina', 'One'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000a001', 'player', 'Bea', 'Two'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000a001', 'staff', 'Carla', 'Staff'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-00000000b001', 'staff', 'Diana', 'OtherOrgStaff');

insert into public.push_tokens (user_id, token, platform, device_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'ExponentPushToken[aaaa1111]', 'android', 'device-a1'),
  ('00000000-0000-0000-0000-0000000000a2', 'ExponentPushToken[bbbb2222]', 'ios', 'device-a2');

-- Schema guarantees: dedupe per device ------------------------------------------

select is(
  (select count(*) from public.push_tokens)::int, 2,
  'setup: two tokens exist before RLS is applied'
);

-- The same device re-registering a ROTATED token must update its existing row,
-- not add a second, undeliverable one that a later send would still try to push.
insert into public.push_tokens (user_id, token, platform, device_id)
values ('00000000-0000-0000-0000-0000000000a1', 'ExponentPushToken[rotated9]', 'android', 'device-a1')
on conflict (user_id, device_id) do update set token = excluded.token;

select is(
  (select count(*) from public.push_tokens where user_id = '00000000-0000-0000-0000-0000000000a1')::int, 1,
  'a rotated token UPDATES the device row instead of adding a stale duplicate'
);

select is(
  (select token from public.push_tokens where device_id = 'device-a1'), 'ExponentPushToken[rotated9]',
  'the device row now holds the rotated token'
);

select isnt(
  (select updated_at from public.push_tokens where device_id = 'device-a1'), null,
  'updated_at is maintained so token freshness is observable'
);

-- Player A1 ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is(
  (select count(*) from public.push_tokens)::int, 1,
  'a player sees exactly one token row (their own)'
);

select is_empty(
  $$ select 1 from public.push_tokens where user_id = '00000000-0000-0000-0000-0000000000a2' $$,
  'DENIAL: a player cannot read another player''s push token'
);

-- Hijacking someone else's delivery channel by INSERT: the WITH CHECK fails on a
-- row the caller is otherwise allowed to write, so this one really does raise.
select throws_ok(
  $$ insert into public.push_tokens (user_id, token, platform, device_id)
     values ('00000000-0000-0000-0000-0000000000a2', 'ExponentPushToken[evil]', 'android', 'device-evil') $$,
  '42501',
  null,
  'DENIAL: a player cannot INSERT a token owned by another user'
);

-- ...and by UPDATE (affects zero rows; proved by the value below).
update public.push_tokens
  set token = 'ExponentPushToken[hijacked]'
  where user_id = '00000000-0000-0000-0000-0000000000a2';

reset role;
select is(
  (select token from public.push_tokens where user_id = '00000000-0000-0000-0000-0000000000a2'),
  'ExponentPushToken[bbbb2222]',
  'DENIAL: a player''s UPDATE of another user''s token changes nothing'
);

-- A user may withdraw their own token (sign-out removal).
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
delete from public.push_tokens where user_id = '00000000-0000-0000-0000-0000000000a1';

reset role;
select is(
  (select count(*) from public.push_tokens where user_id = '00000000-0000-0000-0000-0000000000a1')::int, 0,
  'a user CAN delete their own token (sign-out removal)'
);

-- Restore A1's token for the staff assertions.
insert into public.push_tokens (user_id, token, platform, device_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'ExponentPushToken[aaaa1111]', 'android', 'device-a1');

-- Staff A -----------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';

select is(
  (select count(*) from public.push_tokens)::int, 2,
  'staff read every token in their own org (2)'
);

-- Staff read to target sends; they never write. A staff-writable token would move
-- ownership of the channel off the device that holds it.
update public.push_tokens
  set token = 'ExponentPushToken[staffwrote]'
  where user_id = '00000000-0000-0000-0000-0000000000a1';

reset role;
select is(
  (select token from public.push_tokens where user_id = '00000000-0000-0000-0000-0000000000a1'),
  'ExponentPushToken[aaaa1111]',
  'DENIAL: a staff UPDATE of a user''s token in their own org changes nothing'
);

-- Staff B (other org) -----------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}';

select is(
  (select count(*) from public.push_tokens)::int, 0,
  'DENIAL: staff cannot read tokens from another org (cross-org isolation)'
);

-- Anonymous ---------------------------------------------------------------------
reset role;
set local role anon;
set local request.jwt.claims to '';

select is(
  (select count(*) from public.push_tokens)::int, 0,
  'DENIAL: anon reads zero push tokens'
);

reset role;
select * from finish();
rollback;
