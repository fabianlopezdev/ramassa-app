-- Nou formulari: forms the team creates (RAPP-700).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Only the people who design forms create one; Catalan name, the three
--      choices and a deadline only with "required from a date". An entity form
--      is not available yet.
--   2. A form's screen holds fields, consents and signature blocks; a field is
--      asked once per form and may sit on another form too. A team form holds
--      no signature block and no file field.
--   3. Publishing a form that appears once asks every active player; she sees
--      it in her pending list, and a new player gets it when she joins.
--   4. Answering writes her answers, her signatures and her consents, each
--      naming the form, and closes her ask. A required field or an unsigned
--      block keeps it open.
--   5. The three mandatory levels: only "required to use the app" and a
--      deadline that came keep her from the app. An optional form can be
--      dismissed; a required one cannot.
--   6. Every season: a season that becomes current asks again. Sent: Envia
--      asks the audience it picks.
--   7. Nova versió asks everyone who answered again.
--   8. The team fills a team form on her page. Who reads the responses.
--   9. Erasure deletes her responses.
--
-- Seed: admin ...001, staff ...002 (participants), design role ...097,
-- players ...011, ...012, ...022, invited woman ...098, season 2026/27.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(50);

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;
insert into ids select 'newsletter', c.id from public.consents c
 where c.org_id = '5eed0000-0000-4000-8000-000000000000' and c.key = 'newsletter';

-- 1. Creating a form ---------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select throws_ok(
  $$ select public.create_custom_form('{"ca": "Salut"}', 'player', 'optional', null, 'once') $$,
  '42501', null::text, 'a player cannot create a form'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.create_custom_form('{"es": "Salud"}', 'player', 'optional', null, 'once') $$,
  '23514', 'a form needs its name in Catalan', 'a form needs its Catalan name'
);
select throws_ok(
  $$ select public.create_custom_form('{"ca": "Salut"}', 'player', 'required_from_date', null, 'once') $$,
  '23514', null::text, 'required from a date names the date'
);
select throws_ok(
  $$ select public.create_custom_form('{"ca": "Salut"}', 'entity', 'optional', null, 'once') $$,
  '0A000', 'a form an entity fills in is not available yet', 'an entity form is not available yet'
);
insert into ids values
  ('once', public.create_custom_form('{"ca": "Revisió mèdica", "es": "Revisión médica"}', 'player', 'required_to_use_app', null, 'once')),
  ('season', public.create_custom_form('{"ca": "Enquesta de temporada"}', 'player', 'optional', null, 'every_season')),
  ('sent', public.create_custom_form('{"ca": "Viatge a Girona"}', 'player', 'required_from_date', current_date + 10, 'sent')),
  ('team', public.create_custom_form('{"ca": "Seguiment social"}', 'team', 'optional', null, 'once'));
select is((select count(*)::integer from public.custom_forms where id in (select id from ids)), 4,
  'the design role creates forms of the three kinds');
reset role;
select is((select count(*)::integer from public.audit_log where action = 'custom_form.create'), 4, 'and each is audited');
set local role authenticated;

-- 2. Screens and placements --------------------------------------------------------------------------------

insert into ids values
  ('once-screen', public.save_custom_form_screen(null, (select id from ids where name = 'once'), '{"ca": "Salut"}', null)),
  ('season-screen', public.save_custom_form_screen(null, (select id from ids where name = 'season'), '{"ca": "Com ha anat?"}', null)),
  ('sent-screen', public.save_custom_form_screen(null, (select id from ids where name = 'sent'), '{"ca": "Autorització"}', null)),
  ('team-screen', public.save_custom_form_screen(null, (select id from ids where name = 'team'), '{"ca": "Seguiment"}', null));
-- "Vens amb transport públic?" required on the once form, optional on the season form.
insert into ids values ('once-field', public.place_field(
  '5eed0000-0000-4000-8045-000000000001', 'custom_form', (select id::text from ids where name = 'once-screen'), true));
