-- The onboarding design role and test players (RAPP-615).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. The Onboarding design preset holds exactly onboarding.design and
--      test_players.manage, and the seeded design account holds exactly those.
--   2. is_test_account is privileged: no direct client write changes it.
--   3. onboarding.design edits every part of the onboarding and nothing else
--      in Settings.
--   4. test_players.manage reads, creates and edits test players, and never a
--      real participant, through the functions or through the profile rows.
--   5. Only an admin marks a TEAM account as a test account; a player never.
--   6. Every change is audited.
--
-- Seed: admin ...001, staff ...002 (participants.view and invite), coach-like
-- staff ...003, the design account ...097 (Onboarding design preset), the
-- test player ...096 (invited, not joined), the real players ...011 (joined)
-- and ...098 (invited, not joined).

begin;
select plan(49);

-- 1. The preset ---------------------------------------------------------------------------------

select has_column('public', 'profiles', 'is_test_account', 'profiles carry the test account flag');
select is(
  (select array_agg(permission_code order by permission_code) from public.permission_preset_defaults
    where builtin_key = 'onboarding_design'),
  array['onboarding.design', 'test_players.manage'],
  'the Onboarding design default holds the two design permissions'
);
select is(
  (select array_agg(grant_row.permission_code order by grant_row.permission_code)
     from public.permission_preset_permissions grant_row
     join public.permission_presets preset on preset.id = grant_row.preset_id
    where preset.org_id = '5eed0000-0000-4000-8000-000000000000'
      and preset.builtin_key = 'onboarding_design'),
  array['onboarding.design', 'test_players.manage'],
  'the organization has the Onboarding design preset'
);
select is(
  (select array_agg(permission_code order by permission_code) from public.team_member_permissions
    where profile_id = '5eed0000-0000-4000-8000-000000000097'),
  array['onboarding.design', 'test_players.manage'],
  'the seeded design account holds exactly the preset'
);
select is(
  (select count(*)::int from public.team_member_permissions
    where profile_id = '5eed0000-0000-4000-8000-000000000002'
      and permission_code in ('onboarding.design', 'test_players.manage')),
  0, 'a staff member holds neither design permission'
);

-- 2. The flag is privileged ------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$ update public.profiles set is_test_account = true where id = '5eed0000-0000-4000-8000-000000000011' $$,
  '42501', 'PROFILES/PRIVILEGED_COLUMN', 'a player cannot make herself a test account'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ update public.profiles set is_test_account = true where id = '5eed0000-0000-4000-8000-000000000011' $$,
  '42501', 'PROFILES/PRIVILEGED_COLUMN', 'a staff member cannot flag a real player directly'
);

-- 3. Onboarding design ------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ select public.save_intake_screen(null, '{"ca":"Pantalla de prova"}'::jsonb, null, 'identity') $$,
  'the design role adds a screen to the question builder'
);
select lives_ok(
  $$ select public.save_builtin_question_override('phone', '{"ca":"Mòbil"}'::jsonb, null, false, '{}'::jsonb) $$,
  'the design role rewords a built-in question'
);
select lives_ok(
  $$ select public.set_document_step_explanation('{"ca":"Porta el document si en tens."}'::jsonb) $$,
  'the design role writes the document step note'
);
select lives_ok(
  $$ select public.save_intake_state_preset(null, 'Prova', '{"phone":"skip"}'::jsonb) $$,
  'the design role saves an intake preset'
);
select ok(
  jsonb_array_length(public.intake_catalog() -> 'presets') >= 1,
  'and reads the presets back in the catalog'
);
select lives_ok(
  $$ select public.create_season('2027/28', '2027-09-01', false) $$,
  'the design role creates a season'
);
select ok(
  (select count(*) from public.list_authorization_versions()) >= 1,
  'the design role reads the authorization versions'
);
select lives_ok(
  $$ select public.publish_authorization_version(
       (select content from public.authorization_versions
         where id = '5eed0000-0000-4000-8041-000000000001')) $$,
  'the design role publishes a season authorization version'
);
select throws_ok(
  $$ select public.update_organization_settings('Una altra', null, null, null, null, null, array['ca'], 'ca') $$,
  '42501', null::text, 'the design role cannot change the organization details'
);
select throws_ok(
  $$ select * from public.list_staff_members() $$,
  '42501', null::text, 'the design role cannot read the team'
);
select throws_ok(
  $$ select public.set_team_member_permissions('5eed0000-0000-4000-8000-000000000097', array['team.manage'], null) $$,
  '42501', null::text, 'the design role cannot change permissions, its own included'
);

-- 4. Test players ------------------------------------------------------------------------------------

