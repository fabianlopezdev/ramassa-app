-- Dades legals: consents defined once, placed like fields, kept with their history (RAPP-699).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. The migration: the seeded version's seven consents are system consents
--      of the catalogue with the version's texts, placed on the authorization
--      in its order and flags; the events name their consent and form.
--   2. Placing: on the authorization and on an Onboarding screen, image rights
--      never required, the health consent staying while health is asked, the
--      authorization keeping one consent. The draft snapshots the catalogue.
--   3. An Onboarding event keeps the text shown, its language and its screen.
--   4. Withdrawal by her and by staff, health included; the current state is
--      the latest event.
--   5. Append only, except erasure.
--   6. Who reads and who records.
--   7. Erasure: anonymizing keeps the events and clears a staff reason; the
--      registry lists the tables.
--   8. Features read consents by key, whatever their name.
--
-- Seed: admin ...001, staff ...002 (view_personal, consents.collect), design
-- role ...097 (no view_personal), players ...011 (signed version 1 in Arabic;
-- health answer "No"), ...012, ...022.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(48);

select vault.create_secret('test-encryption-key', 'app_encryption_key', 'pgTAP test key')
where not exists (select 1 from vault.secrets where name = 'app_encryption_key');

create temp table run (label text primary key, id uuid, value text);
grant all on run to authenticated;

-- 1. The migration ----------------------------------------------------------------------------------------

select is(
  (select array_agg(c.key order by p.sort_order) from public.consents c
     join public.consent_placements p on p.consent_id = c.id and p.surface = 'authorization'
    where c.org_id = '5eed0000-0000-4000-8000-000000000000'),
  array['participation', 'data_processing', 'code_of_conduct', 'health_data', 'image_rights',
        'newsletter', 'messaging_groups'],
  'the version''s consents are placed on the authorization in its order'
);
select is(
  (select count(*)::integer from public.consents
    where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = key),
  7, 'the seven consents the app knew are system consents'
);
select is(
  (select c.body ->> 'ca' from public.consents c
    where c.org_id = '5eed0000-0000-4000-8000-000000000000' and c.key = 'health_data'),
  (select content -> 'consents' -> 'health_data' -> 'label' ->> 'ca' from public.authorization_versions
    where id = '5eed0000-0000-4000-8041-000000000001'),
  'a system consent takes the version''s text'
);
select is(
  (select c.name ->> 'ca' from public.consents c
    where c.org_id = '5eed0000-0000-4000-8000-000000000000' and c.key = 'image_rights'),
  'Drets d''imatge', 'and its name'
);
select is(
  (select array_agg(c.key || ':' || p.required order by p.sort_order) from public.consents c
     join public.consent_placements p on p.consent_id = c.id and p.surface = 'authorization'
    where c.org_id = '5eed0000-0000-4000-8000-000000000000' and c.key in ('health_data', 'image_rights')),
  array['health_data:true', 'image_rights:false'], 'with the version''s required flags'
);
select is(
  (select count(*)::integer from public.consent_events e
    where e.signature_id = '5eed0000-0000-4000-8042-000000000011'
      and e.form = 'authorization' and e.consent_id is not null),
  7, 'her signed consents name their consent and their form'
);
insert into public.organizations (id, name, slug)
values ('69900000-0000-4000-8000-000000000001', 'Nova', 'rapp-699-new');
select is(
  (select count(*)::integer from public.consents
    where org_id = '69900000-0000-4000-8000-000000000001' and system_key is not null),
  7, 'a new organization gets the system consents'
);

-- 2. Placing ----------------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ insert into run (label, id) values ('trips', public.save_consent(null,
       '{"ca": "Sortides", "ar": "الرحلات"}'::jsonb,
       '{"ca": "Accepto anar a les sortides de l''equip.", "ar": "أوافق على الذهاب في رحلات الفريق."}'::jsonb)) $$,
  'the design role adds a consent'
);
select is((select key from public.consents where id = (select id from run where label = 'trips')),
  'sortides', 'its key is its Catalan name, written plain');
