-- The app's answers in the answer store, kept in sync (RAPP-660, D3, D10, D13).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. After a reset, every app value of the seed is an answer of its field, at
--      its level: a choice by its option, a Sensitive answer encrypted. Her
--      names are never answers.
--   2. The copy (`private.copy_app_answers`) rebuilds the same answers from the
--      columns and the season rows, a past season keyed by that season.
--   3. TEMPORARY sync: a change to an app column rewrites or removes its
--      answer, a season row its season's answers, a `profile_answers` row the
--      source; a value that does not fit is left out and the write still works.
--   4. Erasure through the old columns removes the answers too.
--   5. The readers of Ramassà's answers show what they showed (until RAPP-662).
--   6. The helpers stay private.
--
-- Seed: organization ...000 (current season ...8040-...001), admin ...001,
-- staff ...002 (every level), player ...011 (Síria, NIE, Vic, no dependents),
-- invited ...098 (answers the team gave).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(31);

create temp table run (label text primary key, n integer) on commit drop;

create function pg_temp.field(p_key text) returns uuid language sql as $$
  select id from public.profile_fields where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = p_key;
$$;
create function pg_temp.option(p_key text, p_option text) returns jsonb language sql as $$
  select to_jsonb(o.id::text) from public.custom_question_options o
   where o.question_id = pg_temp.field(p_key) and o.key = p_option;
$$;
-- Her answer to an app field, decrypted; for a season when one is given.
create function pg_temp.answer(p_profile uuid, p_key text, p_season uuid default null) returns jsonb language sql as $$
  select coalesce(a.value, (public.decrypt_field(a.value_encrypted))::jsonb) from public.custom_answers a
   where a.profile_id = p_profile and a.question_id = pg_temp.field(p_key)
     and a.season_key = coalesce(p_season, '00000000-0000-0000-0000-000000000000');
$$;
-- App values with no equal answer, over every profile.
create function pg_temp.missing() returns integer language sql as $$
  select count(*)::integer
    from public.profiles p
    cross join lateral private.app_field_raw_values(p) v
    join public.profile_fields f on f.org_id = p.org_id and f.system_key = v.system_key
   where v.raw is not null
     and not exists (
       select 1 from public.custom_answers a
        where a.profile_id = p.id and a.question_id = f.id
          and a.season_key = case when private.field_is_seasonal(f.id)
                                  then private.current_season_id(p.org_id)
                                  else '00000000-0000-0000-0000-000000000000' end
          and coalesce(a.value, (public.decrypt_field(a.value_encrypted))::jsonb)
              = private.custom_answer_tidied(f.question_type, private.app_answer_value(f, v.raw)));
$$;

-- 1. The seed -------------------------------------------------------------------------------------------------

select is(pg_temp.missing(), 0, 'every app value of the seed is an answer of its field');
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', 'nationality'), '"Síria"'::jsonb,
          'a country is its canonical name');
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', 'document_type'),
          pg_temp.option('document_type', 'nie'), 'a choice is the option with the stored key');
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', 'has_dependents'),
          pg_temp.option('has_dependents', 'no'), 'no dependents is the no option');
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', 'num_dependents'), null,
          'and leaves no number');
select is(
  (select value is null and public.decrypt_field(value_encrypted) = '"+34600000011"'
     from public.custom_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000011' and question_id = pg_temp.field('phone')),
  true,
  'a Sensitive answer is stored encrypted'
);
select is(
  (select count(*)::integer from public.custom_answers
    where question_id in (pg_temp.field('first_name'), pg_temp.field('last_name'))),
  0,
  'her names are never answers'
);
select is(
  (select string_agg(a.source, ',' order by a.source) from public.custom_answers a
    where a.profile_id = '5eed0000-0000-4000-8000-000000000098'),
  'staff,staff,staff,staff',
  'an answer the team gave says so'
);
select is(
  (select a.source from public.custom_answers a
    where a.profile_id = '5eed0000-0000-4000-8000-000000000011' and a.question_id = pg_temp.field('city')),
  'player',
  'and a joined player''s answer with no other record is hers'
);

-- 2. The copy ---------------------------------------------------------------------------------------------------

insert into public.seasons (id, org_id, name, starts_on)
values ('5eed0000-0000-4000-8040-0000000006a1', '5eed0000-0000-4000-8000-000000000000', '2024/25', '2024-09-01');
insert into public.season_answers (profile_id, season_id, org_id, applicant_status, supporting_entities,
                                   childcare_need, specific_needs, updated_at)
values ('5eed0000-0000-4000-8000-000000000011', '5eed0000-0000-4000-8040-0000000006a1',
        '5eed0000-0000-4000-8000-000000000000', public.encrypt_field('asylum_seeker'), array['Creu Roja', 'Creu Roja '],
        'maybe', public.encrypt_field('{"kind": "support-needs", "version": 1, "categories": ["health"], "details": {"health": "Asma"}}'),
        '2024-10-01 10:00+00');
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', 'applicant_status',
                         '5eed0000-0000-4000-8040-0000000006a1'),
          pg_temp.option('applicant_status', 'asylum_seeker'),
          'a season row gives that season''s answers');