select throws_ok(
  format($$ select public.place_field('5eed0000-0000-4000-8045-000000000001', 'custom_form', %L) $$,
         (select id::text from ids where name = 'once-screen')),
  '23505', 'the field is already asked there', 'a field is asked once per form'
);
select lives_ok(
  format($$ select public.place_field('5eed0000-0000-4000-8045-000000000001', 'custom_form', %L, false) $$,
         (select id::text from ids where name = 'season-screen')),
  'the same field sits on another form too'
);
select lives_ok(
  format($$ select public.place_field('5eed0000-0000-4000-8045-000000000004', 'custom_form', %L, true) $$,
         (select id::text from ids where name = 'team-screen')),
  'a team form holds fields'
);
select throws_ok(
  format($$ select public.save_form_block(null, 'custom_form', %L, '{"ca": "Signo"}') $$,
         (select id::text from ids where name = 'team-screen')),
  '23514', 'a signature is asked on a form she fills in', 'a team form holds no signature block'
);
select throws_ok(
  format($$ select public.place_consent(%L, 'custom_form', %L) $$,
         (select id from ids where name = 'newsletter'), (select id::text from ids where name = 'team-screen')),
  '23514', 'a consent is asked on a form she fills in', 'a team form asks no consent'
);
insert into ids values ('once-block', public.save_form_block(
  null, 'custom_form', (select id::text from ids where name = 'once-screen'), '{"ca": "Confirmo que les dades són certes"}'));
insert into ids values ('once-consent', public.place_consent(
  (select id from ids where name = 'newsletter'), 'custom_form', (select id::text from ids where name = 'once-screen'), true));
select throws_ok(
  $$ select public.place_field('5eed0000-0000-4000-8045-000000000001', 'custom_form', '5eed0000-0000-4000-8000-000000000000') $$,
  'P0002', 'no such screen', 'a placement names a live screen of a form'
);
select is(
  (select count(*)::integer from public.field_placements
    where surface = 'custom_form' and custom_form_id = (select id from ids where name = 'once')),
  1, 'the placement names its form'
);

-- The catalog keeps the forms under their own keys.
select ok(
  (select not exists (select 1 from jsonb_array_elements(public.intake_catalog() -> 'placements') p
                       where p ->> 'surface' = 'custom_form')),
  'an older build never reads a form placement among the placements'
);
select is(
  (select count(*)::integer from jsonb_array_elements(public.intake_catalog() -> 'custom_form_placements') p
    where (p ->> 'custom_form_id')::uuid in (select id from ids)),
  3,
  'the forms placements travel apart');

-- 3. Publishing a form that appears once -----------------------------------------------------------------

reset role;
create temporary table active_count on commit drop as
  select count(*)::integer as n from public.profiles
   where org_id = '5eed0000-0000-4000-8000-000000000000' and role = 'player' and is_active and anonymized_at is null;
grant select on active_count to authenticated;
set local role authenticated;
select is(public.publish_custom_form((select id from ids where name = 'once')), (select n from active_count),
  'publishing asks every active player');
select throws_ok(
  format($$ select public.publish_custom_form(%L) $$, (select id from ids where name = 'sent')),
  '23514', 'a sent form starts when the team sends it', 'a sent form starts with Envia'
);
reset role;
select is(
  (select count(*)::integer from public.push_publications
    where content_type = 'custom_form' and content_id in (
      select r.id from public.custom_form_responses r where r.form_id = (select id from ids where name = 'once'))),
  (select count(*)::integer from public.custom_form_responses where form_id = (select id from ids where name = 'once')),
  'each ask is a notification that opens her response'
);
set local role authenticated;

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(
  (select count(*)::integer from public.my_custom_forms() f where f.form_id = (select id from ids where name = 'once') and f.is_blocking),
  1, 'she has it pending, and it keeps her from the app'
);

-- A woman who becomes a player gets it.
reset role;
update public.profiles set role = 'player' where id = '5eed0000-0000-4000-8000-000000000098';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000098", "role": "authenticated"}';
select is((select count(*)::integer from public.my_custom_forms() where form_id = (select id from ids where name = 'once')), 1,
  'a new player gets the live form after her Onboarding');

