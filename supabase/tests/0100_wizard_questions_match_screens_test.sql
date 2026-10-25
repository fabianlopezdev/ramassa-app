-- The database's wizard questions are the questions a screen asks (RAPP-618).
-- Run with: bunx supabase test db
--
-- Her app language is set by the language picker before the wizard and saved
-- with her answers; no wizard screen asks it. `my_questions_to_ask()` listed
-- it anyway, so the staff preview said she would be asked something her phone
-- never shows. It is an account setting and no field (RAPP-666, D2), so its
-- wording is the app's own: staff reword the questions of the wizard's fields.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(5);

select ok(
  not ('preferred_language' = any (private.wizard_intake_questions())),
  'her app language is not a wizard question'
);
select ok(
  'preferred_language' = any (private.required_intake_questions()),
  'it stays required: the app always sends it'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000096", "role": "authenticated"}';
select ok(
  not exists (select 1 from public.my_questions_to_ask() q where q = 'preferred_language'),
  'a new woman''s list of questions holds no question without a screen'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.save_builtin_question_override(
       'preferred_language', '{"ca": "La llengua de l''app"}'::jsonb, null, false) $$,
  '23514', 'not a built-in question',
  'her app language is no field, so it keeps the app''s own wording'
);
select throws_ok(
  $$ select public.set_intake_question_states('5eed0000-0000-4000-8000-000000000098',
       '{"preferred_language": "ask"}'::jsonb) $$,
  '22023', 'unknown question preferred_language',
  'no Ask or Don''t ask on a question no screen asks'
);

select * from finish();
rollback;
