-- Entities answer the season registration questions on a referral (RAPP-303).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. The entity form carries every question of the season form, only with
--      the entity's consent, and stores the answers encrypted.
--   2. The sender reads what it sent while the referral is pending; another
--      entity reads nothing; staff without participants.view_sensitive never
--      see the sensitive answers.
--   3. Accepting the referral creates her profile with the entity's answers,
--      recorded as given by the entity, and the referral keeps no copy of them.
--   4. Applicant status and specific needs are encrypted on the profile and
--      readable only with participants.view_sensitive. She reads her own.
--   5. Edits that do not send the new fields keep them (older app builds).

begin;
select plan(23);

create temp table referral_run (label text primary key, id uuid);
grant all on referral_run to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

-- 1. The entity form --------------------------------------------------------------------------------

select ok(
  (select count(*) from public.list_supporting_entity_names()) >= 2,
  'the entity form offers the organization''s partner entities by name'
);

select throws_ok(
  $$ select public.create_entity_referral(jsonb_build_object(
       'firstName', 'Awa', 'lastName', 'Sylla', 'documentationStatus', 'missing')) $$,
  '23514', null::text, 'a referral needs the entity''s consent'
);

insert into referral_run (label, id)
select 'full', public.create_entity_referral(jsonb_build_object(
  'firstName', 'Awa', 'lastName', 'Sylla',
  'email', 'awa.sylla.rapp303@example.test', 'phone', '+34600303303',
  'documentationStatus', 'in_progress',
  'notes', 'Ve els dimarts.',
  'dateOfBirth', '1997-06-12',
  'nationality', 'Mali',
  'documentType', 'passport', 'documentNumber', 'ML123456',
  'city', 'Vic',
  'applicantStatus', 'refugee',
  'supportingEntities', jsonb_build_array('Càritas Vic', 'SOS Racisme'),
  'referenceContactName', 'Sílvia Bosch',
  'seasonNumber', 3,
  'childcareNeed', 'maybe',
  'specificNeeds', 'Necessita pauses.',
  'consentConfirmed', true));

select isnt((select id from referral_run where label = 'full'), null, 'the full form is accepted with consent');

select throws_ok(
  $$ select public.create_entity_referral(jsonb_build_object(
       'firstName', 'Awa', 'lastName', 'Sylla', 'documentationStatus', 'missing',
       'applicantStatus', 'tourist', 'consentConfirmed', true)) $$,
  '23514', null::text, 'an answer outside its choices is refused'
);

reset role;
select ok(
  (select encode(intake_answers, 'escape') not like '%refugee%'
      and encode(intake_answers, 'escape') not like '%pauses%'
     from public.entity_referrals where id = (select id from referral_run where label = 'full')),
  'the answers are stored encrypted'
);
select is(
  (select consent_confirmed_by from public.entity_referrals where id = (select id from referral_run where label = 'full')),
  '5eed0000-0000-4000-8000-000000000004'::uuid, 'the consent records who confirmed it'
);

-- 2. Who reads the answers -------------------------------------------------------------------------------

set local role authenticated;
select is(
  (select intake_answers ->> 'applicant_status' || '|' || (intake_answers ->> 'season_number')
     from public.get_entity_referral((select id from referral_run where label = 'full'))),
  'refugee|3', 'the sender reads what it sent while the referral is pending'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select * from public.get_entity_referral((select id from referral_run where label = 'full')) $$,
  'P0002', null::text, 'another entity reads nothing'
);

reset role;
delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000003' and permission_code = 'participants.view_sensitive';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select (intake_answers ? 'applicant_status') or (intake_answers ? 'specific_needs')
          or (intake_answers ? 'document_number')
     from public.get_entity_referral((select id from referral_run where label = 'full'))),
  false, 'staff without the sensitive fields do not see the sensitive answers'
);
select is(
  (select intake_answers ->> 'childcare_need'
     from public.get_entity_referral((select id from referral_run where label = 'full'))),
  'maybe', 'but see the others, to accept her'
);

-- 3. Acceptance --------------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into referral_run (label, id)
select 'profile', profile_id from public.create_participant_invite(jsonb_build_object(
  'email', 'awa.sylla.rapp303@example.test',
  'first_name', 'Awa', 'last_name', 'Sylla',
  'reference_entity', 'Creu Roja Osona',
  'referral_id', (select id from referral_run where label = 'full')));