-- 4. Answering ---------------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
reset role;
delete from public.custom_answers
 where profile_id = '5eed0000-0000-4000-8000-000000000011' and question_id = '5eed0000-0000-4000-8045-000000000001';
set local role authenticated;
select throws_ok(
  format($$ select public.complete_custom_form(%L, '{"answers": {}, "consents": {"newsletter": true}}'::jsonb) $$,
         (select response_id from public.my_custom_forms() where form_id = (select id from ids where name = 'once'))),
  '23502', 'complete_custom_form requires an answer to a required question', 'a required field keeps it open'
);
select throws_ok(
  format($$ select public.complete_custom_form(%L, '{"answers": {"5eed0000-0000-4000-8045-000000000001": "yes"}, "consents": {"newsletter": true}}'::jsonb) $$,
         (select response_id from public.my_custom_forms() where form_id = (select id from ids where name = 'once'))),
  '23502', 'complete_custom_form requires her signature on every signature block', 'an unsigned block keeps it open'
);
select throws_ok(
  format($$ select public.complete_custom_form(%L, jsonb_build_object(
      'answers', jsonb_build_object('5eed0000-0000-4000-8045-000000000001', 'yes'),
      'signatures', jsonb_build_object(%L, '{"strokes": [[[100, 200], [300, 400]]], "language": "ca"}'::jsonb),
      'consents', '{}'::jsonb)) $$,
         (select response_id from public.my_custom_forms() where form_id = (select id from ids where name = 'once')),
         (select id::text from ids where name = 'once-block')),
  '23514', 'every required consent must be given', 'a required consent must be given'
);
insert into ids values ('her-response',
  (select response_id from public.my_custom_forms() where form_id = (select id from ids where name = 'once')));
select lives_ok(
  format($$ select public.complete_custom_form(%L, jsonb_build_object(
      'answers', jsonb_build_object('5eed0000-0000-4000-8045-000000000001', 'yes'),
      'signatures', jsonb_build_object(%L, '{"strokes": [[[100, 200], [300, 400]]], "language": "ca"}'::jsonb),
      'consents', '{"newsletter": true}'::jsonb, 'language', 'ca')) $$,
         (select id from ids where name = 'her-response'), (select id::text from ids where name = 'once-block')),
  'she answers, signs and gives the consent'
);
select is(
  (select status || '/' || filled_by from public.custom_form_responses where id = (select id from ids where name = 'her-response')),
  'done/player', 'her ask is closed, filled in by her'
);
select ok(
  exists (select 1 from public.custom_answers
           where profile_id = '5eed0000-0000-4000-8000-000000000011'
             and question_id = '5eed0000-0000-4000-8045-000000000001'),
  'her answer is in her record'
);
reset role;
select is(
  (select count(*)::integer from public.form_signatures
    where profile_id = '5eed0000-0000-4000-8000-000000000011' and surface = 'custom_form'
      and custom_form_id = (select id from ids where name = 'once')),
  1, 'her signature names the form'
);
select is(
  (select form || '/' || granted from public.consent_events
    where profile_id = '5eed0000-0000-4000-8000-000000000011'
      and custom_form_id = (select id from ids where name = 'once')),
  'custom_form/true', 'her consent names the form'
);
set local role authenticated;
select throws_ok(
  format($$ select public.complete_custom_form(%L, '{"answers": {}}'::jsonb) $$, (select id from ids where name = 'her-response')),
  '23514', 'the form is already answered', 'a closed ask is not answered twice'
);

-- 5. The three mandatory levels ------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(public.send_custom_form((select id from ids where name = 'sent'), 'all', '{}'::jsonb) > 0, true,
  'Envia asks the audience it picks');