select is(
  (select array_agg(id::text order by id) from public.list_participants()),
  array['5eed0000-0000-4000-8000-000000000096'],
  'the roster of the design role holds the test player only'
);
select is(
  (select is_test_account from public.list_participants()), true,
  'and says she is a test player'
);
select is(
  (select count(*)::int from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011')),
  0, 'the design role cannot open a real player'
);
select is(
  (select count(*)::int from public.get_participant_profile('5eed0000-0000-4000-8000-000000000098')),
  0, 'nor a real woman who has not joined yet'
);
select is(
  (select first_name from public.get_participant_profile('5eed0000-0000-4000-8000-000000000096')),
  'Joana', 'the design role opens a test player'
);
select is(
  (select is_test_account from public.get_participant_profile('5eed0000-0000-4000-8000-000000000096')),
  true, 'and her record says she is a test player'
);
select is(
  (select count(*)::int from public.profiles where role in ('player', 'invited')),
  1, 'the profile rows show the design role the test player only'
);
select is(
  (select count(*)::int from public.profiles where id = '5eed0000-0000-4000-8000-000000000002'),
  1, 'team members stay visible to the design role'
);
select throws_ok(
  $$ select * from public.participant_custom_answers('5eed0000-0000-4000-8000-000000000011') $$,
  '42501', null::text, 'the design role cannot read a real player''s answers'
);
select lives_ok(
  $$ select * from public.participant_custom_answers('5eed0000-0000-4000-8000-000000000096') $$,
  'the design role reads a test player''s answers'
);
select throws_ok(
  $$ select public.update_participant_profile('5eed0000-0000-4000-8000-000000000011', '{"first_name":"X"}'::jsonb) $$,
  '42501', null::text, 'the design role cannot edit a real player'
);
select lives_ok(
  $$ select public.update_participant_profile('5eed0000-0000-4000-8000-000000000096',
       '{"first_name":"Joana","last_name":"Prova","clothing_size":"M"}'::jsonb) $$,
  'the design role edits a test player'
);
select throws_ok(
  $$ select * from public.create_participant_invite('{"email":"real.dona@example.test","first_name":"Real","last_name":"Dona"}'::jsonb) $$,
  '42501', null::text, 'the design role cannot invite a real player'
);
select throws_ok(
  $$ select * from public.create_participant_invite('{"email":"prova.sola@example.test","is_test_account":true}'::jsonb) $$,
  '22023', null::text, 'a test player needs her name, so she has a profile to carry the flag'
);
select throws_ok(
  $$ select * from public.create_participant_invite(
       '{"email":"amina.alhassan@example.test","first_name":"A","last_name":"B","is_test_account":true}'::jsonb) $$,
  -- The neutral refusal: it never confirms the address is a real account (0093).
  '22023', 'this address cannot be used for a test player',
  'a test player is never an address that already has an account'
);
select lives_ok(
  $$ select * from public.create_participant_invite(
       '{"email":"prova.dues@example.test","first_name":"Prova","last_name":"Dues","is_test_account":true}'::jsonb) $$,
  'the design role creates a test player'
);
select is(
  (select count(*)::int from public.list_participants()),
  2, 'and finds her on its roster'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2"}';
select ok(
  (select count(*) from public.profiles where id = '5eed0000-0000-4000-8000-000000000011') = 1,
  'a team member with other jobs still reads the profile rows as before'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2"}';
select ok(
  (select count(*) from public.list_participants()) > 2,
  'participants.view lists every participant'
);
select is(
  (select count(*)::int from public.list_participants() where is_test_account),
  2, 'and marks the two test players'
);
select ok(
  (select is_test_account from public.list_participants() where id = '5eed0000-0000-4000-8000-000000000096')
  and not (select is_test_account from public.list_participants() where id = '5eed0000-0000-4000-8000-000000000011'),
  'the test player is marked and the real player is not'
);
select lives_ok(
  $$ select * from public.create_participant_invite(
       '{"email":"prova.tres@example.test","first_name":"Prova","last_name":"Tres","is_test_account":true}'::jsonb) $$,
  'staff with participants.invite create a test player through the usual invitation'
);

reset role;
select ok(
  (select is_test_account from public.profiles p join auth.users u on u.id = p.id
    where u.email = 'prova.dues@example.test'),
  'the new test player carries the flag'
);
select ok(
  not (select is_test_account from public.profiles where id = '5eed0000-0000-4000-8000-000000000011'),
  'a real player does not'
);

-- 5. Marking a team account ----------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ select public.set_team_member_test_account('5eed0000-0000-4000-8000-000000000003', true) $$,
  'an admin marks a team account as a test account'
);
select throws_ok(
  $$ select public.set_team_member_test_account('5eed0000-0000-4000-8000-000000000011', true) $$,
  'P0002', null::text, 'a player is never made a test account after her creation'
);
select is(
  (select is_test_account from public.list_staff_members() where profile_id = '5eed0000-0000-4000-8000-000000000003'),
  true, 'the team list shows the flag'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.set_team_member_test_account('5eed0000-0000-4000-8000-000000000097', false) $$,
  '42501', null::text, 'without team.manage nobody marks an account'
);

-- 6. Audit ----------------------------------------------------------------------------------------------

reset role;
select ok(
  (select count(*) from public.audit_log
    where actor_id = '5eed0000-0000-4000-8000-000000000097'
      and action in ('intake.screen_save', 'intake.builtin_save', 'organization.document_explanation_update',
                     'intake.preset_save', 'season.create', 'authorization.publish', 'profile.update',
                     'invite.create')) >= 7,
  'every change by the design role is audited'
);
select ok(
  exists (select 1 from public.audit_log
           where action = 'invite.create' and (changes ->> 'test_account')::boolean
             and actor_id = '5eed0000-0000-4000-8000-000000000097'),
  'the invitation audit says it is a test player'
);
select ok(
  exists (select 1 from public.audit_log
           where action = 'team.test_account_update'
             and target_id = '5eed0000-0000-4000-8000-000000000003'
             and actor_id = '5eed0000-0000-4000-8000-000000000001'),
  'marking a team account is audited'
);

select * from finish();
rollback;
