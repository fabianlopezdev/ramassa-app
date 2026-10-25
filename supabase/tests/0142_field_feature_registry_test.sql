-- The features that read a field declare it (RAPP-662, D7, D9).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. The registry names real system keys and real answer types.
--   2. Each feature finds its field in the seeded organization, and her answer
--      to it, as stored and as text.
--   3. A field whose type no longer fits reads nothing, without an error, and
--      `private.field_features_of` says which features stop.
--   4. One map from privacy level to permission, per level.
--   5. Every helper stays private.
--
-- Seed: organization ...000, player ...011 (Síria, Vic, born 1996, no
-- dependents), staff ...003 (every level until trimmed below).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(19);

-- The caller's reading of a level, through a wrapper the client role may call.
create function pg_temp.reads(p_profile uuid, p_level text) returns boolean language sql security definer as $$
  select private.reads_privacy(p_profile, p_level);
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1. The registry ---------------------------------------------------------------------------------------------

select is(
  (select array_agg(r.system_key order by r.feature) filter (where not r.system_key = any (private.system_field_keys()))
     from private.field_features() r),
  null, 'every feature reads one of the app''s fields by its system key');
select is(
  (select count(*)::int from private.field_features() r, unnest(r.accepted_types) t
    where not t = any (private.custom_question_types())),
  0, 'every accepted type is an answer type');

-- 2. Each feature finds its field and her answer ---------------------------------------------------------------

select is(
  (select count(*)::int from private.field_features() r
    where (private.feature_field('5eed0000-0000-4000-8000-000000000000', r.feature)).id is null),
  0, 'every feature finds its field in the seeded organization');
select is(private.feature_text('5eed0000-0000-4000-8000-000000000011', 'participants.city'), 'Vic',
  'the municipality reads as its name');
select is(private.feature_text('5eed0000-0000-4000-8000-000000000011', 'impact.nationalities'), 'Síria',
  'the nationality reads as its country name');
select is(private.feature_answer('5eed0000-0000-4000-8000-000000000011', 'impact.age_bands') #>> '{}', '1996-12-12',
  'the date of birth reads as a date');
select is(
  (select private.answer_key(f, private.feature_answer('5eed0000-0000-4000-8000-000000000011', 'participants.has_dependents'))
     from public.profile_fields f
    where f.org_id = '5eed0000-0000-4000-8000-000000000000' and f.system_key = 'has_dependents'),
  'no', 'a one-choice answer reads by its option''s key');
select throws_ok(
  $$select private.feature_field('5eed0000-0000-4000-8000-000000000000', 'impact.shoe_colour')$$,
  '22023', 'unknown field feature', 'an unknown feature is a mistake and raises');

-- 3. A field whose type changed reads nothing -----------------------------------------------------------------

update public.profile_fields set question_type = 'short_text'
 where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = 'nationality';

select is((private.feature_field('5eed0000-0000-4000-8000-000000000000', 'impact.nationalities')).id, null,
  'a nationality that became short text is no longer the report''s field');
select lives_ok(
  $$select private.feature_text('5eed0000-0000-4000-8000-000000000011', 'impact.nationalities')$$,
  'reading it does not fail');
select is(private.feature_text('5eed0000-0000-4000-8000-000000000011', 'participants.nationality'), null,
  'and it reads nothing');
select results_eq(
  $$select feature, fits from private.field_features_of(
      (select id from public.profile_fields
        where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = 'nationality'))$$,
  $$values ('impact.nationalities', false), ('participants.nationality', false)$$,
  'the features that read the field say they stop');
select is(
  (select count(*)::int from private.field_features_of(
     (select id from public.profile_fields
       where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = 'date_of_birth')) where fits),
  2, 'the date of birth still fits its two features');

-- 4. Privacy by level -----------------------------------------------------------------------------------------

delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000003'
   and permission_code in ('participants.view_sensitive');
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select ok(
  (select pg_temp.reads('5eed0000-0000-4000-8000-000000000011', 'personal'))
    and not (select pg_temp.reads('5eed0000-0000-4000-8000-000000000011', 'sensitive')),
  'without participants.view_sensitive she reads Personal answers and no Sensitive one');
reset role;
delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000003' and permission_code = 'participants.view_personal';
set local role authenticated;
select ok(
  (select pg_temp.reads('5eed0000-0000-4000-8000-000000000011', 'normal'))
    and not (select pg_temp.reads('5eed0000-0000-4000-8000-000000000011', 'personal')),
  'with participants.view alone she reads Normal answers only');
reset role;
delete from public.team_member_permissions
 where profile_id = '5eed0000-0000-4000-8000-000000000003' and permission_code = 'participants.view';
set local role authenticated;
select ok(
  not (select pg_temp.reads('5eed0000-0000-4000-8000-000000000011', 'normal')),
  'without participants.view she reads no answer');
select ok(not (select pg_temp.reads(null, 'unknown')), 'an unknown level reads nothing');
reset role;

-- 5. Private ------------------------------------------------------------------------------------------------

select is(
  (select count(*)::int from unnest(array[
      'private.field_features()', 'private.feature_field(uuid,text)', 'private.feature_answer(uuid,text)',
      'private.feature_text(uuid,text)', 'private.answer_key(public.profile_fields,jsonb)',
      'private.reads_privacy(uuid,text)', 'private.field_features_of(uuid)']) fn,
     unnest(array['anon', 'authenticated']) r
    where has_function_privilege(r, fn, 'execute')),
  0, 'no client role calls the registry helpers');
select is(
  (select count(*)::int from unnest(array['private.feature_field(uuid,text)']) fn
    where has_function_privilege('public', fn, 'execute')),
  0, 'PUBLIC does not either');

select * from finish();
rollback;
