-- Attendance marking: staff-only tenancy, last-writer-wins, realtime, and
-- erasure coverage (RAPP-38). Run with: bunx supabase test db

begin;
select plan(38);

select has_table('public', 'attendance', 'attendance records exist');
select has_column('public', 'attendance', 'org_id', 'attendance belongs to an organization');
select has_column('public', 'attendance', 'occurrence_id', 'attendance names one occurrence');
select has_column('public', 'attendance', 'player_id', 'attendance names one participant');
select has_column('public', 'attendance', 'status', 'attendance carries a status');
select has_column('public', 'attendance', 'marked_by', 'attendance records the coach');
select has_column('public', 'attendance', 'marked_at', 'attendance carries the writer clock');
select has_column('public', 'attendance', 'updated_at', 'attendance carries server update time');
select col_not_null('public', 'attendance', 'occurrence_id', 'an occurrence is required');
select col_not_null('public', 'attendance', 'player_id', 'a participant is required');
select col_not_null('public', 'attendance', 'status', 'a status is required');
select col_not_null('public', 'attendance', 'marked_at', 'the conflict clock is required');
select col_is_fk('public', 'attendance', 'occurrence_id', 'the occurrence is real');
select col_is_fk('public', 'attendance', 'player_id', 'the participant is real');
select col_is_fk('public', 'attendance', 'marked_by', 'the marker is a real profile');
select has_index(
  'public', 'attendance', 'attendance_occurrence_player_unique',
  'one participant has one current mark per occurrence'
);
select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'public.attendance'::regclass
  ),
  'attendance has row security enabled and forced'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'attendance'
  ),
  'attendance changes are published to Supabase Realtime'
);
select is(
  (
    select disposition || ':' || participant_column
    from public.personal_data_disposition()
    where table_name = 'attendance'
  ),
  'purge:player_id',
  'attendance is registered as participant data for erasure'
);
select has_function(
  'public',
  'mark_attendance',
  array['uuid', 'uuid', 'text', 'timestamp with time zone'],
  'the client gets a narrow conflict-safe attendance upsert'
);

-- The policy/conflict section owns its exact row counts. Seeded attendance is
-- covered in 0003 and 0011; clear it inside this transaction so those fixtures
-- cannot make an authorization assertion pass or fail by accident.
truncate table public.attendance;

create or replace function pg_temp.seed_attendance_occurrence()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.event_occurrences
  where event_id = '5eed0000-0000-4000-8003-000000000001'
  order by starts_at
  limit 1;
$$;
grant execute on function pg_temp.seed_attendance_occurrence() to authenticated;

insert into public.organizations (id, name, slug)
values ('91000000-0000-4000-8000-000000000001', 'Other club', 'attendance-other');

insert into public.event_categories (id, org_id, name, icon, color)
values (
  '91000000-0000-4000-8000-000000000002',
  '91000000-0000-4000-8000-000000000001',
  '{"ca":"Altra","es":"Otra","en":"Other","ar":"أخرى","fa":"دیگر"}'::jsonb,
  'users',
  'primary'
);

insert into public.events (
  id, org_id, category_id, title, location, starts_at, signup_mode,
  status, published_at, created_by
)
values (
  '91000000-0000-4000-8000-000000000003',
  '91000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000002',
  '{"ca":"Sessió aliena","es":"Sesión ajena","en":"Other session","ar":"جلسة أخرى","fa":"جلسه دیگر"}'::jsonb,
  'Other pitch',
  now() + interval '1 day',
  'none',
  'published',
  now(),
  null
);

create or replace function pg_temp.other_attendance_occurrence()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.event_occurrences
  where event_id = '91000000-0000-4000-8000-000000000003'
  limit 1;
$$;
grant execute on function pg_temp.other_attendance_occurrence() to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';

select throws_ok(
  $$
    insert into public.attendance (occurrence_id, player_id, status, marked_at)
    values (
      pg_temp.seed_attendance_occurrence(),
      '5eed0000-0000-4000-8000-000000000011',
      'late',
      '2026-08-09T09:00:00Z'
    )
  $$,
  '23514',
  null::text,
  'an unknown attendance status is rejected'
);

