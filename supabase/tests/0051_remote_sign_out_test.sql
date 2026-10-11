-- Remote sign-out (RAPP-234).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. After a remote sign-out, an access token issued before it reaches
--      nothing at once, while a token issued after it works.
--   2. Who may do it: herself always; team.manage for a team member;
--      entities.manage for an entity contact; nobody for a player but herself.
--   3. It ends the refreshable sessions, is audited, and the time cannot be
--      cleared with a direct write.

begin;
select plan(13);

-- An admin signs a staff member out everywhere.
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ select public.sign_out_everywhere('5eed0000-0000-4000-8000-000000000002') $$,
  'team.manage signs a team member out everywhere'
);

reset role;
select isnt(
  (select sessions_valid_after from public.profiles where id = '5eed0000-0000-4000-8000-000000000002'),
  null, 'her sessions-valid-after time is set'
);
select is(
  (select count(*)::int from auth.sessions where user_id = '5eed0000-0000-4000-8000-000000000002'),
  0, 'and her refreshable sessions are gone'
);
select is(
  (select count(*)::int from public.audit_log
    where action = 'sessions.sign_out_everywhere' and target_id = '5eed0000-0000-4000-8000-000000000002'),
  1, 'and it is audited'
);

-- A token issued an hour before: denied everywhere at once.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', '5eed0000-0000-4000-8000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
  'iat', extract(epoch from now() - interval '1 hour')::bigint)::text, true);
select ok(not (select public.has_permission('attendance.mark')), 'a token from before holds no permission');
select is((select public.current_app_role()), null, 'has no role');
select ok(not (select public.my_session_is_current()), 'and the app is told to sign out');
select is((select count(*)::int from public.attendance), 0, 'and reads no attendance');

-- A token issued after: works.
select set_config('request.jwt.claims', json_build_object(
  'sub', '5eed0000-0000-4000-8000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
  'iat', extract(epoch from now() + interval '1 minute')::bigint)::text, true);
select ok((select public.has_permission('attendance.mark')), 'a token issued after works again');

select throws_ok(
  $$ update public.profiles set sessions_valid_after = null where id = '5eed0000-0000-4000-8000-000000000002' $$,
  '42501', null::text, 'the time cannot be cleared with a direct write'
);

-- Who may.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.sign_out_everywhere('5eed0000-0000-4000-8000-000000000001') $$,
  '42501', null::text, 'staff without team.manage cannot sign out another team member'
);
select throws_ok(
  $$ select public.sign_out_everywhere('5eed0000-0000-4000-8000-000000000011') $$,
  '42501', null::text, 'nobody signs out a player but the player herself'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select lives_ok(
  $$ select public.sign_out_everywhere('5eed0000-0000-4000-8000-000000000011') $$,
  'a player signs herself out everywhere'
);

select * from finish();
rollback;
