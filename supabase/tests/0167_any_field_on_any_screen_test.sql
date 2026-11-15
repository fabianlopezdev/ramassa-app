-- Any field on any screen (RAPP-782, decision of 2026-11-06).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. A field on another Onboarding screen moves to the screen it is added
--      to, in one call: same placement, same wording and required flag, one
--      placement only, audited against the field. Her answers stay.
--   2. Placing a field on the screen it is on changes nothing.
--   3. A field that shows only after an answer moves together with the
--      question it depends on, whichever of the two is added; a condition on
--      a follow-up that opens on that question stays on its follow-up.
--   4. Nom and Cognoms move to any Onboarding screen, are never removed from
--      her Onboarding nor moved onto a hidden screen, and stay off the season.
--   5. A field on several document follow-ups keeps one placement when it
--      moves to an ordinary screen.
--   6. A field moved onto a hidden screen becomes optional.
--   7. A screen that opens on an answer to a moved question moves right after
--      its new screen; a question never moves onto a screen that depends on it.
--   8. On a form, the legal forms included, a field moves between its screens,
--      her names too, and a consent moves the same way.
--   9. One screen can hold every field of her Onboarding.
--
-- Seed: admin ...001 of organization ...000.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(37);

create temp table run (label text primary key, id uuid, txt text) on commit drop;
grant all on run to authenticated;

create function pg_temp.field(p_key text) returns uuid language sql as $$
  select id from public.profile_fields
   where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = p_key;
$$;
create function pg_temp.screens_of(p_field uuid) returns text[] language sql as $$
  select array_agg(screen_key order by screen_key) from public.field_placements
   where field_id = p_field and surface = 'onboarding';
$$;

insert into run (label, txt)
select 'answers', (select count(*)::text from public.custom_answers
                    where question_id in (select id from public.profile_fields
                                        where org_id = '5eed0000-0000-4000-8000-000000000000'));
insert into run (label, id) values
  ('transport', '5eed0000-0000-4000-8045-000000000001'),
  ('screen 1', '5eed0000-0000-4000-8044-000000000001'),
  ('screen 3', '5eed0000-0000-4000-8044-000000000003'),
  ('obstacle', (select show_when_field_id from public.profile_fields
                 where id = '5eed0000-0000-4000-8045-000000000003')),
  ('obstacle detail', '5eed0000-0000-4000-8045-000000000003');
insert into run (label, id)
select 'transport placement', id from public.field_placements
 where field_id = (select id from run where label = 'transport') and surface = 'onboarding';
update public.field_placements
   set label_override = '{"ca": "Com véns?"}', required = true
 where id = (select id from run where label = 'transport placement');

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

-- 1. A field moves to the screen it is added to ------------------------------------------------------------

select is(
  public.place_field((select id from run where label = 'transport'), 'onboarding', 'background'),
  (select id from run where label = 'transport placement'),
  'adding a field asked on another screen moves its placement'
);
reset role;
select is(
  pg_temp.screens_of((select id from run where label = 'transport')),
  array['background'],
  'it is asked on the new screen only'
);
select is(
  (select (label_override ->> 'ca') || ' ' || required::text from public.field_placements
    where id = (select id from run where label = 'transport placement')),
  'Com véns? true',
  'with its wording and its required flag'
);
select is(
  (select sort_order from public.field_placements where id = (select id from run where label = 'transport placement')),
  (select max(sort_order) from public.field_placements
    where org_id = '5eed0000-0000-4000-8000-000000000000' and surface = 'onboarding' and screen_key = 'background'),
  'after the fields already there'
);
select is(
  (select changes ->> 'from' || ' > ' || (changes ->> 'to') from public.audit_log
    where action = 'intake.field_move' and target_id = (select id from run where label = 'transport')),
  (select id::text from run where label = 'screen 1') || ' > background',
  'the move is audited against the field'
);

-- 2. Placing a field where it is changes nothing -----------------------------------------------------------

set local role authenticated;
select is(
  public.place_field((select id from run where label = 'transport'), 'onboarding', 'background'),
  (select id from run where label = 'transport placement'),
  'placing a field on its own screen returns its placement'
);
reset role;
select is(
  (select count(*)::integer from public.audit_log
    where action in ('intake.field_move', 'intake.field_place')
      and target_id = (select id from run where label = 'transport')),
  1,
  'and records nothing new'
);

-- 3. A condition moves with its question -------------------------------------------------------------------

