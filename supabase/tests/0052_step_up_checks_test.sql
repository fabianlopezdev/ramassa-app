-- Step-up checks before risky actions (RAPP-235).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. A verified (aal2) session whose authenticator code is older than 10
--      minutes, or that carries none, cannot run any of the risky functions.
--   2. A code from the last few minutes lets the same call through.
--   3. A trusted context with no signed-in user is not asked for a code.
--
-- The other test files stamp their aal2 claims with a TOTP time in 2100: that
-- stands for "verified just now", so they keep testing their own rules.

begin;
select plan(21);

-- 1. No recent code ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "password", "timestamp": 4102444800}]}';

select throws_ok(
  $$ select public.anonymize_participant('5eed0000-0000-4000-8000-000000000026') $$,
  '42501', 'step_up_required', 'anonymize_participant needs a recent authenticator code'
);
select throws_ok(
  $$ select public.apply_permission_preset(gen_random_uuid(), array['5eed0000-0000-4000-8000-000000000003']::uuid[]) $$,
  '42501', 'step_up_required', 'apply_permission_preset needs a recent authenticator code'
);
select throws_ok(
  $$ select public.create_data_export('participants', 'all', 'csv', null, null, 'test', true) $$,
  '42501', 'step_up_required', 'create_data_export needs a recent authenticator code'
);
select throws_ok(
  $$ select public.delete_participant_permanently('5eed0000-0000-4000-8000-000000000026') $$,
  '42501', 'step_up_required', 'delete_participant_permanently needs a recent authenticator code'
);
select throws_ok(
  $$ select public.delete_permission_preset(gen_random_uuid()) $$,
  '42501', 'step_up_required', 'delete_permission_preset needs a recent authenticator code'
);
select throws_ok(
  $$ select public.invite_entity_collaborator(gen_random_uuid(), 'step-up@example.test', 'Step', 'Up') $$,
  '42501', 'step_up_required', 'invite_entity_collaborator needs a recent authenticator code'
);
select throws_ok(
  $$ select public.invite_staff_member('step-up@example.test', 'Step', 'Up', 'staff') $$,
  '42501', 'step_up_required', 'invite_staff_member needs a recent authenticator code'
);
select throws_ok(
  $$ select public.remove_staff_member('5eed0000-0000-4000-8000-000000000003') $$,
  '42501', 'step_up_required', 'remove_staff_member needs a recent authenticator code'
);
select throws_ok(
  $$ select public.reset_second_factor('5eed0000-0000-4000-8000-000000000003') $$,
  '42501', 'step_up_required', 'reset_second_factor needs a recent authenticator code'
);
select throws_ok(
  $$ select public.restore_permission_preset_default(gen_random_uuid()) $$,
  '42501', 'step_up_required', 'restore_permission_preset_default needs a recent authenticator code'
);
select throws_ok(
  $$ select public.save_permission_preset(gen_random_uuid(), 'Step-up', array['team.manage']) $$,
  '42501', 'step_up_required', 'save_permission_preset needs a recent authenticator code'
);
select throws_ok(
  $$ select public.set_entity_collaborator_active('5eed0000-0000-4000-8000-000000000004', false) $$,
  '42501', 'step_up_required', 'set_entity_collaborator_active needs a recent authenticator code'
);
select throws_ok(
  $$ select public.set_staff_member_role('5eed0000-0000-4000-8000-000000000003', 'admin') $$,
  '42501', 'step_up_required', 'set_staff_member_role needs a recent authenticator code'
);
select throws_ok(
  $$ select public.set_team_member_permissions('5eed0000-0000-4000-8000-000000000003', array['team.manage']) $$,
  '42501', 'step_up_required', 'set_team_member_permissions needs a recent authenticator code'
);
select throws_ok(
  $$ select public.transition_deletion_request(gen_random_uuid(), 'declined', 'test') $$,
  '42501', 'step_up_required', 'transition_deletion_request needs a recent authenticator code'
);

select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '5eed0000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'amr', jsonb_build_array(jsonb_build_object(
    'method', 'totp', 'timestamp', extract(epoch from now() - interval '11 minutes')::bigint
  ))
)::text, true);
select throws_ok(
  $$ select public.reset_second_factor('5eed0000-0000-4000-8000-000000000003') $$,
  '42501', 'step_up_required', 'a code from 11 minutes ago is too old'
);

-- 2. A recent code --------------------------------------------------------------------------------

select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '5eed0000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'amr', jsonb_build_array(
    jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now() - interval '3 hours')::bigint),
    jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now() - interval '2 minutes')::bigint)
  )
)::text, true);
select lives_ok(
  $$ select public.reset_second_factor('5eed0000-0000-4000-8000-000000000003') $$,
  'a code from 2 minutes ago lets the reset through'
);
select throws_ok(
  $$ select public.reset_second_factor('5eed0000-0000-4000-8000-000000000001') $$,
  '42501', null::text, 'and the function''s own rules still apply after it'
);

-- 3. Trusted contexts --------------------------------------------------------------------------

reset role;
set local request.jwt.claims = '{"role": "service_role"}';
select lives_ok(
  $$ select private.require_recent_second_factor() $$,
  'the service role is not asked for a code'
);
set local request.jwt.claims = '{}';
select lives_ok(
  $$ select private.require_recent_second_factor() $$,
  'nor a context with no signed-in user'
);
select is(
  (select private.second_factor_verified_at()), null, 'which has no verification time'
);

select * from finish();
rollback;
