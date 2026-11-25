-- Tauler loads with no real players (RAPP-974).
-- Run with: bunx supabase test db
--
-- What these assertions defend: the impact report is never null. An
-- organization whose players are all test accounts (staging) gets a report;
-- a real team member's report counts no test player (RAPP-619), and a test
-- account reviewing staging counts them.
--
-- The test builds its own organization: a real admin ...001, a test admin
-- ...002 and three test players ...011 to ...013.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(6);

insert into public.organizations (id, name, slug)
values ('97400000-0000-4000-8000-000000000000', 'Proves 974', 'proves-974');
insert into auth.users (id, email) values
  ('97400000-0000-4000-8000-000000000001', 'admin-974@example.test'),
  ('97400000-0000-4000-8000-000000000002', 'test-admin-974@example.test'),
  ('97400000-0000-4000-8000-000000000011', 'player-974-a@example.test'),
  ('97400000-0000-4000-8000-000000000012', 'player-974-b@example.test'),
  ('97400000-0000-4000-8000-000000000013', 'player-974-c@example.test');
insert into public.profiles (id, org_id, role, first_name, last_name, is_test_account, terms_accepted_at)
values
  ('97400000-0000-4000-8000-000000000001', '97400000-0000-4000-8000-000000000000', 'admin', 'Admin', 'Real', false, now()),
  ('97400000-0000-4000-8000-000000000002', '97400000-0000-4000-8000-000000000000', 'admin', 'Admin', 'Prova', true, now()),
  ('97400000-0000-4000-8000-000000000011', '97400000-0000-4000-8000-000000000000', 'player', 'Prova', 'A', true, now()),
  ('97400000-0000-4000-8000-000000000012', '97400000-0000-4000-8000-000000000000', 'player', 'Prova', 'B', true, now()),
  ('97400000-0000-4000-8000-000000000013', '97400000-0000-4000-8000-000000000000', 'player', 'Prova', 'C', true, now())
on conflict (id) do update
  set org_id = excluded.org_id, role = excluded.role, is_test_account = excluded.is_test_account;

-- A real team member: no player counts, and the report is still there.
set local role authenticated;
set local request.jwt.claims = '{"sub": "97400000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select isnt(public.get_impact_report(date '2026-01-01', date '2026-12-31'), null,
            'a report with no real players is not null');
select is((public.get_impact_report(date '2026-01-01', date '2026-12-31') -> 'summary' ->> 'suppressed')::boolean,
          true, 'with no real players the summary is held back');
select is((public.get_impact_report(date '2026-01-01', date '2026-12-31') ->> 'version')::integer, 1,
          'it keeps the shape the app reads');
reset role;

-- A test account reviewing staging counts the test players.
set local role authenticated;
set local request.jwt.claims = '{"sub": "97400000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is((public.get_impact_report(date '2026-01-01', date '2026-12-31') -> 'summary' ->> 'suppressed')::boolean,
          false, 'a test account sees the test players');
select is((public.get_impact_report(date '2026-01-01', date '2026-12-31') -> 'summary' ->> 'participant_count')::integer,
          3, 'and counts all three');
reset role;

-- The real team member still counts none of them.
set local role authenticated;
set local request.jwt.claims = '{"sub": "97400000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select ok((public.get_impact_report(date '2026-01-01', date '2026-12-31') -> 'summary' ->> 'participant_count') is null,
          'a real team member counts no test player');
reset role;

select * from finish();
rollback;
