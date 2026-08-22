-- Canonical impact metrics, date/category/entity filters, privacy suppression,
-- Europe/Madrid period boundaries, and role isolation (RAPP-62).

begin;
select plan(25);

select has_function(
  'public',
  'get_impact_report',
  array['date', 'date', 'uuid', 'uuid'],
  'one canonical impact report function owns every dashboard and export metric'
);
select is(
  has_function_privilege(
    'anon',
    'public.get_impact_report(date,date,uuid,uuid)',
    'EXECUTE'
  ),
  false,
  'DENIAL: anonymous callers cannot execute impact reports'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.get_impact_report(date,date,uuid,uuid)',
    'EXECUTE'
  ),
  true,
  'authenticated staff can execute the guarded impact report function'
);

insert into public.organizations (id, name, slug) values
  ('62000000-0000-4000-8000-000000000001', 'RAPP-62 Analytics', 'rapp-62-analytics'),
  ('62000000-0000-4000-8000-000000000002', 'RAPP-62 Other', 'rapp-62-other');

insert into auth.users (id, email) values
  ('62000000-0000-4000-8100-000000000001', 'rapp62.admin@example.test'),
  ('62000000-0000-4000-8100-000000000002', 'rapp62.entity.alpha@example.test'),
  ('62000000-0000-4000-8100-000000000003', 'rapp62.entity.beta@example.test'),
  ('62000000-0000-4000-8200-000000000001', 'rapp62.player1@example.test'),
  ('62000000-0000-4000-8200-000000000002', 'rapp62.player2@example.test'),
  ('62000000-0000-4000-8200-000000000003', 'rapp62.player3@example.test'),
  ('62000000-0000-4000-8200-000000000004', 'rapp62.player4@example.test'),
  ('62000000-0000-4000-8200-000000000005', 'rapp62.player5@example.test'),
  ('62000000-0000-4000-8300-000000000001', 'rapp62.other.staff@example.test'),
  ('62000000-0000-4000-8300-000000000002', 'rapp62.other.player@example.test');

insert into public.profiles (
  id, org_id, role, first_name, last_name, date_of_birth, nationality,
  is_active, created_at
) values
  ('62000000-0000-4000-8100-000000000001', '62000000-0000-4000-8000-000000000001', 'staff', 'Alba', 'Staff', null, null, true, '2026-01-01T00:00:00Z'),
  ('62000000-0000-4000-8200-000000000001', '62000000-0000-4000-8000-000000000001', 'player', 'Amina', 'One', '2004-01-10', 'Syria', true, '2026-03-01T09:00:00Z'),
  ('62000000-0000-4000-8200-000000000002', '62000000-0000-4000-8000-000000000001', 'player', 'Berta', 'Two', '2005-02-10', 'Syria', true, '2026-03-29T00:30:00Z'),
  ('62000000-0000-4000-8200-000000000003', '62000000-0000-4000-8000-000000000001', 'player', 'Carla', 'Three', '2006-03-10', 'Syria', true, '2026-03-29T20:00:00Z'),
  ('62000000-0000-4000-8200-000000000004', '62000000-0000-4000-8000-000000000001', 'player', 'Dina', 'Four', '1994-01-10', 'Bolivia', true, '2026-03-30T08:00:00Z'),
  ('62000000-0000-4000-8200-000000000005', '62000000-0000-4000-8000-000000000001', 'player', 'Eva', 'Five', '1980-01-10', 'Bolivia', true, '2026-03-31T08:00:00Z'),
  ('62000000-0000-4000-8300-000000000001', '62000000-0000-4000-8000-000000000002', 'staff', 'Other', 'Staff', null, null, true, '2026-01-01T00:00:00Z'),
  ('62000000-0000-4000-8300-000000000002', '62000000-0000-4000-8000-000000000002', 'player', 'Other', 'Player', '2000-01-01', 'Other', true, '2026-03-30T08:00:00Z');

