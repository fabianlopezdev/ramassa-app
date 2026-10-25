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

-- Her answers travel by field (RAPP-661). Helpers: the app's keys of a payload
-- keyed by their fields (a choice by its option), a field's id, and her stored
-- answer to an app field (decrypted).
create function pg_temp.answers(p jsonb) returns jsonb language sql security definer as $$
  select coalesce(jsonb_object_agg(f.id::text, private.app_answer_value(f, e.value)), '{}'::jsonb)
    from jsonb_each(p) e
    join public.profile_fields f on f.org_id = '5eed0000-0000-4000-8000-000000000000' and f.system_key = e.key;
$$;
create function pg_temp.field(p_key text) returns text language sql security definer as $$
  select id::text from public.profile_fields
   where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = p_key;
$$;
create function pg_temp.stored(p_profile uuid, p_key text) returns jsonb language sql security definer as $$
  select private.system_field_answer(p_profile, p_key);
$$;
-- Her answer to an app field in a reader's `answers` (RAPP-662): a choice by its
-- option's key, anything else as text.
create function pg_temp.column_of(p_answers jsonb, p_key text) returns text language sql security definer as $$
  select coalesce(
    (select o.key from public.custom_question_options o
      where o.question_id = f.id and o.id::text = p_answers ->> f.id::text),
    p_answers ->> f.id::text)
    from public.profile_fields f
   where f.org_id = '5eed0000-0000-4000-8000-000000000000' and f.system_key = p_key;
$$;
grant execute on all functions in schema pg_temp to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

-- 1. The entity form --------------------------------------------------------------------------------

select ok(
  (select count(*) from public.list_supporting_entity_names()) >= 2,
  'the entity form offers the organization''s partner entities by name'
);

select throws_ok(
  $$ select public.create_entity_referral(jsonb_build_object(
       'first_name', 'Awa', 'last_name', 'Sylla', 'documentationStatus', 'missing')) $$,
  '23514', null::text, 'a referral needs the entity''s consent'
);

insert into referral_run (label, id)
select 'full', public.create_entity_referral(jsonb_build_object(
  'first_name', 'Awa', 'last_name', 'Sylla',
  'email', 'awa.sylla.rapp303@example.test',
  'documentationStatus', 'in_progress',
  'notes', 'Ve els dimarts.',
  'seasonNumber', 3,
  'consentConfirmed', true,
  -- Every answer by field (RAPP-661).
  'answers', pg_temp.answers(jsonb_build_object(
    'phone', '+34600303303',
    'date_of_birth', '1997-06-12',
    'nationality', 'Mali',
    'document_type', 'passport', 'document_number', 'ML123456',
    'city', 'Vic',
    'applicant_status', 'refugee',
    'supporting_entities', jsonb_build_array('Càritas Vic', 'SOS Racisme'),
    'reference_contact_name', 'Sílvia Bosch',
    'childcare_need', 'maybe',
    'specific_needs', jsonb_build_array('other'),
    'specific_needs_details', 'Necessita pauses.'))));

select isnt((select id from referral_run where label = 'full'), null, 'the full form is accepted with consent');

select throws_ok(
  $$ select public.create_entity_referral(jsonb_build_object(
       'first_name', 'Awa', 'last_name', 'Sylla', 'documentationStatus', 'missing',
       'answers', pg_temp.answers('{"applicant_status": "tourist"}'), 'consentConfirmed', true)) $$,
  '23514', null::text, 'an answer outside its choices is refused'
);

reset role;
select ok(
  not exists (select 1 from public.referral_custom_answers
               where referral_id = (select id from referral_run where label = 'full')
                 and encode(value_encrypted, 'escape') like any (array['%Mali%', '%pauses%'])),
  'the answers are stored encrypted'
);
select is(
  (select consent_confirmed_by from public.entity_referrals where id = (select id from referral_run where label = 'full')),
  '5eed0000-0000-4000-8000-000000000004'::uuid, 'the consent records who confirmed it'
);

-- 2. Who reads the answers -------------------------------------------------------------------------------

