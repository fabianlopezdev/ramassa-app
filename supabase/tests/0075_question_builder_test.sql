-- The staff question builder (RAPP-307), on Fitxa fields and placements (RAPP-656).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Only settings.organization builds; every change is audited.
--   2. A field's type never changes, its privacy level is fixed once it has
--      answers; a removed option is archived and the answer that chose it keeps it.
--   3. Sensitive answers are encrypted, and each level gates its readers.
--   4. A seasonal question keeps one answer per season.
--   5. A built-in question the app needs cannot be hidden.
--   6. Referral answers become hers when she is invited, and what staff typed wins.
--   7. The export holds Sensitive answers only in the full scope.
--
-- Seed: fields 8045-...1 (Normal yes/no/maybe, onboarding + referral form),
-- ...2 (Normal single choice, option ...3 archived), ...3 (Sensitive long
-- text, onboarding + season), ...4 (Personal, team only, no placement). Player 0011 answered 1, 2 and 3. Admin 0001, staff 0002, a
-- coach-preset staff member 0003 (no Personal level after the deletes below).

begin;
select plan(27);

create temp table run (label text primary key, id uuid);
grant all on run to authenticated;

-- 1. Building -------------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.save_intake_screen(null, '{"ca":"Prova"}'::jsonb, null, 'identity') $$,
  '42501', null::text, 'without settings.organization nobody builds'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.save_intake_screen(null, '{"en":"Test"}'::jsonb, null, 'identity') $$,
  '23514', null::text, 'a screen needs a Catalan title'
);
insert into run (label, id)
select 'screen', public.save_intake_screen(null, '{"ca":"Família","en":"Family"}'::jsonb, null, 'background');
insert into run (label, id)
select 'choice', public.save_profile_field(
  null, (select id from public.profile_sections
          where org_id = '5eed0000-0000-4000-8000-000000000000' and key = 'support'),
  'multiple_choice', '{"ca":"Qui viu amb tu?"}'::jsonb, null, 'personal', false,
  '[{"label":{"ca":"Fills"}},{"label":{"ca":"Parella"}},{"label":{"ca":"Altres"}}]'::jsonb);
select public.place_field((select id from run where label = 'choice'), 'onboarding',
                          (select id from run where label = 'screen')::text);
select is(
  (select count(*)::integer from public.custom_question_options
    where question_id = (select id from run where label = 'choice') and not is_archived),
  3, 'a choice field is saved with its options'
);
select throws_ok(
  $$ select public.save_profile_field(
       (select id from run where label = 'choice'), null,
       'single_choice', '{"ca":"Qui viu amb tu?"}'::jsonb, null, 'personal', false,
       '[{"label":{"ca":"A"}},{"label":{"ca":"B"}}]'::jsonb) $$,
  '23514', 'the type of a question never changes', 'the type never changes'
);
select throws_ok(
  $$ select public.save_profile_field(
       '5eed0000-0000-4000-8045-000000000002', null, 'single_choice',
       '{"ca":"Com et vas assabentar de Ramassà?"}'::jsonb, null, 'sensitive', false,
       '[{"id":"5eed0000-0000-4000-8046-000000000002","label":{"ca":"Xarxes"}},{"label":{"ca":"Una amiga"}}]'::jsonb) $$,
  '23514', 'the privacy level of a field is fixed once it has answers', 'the privacy level is fixed once answered'
);
select throws_ok(
  $$ select public.save_profile_field(
       null, (select id from public.profile_sections
               where org_id = '5eed0000-0000-4000-8000-000000000000' and key = 'support'),
       'single_choice', '{"ca":"Una"}'::jsonb, null, 'normal', false, '[{"label":{"ca":"Sola"}}]'::jsonb) $$,
  '23514', null::text, 'a choice field needs two options'
);
select throws_ok(
  $$ select public.place_field((select id from run where label = 'choice'), 'nowhere') $$,
  '23514', null::text, 'a placement is on her onboarding, the entity form or the season'
);

