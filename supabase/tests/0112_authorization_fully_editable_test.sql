-- The season authorization fully editable (RAPP-614).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. The published version was converted to the new shape without changing
--      a word: the RAPP-304 order as positions, both questions asked with
--      today's flags, no wording override; earlier consent records carry the
--      words their signature showed.
--   2. A version is checked: image rights never required; asking her health
--      needs the health data consent, required with the question; a hidden
--      question is never required; only known wording fields; consent keys.
--   3. Drafts: onboarding designers save and discard; only
--      settings.organization publishes; published versions never change and
--      are never deleted; every write is audited.
--   4. Signing follows the version it is signed on: its required consents
--      (a staff-added one included), its questions (required, optional or not
--      asked), the health data consent for a health answer. Each consent
--      event keeps the version, the wording shown, its language and flag.
--   5. Old records keep reading after the list changes; she can still
--      withdraw a consent the current version no longer asks.
--   6. The emergency contact follows its privacy level; health stays behind
--      participants.view_health.
--   7. The tablet, the walk-in queue and the scenario tool use the same
--      version; the consents export lists the wording.
--
-- Seed: admin ...001 (settings.organization, view_health), staff ...002
-- (view_personal and view_sensitive, consents.collect, no design), design role
-- ...097, player ...022 (has not signed), player ...011 (signed version 1 in
-- the app in Arabic: newsletter and messaging groups given, image rights not),
-- player ...012 (paper record), test player ...096, version ...8041...001.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(56);

select vault.create_secret('test-encryption-key', 'app_encryption_key', 'pgTAP test key')
where not exists (select 1 from vault.secrets where name = 'app_encryption_key');

create temp table run (label text primary key, id uuid, content jsonb);
grant all on run to authenticated;
insert into run (label, content)
select 'v1', content from public.authorization_versions where id = '5eed0000-0000-4000-8041-000000000001';

-- 1. The conversion -----------------------------------------------------------------------------------------

select is(
  (select jsonb_object_agg(key, value -> 'position') from jsonb_each((select content from run where label = 'v1') -> 'consents')),
  '{"participation": 0, "data_processing": 1, "code_of_conduct": 2, "health_data": 3, "image_rights": 4, "newsletter": 5, "messaging_groups": 6}'::jsonb,
  'the seven consents keep their order as positions'
);
select is(
  (select content -> 'questions' from run where label = 'v1'),
  '{"health": {"asked": true, "required": true, "privacy": "health", "texts": {}},
    "emergency_contact": {"asked": true, "required": false, "privacy": "personal", "texts": {}}}'::jsonb,
  'both questions are asked with the flags they had'
);
select is((select content -> 'texts' from run where label = 'v1'), '{}'::jsonb,
  'no wording override, so the bundled text shows as before');
select is(
  (select content -> 'consents' -> 'health_data' -> 'label' ->> 'ca' from run where label = 'v1'),
  'Accepto de manera expressa el tractament de les meves dades de salut, necessàries per participar de manera segura en el Projecte.',
  'the wording is untouched'
);
select is(
  private.authorization_content_upgraded((select content from run where label = 'v1')),
  (select content from run where label = 'v1'),
  'a converted version converts to itself'
);
select is(
  (select wording || '|' || language || '|' || required::text || '|' || (version_id = '5eed0000-0000-4000-8041-000000000001')::text
     from public.authorization_consent_events
    where profile_id = '5eed0000-0000-4000-8000-000000000011' and consent_key = 'newsletter'),
  (select (content -> 'consents' -> 'newsletter' -> 'label' ->> 'ar') || '|ar|false|true' from run where label = 'v1'),
  'an earlier consent record carries the words its signature showed, in her language'
);

-- 2. What a version may be -------------------------------------------------------------------------------------

