-- Her record is read by field (RAPP-662, D9).
-- Run with: bunx supabase test db
--
-- What these assertions defend, at each privacy level:
--   1. `get_participant_profile` returns her names and exactly the answers
--      whose field level the caller reads, and still audits the read.
--   2. `participant_custom_answers`, `participant_profile_answers` and
--      `participant_season_answers` follow the same levels, field by field.
--   3. The level is the field's own: a field made Sensitive leaves the
--      Personal reader's view at once.
--   4. She reads every answer about her (`get_own_profile`), the team's
--      fields included.
--   5. What she answered comes from her answers (`my_answered_questions`).
--   6. The helpers stay private.
--
-- Seed: organization ...000, player ...011 (answers at every level, one of
-- them for the current season), staff ...003 (every level until trimmed).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(22);

-- The fields of player ...011 with a current answer, at the given levels.
create function pg_temp.expected(p_levels text[], p_with_health boolean default false)
returns text[] language sql security definer as $$
  select coalesce(array_agg(a.question_id::text order by a.question_id::text), '{}')
    from public.custom_answers a join public.profile_fields f on f.id = a.question_id
   where a.profile_id = '5eed0000-0000-4000-8000-000000000011'
     and (a.season_id is null or a.season_id = private.current_season_id(f.org_id))
     and f.privacy = any (p_levels)
     -- Her health needs the health permission, which staff ...003 does not hold (RAPP-698).
     and (p_with_health or f.read_permission is null);
$$;
create function pg_temp.keys(p jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(k order by k), '{}') from jsonb_object_keys(p) k;
$$;
create function pg_temp.field(p_key text) returns text language sql security definer as $$
  select id::text from public.profile_fields
   where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = p_key;
$$;
grant execute on all functions in schema pg_temp to authenticated;

select ok(cardinality(pg_temp.expected(array['sensitive'])) >= 2
          and cardinality(pg_temp.expected(array['personal'])) >= 2
          and cardinality(pg_temp.expected(array['normal'])) >= 2,
  'the seeded player has answers at every level');

-- 1 and 2. Every level --------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select is(
  (select pg_temp.keys(answers) from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011')),
  pg_temp.expected(array['normal', 'personal', 'sensitive']),
  'with every level she reads every answer');
select is(
  (select first_name || ' ' || last_name from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011')),
  'أمينة الحسن', 'her names stay on her record');
select is(
  (select pg_temp.keys(answers) from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011'))
    @> array[pg_temp.field('phone'), pg_temp.field('document_number')],
  true, 'the Sensitive answers come decrypted');
select is(
  (select answers ->> pg_temp.field('phone') from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011')),
  '+34600000011', 'decrypted to her phone number');

reset role;
delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000003' and permission_code = 'participants.view_sensitive';
set local role authenticated;

select is(
  (select pg_temp.keys(answers) from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011')),
  pg_temp.expected(array['normal', 'personal']),
  'without participants.view_sensitive: Normal and Personal answers, no Sensitive one');
select is(
  (select array_agg(distinct question_id::text order by question_id::text)
     from public.participant_custom_answers('5eed0000-0000-4000-8000-000000000011')
    where season_id is null or season_id = '5eed0000-0000-4000-8040-000000000001'),
  pg_temp.expected(array['normal', 'personal']),
  'her answers with their sources follow the same levels');
select is(
  (select array_agg(field_id::text order by field_id::text)
     from public.participant_profile_answers('5eed0000-0000-4000-8000-000000000011')),
  pg_temp.expected(array['normal', 'personal']),
  'who gave each answer follows the same levels');
select is(
  (select count(*)::int from public.participant_season_answers('5eed0000-0000-4000-8000-000000000011') s,
          jsonb_object_keys(s.answers) k
    where k = any (pg_temp.expected(array['sensitive']))),
  0, 'her seasons show no Sensitive answer');
select is(
  (select count(*)::int from public.participant_profile_answers('5eed0000-0000-4000-8000-000000000011')
    where question = 'document' and field_id::text = pg_temp.field('document_number')),
  0, 'a split question shows only its parts the caller reads');

reset role;
delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000003' and permission_code = 'participants.view_personal';
set local role authenticated;

select is(
  (select pg_temp.keys(answers) from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011')),
  pg_temp.expected(array['normal']),
  'with participants.view alone: only Normal answers');
select is(
  (select array_agg(distinct question_id::text order by question_id::text)
     from public.participant_custom_answers('5eed0000-0000-4000-8000-000000000011')),
  pg_temp.expected(array['normal']),
  'and only Normal answers with their sources');
select is(
  (select coalesce(array_agg(field_id::text order by field_id::text), '{}')
     from public.participant_profile_answers('5eed0000-0000-4000-8000-000000000011')),
  pg_temp.expected(array['normal']),
  'and who gave only those');

-- 3. The level is the field's ----------------------------------------------------------------------------------

reset role;
insert into public.team_member_permissions (org_id, profile_id, permission_code)
values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-000000000003', 'participants.view_personal');
update public.profile_fields set privacy = 'sensitive'
 where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = 'nationality';
set local role authenticated;

select is(
  (select answers ? pg_temp.field('nationality') from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011')),
  false, 'a nationality made Sensitive leaves the Personal reader''s view');
select is(
  (select answers ? pg_temp.field('date_of_birth') from public.get_participant_profile('5eed0000-0000-4000-8000-000000000011')),
  true, 'the other Personal answers stay');

reset role;
select ok(
  (select count(*) from public.audit_log
    where actor_id = '5eed0000-0000-4000-8000-000000000003' and target_id = '5eed0000-0000-4000-8000-000000000011'
      and action = 'profile.view') >= 3,
  'every read of her record is audited');

-- 4 and 5. Her own read ------------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';

select is(
  (select pg_temp.keys(answers) from public.get_own_profile()),
  pg_temp.expected(array['normal', 'personal', 'sensitive'], true),
  'she reads every answer about her, whatever its level');
select is(
  (select answers ->> pg_temp.field('document_number') from public.get_own_profile()),
  'Y0000011Z', 'her Sensitive answers decrypted');
select is_empty(
  $$select * from public.get_participant_profile('5eed0000-0000-4000-8000-000000000012')$$,
  'a player reads nobody else''s record');
select ok(
  array(select public.my_answered_questions()) @> array['date_of_birth', 'nationality', 'document', 'phone'],
  'what she answered comes from her answers');

-- 6. Private ------------------------------------------------------------------------------------------------

reset role;
select is(
  (select count(*)::int from unnest(array[
      'private.field_answers_for(uuid,boolean)', 'private.answered_app_questions(uuid)']) fn,
     unnest(array['anon', 'authenticated']) r
    where has_function_privilege(r, fn, 'execute')),
  0, 'no client role calls the record helpers');
select is(
  (select count(*)::int from unnest(array['public.get_participant_profile(uuid)', 'public.get_own_profile()',
      'public.participant_season_answers(uuid)', 'public.participant_profile_answers(uuid)']) fn
    where has_function_privilege('anon', fn, 'execute')),
  0, 'anon calls none of her record''s readers');

select * from finish();
rollback;
