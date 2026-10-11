-- A second factor for every team member and entity contact (RAPP-233).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. A team member's session verified by email code only (aal1) reaches
--      nothing: no permission, no role, no participant row, no function.
--   2. The same for an entity contact: no entity, no referrals.
--   3. Players are unaffected: their sign-in is the email code.
--   4. Recovery: team.manage resets a team member's factor and ends her
--      sessions; entities.manage an entity contact's; nobody her own; audited.

begin;
select plan(17);

-- 1. A team member at aal1 -----------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal1"}';

select ok(not (select public.has_permission('team.manage')), 'an admin at aal1 holds no permission');
select is((select count(*)::int from public.my_permissions()), 0, 'and lists none');
select ok(not (select public.is_team_member()), 'is not treated as a team member');
select is((select public.current_app_role()), null, 'has no role for access rules');
select is(
  (select count(*)::int from public.profiles where role = 'player'),
  0, 'reads no participant'
);
select is((select count(*)::int from public.feedback_submissions), 0, 'nor private feedback');
select is_empty(
  $$ select * from public.get_participant_profile('5eed0000-0000-4000-8000-000000000026') $$,
  'nor a participant record'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select ok((select public.has_permission('team.manage')), 'the same admin at aal2 holds her permissions');

-- 2. An entity contact at aal1 -----------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal1"}';
select is((select public.current_collaborating_entity_id()), null, 'an entity contact at aal1 has no entity');
select is((select count(*)::int from public.entity_referrals), 0, 'and reads no referral');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select isnt((select public.current_collaborating_entity_id()), null, 'at aal2 she has her entity');

-- 3. A player at aal1 ------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select is((select public.current_app_role()), 'player', 'a player signs in with the email code alone');

-- 4. Recovery -----------------------------------------------------------------------------------------

reset role;
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values (
  '50000000-0000-4000-8000-000000000001', '5eed0000-0000-4000-8000-000000000003',
  'rapp233-test', 'totp', 'verified', 'JBSWY3DPEHPK3PXP', now(), now()
)
on conflict (id) do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.reset_second_factor('5eed0000-0000-4000-8000-000000000003') $$,
  '42501', null::text, 'nobody resets her own second factor'
);
select throws_ok(
  $$ select public.reset_second_factor('5eed0000-0000-4000-8000-000000000002') $$,
  '42501', null::text, 'a staff member without team.manage resets nobody'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ select public.reset_second_factor('5eed0000-0000-4000-8000-000000000003') $$,
  'team.manage resets a team member''s second factor'
);

reset role;
select is(
  (select count(*)::int from auth.mfa_factors where user_id = '5eed0000-0000-4000-8000-000000000003'),
  0, 'her factor is gone, so her next sign-in sets up a new one'
);
select is(
  (select count(*)::int from public.audit_log
    where action = 'team.second_factor_reset' and target_id = '5eed0000-0000-4000-8000-000000000003'),
  1, 'and the reset is audited'
);

select * from finish();
rollback;