reset role;
select is(
  (select role || '|' || nationality || '|' || city || '|' || season_number || '|' || childcare_need
          || '|' || public.decrypt_field(applicant_status) || '|' || public.decrypt_field(phone)
          || '|' || array_to_string(supporting_entities, ',')
     from public.profiles where id = (select id from referral_run where label = 'profile')),
  'invited|Mali|Vic|3|maybe|refugee|+34600303303|Càritas Vic,SOS Racisme',
  'accepting creates her profile with the entity''s answers'
);
select is(
  (select public.decrypt_field(specific_needs) from public.profiles where id = (select id from referral_run where label = 'profile')),
  'Necessita pauses.', 'specific needs are stored encrypted on her profile'
);
select is(
  (select string_agg(question || ':' || source, ',' order by question) from public.profile_answers
    where profile_id = (select id from referral_run where label = 'profile')
      and question in ('applicant_status', 'nationality', 'season_number', 'first_name', 'document')),
  'applicant_status:entity,document:entity,first_name:staff,nationality:entity,season_number:entity',
  'the entity''s answers are recorded as given by the entity'
);
select is(
  (select (intake_answers is null)::text || '|' || (referred_phone is null)::text || '|'
          || (referred_email is null)::text || '|' || referred_first_name
     from public.entity_referrals where id = (select id from referral_run where label = 'full')),
  'true|true|true|Awa', 'the referral keeps no copy of her answers, only what its dashboard shows'
);

-- 4. Sensitive answers on the profile ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select coalesce(applicant_status, 'hidden') || '|' || coalesce(specific_needs, 'hidden') || '|' || childcare_need
     from public.get_participant_profile((select id from referral_run where label = 'profile'))),
  'hidden|hidden|maybe', 'without participants.view_sensitive the sensitive answers stay hidden'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select applicant_status || '|' || specific_needs
     from public.get_participant_profile((select id from referral_run where label = 'profile'))),
  'refugee|Necessita pauses.', 'with it, staff read them'
);

select throws_ok(
  $$ select public.update_participant_profile((select id from referral_run where label = 'profile'),
       '{"childcare_need": "often"}'::jsonb) $$,
  '22023', null::text, 'a value outside its choices is refused on edit too'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select public.update_participant_profile((select id from referral_run where label = 'profile'),
  '{"specific_needs": "", "season_number": 4}'::jsonb);
reset role;
select is(
  (select public.decrypt_field(specific_needs) || '|' || season_number
     from public.profiles where id = (select id from referral_run where label = 'profile')),
  'Necessita pauses.|4', 'staff without the sensitive fields cannot clear them, and change the rest'
);

-- 4 and 5. Her own reads and edits ----------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from referral_run where label = 'profile'),
                    'role', 'authenticated', 'aal', 'aal1')::text, true);
select is(
  (select applicant_status || '|' || childcare_need || '|' || season_number from public.get_own_profile()),
  'refugee|maybe|4', 'she reads her own answers'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
reset role;
update public.profiles set childcare_need = 'yes', season_number = 2 where id = '5eed0000-0000-4000-8000-000000000011';
set local role authenticated;
select lives_ok(
  $$ select public.update_own_profile(jsonb_build_object(
       'first_name', 'Amina', 'last_name', 'Al-Hassan',
       'date_of_birth', '1995-03-14', 'place_of_birth', 'Alep',
       'nationality', 'Síria', 'preferred_language', 'ca',
       'document_type', 'none',
       'has_dependents', false, 'num_dependents', 0,
       'clothing_size', 'L', 'shoe_size', '39', 'media_consent', true)) $$,
  'an older build saves her profile without the new fields'
);
reset role;
select is(
  (select childcare_need || '|' || season_number from public.profiles where id = '5eed0000-0000-4000-8000-000000000011'),
  'yes|2', 'and the new fields are kept'
);

select is(
  (select count(*)::integer from public.audit_log
    where target_id = (select id from referral_run where label = 'profile')
      and changes::text like '%pauses%'),
  0, 'the audit log never holds the specific needs'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select is(
  (select count(*)::integer from public.list_supporting_entity_names()),
  0, 'a player is not offered the entity list'
);
reset role;

select * from finish();
rollback;