set local role authenticated;
select lives_ok(
  format($$ select public.place_field(%L, 'onboarding', 'identity') $$,
         (select id from run where label = 'obstacle detail')),
  'adding a condition moves the question it depends on too'
);
reset role;
select is(
  pg_temp.screens_of((select id from run where label = 'obstacle')) || pg_temp.screens_of((select id from run where label = 'obstacle detail')),
  array['identity', 'identity'],
  'both are asked on the new screen'
);
select ok(
  (select a.sort_order < b.sort_order
     from public.field_placements a, public.field_placements b
    where a.field_id = (select id from run where label = 'obstacle') and a.surface = 'onboarding'
      and b.field_id = (select id from run where label = 'obstacle detail') and b.surface = 'onboarding'),
  'the question comes before its condition'
);
set local role authenticated;
select lives_ok(
  format($$ select public.place_field(%L, 'onboarding', 'logistics') $$,
         (select id from run where label = 'obstacle')),
  'adding the question moves its condition along'
);
reset role;
select is(
  pg_temp.screens_of((select id from run where label = 'obstacle detail')),
  array['logistics'],
  'the condition follows its question'
);
set local role authenticated;
select lives_ok(
  $$ select public.place_field(pg_temp.field('has_dependents'), 'onboarding', 'equipment') $$,
  'an app question with a condition moves'
);
select lives_ok(
  $$ select public.place_field(pg_temp.field('document_type'), 'onboarding', 'identity') $$,
  'Tipus de document moves to the first screen'
);
reset role;
select is(
  pg_temp.screens_of(pg_temp.field('num_dependents')),
  array['equipment'],
  'its condition came along'
);
select is(
  pg_temp.screens_of(pg_temp.field('document_name')),
  array['documentation-other'],
  'Nom del document stays on Un altre, which opens on the answer to Tipus de document'
);

-- 4. Her names ---------------------------------------------------------------------------------------------

update public.intake_screens set is_hidden = true where id = '5eed0000-0000-4000-8044-000000000002';

set local role authenticated;
select lives_ok(
  $$ select public.place_field(pg_temp.field('first_name'), 'onboarding', 'logistics') $$,
  'Nom moves to another screen'
);
reset role;
select is(pg_temp.screens_of(pg_temp.field('first_name')), array['logistics'], 'and is asked there');
set local role authenticated;
select throws_ok(
  format($$ select public.remove_placement(%L) $$,
         (select id from public.field_placements where field_id = pg_temp.field('first_name') and surface = 'onboarding')),
  '23514', 'her onboarding always asks her names',
  'her names are never taken off her Onboarding'
);
select throws_ok(
  $$ select public.place_field(pg_temp.field('last_name'), 'season') $$,
  '23514', 'her names are asked on her onboarding, the entity form and her forms',
  'nor put on the season'
);
select throws_ok(
  $$ select public.place_field(pg_temp.field('last_name'), 'onboarding', '5eed0000-0000-4000-8044-000000000002') $$,
  '23514', 'her onboarding always asks her names',
  'nor moved onto a hidden screen'
);

-- 5. A shared follow-up field keeps one placement ----------------------------------------------------------

select lives_ok(
  $$ select public.place_field(pg_temp.field('document_number'), 'onboarding', 'background') $$,
  'Número de document moves off the three document follow-ups'
);
reset role;
select is(pg_temp.screens_of(pg_temp.field('document_number')), array['background'], 'with one placement');

-- 6. A hidden screen -------------------------------------------------------------------------------------

set local role authenticated;
select lives_ok(
  $$ select public.place_field(pg_temp.field('date_of_birth'), 'onboarding', '5eed0000-0000-4000-8044-000000000002') $$,
  'a required field moves onto a hidden screen'
);
reset role;
select is(
  (select required from public.field_placements where field_id = pg_temp.field('date_of_birth') and surface = 'onboarding'),
  false,
  'where it is optional'
);

-- 7. A screen that depends on a question -----------------------------------------------------------------

-- Screen 3 opens on Tens persones al teu càrrec?, now asked on Equipament.
update public.intake_screens
   set show_when_field_id = pg_temp.field('has_dependents'),
       show_when_values = array[(select o.id::text from public.custom_question_options o
                                   where o.question_id = pg_temp.field('has_dependents') limit 1)]
 where id = (select id from run where label = 'screen 3');
