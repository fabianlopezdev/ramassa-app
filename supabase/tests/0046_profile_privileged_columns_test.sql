-- Direct profile writes cannot change who someone is (RAPP-239).
-- Run with: bunx supabase test db
--
-- Every attack below worked before this migration (reproduced 2026-10-10). The
-- legitimate paths are the RPCs; 0004 and 0005 cover onboarding and the
-- player's own edits, and this file covers the two staff actions.

begin;
select plan(13);

update public.profiles set is_forum_banned = true where id = '5eed0000-0000-4000-8000-000000000016';

-- Staff --------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '5eed0000-0000-4000-8000-000000000002' $$,
  '42501', 'PROFILES/PRIVILEGED_COLUMN', 'a staff member cannot make herself admin'
);
select throws_ok(
  $$ update public.profiles set role = 'staff' where id = '5eed0000-0000-4000-8000-000000000011' $$,
  '42501', 'PROFILES/PRIVILEGED_COLUMN', 'nor make a player staff'
);
select throws_ok(
  $$ update public.profiles set is_active = false where id = '5eed0000-0000-4000-8000-000000000001' $$,
  '42501', 'PROFILES/PRIVILEGED_COLUMN', 'nor deactivate the admin directly'
);
select throws_ok(
  $$ update public.profiles set org_id = '5eed0000-0000-4000-8000-0000000000aa' where id = '5eed0000-0000-4000-8000-000000000011' $$,
  '42501', 'PROFILES/PRIVILEGED_COLUMN', 'nor move a player to another organization'
);
select throws_ok(
  $$ insert into public.profiles (id, org_id, role, first_name, last_name)
     values ('5eed0000-0000-4000-8000-0000000000bb', '5eed0000-0000-4000-8000-000000000000', 'admin', 'A', 'B') $$,
  '42501', 'PROFILES/DIRECT_INSERT', 'nor insert a profile directly'
);
select lives_ok(
  $$ update public.profiles set clothing_size = 'L' where id = '5eed0000-0000-4000-8000-000000000011' $$,
  'an ordinary field can still be written directly'
);
select lives_ok(
  $$ select public.set_participant_active('5eed0000-0000-4000-8000-000000000011', false) $$,
  'the deactivate action still works'
);
select lives_ok(
  $$ select public.set_forum_posting_disabled('5eed0000-0000-4000-8000-000000000011', true) $$,
  'and the forum ban action'
);
select is(
  current_setting('ramassa.trusted_profile_write', true),
  '',
  'the action clears its trusted-write marker'
);

reset role;
select is(
  (select is_active::text || '|' || is_forum_banned::text from public.profiles where id = '5eed0000-0000-4000-8000-000000000011'),
  'false|true',
  'both actions changed the player'
);

-- Player ---------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000016", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ update public.profiles set is_forum_banned = false where id = '5eed0000-0000-4000-8000-000000000016' $$,
  '42501', 'PROFILES/PRIVILEGED_COLUMN', 'a banned player cannot lift her own ban'
);
select throws_ok(
  $$ update public.profiles set terms_accepted_at = now() - interval '1 year' where id = '5eed0000-0000-4000-8000-000000000016' $$,
  '42501', 'PROFILES/PRIVILEGED_COLUMN', 'nor rewrite her consent date'
);

-- Entity collaborator --------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ update public.profiles set collaborating_entity_id = '5eed0000-0000-4000-8030-000000000002'
     where id = '5eed0000-0000-4000-8000-000000000004' $$,
  '42501', 'PROFILES/PRIVILEGED_COLUMN', 'an entity collaborator cannot move herself to another partner entity'
);

select * from finish();
rollback;
