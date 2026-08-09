-- Attendance reporting rates, excused handling, and RLS boundaries (RAPP-39).

begin;
select plan(24);

select has_view('public', 'attendance_report_rows', 'attendance report rows view exists');
select has_view('public', 'attendance_participant_stats', 'participant attendance stats view exists');
select has_view('public', 'attendance_event_stats', 'event attendance stats view exists');
select has_view('public', 'attendance_category_stats', 'category attendance stats view exists');
select has_view('public', 'attendance_period_stats', 'period attendance stats view exists');

select ok(
  coalesce((select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.attendance_report_rows'::regclass), false),
  'report rows invoke the caller security context'
);
select ok(
  coalesce((select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.attendance_participant_stats'::regclass), false),
  'participant stats invoke the caller security context'
);
select ok(
  coalesce((select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.attendance_event_stats'::regclass), false),
  'event stats invoke the caller security context'
);
select ok(
  coalesce((select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.attendance_category_stats'::regclass), false),
  'category stats invoke the caller security context'
);
select ok(
  coalesce((select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.attendance_period_stats'::regclass), false),
  'period stats invoke the caller security context'
);

truncate table public.attendance;

insert into public.event_categories (id, org_id, name, icon, color, sort_order)
values
  (
    '93000000-0000-4000-8000-000000000001',
    '5eed0000-0000-4000-8000-000000000000',
    '{"ca":"Informes A","es":"Informes A","en":"Reports A","ar":"تقارير أ","fa":"گزارش الف"}',
    'users', 'primary', 900
  ),
  (
    '93000000-0000-4000-8000-000000000002',
    '5eed0000-0000-4000-8000-000000000000',
    '{"ca":"Informes B","es":"Informes B","en":"Reports B","ar":"تقارير ب","fa":"گزارش ب"}',
    'users', 'secondary', 901
  );

insert into public.events (
  id, org_id, category_id, title, location, starts_at, ends_at,
  signup_mode, status, published_at, expires_at, created_by
)
values
  (
    '93000000-0000-4000-8000-000000000011',
    '5eed0000-0000-4000-8000-000000000000',
    '93000000-0000-4000-8000-000000000001',
    '{"ca":"Informe gener","es":"Informe enero","en":"January report","ar":"تقرير يناير","fa":"گزارش ژانویه"}',
    'Camp A', '2026-01-10T10:00:00Z', '2026-01-10T11:00:00Z',
    'none', 'published', '2026-01-01T00:00:00Z', '2026-01-11T00:00:00Z', null
  ),
  (
    '93000000-0000-4000-8000-000000000012',
    '5eed0000-0000-4000-8000-000000000000',
    '93000000-0000-4000-8000-000000000001',
    '{"ca":"Informe febrer A","es":"Informe febrero A","en":"February report A","ar":"تقرير فبراير أ","fa":"گزارش فوریه الف"}',
    'Camp A', '2026-02-10T10:00:00Z', '2026-02-10T11:00:00Z',
    'none', 'published', '2026-01-01T00:00:00Z', null, null
  ),
  (
    '93000000-0000-4000-8000-000000000013',
    '5eed0000-0000-4000-8000-000000000000',
    '93000000-0000-4000-8000-000000000002',
    '{"ca":"Informe febrer B","es":"Informe febrero B","en":"February report B","ar":"تقرير فبراير ب","fa":"گزارش فوریه ب"}',
    'Camp B', '2026-02-20T10:00:00Z', '2026-02-20T11:00:00Z',
    'none', 'published', '2026-01-01T00:00:00Z', null, null
  );

select set_config(
  'request.jwt.claims',
  '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

insert into public.attendance (occurrence_id, player_id, status, marked_at)
select occurrence.id, fixture.player_id, fixture.status, fixture.marked_at
from public.event_occurrences as occurrence
join (
  values
    ('93000000-0000-4000-8000-000000000011'::uuid, '5eed0000-0000-4000-8000-000000000011'::uuid, 'present', '2026-01-10T11:00:00Z'::timestamptz),
    ('93000000-0000-4000-8000-000000000011'::uuid, '5eed0000-0000-4000-8000-000000000012'::uuid, 'absent',  '2026-01-10T11:00:01Z'::timestamptz),
    ('93000000-0000-4000-8000-000000000011'::uuid, '5eed0000-0000-4000-8000-000000000013'::uuid, 'excused', '2026-01-10T11:00:02Z'::timestamptz),
    ('93000000-0000-4000-8000-000000000012'::uuid, '5eed0000-0000-4000-8000-000000000011'::uuid, 'absent',  '2026-02-10T11:00:00Z'::timestamptz),
    ('93000000-0000-4000-8000-000000000012'::uuid, '5eed0000-0000-4000-8000-000000000012'::uuid, 'present', '2026-02-10T11:00:01Z'::timestamptz),
    ('93000000-0000-4000-8000-000000000012'::uuid, '5eed0000-0000-4000-8000-000000000013'::uuid, 'excused', '2026-02-10T11:00:02Z'::timestamptz),
    ('93000000-0000-4000-8000-000000000013'::uuid, '5eed0000-0000-4000-8000-000000000011'::uuid, 'present', '2026-02-20T11:00:00Z'::timestamptz),
    ('93000000-0000-4000-8000-000000000013'::uuid, '5eed0000-0000-4000-8000-000000000012'::uuid, 'present', '2026-02-20T11:00:01Z'::timestamptz),
    ('93000000-0000-4000-8000-000000000013'::uuid, '5eed0000-0000-4000-8000-000000000013'::uuid, 'absent',  '2026-02-20T11:00:02Z'::timestamptz)
) as fixture(event_id, player_id, status, marked_at)
  on fixture.event_id = occurrence.event_id;

set local role authenticated;

select is((select count(*) from public.attendance_report_rows)::int, 9, 'staff see all report rows in their organization');
select is(
  (select present_count::text || ':' || absent_count::text || ':' || excused_count::text || ':' || attendance_rate::text
   from public.attendance_participant_stats
   where player_id = '5eed0000-0000-4000-8000-000000000011'),
  '2:1:0:66.67',
  'participant rate is hand-computed from present and absent marks'
);
select is(
  (select present_count::text || ':' || absent_count::text || ':' || excused_count::text || ':' || attendance_rate::text
   from public.attendance_participant_stats
   where player_id = '5eed0000-0000-4000-8000-000000000013'),
  '0:1:2:0.00',
  'excused marks are reported but excluded from the attendance-rate denominator'
);
select is(
  (select attendance_rate from public.attendance_event_stats where event_id = '93000000-0000-4000-8000-000000000011'),
  50.00::numeric,
  'event rate aggregates every occurrence and excludes excused marks'
);
select is(
  (select attendance_rate from public.attendance_category_stats where category_id = '93000000-0000-4000-8000-000000000001'),
  50.00::numeric,
  'category rate aggregates its events'
);
select is(
  (select attendance_rate from public.attendance_period_stats where period_start = '2026-01-01'),
  50.00::numeric,
  'January period rate matches its hand-computed fixture'
);
select is(
  (select attendance_rate from public.attendance_period_stats where period_start = '2026-02-01'),
  60.00::numeric,
  'February period rate combines both events'
);
select is((select count(*) from public.attendance_report_rows where status = 'present')::int, 4, 'event reports identify everyone marked present');

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated"}';
select is((select count(*) from public.attendance)::int, 3, 'a player can read only her own raw attendance rows');
select is((select count(*) from public.attendance_report_rows)::int, 3, 'a player can read only her own report history');
select ok(
  not exists (
    select 1 from public.attendance_report_rows
    where player_id <> '5eed0000-0000-4000-8000-000000000011'
  ),
  'player report history never leaks another participant'
);
select is((select count(*) from public.attendance_participant_stats)::int, 1, 'a player receives only her own summary');

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select count(*) from public.attendance_report_rows)::int, 0, 'entity contacts cannot read attendance reports');

reset role;
set local role anon;
select throws_ok(
  $$ select * from public.attendance_report_rows $$,
  '42501',
  null::text,
  'anonymous callers cannot read attendance reports'
);
reset role;

select * from finish();
rollback;