select ok(
  not private.authorization_content_valid(jsonb_set((select content from run where label = 'v1'),
    '{consents,image_rights,required}', 'true')),
  'image rights are never required'
);
select ok(
  not private.authorization_content_valid((select content from run where label = 'v1') #- '{consents,health_data}'),
  'asking her health needs the health data consent'
);
select ok(
  not private.authorization_content_valid(jsonb_set((select content from run where label = 'v1'),
    '{consents,health_data,required}', 'false')),
  'and it is required while the health question is'
);
select ok(
  not private.authorization_content_valid(jsonb_set((select content from run where label = 'v1'),
    '{questions,emergency_contact}', '{"asked": false, "required": true, "privacy": "personal", "texts": {}}')),
  'a hidden question is never required'
);
select ok(
  not private.authorization_content_valid(jsonb_set((select content from run where label = 'v1'),
    '{questions,health,privacy}', '"personal"')),
  'health is always at the health level'
);
select ok(
  not private.authorization_content_valid(jsonb_set((select content from run where label = 'v1'),
    '{texts}', '{"error_message": {"ca": "No"}}')),
  'only the listed wording fields; validation messages stay in the app'
);
select ok(
  not private.authorization_content_valid(jsonb_set((select content from run where label = 'v1'),
    '{consents,Bad Key}', '{"label": {"ca": "x"}, "required": false, "position": 9}')),
  'a consent key is lowercase letters, digits and underscores'
);
select ok(
  private.authorization_content_valid(
    jsonb_set(jsonb_set(jsonb_set((select content from run where label = 'v1'),
      '{questions,health}', '{"asked": false, "required": false, "privacy": "health", "texts": {}}'),
      '{questions,emergency_contact}', '{"asked": false, "required": false, "privacy": "personal", "texts": {}}'),
      '{texts}', '{"health_title": {"ca": "Salut"}, "sign_and_enter_label": {"ar": "وقّعي"}}')),
  'the middle phase hides when none of its questions is required'
);

-- A version 2: newsletter removed, a staff consent added and required, health
-- optional with its consent optional, emergency contact required and sensitive,
-- the final button reworded.
insert into run (label, content)
select 'v2-content',
  jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(
    (content #- '{consents,newsletter}'),
    '{consents,team_photos}', '{"label": {"ca": "Accepto les fotos d''equip", "ar": "أوافق على صور الفريق"}, "required": true, "position": 7}'),
    '{consents,health_data,required}', 'false'),
    '{questions,health}', '{"asked": true, "required": false, "privacy": "health", "texts": {"question": {"ca": "Alguna cosa de salut?"}}}'),
    '{questions,emergency_contact}', '{"asked": true, "required": true, "privacy": "sensitive", "texts": {}}'),
    '{texts}', '{"sign_and_enter_label": {"ca": "Signa i juga"}}')
from run where label = 'v1';

-- 3. Drafts -------------------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.save_authorization_draft((select content from run where label = 'v2-content')) $$,
  '42501', null::text, 'staff without the design permission do not edit the authorization'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.save_authorization_draft(jsonb_set((select content from run where label = 'v2-content'),
       '{consents,image_rights,required}', 'true')) $$,
  '23514', null::text, 'a draft is checked like a version'
);
select lives_ok(
  $$ select public.save_authorization_draft((select content from run where label = 'v2-content')) $$,
  'the design role saves a draft'
);
select lives_ok(
  $$ select public.save_authorization_draft((select content from run where label = 'v2-content')) $$,
  'and saves it again'
);
select is(
  (select count(*)::integer from public.list_authorization_versions() where published_at is null),
  1, 'one draft per organization, listed for designers'
);
select is(
  (select count(*)::integer from public.authorization_versions where published_at is null),
  0, 'the draft is not readable from the table'
);
select throws_ok($$ select public.publish_authorization_draft() $$, '42501', null::text,
  'the design role does not publish');
select throws_ok(
  $$ select public.publish_authorization_version((select content from run where label = 'v2-content')) $$,
  '42501', null::text, 'not even in one call');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000022", "role": "authenticated", "aal": "aal1"}';
select is((select version_number from public.my_authorization_status()), 1,
  'players never see a draft');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(public.publish_authorization_draft(), 2, 'an admin publishes the draft as version 2');
select throws_ok($$ select public.publish_authorization_draft() $$, '55000', null::text,
  'there is no draft left to publish');
reset role;
insert into run (label, id) select 'v2', id from public.authorization_versions
 where season_id is not null and version_number = 2 and org_id = '5eed0000-0000-4000-8000-000000000000';
select throws_ok(
  $$ update public.authorization_versions set content = content where id = (select id from run where label = 'v2') $$,
  '55000', null::text, 'a published version is never edited'
);
select throws_ok(
  $$ delete from public.authorization_versions where id = (select id from run where label = 'v2') $$,
  '55000', null::text, 'nor deleted'
);
select is(
  (select array_agg(action order by action) from public.audit_log
    where action like 'authorization.%' and target_id = (select id from run where label = 'v2')),
  array['authorization.draft_saved', 'authorization.draft_saved', 'authorization.publish'],
  'every save and the publish are audited'
);
select ok(
  (select changes ? 'required' and not changes::text like '%Accepto%' from public.audit_log
    where action = 'authorization.draft_saved' and target_id = (select id from run where label = 'v2') limit 1),
  'the audit names the shape, never the text'
);

