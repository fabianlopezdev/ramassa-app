-- Event categories, event recurrence, occurrence materialization, and access control.
-- Runs with: bunx supabase test db

begin;
select plan(48);

select has_table('public', 'event_categories', 'the event category table exists');
select has_table('public', 'events', 'the events table exists');
select has_table('public', 'event_occurrences', 'recurrences are materialized');
select has_column('public', 'event_categories', 'name', 'category names are multilingual');
select has_column('public', 'event_categories', 'icon', 'categories use a fixed icon token');
select has_column('public', 'event_categories', 'color', 'categories use a semantic color token');
select has_column('public', 'event_categories', 'sort_order', 'category order is persisted');
select has_column('public', 'events', 'recurrence_rule', 'events store their finite recurrence rule');
select has_column('public', 'events', 'signup_mode', 'signup behavior is explicit');
select has_column('public', 'events', 'status', 'draft and published events are explicit');
select has_column('public', 'events', 'published_at', 'event publication can be scheduled');
select has_column('public', 'event_occurrences', 'event_id', 'every occurrence belongs to its event');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.event_categories'::regclass),
  'event category RLS is enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.events'::regclass),
  'event RLS is enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.event_occurrences'::regclass),
  'event occurrence RLS is enabled'
);

select throws_ok(
  $$ insert into public.event_categories (org_id, name, icon, color)
     values (
       '5eed0000-0000-4000-8000-000000000000',
       '{"ca":"Categoria","es":"Categoría","en":"Category","ar":"فئة","fa":"دسته"}',
       'custom-svg',
       'primary'
     ) $$,
  '23514',
  null::text,
  'the database rejects icons outside the accessible catalog'
);

select throws_ok(
  $$ insert into public.event_categories (org_id, name, icon, color)
     values (
       '5eed0000-0000-4000-8000-000000000000',
       '{"ca":"Categoria","es":"Categoría","en":"Category","ar":"فئة","fa":"دسته"}',
       'dumbbell',
       '#ff0000'
     ) $$,
  '23514',
  null::text,
  'the database rejects arbitrary category colors'
);

insert into public.event_categories (id, org_id, name, icon, color, sort_order)
values (
  '5eed0000-0000-4000-8002-000000000101',
  '5eed0000-0000-4000-8000-000000000000',
  '{"ca":"Prova DST","es":"Prueba DST","en":"DST test","ar":"اختبار التوقيت","fa":"آزمون زمان"}',
  'dumbbell',
  'primary',
  90
);

select throws_ok(
  $$ insert into public.events
       (org_id, category_id, title, location, location_url, starts_at, signup_mode)
     values (
       '5eed0000-0000-4000-8000-000000000000',
       '5eed0000-0000-4000-8002-000000000101',
       '{"ca":"Enllaç insegur"}',
       'Vic',
       'javascript:alert(1)',
       '2026-03-22 17:00:00+00',
       'none'
     ) $$,
  '23514',
  null::text,
  'the database rejects a non-https map URL'
);

select throws_ok(
  $$ insert into public.events
       (org_id, category_id, title, location, starts_at, max_participants, signup_mode)
     values (
       '5eed0000-0000-4000-8000-000000000000',
       '5eed0000-0000-4000-8002-000000000101',
       '{"ca":"Capacitat invàlida"}',
       'Vic',
       '2026-03-22 17:00:00+00',
       0,
       'confirm'
     ) $$,
  '23514',
  null::text,
  'the database rejects zero capacity'
);

select throws_ok(
  $$ insert into public.events
       (org_id, category_id, title, location, starts_at, signup_mode)
     values (
       '5eed0000-0000-4000-8000-000000000000',
       '5eed0000-0000-4000-8002-000000000101',
       '{"ca":"Mode invàlid"}',
       'Vic',
       '2026-03-22 17:00:00+00',
       'maybe'
     ) $$,
  '23514',
  null::text,
  'the database rejects a signup mode outside the vocabulary'
);

