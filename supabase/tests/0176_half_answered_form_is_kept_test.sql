-- A half-answered form is kept, so its card says "Continua" (RAPP-886).
-- Run with: bunx supabase test db
--
-- What these assertions defend: her answers so far to a form are kept on the
-- server, encrypted, for her alone. The team never reads them and its lists
-- keep the ask pending. Sending, deleting, a withdrawn form and erasure remove
-- them; putting the form off keeps them; a new version keeps only the answers
-- to fields the form still asks.
--
-- The test builds its own organization, so it needs no seed: an admin ...001,
-- a player ...011 and another player ...012.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(35);

insert into public.organizations (id, name, slug)
values ('88600000-0000-4000-8000-000000000000', 'Proves 886', 'proves-886');
insert into auth.users (id, email) values
  ('88600000-0000-4000-8000-000000000001', 'admin-886@example.test'),
  ('88600000-0000-4000-8000-000000000011', 'player-886@example.test'),
  ('88600000-0000-4000-8000-000000000012', 'other-player-886@example.test');
insert into public.profiles (id, org_id, role, first_name, last_name, is_test_account, terms_accepted_at)
values
  ('88600000-0000-4000-8000-000000000001', '88600000-0000-4000-8000-000000000000', 'admin', 'Admin', 'Prova', false, now()),
  ('88600000-0000-4000-8000-000000000011', '88600000-0000-4000-8000-000000000000', 'player', 'Jugadora', 'Una', false, now()),
  ('88600000-0000-4000-8000-000000000012', '88600000-0000-4000-8000-000000000000', 'player', 'Jugadora', 'Dues', false, now())
on conflict (id) do update
  set org_id = excluded.org_id, role = excluded.role, is_test_account = excluded.is_test_account;

-- Three optional forms. The first has two screens: a Normal field on the
-- first, a Sensitive one on the second. A field on no form is ...0f3.
insert into public.profile_sections (id, org_id, key, title, sort_order)
values ('88600000-0000-4000-8886-000000000001', '88600000-0000-4000-8000-000000000000',
        'proves', '{"ca": "Proves"}', 0);
insert into public.profile_fields (id, org_id, section_id, kind, question_type, label, privacy)
values
  ('88600000-0000-4000-8886-0000000000f1', '88600000-0000-4000-8000-000000000000',
   '88600000-0000-4000-8886-000000000001', 'custom', 'short_text', '{"ca": "Parada de metro"}', 'normal'),
  ('88600000-0000-4000-8886-0000000000f2', '88600000-0000-4000-8000-000000000000',
   '88600000-0000-4000-8886-000000000001', 'custom', 'short_text', '{"ca": "Número del document"}', 'sensitive'),
  ('88600000-0000-4000-8886-0000000000f3', '88600000-0000-4000-8000-000000000000',
   '88600000-0000-4000-8886-000000000001', 'custom', 'short_text', '{"ca": "Una altra"}', 'normal');
insert into public.custom_forms (id, org_id, name, filled_by, audience)
select ('88600000-0000-4000-8887-00000000000' || n)::uuid, '88600000-0000-4000-8000-000000000000',
       jsonb_build_object('ca', 'Formulari ' || n), 'player', 'chosen'
  from generate_series(1, 3) as n;
insert into public.custom_form_screens (id, org_id, form_id, title, sort_order)
values
  ('88600000-0000-4000-8888-000000000011', '88600000-0000-4000-8000-000000000000',
   '88600000-0000-4000-8887-000000000001', '{"ca": "On vius"}', 0),
  ('88600000-0000-4000-8888-000000000012', '88600000-0000-4000-8000-000000000000',
   '88600000-0000-4000-8887-000000000001', '{"ca": "El document"}', 1),
  ('88600000-0000-4000-8888-000000000021', '88600000-0000-4000-8000-000000000000',
   '88600000-0000-4000-8887-000000000002', '{"ca": "Pantalla"}', 0),
  ('88600000-0000-4000-8888-000000000031', '88600000-0000-4000-8000-000000000000',
   '88600000-0000-4000-8887-000000000003', '{"ca": "Pantalla"}', 0);
insert into public.field_placements (id, org_id, field_id, surface, screen_key, custom_form_id, sort_order, required)
values
  ('88600000-0000-4000-8889-000000000001', '88600000-0000-4000-8000-000000000000',
   '88600000-0000-4000-8886-0000000000f1', 'custom_form', '88600000-0000-4000-8888-000000000011',
   '88600000-0000-4000-8887-000000000001', 0, false),
  ('88600000-0000-4000-8889-000000000002', '88600000-0000-4000-8000-000000000000',
   '88600000-0000-4000-8886-0000000000f2', 'custom_form', '88600000-0000-4000-8888-000000000012',
   '88600000-0000-4000-8887-000000000001', 0, false),
  ('88600000-0000-4000-8889-000000000003', '88600000-0000-4000-8000-000000000000',
   '88600000-0000-4000-8886-0000000000f1', 'custom_form', '88600000-0000-4000-8888-000000000021',
   '88600000-0000-4000-8887-000000000002', 0, false),
  ('88600000-0000-4000-8889-000000000004', '88600000-0000-4000-8000-000000000000',
   '88600000-0000-4000-8886-0000000000f1', 'custom_form', '88600000-0000-4000-8888-000000000031',
   '88600000-0000-4000-8887-000000000003', 0, false);