select lives_ok(
  $$
    select public.mark_attendance(
      pg_temp.seed_attendance_occurrence(),
      '5eed0000-0000-4000-8000-000000000011',
      'present',
      '2026-08-09T09:00:00Z'
    )
  $$,
  'staff can mark a participant in their organization'
);

select is(
  (select marked_by from public.attendance where player_id = '5eed0000-0000-4000-8000-000000000011'),
  '5eed0000-0000-4000-8000-000000000002'::uuid,
  'the database attributes the mark to the signed-in coach'
);
select is(
  (select status from public.attendance where player_id = '5eed0000-0000-4000-8000-000000000011'),
  'present',
  'the initial status is stored'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000003","role":"authenticated"}';

select lives_ok(
  $$
    update public.attendance
    set status = 'absent', marked_at = '2026-08-09T08:59:59Z'
    where occurrence_id = pg_temp.seed_attendance_occurrence()
      and player_id = '5eed0000-0000-4000-8000-000000000011'
  $$,
  'an out-of-order device write is an idempotent no-op'
);
select is(
  (select status from public.attendance where player_id = '5eed0000-0000-4000-8000-000000000011'),
  'present',
  'the stale device cannot overwrite the newer mark'
);
select lives_ok(
  $$
    update public.attendance
    set status = 'excused', marked_at = '2026-08-09T09:00:05Z'
    where occurrence_id = pg_temp.seed_attendance_occurrence()
      and player_id = '5eed0000-0000-4000-8000-000000000011'
  $$,
  'a later device timestamp updates the mark'
);
select is(
  (
    select status || ':' || marked_by::text
    from public.attendance
    where player_id = '5eed0000-0000-4000-8000-000000000011'
  ),
  'excused:5eed0000-0000-4000-8000-000000000003',
  'the later status and its actual coach win together'
);
select is(
  (select count(*) from public.attendance)::int,
  1,
  'staff can read the organization attendance and an upsert identity stays unique'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated"}';
select is((select count(*) from public.attendance)::int, 0, 'a participant cannot read attendance');
select throws_ok(
  $$
    select public.mark_attendance(
      pg_temp.seed_attendance_occurrence(),
      '5eed0000-0000-4000-8000-000000000011',
      'present',
      now()
    )
  $$,
  '42501',
  null::text,
  'a participant cannot write attendance, including her own'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select count(*) from public.attendance)::int, 0, 'an entity contact cannot read attendance');
select throws_ok(
  $$
    select public.mark_attendance(
      pg_temp.seed_attendance_occurrence(),
      '5eed0000-0000-4000-8000-000000000011',
      'present',
      now()
    )
  $$,
  '42501',
  null::text,
  'an entity contact cannot write attendance'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select count(*) from public.attendance where occurrence_id = pg_temp.other_attendance_occurrence())::int,
  0,
  'staff cannot read attendance from another organization'
);
select throws_ok(
  $$
    select public.mark_attendance(
      pg_temp.other_attendance_occurrence(),
      '5eed0000-0000-4000-8000-000000000011',
      'present',
      now()
    )
  $$,
  '42501',
  null::text,
  'staff cannot write attendance for another organization'
);
select throws_ok(
  $$ delete from public.attendance where occurrence_id = pg_temp.seed_attendance_occurrence() $$,
  '42501',
  null::text,
  'attendance has no ordinary delete path'
);

reset role;
set local role anon;
select throws_ok(
  $$ select * from public.attendance $$,
  '42501',
  null::text,
  'anonymous callers have no attendance privileges'
);
reset role;

select is(
  (
    select count(*)
    from public.attendance
    where occurrence_id = pg_temp.seed_attendance_occurrence()
      and player_id = '5eed0000-0000-4000-8000-000000000011'
  )::int,
  1,
  'denied writes and stale retries leave one authoritative row'
);

select * from finish();
rollback;