select throws_ok(
  $$ insert into public.events
       (org_id, category_id, title, location, starts_at, recurrence_rule, signup_mode)
     values (
       '5eed0000-0000-4000-8000-000000000000',
       '5eed0000-0000-4000-8002-000000000101',
       '{"ca":"Recurrència sense límit"}',
       'Vic',
       '2026-03-22 17:00:00+00',
       'FREQ=WEEKLY;INTERVAL=1',
       'none'
     ) $$,
  '23514',
  null::text,
  'the database accepts only the supported finite weekly RRULE subset'
);

insert into public.events (
  id,
  org_id,
  category_id,
  title,
  description,
  location,
  location_url,
  starts_at,
  ends_at,
  recurrence_rule,
  max_participants,
  signup_mode,
  status,
  published_at,
  created_by
)
values (
  '5eed0000-0000-4000-8003-000000000101',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8002-000000000101',
  '{"ca":"Entrenament DST","es":"Entrenamiento DST","en":"DST training","ar":"تدريب التوقيت","fa":"تمرین زمان"}',
  null,
  'Camp Municipal de Vic',
  'https://maps.google.com/?q=Vic',
  '2026-03-22 17:00:00+00',
  '2026-03-22 18:30:00+00',
  'FREQ=WEEKLY;INTERVAL=1;COUNT=3',
  18,
  'confirm',
  'published',
  '2026-03-01 09:00:00+00',
  null
);

select is(
  (select count(*) from public.event_occurrences
    where event_id = '5eed0000-0000-4000-8003-000000000101')::int,
  3,
  'a three-week rule materializes three occurrences'
);