-- The record ------------------------------------------------------------------------------------------------------

select has_table('public', 'custom_form_progress', 'her answers so far have their own table');
select is(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.custom_form_progress'::regclass),
  true, 'with row level security, forced'
);
select table_privs_are('public', 'custom_form_progress', 'authenticated', array['SELECT'],
  'a signed-in caller only reads it; every write goes through the functions');
select table_privs_are('public', 'custom_form_progress', 'anon', array[]::text[],
  'an anonymous caller has nothing on it');
select is(
  (select disposition from public.personal_data_disposition()
    where table_name = 'custom_form_progress' and participant_column = 'profile_id'),
  'purge', 'erasure purges her answers so far'
);

-- The team publishes the three forms to both players --------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "88600000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select public.set_custom_form_recipients(('88600000-0000-4000-8887-00000000000' || n)::uuid, 'all', '{}')
  from generate_series(1, 3) as n;
select public.publish_custom_form(('88600000-0000-4000-8887-00000000000' || n)::uuid)
  from generate_series(1, 3) as n;

reset role;
create temporary table asks on commit drop as
  select r.form_id, r.profile_id, r.id from public.custom_form_responses r
   where r.org_id = '88600000-0000-4000-8000-000000000000';
grant select on asks to authenticated;
create function pg_temp.ask(p_form text, p_player text) returns uuid language sql as $$
  select id from asks
   where form_id = ('88600000-0000-4000-8887-00000000000' || p_form)::uuid
     and profile_id = ('88600000-0000-4000-8000-0000000000' || p_player)::uuid;
$$;
select is((select count(*)::integer from asks), 6, 'each player is asked the three forms');

-- She leaves the first form half way ------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "88600000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(public.my_started_custom_forms(), '{}'::uuid[], 'she has started nothing yet');
select is(public.my_custom_form_progress(pg_temp.ask('1', '11')), null, 'and has no answers kept');
select lives_ok(
  format($$select public.save_custom_form_progress(%L,
    '{"88600000-0000-4000-8886-0000000000f1": "Sants", "88600000-0000-4000-8886-0000000000f2": "X1234567Z"}',
    '88600000-0000-4000-8888-000000000012')$$,
    pg_temp.ask('1', '11')),
  'she leaves the form on its second screen'
);
select is(public.my_started_custom_forms(), array[pg_temp.ask('1', '11')], 'the form is started');
select is(
  public.my_custom_form_progress(pg_temp.ask('1', '11')) - 'saved_at',
  '{"screen_id": "88600000-0000-4000-8888-000000000012", "answers": {"88600000-0000-4000-8886-0000000000f1": "Sants", "88600000-0000-4000-8886-0000000000f2": "X1234567Z"}}'::jsonb,
  'it opens again where she left it, with her answers'
);
select ok(
  exists (select 1 from public.my_custom_forms() f where f.response_id = pg_temp.ask('1', '11')),
  'and it still waits for her'
);
select throws_ok(
  format($$select public.save_custom_form_progress(%L, '{"88600000-0000-4000-8886-0000000000f3": "No"}')$$,
    pg_temp.ask('1', '11')),
  '23514', 'her answers so far answer the fields the form asks',
  'an answer to a field the form does not ask is refused'
);
select throws_ok(
  format($$select public.save_custom_form_progress(%L, '{}', '88600000-0000-4000-8888-000000000021')$$,
    pg_temp.ask('1', '11')),
  '23514', 'the screen she is on is a screen of the form',
  'a screen of another form is refused'
);

reset role;
select is(
  (select position('X1234567Z' in encode(answers_encrypted, 'escape'))
     + position('Sants' in encode(answers_encrypted, 'escape'))
     from public.custom_form_progress where response_id = pg_temp.ask('1', '11')),
  0, 'her answers are stored encrypted, the Sensitive one included'
);

-- Nobody else reads or writes them --------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "88600000-0000-4000-8000-000000000012", "role": "authenticated"}';
select throws_ok(
  format($$select public.save_custom_form_progress(%L, '{}')$$, pg_temp.ask('1', '11')),
  '42501', 'a form is kept by the player it asks',
  'another player cannot write her answers so far'
);
select is(public.my_custom_form_progress(pg_temp.ask('1', '11')), null, 'nor read them');
select is((select count(*)::integer from public.custom_form_progress), 0, 'nor see her row');
select is(public.my_started_custom_forms(), '{}'::uuid[], 'and her own forms are not started');

