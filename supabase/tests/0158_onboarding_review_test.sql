-- A Nova versió of an Onboarding screen asks players who finished to review it (RAPP-697).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Only the people who design the onboarding save a screen as a Nova
--      versió, and the key names a screen.
--   2. A player who finished before it has that screen to review; a woman who
--      becomes a player after it has nothing to review.
--   3. Finishing the review needs a signature on a signature block of the
--      screen, as its text reads now; then her Onboarding is up to date.
--   4. Her page says whether she still has screens to review.
--
-- Seed: admin ...001 (settings.organization), players ...011 and ...022,
-- invited woman ...098.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(14);

-- 1. Desa's Nova versió --------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(public.my_onboarding_review(), array[]::text[], 'a player who finished has nothing to review');
select throws_ok(
  $$ select public.mark_onboarding_screen_changed('logistics') $$,
  '42501', null::text, 'a player cannot save a screen as a Nova versió'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.mark_onboarding_screen_changed('Logistics; drop') $$,
  '22023', null::text, 'the key names a screen'
);
select lives_ok(
  $$ select public.mark_onboarding_screen_changed('logistics') $$,
  'an admin saves the logistics screen as a Nova versió'
);
select is(
  (select count(*)::integer from public.audit_log where action = 'onboarding.new_version'),
  1, 'and it is audited'
);

-- 2. Who has to review it --------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(public.my_onboarding_review(), array['logistics'], 'a player who finished before has it to review');

reset role;
update public.profiles set role = 'player' where id = '5eed0000-0000-4000-8000-000000000098';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000098", "role": "authenticated"}';
select is(public.my_onboarding_review(), array[]::text[], 'a woman who joins after it is not asked again');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(public.participant_onboarding_review_pending('5eed0000-0000-4000-8000-000000000022'), true,
  'her page says she has screens to review');

-- 3. Finishing the review --------------------------------------------------------------------------------

-- A signature block on the screen asks for her signature.
reset role;
insert into public.form_blocks (id, org_id, surface, screen_key, kind, body, sort_order)
values ('5eed0000-0000-4000-8099-000000000697', '5eed0000-0000-4000-8000-000000000000', 'onboarding',
        'logistics', 'signature', '{"ca": "Autoritzo el transport"}', 9);
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000022", "role": "authenticated"}';
select throws_ok(
  $$ select public.complete_onboarding_review('{"answers": {}}'::jsonb) $$,
  '23502', 'complete_onboarding_review requires her signature on every signature block',
  'a block on a screen she reviews needs her signature'
);
select throws_ok(
  $$ select public.complete_onboarding_review('{"answers": {}, "terms": true}'::jsonb) $$,
  '22023', null::text, 'the review takes her names, answers and signatures only'
);
select lives_ok(
  $$ select public.complete_onboarding_review('{"answers": {},
       "signatures": {"5eed0000-0000-4000-8099-000000000697": {"strokes": [[[100, 200], [300, 400]]], "language": "ca"}}}'::jsonb) $$,
  'she confirms her answers and signs'
);
select is(public.my_onboarding_review(), array[]::text[], 'and her Onboarding is up to date');

-- A required field of the screen with no answer keeps the review open.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select throws_ok(
  $$ select public.complete_onboarding_review('{"answers": {},
       "signatures": {"5eed0000-0000-4000-8099-000000000697": {"strokes": [[[100, 200], [300, 400]]], "language": "ca"}}}'::jsonb) $$,
  '23502', 'complete_onboarding_review requires an answer to a required question',
  'a required question of the screen needs her answer'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(public.participant_onboarding_review_pending('5eed0000-0000-4000-8000-000000000022'), false,
  'her page no longer says so once she finished');

select * from finish();
rollback;
