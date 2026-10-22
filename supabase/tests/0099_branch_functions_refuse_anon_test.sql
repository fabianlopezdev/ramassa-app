-- The functions this branch added or changed are not open to the anonymous
-- role (RAPP-618).
-- Run with: bunx supabase test db
--
-- A new function in public is executable by anon by default (Supabase's
-- default privileges). Each of these already refuses a caller without an
-- account inside; the grant is removed as well, so the API never reaches
-- them without a session.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(5);

select ok(
  not has_function_privilege('anon', 'public.create_participant_invite(jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.create_participant_invite(jsonb)', 'execute'),
  'creating an invitation needs an account'
);
select ok(
  not has_function_privilege('anon', 'public.update_participant_profile(uuid, jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.update_participant_profile(uuid, jsonb)', 'execute'),
  'editing a participant needs an account'
);
select ok(
  not has_function_privilege('anon', 'public.delete_participant_permanently(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.delete_participant_permanently(uuid)', 'execute'),
  'erasing a participant needs an account'
);
select ok(
  not has_function_privilege('anon', 'public.can_read_media_object(text)', 'execute')
  and has_function_privilege('authenticated', 'public.can_read_media_object(text)', 'execute'),
  'the media read check needs an account'
);

-- Every public function a migration of this branch defines, by name: none
-- left executable by anon, apart from the ones that serve signed-out screens.
select is(
  array(
    select p.proname::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (array[
         'create_participant_invite', 'create_season', 'delete_intake_state_preset',
         'delete_participant_permanently', 'delete_test_player', 'get_entity_referral',
         'intake_catalog', 'is_deletable_test_player', 'list_authorization_versions',
         'list_entity_referrals', 'list_referral_updates', 'list_staff_referrals',
         'my_test_scenario_stamp', 'participant_activity', 'participant_custom_answers',
         'participant_question_states', 'publish_authorization_version', 'referral_answer_keys',
         'save_intake_state_preset', 'set_current_season', 'set_document_step_explanation',
         'set_intake_question_states', 'set_participant_custom_answers',
         'set_team_member_test_account', 'set_test_player_scenario', 'start_player_preview',
         'test_player_scenario', 'test_sign_in_account', 'test_sign_in_record_success',
         'test_sign_in_register_attempt', 'update_participant_profile', 'can_read_media_object'])
       and has_function_privilege('anon', p.oid, 'execute')
     order by 1),
  array[]::text[],
  'no function of this branch is open to anon'
);

select * from finish();
rollback;