select throws_ok(
  format($$ select public.send_custom_form(%L, 'all', '{}'::jsonb) $$, (select id from ids where name = 'once')),
  '23514', 'only a sent form is sent', 'a form that appears once is not sent'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated"}';
select is(
  (select is_blocking from public.my_custom_forms() where form_id = (select id from ids where name = 'sent')),
  false, 'a deadline still to come lets her use the app'
);
reset role;
update public.custom_forms set deadline = current_date where id = (select id from ids where name = 'sent');
set local role authenticated;
select is(
  (select is_blocking from public.my_custom_forms() where form_id = (select id from ids where name = 'sent')),
  true, 'from the deadline it keeps her from the app'
);
select throws_ok(
  format($$ select public.dismiss_custom_form(%L) $$,
         (select response_id from public.my_custom_forms() where form_id = (select id from ids where name = 'sent'))),
  '23514', 'only an optional form can be closed', 'a required form cannot be dismissed'
);

-- 6. Every season ------------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select ok(public.publish_custom_form((select id from ids where name = 'season')) > 0, 'an every-season form asks this season');
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated"}';
select is(
  (select is_blocking from public.my_custom_forms() where form_id = (select id from ids where name = 'season')),
  false, 'an optional form lets her use the app'
);
select lives_ok(
  format($$ select public.dismiss_custom_form(%L) $$,
         (select response_id from public.my_custom_forms() where form_id = (select id from ids where name = 'season'))),
  'she dismisses an optional form'
);
reset role;
update public.seasons set is_current = false where org_id = '5eed0000-0000-4000-8000-000000000000';
insert into public.seasons (id, org_id, name, starts_on, is_current)
values ('5eed0000-0000-4000-8040-000000000700', '5eed0000-0000-4000-8000-000000000000', '2027/28', '2027-09-01', true);
set local role authenticated;
select is(
  (select count(*)::integer from public.my_custom_forms() where form_id = (select id from ids where name = 'season')),
  1, 'a new season asks her again'
);

-- 7. Nova versió --------------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(public.new_custom_form_version((select id from ids where name = 'once')), 1,
  'a Nova versió asks again whoever answered');
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(
  (select version from public.my_custom_forms() where form_id = (select id from ids where name = 'once')),
  2, 'she has the new version pending'
);

-- 8. The team, and who reads ---------------------------------------------------------------------------------

select throws_ok(
  format($$ select * from public.custom_form_responses_of(%L) $$, (select id from ids where name = 'once')),
  '42501', null::text, 'a player cannot read the responses'
);
select is(
  (select count(*)::integer from public.custom_form_responses where profile_id <> '5eed0000-0000-4000-8000-000000000011'),
  0, 'she reads her own asks only'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  format($$ select * from public.custom_form_responses_of(%L) $$, (select id from ids where name = 'once')),
  '42501', null::text, 'the design role alone does not read who answered'
);
select lives_ok(
  format($$ select public.publish_custom_form(%L) $$, (select id from ids where name = 'team')),
  'a team form starts'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select ok(
  (select count(*) from public.custom_form_responses_of((select id from ids where name = 'once'))
    where status = 'pending') > 0,
  'the team reads who answered and who is pending'
);
reset role;
delete from public.custom_answers
 where profile_id = '5eed0000-0000-4000-8000-000000000022' and question_id = '5eed0000-0000-4000-8045-000000000004';
set local role authenticated;
select throws_ok(
  format($$ select public.complete_participant_custom_form(%L) $$,
         (select response_id from public.participant_custom_forms('5eed0000-0000-4000-8000-000000000022')
           where form_id = (select id from ids where name = 'team'))),
  '23502', null::text, 'a team form needs its required answers'
);
select lives_ok(
  $$ select public.set_participant_custom_answers('5eed0000-0000-4000-8000-000000000022',
       '{"5eed0000-0000-4000-8045-000000000004": "Sagrera"}'::jsonb) $$,
  'the team answers on her page'
);
select lives_ok(
  format($$ select public.complete_participant_custom_form(%L) $$,
         (select response_id from public.participant_custom_forms('5eed0000-0000-4000-8000-000000000022')
           where form_id = (select id from ids where name = 'team'))),
  'and closes the team form'
);

-- 9. Erasure ---------------------------------------------------------------------------------------------------

select lives_ok($$ select public.anonymize_participant('5eed0000-0000-4000-8000-000000000011') $$,
  'staff anonymize her');
reset role;
select is(
  (select count(*)::integer from public.custom_form_responses where profile_id = '5eed0000-0000-4000-8000-000000000011'),
  0, 'erasure deletes her responses'
);

select * from finish();
rollback;
