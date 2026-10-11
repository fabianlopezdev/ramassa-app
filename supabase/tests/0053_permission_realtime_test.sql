-- Permission changes reach open sessions at once (RAPP-237).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. team_member_access is in the Realtime publication, and the permission
--      rows are not (a DELETE there would reach every subscriber).
--   2. Every permission change moves the person's team_member_access row, which
--      is the event the apps listen to.
--   3. She can read her own row, which Realtime requires before it sends her
--      the event, and another team member without team.manage cannot.

begin;
select plan(6);

select ok(
  exists (select 1 from pg_publication_tables
          where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_member_access'),
  'team_member_access is published to Realtime'
);
select ok(
  not exists (select 1 from pg_publication_tables
              where pubname = 'supabase_realtime' and tablename = 'team_member_permissions'),
  'the permission rows are not'
);

-- 2. A permission change moves the row -------------------------------------------------------

update public.team_member_access
   set updated_at = now() - interval '1 day'
 where profile_id = '5eed0000-0000-4000-8000-000000000002';

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.set_team_member_permissions(
       '5eed0000-0000-4000-8000-000000000002',
       array(select code from public.permissions where code in ('attendance.mark', 'messages.inbox'))
     ) $$,
  'an admin changes a staff member''s permissions'
);

reset role;
select ok(
  (select updated_at > now() - interval '1 minute' from public.team_member_access
    where profile_id = '5eed0000-0000-4000-8000-000000000002'),
  'and her team_member_access row moves with it'
);

-- 3. Who can read the row ------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2"}';
select is(
  (select count(*)::int from public.team_member_access where profile_id = '5eed0000-0000-4000-8000-000000000002'),
  1, 'she reads her own row'
);
select is(
  (select count(*)::int from public.team_member_access where profile_id = '5eed0000-0000-4000-8000-000000000001'),
  0, 'and nobody else''s without team.manage'
);

select * from finish();
rollback;
