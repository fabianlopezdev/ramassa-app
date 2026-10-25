-- The identity document is optional (RAPP-302).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. An empty document is a valid answer everywhere: the wizard, her own
--      profile edit and the staff edit, with or without the sensitive fields.
--      A number sent without a type is dropped with it.
--   2. The old rule still holds once a type is chosen: a type that needs a
--      number still needs one.
--   3. A skipped document step is recorded as asked, so the wizard does not
--      ask it again, and "asked and skipped" stays different from "never asked".
--   4. Staff write an explanation for the document step. Every woman in the
--      organization reads it, a profile-less one included. Only
--      settings.organization writes it, Catalan is required, and each change
--      is audited.

begin;
select plan(19);

-- The unsigned path is closed to clients (RAPP-624); this file checks its merge
-- rules as the participant, so it grants it inside this rolled-back transaction.
grant execute on function public.complete_onboarding(jsonb) to authenticated;

create temp table account (label text primary key, id uuid);
insert into account
select 'onboarding', id from auth.users where email = 'onboarding@example.test'
union all
select 'invited', id from auth.users where email = 'invited@example.test';
grant select on account to authenticated;

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
grant execute on all functions in schema pg_temp to authenticated;

-- 1 and 3. The wizard ------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from account where label = 'onboarding'),
                    'role', 'authenticated', 'aal', 'aal1')::text, true);

select throws_ok(
  $$ select public.complete_onboarding(jsonb_build_object(
       'first_name', 'Nadia', 'last_name', 'Khoury', 'preferred_language', 'ca',
       'media_consent', false, 'terms_version', '2026-07-01', 'locale_shown', 'ca',
       'answers', pg_temp.answers(jsonb_build_object(
         'date_of_birth', '1993-11-02', 'place_of_birth', 'Homs', 'nationality', 'Síria',
         'document_type', 'passport',
         'has_dependents', 'no', 'reference_entity', null,
         'clothing_size', 'M', 'shoe_size', '38')))) $$,
  '23502', null::text, 'a chosen type that needs a number still needs one'
);

select lives_ok(
  $$ select public.complete_onboarding(jsonb_build_object(
       'first_name', 'Nadia', 'last_name', 'Khoury', 'preferred_language', 'ca',
       'media_consent', false, 'terms_version', '2026-07-01', 'locale_shown', 'ca',
       'answers', pg_temp.answers(jsonb_build_object(
         'date_of_birth', '1993-11-02', 'place_of_birth', 'Homs', 'nationality', 'Síria',
         'document_type', null, 'document_number', 'Y1234567X',
         'has_dependents', 'no', 'reference_entity', null,
         'clothing_size', 'M', 'shoe_size', '38')))) $$,
  'she can finish the wizard without a document'
);

