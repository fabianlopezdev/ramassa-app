-- Staff confirm what her guided registration asks while creating her (RAPP-618).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. An invitation saves the confirmed questions with the invitation, audited
--      as on her page, and her wizard then asks exactly what the preview said
--      (the same case as packages/shared/onboarding/wizard-preview.test.ts).
--   2. A refused choice (Don't ask on an unanswered required question, an
--      unknown question or state, choices without her name) creates nothing:
--      no account, no invitation, no profile.
--   3. The design role sets the questions of the test player it creates, and
--      of no real woman.
--   4. Which fields a referral answers is told to staff who invite, as keys
--      only, and to nobody else.
--
-- Seed: staff ...002, the entity contact ...004, the design account ...097, the invited
-- woman ...098, the pending referral ...8010-...001.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(19);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

-- 1. The confirmed questions travel with the invitation -------------------------------------------

create temp table created on commit drop as
  select * from public.create_participant_invite(
    '{"email":"nova.confirmada@example.test","first_name":"Nova","last_name":"Confirmada",
      "question_states":{"first_name":"ask","phone":"skip"}}'::jsonb);

select is(
  (select array_agg(s.question || ':' || s.state order by s.question)
     from public.participant_question_states((select profile_id from created)) s),
  array['first_name:ask', 'phone:skip'],
  'the invitation saved the confirmed questions'
);
reset role;
select is(
  (select changes from public.audit_log
    where action = 'profile.intake_questions_update' and target_id = (select profile_id from created)),
  '{"first_name": {"old": "auto", "new": "ask"}, "phone": {"old": "auto", "new": "skip"}}'::jsonb,
  'each choice is audited with its old and new state, as on her page'
);
select is(
  (select (changes ->> 'question_states')::boolean from public.audit_log
    where action = 'invite.create' and target_id = (select invite_id from created)),
  true,
  'the invitation''s audit row says it carried choices'
);
set local role authenticated;

-- Her wizard asks what the preview showed: everything but her last name (answered,
-- Auto) and her phone (Don't ask). The language is chosen before the wizard and is
-- on no wizard screen, so the preview leaves it out.
set local request.jwt.claims to '{}';
select set_config('request.jwt.claims',
  json_build_object('sub', (select profile_id from created), 'role', 'authenticated', 'aal', 'aal1')::text,
  true);
select is(
  array(select q from public.my_questions_to_ask() q where q <> 'preferred_language'),
  array['first_name', 'date_of_birth', 'place_of_birth', 'nationality', 'document', 'address',
        'city', 'postal_code', 'reference_entity', 'reference_contact_name', 'dependents',
        'clothing_size', 'shoe_size', 'applicant_status', 'supporting_entities', 'childcare_need',
        'specific_needs'],
  'her wizard asks exactly what staff confirmed'
);

-- 2. A refused choice creates nothing --------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select * from public.create_participant_invite(
       '{"email":"nova.refusada@example.test","first_name":"Nova","last_name":"Refusada",
         "question_states":{"date_of_birth":"skip"}}'::jsonb) $$,
  '23514', 'a required question needs an answer before it can be hidden: date_of_birth',
  'Don''t ask on an unanswered required question is refused'
);
select throws_ok(
  $$ select * from public.create_participant_invite(
       '{"email":"nova.refusada@example.test","first_name":"Nova","last_name":"Refusada",
         "question_states":{"avatar":"ask"}}'::jsonb) $$,
  '22023', 'unknown question avatar',
  'a question the wizard does not ask is refused'
);
select throws_ok(
  $$ select * from public.create_participant_invite(
       '{"email":"nova.refusada@example.test","first_name":"Nova","last_name":"Refusada",
         "question_states":{"phone":"maybe"}}'::jsonb) $$,
  '22023', 'unknown state maybe',
  'an unknown state is refused'
);
select throws_ok(
  $$ select * from public.create_participant_invite(
       '{"email":"nova.refusada@example.test","question_states":{"phone":"skip"}}'::jsonb) $$,
  '22023', 'the questions she is asked need her first and last name',
  'choices without her name are refused'
);
reset role;
select is(
  (select count(*)::integer from public.invites where email = 'nova.refusada@example.test'),
  0,
  'no refused attempt left an invitation'
);
select is(
  (select count(*)::integer from auth.users where email = 'nova.refusada@example.test'),
  0,
  'no refused attempt left an account (or a profile)'
);
set local role authenticated;

-- Don't ask on a required question staff answered is allowed.
select lives_ok(
  $$ select * from public.create_participant_invite(
       '{"email":"nova.entitat@example.test","first_name":"Nova","last_name":"Entitat",
         "reference_entity":"Creu Roja","question_states":{"reference_entity":"skip"}}'::jsonb) $$,
  'Don''t ask on a required question staff answered is saved'
);

-- 3. The design role and its test players ------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
create temp table test_player on commit drop as
  select * from public.create_participant_invite(
    '{"email":"prova.preguntes@example.test","first_name":"Prova","last_name":"Preguntes",
      "is_test_account":true,"question_states":{"phone":"skip"}}'::jsonb);
select is(
  (select array_agg(s.question || ':' || s.state)
     from public.participant_question_states((select profile_id from test_player)) s),
  array['phone:skip'],
  'the design role sets the questions of the test player it creates'
);
select lives_ok(
  $$ select public.set_intake_question_states((select profile_id from test_player), '{"phone":"ask"}'::jsonb) $$,
  'and changes them on her page'
);
select throws_ok(
  $$ select public.set_intake_question_states('5eed0000-0000-4000-8000-000000000098', '{"phone":"ask"}'::jsonb) $$,
  '42501', 'setting question states needs participants.view_personal',
  'the design role cannot set a real invited woman''s questions'
);
select throws_ok(
  $$ select * from public.participant_question_states('5eed0000-0000-4000-8000-000000000098') $$,
  '42501', 'reading question states needs participants.view_personal',
  'nor read them'
);
select is(
  (select count(*)::integer from public.intake_question_states
    where profile_id = '5eed0000-0000-4000-8000-000000000098'),
  0,
  'a real woman''s rows are not readable to the design role'
);

-- 4. Which fields a referral answers -------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  array(select public.referral_answer_keys('5eed0000-0000-4000-8010-000000000001')),
  array['applicant_status', 'childcare_need', 'city', 'date_of_birth', 'document_type',
        'nationality', 'phone', 'reference_contact_name', 'season_number', 'specific_needs',
        'supporting_entities'],
  'staff who invite learn which fields the referral answers, sensitive ones included'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.referral_answer_keys('5eed0000-0000-4000-8010-000000000001') $$,
  '42501', 'reading a referral to invite her needs participants.invite',
  'the entity contact who sent it is refused'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.referral_answer_keys('5eed0000-0000-4000-8010-000000000001') $$,
  '42501', 'reading a referral to invite her needs participants.invite',
  'the design role is refused'
);

select * from finish();
rollback;
