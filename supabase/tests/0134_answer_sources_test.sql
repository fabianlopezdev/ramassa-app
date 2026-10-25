-- Who gave each answer on her page (RAPP-653).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. A team member's answer to a Ramassà field names her, and the reader
--      returns her name.
--   2. A joined player's record changed by the team records each changed
--      built-in answer as the team member's, and only those; changed by her,
--      as hers.
--   3. An invited woman's record completed by the team names the member.
--   4. Entity answers, Ramassà and built-in, name the entity.
--   5. The readers keep the privacy levels: the source of a Sensible answer
--      needs participants.view_sensitive, and anon or a player read nothing.
--
-- Seed: admin ...001 (Laia Ferrer), staff ...002 (Marta Puig, every level)
-- and ...003 (no participants.view_sensitive), entity contact ...004 of Creu
-- Roja Osona, joined player ...025, invited ...098 of organization ...000;
-- Ramassà field ...8045-000000000004 (Personal, short text).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(14);

create temp table run (label text primary key, id uuid) on commit drop;
grant all on run to authenticated;

-- An app answer given by option key, as the app's screens send it by option id.
create function pg_temp.by_option_key(f public.profile_fields, v jsonb) returns jsonb language sql stable security definer as $$
  select case
    when f.question_type in ('single_choice', 'search_choice') and jsonb_typeof(v) = 'string' then
      coalesce((select to_jsonb(o.id::text) from public.custom_question_options o
                 where o.question_id = f.id and o.key = v #>> '{}'), v)
    when f.question_type = 'multiple_choice' and jsonb_typeof(v) = 'array' then
      coalesce((select jsonb_agg(o.id::text order by o.sort_order) from public.custom_question_options o
                 where o.question_id = f.id and o.key in (select jsonb_array_elements_text(v))
                having count(*) = jsonb_array_length(v)), v)
    else v
  end;
$$;
-- Her answers travel by field (RAPP-661). Helpers: the app's keys of a payload
-- keyed by their fields (a choice by its option), a field's id, and her stored
-- answer to an app field (decrypted).
create function pg_temp.answers(p jsonb) returns jsonb language sql security definer as $$
  select coalesce(jsonb_object_agg(f.id::text, pg_temp.by_option_key(f, e.value)), '{}'::jsonb)
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

-- 1. A team member's answer ----------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2"}';

select public.set_participant_custom_answers(
  '5eed0000-0000-4000-8000-000000000025',
  '{"5eed0000-0000-4000-8045-000000000004": "Sants"}'::jsonb);

reset role;
select is(
  (select source || '/' || answered_by::text from public.custom_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000025'
      and question_id = '5eed0000-0000-4000-8045-000000000004'),
  'staff/5eed0000-0000-4000-8000-000000000002',
  'a team member''s answer records who typed it'
);

set local role authenticated;
select is(
  (select answered_by_name from public.participant_custom_answers('5eed0000-0000-4000-8000-000000000025')
    where question_id = '5eed0000-0000-4000-8045-000000000004'),
  'Marta Puig',
  'and her page reads the team member''s name'
);

-- 2. A joined player's record ---------------------------------------------------------------------

-- The team's edit saves by field: a changed answer names the team member, an
-- answer given again unchanged keeps whoever gave it (RAPP-661).
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2"}';
select public.update_participant_profile('5eed0000-0000-4000-8000-000000000025',
  jsonb_build_object('answers', pg_temp.answers(jsonb_build_object(
    'city', 'Vic', 'postal_code', '08500',
    'phone', pg_temp.stored('5eed0000-0000-4000-8000-000000000025', 'phone')))));

reset role;
select is(
  (select string_agg(f.system_key || '/' || a.source || '/' || coalesce(a.answered_by::text, '-'), ',' order by f.system_key)
     from public.custom_answers a join public.profile_fields f on f.id = a.question_id
    where a.profile_id = '5eed0000-0000-4000-8000-000000000025'
      and f.system_key in ('city', 'phone', 'postal_code')),
  'city/staff/5eed0000-0000-4000-8000-000000000002,phone/player/-,'
    || 'postal_code/staff/5eed0000-0000-4000-8000-000000000002',
  'the team''s change names the team member on the changed answers only, an unchanged encrypted one included'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000025", "role": "authenticated", "aal": "aal1"}';
select public.update_own_profile(jsonb_build_object('first_name', 'Yolanda', 'last_name', 'Quispe',
  'answers', pg_temp.answers('{"city": "Manlleu"}')));
reset role;
select is(
  (select a.source || '/' || coalesce(a.answered_by::text, '-') from public.custom_answers a
    where a.profile_id = '5eed0000-0000-4000-8000-000000000025' and a.question_id::text = pg_temp.field('city')),
  'player/-',
  'her own change is recorded as hers'
);

-- 3. An invited woman's record ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2"}';
select public.update_participant_profile('5eed0000-0000-4000-8000-000000000098',
  jsonb_build_object('answers', pg_temp.answers('{"city": "Olot"}')));

select is(
  (select source || '/' || answered_by_name
     from public.participant_profile_answers('5eed0000-0000-4000-8000-000000000098')
    where question = 'city'),
  'staff/Marta Puig',
  'the team completing an invited woman''s record is named'
);

-- 4. Entity answers --------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select public.place_field('5eed0000-0000-4000-8045-000000000004', 'entity_form');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
insert into run values ('referral', public.create_entity_referral(jsonb_build_object(
  'first_name', 'Qa', 'last_name', 'Font', 'email', 'qa.rapp653@example.test',
  'documentationStatus', 'none', 'consentConfirmed', true,
  'answers', pg_temp.answers('{"nationality": "Marroc"}')
             || jsonb_build_object('5eed0000-0000-4000-8045-000000000004', 'Gràcia'))));

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
insert into run values ('invited', (select profile_id from public.create_participant_invite(jsonb_build_object(
  'email', 'qa.rapp653@example.test', 'first_name', 'Qa', 'last_name', 'Font',
  'answers', pg_temp.answers('{"date_of_birth": "1999-09-09"}'),
  'referral_id', (select id from run where label = 'referral')))));

reset role;
select is(
  (select source || '/' || answered_by::text from public.custom_answers
    where profile_id = (select id from run where label = 'invited')
      and question_id = '5eed0000-0000-4000-8045-000000000004'),
  'entity/5eed0000-0000-4000-8000-000000000004',
  'an entity''s answer to a Ramassà field records the entity contact'
);
-- Every answer by field since RAPP-661, the app's own included.
select is(
  (select source || '/' || answered_by::text from public.custom_answers
    where profile_id = (select id from run where label = 'invited') and question_id::text = pg_temp.field('nationality')),
  'entity/5eed0000-0000-4000-8000-000000000004',
  'and so does its answer to the app''s own field'
);
select is(
  (select source || '/' || answered_by::text from public.custom_answers
    where profile_id = (select id from run where label = 'invited') and question_id::text = pg_temp.field('date_of_birth')),
  'staff/5eed0000-0000-4000-8000-000000000001',
  'what the team typed at the invitation names the team member'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2"}';
select is(
  (select answered_by_name from public.participant_custom_answers((select id from run where label = 'invited'))
    where question_id = '5eed0000-0000-4000-8045-000000000004'),
  'Creu Roja Osona',
  'her page names the entity behind a Ramassà answer'
);
select is(
  (select answered_by_name from public.participant_profile_answers((select id from run where label = 'invited'))
    where question = 'nationality'),
  'Creu Roja Osona',
  'and behind an answer to the app''s own field'
);

-- 5. Privacy ---------------------------------------------------------------------------------------

select ok(
  exists (select 1 from public.participant_profile_answers('5eed0000-0000-4000-8000-000000000025')
           where question = 'postal_code'),
  'with participants.view_sensitive, a Sensible answer''s source is read'
);

reset role;
delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000003'
   and permission_code = 'participants.view_sensitive';
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2"}';
select ok(
  not exists (select 1 from public.participant_profile_answers('5eed0000-0000-4000-8000-000000000025')
               where question = 'postal_code')
  and exists (select 1 from public.participant_profile_answers('5eed0000-0000-4000-8000-000000000025')
               where question = 'city'),
  'without it, the Sensible answer is left out and the others stay'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000026", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select * from public.participant_profile_answers('5eed0000-0000-4000-8000-000000000025') $$,
  '42501', 'her answers need participants.view',
  'a player cannot read another woman''s sources'
);

reset role;
set local role anon;
select throws_ok(
  $$ select * from public.participant_profile_answers('5eed0000-0000-4000-8000-000000000025') $$,
  '42501', null::text,
  'anon cannot call the reader'
);

select * from finish();
rollback;
