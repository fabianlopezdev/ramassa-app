-- One answer check on both sides, trimmed and counted the same way (RAPP-610).
-- Run with: bunx supabase test db
--
-- The full case list runs through `save_my_custom_answers` and the Zod schema
-- in tests/custom-answer-parity.test.ts. These assertions pin the helpers.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(6);

select is(private.js_trim(E'\t  Hola　\n'), 'Hola', 'trims what JavaScript trims');
select is(private.js_trim(E'\u0085Hola'), E'\u0085Hola', 'and nothing JavaScript keeps');
select ok(private.custom_answer_is_empty(to_jsonb(E'\t\n'::text)), 'a tab and a new line are no answer');
select ok(not private.custom_answer_is_empty('"Hola"'::jsonb), 'text is an answer');
select is(private.custom_answer_tidied('yes_no', '" yes"'::jsonb), '" yes"'::jsonb,
  'a fixed value is checked exactly as sent');
select is(private.custom_answer_tidied('short_text', to_jsonb(E'\u00a0Hola '::text)), '"Hola"'::jsonb,
  'free text loses its padding');

select * from finish();
rollback;
