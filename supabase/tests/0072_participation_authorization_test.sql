-- The participation authorization, signed in the app (RAPP-304).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Staff with settings.organization publish a season version; published
--      versions are never edited, and a new one makes every player sign again.
--   2. A player signs only with every required consent, the medical answer and
--      a drawn signature or a "could not draw" record. Each consent is stored
--      separately with the version, language, time, device and method.
--   3. A paper record for the season satisfies the gate.
--   4. Health data is encrypted. Since RAPP-698 it is an answer to a Sensible
--      field, read at that level like every Sensible answer.
--   5. Optional consents are revocable, and every change is recorded.
--
-- The seed publishes version 1 of 2026/27; every seeded player but Наталія
-- (...022) has a paper record for it.

begin;
select plan(26);

create temp table run (label text primary key, id uuid);
grant all on run to authenticated;
-- The authorization's fields (RAPP-698), named while the test is superuser.
insert into run (label, id)
select key, (private.authorization_field('5eed0000-0000-4000-8000-000000000000', key)).id
  from unnest(private.authorization_field_keys()) key;

-- 4. The permission ---------------------------------------------------------------------------------

select ok(
  exists (select 1 from public.permissions where code = 'participants.view_health'),
  'participants.view_health is in the catalog'
);
select is(
  (select array_agg(builtin_key order by builtin_key) from public.permission_preset_defaults
    where permission_code = 'participants.view_health'),
  array['admin'], 'only the Admin preset has it by default'
);

