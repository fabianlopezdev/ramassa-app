-- The referral form on the form engine (RAPP-938).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Every organization has the referral form, a form of the engine with
--      one screen at first, and every field and block of the entity form
--      names one of its screens.
--   2. Installed phone builds read the entity form as before: in the
--      catalog its rows name no screen and keep one order across the
--      screens, and the referral form is not among the forms they list.
--   3. Staff add a screen, place a field and a signature block on it, order
--      a screen, and move a field from one screen to another. A field placed
--      with no screen goes on the first one.
--   4. The referral form keeps its rules: its screens always show and depend
--      on no answer, it is never published, its choices stay, and a screen
--      that asks her names is never deleted. Deleting another screen takes
--      its fields and blocks off the form.
--   5. The entity's referral is checked and stored as before: a required
--      field on any screen, a signature on every block, her answers by field.
--   6. The Onboarding setup file lists the entity form's fields without
--      screens, in one order.
--
-- The test builds its own organization: an admin ...001, an entity contact
-- ...004 and its entity ...e1.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(31);

insert into public.organizations (id, name, slug)
values ('93800000-0000-4000-8000-000000000000', 'Proves 938', 'proves-938');
insert into public.collaborating_entities (id, org_id, name)
values ('93800000-0000-4000-8000-0000000000e1', '93800000-0000-4000-8000-000000000000', 'Entitat 938');
insert into auth.users (id, email) values
  ('93800000-0000-4000-8000-000000000001', 'admin-938@example.test'),
  ('93800000-0000-4000-8000-000000000004', 'entity-938@example.test');
insert into public.profiles (id, org_id, role, first_name, last_name, collaborating_entity_id, terms_accepted_at)
values
  ('93800000-0000-4000-8000-000000000001', '93800000-0000-4000-8000-000000000000', 'admin', 'Admin', 'Prova',
   null, now()),
  ('93800000-0000-4000-8000-000000000004', '93800000-0000-4000-8000-000000000000', 'entity', 'Persona', 'Entitat',
   '93800000-0000-4000-8000-0000000000e1', now())
on conflict (id) do update
  set org_id = excluded.org_id, role = excluded.role, collaborating_entity_id = excluded.collaborating_entity_id;

create temporary table ids (key text primary key, id uuid) on commit drop;
grant all on ids to authenticated;
insert into ids select 'form', f.id from public.custom_forms f
 where f.org_id = '93800000-0000-4000-8000-000000000000' and f.system_key = 'entity_referral';
insert into ids select 'first', s.id from public.custom_form_screens s
 where s.form_id = (select id from ids where key = 'form') and not s.is_archived;

create function pg_temp.catalog(p_user uuid) returns jsonb language plpgsql as $$
declare
  result jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  result := public.intake_catalog();
  reset role;
  return result;
end;
$$;
create function pg_temp.field(p_key text) returns uuid language sql as $$
  select id from public.profile_fields
   where org_id = '93800000-0000-4000-8000-000000000000' and system_key = p_key;
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1. Every organization has the referral form -------------------------------------------------------------

select is((select count(*)::integer from ids where key in ('form', 'first')), 2,
          'a new organization gets the referral form with its first screen');
select results_eq(
  $$ select kind, filled_by, published_at is null from public.custom_forms where id = (select id from ids where key = 'form') $$,
  $$ values ('other', 'entity', true) $$,
  'it is filled in by the entity and never published');
select is(
  (select count(*)::integer from public.field_placements
    where org_id = '93800000-0000-4000-8000-000000000000' and surface = 'entity_form'
      and screen_key = (select id::text from ids where key = 'first')),
  (select count(*)::integer from public.field_placements
    where org_id = '93800000-0000-4000-8000-000000000000' and surface = 'entity_form'),
  'every field of the entity form is on its first screen');
select ok(
  (select count(*) from public.field_placements
    where org_id = '93800000-0000-4000-8000-000000000000' and surface = 'entity_form') > 0,
  'the new organization''s entity form asks its fields');
select throws_ok(
  $$ insert into public.field_placements (org_id, field_id, surface, screen_key, sort_order, required)
     values ('93800000-0000-4000-8000-000000000000', pg_temp.field('city'), 'entity_form', 'logistics', 0, false)
     on conflict do nothing $$,
  '23514', 'an entity form row names a screen of the referral form',
  'a row of the entity form names a screen of the referral form only');

-- 3. Staff build it -----------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "93800000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into ids select 'second', public.save_custom_form_screen(
  null, (select id from ids where key = 'form'), '{"ca": "La seva situació"}', null, null);
