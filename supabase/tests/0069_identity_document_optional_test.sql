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

create temp table account (label text primary key, id uuid);
insert into account
select 'onboarding', id from auth.users where email = 'onboarding@example.test'
union all
select 'invited', id from auth.users where email = 'invited@example.test';
grant select on account to authenticated;

-- 1 and 3. The wizard ------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from account where label = 'onboarding'),
                    'role', 'authenticated', 'aal', 'aal1')::text, true);

select throws_ok(
  $$ select public.complete_onboarding(jsonb_build_object(
       'first_name', 'Nadia', 'last_name', 'Khoury', 'date_of_birth', '1993-11-02',
       'place_of_birth', 'Homs', 'nationality', 'Síria', 'preferred_language', 'ca',
       'document_type', 'passport',
       'has_dependents', false, 'num_dependents', 0, 'reference_entity', null,
       'clothing_size', 'M', 'shoe_size', '38',
       'media_consent', false, 'terms_version', '2026-07-01', 'locale_shown', 'ca')) $$,
  '23502', null::text, 'a chosen type that needs a number still needs one'
);

select lives_ok(
  $$ select public.complete_onboarding(jsonb_build_object(
       'first_name', 'Nadia', 'last_name', 'Khoury', 'date_of_birth', '1993-11-02',
       'place_of_birth', 'Homs', 'nationality', 'Síria', 'preferred_language', 'ca',
       'document_type', null, 'document_number', 'Y1234567X',
       'has_dependents', false, 'num_dependents', 0, 'reference_entity', null,
       'clothing_size', 'M', 'shoe_size', '38',
       'media_consent', false, 'terms_version', '2026-07-01', 'locale_shown', 'ca')) $$,
  'she can finish the wizard without a document'
);

reset role;
select is(
  (select coalesce(document_type, 'empty') || ' ' || coalesce(public.decrypt_field(document_number), 'empty')
     from public.profiles where id = (select id from account where label = 'onboarding')),
  'empty empty', 'a skipped document stays empty, and a number without a type is dropped'
);
select is(
  (select source from public.profile_answers
    where profile_id = (select id from account where label = 'onboarding')
      and question = 'document'),
  'player', 'the skipped step is recorded as asked, so the wizard does not ask it again'
);

-- 1. Her own profile ---------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';

select lives_ok(
  $$ select public.update_own_profile(jsonb_build_object(
       'first_name', 'Amina', 'last_name', 'Al-Hassan',
       'date_of_birth', '1995-03-14', 'place_of_birth', 'Alep',
       'nationality', 'Síria', 'preferred_language', 'ca',
       'document_type', null,
       'has_dependents', false, 'num_dependents', 0,
       'clothing_size', 'L', 'shoe_size', '39', 'media_consent', true)) $$,
  'she can clear her document in her own profile'
);
reset role;
select is(
  (select coalesce(document_type, 'empty') || ' ' || coalesce(public.decrypt_field(document_number), 'empty')
     from public.profiles where id = '5eed0000-0000-4000-8000-000000000011'),
  'empty empty', 'and both the type and the number are cleared'
);
set local role authenticated;
select throws_ok(
  $$ select public.update_own_profile(jsonb_build_object(
       'first_name', 'Amina', 'last_name', 'Al-Hassan',
       'date_of_birth', '1995-03-14', 'place_of_birth', 'Alep',
       'nationality', 'Síria', 'preferred_language', 'ca',
       'document_type', 'nie',
       'has_dependents', false, 'num_dependents', 0,
       'clothing_size', 'L', 'shoe_size', '39', 'media_consent', true)) $$,
  '23502', null::text, 'her own edit still needs a number for a chosen type'
);

-- 1. Staff edit -----------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select lives_ok(
  $$ select public.update_participant_profile('5eed0000-0000-4000-8000-000000000012', jsonb_build_object(
       'first_name', 'Fatima', 'last_name', 'Benali',
       'date_of_birth', '1990-05-01', 'place_of_birth', 'Fes',
       'nationality', 'Marroc', 'preferred_language', 'ca',
       'document_type', null,
       'has_dependents', false, 'num_dependents', 0,
       'clothing_size', 'M', 'shoe_size', '38', 'media_consent', false)) $$,
  'staff can leave the document empty when an entity does not share it'
);
reset role;
select is(
  (select coalesce(document_type, 'empty') from public.profiles where id = '5eed0000-0000-4000-8000-000000000012'),
  'empty', 'the staff edit stores it empty'
);
set local role authenticated;
select throws_ok(
  $$ select public.update_participant_profile('5eed0000-0000-4000-8000-000000000012', jsonb_build_object(
       'first_name', 'Fatima', 'last_name', 'Benali',
       'date_of_birth', '1990-05-01', 'place_of_birth', 'Fes',
       'nationality', 'Marroc', 'preferred_language', 'ca',
       'document_type', 'passport',
       'has_dependents', false, 'num_dependents', 0,
       'clothing_size', 'M', 'shoe_size', '38', 'media_consent', false)) $$,
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
       'first_name', 'Mariam', 'last_name', 'Sow',
       'date_of_birth', '1992-02-02', 'place_of_birth', 'Dakar',
       'nationality', 'Senegal', 'preferred_language', 'ca',
       'document_type', null,
       'has_dependents', false, 'num_dependents', 0,
       'clothing_size', 'M', 'shoe_size', '38', 'media_consent', false)) $$,
  'a staff member without the sensitive fields can leave the document empty'
);
reset role;
select is(
  (select coalesce(document_type, 'empty') || ' ' || coalesce(public.decrypt_field(document_number), 'empty')
     from public.profiles where id = '5eed0000-0000-4000-8000-000000000013'),
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
