-- Country and municipality answer types (RAPP-660, D6).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. The two lists are answer types a field may take, with no settings.
--   2. A country answer is a canonical (Catalan) country name; a municipality
--      answer is a canonical name of the IDESCAT catalog. Anything else, a
--      name in another language included, is refused.
--   3. The helpers stay private: no client role runs them.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(13);

-- 1. The types ----------------------------------------------------------------------------------------------

select ok('country' = any (private.custom_question_types()), 'country is an answer type');
select ok('municipality' = any (private.custom_question_types()), 'municipality is an answer type');
select ok(private.custom_question_settings_valid('country', '{}'::jsonb)
          and not private.custom_question_settings_valid('municipality', '{"max_items": 3}'::jsonb),
          'the list types take no settings');

-- 2. The answers ----------------------------------------------------------------------------------------------

select is(private.custom_answer_value_valid('country', '{}', '"Síria"', '{}'), true,
          'a canonical country name is a country answer');
select is(private.custom_answer_value_valid('country', '{}', '"Syria"', '{}'), false,
          'a country name in another language is refused');
select is(private.custom_answer_value_valid('country', '{}', '" Síria"', '{}'), false,
          'a padded country name is refused');
select is(private.custom_answer_value_valid('country', '{}', '["Síria"]', '{}'), false,
          'a list of countries is refused');
select is(private.custom_answer_value_valid('municipality', '{}', '"Vic"', '{}'), true,
          'a municipality of the catalog is a municipality answer');
select is(private.custom_answer_value_valid('municipality', '{}', '"Madrid"', '{}'), false,
          'a place outside Catalonia is refused');
select is(private.custom_answer_value_valid('municipality', '{}', '3', '{}'), false,
          'a number is refused');
select is(cardinality(private.country_names()), 249, 'every country of the shared list is named');

-- 3. Private ------------------------------------------------------------------------------------------------

select is(has_function_privilege('authenticated', 'private.is_municipality(text)', 'execute'), false,
          'a signed-in client cannot run the municipality check');
select is(has_function_privilege('anon', 'private.country_names()', 'execute'), false,
          'anon cannot run the country list');

select * from finish();
rollback;
