-- Survey scheduling, audience visibility, resumable attributed responses,
-- aggregate source rows, encryption, RLS, and RGPD lifecycle.
begin;
select plan(36);

select has_table('public', 'surveys', 'surveys table exists');
select has_table('public', 'survey_questions', 'survey questions table exists');
select has_table('public', 'survey_responses', 'survey responses table exists');
select has_function('public', 'save_survey', 'staff survey save RPC exists');
select has_function('public', 'list_player_surveys', 'player survey prompt RPC exists');
select has_function('public', 'save_survey_response', 'resumable response RPC exists');
select has_function('public', 'list_survey_responses', 'staff response result RPC exists');

select is(
  (select count(*)::integer from public.surveys where id = '5eed0000-0000-4000-8040-000000000001'),
  1,
  'the published multilingual fixture survey is seeded'
);
select is(
  (select count(*)::integer from public.survey_questions
   where survey_id = '5eed0000-0000-4000-8040-000000000001'),
  4,
  'the fixture covers rating, choice, yes-no, and free text'
);
select is(
  (select string_agg(question_type, ',' order by sort_order) from public.survey_questions
   where survey_id = '5eed0000-0000-4000-8040-000000000001'),
  'rating,multiple_choice,yes_no,free_text',
  'question order and types are durable'
);
select ok(
  (select encode(answers_encrypted, 'escape') not like '%تجربة ممتازة%'
   from public.survey_responses
   where id = '5eed0000-0000-4000-8042-000000000001'),
  'free-text answers are encrypted at rest'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ select public.save_survey(
    null,
    '{"ca":"QA","es":"QA","en":"QA builder survey","ar":"QA","fa":"QA"}'::jsonb,
    null,
    now() + interval '1 hour',
    now() + interval '2 days',
    'all',
    '{}'::jsonb,
    '[{
      "id":"5eed0000-0000-4000-8041-000000000099",
      "type":"rating",
      "prompt":{"ca":"QA?","es":"QA?","en":"QA?","ar":"QA?","fa":"QA?"},
      "options":null,
      "required":true,
      "sortOrder":10
    }]'::jsonb
  ) $$,
  'staff can save a reviewed multilingual survey definition'
);
select is(
  (select count(*)::integer from public.list_surveys() where title->>'en' = 'QA builder survey'),
  1,
  'the staff survey list returns the saved builder definition'
);
select throws_ok(
  $$ select public.save_survey(
    null,
    '{"ca":"QA","es":"QA","en":"QA","ar":"QA","fa":"QA"}'::jsonb,
    null,
    now() + interval '1 hour',
    now() + interval '2 days',
    'all',
    '{}'::jsonb,
    '[{
      "id":"5eed0000-0000-4000-8041-000000000098",
      "type":"multiple_choice",
      "prompt":{"ca":"QA?","es":"QA?","en":"QA?","ar":"QA?","fa":"QA?"},
      "options":[
        {"id":"same","label":{"ca":"A","es":"A","en":"A","ar":"A","fa":"A"}},
        {"id":"same","label":{"ca":"B","es":"B","en":"B","ar":"B","fa":"B"}}
      ],
      "required":true,
      "sortOrder":10
    }]'::jsonb
  ) $$,
  '23514',
  'SURVEYS/INVALID_DEFINITION',
  'multiple-choice option identifiers must be unique'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated"}';

select is(
  (select count(*)::integer from public.list_player_surveys()
   where id = '5eed0000-0000-4000-8040-000000000001'),
  1,
  'an eligible Arabic player sees the open in-app survey prompt'
);
select is(
  (select title->>'ar' from public.list_player_surveys()
   where id = '5eed0000-0000-4000-8040-000000000001'),
  'رأيك في التدريب',
  'the player prompt keeps the Arabic survey title'
);
select is(
  (select count(*)::integer from public.list_player_surveys()
   where id = '5eed0000-0000-4000-8040-000000000002'),
  0,
  'a future survey is not visible before publication'
);
select is(
  (select count(*)::integer from public.list_player_surveys()
   where id = '5eed0000-0000-4000-8040-000000000003'),
  0,
  'a closed survey is not visible'
);
select is(
  (select count(*)::integer from public.survey_responses),
  0,
  'RLS hides other players attributed responses'
);

