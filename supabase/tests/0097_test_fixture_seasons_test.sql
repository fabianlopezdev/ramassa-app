-- A test fixture season stays inside the test scenario tool (RAPP-619).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. A past season the scenario switches make for a returning test player
--      can never become the organization's current season: not through
--      `set_current_season`, for any caller, and not by a direct write (a
--      table check). Real players keep their current season to sign.
--   2. Nobody reads it from the table: a real player and every team member
--      see the real seasons only, so it is in no staff picker. The scenario
--      tool still reads her situation.
--   3. It goes when nothing uses it: after "reset" and after the test player
--      is deleted.
--
-- Seed: the design account ...097, the test player ...096 (invited), the real
-- player ...011, the admin ...001, the current season 2026/27 with a published
-- authorization and no earlier season.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(14);

create temp table fixture (id uuid) on commit drop;
grant all on fixture to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096',
       '{"kind": "returning", "returning": true}'::jsonb) $$,
  'the design role makes the test player a returning one'
);

reset role;
insert into fixture select id from public.seasons where is_test_fixture;
select is((select count(*)::integer from fixture), 1, 'a past season was made for her, marked as a fixture');
set local role authenticated;

-- 1. Never current --------------------------------------------------------------------------------------

select throws_ok(
  $$ select public.set_current_season((select id from fixture)) $$,
  '42501', 'no season of this organization',
  'the design role cannot make the fixture season current'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.set_current_season((select id from fixture)) $$,
  '42501', 'no season of this organization',
  'an admin cannot make it current either'
);

reset role;
select throws_ok(
  $$ update public.seasons set is_current = (id = (select id from fixture))
      where org_id = '5eed0000-0000-4000-8000-000000000000' $$,
  '23514', null::text,
  'the table refuses a current fixture season, whatever writes it'
);
set local role authenticated;

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(
  (select count(*)::integer from public.my_authorization_status()),
  1,
  'the real player still has this season''s authorization to sign'
);

-- 2. Seen by nobody from the table ---------------------------------------------------------------------

select is(
  (select array_agg(name order by name) from public.seasons),
  array['2026/27'],
  'a real player reads the real seasons only'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select array_agg(name order by name) from public.seasons),
  array['2026/27'],
  'an admin''s season list and pickers hold the real seasons only'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select array_agg(name order by name) from public.seasons),
  array['2026/27'],
  'the design role''s pickers hold the real seasons only'
);
select is(
  (public.test_player_scenario('5eed0000-0000-4000-8000-000000000096') ->> 'returning')::boolean,
  true,
  'the scenario tool still shows her as returning'
);

-- 3. Gone when unused ----------------------------------------------------------------------------------

select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096',
       '{"kind": "reset"}'::jsonb) $$,
  'reset to a brand-new player'
);
reset role;
select is(
  (select count(*)::integer from public.seasons where is_test_fixture),
  0,
  'reset drops the fixture season nobody uses any more'
);

set local role authenticated;
select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096',
       '{"kind": "returning", "returning": true}'::jsonb) $$,
  'returning again'
);
reset role;
-- The receipt the media Worker writes in the caller's name.
insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-000000000097',
        'profile.media_purged', 'profile', '5eed0000-0000-4000-8000-000000000096',
        '{"objects_deleted": 0}'::jsonb);
set local role authenticated;
select public.delete_test_player('5eed0000-0000-4000-8000-000000000096');
reset role;
select is(
  (select count(*)::integer from public.seasons where is_test_fixture),
  0,
  'deleting the test player drops her fixture season'
);

select * from finish();
rollback;