set local role authenticated;
select throws_ok(
  format($$ select public.place_field(pg_temp.field('has_dependents'), 'onboarding', %L) $$,
         (select id::text from run where label = 'screen 3')),
  '23514', 'a screen cannot depend on a question asked on it',
  'a question never moves onto a screen that depends on it'
);
select lives_ok(
  $$ select public.place_field(pg_temp.field('has_dependents'), 'onboarding', 'identity') $$,
  'a question a screen depends on moves to another screen'
);
reset role;
select is(
  (select step_order[array_position(step_order, 'identity') + 1] from public.intake_flow_orders
    where org_id = '5eed0000-0000-4000-8000-000000000000'),
  'custom:' || (select id::text from run where label = 'screen 3'),
  'and the screen that depends on it moves right after its new screen, in the stored order'
);

-- 8. Forms, the legal ones included -----------------------------------------------------------------------

insert into run (label, id)
select 'health', id from public.profile_fields
 where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = 'health_info';
insert into run (label, id)
select 'authorization screen 2', s.id from public.custom_form_screens s
  join public.custom_forms f on f.id = s.form_id
 where f.org_id = '5eed0000-0000-4000-8000-000000000000' and f.system_key = 'season_authorization'
   and s.sort_order = 2 and not s.is_archived;
insert into run (label, id)
select 'health placement', p.id from public.field_placements p
 where p.field_id = (select id from run where label = 'health') and p.surface = 'custom_form';
select is(
  public.place_field((select id from run where label = 'health'), 'custom_form',
                     (select id::text from run where label = 'authorization screen 2')),
  (select id from run where label = 'health placement'),
  'on the season authorization a field moves to another of its screens'
);
reset role;
select is(
  (select screen_key from public.field_placements where id = (select id from run where label = 'health placement')),
  (select id::text from run where label = 'authorization screen 2'),
  'and is asked there'
);
select is(
  (select count(*)::integer from public.audit_log
    where action = 'intake.field_move' and target_id = (select id from run where label = 'health')
      and changes ->> 'custom_form' is not null),
  1,
  'audited with its form'
);

select lives_ok(
  format($$ select public.place_field(pg_temp.field('first_name'), 'custom_form', %L) $$,
         (select id::text from run where label = 'authorization screen 2')),
  'her names go on a form too'
);
insert into run (label, id)
select 'consent', c.consent_id from public.consent_placements c
 where c.custom_form_id = (select form_id from public.custom_form_screens
                            where id = (select id from run where label = 'authorization screen 2'))
   and c.screen_key <> (select id::text from run where label = 'authorization screen 2')
   and not exists (select 1 from public.consents k where k.id = c.consent_id and k.key = 'app_terms')
 limit 1;
set local role authenticated;
select lives_ok(
  format($$ select public.place_consent(%L, 'custom_form', %L) $$,
         (select id from run where label = 'consent'),
         (select id::text from run where label = 'authorization screen 2')),
  'a consent on another screen of the form moves here'
);
reset role;
select is(
  (select count(*)::integer from public.consent_placements
    where consent_id = (select id from run where label = 'consent')
      and screen_key = (select id::text from run where label = 'authorization screen 2')),
  1,
  'and is asked there once'
);

-- 9. One screen holds every field ------------------------------------------------------------------------

-- Controllers first, as the picker sends them.
insert into run (label, txt)
select 'every field', array_agg(field_id order by depth, field_id)::text
  from (select distinct p.field_id, private.field_condition_depth(p.field_id) as depth
          from public.field_placements p
         where p.org_id = '5eed0000-0000-4000-8000-000000000000' and p.surface = 'onboarding') p;
set local role authenticated;
select lives_ok(
  $$ do $do$
     declare
       each_id uuid;
     begin
       foreach each_id in array (select txt::uuid[] from run where label = 'every field') loop
         perform public.place_field(each_id, 'onboarding', 'identity');
       end loop;
     end $do$ $$,
  'every field of her Onboarding is added to the first screen'
);
reset role;
select is(
  (select array_agg(distinct screen_key order by screen_key) from public.field_placements
    where org_id = '5eed0000-0000-4000-8000-000000000000' and surface = 'onboarding'
      and screen_key not in ('documentation-nie', 'documentation-passport', 'documentation-other',
                             'applicant-status-details')),
  array['identity'],
  'and the first screen holds them all (a condition on a follow-up of its question stays there)'
);
select is(
  (select count(*)::text from public.custom_answers
    where question_id in (select id from public.profile_fields
                        where org_id = '5eed0000-0000-4000-8000-000000000000')),
  (select txt from run where label = 'answers'),
  'no answer moved or vanished'
);

select * from finish();
rollback;
