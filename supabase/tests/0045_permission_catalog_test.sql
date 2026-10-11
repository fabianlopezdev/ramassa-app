-- Permission catalog, presets and per-person toggles (RAPP-229).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. The catalog has the 42 permissions and the built-in presets their
--      product defaults; every organization has the three built-in presets.
--   2. Existing team members hold exactly the preset of their role, and nobody
--      else holds anything. No access rule reads permissions yet (RAPP-230).
--   3. has_permission answers only for an active team member of the org.
--   4. The safety rules: team.manage is required, nobody changes a toggle they
--      do not hold, the organization keeps a team.manage holder, built-in presets
--      cannot be deleted, and every change is audited.
--   5. Toggles follow a role change until RAPP-230/231 replace role changes.

begin;
select plan(31);

-- 1. Catalog and presets ----------------------------------------------------------------

select is((select count(*)::int from public.permissions), 42, 'the catalog has 42 permissions');
select is(
  (select count(*)::int from public.permission_preset_defaults where builtin_key = 'admin'),
  42, 'the Admin default holds every permission'
);
select is(
  (select count(*)::int from public.permission_preset_defaults where builtin_key = 'staff'),
  30, 'the Staff default holds 30'
);
select is(
  (select array_agg(permission_code order by permission_code) from public.permission_preset_defaults where builtin_key = 'coach'),
  array['attendance.mark', 'attendance.reports', 'equipment.handover', 'messages.inbox', 'participants.view'],
  'the Coach default holds the five field permissions'
);
select ok(
  not exists (
    select 1 from public.permission_preset_defaults
    where builtin_key = 'staff'
      and permission_code in ('participants.view_sensitive', 'rgpd.erase', 'team.manage', 'audit.view')
  ),
  'the Staff default excludes sensitive data, erasure, team management and the audit log'
);
select is(
  (select count(*)::int from public.permission_presets
    where org_id = '5eed0000-0000-4000-8000-000000000000' and builtin_key is not null),
  3, 'the organization has the three built-in presets'
);

-- 2. Backfill -------------------------------------------------------------------------------

select is(
  (select count(*)::int from public.team_member_permissions where profile_id = '5eed0000-0000-4000-8000-000000000001'),
  42, 'the admin holds the Admin preset'
);
select is(
  (select count(*)::int from public.team_member_permissions where profile_id = '5eed0000-0000-4000-8000-000000000002'),
  32, 'a seeded staff member holds the Staff preset plus the RAPP-230 adjustment (view_sensitive, rgpd.erase)'
);
select is(
  (select count(*)::int from public.team_member_permissions t
     join public.profiles p on p.id = t.profile_id where p.role not in ('staff', 'admin')),
  0, 'players and entities hold no permissions'
);