-- Removing "Un cartell" from field 2 archives it: player 0011's answer keeps it.
select public.save_profile_field(
  '5eed0000-0000-4000-8045-000000000002', null, 'single_choice',
  '{"ca":"Com et vas assabentar de Ramassà?"}'::jsonb, null, 'normal', false,
  '[{"id":"5eed0000-0000-4000-8046-000000000002","label":{"ca":"Xarxes"}},{"label":{"ca":"Una amiga"}}]'::jsonb);
reset role;
select ok(
  (select is_archived from public.custom_question_options where id = '5eed0000-0000-4000-8046-000000000001'),
  'an option left out is archived'
);
select is(
  (select label ->> 'ca' from public.custom_question_options where id = '5eed0000-0000-4000-8046-000000000002'),
  'Xarxes', 'an option kept is relabelled'
);
select is(
  (select value #>> '{}' from public.custom_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000011'
      and question_id = '5eed0000-0000-4000-8045-000000000002'),
  '5eed0000-0000-4000-8046-000000000003', 'the answer keeps the archived option it chose'
);
select ok(
  (select count(*) from public.audit_log
    where action in ('intake.screen_save', 'intake.field_save', 'intake.field_place')) >= 4,
  'every change is in the audit log'
);

-- 5. Built-in questions ------------------------------------------------------------------------------------

set local role authenticated;
select throws_ok(
  $$ select public.save_builtin_question_override('clothing_size', null, null, true, '{}'::jsonb) $$,
  '23514', 'the app needs this question, so it cannot be hidden', 'a size the stock reads cannot be hidden'
);
select lives_ok(
  $$ select public.save_builtin_question_override(
       'phone', '{"ca":"Mòbil"}'::jsonb, null, true, '{}'::jsonb) $$,
  'an optional built-in question is reworded and hidden'
);
select lives_ok(
  $$ select public.save_builtin_question_override(
       'childcare_need', null, null, false, '{"daily":{"hidden":true}}'::jsonb) $$,
  'an option of a built-in question is hidden, its stored value unchanged'
);

-- 3 and 4. Answers ---------------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
-- The details open on Sí: since RAPP-661 an answer whose condition does not hold goes.
select public.save_my_custom_answers(jsonb_build_object(
  '5eed0000-0000-4000-8045-000000000005', '5eed0000-0000-4000-8046-000000000004',
  '5eed0000-0000-4000-8045-000000000003', 'Ara treballo els dimarts.',
  '5eed0000-0000-4000-8045-000000000001', 'no'));
select throws_ok(
  $$ select public.save_my_custom_answers('{"5eed0000-0000-4000-8045-000000000004":"Sants"}'::jsonb) $$,
  '42501', null::text, 'she never answers a team-only field'
);
select throws_ok(
  $$ select public.save_my_custom_answers('{"5eed0000-0000-4000-8045-000000000001":"often"}'::jsonb) $$,
  '23514', null::text, 'an answer must fit its type'
);
select is(
  (select value #>> '{}' from public.my_custom_answers()
    where question_id = '5eed0000-0000-4000-8045-000000000003'),
  'Ara treballo els dimarts.', 'she reads her own Sensitive answer'
);

reset role;
select ok(
  (select value is null and encode(value_encrypted, 'escape') not like '%dimarts%'
     from public.custom_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000011'
      and question_id = '5eed0000-0000-4000-8045-000000000003'),
  'a Sensitive answer is stored encrypted'
);
-- A new season: the seasonal answer starts again, last season's stays.
insert into public.seasons (id, org_id, name, starts_on, is_current)
values ('0b5e0000-0000-4000-8000-000000000301', '5eed0000-0000-4000-8000-000000000000', '2027/28', '2027-09-01', false);
update public.seasons set is_current = (id = '0b5e0000-0000-4000-8000-000000000301')
 where org_id = '5eed0000-0000-4000-8000-000000000000';
set local role authenticated;
select public.save_my_custom_answers(
  '{"5eed0000-0000-4000-8045-000000000005":"5eed0000-0000-4000-8046-000000000004",
    "5eed0000-0000-4000-8045-000000000003":"Res, tot bé."}'::jsonb);
reset role;
select is(
  (select count(*)::integer from public.custom_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000011'
      and question_id = '5eed0000-0000-4000-8045-000000000003'),
  2, 'a field on the season form keeps one answer per season'
);

