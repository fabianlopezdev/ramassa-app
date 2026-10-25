-- The old unsigned onboarding path is closed to every client (RAPP-624).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. `public.complete_onboarding(jsonb)` accepts terms with no signature, so
--      no client role may run it: anon and authenticated are refused.
--   2. The phone's path, `complete_onboarding_signed`, still runs it inside
--      (security definer) and still works for a signed-in woman.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(4);

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

select ok(
  not has_function_privilege('anon', 'public.complete_onboarding(jsonb)', 'execute'),
  'anon cannot run the unsigned path'
);
select ok(
  not has_function_privilege('authenticated', 'public.complete_onboarding(jsonb)', 'execute'),
  'a signed-in account cannot run the unsigned path either'
);
select ok(
  has_function_privilege('authenticated', 'public.complete_onboarding_signed(jsonb, jsonb)', 'execute'),
  'the signed path stays open to a signed-in account'
);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000006a1', 'unsigned-path@test.local');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000006a1", "role": "authenticated"}';
-- Calling a function this role may not run crashes local Postgres 17.6
-- (BUILD-RULES note), so the refusal is proven by the privilege checks above.
select lives_ok(
  $$ select public.complete_onboarding_signed(
       jsonb_build_object('first_name', 'Nadia', 'last_name', 'Khoury', 'media_consent', false,
         'terms_version', '2026-07-01', 'locale_shown', 'ca',
         'answers', pg_temp.answers('{"date_of_birth": "1993-11-02",
           "place_of_birth": "Homs", "nationality": "Síria", "document_type": "none",
           "reference_entity": null, "has_dependents": "no",
           "clothing_size": "M", "shoe_size": "38"}')),
       '{"terms_accepted": true, "media_consent": false, "unable_to_draw": true}'::jsonb) $$,
  'the signed path still completes her onboarding'
);

select * from finish();
rollback;
