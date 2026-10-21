-- Delete a test player and start again (RAPP-617).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Only test_players.manage or rgpd.erase deletes a test player, and the
--      database refuses a real player whatever the caller holds.
--   2. The files go first: without the media Worker's fresh receipt nothing
--      is deleted.
--   3. Everything of hers is gone (account, profile, answers, intake states,
--      invitation), so the same address is invited again at once.
--   4. The deletion is audited.
--
-- Seed: the design account ...097 (Onboarding design preset), the test player
-- ...096 (invited, with an open invitation), the real player ...011, the
-- admin ...001.

begin;
select plan(17);

-- Some of her onboarding, as a test player has after a run.
insert into public.profile_answers (profile_id, org_id, question, source)
values ('5eed0000-0000-4000-8000-000000000096', '5eed0000-0000-4000-8000-000000000000', 'clothing_size', 'staff');
insert into public.intake_question_states (profile_id, org_id, question, state)
values ('5eed0000-0000-4000-8000-000000000096', '5eed0000-0000-4000-8000-000000000000', 'phone', 'skip');

-- 1. Who may delete whom ----------------------------------------------------------------------------

select ok(
  has_function_privilege('authenticated', 'public.delete_test_player(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.delete_test_player(uuid)', 'EXECUTE'),
  'a signed-in person may ask, an anonymous one may not'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2"}';
select is(
  public.is_deletable_test_player('5eed0000-0000-4000-8000-000000000096'), true,
  'the design role may delete the test player'
);
select is(
  public.is_deletable_test_player('5eed0000-0000-4000-8000-000000000011'), false,
  'and not a real player'
);
select throws_ok(
  $$ select public.delete_test_player('5eed0000-0000-4000-8000-000000000011') $$,
  '42501', null::text, 'the design role cannot delete a real player'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.delete_test_player('5eed0000-0000-4000-8000-000000000011') $$,
  '42501', null::text, 'nor can an admin who holds every permission: a real player has the RGPD path'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select is(
  public.is_deletable_test_player('5eed0000-0000-4000-8000-000000000096'), false,
  'a player may not delete anyone'
);
select throws_ok(
  $$ select public.delete_test_player('5eed0000-0000-4000-8000-000000000096') $$,
  '42501', null::text, 'and is refused'
);

-- 2. The files first ---------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.delete_test_player('5eed0000-0000-4000-8000-000000000096') $$,
  'P0001', null::text, 'without the media receipt nothing is deleted'
);

-- The receipt the media Worker writes in the caller's name.
insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-000000000097',
        'profile.media_purged', 'profile', '5eed0000-0000-4000-8000-000000000096',
        '{"objects_deleted": 0}'::jsonb);

-- 3. Everything of hers --------------------------------------------------------------------------------

select lives_ok(
  $$ select public.delete_test_player('5eed0000-0000-4000-8000-000000000096') $$,
  'with the receipt, the design role deletes the test player'
);

reset role;
select is(
  (select count(*)::int from auth.users where id = '5eed0000-0000-4000-8000-000000000096'),
  0, 'her account is gone'
);
select is(
  (select count(*)::int from public.profiles where id = '5eed0000-0000-4000-8000-000000000096'),
  0, 'her profile is gone'
);
select is(
  (select count(*)::int from public.profile_answers where profile_id = '5eed0000-0000-4000-8000-000000000096')
  + (select count(*)::int from public.intake_question_states where profile_id = '5eed0000-0000-4000-8000-000000000096'),
  0, 'her answers and intake states are gone'
);
select is(
  (select count(*)::int from public.invites where email = 'jugadora.prova@example.test'),
  0, 'her invitation is gone'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ select * from public.create_participant_invite(
       '{"email":"jugadora.prova@example.test","first_name":"Joana","last_name":"Prova","is_test_account":true}'::jsonb) $$,
  'the same address is invited again at once'
);

reset role;
select ok(
  (select p.is_test_account from public.profiles p join auth.users u on u.id = p.id
    where u.email = 'jugadora.prova@example.test'),
  'and she is a test player again'
);

-- 4. Audit ---------------------------------------------------------------------------------------------------

select ok(
  exists (select 1 from public.audit_log
           where action = 'profile.delete_test_player'
             and actor_id = '5eed0000-0000-4000-8000-000000000097'
             and target_id = '5eed0000-0000-4000-8000-000000000096'),
  'the deletion is audited'
);
select is(
  (select count(*)::int from public.profiles where id = '5eed0000-0000-4000-8000-000000000011'),
  1, 'the real player is untouched'
);

select * from finish();
rollback;
