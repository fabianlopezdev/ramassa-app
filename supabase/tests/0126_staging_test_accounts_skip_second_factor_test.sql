-- On staging, test accounts skip the second factor (RAPP-628).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. The migration leaves no switch row, so production and every fresh
--      database keep the second factor for everyone.
--   2. Nobody reaches the switch from a client: no read, no write, and the
--      helper behind it is not callable either.
--   3. Switch absent (or off): a test account at aal1 is refused, as before.
--   4. Switch on: a test account at aal1 is let in, and only a test account:
--      a real team member at aal1 is still refused, an inactive test account
--      too. Real staff at aal2 are unaffected.
--
-- Seed: admin ...001 and staff ...002 (real team accounts), the design account
-- ...097 (a staff TEST account holding onboarding.design and
-- test_players.manage), the entity contact ...004 and the player ...011.

begin;
select plan(34);

-- 1. The switch exists and starts off -----------------------------------------------------------------

select has_table('private', 'staging_switches', 'the staging switches table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'private.staging_switches'::regclass),
  'row level security is on'
);
select is(
  (select count(*)::int from private.staging_switches),
  0, 'the migration inserts no switch row, so the second factor holds everywhere'
);
select throws_ok(
  $$ insert into private.staging_switches (name, enabled) values ('anything_else', true) $$,
  '23514', null::text, 'only the known switch names are accepted'
);

-- 2. No client reaches the switch -----------------------------------------------------------------

select ok(
  not has_table_privilege('authenticated', 'private.staging_switches', 'SELECT')
  and not has_table_privilege('anon', 'private.staging_switches', 'SELECT'),
  'neither anon nor authenticated can read the switches'
);
select ok(
  not has_table_privilege('authenticated', 'private.staging_switches', 'INSERT')
  and not has_table_privilege('authenticated', 'private.staging_switches', 'UPDATE')
  and not has_table_privilege('authenticated', 'private.staging_switches', 'DELETE')
  and not has_table_privilege('anon', 'private.staging_switches', 'INSERT')
  and not has_table_privilege('anon', 'private.staging_switches', 'UPDATE')
  and not has_table_privilege('anon', 'private.staging_switches', 'DELETE'),
  'nor write them'
);
select ok(
  not has_function_privilege('authenticated', 'private.second_factor_waived()', 'EXECUTE')
  and not has_function_privilege('anon', 'private.second_factor_waived()', 'EXECUTE'),
  'the private helper is not callable from a client'
);
select ok(
  not has_function_privilege('authenticated', 'private.session_is_aal2()', 'EXECUTE')
  and not has_function_privilege('anon', 'private.session_is_aal2()', 'EXECUTE'),
  'session_is_aal2 keeps its grants: not callable from a client'
);
select ok(
  has_function_privilege('authenticated', 'public.my_second_factor_waived()', 'EXECUTE'),
  'a signed-in client asks whether her own second factor is waived'
);
select ok(
  not has_function_privilege('anon', 'public.my_second_factor_waived()', 'EXECUTE'),
  'a signed-out visitor cannot ask'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$ select * from private.staging_switches $$,
  '42501', null::text, 'a direct read is refused'
);
select throws_ok(
  $$ insert into private.staging_switches (name, enabled) values ('test_accounts_skip_second_factor', true) $$,
  '42501', null::text, 'a test account cannot switch the waiver on herself'
);

-- 3. Switch absent: a test account at aal1 is refused ---------------------------------------------

select ok(not (select public.has_permission('onboarding.design')), 'switch absent: a test account at aal1 holds no permission');
select is((select count(*)::int from public.my_permissions()), 0, 'and lists none');
select is((select public.current_app_role()), null, 'and has no role for access rules');
select ok(not (select public.my_second_factor_waived()), 'and her second factor is not waived');

reset role;
insert into private.staging_switches (name, enabled) values ('test_accounts_skip_second_factor', false);
set local role authenticated;
select ok(not (select public.has_permission('onboarding.design')), 'switch off: still refused');
select ok(not (select public.my_second_factor_waived()), 'and not waived');

-- 4. Switch on --------------------------------------------------------------------------------------------

reset role;
update private.staging_switches set enabled = true, changed_at = now()
where name = 'test_accounts_skip_second_factor';
set local role authenticated;

select ok((select public.has_permission('onboarding.design')), 'switch on: the test account at aal1 holds her permissions');
select is((select count(*)::int from public.my_permissions()), 2, 'and lists both');
select ok((select public.is_team_member()), 'and is a team member');
select is((select public.current_app_role()), 'staff', 'and has her role');
select ok((select public.my_second_factor_waived()), 'and her second factor is waived');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal1"}';
select ok(not (select public.has_permission('participants.view')), 'switch on: a real staff member at aal1 is still refused');
select is((select public.current_app_role()), null, 'and has no role');
select ok(not (select public.my_second_factor_waived()), 'and her second factor is not waived');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal1"}';
select ok(not (select public.has_permission('team.manage')), 'switch on: a real admin at aal1 is still refused');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal1"}';
select is((select public.current_collaborating_entity_id()), null, 'switch on: a real entity contact at aal1 has no entity');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select ok((select public.has_permission('team.manage')), 'switch on: a real admin at aal2 is unaffected');
select ok(not (select public.my_second_factor_waived()), 'and nothing is waived for her');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select is((select public.current_app_role()), 'player', 'a player still signs in with the email code alone');

reset role;
update private.staging_switches set enabled = false where name = 'test_accounts_skip_second_factor';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select ok((select public.has_permission('team.manage')), 'switch off again: the real admin at aal2 is unaffected');

-- An inactive test account is never let in.
reset role;
update private.staging_switches set enabled = true where name = 'test_accounts_skip_second_factor';
update public.profiles set is_active = false where id = '5eed0000-0000-4000-8000-000000000097';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal1"}';
select ok(not (select public.my_second_factor_waived()), 'switch on: an inactive test account is not waived');
select ok(not (select public.has_permission('onboarding.design')), 'and holds no permission');

select * from finish();
rollback;
