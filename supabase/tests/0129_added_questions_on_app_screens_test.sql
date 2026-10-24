-- Fitxa fields placed on the app's own screens (RAPP-642, placements since RAPP-656).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. A field is placed on an app screen staff may move by its key; the
--      summary and the season authorization never take one, and a field is on
--      one onboarding screen at most.
--   2. The fields on an app screen are reordered with the placement writer.
--   3. The catalog carries each placement with its app screen key.
--   4. Only app screens and live Ramassà screens are steps of the flow.
--   5. A required placement keeps its app screen shown.
--   6. The export carries the app screen key of each placement.
--   7. The table refuses a screen key that is no app screen and no screen id.
--
-- Seed: admin ...001 of organization ...000.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(16);

create temp table run (label text primary key, id uuid) on commit drop;
grant all on run to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

insert into run (label, id)
select 'text', public.save_profile_field(
  null, (select id from public.profile_sections
          where org_id = '5eed0000-0000-4000-8000-000000000000' and key = 'support'),
  'short_text', '{"ca": "Qui t''acompanya?"}'::jsonb, null, 'personal');
insert into run (label, id)
select 'choice', public.save_profile_field(
  null, (select id from public.profile_sections
          where org_id = '5eed0000-0000-4000-8000-000000000000' and key = 'support'),
  'single_choice', '{"ca": "Horari"}'::jsonb, null, 'normal', false,
  '[{"label": {"ca": "Matí"}}, {"label": {"ca": "Tarda"}}]'::jsonb);

-- 1. Placing on an app screen ------------------------------------------------------------------------------

insert into run (label, id)
values ('text placement', public.place_field((select id from run where label = 'text'), 'onboarding', 'participation-support'));
insert into run (label, id)
values ('choice placement', public.place_field((select id from run where label = 'choice'), 'onboarding', 'participation-support'));

select isnt((select id from run where label = 'text placement'), null, 'a field is placed on an app screen by its key');
select isnt((select id from run where label = 'choice placement'), null, 'a choice field too');
select throws_ok(
  $$ select public.place_field((select id from run where label = 'text'), 'onboarding', 'summary') $$,
  'P0002', 'no such screen',
  'the summary never takes a field'
);
select throws_ok(
  $$ select public.place_field((select id from run where label = 'choice'), 'onboarding', 'authorization') $$,
  'P0002', 'no such screen',
  'nor does the season authorization'
);
select throws_ok(
  $$ select public.place_field((select id from run where label = 'text'), 'onboarding', 'equipment') $$,
  '23505', 'the field is already asked there',
  'a field is on one onboarding screen at most'
);

-- 2. Their order -------------------------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.field_placements p
     join public.profile_fields f on f.id = p.field_id and f.kind = 'custom'
    where p.org_id = '5eed0000-0000-4000-8000-000000000000' and p.surface = 'onboarding'
      and p.screen_key = 'participation-support'),
  2,
  'both fields are on the app screen, after its own'
);
select lives_ok(
  $$ select public.reorder_placements('onboarding', 'participation-support',
       array[(select id from run where label = 'choice placement'), (select id from run where label = 'text placement')]) $$,
  'and reordered'
);
select is(
  (select sort_order from public.field_placements where id = (select id from run where label = 'choice placement')),
  0,
  'in the order staff gave'
);

-- 3. The catalog -------------------------------------------------------------------------------------------

select is(
  (select p ->> 'screen_key'
     from jsonb_array_elements(public.intake_catalog() -> 'placements') p
    where (p ->> 'id')::uuid = (select id from run where label = 'text placement')),
  'participation-support',
  'the catalog names the app screen of a placement'
);
select is(
  (select count(*)::integer
     from jsonb_array_elements(public.intake_catalog() -> 'placements') p
    where p ->> 'surface' = 'onboarding' and p ->> 'screen_key' = 'participation-support'
      and (p ->> 'field_id')::uuid in (select id from run)),
  2,
  'with every field staff placed on it'
);

-- 4. The steps of the flow ---------------------------------------------------------------------------------

select throws_ok(
  $$ select public.save_intake_flow_order(array['identity', 'custom:00000000-0000-4000-8000-0000000006f9']) $$,
  '23514', 'not a step of this onboarding',
  'a screen id that is no live Ramassà screen is never a step'
);

-- 5. A required placement keeps the screen shown -------------------------------------------------------------

select lives_ok(
  $$ select public.save_builtin_screen('participation-support', '{}'::jsonb, true) $$,
  'an app screen with optional fields placed on it can be hidden'
);
select public.save_placement((select id from run where label = 'text placement'), true);
select is(
  (select (b ->> 'is_hidden')::boolean
     from jsonb_array_elements(public.intake_catalog() -> 'builtin_screens') b
    where b ->> 'screen' = 'participation-support'),
  false,
  'a required placement shows its screen again'
);
select throws_ok(
  $$ select public.save_builtin_screen('participation-support', '{}'::jsonb, true) $$,
  '23514', 'a screen with a required question, the summary or the terms cannot be hidden',
  'and the screen cannot be hidden while it is required'
);

-- 6. The export --------------------------------------------------------------------------------------------

select is(
  (select p ->> 'screen_key'
     from jsonb_array_elements(public.export_onboarding_setup(null) -> 'placements') p
    where (p ->> 'field_id')::uuid = (select id from run where label = 'text')),
  'participation-support',
  'the export carries the app screen key of a placement'
);

-- 7. The table's own guard ---------------------------------------------------------------------------------

reset role;
select throws_ok(
  $$ insert into public.field_placements (org_id, field_id, surface, screen_key, sort_order)
     values ('5eed0000-0000-4000-8000-000000000000', (select id from run where label = 'choice'),
             'season', null, 0),
            ('5eed0000-0000-4000-8000-000000000000', (select id from run where label = 'text'),
             'entity_form', 'summary', 0) $$,
  '23514', null,
  'a screen key is an app screen staff may move or a screen id, on her onboarding only'
);

select * from finish();
rollback;