insert into ids select 'question', public.save_profile_field(
  null, (select s.id from public.profile_sections s
          where s.org_id = '93800000-0000-4000-8000-000000000000' order by s.sort_order limit 1),
  'short_text', '{"ca": "Com ens ha conegut?"}', null, 'normal', false, '[]', '{}');
insert into ids select 'placed', public.place_field(
  (select id from ids where key = 'question'), 'entity_form', (select id::text from ids where key = 'second'), true);
insert into ids select 'block', public.save_form_block(
  null, 'entity_form', (select id::text from ids where key = 'second'), '{"ca": "Confirmo les dades"}'::jsonb);
reset role;

select results_eq(
  $$ select screen_key, required from public.field_placements where id = (select id from ids where key = 'placed') $$,
  $$ values ((select id::text from ids where key = 'second'), true) $$,
  'a field goes on the screen staff picked, required as placed');
select is((select screen_key from public.form_blocks where id = (select id from ids where key = 'block')),
          (select id::text from ids where key = 'second'),
          'a signature block goes on the screen staff picked');
select throws_ok(
  format($$ select public.place_field(%L, 'custom_form', %L) $$,
         (select id from ids where key = 'question'), (select id from ids where key = 'second')),
  'P0002', 'no such screen', 'the referral form takes fields as the entity form only');

-- The catalog as an installed build reads it.
create temporary table seen on commit drop as
select pg_temp.catalog('93800000-0000-4000-8000-000000000004') as catalog;
select is(
  (select count(*)::integer from seen, jsonb_array_elements(catalog -> 'placements') p
    where p ->> 'surface' = 'entity_form' and p ->> 'screen_key' is not null)
  + (select count(*)::integer from seen, jsonb_array_elements(catalog -> 'blocks') b
      where b ->> 'surface' = 'entity_form' and b ->> 'screen_key' is not null),
  0, 'an installed build reads the entity form with no screen, as before');
select is(
  (select array_agg((p ->> 'sort_order')::integer order by (p ->> 'sort_order')::integer)
     from seen, jsonb_array_elements((catalog -> 'placements') || (catalog -> 'blocks')) p
    where p ->> 'surface' = 'entity_form'),
  (select array_agg(n) from generate_series(0, (
     select count(*)::integer - 1 from seen, jsonb_array_elements((catalog -> 'placements') || (catalog -> 'blocks')) p
      where p ->> 'surface' = 'entity_form')) n),
  'and in one order across the screens, every place once');
select ok(
  (select min((p ->> 'sort_order')::integer) from seen, jsonb_array_elements((catalog -> 'placements') || (catalog -> 'blocks')) p
    where p ->> 'id' in ((select id::text from ids where key = 'placed'), (select id::text from ids where key = 'block')))
  > (select max((p ->> 'sort_order')::integer) from seen, jsonb_array_elements(catalog -> 'placements') p
      where p ->> 'surface' = 'entity_form' and p ->> 'id' <> (select id::text from ids where key = 'placed')),
  'the second screen''s field and block come after the first screen''s fields');
select is(
  (select count(*)::integer from seen, jsonb_array_elements(catalog -> 'custom_forms') f
    where f ->> 'id' = (select id::text from ids where key = 'form')),
  0, 'the referral form is not among the forms an installed build lists');
select results_eq(
  $$ select s ->> 'id' from seen, jsonb_array_elements(catalog -> 'entity_form' -> 'screens') s $$,
  $$ values ((select id::text from ids where key = 'first')), ((select id::text from ids where key = 'second')) $$,
  'the catalog sends the referral form''s screens in order');
select is(
  (select i ->> 'screen_key' from seen, jsonb_array_elements(catalog -> 'entity_form' -> 'items') i
    where i ->> 'id' = (select id::text from ids where key = 'block')),
  (select id::text from ids where key = 'second'),
  'and the screen of each field and block');

-- Moving and ordering.
set local role authenticated;
set local request.jwt.claims = '{"sub": "93800000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  format($$ select public.place_field(%L, 'entity_form', %L) $$,
         pg_temp.field('city'), (select id from ids where key = 'second')),
  'a field asked on the first screen is added to the second');
select lives_ok(
  format($$ select public.reorder_custom_form_screens(%L, array[%L, %L]::uuid[]) $$,
         (select id from ids where key = 'form'), (select id from ids where key = 'second'),
         (select id from ids where key = 'first')),
  'the screens are reordered');
select throws_ok(
  format($$ select public.place_field(%L, 'entity_form') $$, (select id from ids where key = 'question')),
  '23505', 'the field is already asked there', 'a field is on the referral form once');
reset role;
select is(
  (select array_agg(screen_key) from public.field_placements
    where field_id = pg_temp.field('city') and surface = 'entity_form'),
  array[(select id::text from ids where key = 'second')],
  'it moves: one placement, on the second screen');
