-- Security regression coverage for staff RGPD request transitions (RAPP-67).

begin;
select plan(11);

select is(
  (
    select count(*)
      from (
        select table_class.oid,
               table_class.relrowsecurity,
               count(policy.polname) as policy_count
          from pg_class table_class
          join pg_namespace namespace on namespace.oid = table_class.relnamespace
          left join pg_policy policy on policy.polrelid = table_class.oid
         where namespace.nspname = 'public'
           and table_class.relkind = 'r'
         group by table_class.oid, table_class.relrowsecurity
      ) inventory
     where not inventory.relrowsecurity or inventory.policy_count = 0
  ),
  0::bigint,
  'every public table has RLS enabled and at least one explicit policy'
);

insert into public.organizations (id, name, slug) values
  ('67000000-0000-4000-8000-000000000001', 'Security tenant', 'rapp-67-security'),
  ('67000000-0000-4000-8000-000000000002', 'Other tenant', 'rapp-67-other');

insert into auth.users (id, email) values
  ('67000000-0000-4000-8000-000000000011', 'participant@rapp67.test'),
  ('67000000-0000-4000-8000-000000000012', 'staff@rapp67.test'),
  ('67000000-0000-4000-8000-000000000013', 'other-staff@rapp67.test');

insert into public.profiles (id, org_id, role, first_name, last_name) values
  ('67000000-0000-4000-8000-000000000011', '67000000-0000-4000-8000-000000000001', 'player', 'Test', 'Participant'),
  ('67000000-0000-4000-8000-000000000012', '67000000-0000-4000-8000-000000000001', 'staff', 'Test', 'Staff'),
  ('67000000-0000-4000-8000-000000000013', '67000000-0000-4000-8000-000000000002', 'staff', 'Other', 'Staff');

insert into public.deletion_requests (id, profile_id, reason)
values (
  '67000000-0000-4000-8000-000000000021',
  '67000000-0000-4000-8000-000000000011',
  'Security audit fixture'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "67000000-0000-4000-8000-000000000012", "role": "authenticated"}';

select throws_ok(
  $$ update public.deletion_requests
        set resolved_by = '67000000-0000-4000-8000-000000000013',
            resolved_at = now(),
            state = 'done',
            reason = 'forged'
      where id = '67000000-0000-4000-8000-000000000021' $$,
  '42501',
  'permission denied for table deletion_requests',
  'staff cannot update deletion requests directly'
);

select is(
  (select state from public.deletion_requests where id = '67000000-0000-4000-8000-000000000021'),
  'open',
  'direct table updates cannot skip the secured transition function'
);

select is(
  (select reason from public.deletion_requests where id = '67000000-0000-4000-8000-000000000021'),
  'Security audit fixture',
  'staff cannot rewrite the participant reason through the table API'
);

select lives_ok(
  $$ select public.transition_deletion_request(
    '67000000-0000-4000-8000-000000000021',
    'in_progress',
    'Identity confirmed'
  ) $$,
  'same-tenant staff can start work through the secured transition'
);

select is(
  (select resolved_by from public.deletion_requests where id = '67000000-0000-4000-8000-000000000021'),
  null,
  'an in-progress request is not falsely marked resolved'
);

select lives_ok(
  $$ select public.transition_deletion_request(
    '67000000-0000-4000-8000-000000000021',
    'done',
    'Erasure completed'
  ) $$,
  'same-tenant staff can complete the request'
);

select is(
  (select resolved_by from public.deletion_requests where id = '67000000-0000-4000-8000-000000000021'),
  '67000000-0000-4000-8000-000000000012'::uuid,
  'the database derives the resolver from auth.uid'
);

select isnt(
  (select resolved_at from public.deletion_requests where id = '67000000-0000-4000-8000-000000000021'),
  null,
  'the database stamps terminal resolution time'
);

select throws_ok(
  $$ select public.transition_deletion_request(
    '67000000-0000-4000-8000-000000000021',
    'in_progress',
    'Reverse it'
  ) $$,
  '23514',
  'invalid deletion request state transition',
  'terminal requests cannot move backward'
);

set local request.jwt.claims = '{"sub": "67000000-0000-4000-8000-000000000013", "role": "authenticated"}';

select throws_ok(
  $$ select public.transition_deletion_request(
    '67000000-0000-4000-8000-000000000021',
    'done',
    'Cross tenant'
  ) $$,
  'P0002',
  'deletion request not found',
  'another tenant cannot transition the request'
);

select * from finish();
rollback;