set local request.jwt.claims = '{"sub": "88600000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is((select count(*)::integer from public.custom_form_progress), 0, 'the team sees no row of hers');
select is(public.my_custom_form_progress(pg_temp.ask('1', '11')), null, 'nor reads her answers so far');
select is(
  (select status from public.custom_form_responses_of('88600000-0000-4000-8887-000000000001')
    where profile_id = '88600000-0000-4000-8000-000000000011'),
  'pending', 'her responses list shows the form still pending, never answered'
);
select is(
  (select count(*)::integer from public.custom_answers
    where profile_id = '88600000-0000-4000-8000-000000000011'
      and question_id in ('88600000-0000-4000-8886-0000000000f1', '88600000-0000-4000-8886-0000000000f2')),
  0, 'and her record holds none of her answers so far'
);

-- A new version keeps the answers to fields the form still asks ---------------------------------------------------

reset role;
delete from public.field_placements where id = '88600000-0000-4000-8889-000000000001';
set local role authenticated;
select public.publish_custom_form('88600000-0000-4000-8887-000000000001');
set local request.jwt.claims = '{"sub": "88600000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(
  public.my_custom_form_progress(pg_temp.ask('1', '11')) -> 'answers',
  '{"88600000-0000-4000-8886-0000000000f2": "X1234567Z"}'::jsonb,
  'after a new version only the answer to a field still asked comes back'
);

-- Putting it off keeps them; sending removes them -----------------------------------------------------------------

select public.put_off_custom_form(pg_temp.ask('1', '11'));
select is(public.my_started_custom_forms(), array[pg_temp.ask('1', '11')], 'put off, it is still started');
select lives_ok(
  format($$select public.complete_custom_form(%L, '{"answers": {"88600000-0000-4000-8886-0000000000f2": "X1234567Z"}}')$$,
    pg_temp.ask('1', '11')),
  'she sends the form'
);
select is(public.my_started_custom_forms(), '{}'::uuid[], 'sent, it is no longer started');
reset role;
select is((select count(*)::integer from public.custom_form_progress where response_id = pg_temp.ask('1', '11')), 0,
  'and her answers so far are gone');

-- Emptying them, deleting the form and a withdrawn form remove them -----------------------------------------------

set local role authenticated;
select public.save_custom_form_progress(pg_temp.ask('2', '11'), '{"88600000-0000-4000-8886-0000000000f1": "Clot"}');
select public.save_custom_form_progress(pg_temp.ask('3', '11'), '{"88600000-0000-4000-8886-0000000000f1": "Clot"}');
select is(cardinality(public.my_started_custom_forms()), 2, 'she starts the other two forms');
select public.save_custom_form_progress(pg_temp.ask('2', '11'), '{"88600000-0000-4000-8886-0000000000f1": null}');
select is(public.my_started_custom_forms(), array[pg_temp.ask('3', '11')],
  'nothing left on the first screen: the form is new again');
select public.save_custom_form_progress(pg_temp.ask('2', '11'), '{"88600000-0000-4000-8886-0000000000f1": "Clot"}');
select public.dismiss_custom_form(pg_temp.ask('2', '11'));
select is((select count(*)::integer from public.custom_form_progress where response_id = pg_temp.ask('2', '11')), 0,
  'deleting a form removes its answers so far');

set local request.jwt.claims = '{"sub": "88600000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select public.archive_custom_form('88600000-0000-4000-8887-000000000003', true);
reset role;
select is((select count(*)::integer from public.custom_form_progress where response_id = pg_temp.ask('3', '11')), 0,
  'a withdrawn form removes her answers so far');
set local role authenticated;
select public.archive_custom_form('88600000-0000-4000-8887-000000000003', false);
set local request.jwt.claims = '{"sub": "88600000-0000-4000-8000-000000000011", "role": "authenticated"}';
select throws_ok(
  format($$select public.save_custom_form_progress(%L, '{}')$$, pg_temp.ask('2', '11')),
  '23514', 'the form is already answered',
  'a deleted form keeps nothing new'
);

-- Erasure ---------------------------------------------------------------------------------------------------------

select public.save_custom_form_progress(pg_temp.ask('3', '11'), '{"88600000-0000-4000-8886-0000000000f1": "Clot"}');
reset role;
delete from public.custom_form_responses where id = pg_temp.ask('3', '11');
select is((select count(*)::integer from public.custom_form_progress where profile_id = '88600000-0000-4000-8000-000000000011'), 0,
  'her answers so far go with the ask');
set local role authenticated;
set local request.jwt.claims = '{"sub": "88600000-0000-4000-8000-000000000012", "role": "authenticated"}';
select public.save_custom_form_progress(pg_temp.ask('1', '12'), '{"88600000-0000-4000-8886-0000000000f2": "Y7654321"}');
reset role;
delete from auth.users where id = '88600000-0000-4000-8000-000000000012';
select is((select count(*)::integer from public.custom_form_progress where profile_id = '88600000-0000-4000-8000-000000000012'), 0,
  'and with her account');

select * from finish();
rollback;
