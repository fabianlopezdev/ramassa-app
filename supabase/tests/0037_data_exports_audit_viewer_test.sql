-- Admin data exports and the filterable append-only audit viewer (RAPP-63).

begin;
select plan(25);

select has_function(
  'public',
  'create_data_export',
  array['text', 'text', 'text', 'date', 'date', 'text', 'boolean'],
  'one guarded function owns every data export'
);
select has_function(
  'public',
  'get_audit_log_page',
  array['uuid', 'text', 'text', 'uuid', 'date', 'date', 'timestamp with time zone', 'uuid', 'integer'],
  'one cursor-paginated function owns audit-log reads'
);
select is(
  has_function_privilege(
    'anon',
    'public.create_data_export(text,text,text,date,date,text,boolean)',
    'EXECUTE'
  ),
  false,
  'DENIAL: anonymous callers cannot execute exports'
);

insert into public.organizations (id, name, slug) values
  ('63000000-0000-4000-8000-000000000001', 'RAPP-63 Export', 'rapp-63-export'),
  ('63000000-0000-4000-8000-000000000002', 'RAPP-63 Other', 'rapp-63-other');

insert into auth.users (id, email) values
  ('63000000-0000-4000-8100-000000000001', 'rapp63.admin@example.test'),
  ('63000000-0000-4000-8100-000000000002', 'rapp63.staff@example.test'),
  ('63000000-0000-4000-8100-000000000003', 'rapp63.player@example.test'),
  ('63000000-0000-4000-8100-000000000004', 'rapp63.other.admin@example.test');

insert into public.profiles (
  id, org_id, role, first_name, last_name, preferred_language, address,
  postal_code, phone, document_type, document_number, city, nationality,
  place_of_birth, is_active, created_at
) values
  ('63000000-0000-4000-8100-000000000001', '63000000-0000-4000-8000-000000000001', 'admin', 'Nuria', 'Admin', 'ca', null, null, null, 'none', null, 'Granollers', null, null, true, '2026-08-01T08:00:00Z'),
  ('63000000-0000-4000-8100-000000000002', '63000000-0000-4000-8000-000000000001', 'staff', 'Staff', 'Member', 'ca', null, null, null, 'none', null, 'Granollers', null, null, true, '2026-08-01T08:00:00Z'),
  ('63000000-0000-4000-8100-000000000003', '63000000-0000-4000-8000-000000000001', 'player', 'أمينة', 'Torelló', 'ar', public.encrypt_field('Carrer Major 1'), public.encrypt_field('08401'), public.encrypt_field('+34600000000'), 'passport', public.encrypt_field('SECRET-63'), 'Granollers', 'Syria', 'Aleppo', true, '2026-08-03T08:00:00Z'),
  ('63000000-0000-4000-8100-000000000004', '63000000-0000-4000-8000-000000000002', 'admin', 'Other', 'Admin', 'ca', null, null, null, 'none', null, 'Vic', null, null, true, '2026-08-01T08:00:00Z');

set local role authenticated;
set local request.jwt.claims = '{"sub":"63000000-0000-4000-8100-000000000001","role":"authenticated"}';

create temporary table rapp63_default_export (payload jsonb) on commit drop;
insert into rapp63_default_export (payload)
select public.create_data_export('participants', 'default', 'xlsx', null, null, null, false);

