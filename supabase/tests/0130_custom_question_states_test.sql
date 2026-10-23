-- Ramassà's own questions are chosen per player too (RAPP-643).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. An invitation saves Ask and Don't ask on staff questions with the
--      built-in choices, keyed `custom:<id>`, audited in the same row, and
--      her page reads them back the same way.
--   2. Don't ask on a required staff question nobody answered, an unknown or
--      archived question, or a question of another form, creates nothing.
--   3. Her phone reads what her wizard asks, never the setting: Ask asks,
--      Don't ask leaves out, and a required question without an answer is
--      asked after all.
--   4. Nobody writes the table directly, and she cannot read it.
--
-- Seed: admin ...001 and staff ...002 of organization ...000.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(11);

create temp table run (label text primary key, id uuid) on commit drop;
grant all on run to authenticated;

-- Two staff questions on one screen: one optional, one required.
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into run (label, id)
values ('screen', public.save_intake_screen(null, '{"ca": "Preferències"}'::jsonb, null, 'logistics'));
insert into run (label, id)
select 'optional', public.save_custom_question(
  null, (select id from run where label = 'screen'), 'short_text', '{"ca": "Un dia preferit"}'::jsonb,
  null, 'normal', array['wizard']);
insert into run (label, id)
select 'required', public.save_custom_question(
  null, (select id from run where label = 'screen'), 'short_text', '{"ca": "Talla de samarreta"}'::jsonb,
  null, 'normal', array['wizard']);
select public.save_custom_question_required((select id from run where label = 'required'), true);

-- 1. The invitation carries them ----------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
create temp table created on commit drop as
  select * from public.create_participant_invite(jsonb_build_object(
    'email', 'nova.643@example.test', 'first_name', 'Nova', 'last_name', 'Triada',
    'question_states', jsonb_build_object(
      'phone', 'skip',
      'custom:' || (select id from run where label = 'optional'), 'skip',
      'custom:' || (select id from run where label = 'required'), 'ask')));

select is(
  (select count(*)::integer
     from public.participant_question_states((select profile_id from created)) s
    where s.question like 'custom:%'),
  2,
  'the invitation saved the staff questions'' choices with the built-in ones'
);
select is(
  (select s.state from public.participant_question_states((select profile_id from created)) s
    where s.question = 'custom:' || (select id from run where label = 'optional')),
  'skip',
  'Don''t ask on an optional staff question'
);
select is(
  (select s.state from public.participant_question_states((select profile_id from created)) s
    where s.question = 'phone'),
  'skip',
  'next to the built-in choices'
);
reset role;
select ok(
  (select changes ? ('custom:' || (select id from run where label = 'required')) and changes ? 'phone'
     from public.audit_log
    where action = 'profile.intake_questions_update' and target_id = (select profile_id from created)),
  'both kinds are audited in one row'
);
set local role authenticated;

-- 2. Refusals create nothing ---------------------------------------------------------------------------

select throws_ok(
  format($$ select * from public.create_participant_invite(jsonb_build_object(
       'email', 'nova.643b@example.test', 'first_name', 'Nova', 'last_name', 'Refusada',
       'question_states', jsonb_build_object('custom:%s', 'skip'))) $$,
         (select id from run where label = 'required')),
  '23514', null,
  'Don''t ask on a required staff question nobody answered is refused'
);
select throws_ok(
  $$ select * from public.create_participant_invite(jsonb_build_object(
       'email', 'nova.643c@example.test', 'first_name', 'Nova', 'last_name', 'Desconeguda',
       'question_states', jsonb_build_object('custom:5eed0000-0000-4000-8000-00000000ffff', 'ask'))) $$,
  '22023', 'unknown question custom:5eed0000-0000-4000-8000-00000000ffff',
  'an unknown staff question is refused'
);
reset role;
select is(
  (select count(*)::integer from public.invites where email in ('nova.643b@example.test', 'nova.643c@example.test')),
  0,
  'and no invitation remains'
);

-- 3. Her phone ------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select profile_id from created), 'role', 'authenticated', 'aal', 'aal1')::text,
  true);
select is(
  (select is_asked from public.my_custom_question_asking()
    where question_id = (select id from run where label = 'optional')),
  false,
  'her phone leaves out a staff question set to Don''t ask'
);
select is(
  (select is_asked from public.my_custom_question_asking()
    where question_id = (select id from run where label = 'required')),
  true,
  'and asks one set to Ask'
);
select is_empty(
  $$ select 1 from public.custom_question_states $$,
  'she cannot read the staff settings'
);

-- 4. Nobody writes the table ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  format($$ insert into public.custom_question_states (profile_id, org_id, question_id, state)
            values ('%s', '5eed0000-0000-4000-8000-000000000000', '%s', 'ask') $$,
         (select profile_id from created), (select id from run where label = 'optional')),
  '42501', null,
  'staff write only through the functions'
);

select * from finish();
rollback;
