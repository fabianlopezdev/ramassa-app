begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);
select has_column('public', 'custom_questions', 'show_when_question_id', 'conditional questions identify their controller');
select is((select count(*)::integer from public.custom_questions where id='5eed0000-0000-4000-8045-000000000005' and question_type='single_choice' and privacy='sensitive'), 1, 'the participation gate is a sensitive single choice');
select is((select to_jsonb(q)->>'show_when_question_id' from public.custom_questions q where id='5eed0000-0000-4000-8045-000000000003'), '5eed0000-0000-4000-8045-000000000005', 'the existing encrypted detail question follows the gate');
select throws_ok($$ update public.custom_questions set show_when_question_id='5eed0000-0000-4000-8045-000000000002', show_when_option_id='5eed0000-0000-4000-8046-000000000001' where id='5eed0000-0000-4000-8045-000000000003' $$, '23514', null::text, 'a controller on another screen is rejected');
select throws_ok($$ update public.custom_questions set show_when_option_id='5eed0000-0000-4000-8046-000000000001' where id='5eed0000-0000-4000-8045-000000000003' $$, '23514', null::text, 'an option belonging to another question is rejected');
select throws_ok($$ update public.custom_questions set org_id='00000000-0000-4000-8000-000000000099' where id='5eed0000-0000-4000-8045-000000000003' $$, '23514', null::text, 'a cross-organisation condition is rejected before any foreign-key write');
set local role authenticated;
set local request.jwt.claims = '{"sub":"5eed0000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal1"}';
select throws_ok($$ update public.custom_questions set show_when_question_id=null, show_when_option_id=null where id='5eed0000-0000-4000-8045-000000000003' $$, '42501', null::text, 'a player cannot change question conditions');
select lives_ok($$ select public.save_my_custom_answers('{"5eed0000-0000-4000-8045-000000000005":"5eed0000-0000-4000-8046-000000000005","5eed0000-0000-4000-8045-000000000003":null}'::jsonb) $$, 'an explicit No and detail removal use the existing answer API');
select is((select value #>> '{}' from public.my_custom_answers() where question_id='5eed0000-0000-4000-8045-000000000005'), '5eed0000-0000-4000-8046-000000000005', 'No round-trips as an answer rather than an unanswered question');
reset role;
select ok(
  exists(select 1 from public.custom_answers where profile_id='5eed0000-0000-4000-8000-000000000011' and question_id='5eed0000-0000-4000-8045-000000000005' and value is null and value_encrypted is not null)
  and not exists(select 1 from public.custom_answers where profile_id='5eed0000-0000-4000-8000-000000000011' and question_id='5eed0000-0000-4000-8045-000000000003'),
  'the gate remains encrypted and stale details are removed'
);
select * from finish();
rollback;
