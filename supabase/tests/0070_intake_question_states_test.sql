-- Staff choose which wizard questions a woman is asked (RAPP-301).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Her wizard asks: Ask always, Auto only when nobody answered, Don't ask
--      never. A hidden required question whose answer is cleared later is
--      asked after all, so a finished profile is always complete.
--   2. Don't ask on a required question needs an answer first.
--   3. Only staff with participants.view_personal read or write the states,
--      only for their organization, only before she joins. She reads only the
--      resulting list.
--   4. Every change is audited with the old and new state.
--
-- The seed gives the invited woman (Mariam, ...098) staff answers for her
-- names, date of birth, nationality, entity and clothing size, plus two
-- states: clothing size Ask and phone Don't ask.

begin;
select plan(18);

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

set local role authenticated;

-- 1. What her wizard asks ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000098", "role": "authenticated", "aal": "aal1"}';
select ok(
  'clothing_size' in (select public.my_questions_to_ask()),
  'Ask: she reviews the clothing size staff entered'
);
select ok(
  'phone' not in (select public.my_questions_to_ask()),
  'Don''t ask: she is not asked her phone'
);
select ok(
  'nationality' not in (select public.my_questions_to_ask())
  and 'shoe_size' in (select public.my_questions_to_ask()),
  'Auto: asked only what nobody answered'
);
select ok(
  'avatar' not in (select public.my_questions_to_ask()),
  'the avatar is on no wizard screen'
);
select throws_ok(
  $$ select * from public.participant_question_states('5eed0000-0000-4000-8000-000000000098') $$,
  '42501', null::text, 'she cannot read the staff settings'
);
select throws_ok(
  $$ select public.set_intake_question_states('5eed0000-0000-4000-8000-000000000098', '{"phone": "ask"}') $$,
  '42501', null::text, 'she cannot change them'
);
select is(
  (select count(*)::integer from public.intake_question_states),
  0, 'she reads none of the staff settings directly'
);

-- 2 and 4. Staff set the states -------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select is(
  (select string_agg(question || ':' || state, ',' order by question)
     from public.participant_question_states('5eed0000-0000-4000-8000-000000000098')),
  -- The seed also asks her one Ramassà field (RAPP-643), keyed custom:<field id>.
  'clothing_size:ask,custom:5eed0000-0000-4000-8045-000000000001:ask,phone:skip',
  'staff read her states'
);
select throws_ok(
  $$ select public.set_intake_question_states('5eed0000-0000-4000-8000-000000000098', '{"shoe_size": "skip"}') $$,
  '23514', null::text, 'a required question needs an answer before it can be hidden'
);
select lives_ok(
  $$ select public.set_intake_question_states('5eed0000-0000-4000-8000-000000000098',
       '{"nationality": "skip", "document": "skip", "reference_entity": "ask", "clothing_size": "auto"}') $$,
  'staff hide an answered required question and an optional one, ask another, reset one'
);
select is(
  (select string_agg(question || ':' || state, ',' order by question)
     from public.participant_question_states('5eed0000-0000-4000-8000-000000000098')),
  'custom:5eed0000-0000-4000-8045-000000000001:ask,document:skip,nationality:skip,phone:skip,reference_entity:ask',
  'Auto is stored as no row'
);

reset role;
select is(
  (select changes from public.audit_log
    where action = 'profile.intake_questions_update'
      and target_id = '5eed0000-0000-4000-8000-000000000098'
    order by created_at desc limit 1),
  '{"document": {"new": "skip", "old": "auto"}, "nationality": {"new": "skip", "old": "auto"}, "clothing_size": {"new": "auto", "old": "ask"}, "reference_entity": {"new": "ask", "old": "auto"}}'::jsonb,
  'every change is audited with the old and new state'
);
set local role authenticated;

select throws_ok(
  $$ select public.set_intake_question_states('5eed0000-0000-4000-8000-000000000098', '{"avatar": "ask"}') $$,
  '22023', null::text, 'a question the wizard does not ask is refused'
);
select throws_ok(
  $$ select public.set_intake_question_states('5eed0000-0000-4000-8000-000000000011', '{"phone": "ask"}') $$,
  '55000', null::text, 'the states are read-only once she has joined'
);
select throws_ok(
  $$ select public.set_intake_question_states('00000000-0000-4000-8000-000000000999', '{"phone": "ask"}') $$,
  '42501', null::text, 'a woman outside the organization is refused'
);

-- 1. A hidden required question whose answer is cleared is asked after all ------------------------------

select public.update_participant_profile('5eed0000-0000-4000-8000-000000000098',
  jsonb_build_object('answers', pg_temp.answers('{"nationality": ""}')));
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000098", "role": "authenticated", "aal": "aal1"}';
select ok(
  'nationality' in (select public.my_questions_to_ask()),
  'a cleared required answer is asked, even when hidden'
);
select ok(
  'reference_entity' in (select public.my_questions_to_ask())
  and 'document' not in (select public.my_questions_to_ask()),
  'and the other states take effect'
);

-- 3. Permission -----------------------------------------------------------------------------------------

reset role;
delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000003' and permission_code = 'participants.view_personal';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.set_intake_question_states('5eed0000-0000-4000-8000-000000000098', '{"phone": "ask"}') $$,
  '42501', null::text, 'staff without participants.view_personal cannot set them'
);

select * from finish();
rollback;
