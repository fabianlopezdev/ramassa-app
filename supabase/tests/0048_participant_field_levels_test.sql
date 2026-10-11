-- Participant field levels hold on every read (RAPP-240).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. No signed-in user reads a Personal or Sensitive column directly, not
--      even a full Admin: those reads go through permission-checked functions.
--   2. With participants.view only (the Coach preset), the roster, the inbox
--      header and the filter options show Basic fields only, and searching or
--      filtering by a Personal field reveals nothing.
--   3. With participants.view_personal (Staff and Admin), everything works as
--      before.
--   4. The functions that now run with owner rights stay in their organization.

begin;
select plan(19);

insert into auth.users (id, email) values ('48000000-0000-4000-8000-000000000001', 'coach@rapp240.test');
insert into public.profiles (id, org_id, role, first_name, last_name)
values ('48000000-0000-4000-8000-000000000001', '5eed0000-0000-4000-8000-000000000000', 'staff', 'Field', 'Coach');
delete from public.team_member_permissions where profile_id = '48000000-0000-4000-8000-000000000001';
insert into public.team_member_permissions (org_id, profile_id, permission_code)
select '5eed0000-0000-4000-8000-000000000000', '48000000-0000-4000-8000-000000000001', permission_code
from public.permission_preset_defaults where builtin_key = 'coach';

-- A second organization with one participant, to prove the organization filter.
insert into public.organizations (id, name, slug) values ('48000000-0000-4000-8000-0000000000aa', 'Other NGO', 'rapp-240-other');
insert into auth.users (id, email) values ('48000000-0000-4000-8000-000000000011', 'other.player@rapp240.test');
insert into public.profiles (id, org_id, role, first_name, last_name, nationality)
values ('48000000-0000-4000-8000-000000000011', '48000000-0000-4000-8000-0000000000aa', 'player', 'Elsewhere', 'Player', 'Síria');

-- 1. Direct reads -------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select date_of_birth from public.profiles limit 1 $$,
  '42501', null::text, 'even an admin cannot read date of birth straight from the table'
);
select throws_ok(
  $$ select phone from public.profiles limit 1 $$,
  '42501', null::text, 'nor an encrypted column'
);
select throws_ok(
  $$ select id from public.profiles where nationality = 'Síria' $$,
  '42501', null::text, 'nor filter by a Personal column'
);
select lives_ok(
  $$ select id, first_name, last_name, reference_entity, is_active from public.profiles limit 1 $$,
  'Basic columns stay readable directly'
);

-- 3. Staff: as before ------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select ok(
  (select count(*) from public.list_participants() where nationality is not null) > 0,
  'staff see nationalities in the roster'
);
select ok(
  (select count(*) from public.list_participants(p_nationality => 'Síria')) > 0,
  'and can filter by nationality'
);
select ok(
  (select count(*) from public.list_participants(p_query => 'síria')) > 0,
  'and search by it'
);
select ok(
  (select 'Síria' = any(nationalities) from public.participant_filter_options()),
  'the nationality filter offers values'
);
select is(
  (select count(*)::int from public.list_participants() where id = '48000000-0000-4000-8000-000000000011'),
  0, 'the roster never includes another organization'
);
select is(
  (select max(total_count)::int from public.list_participants()),
  (select count(*)::int from public.list_participants(p_page_size => 100)),
  'the total counts the whole filtered roster'
);

-- 2. Coach: Basic only ---------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "48000000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select ok((select count(*) from public.list_participants()) > 0, 'a coach sees the roster');
select is(
  (select count(*)::int from public.list_participants()
    where nationality is not null or city is not null or has_dependents is not null),
  0, 'but no Personal field in it'
);
select is(
  (select count(*)::int from public.list_participants(p_query => 'síria')),
  0, 'a search by nationality finds nobody, so it reveals nothing'
);
select is(
  (select count(*)::int from public.list_participants(p_nationality => 'Síria')),
  (select count(*)::int from public.list_participants()),
  'and a nationality filter is ignored rather than answered'
);
select ok(
  (select count(*) from public.list_participants(p_query => 'maria')) > 0,
  'a search by name still works'
);
select is(
  (select cardinality(nationalities) from public.participant_filter_options()),
  0, 'the filter options offer no nationalities'
);
select is(
  (select first_name is not null and city is null
     from public.get_conversation_peer('5eed0000-0000-4000-8000-000000000026')),
  true, 'the inbox header shows her name without her city'
);

-- A player or entity contact opening her own chat reads her own header.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select count(*)::int from public.get_conversation_peer('5eed0000-0000-4000-8000-000000000004')),
  1, 'an entity contact reads her own chat header'
);
select is(
  (select count(*)::int from public.get_conversation_peer('5eed0000-0000-4000-8000-000000000026')),
  0, 'but not someone else''s'
);

select * from finish();
rollback;