insert into public.collaborating_entities (id, org_id, name) values
  ('62000000-0000-4000-8400-000000000001', '62000000-0000-4000-8000-000000000001', 'Entity Alpha'),
  ('62000000-0000-4000-8400-000000000002', '62000000-0000-4000-8000-000000000001', 'Entity Beta');

insert into public.profiles (
  id, org_id, role, collaborating_entity_id, first_name, last_name, created_at
) values
  ('62000000-0000-4000-8100-000000000002', '62000000-0000-4000-8000-000000000001', 'entity', '62000000-0000-4000-8400-000000000001', 'Alpha', 'Contact', '2026-01-01T00:00:00Z'),
  ('62000000-0000-4000-8100-000000000003', '62000000-0000-4000-8000-000000000001', 'entity', '62000000-0000-4000-8400-000000000002', 'Beta', 'Contact', '2026-01-01T00:00:00Z');

insert into public.entity_referrals (
  id, org_id, entity_user_id, collaborating_entity_id, referred_profile_id,
  assigned_staff_id, referred_first_name, referred_last_name,
  documentation_status, status, created_at
) values
  ('62000000-0000-4000-8500-000000000001', '62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8100-000000000002', '62000000-0000-4000-8400-000000000001', '62000000-0000-4000-8200-000000000001', '62000000-0000-4000-8100-000000000001', 'Amina', 'One', 'complete', 'active', '2026-03-29T01:00:00Z'),
  ('62000000-0000-4000-8500-000000000002', '62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8100-000000000002', '62000000-0000-4000-8400-000000000001', '62000000-0000-4000-8200-000000000002', '62000000-0000-4000-8100-000000000001', 'Berta', 'Two', 'complete', 'active', '2026-03-29T02:00:00Z'),
  ('62000000-0000-4000-8500-000000000003', '62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8100-000000000002', '62000000-0000-4000-8400-000000000001', '62000000-0000-4000-8200-000000000003', '62000000-0000-4000-8100-000000000001', 'Carla', 'Three', 'complete', 'inactive', '2026-03-30T02:00:00Z'),
  ('62000000-0000-4000-8500-000000000004', '62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8100-000000000003', '62000000-0000-4000-8400-000000000002', '62000000-0000-4000-8200-000000000004', '62000000-0000-4000-8100-000000000001', 'Dina', 'Four', 'complete', 'active', '2026-03-30T03:00:00Z'),
  ('62000000-0000-4000-8500-000000000005', '62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8100-000000000003', '62000000-0000-4000-8400-000000000002', '62000000-0000-4000-8200-000000000005', '62000000-0000-4000-8100-000000000001', 'Eva', 'Five', 'complete', 'active', '2026-03-31T03:00:00Z');

insert into public.event_categories (id, org_id, name, icon, color, sort_order) values
  ('62000000-0000-4000-8600-000000000001', '62000000-0000-4000-8000-000000000001', '{"ca":"Entrenament","es":"Entrenamiento","en":"Training","ar":"تدريب","fa":"تمرین"}', 'dumbbell', 'primary', 1),
  ('62000000-0000-4000-8600-000000000002', '62000000-0000-4000-8000-000000000001', '{"ca":"Comunitat","es":"Comunidad","en":"Community","ar":"مجتمع","fa":"جامعه"}', 'users', 'secondary', 2);