-- 3. has_permission ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select ok((select public.has_permission('attendance.mark')), 'staff hold attendance.mark');
select ok(not (select public.has_permission('team.manage')), 'staff do not hold team.manage');
select is((select count(*)::int from public.my_permissions()), 32, 'my_permissions lists her own 32');
select is((select count(*)::int from public.permission_presets), 0, 'without team.manage she cannot read presets');
select is(
  (select count(*)::int from public.team_member_permissions),
  32, 'she reads only her own toggles'
);
select throws_ok(
  $$ select public.set_team_member_permissions('5eed0000-0000-4000-8000-000000000003', array['attendance.mark']) $$,
  '42501', null::text, 'changing toggles needs team.manage'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select ok(not (select public.has_permission('participants.view')), 'a player holds nothing');

reset role;
update public.profiles set is_active = false where id = '5eed0000-0000-4000-8000-000000000003';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select ok(not (select public.has_permission('attendance.mark')), 'an inactive team member holds nothing');
reset role;
update public.profiles set is_active = true where id = '5eed0000-0000-4000-8000-000000000003';

-- 4. Safety rules, as the admin ----------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select is((select count(*)::int from public.permission_presets), 3, 'with team.manage the admin reads the presets');

select lives_ok(
  $$ select public.set_team_member_permissions(
       '5eed0000-0000-4000-8000-000000000003',
       array['attendance.mark', 'equipment.handover'],
       (select id from public.permission_presets where builtin_key = 'coach')
     ) $$,
  'the admin gives a staff member two toggles'
);

reset role;
select is(
  (select array_agg(permission_code order by permission_code) from public.team_member_permissions
    where profile_id = '5eed0000-0000-4000-8000-000000000003'),
  array['attendance.mark', 'equipment.handover'],
  'she now holds exactly those two'
);
select is(
  (select changes -> 'added' from public.audit_log
    where action = 'team.permissions_update' and target_id = '5eed0000-0000-4000-8000-000000000003'
    order by created_at desc limit 1),
  '[]'::jsonb,
  'the audit row records what was added (nothing: she already held both)'
);
select is(
  (select jsonb_array_length(changes -> 'removed') from public.audit_log
    where action = 'team.permissions_update' and target_id = '5eed0000-0000-4000-8000-000000000003'
    order by created_at desc limit 1),
  30,
  'and the 30 toggles removed'
);

-- The admin gives that staff member team.manage, then the admin loses some toggles.
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select public.set_team_member_permissions(
  '5eed0000-0000-4000-8000-000000000003', array['attendance.mark', 'team.manage']
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.set_team_member_permissions(
       '5eed0000-0000-4000-8000-000000000002', array['participants.view_sensitive']
     ) $$,
  '42501', null::text, 'nobody grants a toggle they do not hold'
);
select throws_ok(
  $$ select public.set_team_member_permissions(
       '5eed0000-0000-4000-8000-000000000001', array['team.manage']
     ) $$,
  '42501', null::text, 'nor removes one they do not hold'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select public.set_team_member_permissions('5eed0000-0000-4000-8000-000000000003', array['attendance.mark']);
select throws_ok(
  $$ select public.set_team_member_permissions(
       '5eed0000-0000-4000-8000-000000000001',
       array(select code from public.permissions where code <> 'team.manage')
     ) $$,
  '23514', null::text, 'the organization keeps at least one team.manage holder'
);

-- Presets
select lives_ok(
  $$ select public.save_permission_preset(null, 'Material manager', array['equipment.receive', 'equipment.count']) $$,
  'the admin creates an organization preset'
);
select throws_ok(
  $$ select public.delete_permission_preset((select id from public.permission_presets where builtin_key = 'admin')) $$,
  '22023', null::text, 'a built-in preset cannot be deleted'
);
select lives_ok(
  $$ select public.save_permission_preset(
       (select id from public.permission_presets where builtin_key = 'coach'), null, array['attendance.mark']
     ) $$,
  'the admin edits the built-in Coach preset'
);
select public.restore_permission_preset_default((select id from public.permission_presets where builtin_key = 'coach'));
select is(
  (select count(*)::int from public.permission_preset_permissions
    where preset_id = (select id from public.permission_presets where builtin_key = 'coach')),
  5, 'Restore default brings the Coach preset back to its five'
);

-- 5. Toggles follow a role change, until RAPP-230/231 -------------------------------------------

reset role;
update public.profiles set role = 'admin' where id = '5eed0000-0000-4000-8000-000000000002';
select is(
  (select count(*)::int from public.team_member_permissions where profile_id = '5eed0000-0000-4000-8000-000000000002'),
  42, 'a staff member promoted to admin gets the Admin preset'
);

insert into public.organizations (id, name, slug)
values ('5eed0000-0000-4000-8000-0000000000aa', 'Second org', 'second-org-rapp229');
select is(
  (select count(*)::int from public.permission_presets where org_id = '5eed0000-0000-4000-8000-0000000000aa'),
  3, 'a new organization starts with the three built-in presets'
);

select * from finish();
rollback;
