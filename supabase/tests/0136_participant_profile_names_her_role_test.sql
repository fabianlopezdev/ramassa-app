-- Her page reads whether she joined the way the database decides it (RAPP-653).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. `get_participant_profile` returns her role: `invited` for a woman who
--      has not joined, `player` for a joined player, whether or not she ever
--      accepted the terms. The apps decide "joined" from it, as
--      `update_participant_profile` does.
--   2. The role adds no exposure: a team member with participants.view alone
--      reads it while her Personal fields stay empty, a player reads nobody
--      else's record, and anon cannot call the function.
--
-- Seed: staff ...002 (Marta Puig, every level) and ...003 (Núria Serra);
-- invited ...098; joined player ...028 who never accepted the terms; joined
-- player ...025 who did.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(9);

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
-- Her answer to an app field in a reader's `answers` (RAPP-662): a choice by its
-- option's key, anything else as text.
create function pg_temp.column_of(p_answers jsonb, p_key text) returns text language sql security definer as $$
  select coalesce(
    (select o.key from public.custom_question_options o
      where o.question_id = f.id and o.id::text = p_answers ->> f.id::text),
    p_answers ->> f.id::text)
    from public.profile_fields f
   where f.org_id = '5eed0000-0000-4000-8000-000000000000' and f.system_key = p_key;
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1. The role, as the writers read it ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select is(
  (select role from public.get_participant_profile('5eed0000-0000-4000-8000-000000000098')),
  'invited', 'an invited woman reads as invited');

select is(
  (select role || '/' || (terms_accepted_at is null)::text
     from public.get_participant_profile('5eed0000-0000-4000-8000-000000000028')),
  'player/true', 'a joined player who never accepted the terms reads as a player');

select is(
  (select role || '/' || (terms_accepted_at is null)::text
     from public.get_participant_profile('5eed0000-0000-4000-8000-000000000025')),
  'player/false', 'a joined player who accepted the terms reads as a player');

-- The whole-record save that "player" asks the apps to send works for her.
select lives_ok(
  $$ select public.update_participant_profile(
       '5eed0000-0000-4000-8000-000000000028',
       (select jsonb_build_object(
          'first_name', first_name, 'last_name', last_name, 'preferred_language', preferred_language,
          'answers', pg_temp.answers('{"place_of_birth": "Dakar Medina"}'))
          from public.get_participant_profile('5eed0000-0000-4000-8000-000000000028'))) $$,
  'her record saves whole');

-- 2. No new exposure -----------------------------------------------------------------------------

reset role;
delete from public.team_member_permissions where profile_id = '5eed0000-0000-4000-8000-000000000003';
insert into public.team_member_permissions (org_id, profile_id, permission_code)
values ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-000000000003', 'participants.view');

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select is(
  (select role || '/' || coalesce(pg_temp.column_of(answers, 'place_of_birth'), 'hidden')
     from public.get_participant_profile('5eed0000-0000-4000-8000-000000000025')),
  'player/hidden', 'participants.view alone reads her role and still not her Personal fields');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select is(
  (select count(*)::integer from public.get_participant_profile('5eed0000-0000-4000-8000-000000000025')),
  0, 'a player reads nobody else''s record, role included');

reset role;

select ok(
  not has_function_privilege('anon', 'public.get_participant_profile(uuid)', 'execute'),
  'anon holds no execute right');

select ok(
  has_function_privilege('authenticated', 'public.get_participant_profile(uuid)', 'execute'),
  'a signed-in caller keeps it');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select throws_ok(
  $$ select * from public.get_participant_profile('5eed0000-0000-4000-8000-000000000025') $$,
  '42501', null::text,
  'anon cannot read a record');

select * from finish();
rollback;
