-- What she answered, for the team, from her answers (RAPP-662).
-- Run with: bunx supabase test db
--
-- What these assertions defend: the team learns which app questions she has
-- an answer to from her answers (`profile_answers` is no longer read), a
-- removed answer stops counting, and only a caller who may list her asks.
--
-- Seed: organization ...000, staff ...003, player ...011, entity ...004.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(5);

delete from public.profile_answers where profile_id = '5eed0000-0000-4000-8000-000000000011';

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select ok(
  array(select public.participant_answered_questions('5eed0000-0000-4000-8000-000000000011'))
    @> array['first_name', 'date_of_birth', 'nationality', 'document', 'city'],
  'the team reads what she answered from her answers');
select ok(
  not ('reference_contact_name' = any (array(select public.participant_answered_questions('5eed0000-0000-4000-8000-000000000011')))),
  'and not what she left unanswered');

reset role;
delete from public.custom_answers a using public.profile_fields f
 where f.id = a.question_id and f.system_key = 'city' and a.profile_id = '5eed0000-0000-4000-8000-000000000011';
set local role authenticated;
select ok(
  not ('city' = any (array(select public.participant_answered_questions('5eed0000-0000-4000-8000-000000000011')))),
  'a removed answer stops counting');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$select public.participant_answered_questions('5eed0000-0000-4000-8000-000000000011')$$,
  '42501', 'her answers need participants.view', 'an entity contact is refused');

reset role;
select ok(not has_function_privilege('anon', 'public.participant_answered_questions(uuid)', 'execute'),
  'anon cannot call it');

select * from finish();
rollback;