select is(
  (select string_agg(to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'), ',' order by starts_at)
   from public.event_occurrences
   where event_id = '5eed0000-0000-4000-8003-000000000101'),
  '2026-03-22 17:00,2026-03-29 16:00,2026-04-05 16:00',
  'UTC instants change when Madrid enters daylight saving time'
);

select is(
  (select string_agg(to_char(starts_at at time zone 'Europe/Madrid', 'HH24:MI'), ',' order by starts_at)
   from public.event_occurrences
   where event_id = '5eed0000-0000-4000-8003-000000000101'),
  '18:00,18:00,18:00',
  'the local training time stays fixed across the DST boundary'
);

select is(
  (select bool_and(ends_at - starts_at = interval '90 minutes')
   from public.event_occurrences
   where event_id = '5eed0000-0000-4000-8003-000000000101'),
  true,
  'each materialized occurrence keeps the event duration'
);

insert into public.events (
  id, org_id, category_id, title, location, starts_at, recurrence_rule, signup_mode
)
values (
  '5eed0000-0000-4000-8003-000000000102',
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8002-000000000101',
  '{"ca":"Sortida única"}',
  'Museu Episcopal de Vic',
  '2026-10-18 09:00:00+00',
  null,
  'interest'
);

select is(
  (select count(*) from public.event_occurrences
   where event_id = '5eed0000-0000-4000-8003-000000000102')::int,
  1,
  'a one-off event materializes exactly one occurrence'
);

select lives_ok(
  $$ update public.event_categories
     set sort_order = case id
       when '5eed0000-0000-4000-8002-000000000101' then 2
       else sort_order
     end
     where id = '5eed0000-0000-4000-8002-000000000101' $$,
  'category order can be persisted'
);

select is(
  (select sort_order from public.event_categories
   where id = '5eed0000-0000-4000-8002-000000000101'),
  2,
  'the category keeps its new order'
);

insert into public.organizations (id, name, slug)
values ('5eed0000-0000-4000-8000-999999999998', 'Other events club', 'other-events-club');

insert into public.event_categories (id, org_id, name, icon, color, sort_order)
values (
  '5eed0000-0000-4000-8002-999999999901',
  '5eed0000-0000-4000-8000-999999999998',
  '{"ca":"Altra categoria","es":"Otra categoría","en":"Other category","ar":"فئة أخرى","fa":"دسته دیگر"}',
  'theater',
  'chart-2',
  1
);

insert into public.events (
  id, org_id, category_id, title, location, starts_at, signup_mode, status, published_at
)
values (
  '5eed0000-0000-4000-8003-999999999901',
  '5eed0000-0000-4000-8000-999999999998',
  '5eed0000-0000-4000-8002-999999999901',
  '{"ca":"Altre club","es":"Otro club","en":"Other club","ar":"ناد آخر","fa":"باشگاه دیگر"}',
  'Other town',
  '2026-04-01 16:00:00+00',
  'none',
  'published',
  '2026-03-01 09:00:00+00'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.event_categories (name, icon, color, sort_order)
     values (
       '{"ca":"Categoria d''equip","es":"Categoría de equipo","en":"Team category","ar":"فئة الفريق","fa":"دسته تیم"}',
       'users',
       'chart-3',
       91
     ) $$,
  'staff can create a category in their organization'
);

select lives_ok(
  $$ insert into public.events (category_id, title, location, starts_at, signup_mode)
     values (
       '5eed0000-0000-4000-8002-000000000101',
       '{"ca":"Esborrany de l''equip"}',
       'Vic',
       '2026-05-01 16:00:00+00',
       'none'
     ) $$,
  'staff can save a Catalan-only draft'
);

select is(
  (select count(*) from public.event_categories where name->>'ca' = 'Categoria d''equip')::int,
  1,
  'staff can read their newly created category'
);

select is(
  (select count(*) from public.event_categories
   where id = '5eed0000-0000-4000-8002-999999999901')::int,
  0,
  'staff cannot read another organization category'
);

select throws_ok(
  $$ insert into public.events (org_id, category_id, title, location, starts_at, signup_mode)
     values (
       '5eed0000-0000-4000-8000-999999999998',
       '5eed0000-0000-4000-8002-999999999901',
       '{"ca":"No permès"}',
       'Other town',
       '2026-05-01 16:00:00+00',
       'none'
     ) $$,
  '42501',
  null::text,
  'staff cannot write an event into another organization'
);

select is(
  (select count(*) from public.event_occurrences
   where event_id = '5eed0000-0000-4000-8003-000000000101')::int,
  3,
  'staff can read all occurrences in their organization'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';

select is(
  (select count(*) from public.event_categories
   where id = '5eed0000-0000-4000-8002-000000000101')::int,
  1,
  'players can read event categories in their organization'
);

select is(
  (select count(*) from public.events
   where id = '5eed0000-0000-4000-8003-000000000101')::int,
  1,
  'players can read a published event'
);

select is(
  (select count(*) from public.events where title->>'ca' = 'Esborrany de l''equip')::int,
  0,
  'players cannot read event drafts'
);

select is(
  (select count(*) from public.events
   where id = '5eed0000-0000-4000-8003-999999999901')::int,
  0,
  'players cannot read another organization event'
);

select is(
  (select count(*) from public.event_occurrences
   where event_id = '5eed0000-0000-4000-8003-000000000101')::int,
  3,
  'players can read occurrences of a published event'
);

select throws_ok(
  $$ insert into public.events (category_id, title, location, starts_at, signup_mode)
     values (
       '5eed0000-0000-4000-8002-000000000101',
       '{"ca":"No"}',
       'Vic',
       '2026-06-01 16:00:00+00',
       'none'
     ) $$,
  '42501',
  null::text,
  'players cannot create events'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated"}';

select is((select count(*) from public.events)::int, 0, 'entity contacts cannot read events');
select is(
  (select count(*) from public.event_categories)::int,
  0,
  'entity contacts cannot read event categories'
);
select is(
  (select count(*) from public.event_occurrences)::int,
  0,
  'entity contacts cannot read event occurrences'
);

reset role;

select is(
  (select disposition from public.personal_data_disposition()
   where table_name = 'event_categories'),
  'not_personal',
  'event categories are registered as organization content'
);
select is(
  (select disposition from public.personal_data_disposition() where table_name = 'events'),
  'not_personal',
  'events are registered as organization content'
);
select is(
  (select disposition from public.personal_data_disposition()
   where table_name = 'event_occurrences'),
  'not_personal',
  'event occurrences are registered as organization content'
);

select is(
  (select delete_rule from information_schema.referential_constraints
   where constraint_name = 'events_created_by_fkey'),
  'SET NULL',
  'events survive removal of their staff author without retaining the reference'
);

select is(
  (
    select count(*)::int
    from pg_indexes
    where schemaname = 'public'
      and tablename in ('event_categories', 'events', 'event_occurrences')
      and indexdef like '%org_id%'
  ),
  9,
  'tenant, list, visibility, category, and occurrence access paths are indexed'
);

select * from finish();
rollback;