select throws_ok(
  $$ select public.save_consent(null, '{"es": "Salidas"}'::jsonb, '{"ca": "x"}'::jsonb) $$,
  '23514', null::text, 'a consent needs its name in Catalan'
);
select lives_ok(
  $$ insert into run (label, id) values ('trips-onboarding',
       public.place_consent((select id from run where label = 'trips'), 'onboarding', 'equipment', true)) $$,
  'it is placed on an Onboarding screen, required'
);
select lives_ok(
  $$ insert into run (label, id) values ('trips-authorization',
       public.place_consent((select id from run where label = 'trips'), 'authorization')) $$,
  'and on the authorization'
);
select is(
  (select sort_order from public.consent_placements where id = (select id from run where label = 'trips-authorization')),
  7, 'after the authorization''s consents'
);
select throws_ok(
  $$ select public.place_consent((select id from run where label = 'trips'), 'authorization') $$,
  '23505', null::text, 'once per form'
);
select throws_ok(
  $$ select public.place_consent((select id from public.consents where key = 'image_rights'
                                    and org_id = '5eed0000-0000-4000-8000-000000000000'), 'onboarding', 'equipment', true) $$,
  '23514', null::text, 'image rights are never required'
);
select throws_ok(
  $$ select public.remove_consent_placement((select p.id from public.consent_placements p
       join public.consents c on c.id = p.consent_id
      where c.key = 'health_data' and p.surface = 'authorization')) $$,
  '23514', null::text, 'the health consent stays while the authorization asks her health'
);
select throws_ok(
  $$ select public.archive_consent((select id from public.consents where key = 'health_data'
                                      and org_id = '5eed0000-0000-4000-8000-000000000000'), true) $$,
  '23514', null::text, 'and is not archived'
);
select lives_ok(
  $$ select public.save_consent((select id from public.consents where key = 'newsletter'
                                   and org_id = '5eed0000-0000-4000-8000-000000000000'),
       '{"ca": "Butlletí"}'::jsonb, '{"ca": "Vull rebre el butlletí.", "ar": "أريد النشرة."}'::jsonb) $$,
  'staff reword a system consent'
);
select lives_ok(
  $$ select public.save_authorization_draft((select content from public.authorization_versions
                                               where id = '5eed0000-0000-4000-8041-000000000001')) $$,
  'and save the authorization draft'
);
reset role;
select is(
  (select (content -> 'consents' -> 'newsletter' -> 'label' ->> 'ca') || '|'
          || (content -> 'consents' -> 'sortides' ->> 'position')
     from public.authorization_versions
    where org_id = '5eed0000-0000-4000-8000-000000000000' and published_at is null),
  'Vull rebre el butlletí.|7', 'the draft snapshots the catalogue''s texts and placements'
);
select is(
  (select content -> 'consents' -> 'newsletter' -> 'label' ->> 'ca' from public.authorization_versions
    where id = '5eed0000-0000-4000-8041-000000000001'),
  'Accepto rebre informació d’AE Ramassà per mitjans electrònics, telèfon o correu postal (butlletí, invitacions, enquestes).',
  'the published version keeps the text it showed'
);

-- 3. An Onboarding event keeps its text -----------------------------------------------------------------------

select throws_ok(
  $$ select private.record_onboarding_consents('5eed0000-0000-4000-8000-000000000012', '{"sortides": false}'::jsonb, 'ar') $$,
  '23514', null::text, 'a required Onboarding consent must be given'
);
select throws_ok(
  $$ select private.record_onboarding_consents('5eed0000-0000-4000-8000-000000000012', '{"newsletter": true}'::jsonb, 'ar') $$,
  '23514', null::text, 'only the consents her Onboarding asks'
);
select lives_ok(
  $$ select private.record_onboarding_consents('5eed0000-0000-4000-8000-000000000012', null, 'ar') $$,
  'an older build sends none: nothing is checked'
);
select lives_ok(
  $$ select private.record_onboarding_consents('5eed0000-0000-4000-8000-000000000012', '{"sortides": true}'::jsonb, 'ar') $$,
  'her Onboarding ticks are recorded'
);
select is(
  (select count(*)::integer from public.consent_events
    where profile_id = '5eed0000-0000-4000-8000-000000000012' and consent_key = 'fotos_de_partit'),
  0, 'a consent on an archived screen is never asked, so never recorded'
);
select is(
  (select wording || '|' || language || '|' || form || '|' || screen_key || '|' || method || '|' || required
     from public.consent_events where profile_id = '5eed0000-0000-4000-8000-000000000012' and consent_key = 'sortides'),
  'أوافق على الذهاب في رحلات الفريق.|ar|onboarding|equipment|app|true',
  'with the text she was shown, its language, the form and the screen'
);

-- 4. Withdrawal and the current state -----------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select lives_ok($$ select public.set_optional_consent('newsletter', false, 'ar') $$,
  'she withdraws an optional consent on her profile');
select is((select granted from public.my_consents() where consent_key = 'newsletter'), false,
  'her current state is the latest event');