select is(
  (select value is null from public.custom_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000011' and question_id = pg_temp.field('applicant_status')
      and season_id = '5eed0000-0000-4000-8040-0000000006a1'),
  true,
  'a Sensitive season answer stays encrypted'
);
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', 'supporting_entities',
                         '5eed0000-0000-4000-8040-0000000006a1'),
          '["Creu Roja"]'::jsonb, 'the supporting organizations are a list without repeats');
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', 'specific_needs',
                         '5eed0000-0000-4000-8040-0000000006a1'),
          jsonb_build_array(pg_temp.option('specific_needs', 'health') #>> '{}'),
          'the needs are their options');
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', 'specific_needs_details',
                         '5eed0000-0000-4000-8040-0000000006a1'),
          '"Asma"'::jsonb, 'and their details one text');
select is(
  (select answered_at from public.custom_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000011' and question_id = pg_temp.field('childcare_need')
      and season_id = '5eed0000-0000-4000-8040-0000000006a1'),
  '2024-10-01 10:00+00'::timestamptz,
  'a past season keeps the time of its row'
);

insert into run select 'before', count(*)::integer from public.custom_answers a
  join public.profile_fields f on f.id = a.question_id where f.kind = 'builtin';
delete from public.custom_answers a using public.profile_fields f
 where f.id = a.question_id and f.kind = 'builtin';
select lives_ok($$ select private.copy_app_answers() $$, 'the copy runs');
select is(
  (select count(*)::integer from public.custom_answers a
     join public.profile_fields f on f.id = a.question_id where f.kind = 'builtin'),
  (select n from run where label = 'before'),
  'and rebuilds every app answer'
);
select is(pg_temp.missing(), 0, 'each equal to its column');
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', 'childcare_need',
                         '5eed0000-0000-4000-8040-0000000006a1'),
          '"maybe"'::jsonb, 'past seasons included');

-- 3. TEMPORARY sync ---------------------------------------------------------------------------------------------

update public.profiles set nationality = 'Marroc', city = null, has_dependents = true, num_dependents = 3
 where id = '5eed0000-0000-4000-8000-000000000011';
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', 'nationality'), '"Marroc"'::jsonb,
          'a changed column rewrites its answer');
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', 'city'), null,
          'a cleared column removes it');
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', 'num_dependents'), '3'::jsonb,
          'how many counts once she has dependents');

update public.profiles
   set applicant_status = public.encrypt_field('other'),
       applicant_status_details = public.encrypt_field('Pendent de resolució')
 where id = '5eed0000-0000-4000-8000-000000000011';
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', 'applicant_status_details',
                         '5eed0000-0000-4000-8040-000000000001'),
          '"Pendent de resolució"'::jsonb,
          'her current season answers land on the current season');

insert into public.profile_answers (profile_id, org_id, question, source, answered_by)
values ('5eed0000-0000-4000-8000-000000000011', '5eed0000-0000-4000-8000-000000000000', 'nationality',
        'staff', '5eed0000-0000-4000-8000-000000000002')
on conflict (profile_id, question) do update set source = excluded.source, answered_by = excluded.answered_by;
select is(
  (select source || '/' || answered_by::text from public.custom_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000011' and question_id = pg_temp.field('nationality')),
  'staff/5eed0000-0000-4000-8000-000000000002',
  'who gave it follows profile_answers'
);

select lives_ok(
  $$ update public.profiles set shoe_size = '99' where id = '5eed0000-0000-4000-8000-000000000011' $$,
  'a value the field does not offer still saves on the old column'
);
select is(pg_temp.answer('5eed0000-0000-4000-8000-000000000011', 'shoe_size'), null,
          'and is left out of the answer store');

delete from public.season_answers
 where profile_id = '5eed0000-0000-4000-8000-000000000011' and season_id = '5eed0000-0000-4000-8040-0000000006a1';
select is(
  (select count(*)::integer from public.custom_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000011' and season_id = '5eed0000-0000-4000-8040-0000000006a1'),
  0,
  'a removed season row removes that season''s answers'
);

-- 4. Erasure through the old columns ------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok($$ select public.anonymize_participant('5eed0000-0000-4000-8000-000000000011') $$,
                'the team erases her');
reset role;
select is(
  (select count(*)::integer from public.custom_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000011'
      and question_id in (pg_temp.field('phone'), pg_temp.field('address'), pg_temp.field('postal_code'),
                          pg_temp.field('document_number'), pg_temp.field('place_of_birth'))),
  0,
  'the answers erasure clears are gone'
);

-- 5. The readers ----------------------------------------------------------------------------------------------

-- Since RAPP-662 her page reads every field's answers, the app's included.
create temp table expected_answers on commit drop as
  select count(*)::integer as n from public.custom_answers where profile_id = '5eed0000-0000-4000-8000-000000000098';
grant select on expected_answers to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(
  (select count(*)::integer from public.participant_custom_answers('5eed0000-0000-4000-8000-000000000098')),
  (select n from expected_answers),
  'her page reads every field''s answers, the app''s included'
);
reset role;

-- 6. Private ----------------------------------------------------------------------------------------------------

select is(
  has_function_privilege('authenticated', 'private.mirror_app_answer(uuid, uuid, text, text, uuid, jsonb, timestamptz)', 'execute')
  or has_function_privilege('authenticated', 'private.copy_app_answers()', 'execute')
  or has_function_privilege('anon', 'private.app_field_raw_values(public.profiles)', 'execute'),
  false,
  'no client role runs the copy or the mirror'
);

select * from finish();
rollback;
