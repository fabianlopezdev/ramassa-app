-- The season authorization published to a chosen season (RAPP-694).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. A draft is published to the current season or to a future one. A past
--      season and another organization's season are refused. No season means
--      the current one, as before.
--   2. A version published for a future season is not the one the current
--      season serves: her phone keeps the current season's latest version
--      until the future season is marked current, and then everyone signs it.
--   3. With no current season, publishing to a chosen future season still
--      works; publishing with no season says there is no current season.
--
-- Seed: admin ...001 (settings.organization), player ...022 (has not signed),
-- player ...011 (signed version 1), the current season 2026/27 (starts
-- 2026-09-01) with authorization version 1.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(17);

-- Setup (superuser): a past and a future season, and another organization's season.
insert into public.organizations (id, name, slug) values
  ('00000000-0000-0000-0000-0000000694b0', 'Other org', 'other-org-rapp-694');
insert into public.seasons (id, org_id, name, starts_on, is_current) values
  ('00000000-0000-0000-0000-000000069401', '5eed0000-0000-4000-8000-000000000000', '2025/26', '2025-09-01', false),
  ('00000000-0000-0000-0000-000000069402', '5eed0000-0000-4000-8000-000000000000', '2027/28', '2027-09-01', false),
  ('00000000-0000-0000-0000-000000069403', '00000000-0000-0000-0000-0000000694b0', '2027/28', '2027-09-01', false);

create temp table run (label text primary key, content jsonb) on commit drop;
grant all on run to authenticated;
insert into run (label, content)
select 'v1', content from public.authorization_versions where id = '5eed0000-0000-4000-8041-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select public.save_authorization_draft((select content from run where label = 'v1'));

-- 1. Which seasons take a publish ----------------------------------------------------------------

select throws_ok(
  $$ select public.publish_authorization_draft('00000000-0000-0000-0000-000000069401') $$,
  '22023', null::text, 'a past season takes no new publish'
);
select throws_ok(
  $$ select public.publish_authorization_draft('00000000-0000-0000-0000-000000069403') $$,
  'P0002', null::text, 'nor does another organization''s season'
);
select is(
  public.publish_authorization_draft('00000000-0000-0000-0000-000000069402'), 1,
  'a future season takes the draft as its version 1'
);
select is(
  (select season_id from public.list_authorization_versions() where version_number = 1 and season_id = '00000000-0000-0000-0000-000000069402'),
  '00000000-0000-0000-0000-000000069402'::uuid,
  'the list names the season it was published for'
);

-- 2. The future version is not the one the current season serves ---------------------------------

select ok(
  (select not is_current from public.list_authorization_versions() where season_id = '00000000-0000-0000-0000-000000069402'),
  'the future version is not marked current'
);
select ok(
  (select is_current from public.list_authorization_versions() where id = '5eed0000-0000-4000-8041-000000000001'),
  'the current season''s version 1 stays current'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000022", "role": "authenticated", "aal": "aal1"}';
select ok(
  (select version_id = '5eed0000-0000-4000-8041-000000000001' and season_id = '5eed0000-0000-4000-8040-000000000001'
     from public.my_authorization_status()),
  'her phone still asks the current season''s version'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select ok(
  (select not required from public.my_authorization_status()),
  'a player who signed this season is not asked again'
);

-- No season means the current one.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select public.save_authorization_draft((select content from run where label = 'v1'));
select is(public.publish_authorization_draft(), 2, 'no season publishes to the current one, as version 2');
select is(
  (select season_id from public.list_authorization_versions() where is_current),
  '5eed0000-0000-4000-8040-000000000001'::uuid,
  'and that version is the one the current season serves'
);
select public.save_authorization_draft((select content from run where label = 'v1'));
select is(
  public.publish_authorization_draft('5eed0000-0000-4000-8040-000000000001'), 3,
  'the current season can be chosen by name too'
);

-- The future season becomes current: everyone signs its version.
reset role;
update public.seasons set is_current = (id = '00000000-0000-0000-0000-000000069402')
 where org_id = '5eed0000-0000-4000-8000-000000000000';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select ok(
  (select required and is_returning and version_number = 1 and season_id = '00000000-0000-0000-0000-000000069402'
     from public.my_authorization_status()),
  'once that season is current, a returning player is asked to sign its version'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select public.save_authorization_draft((select content from run where label = 'v1'));
select throws_ok(
  $$ select public.publish_authorization_draft('5eed0000-0000-4000-8040-000000000001') $$,
  '22023', null::text, 'last season is now past and takes no new publish'
);

-- 3. No current season ---------------------------------------------------------------------------

reset role;
update public.seasons set is_current = false where org_id = '5eed0000-0000-4000-8000-000000000000';
insert into public.seasons (id, org_id, name, starts_on, is_current) values
  ('00000000-0000-0000-0000-000000069404', '5eed0000-0000-4000-8000-000000000000', '2099/00', '2099-09-01', false);
set local role authenticated;
select throws_ok(
  $$ select public.publish_authorization_draft() $$,
  '55000', null::text, 'with no current season, no season has nowhere to go'
);
select throws_ok(
  $$ select public.publish_authorization_draft('00000000-0000-0000-0000-000000069401') $$,
  '22023', null::text, 'a season that already started is still past'
);
select is(
  public.publish_authorization_draft('00000000-0000-0000-0000-000000069404'), 1,
  'a chosen future season still takes the draft'
);
reset role;

select ok(
  not has_function_privilege('anon', 'public.publish_authorization_draft(uuid, boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.publish_authorization_draft(uuid, boolean)', 'execute'),
  'publishing needs an account'
);

select * from finish();
rollback;