-- 4. Signing version 2 ----------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000022", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$ select public.sign_authorization((select id from run where label = 'v2'), jsonb_build_object(
       'consents', jsonb_build_object('participation', true, 'data_processing', true, 'code_of_conduct', true),
       'emergency_contact', jsonb_build_object('name', 'Olena', 'phone', '+34600222333'),
       'unable_to_draw', true, 'language', 'ar')) $$,
  '23514', null::text, 'a required consent staff added must be given'
);
select throws_ok(
  $$ select public.sign_authorization((select id from run where label = 'v2'), jsonb_build_object(
       'consents', jsonb_build_object('participation', true, 'data_processing', true, 'code_of_conduct', true,
                                      'team_photos', true),
       'emergency_contact', jsonb_build_object('name', 'Olena'),
       'unable_to_draw', true, 'language', 'ar')) $$,
  '23514', null::text, 'a required emergency contact needs a name and a phone'
);
select throws_ok(
  $$ select public.sign_authorization((select id from run where label = 'v2'), jsonb_build_object(
       'consents', jsonb_build_object('participation', true, 'data_processing', true, 'code_of_conduct', true,
                                      'team_photos', true, 'health_data', false),
       'health_info', 'Asma',
       'emergency_contact', jsonb_build_object('name', 'Olena', 'phone', '+34600222333'),
       'unable_to_draw', true, 'language', 'ar')) $$,
  '23514', null::text, 'a health answer needs the health data consent'
);
select throws_ok(
  $$ select public.sign_authorization((select id from run where label = 'v2'), jsonb_build_object(
       'consents', jsonb_build_object('participation', true, 'data_processing', true, 'code_of_conduct', true,
                                      'team_photos', true, 'newsletter', true),
       'emergency_contact', jsonb_build_object('name', 'Olena', 'phone', '+34600222333'),
       'unable_to_draw', true, 'language', 'ar')) $$,
  '23514', null::text, 'a consent the version does not ask is refused'
);
select lives_ok(
  $$ select public.sign_authorization((select id from run where label = 'v2'), jsonb_build_object(
       'consents', jsonb_build_object('participation', true, 'data_processing', true, 'code_of_conduct', true,
                                      'team_photos', true),
       'emergency_contact', jsonb_build_object('name', 'Olena', 'relation', 'Germana', 'phone', '+34600222333'),
       'unable_to_draw', true, 'language', 'ar', 'device', 'iPhone')) $$,
  'she signs version 2 without a health answer, now optional'
);
reset role;
select is(
  (select array_agg(consent_key || ':' || granted || ':' || required order by consent_key)
     from public.authorization_consent_events
    where profile_id = '5eed0000-0000-4000-8000-000000000022' and signature_id is not null),
  array['code_of_conduct:true:true', 'data_processing:true:true', 'health_data:false:false',
        'image_rights:false:false', 'messaging_groups:false:false', 'participation:true:true',
        'team_photos:true:true'],
  'one event per consent of the version she signed, with its flag'
);
select is(
  (select wording || '|' || language || '|' || (version_id = (select id from run where label = 'v2'))::text
     from public.authorization_consent_events
    where profile_id = '5eed0000-0000-4000-8000-000000000022' and consent_key = 'team_photos'),
  'أوافق على صور الفريق|ar|true',
  'and the words she was shown, in her language'
);
select is(
  (select wording from public.authorization_consent_events
    where profile_id = '5eed0000-0000-4000-8000-000000000022' and consent_key = 'participation'),
  (select content -> 'consents' -> 'participation' -> 'label' ->> 'ar' from run where label = 'v1'),
  'a consent kept from version 1 keeps its words'
);
select ok(
  (select health_info is null and emergency_contact_name = 'Olena' from public.profiles
    where id = '5eed0000-0000-4000-8000-000000000022'),
  'no health answer is stored when she gives none; the contact is'
);

-- 5. Old records ---------------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select is(
  (select wording from public.my_consents() where consent_key = 'newsletter'),
  (select content -> 'consents' -> 'newsletter' -> 'label' ->> 'ar' from run where label = 'v1'),
  'her newsletter consent still reads with the words she signed, though version 2 dropped it'
);
select lives_ok($$ select public.set_optional_consent('newsletter', false) $$,
  'she can still withdraw it');
select throws_ok($$ select public.set_optional_consent('newsletter', true) $$, '22023', null::text,
  'but not give it again: the current version does not ask it');
select throws_ok($$ select public.set_optional_consent('team_photos', false) $$, '22023', null::text,
  'a required consent is not changed from her profile');
select lives_ok($$ select public.set_optional_consent('messaging_groups', false, 'es') $$,
  'an optional consent of the current version changes from her profile');