select lives_ok(
  $$ select public.save_survey_response(
    '5eed0000-0000-4000-8040-000000000001',
    '{"5eed0000-0000-4000-8041-000000000001":4}'::jsonb,
    false
  ) $$,
  'a player can save a partial response for resume'
);
select is(
  (select status from public.get_own_survey_response('5eed0000-0000-4000-8040-000000000001')),
  'in_progress',
  'the partial response remains in progress'
);
select is(
  (select answers->>'5eed0000-0000-4000-8041-000000000001'
   from public.get_own_survey_response('5eed0000-0000-4000-8040-000000000001')),
  '4',
  'resume returns the saved rating'
);
select throws_ok(
  $$ select public.save_survey_response(
    '5eed0000-0000-4000-8040-000000000001',
    '{"5eed0000-0000-4000-8041-000000000001":6}'::jsonb,
    false
  ) $$,
  '23514',
  'SURVEYS/INVALID_ANSWER',
  'rating answers outside one through five are rejected'
);
select lives_ok(
  $$ select public.save_survey_response(
    '5eed0000-0000-4000-8040-000000000001',
    '{
      "5eed0000-0000-4000-8041-000000000001":4,
      "5eed0000-0000-4000-8041-000000000002":"training",
      "5eed0000-0000-4000-8041-000000000003":true,
      "5eed0000-0000-4000-8041-000000000004":"تجربة ممتازة"
    }'::jsonb,
    true
  ) $$,
  'all four answer types can complete the survey'
);
select is(
  (select status from public.get_own_survey_response('5eed0000-0000-4000-8040-000000000001')),
  'completed',
  'completion is durable'
);
select throws_ok(
  $$ select public.save_survey_response(
    '5eed0000-0000-4000-8040-000000000001',
    '{"5eed0000-0000-4000-8041-000000000001":5}'::jsonb,
    false
  ) $$,
  'P0001',
  'SURVEYS/ALREADY_COMPLETED',
  'a completed survey cannot be answered twice'
);
select throws_ok(
  $$ select public.save_survey_response(
    '5eed0000-0000-4000-8040-000000000003', '{}'::jsonb, false
  ) $$,
  'P0001',
  'SURVEYS/CLOSED',
  'the closing instant is enforced on writes'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000012","role":"authenticated"}';
select is(
  (select count(*)::integer from public.survey_responses),
  0,
  'a second player cannot read the first player response row'
);
select is(
  (select count(*)::integer from public.get_own_survey_response(
    '5eed0000-0000-4000-8040-000000000001'
  )),
  0,
  'a second player cannot read the first player decrypted answers'
);

set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  (select count(*)::integer from public.list_survey_responses(
    '5eed0000-0000-4000-8040-000000000001'
  )),
  3,
  'staff sees two seeded fixtures plus the completed QA response'
);
select is(
  (select count(*)::integer from public.list_survey_responses(
    '5eed0000-0000-4000-8040-000000000001'
  ) where answers->>'5eed0000-0000-4000-8041-000000000004' = 'تجربة ممتازة'),
  2,
  'staff can read attributed Arabic answers for results and export'
);
select is(
  (select count(*)::integer from public.audit_log
   where action = 'survey_response_completed'
     and target_id = '5eed0000-0000-4000-8040-000000000001'),
  1,
  'completion is audited without answer content'
);
select ok(
  (select bool_and(changes ? 'response_id' and not changes ? 'answers') from public.audit_log
   where action = 'survey_response_completed'
     and target_id = '5eed0000-0000-4000-8040-000000000001'),
  'the audit contains an identifier but no survey answers'
);

reset role;
select is(
  (select count(*)::integer from pg_class
   where oid in ('public.surveys'::regclass, 'public.survey_questions'::regclass,
                 'public.survey_responses'::regclass)
     and relrowsecurity and relforcerowsecurity),
  3,
  'RLS is enabled and forced on all survey tables'
);
select is(
  (select count(*)::integer from public.personal_data_disposition()
   where table_name = 'survey_responses'
     and participant_column = 'player_id'
     and disposition = 'purge'),
  1,
  'RGPD registry marks attributed responses for purge'
);
select is(
  (select count(*)::integer from pg_indexes
   where schemaname = 'public'
     and indexname in (
       'survey_questions_survey_id_idx',
       'survey_responses_player_id_idx',
       'survey_responses_survey_id_idx',
       'surveys_event_id_idx'
     )),
  4,
  'foreign keys and response access paths are indexed'
);

select * from finish();
rollback;
