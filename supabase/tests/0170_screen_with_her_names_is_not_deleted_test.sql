-- A screen that asks her names is never deleted (RAPP-785).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. The Nom screen is not deleted while it asks her names, and keeps them.
--   2. Once Nom and Cognoms move to another screen, the Nom screen is
--      deleted, and the screen they moved to is the one that stays.
--   3. A screen whose dependent screen asks her names is not deleted either:
--      the delete would take the dependent screen, and her names, with it.
--   4. Once her names move off the family, the family is deleted.
--
-- Seed: admin ...001 of organization ...000.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(9);

create temp table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;

create function pg_temp.field(p_key text) returns uuid language sql as $$
  select id from public.profile_fields
   where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = p_key;
$$;
create function pg_temp.screens_of(p_field uuid) returns text[] language sql as $$
  select array_agg(screen_key order by screen_key) from public.field_placements
   where field_id = p_field and surface = 'onboarding';
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';

-- 1. The Nom screen asks her names ------------------------------------------------------------------------

select throws_ok(
  $$ select public.delete_builder_screen('onboarding', 'identity', array['identity']) $$,
  '23514',
  'her onboarding always asks her names',
  'the screen that asks her names is not deleted'
);
select is(pg_temp.screens_of(pg_temp.field('first_name')), array['identity'], 'Nom stays on it');

-- 2. Her names moved to another screen --------------------------------------------------------------------

select public.place_field(pg_temp.field('first_name'), 'onboarding', 'logistics');
select public.place_field(pg_temp.field('last_name'), 'onboarding', 'logistics');
select lives_ok(
  $$ select public.delete_builder_screen('onboarding', 'identity', array['identity']) $$,
  'the Nom screen is deleted once her names asked elsewhere'
);
select is(pg_temp.screens_of(pg_temp.field('last_name')), array['logistics'], 'Cognoms stays on Onboarding');
select throws_ok(
  $$ select public.delete_builder_screen('onboarding', 'logistics', array['logistics']) $$,
  '23514',
  'her onboarding always asks her names',
  'the screen her names moved to is not deleted'
);

-- 3. Her names on a screen that depends on another -------------------------------------------------------

insert into ids values
  ('parent', public.save_intake_screen(null, '{"ca":"Primer"}'::jsonb, null, 'season')),
  ('child', public.save_intake_screen(null, '{"ca":"Segon"}'::jsonb, null, 'season'));
insert into ids values ('question', public.save_profile_field(
  null, (select id from public.profile_sections
          where org_id = '5eed0000-0000-4000-8000-000000000000' and key = 'support'),
  'yes_no', '{"ca":"Pregunta"}'::jsonb, null, 'normal', false));
select public.place_field((select id from ids where name = 'question'), 'onboarding',
                          (select id::text from ids where name = 'parent'));
select public.save_screen_condition((select id from ids where name = 'child'),
                                    (select id from ids where name = 'question'), array['yes']);
select public.place_field(pg_temp.field('first_name'), 'onboarding',
                          (select id::text from ids where name = 'child'));

select throws_ok(
  format($$ select public.delete_builder_screen('onboarding', %L, array[%L, %L]) $$,
         'custom:' || (select id from ids where name = 'parent'),
         'custom:' || (select id from ids where name = 'parent'),
         'custom:' || (select id from ids where name = 'child')),
  '23514',
  'her onboarding always asks her names',
  'a screen whose dependent screen asks her names is not deleted'
);
select ok(
  not (select is_archived from public.intake_screens where id = (select id from ids where name = 'child')),
  'the dependent screen stays'
);

-- 4. Her names moved off the family -----------------------------------------------------------------------

select public.place_field(pg_temp.field('first_name'), 'onboarding', 'logistics');
select lives_ok(
  format($$ select public.delete_builder_screen('onboarding', %L, array[%L, %L]) $$,
         'custom:' || (select id from ids where name = 'parent'),
         'custom:' || (select id from ids where name = 'parent'),
         'custom:' || (select id from ids where name = 'child')),
  'the family is deleted once her names asked elsewhere'
);
select is(pg_temp.screens_of(pg_temp.field('first_name')), array['logistics'], 'and Nom stays on Onboarding');

select * from finish();
rollback;