insert into public.events (
  id, org_id, category_id, title, location, starts_at, ends_at,
  signup_mode, status, published_at, created_at
) values
  ('62000000-0000-4000-8700-000000000001', '62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8600-000000000001', '{"ca":"Abans","es":"Antes","en":"Before","ar":"قبل","fa":"قبل"}', 'Camp', '2026-03-28T22:59:00Z', '2026-03-28T23:59:00Z', 'none', 'published', '2026-03-01T00:00:00Z', '2026-03-01T00:00:00Z'),
  ('62000000-0000-4000-8700-000000000002', '62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8600-000000000001', '{"ca":"Entrenament","es":"Entrenamiento","en":"Training","ar":"تدريب","fa":"تمرین"}', 'Camp', '2026-03-28T23:30:00Z', '2026-03-29T00:30:00Z', 'none', 'published', '2026-03-01T00:00:00Z', '2026-03-01T00:00:00Z'),
  ('62000000-0000-4000-8700-000000000003', '62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8600-000000000002', '{"ca":"Comunitat","es":"Comunidad","en":"Community","ar":"مجتمع","fa":"جامعه"}', 'Sala', '2026-03-29T22:30:00Z', '2026-03-29T23:30:00Z', 'none', 'published', '2026-03-01T00:00:00Z', '2026-03-01T00:00:00Z'),
  ('62000000-0000-4000-8700-000000000004', '62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8600-000000000001', '{"ca":"Després","es":"Después","en":"After","ar":"بعد","fa":"بعد"}', 'Camp', '2026-03-31T22:00:00Z', '2026-03-31T23:00:00Z', 'none', 'published', '2026-03-01T00:00:00Z', '2026-03-01T00:00:00Z');

insert into public.forum_categories (id, org_id, name, slug, icon, color, sort_order)
values (
  '62000000-0000-4000-8800-000000000001',
  '62000000-0000-4000-8000-000000000001',
  '{"ca":"General","es":"General","en":"General","ar":"عام","fa":"عمومی"}',
  'rapp-62-general', 'users', 'primary', 1
);
insert into public.forum_posts (
  id, org_id, category_id, author_id, author_first_name, content, created_at
) values
  ('62000000-0000-4000-8900-000000000001', '62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8800-000000000001', '62000000-0000-4000-8200-000000000001', 'Amina', 'Primer missatge', '2026-03-29T10:00:00Z'),
  ('62000000-0000-4000-8900-000000000002', '62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8800-000000000001', '62000000-0000-4000-8200-000000000002', 'Berta', 'Segon missatge', '2026-03-30T10:00:00Z');
insert into public.forum_replies (
  id, org_id, post_id, author_id, author_first_name, content, created_at
) values
  ('62000000-0000-4000-8a00-000000000001', '62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8900-000000000001', '62000000-0000-4000-8200-000000000002', 'Berta', 'Primera resposta', '2026-03-30T11:00:00Z'),
  ('62000000-0000-4000-8a00-000000000002', '62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8900-000000000002', '62000000-0000-4000-8200-000000000003', 'Carla', 'Segona resposta', '2026-03-31T11:00:00Z');

set local role authenticated;
set local request.jwt.claims = '{"sub":"62000000-0000-4000-8100-000000000001","role":"authenticated"}';

insert into public.attendance (occurrence_id, player_id, status, marked_at)
select occurrence.id, fixture.player_id, fixture.status, fixture.marked_at
from public.event_occurrences as occurrence
join (
  values
    ('62000000-0000-4000-8700-000000000001'::uuid, '62000000-0000-4000-8200-000000000001'::uuid, 'present', '2026-03-28T23:10:00Z'::timestamptz),
    ('62000000-0000-4000-8700-000000000002'::uuid, '62000000-0000-4000-8200-000000000001'::uuid, 'present', '2026-03-29T01:00:00Z'::timestamptz),
    ('62000000-0000-4000-8700-000000000002'::uuid, '62000000-0000-4000-8200-000000000002'::uuid, 'absent', '2026-03-29T01:01:00Z'::timestamptz),
    ('62000000-0000-4000-8700-000000000002'::uuid, '62000000-0000-4000-8200-000000000003'::uuid, 'excused', '2026-03-29T01:02:00Z'::timestamptz),
    ('62000000-0000-4000-8700-000000000002'::uuid, '62000000-0000-4000-8200-000000000004'::uuid, 'present', '2026-03-29T01:03:00Z'::timestamptz),
    ('62000000-0000-4000-8700-000000000002'::uuid, '62000000-0000-4000-8200-000000000005'::uuid, 'present', '2026-03-29T01:04:00Z'::timestamptz),
    ('62000000-0000-4000-8700-000000000003'::uuid, '62000000-0000-4000-8200-000000000001'::uuid, 'present', '2026-03-30T01:00:00Z'::timestamptz),
    ('62000000-0000-4000-8700-000000000003'::uuid, '62000000-0000-4000-8200-000000000002'::uuid, 'present', '2026-03-30T01:01:00Z'::timestamptz),
    ('62000000-0000-4000-8700-000000000003'::uuid, '62000000-0000-4000-8200-000000000004'::uuid, 'absent', '2026-03-30T01:02:00Z'::timestamptz),
    ('62000000-0000-4000-8700-000000000004'::uuid, '62000000-0000-4000-8200-000000000001'::uuid, 'present', '2026-04-01T00:10:00Z'::timestamptz)
) as fixture(event_id, player_id, status, marked_at)
  on occurrence.event_id = fixture.event_id;

