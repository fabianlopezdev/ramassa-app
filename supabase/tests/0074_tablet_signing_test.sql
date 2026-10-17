-- Signing the authorization on a staff tablet (RAPP-305).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. consents.collect exists, and the Coach, Staff and Admin presets hold it.
--   2. A signing from the tablet's offline outbox is accepted once (the same id
--      again returns the saved record), with the coach as witness and method
--      staff_device, and her own app then treats the season as signed.
--   3. A walk-in creates no profile until a staff member confirms it with a
--      recent second factor; confirming creates her profile and attaches the
--      signing; merging into an existing player keeps one authorization.
--   4. Without consents.collect, nothing is accepted.
--
-- Seed: Наталія (...022) has not signed 2026/27; version 1 is current.

begin;
select plan(18);

create temp table run (label text primary key, id uuid);
grant all on run to authenticated;
insert into run (label, id) values
  ('signing', '0b5e0000-0000-4000-8000-000000000001'),
  ('walk_in', '0b5e0000-0000-4000-8000-000000000002'),
  ('walk_in_merge', '0b5e0000-0000-4000-8000-000000000003');

-- 1. The permission --------------------------------------------------------------------------------------

select is(
  (select array_agg(builtin_key order by builtin_key) from public.permission_preset_defaults
    where permission_code = 'consents.collect'),
  array['admin', 'coach', 'staff'], 'the Coach, Staff and Admin presets hold consents.collect'
);
select ok(
  exists (select 1 from public.team_member_permissions
           where profile_id = '5eed0000-0000-4000-8000-000000000002' and permission_code = 'consents.collect'),
  'a staff member on the Staff preset has it'
);

-- 2. A signing from the tablet ------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select lives_ok(
  $$ select public.record_staff_device_signature(
       (select id from run where label = 'signing'),
       '5eed0000-0000-4000-8000-000000000022',
       '5eed0000-0000-4000-8041-000000000001',
       jsonb_build_object(
         'consents', jsonb_build_object('participation', true, 'data_processing', true,
                                        'code_of_conduct', true, 'health_data', true),
         'health_info', 'Al·lèrgia a la penicil·lina.', 'unable_to_draw', true,
         'language', 'en', 'device', 'iPad'),
       now() - interval '2 hours') $$,
  'the tablet sends a signing made offline'
);
select is(
  public.record_staff_device_signature(
    (select id from run where label = 'signing'),
    '5eed0000-0000-4000-8000-000000000022',
    '5eed0000-0000-4000-8041-000000000001',
    '{}'::jsonb, now()),
  (select id from run where label = 'signing'),
  'the same signing sent again is accepted once, and returns the saved record'
);

reset role;
select is(
  (select method || '|' || witnessed_by::text || '|' || device
     from public.authorization_signatures where id = (select id from run where label = 'signing')),
  'staff_device|5eed0000-0000-4000-8000-000000000002|iPad',
  'the record names the coach as witness and the device'
);
select is(
  (select count(*)::integer from public.authorization_signatures
    where profile_id = '5eed0000-0000-4000-8000-000000000022'),
  1, 'one authorization for her, not two'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000022", "role": "authenticated", "aal": "aal1"}';
select is(
  (select required from public.my_authorization_status()), false,
  'her own app treats the season as signed'
);

-- 4. Without the permission ---------------------------------------------------------------------------------

reset role;
delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000003' and permission_code = 'consents.collect';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.record_staff_device_signature(gen_random_uuid(),
       '5eed0000-0000-4000-8000-000000000023', '5eed0000-0000-4000-8041-000000000001',
       '{}'::jsonb, now()) $$,
  '42501', null::text, 'without consents.collect the tablet signs nothing'
);
select throws_ok(
  $$ select public.submit_walk_in_signing(gen_random_uuid(), 'Rim', 'Haddad',
       '5eed0000-0000-4000-8041-000000000001', '{}'::jsonb, now()) $$,
  '42501', null::text, 'nor submits a walk-in'
);

-- 3. Walk-ins ---------------------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.submit_walk_in_signing((select id from run where label = 'walk_in'), 'Rim', 'Haddad',
       '5eed0000-0000-4000-8041-000000000001',
       jsonb_build_object(
         'consents', jsonb_build_object('participation', true, 'data_processing', true,
                                        'code_of_conduct', true, 'health_data', true, 'image_rights', true),
         'health_info', 'No', 'signature', '[[[10,20],[30,40]]]'::jsonb, 'language', 'ar', 'device', 'iPad'),
       now() - interval '1 hour') $$,
  'a walk-in signs on the tablet'
);
select is(
  public.submit_walk_in_signing((select id from run where label = 'walk_in'), 'Rim', 'Haddad',
    '5eed0000-0000-4000-8041-000000000001', '{}'::jsonb, now()),
  (select id from run where label = 'walk_in'),
  'the same walk-in sent again is accepted once'
);
reset role;
select is(
  (select count(*)::integer from public.profiles where first_name = 'Rim' and last_name = 'Haddad'),
  0, 'a walk-in is not a participant yet'
);
select ok(
  (select encode(payload, 'escape') not like '%penicil%' and status = 'pending'
     from public.walk_in_signings where id = (select id from run where label = 'walk_in')),
  'her signing waits encrypted for review'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 1000}]}';
select throws_ok(
  $$ select public.confirm_walk_in((select id from run where label = 'walk_in'), 'rim.haddad@example.test') $$,
  '42501', null::text, 'confirming needs a recent second factor'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into run (label, id)
select 'rim', public.confirm_walk_in((select id from run where label = 'walk_in'), 'rim.haddad@example.test');

reset role;
select is(
  (select p.role || '|' || s.method || '|' || s.witnessed_by::text
     from public.profiles p join public.authorization_signatures s on s.profile_id = p.id
    where p.id = (select id from run where label = 'rim')),
  'invited|staff_device|5eed0000-0000-4000-8000-000000000002',
  'confirming creates her profile with her signed authorization'
);
select ok(
  (select status = 'confirmed' and payload is null
     from public.walk_in_signings where id = (select id from run where label = 'walk_in')),
  'and the walk-in keeps no copy of her signing'
);

-- Merging a walk-in into a player who already exists.
set local role authenticated;
select public.submit_walk_in_signing((select id from run where label = 'walk_in_merge'), 'Iryna', 'Melnyk',
  '5eed0000-0000-4000-8041-000000000001',
  jsonb_build_object(
    'consents', jsonb_build_object('participation', true, 'data_processing', true,
                                   'code_of_conduct', true, 'health_data', true),
    'health_info', 'No', 'unable_to_draw', true, 'language', 'en'),
  now());
select lives_ok(
  $$ select public.merge_walk_in((select id from run where label = 'walk_in_merge'),
       '5eed0000-0000-4000-8000-000000000023') $$,
  'staff merge a walk-in into an existing player'
);
reset role;
select is(
  (select count(*)::integer from public.authorization_signatures
    where profile_id = '5eed0000-0000-4000-8000-000000000023' and method = 'staff_device'),
  1, 'and she has the signed authorization'
);

select * from finish();
rollback;