select is((select name ->> 'ca' from public.my_consents() where consent_key = 'newsletter'), 'Butlletí',
  'named as the catalogue names it');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.record_participant_consent('5eed0000-0000-4000-8000-000000000011',
       (select id from public.consents where key = 'health_data' and org_id = '5eed0000-0000-4000-8000-000000000000'),
       false, 'staff', '  ') $$,
  '23514', null::text, 'a staff withdrawal needs its reason'
);
select lives_ok(
  $$ select public.record_participant_consent('5eed0000-0000-4000-8000-000000000011',
       (select id from public.consents where key = 'health_data' and org_id = '5eed0000-0000-4000-8000-000000000000'),
       false, 'staff', 'Ho va demanar per escrit.') $$,
  'staff record her withdrawal of the health consent'
);
reset role;
select is(
  (select count(*)::integer from public.custom_answers a
    where a.profile_id = '5eed0000-0000-4000-8000-000000000011'
      and a.question_id = (private.authorization_field('5eed0000-0000-4000-8000-000000000000', 'health_info')).id),
  0, 'withdrawing the health consent deletes her health answer'
);

-- 5. Append only ------------------------------------------------------------------------------------------

select throws_ok(
  $$ update public.consent_events set granted = true
      where profile_id = '5eed0000-0000-4000-8000-000000000011' and consent_key = 'health_data' $$,
  '42501', null::text, 'a decision is never changed'
);
select throws_ok(
  $$ delete from public.consent_events where profile_id = '5eed0000-0000-4000-8000-000000000011' $$,
  '42501', null::text, 'nor deleted'
);

select lives_ok(
  $$ delete from public.authorization_signatures where id = '5eed0000-0000-4000-8042-000000000011' $$,
  'erasing a signature takes its decisions along (a cascade)'
);
select is(
  (select count(*)::integer from public.consent_events where signature_id = '5eed0000-0000-4000-8042-000000000011'),
  0, 'so none is left'
);

-- 6. Who reads and who records ----------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select granted || '|' || method || '|' || recorded_by_name || '|' || reason
     from public.participant_consent_history('5eed0000-0000-4000-8000-000000000011')
    where consent_key = 'health_data' order by decided_at desc limit 1),
  (select 'false|staff|' || concat_ws(' ', first_name, last_name) || '|Ho va demanar per escrit.'
     from public.profiles where id = '5eed0000-0000-4000-8000-000000000002'),
  'staff with participants.view_personal read who recorded it and why'
);
select is(
  (select granted from public.participant_consents('5eed0000-0000-4000-8000-000000000011')
    where consent_key = 'health_data'),
  false, 'and her current state'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select * from public.participant_consent_history('5eed0000-0000-4000-8000-000000000011') $$,
  '42501', null::text, 'the design role does not read her consents'
);
select throws_ok(
  $$ select public.record_participant_consent('5eed0000-0000-4000-8000-000000000011',
       (select id from public.consents where key = 'newsletter' and org_id = '5eed0000-0000-4000-8000-000000000000'),
       true, 'paper') $$,
  '42501', null::text, 'nor records them'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated", "aal": "aal1"}';
select is(
  (select count(*)::integer from public.consent_events where profile_id = '5eed0000-0000-4000-8000-000000000011'),
  0, 'a player reads none of another player''s decisions'
);
select ok(
  not has_function_privilege('anon', 'public.record_participant_consent(uuid, uuid, boolean, text, text, text, date)', 'execute')
  and not has_function_privilege('anon', 'public.participant_consent_history(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.save_consent(uuid, jsonb, jsonb)', 'execute'),
  'anon calls none of them'
);

-- 8. Features read consents by key ------------------------------------------------------------------------

reset role;
update public.consents set name = '{"ca": "Fotos"}'::jsonb, body = '{"ca": "Fotos sí."}'::jsonb
 where org_id = '5eed0000-0000-4000-8000-000000000000' and key = 'image_rights';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select lives_ok($$ select public.set_optional_consent('image_rights', true, 'ar') $$,
  'she gives the renamed image rights consent');
reset role;
select ok(
  (select media_consent_at is not null from public.profiles where id = '5eed0000-0000-4000-8000-000000000011'),
  'it still drives the photo consent, by its key'
);

-- 7. Erasure ----------------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok($$ select public.anonymize_participant('5eed0000-0000-4000-8000-000000000011') $$,
  'staff anonymize her');
reset role;
select is(
  (select count(*)::integer || '|' || count(reason)::integer from public.consent_events
    where profile_id = '5eed0000-0000-4000-8000-000000000011'),
  (select count(*)::integer || '|0' from public.consent_events
    where profile_id = '5eed0000-0000-4000-8000-000000000011'),
  'her decisions stay as proof, without a staff reason'
);
select is(
  (select array_agg(table_name || ':' || disposition order by table_name) from public.personal_data_disposition()
    where table_name in ('consents', 'consent_placements', 'consent_events')),
  array['consent_events:purge', 'consent_placements:not_personal', 'consents:not_personal'],
  'the registry lists the three tables'
);

select * from finish();
rollback;