reset role;
select is(
  (select wording || '|' || language || '|' || method from public.authorization_consent_events
    where profile_id = '5eed0000-0000-4000-8000-000000000011' and consent_key = 'messaging_groups'
    order by decided_at desc, id desc limit 1),
  (select (content -> 'consents' -> 'messaging_groups' -> 'label' ->> 'es') || '|es|profile' from run where label = 'v1'),
  'the change records the words she saw'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select wording || '|' || coalesce(version_number::text, '-') || '|' || granted from public.participant_consents('5eed0000-0000-4000-8000-000000000011')
    where consent_key = 'newsletter'),
  (select (content -> 'consents' -> 'newsletter' -> 'label' ->> 'ar') || '|1|false' from run where label = 'v1'),
  'staff read each consent with its words and version'
);

-- 6. Privacy levels ---------------------------------------------------------------------------------------------

select is(
  (select coalesce(emergency_contact_name, 'hidden') || '|' || coalesce(health_info, 'hidden')
     from public.get_participant_profile('5eed0000-0000-4000-8000-000000000022')),
  'Olena|hidden', 'staff with sensitive access read the sensitive contact, never her health'
);
reset role;
delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000002' and permission_code = 'participants.view_sensitive';
set local role authenticated;
select is(
  (select coalesce(emergency_contact_name, 'hidden') from public.get_participant_profile('5eed0000-0000-4000-8000-000000000022')),
  'hidden', 'without sensitive access the contact staff marked sensitive is hidden'
);

-- 7. Tablet, walk-ins, scenario, export ----------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select version_number || '|' || (content -> 'consents' ? 'team_photos')::text from public.current_authorization_for_signing()),
  '2|true', 'the tablet signs the same version, with its consents'
);
select throws_ok(
  $$ select public.record_staff_device_signature(gen_random_uuid(), '5eed0000-0000-4000-8000-000000000012',
       (select id from run where label = 'v2'), jsonb_build_object(
         'consents', jsonb_build_object('participation', true, 'data_processing', true, 'code_of_conduct', true),
         'emergency_contact', jsonb_build_object('name', 'Ana', 'phone', '600'),
         'unable_to_draw', true, 'language', 'ca'), now()) $$,
  '23514', null::text, 'the tablet checks the version''s required consents'
);
select lives_ok(
  $$ select public.record_staff_device_signature(gen_random_uuid(), '5eed0000-0000-4000-8000-000000000012',
       '5eed0000-0000-4000-8041-000000000001', jsonb_build_object(
         'consents', jsonb_build_object('participation', true, 'data_processing', true,
                                        'code_of_conduct', true, 'health_data', true),
         'health_info', 'No', 'unable_to_draw', true, 'language', 'ca'), now() - interval '1 day') $$,
  'a signing waiting offline on version 1 of this season still syncs, checked against version 1'
);
select throws_ok(
  $$ select public.submit_walk_in_signing(gen_random_uuid(), 'Salma', 'Nova', (select id from run where label = 'v2'),
       jsonb_build_object('consents', jsonb_build_object('participation', true),
                          'unable_to_draw', true, 'language', 'ca'), now()) $$,
  '23514', null::text, 'a walk-in is checked against the version too'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096',
       '{"kind": "season_signature", "signed": true}'::jsonb) $$,
  'the scenario signs this season'
);
reset role;
select is(
  (select array_agg(consent_key || ':' || granted order by consent_key) from public.authorization_consent_events
    where profile_id = '5eed0000-0000-4000-8000-000000000096'
      and version_id = (select id from run where label = 'v2') and wording is not null),
  array['code_of_conduct:true', 'data_processing:true', 'health_data:false', 'image_rights:false',
        'messaging_groups:false', 'participation:true', 'team_photos:true'],
  'with the current version''s consents and their words: required given, optional not'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select ok(
  (select (public.create_data_export('consents', 'default', 'csv') -> 'rows') @>
     jsonb_build_array(jsonb_build_object('consent_key', 'team_photos', 'consent', 'أوافق على صور الفريق',
                                          'version', 2, 'granted', true, 'language', 'ar'))),
  'the consents export lists each decision with its words'
);
select ok(
  not (select (public.create_data_export('consents', 'default', 'csv') -> 'rows')::text
         like '%5eed0000-0000-4000-8000-000000000096%'),
  'and leaves test players out'
);
reset role;

select ok(
  not has_function_privilege('anon', 'public.save_authorization_draft(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.discard_authorization_draft()', 'execute')
  and not has_function_privilege('anon', 'public.publish_authorization_draft()', 'execute')
  and not has_function_privilege('anon', 'public.set_optional_consent(text, boolean, text)', 'execute')
  and not has_function_privilege('public', 'public.save_authorization_draft(jsonb)', 'execute'),
  'the new functions need an account'
);

select * from finish();
rollback;
