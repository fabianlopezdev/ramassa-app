-- Fields and placements: the player profile layout (RAPP-649).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. The copy kept every id: each seeded question is a custom field with the
--      same id, the answers' foreign keys point at the fields, and the
--      placements say where each is asked (the view is gone since RAPP-656).
--   2. Every organization has the seven sections and the built-in fields,
--      placed where the app asks them.
--   3. A Ramassà field placed on an app screen is asked there; a required one
--      keeps that screen shown.
--   4. The entity form and the season are surfaces like onboarding.
--   5. A field with no placement is the team's only: her onboarding never
--      takes an answer to it, and it has no placement.
--   6. Privacy reads are unchanged: a Sensitive answer needs
--      participants.view_sensitive, a Personal one participants.view_personal.
--   7. Nobody but the designers writes the layout: anon and players are
--      refused, and the onboarding design role creates and places fields.
--
-- Seed: admin ...001, staff ...002, designer ...097 and player ...011 of
-- organization ...000; the seeded questions ...8045-000000000001 to 5.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(25);

create temp table run (label text primary key, id uuid) on commit drop;
grant all on run to authenticated;

-- 1. The copy kept every id ----------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.profile_fields
    where kind = 'custom' and id in ('5eed0000-0000-4000-8045-000000000001', '5eed0000-0000-4000-8045-000000000002',
                                     '5eed0000-0000-4000-8045-000000000003', '5eed0000-0000-4000-8045-000000000004',
                                     '5eed0000-0000-4000-8045-000000000005')),
  5,
  'every seeded question is a custom field with the same id'
);
select is(
  (select array_agg(distinct confrelid::regclass::text order by confrelid::regclass::text)
     from pg_constraint
    where conname in ('custom_answers_question_id_fkey', 'custom_question_options_question_id_fkey',
                      'referral_custom_answers_question_id_fkey', 'custom_question_states_question_id_fkey')),
  array['profile_fields'],
  'answers, options, referral answers and per-player choices point at the fields'
);
select hasnt_view('public', 'custom_questions', 'the old question shape is gone');
select results_eq(
  $$ select array(select p.surface from public.field_placements p where p.field_id = f.id order by p.surface)
       from public.profile_fields f
      where f.id in ('5eed0000-0000-4000-8045-000000000001', '5eed0000-0000-4000-8045-000000000004',
                     '5eed0000-0000-4000-8045-000000000005')
      order by f.id $$,
  -- The seeded forms the team created ask the first two too (RAPP-700).
  $$ values (array['custom_form', 'entity_form', 'onboarding']), (array['custom_form']), (array['onboarding', 'season']) $$,
  'the placements say where each field is asked'
);
select is(
  (select s.key from public.profile_fields f join public.profile_sections s on s.id = f.section_id
    where f.id = '5eed0000-0000-4000-8045-000000000004'),
  'support',
  'a team-only field sits in its Fitxa section'
);

-- 2. Sections and built-in fields ------------------------------------------------------------------------

select results_eq(
  $$ select key from public.profile_sections where org_id = '5eed0000-0000-4000-8000-000000000000' order by sort_order $$,
  $$ values ('identity'), ('contact'), ('origin'), ('sizes'), ('situation'), ('health_needs'), ('support') $$,
  'seven sections in the order the team reads a profile'
);
select is(
  (select count(*)::integer from public.profile_fields
    where org_id = '5eed0000-0000-4000-8000-000000000000' and kind = 'builtin'),
  cardinality(private.system_field_keys()),
  'every app field is a built-in field (the composite questions split since RAPP-660)'
);
select results_eq(
  $$ select f.system_key, f.privacy from public.profile_fields f
      where f.org_id = '5eed0000-0000-4000-8000-000000000000'
        and f.system_key in ('first_name', 'date_of_birth', 'phone', 'specific_needs')
      order by f.system_key $$,
  $$ values ('date_of_birth', 'personal'), ('first_name', 'normal'), ('phone', 'sensitive'),
            ('specific_needs', 'sensitive') $$,
  'with the level the database fixes for their columns'
);
select is(
  (select p.screen_key from public.field_placements p
     join public.profile_fields f on f.id = p.field_id
    where f.org_id = '5eed0000-0000-4000-8000-000000000000' and f.system_key = 'clothing_size'
      and p.surface = 'onboarding'),
  'equipment',
  'and placed on the screen the app asks them on'
);

