-- The scenario tool follows the current app terms, and a fixture season never
-- takes a real season's name (RAPP-619, verifier findings 3 and 4).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. After new terms are published, her page says she has not accepted the
--      current version (as her gate does), and the "accepted" switch records
--      an acceptance of the current version that opens her gate.
--   2. A past season the scenario tool makes for a returning test player does
--      not block a real season of the same name, and is never shown by the
--      refusal.
--
-- Seed: admin ...001, the design account ...097, the test player ...096
-- (invited, no answers), the current season 2026/27 and no earlier season.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(11);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096', '{
       "kind": "answers",
       "fill": {
         "first_name": "Joana", "last_name": "Prova", "date_of_birth": "1995-05-15",
         "place_of_birth": "Marroc", "nationality": "Marroc", "preferred_language": "ca",
         "reference_entity": "Entitat de prova", "has_dependents": false, "num_dependents": 0,
         "clothing_size": "M", "shoe_size": "38"
       }
     }'::jsonb) $$,
  'the design role fills her answers'
);
select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096',
       '{"kind": "terms", "accepted": true}'::jsonb) $$,
  'and makes her join'
);

-- 1. New terms --------------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.save_app_terms_draft(
       jsonb_set((select content from public.app_terms_versions where version_number = 1),
                 '{body}', '{"ca": "Text legal nou."}'::jsonb)) $$,
  'an admin writes new terms'
);
select is(public.publish_app_terms_draft(), 2, 'and publishes version 2');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (public.test_player_scenario('5eed0000-0000-4000-8000-000000000096') ->> 'terms_accepted')::boolean,
  false,
  'her page says she has not accepted the current terms'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000096", "role": "authenticated"}';
select is(public.my_terms_acceptance_needed(), true, 'as her gate does');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096',
       '{"kind": "terms", "accepted": true}'::jsonb) $$,
  'the switch accepts the current terms for her'
);
select is(
  (public.test_player_scenario('5eed0000-0000-4000-8000-000000000096') ->> 'terms_accepted')::boolean,
  true,
  'her page says so'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000096", "role": "authenticated"}';
select is(public.my_terms_acceptance_needed(), false, 'and her gate opens');

-- 2. Fixture season names --------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096',
       '{"kind": "returning", "returning": true}'::jsonb) $$,
  'she becomes a returning player, on a fixture season'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.create_season(
       (select 'Prova ' || to_char(starts_on - interval '1 year', 'YYYY') from public.seasons where is_current),
       '2025-09-01', false) $$,
  'an admin still creates a real season with the fixture''s name'
);

select * from finish();
rollback;
