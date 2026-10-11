-- The Team screen's database rules (RAPP-231).
-- Run with: bunx supabase test db

begin;
select plan(3);

-- Only the seeded admin holds team.manage.
delete from public.team_member_permissions
where permission_code = 'team.manage' and profile_id <> '5eed0000-0000-4000-8000-000000000001';
-- Promote a staff member to admin WITHOUT team.manage, so the old
-- "another active admin" rule alone would allow the removal.
update public.profiles set role = 'admin' where id = '5eed0000-0000-4000-8000-000000000002';
delete from public.team_member_permissions
where profile_id = '5eed0000-0000-4000-8000-000000000002' and permission_code = 'team.manage';

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.remove_staff_member('5eed0000-0000-4000-8000-000000000001') $$,
  '23514', null::text,
  'the last team.manage holder cannot be removed, even when another admin remains'
);

reset role;
select is(
  (select is_active from public.profiles where id = '5eed0000-0000-4000-8000-000000000001'),
  true, 'and the refused removal changed nothing'
);

-- With a second holder, the removal works.
insert into public.team_member_permissions (org_id, profile_id, permission_code)
values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-000000000002', 'team.manage');
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ select public.remove_staff_member('5eed0000-0000-4000-8000-000000000003') $$,
  'removing someone else works while a team.manage holder remains'
);

select * from finish();
rollback;