set local role authenticated;
select is(
  (select pg_temp.column_of(answers, 'applicant_status') || '|' || season_number::text
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
  (select (pg_temp.column_of(answers, 'applicant_status') is not null) or (pg_temp.column_of(answers, 'specific_needs') is not null)
          or (pg_temp.column_of(answers, 'document_number') is not null)
     from public.get_entity_referral((select id from referral_run where label = 'full'))),
  false, 'staff without the sensitive fields do not see the sensitive answers'
);
select is(
  (select pg_temp.column_of(answers, 'childcare_need')
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
  (select p.role || '|' || (pg_temp.stored(p.id, 'nationality') #>> '{}') || '|' || (pg_temp.stored(p.id, 'city') #>> '{}')
          || '|' || p.season_number || '|' || (pg_temp.stored(p.id, 'childcare_need') #>> '{}')
          || '|' || (select o.key from public.custom_question_options o
                      where o.id::text = pg_temp.stored(p.id, 'applicant_status') #>> '{}')
          || '|' || (pg_temp.stored(p.id, 'phone') #>> '{}')
          || '|' || (select string_agg(e, ',') from jsonb_array_elements_text(pg_temp.stored(p.id, 'supporting_entities')) e)
     from public.profiles p where p.id = (select id from referral_run where label = 'profile')),
  'invited|Mali|Vic|3|maybe|refugee|+34600303303|Càritas Vic,SOS Racisme',
  'accepting creates her profile with the entity''s answers'
);
select is(
  (select value is null and public.decrypt_field(value_encrypted) = '"Necessita pauses."' from public.custom_answers
    where profile_id = (select id from referral_run where label = 'profile') and question_id::text = pg_temp.field('specific_needs_details')),
  true, 'specific needs are stored encrypted on her profile'
);
select is(
  (select string_agg(f.system_key || ':' || a.source, ',' order by f.system_key) from public.custom_answers a
     join public.profile_fields f on f.id = a.question_id
    where a.profile_id = (select id from referral_run where label = 'profile') and f.system_key in ('applicant_status', 'nationality', 'document_type')),
  'applicant_status:entity,document_type:entity,nationality:entity',
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
  (select coalesce(pg_temp.column_of(answers, 'applicant_status'), 'hidden') || '|' || coalesce(pg_temp.column_of(answers, 'specific_needs'), 'hidden') || '|' || pg_temp.column_of(answers, 'childcare_need')
     from public.get_participant_profile((select id from referral_run where label = 'profile'))),
  'hidden|hidden|maybe', 'without participants.view_sensitive the sensitive answers stay hidden'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select pg_temp.column_of(answers, 'applicant_status') || '|' || pg_temp.column_of(answers, 'specific_needs_details')
     from public.get_participant_profile((select id from referral_run where label = 'profile'))),
  'refugee|Necessita pauses.', 'with it, staff read them'
);

select throws_ok(
  $$ select public.update_participant_profile((select id from referral_run where label = 'profile'),
       jsonb_build_object('answers', pg_temp.answers('{"childcare_need": "often"}'))) $$,
  '23514', null::text, 'a value outside its choices is refused on edit too'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select public.update_participant_profile((select id from referral_run where label = 'profile'),
  jsonb_build_object('season_number', 4,
                     'answers', pg_temp.answers('{"specific_needs": null, "specific_needs_details": ""}')));
reset role;
select is(
  (select (pg_temp.stored(p.id, 'specific_needs_details') #>> '{}') || '|' || p.season_number
     from public.profiles p where p.id = (select id from referral_run where label = 'profile')),
  'Necessita pauses.|4', 'staff without the sensitive fields cannot clear them, and change the rest'
);

-- 4 and 5. Her own reads and edits ----------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from referral_run where label = 'profile'),
                    'role', 'authenticated', 'aal', 'aal1')::text, true);
-- The season number is counted since RAPP-306: "her fourth season" is three
-- earlier ones, and the fourth counts once she signs it.
select is(
  (select pg_temp.column_of(answers, 'applicant_status') || '|' || pg_temp.column_of(answers, 'childcare_need') || '|' || season_number from public.get_own_profile()),
  'refugee|maybe|3', 'she reads her own answers'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
reset role;
update public.profiles set childcare_need = 'yes', season_number = 2 where id = '5eed0000-0000-4000-8000-000000000011';
set local role authenticated;
select lives_ok(
  $$ select public.update_own_profile(jsonb_build_object(
       'first_name', 'Amina', 'last_name', 'Al-Hassan', 'preferred_language', 'ca', 'media_consent', true,
       'answers', pg_temp.answers(jsonb_build_object(
         'date_of_birth', '1995-03-14', 'place_of_birth', 'Alep', 'nationality', 'Síria',
         'document_type', 'none', 'has_dependents', 'no', 'clothing_size', 'L', 'shoe_size', '39')))) $$,
  'an older build saves her profile without the new fields'
);
reset role;
select is(
  (select (pg_temp.stored(p.id, 'childcare_need') #>> '{}') || '|' || p.season_number
     from public.profiles p where p.id = '5eed0000-0000-4000-8000-000000000011'),
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
