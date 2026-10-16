-- The survey CSV export (RAPP-402).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. A surveys.results holder with a recent authenticator code gets every
--      response of the survey, and one audit row that holds no answers.
--   2. Without a recent code the export is refused (step_up_required).
--   3. Someone without surveys.results, or a survey of no organization of
--      hers, is refused.
--   4. A sixth export in one minute is refused, as for the data exports.

begin;
select plan(9);

-- Exports from earlier runs would count towards the audit rows and the rate
-- limit; this transaction rolls back, so they come back afterwards.
delete from public.audit_log where action = 'survey_export';

-- 1. A recent code and surveys.results ----------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select is(
  jsonb_array_length(
    public.create_survey_export('5eed0000-0000-4000-8040-000000000001') -> 'rows'
  ),
  (select count(*)::int from public.survey_responses
    where survey_id = '5eed0000-0000-4000-8040-000000000001'),
  'the export holds every response of the survey'
);
select ok(
  (public.create_survey_export('5eed0000-0000-4000-8040-000000000001') -> 'rows' -> 0) ?& array[
    'id', 'player_id', 'player_name', 'language', 'answers', 'status', 'completed_at'
  ],
  'each row has the columns the CSV is built from'
);

reset role;
select is(
  (select count(*)::int from public.audit_log
    where action = 'survey_export'
      and target_type = 'survey'
      and target_id = '5eed0000-0000-4000-8040-000000000001'
      and actor_id = '5eed0000-0000-4000-8000-000000000001'),
  2,
  'each export writes one audit row'
);
select is(
  (select count(*)::int from public.audit_log
    where action = 'survey_export'
      and (changes ? 'rows' or changes ? 'answers' or changes::text like '%player_name%')),
  0,
  'and the audit row holds no answers or names'
);
select is(
  (select (changes ->> 'row_count')::int from public.audit_log
    where action = 'survey_export' order by created_at desc limit 1),
  (select count(*)::int from public.survey_responses
    where survey_id = '5eed0000-0000-4000-8040-000000000001'),
  'the audit row counts the rows'
);

-- 2. No recent code -----------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "password", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.create_survey_export('5eed0000-0000-4000-8040-000000000001') $$,
  '42501', 'step_up_required', 'without a recent authenticator code the export is refused'
);

-- 3. No surveys.results, or no such survey ----------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.create_survey_export('5eed0000-0000-4000-8040-000000000001') $$,
  '42501', null::text, 'a participant cannot export a survey'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.create_survey_export(gen_random_uuid()) $$,
  'P0002', 'survey not found', 'a survey that does not exist is refused'
);

-- 4. The rate limit -----------------------------------------------------------------------------

select public.create_survey_export('5eed0000-0000-4000-8040-000000000001');
select public.create_survey_export('5eed0000-0000-4000-8040-000000000001');
select public.create_survey_export('5eed0000-0000-4000-8040-000000000001');
select throws_ok(
  $$ select public.create_survey_export('5eed0000-0000-4000-8040-000000000001') $$,
  '42901', 'export rate limit exceeded', 'a sixth export in one minute is refused'
);

select * from finish();
rollback;