select ok(
  not (((select payload from rapp63_default_export) -> 'columns') ?| array['address', 'postal_code', 'phone', 'document_number']),
  'THE TEST: the default participant export contract excludes every encrypted field'
);
select is(
  (select payload from rapp63_default_export) #>> '{rows,0,first_name}',
  'أمينة',
  'default exports preserve Arabic participant data'
);
select is(
  (select payload from rapp63_default_export) #>> '{rows,0,last_name}',
  'Torelló',
  'XLSX-bound exports preserve accented Catalan data'
);
select is(
  jsonb_array_length(public.create_data_export('participants', 'default', 'csv', '2026-08-20', '2026-08-21', null, false) -> 'rows'),
  1,
  'participant headcount matches impact reporting and is not reduced to profiles created in the period'
);
select throws_ok(
  $$ select public.create_data_export('participants', 'full', 'csv', null, null, null, false) $$,
  '22023',
  'full export requires explicit confirmation',
  'DENIAL: a full export without confirmation is rejected'
);
select throws_ok(
  $$ select public.create_data_export('participants', 'full', 'csv', null, null, 'x', true) $$,
  '22023',
  'full export requires a reason of at least 10 characters',
  'DENIAL: a full export without a meaningful reason is rejected'
);
select is(
  public.create_data_export('participants', 'full', 'xlsx', null, null, 'Participant access request', true) #>> '{rows,0,document_number}',
  'SECRET-63',
  'a confirmed full export decrypts the explicitly contracted sensitive field'
);
select is(
  (select count(*)::integer from public.audit_log where action = 'data_export.default'),
  2,
  'every successful default export writes an audit row'
);
select is(
  (select count(*)::integer from public.audit_log where action = 'data_export.full'),
  1,
  'the successful full export writes its own audit action'
);
select ok(
  not exists (
    select 1 from public.audit_log
    where action like 'data_export.%'
      and changes::text like '%SECRET-63%'
  ),
  'audit metadata never mirrors decrypted sensitive values'
);
select is(
  public.create_data_export('events', 'default', 'csv', '2026-08-01', '2026-08-31', null, false) ->> 'dataset',
  'events',
  'event-history export accepts a bounded report period'
);
select throws_ok(
  $$ select public.create_data_export('participants', 'default', 'pdf', null, null, null, false) $$,
  '22023',
  'unsupported export format',
  'DENIAL: only CSV and XLSX formats are accepted'
);
do $$
begin
  perform public.create_data_export('attendance', 'default', 'csv', null, null, null, false);
end;
$$;
select throws_ok(
  $$ select public.create_data_export('participants', 'default', 'csv', null, null, null, false) $$,
  '42901',
  'export rate limit exceeded',
  'DENIAL: a sixth export inside one minute is rate-limited'
);

select is(
  jsonb_array_length(public.get_audit_log_page(null, 'data_export.full', null, null, null, null, null, null, 50) -> 'rows'),
  1,
  'the audit viewer filters by exact action'
);
select is(
  jsonb_array_length(public.get_audit_log_page('63000000-0000-4000-8100-000000000001', null, 'data_export', null, null, null, null, null, 2) -> 'rows'),
  2,
  'the audit viewer filters by actor and target type and enforces page size'
);
select is(
  public.get_audit_log_page(null, null, null, null, null, null, null, null, 2) ->> 'has_more',
  'true',
  'cursor pagination reports when more audit rows exist'
);
select is(
  jsonb_array_length(public.get_audit_log_page(null, null, null, null, '2026-01-01', '2026-01-02', null, null, 50) -> 'rows'),
  0,
  'the audit viewer applies its inclusive date-period filter'
);

select throws_ok(
  $$ update public.audit_log set action = 'tampered' where action = 'data_export.full' $$,
  '42501',
  'permission denied for table audit_log',
  'DENIAL: authenticated admins cannot update append-only audit rows'
);
select throws_ok(
  $$ delete from public.audit_log where action = 'data_export.full' $$,
  '42501',
  'permission denied for table audit_log',
  'DENIAL: authenticated admins cannot delete append-only audit rows'
);

set local request.jwt.claims = '{"sub":"63000000-0000-4000-8100-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select public.create_data_export('participants', 'default', 'csv', null, null, null, false) $$,
  '42501',
  'data exports require admin access',
  'DENIAL: staff cannot export mass personal data'
);
select throws_ok(
  $$ select public.get_audit_log_page(null, null, null, null, null, null, null, null, 50) $$,
  '42501',
  'audit viewer requires admin access',
  'DENIAL: staff cannot open the admin audit viewer'
);

set local request.jwt.claims = '{"sub":"63000000-0000-4000-8100-000000000004","role":"authenticated"}';
select is(
  jsonb_array_length(public.get_audit_log_page(null, null, null, null, null, null, null, null, 50) -> 'rows'),
  0,
  'another tenant admin cannot see this organization audit trail'
);

reset role;
select * from finish();
rollback;