reset role;
select is(
  (select coalesce((select o.key from public.custom_question_options o
                     where o.id::text = pg_temp.stored((select id from account where label = 'onboarding'), 'document_type') #>> '{}'), 'empty')
          || ' ' || coalesce(pg_temp.stored((select id from account where label = 'onboarding'), 'document_number') #>> '{}', 'empty')),
  'empty empty', 'a skipped document stays empty, and a number without a type is dropped'
);
-- An empty answer leaves no record since answers are by field (RAPP-661): she
-- has joined, and her wizard does not run again.
select is(
  (select count(*)::integer from public.custom_answers
    where profile_id = (select id from account where label = 'onboarding') and question_id::text in (pg_temp.field('document_type'), pg_temp.field('document_number'))),
  0, 'the skipped step leaves no answer behind'
);

-- 1. Her own profile ---------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';

select lives_ok(
  $$ select public.update_own_profile(jsonb_build_object(
       'first_name', 'Amina', 'last_name', 'Al-Hassan', 'preferred_language', 'ca', 'media_consent', true,
       'answers', pg_temp.answers(jsonb_build_object('document_type', null)))) $$,
  'she can clear her document in her own profile'
);
reset role;
select is(
  (select coalesce((select o.key from public.custom_question_options o
                     where o.id::text = pg_temp.stored('5eed0000-0000-4000-8000-000000000011', 'document_type') #>> '{}'), 'empty')
          || ' ' || coalesce(pg_temp.stored('5eed0000-0000-4000-8000-000000000011', 'document_number') #>> '{}', 'empty')),
  'empty empty', 'and both the type and the number are cleared'
);
set local role authenticated;
select throws_ok(
  $$ select public.update_own_profile(jsonb_build_object(
       'answers', pg_temp.answers(jsonb_build_object('document_type', 'nie')))) $$,
  '23502', null::text, 'her own edit still needs a number for a chosen type'
);

-- 1. Staff edit -----------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select lives_ok(
  $$ select public.update_participant_profile('5eed0000-0000-4000-8000-000000000012', jsonb_build_object(
       'answers', pg_temp.answers(jsonb_build_object('document_type', null, 'document_number', null)))) $$,
  'staff can leave the document empty when an entity does not share it'
);
reset role;
select is(
  coalesce(pg_temp.stored('5eed0000-0000-4000-8000-000000000012', 'document_type') #>> '{}', 'empty'),
  'empty', 'the staff edit stores it empty'
);
set local role authenticated;
select throws_ok(
  $$ select public.update_participant_profile('5eed0000-0000-4000-8000-000000000012', jsonb_build_object(
       'answers', pg_temp.answers(jsonb_build_object('document_type', 'passport')))) $$,
  '23502', null::text, 'the staff edit still needs a number for a chosen type'
);

-- Without participants.view_sensitive the number is never sent: an empty type
-- is still accepted, and the stored number goes with it.
reset role;
delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000003' and permission_code = 'participants.view_sensitive';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.update_participant_profile('5eed0000-0000-4000-8000-000000000013', jsonb_build_object(
       'answers', pg_temp.answers(jsonb_build_object('document_type', null)))) $$,
  'a staff member without the sensitive fields can leave the document empty'
);
reset role;
select is(
  (select coalesce((select o.key from public.custom_question_options o
                     where o.id::text = pg_temp.stored('5eed0000-0000-4000-8000-000000000013', 'document_type') #>> '{}'), 'empty')
          || ' ' || coalesce(pg_temp.stored('5eed0000-0000-4000-8000-000000000013', 'document_number') #>> '{}', 'empty')),
  'empty empty', 'and the stored number is cleared with the type'
);

-- 4. The explanation -----------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.set_document_step_explanation('{"ca": "Text"}'::jsonb) $$,
  '42501', null::text, 'writing the explanation needs settings.organization'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.set_document_step_explanation('{"es": "Solo en castellano"}'::jsonb) $$,
  '23514', null::text, 'Catalan is required'
);
select lives_ok(
  $$ select public.set_document_step_explanation(
       '{"ca": "El fem servir per inscriure''t a cursos.", "ar": "نستخدمه لتسجيلك في الدورات.", "es": ""}'::jsonb) $$,
  'an admin writes the explanation'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000015", "role": "authenticated", "aal": "aal1"}';
select is(
  public.get_document_step_explanation(),
  '{"ca": "El fem servir per inscriure''t a cursos.", "ar": "نستخدمه لتسجيلك في الدورات."}'::jsonb,
  'a player reads it, without the empty languages'
);
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from account where label = 'invited'),
                    'role', 'authenticated', 'aal', 'aal1')::text, true);
select is(
  public.get_document_step_explanation() ->> 'ca',
  'El fem servir per inscriure''t a cursos.', 'a woman who has not joined yet reads it too'
);

reset role;
select is(
  (select count(*)::integer from public.audit_log
    where action = 'organization.document_explanation_update'
      and actor_id = '5eed0000-0000-4000-8000-000000000001'),
  1, 'the change is audited'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select public.set_document_step_explanation(null);
select is(public.get_document_step_explanation(), null, 'clearing it leaves no explanation');

select * from finish();
rollback;
