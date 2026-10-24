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

-- The staff function writes her whole record; the trigger sees what changed.
-- Here the change is made as the database would, with the team member signed in.
reset role;
delete from public.profile_answers where profile_id = '5eed0000-0000-4000-8000-000000000025';
select set_config('ramassa.trusted_profile_write', 'on', true);
update public.profiles
   set city = 'Vic',
       phone = public.encrypt_field(public.decrypt_field(phone)),
       postal_code = public.encrypt_field('08500')
 where id = '5eed0000-0000-4000-8000-000000000025';
select set_config('ramassa.trusted_profile_write', '', true);

select is(
  (select string_agg(question || '/' || source || '/' || coalesce(answered_by::text, '-'), ',' order by question)
     from public.profile_answers where profile_id = '5eed0000-0000-4000-8000-000000000025'),
  'city/staff/5eed0000-0000-4000-8000-000000000002,postal_code/staff/5eed0000-0000-4000-8000-000000000002',
  'the team''s change records the changed answers only, an unchanged encrypted one included'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000025", "role": "authenticated", "aal": "aal2"}';
select set_config('ramassa.trusted_profile_write', 'on', true);
update public.profiles set city = 'Manlleu' where id = '5eed0000-0000-4000-8000-000000000025';
select set_config('ramassa.trusted_profile_write', '', true);
select is(
  (select source || '/' || coalesce(answered_by::text, '-') from public.profile_answers
    where profile_id = '5eed0000-0000-4000-8000-000000000025' and question = 'city'),
  'player/-',
  'her own change is recorded as hers'
);

-- 3. An invited woman's record ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2"}';
select public.update_participant_profile('5eed0000-0000-4000-8000-000000000098', '{"city": "Olot"}'::jsonb);

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
  'firstName', 'Qa', 'lastName', 'Font', 'email', 'qa.rapp653@example.test',
  'documentationStatus', 'none', 'consentConfirmed', true, 'nationality', 'Marroc',
  'fields', jsonb_build_object('5eed0000-0000-4000-8045-000000000004', 'Gràcia'))));

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
insert into run values ('invited', (select profile_id from public.create_participant_invite(jsonb_build_object(
  'email', 'qa.rapp653@example.test', 'first_name', 'Qa', 'last_name', 'Font',
  'referral_id', (select id from run where label = 'referral')))));

reset role;
select is(
  (select source || '/' || answered_by::text from public.custom_answers
    where profile_id = (select id from run where label = 'invited')
      and question_id = '5eed0000-0000-4000-8045-000000000004'),
  'entity/5eed0000-0000-4000-8000-000000000004',
  'an entity''s answer to a Ramassà field records the entity contact'
);
select is(
  (select source || '/' || answered_by::text from public.profile_answers
    where profile_id = (select id from run where label = 'invited') and question = 'nationality'),
  'entity/5eed0000-0000-4000-8000-000000000004',
  'and so does its answer to the app''s own field'
);
select is(
  (select source || '/' || answered_by::text from public.profile_answers
    where profile_id = (select id from run where label = 'invited') and question = 'first_name'),
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