-- 3 and the gate ------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000022", "role": "authenticated", "aal": "aal1"}';
select is(
  (select required from public.my_authorization_status()), true,
  'a player without an authorization for the season must sign'
);
select is(
  (select content -> 'consents' -> 'health_data' ->> 'required' from public.my_authorization_status()),
  'true', 'and she reads the version she must sign'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000012", "role": "authenticated", "aal": "aal1"}';
select is(
  (select required from public.my_authorization_status()), false,
  'a paper record for the season satisfies the gate'
);

-- 2. Signing --------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000022", "role": "authenticated", "aal": "aal1"}';
insert into run (label, id) select 'version', version_id from public.my_authorization_status();

select throws_ok(
  $$ select public.sign_authorization((select id from run where label = 'version'), jsonb_build_object(
       'consents', jsonb_build_object('participation', true, 'data_processing', true,
                                      'code_of_conduct', true, 'health_data', false),
       'health_info', 'No', 'signature', '[[[1,2],[3,4]]]'::jsonb, 'language', 'es')) $$,
  '23514', null::text, 'every required consent must be given'
);
select throws_ok(
  $$ select public.sign_authorization((select id from run where label = 'version'), jsonb_build_object(
       'consents', jsonb_build_object('participation', true, 'data_processing', true,
                                      'code_of_conduct', true, 'health_data', true),
       'health_info', '  ', 'signature', '[[[1,2],[3,4]]]'::jsonb, 'language', 'es')) $$,
  '23502', null::text, 'the medical answer is required, "No" included'
);
select throws_ok(
  $$ select public.sign_authorization((select id from run where label = 'version'), jsonb_build_object(
       'consents', jsonb_build_object('participation', true, 'data_processing', true,
                                      'code_of_conduct', true, 'health_data', true),
       'health_info', 'No', 'language', 'es')) $$,
  '23514', null::text, 'she signs with a drawing or says she could not draw'
);
select lives_ok(
  $$ select public.sign_authorization((select id from run where label = 'version'), jsonb_build_object(
       'consents', jsonb_build_object('participation', true, 'data_processing', true,
                                      'code_of_conduct', true, 'health_data', true,
                                      'image_rights', true, 'newsletter', false),
       'health_info', 'Asma lleu, porto inhalador.',
       'emergency_contact', jsonb_build_object('name', 'Olena', 'relation', 'Germana', 'phone', '+34600222333'),
       'unable_to_draw', true,
       'language', 'es', 'device', 'iPhone')) $$,
  'she can sign with the ticks alone when she cannot draw'
);
select is(
  (select required from public.my_authorization_status()), false,
  'once signed, the gate opens'
);

reset role;
select is(
  (select method || '|' || unable_to_draw || '|' || language || '|' || device
     from public.authorization_signatures
    where profile_id = '5eed0000-0000-4000-8000-000000000022' and method = 'app'),
  'app|true|es|iPhone', 'the signature records how she signed'
);
select is(
  (select string_agg(consent_key || ':' || granted, ',' order by consent_key)
     from public.authorization_consent_events
    where profile_id = '5eed0000-0000-4000-8000-000000000022' and signature_id is not null),
  'code_of_conduct:true,data_processing:true,health_data:true,image_rights:true,messaging_groups:false,newsletter:false,participation:true',
  'each consent is stored separately'
);
select ok(
  (select media_consent_at is not null from public.profiles where id = '5eed0000-0000-4000-8000-000000000022'),
  'image rights keep the media consent'
);
select ok(
  (select value is null and encode(value_encrypted, 'escape') not like '%Asma%'
     from public.custom_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000022'
      and question_id = (select id from run where label = 'health_info')),
  'the medical answer is encrypted'
);

-- 5. Optional consents -------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000022", "role": "authenticated", "aal": "aal1"}';
select lives_ok(
  $$ select public.set_optional_consent('image_rights', false) $$,
  'she can withdraw image rights'
);
select throws_ok(
  $$ select public.set_optional_consent('health_data', false) $$,
  '22023', null::text, 'a required consent is not withdrawn this way'
);
reset role;
select is(
  (select granted::text || '|' || (media_consent_at is null)::text
     from public.authorization_consent_events e
     join public.profiles p on p.id = e.profile_id
    where e.profile_id = '5eed0000-0000-4000-8000-000000000022' and e.consent_key = 'image_rights'
    order by e.decided_at desc, e.id desc limit 1),
  'false|true', 'the withdrawal is recorded and the media consent follows'
);

-- 4. Health data on the staff side -----------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select (answers ->> (select id::text from run where label = 'health_info')) || '|'
          || (answers ->> (select id::text from run where label = 'emergency_contact_name'))
     from public.get_participant_profile('5eed0000-0000-4000-8000-000000000022')),
  'Asma lleu, porto inhalador.|Olena', 'staff with participants.view_sensitive read them as answers'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select answers ->> (select id::text from run where label = 'health_info')
     from public.get_participant_profile('5eed0000-0000-4000-8000-000000000022')),
  'Asma lleu, porto inhalador.', 'an admin reads it'
);
select is(
  (select method || '|' || unable_to_draw from public.participant_authorizations('5eed0000-0000-4000-8000-000000000022')
    where method = 'app'),
  'app|true', 'staff see how she signed'
);

-- 3. Paper records ---------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.record_paper_authorization('5eed0000-0000-4000-8000-000000000023', '2026-09-20') $$,
  'staff record a paper signature'
);

-- 1. Versions -------------------------------------------------------------------------------------------

select throws_ok(
  $$ select public.publish_authorization_version('{"title": {"ca": "Autorització"}}'::jsonb) $$,
  '42501', null::text, 'publishing needs settings.organization'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.publish_authorization_version('{"title": {"ca": "Autorització"}}'::jsonb) $$,
  '23514', null::text, 'a version needs its sections and every consent'
);
insert into run (label, id)
select 'version2', public.publish_authorization_version(
  (select content from public.authorization_versions where id = (select id from run where label = 'version'))
  || jsonb_build_object('title', jsonb_build_object('ca', 'Autorització 2026/27, versió 2')));

reset role;
select throws_ok(
  $$ update public.authorization_versions set content = '{}'::jsonb
      where id = (select id from run where label = 'version2') $$,
  '55000', null::text, 'a published version is never edited'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000022", "role": "authenticated", "aal": "aal1"}';
select is(
  (select required::text || '|' || version_number from public.my_authorization_status()),
  'true|2', 'a new version makes her sign again'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000023", "role": "authenticated", "aal": "aal1"}';
select is(
  (select required from public.my_authorization_status()), false,
  'a paper record for the season still holds'
);

select * from finish();
rollback;