select is(
  (select (p ->> 'sort_order')::integer from jsonb_array_elements(
     pg_temp.catalog('93800000-0000-4000-8000-000000000004') -> 'placements') p
    where p ->> 'id' = (select id::text from ids where key = 'placed')),
  0, 'the screen moved first leads the one order an installed build reads');

-- 4. The rules of the referral form ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "93800000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  format($$ select public.set_screen_hidden(%L, true) $$, (select id from ids where key = 'first')),
  '23514', 'a screen of the referral form always shows', 'a screen of the referral form is never hidden');
select throws_ok(
  format($$ select public.publish_custom_form(%L, false, null) $$, (select id from ids where key = 'form')),
  '23514', null::text, 'the referral form is never published');
reset role;
select throws_ok(
  format($$ update public.custom_form_screens set show_when_field_id = %L, show_when_values = array['x'] where id = %L $$,
         pg_temp.field('applicant_status'), (select id from ids where key = 'first')),
  '23514', 'a screen of the referral form always shows', 'nor opens on an answer');
select throws_ok(
  format($$ update public.custom_forms set filled_by = 'player' where id = %L $$, (select id from ids where key = 'form')),
  '23514', 'the referral form keeps its choices; only its name changes', 'its choices stay');
set local role authenticated;
set local request.jwt.claims = '{"sub": "93800000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  format($$ select public.delete_builder_screen('custom_form', %L, array[%L]) $$,
         (select id from ids where key = 'first'), (select id from ids where key = 'first')),
  '23514', 'the entity form always asks her names', 'a screen that asks her names stays');
reset role;

-- 5. The entity's referral ---------------------------------------------------------------------------------

create function pg_temp.referral(p_answers jsonb, p_signatures jsonb) returns jsonb language sql as $$
  select jsonb_build_object('first_name', 'Hiba', 'last_name', 'Pantalles', 'documentationStatus', 'missing',
                            'consentConfirmed', true, 'answers', p_answers, 'signatures', p_signatures);
$$;
grant execute on function pg_temp.referral(jsonb, jsonb) to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub": "93800000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  format('select public.create_entity_referral(%L)', pg_temp.referral('{}', jsonb_build_object(
    (select id::text from ids where key = 'block'), '{"strokes": [[[1, 2], [3, 4]]], "language": "ca"}'::jsonb))),
  '23514', 'a required field of the referral form is missing',
  'a required field on another screen is still required');
select throws_ok(
  format('select public.create_entity_referral(%L)', pg_temp.referral(
    jsonb_build_object((select id::text from ids where key = 'question'), 'Una amiga'), '{}')),
  '23502', 'the referral needs a signature on every signature block',
  'a block on another screen is still signed');
insert into ids select 'referral', public.create_entity_referral(pg_temp.referral(
  jsonb_build_object((select id::text from ids where key = 'question'), 'Una amiga'),
  jsonb_build_object((select id::text from ids where key = 'block'),
                     '{"strokes": [[[1, 2], [3, 4]]], "language": "ca"}'::jsonb)));
reset role;
select is(
  (select public.decrypt_field(a.value_encrypted)::jsonb from public.referral_custom_answers a
    where a.referral_id = (select id from ids where key = 'referral')
      and a.question_id = (select id from ids where key = 'question')),
  '"Una amiga"'::jsonb, 'her answer is stored with the referral, as before');
select is(
  (select signer_kind from public.form_signatures where referral_id = (select id from ids where key = 'referral')),
  'entity', 'and the entity''s signature');

-- Deleting a screen without her names.
set local role authenticated;
set local request.jwt.claims = '{"sub": "93800000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  format($$ select public.delete_builder_screen('custom_form', %L, array[%L]) $$,
         (select id from ids where key = 'second'), (select id from ids where key = 'second')),
  'a screen that does not ask her names is deleted');
reset role;
select is(
  (select count(*)::integer from public.field_placements where org_id = '93800000-0000-4000-8000-000000000000'
     and surface = 'entity_form' and screen_key = (select id::text from ids where key = 'second'))
  + (select count(*)::integer from public.form_blocks where org_id = '93800000-0000-4000-8000-000000000000'
       and surface = 'entity_form' and screen_key = (select id::text from ids where key = 'second')),
  0, 'its fields and block leave the referral form');

-- 6. The setup file --------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "93800000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select count(*)::integer from jsonb_array_elements(public.export_onboarding_setup() -> 'placements') p
    where p ->> 'surface' = 'entity_form' and p ->> 'screen_key' is not null),
  0, 'the setup file lists the entity form''s fields without screens');
reset role;

select * from finish();
rollback;