-- Staff 0003 without the Personal or Sensitive level sees Normal answers only.
delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000003'
   and permission_code in ('participants.view_personal', 'participants.view_sensitive');
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2"}';
select is(
  (select array_agg(question_id::text order by question_id)
     from public.participant_custom_answers('5eed0000-0000-4000-8000-000000000011')),
  array['5eed0000-0000-4000-8045-000000000001', '5eed0000-0000-4000-8045-000000000002'],
  'without the Sensitive level, a Sensitive answer is not read'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2"}';
select is(
  (select count(*)::integer from public.participant_custom_answers('5eed0000-0000-4000-8000-000000000011')
    where question_id = '5eed0000-0000-4000-8045-000000000003'),
  2, 'with it, every season of her Sensitive answer is read'
);

-- 6. Referral answers become hers; staff answers win.
select public.set_participant_custom_answers('5eed0000-0000-4000-8000-000000000022',
  '{"5eed0000-0000-4000-8045-000000000001":"yes"}'::jsonb);
reset role;
insert into public.referral_custom_answers (referral_id, question_id, org_id, value_encrypted)
values ('5eed0000-0000-4000-8010-000000000001', '5eed0000-0000-4000-8045-000000000002',
        '5eed0000-0000-4000-8000-000000000000', public.encrypt_field('"5eed0000-0000-4000-8046-000000000002"'));
update public.entity_referrals
   set referred_profile_id = '5eed0000-0000-4000-8000-000000000022', status = 'active',
       assigned_staff_id = '5eed0000-0000-4000-8000-000000000002'
 where id = '5eed0000-0000-4000-8010-000000000001';
select is(
  (select string_agg(question_id::text || '=' || (value #>> '{}') || '/' || source, ',' order by question_id)
     from public.custom_answers a
    -- Ramassà's fields: the app's answers are hers already (RAPP-660).
    where a.profile_id = '5eed0000-0000-4000-8000-000000000022'
      and exists (select 1 from public.profile_fields f where f.id = a.question_id and f.kind = 'custom')),
  '5eed0000-0000-4000-8045-000000000001=yes/staff,5eed0000-0000-4000-8045-000000000002=5eed0000-0000-4000-8046-000000000002/entity',
  'referral answers become hers when she is invited, and what staff typed wins'
);
select is(
  (select count(*)::integer from public.referral_custom_answers
    where referral_id = '5eed0000-0000-4000-8010-000000000001'),
  0, 'and the referral keeps no copy'
);

-- 7. Export.
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select ok(
  not exists (
    select 1 from jsonb_array_elements(
      public.create_data_export('custom_answers', 'default', 'csv') -> 'rows') row
     where row ->> 'privacy' = 'sensitive'),
  'the default export holds no Sensitive answer'
);
select ok(
  exists (
    select 1 from jsonb_array_elements(
      public.create_data_export('custom_answers', 'full', 'csv', null, null,
                                'Revisió anual de dades', true) -> 'rows') row
     where row ->> 'answer' = 'Ara treballo els dimarts.'),
  'the full export holds it, decrypted'
);

-- With no current season, her registration never stops on a seasonal question.
reset role;
update public.seasons set is_current = false where org_id = '5eed0000-0000-4000-8000-000000000000';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select lives_ok(
  $$ select public.save_my_custom_answers('{"5eed0000-0000-4000-8045-000000000003":"Igual que sempre."}'::jsonb) $$,
  'with no current season, a seasonal answer is skipped and her save goes through'
);
reset role;

-- A woman who started on her own has no profile yet, and still reads the questions.
reset role;
update public.seasons set is_current = true where id = '5eed0000-0000-4000-8040-000000000001';
insert into auth.users (id, email) values ('0b5e0000-0000-4000-8000-000000000399', 'nobody-yet@example.test');
set local role authenticated;
set local request.jwt.claims = '{"sub": "0b5e0000-0000-4000-8000-000000000399", "role": "authenticated", "aal": "aal1"}';
select ok(
  jsonb_array_length(public.intake_catalog() -> 'screens') > 0,
  'a woman with no profile yet reads the questions of the default organization'
);
reset role;

select * from finish();
rollback;