-- 3. A Ramassà field on an app screen ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into run (label, id)
select 'gloves', public.save_profile_field(
  null, (select id from public.profile_sections where org_id = '5eed0000-0000-4000-8000-000000000000' and key = 'sizes'),
  'short_text', '{"ca": "Talla de guants"}'::jsonb, null, 'normal', true);
insert into run (label, id)
select 'gloves_on_equipment', public.place_field((select id from run where label = 'gloves'), 'onboarding', 'equipment');

select ok(
  exists (select 1 from jsonb_array_elements(public.intake_catalog() -> 'placements') p
           where p ->> 'field_id' = (select id::text from run where label = 'gloves')
             and p ->> 'screen_key' = 'equipment' and (p ->> 'required')::boolean),
  'the designer creates a field and places it on an app screen, required as its default'
);
reset role;
select is(
  private.builtin_screen_hideable('equipment'),
  false,
  'a required field on an app screen keeps that screen shown'
);
select is(
  (select created_by from public.profile_fields where id = (select id from run where label = 'gloves')),
  '5eed0000-0000-4000-8000-000000000097'::uuid,
  'the field records who created it'
);
set local role authenticated;
select throws_ok(
  $$ select public.place_field((select id from run where label = 'gloves'), 'onboarding', 'identity') $$,
  '23505', 'the field is already asked there',
  'a field is on one onboarding screen only'
);

-- 4. The entity form and the season ----------------------------------------------------------------------

select lives_ok(
  $$ select public.place_field((select id from run where label = 'gloves'), 'entity_form') $$,
  'the field goes on the entity form'
);
select lives_ok(
  $$ select public.place_field((select id from run where label = 'gloves'), 'season', null, false) $$,
  'and on the season re-registration'
);
select is(
  array(select surface from public.field_placements
         where field_id = (select id from run where label = 'gloves') order by surface),
  array['entity_form', 'onboarding', 'season'],
  'the field is placed on the three surfaces'
);
select throws_ok(
  $$ select public.place_field((select id from public.profile_fields where system_key = 'first_name'
                                  and org_id = '5eed0000-0000-4000-8000-000000000000'), 'season') $$,
  '23514', 'her names are asked on her identity screen',
  'her names stay on her identity screen (RAPP-665)'
);

-- 5. A team-only field -----------------------------------------------------------------------------------------

insert into run (label, id)
select 'team_note', public.save_profile_field(
  null, (select id from public.profile_sections where org_id = '5eed0000-0000-4000-8000-000000000000' and key = 'support'),
  'short_text', '{"ca": "Nota de l''equip"}'::jsonb, null, 'personal');
select is(
  (select count(*)::integer from public.field_placements
    where field_id = (select id from run where label = 'team_note')),
  0,
  'a field with no placement is the team''s only'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  format($$ select public.save_my_custom_answers(jsonb_build_object('%s', 'Hola')) $$,
         (select id from run where label = 'team_note')),
  '42501', 'not a question she is asked',
  'her onboarding never takes an answer to it'
);

-- 6. Privacy reads unchanged ----------------------------------------------------------------------------------

reset role;
delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000002' and permission_code = 'participants.view_sensitive';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select ok(
  not exists (select 1 from public.participant_custom_answers('5eed0000-0000-4000-8000-000000000011')
               where question_id = '5eed0000-0000-4000-8045-000000000003'),
  'a Sensitive answer stays hidden without participants.view_sensitive'
);
select ok(
  exists (select 1 from public.participant_custom_answers('5eed0000-0000-4000-8000-000000000011')
           where question_id = '5eed0000-0000-4000-8045-000000000001'),
  'a Normal answer still reads'
);

-- 7. Nobody else writes the layout --------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$ select public.save_profile_field(null, (select id from public.profile_sections limit 1), 'short_text',
       '{"ca": "Intrusa"}'::jsonb, null, 'normal') $$,
  '42501', null::text,
  'a player cannot create a field'
);
select throws_ok(
  $$ insert into public.field_placements (org_id, field_id, surface, sort_order)
     values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8045-000000000004', 'entity_form', 0) $$,
  '42501', null::text,
  'nobody writes the placements directly'
);
reset role;
set local role anon;
select throws_ok(
  $$ select count(*) from public.profile_fields $$,
  '42501', null::text,
  'anon reads no field'
);
select throws_ok(
  $$ select public.save_profile_section(null, '{"ca": "Anònima"}'::jsonb) $$,
  '42501', null::text,
  'and creates no section'
);
reset role;

select * from finish();
rollback;