select is(
  (public.get_impact_report('2026-03-29', '2026-03-31', null, null) #>> '{summary,participant_count}')::integer,
  5,
  'the report counts the five participant profiles in its filtered cohort'
);
select is(
  (public.get_impact_report('2026-03-29', '2026-03-31', null, null) #>> '{summary,new_participant_count}')::integer,
  4,
  'new participant signups use the same inclusive Europe/Madrid report period'
);
select is(
  concat_ws(':',
    public.get_impact_report('2026-03-29', '2026-03-31', null, null) #>> '{summary,attendance_present_count}',
    public.get_impact_report('2026-03-29', '2026-03-31', null, null) #>> '{summary,attendance_eligible_count}',
    public.get_impact_report('2026-03-29', '2026-03-31', null, null) #>> '{summary,attendance_marked_count}',
    public.get_impact_report('2026-03-29', '2026-03-31', null, null) #>> '{summary,attendance_rate}'
  ),
  '5:7:8:71.43',
  'attendance is hand-computed and excludes excused marks from the denominator'
);
select is(
  (public.get_impact_report('2026-03-29', '2026-03-31', null, null) #>> '{summary,attendance_marked_count}')::integer,
  8,
  'DST-safe calendar bounds exclude the minute before March 29 and midnight after March 31'
);
select is(
  concat_ws(':',
    public.get_impact_report('2026-03-29', '2026-03-31', null, null) #>> '{forum_activity,post_count}',
    public.get_impact_report('2026-03-29', '2026-03-31', null, null) #>> '{forum_activity,reply_count}',
    public.get_impact_report('2026-03-29', '2026-03-31', null, null) #>> '{forum_activity,contributor_count}'
  ),
  '2:2:3',
  'forum activity counts posts, replies, and unique contributors'
);
select is(
  concat_ws(':',
    public.get_impact_report('2026-03-29', '2026-03-31', null, null) #>> '{referrals,referral_count}',
    public.get_impact_report('2026-03-29', '2026-03-31', null, null) #>> '{referrals,converted_count}',
    public.get_impact_report('2026-03-29', '2026-03-31', null, null) #>> '{referrals,conversion_rate}'
  ),
  '5:5:100.00',
  'referral totals and conversion rate share the report filters'
);
select is(
  jsonb_array_length(public.get_impact_report('2026-03-29', '2026-03-31', null, null) -> 'categories'),
  2,
  'the unfiltered report contains both participation categories'
);
select is(
  jsonb_array_length(public.get_impact_report('2026-03-29', '2026-03-31', null, null) #> '{available_filters,categories}'),
  2,
  'the report provides every organization category as a stable filter option'
);
select is(
  jsonb_array_length(public.get_impact_report('2026-03-29', '2026-03-31', null, '62000000-0000-4000-8400-000000000001') #> '{available_filters,entities}'),
  2,
  'filter options remain complete when one entity is selected'
);
select is(
  (select (category ->> 'attendance_rate')::numeric
   from jsonb_array_elements(public.get_impact_report('2026-03-29', '2026-03-31', null, null) -> 'categories') as category
   where category ->> 'category_id' = '62000000-0000-4000-8600-000000000001'),
  75.00::numeric,
  'the training category rate is hand-computed from its marked participants'
);
select is(
  (public.get_impact_report('2026-03-29', '2026-03-31', '62000000-0000-4000-8600-000000000002', null) #>> '{summary,participant_count}')::integer,
  3,
  'a category filter changes the full report cohort, not only the chart'
);
select is(
  concat_ws(':',
    public.get_impact_report('2026-03-29', '2026-03-31', null, '62000000-0000-4000-8400-000000000001') #>> '{summary,participant_count}',
    public.get_impact_report('2026-03-29', '2026-03-31', null, '62000000-0000-4000-8400-000000000001') #>> '{summary,attendance_rate}'
  ),
  '3:75.00',
  'the unsuppressed entity filter returns its hand-computed cohort and rate'
);
select is(
  (public.get_impact_report('2026-03-29', '2026-03-31', null, '62000000-0000-4000-8400-000000000002') #>> '{summary,suppressed}')::boolean,
  true,
  'an entity cohort smaller than three is suppressed'
);
select is(
  (select (bucket ->> 'count')::integer
   from jsonb_array_elements(public.get_impact_report('2026-03-29', '2026-03-31', null, null) #> '{demographics,nationalities}') as bucket
   where bucket ->> 'label' = 'Syria'),
  3,
  'a nationality bucket of three is visible'
);
select ok(
  (select (bucket ->> 'suppressed')::boolean and not (bucket ? 'count')
   from jsonb_array_elements(public.get_impact_report('2026-03-29', '2026-03-31', null, null) #> '{demographics,nationalities}') as bucket
   where bucket ->> 'label' = 'Bolivia'),
  'a nationality bucket below three keeps its label but suppresses its value'
);
select is(
  (select (bucket ->> 'count')::integer
   from jsonb_array_elements(public.get_impact_report('2026-03-29', '2026-03-31', null, null) #> '{demographics,age_bands}') as bucket
   where bucket ->> 'label' = '18-24'),
  3,
  'age bands use age at the report end date and reveal groups of at least three'
);
select is(
  jsonb_array_length(public.get_impact_report('2026-03-29', '2026-03-31', null, null) -> 'participant_trend'),
  1,
  'participant trend uses one monthly point for the selected three-day period'
);
select is(
  (public.get_impact_report('2026-03-29', '2026-03-31', '62000000-0000-4000-8600-000000000002', '62000000-0000-4000-8400-000000000001') #>> '{summary,suppressed}')::boolean,
  true,
  'combined category and entity filters suppress a two-person cohort'
);
select throws_ok(
  $$ select public.get_impact_report('2026-04-01', '2026-03-31', null, null) $$,
  '22007',
  'invalid impact report period',
  'a reversed period is rejected at the database boundary'
);

set local request.jwt.claims = '{"sub":"62000000-0000-4000-8100-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select public.get_impact_report('2026-03-29', '2026-03-31', null, null) $$,
  '42501',
  'impact reports require staff access',
  'DENIAL: an entity contact cannot execute the staff impact report'
);

set local request.jwt.claims = '{"sub":"62000000-0000-4000-8200-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select public.get_impact_report('2026-03-29', '2026-03-31', null, null) $$,
  '42501',
  'impact reports require staff access',
  'DENIAL: a player cannot execute the staff impact report'
);

set local request.jwt.claims = '{"sub":"62000000-0000-4000-8300-000000000001","role":"authenticated"}';
select is(
  (public.get_impact_report('2026-03-29', '2026-03-31', null, null) #>> '{summary,suppressed}')::boolean,
  true,
  'a staff member in another tenant receives only her one-person suppressed cohort'
);

reset role;
select * from finish();
rollback;
