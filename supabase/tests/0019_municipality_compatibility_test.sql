-- Canonical IDESCAT municipality storage and legacy-row reporting (RAPP-100).

begin;
select plan(14);

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

-- The unsigned path is closed to clients (RAPP-624); this file checks its merge
-- rules as the participant, so it grants it inside this rolled-back transaction.
grant execute on function public.complete_onboarding(jsonb) to authenticated;

select has_table('public', 'municipality_catalog', 'the generated municipality catalogue exists');
select has_column('public', 'municipality_catalog', 'code', 'catalogue keeps the IDESCAT code');
select has_view(
  'public',
  'municipality_compatibility_report',
  'unresolved historical values have an explicit report'
);

select is(
  (select count(*) from public.municipality_catalog)::int,
  947,
  'the database has the complete IDESCAT municipal register'
);
select is(
  (select canonical from public.municipality_catalog where code = '082981'),
  'Vic',
  'the official IDESCAT code resolves to the canonical stored value'
);
select is(
  (select comarca_code from public.municipality_catalog where canonical = 'Torelló'),
  '24',
  'the generated catalogue preserves Osona membership'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.municipality_catalog'::regclass),
  true,
  'the catalogue has RLS enabled'
);
select hasnt_column('public', 'profiles', 'city',
  'her municipality is no profile column: the foreign key went with it (RAPP-666)');
select is(
  (select question_type from public.profile_fields
    where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = 'city'),
  'municipality',
  'her municipality is a field of the municipality type, checked against the catalogue on write'
);
select is_empty(
  $$ select legacy_value from public.municipality_compatibility_report $$,
  'the seeded roster starts with no unresolved legacy municipality values'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_like(
  $$ select count(*) from public.municipality_catalog $$,
  '%permission denied%',
  'participants cannot read the database catalogue directly'
);

set local role postgres;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'municipality-valid@test.local'),
  ('00000000-0000-0000-0000-0000000000f2', 'municipality-invalid@test.local');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.complete_onboarding(
       jsonb_build_object(
         'first_name', 'Nadia', 'last_name', 'Khoury',
         'terms_version', '2026-07-01', 'locale_shown', 'ca',
         'answers', pg_temp.answers(jsonb_build_object(
           'date_of_birth', '1993-11-02', 'place_of_birth', 'Homs',
           'nationality', 'Síria', 'document_type', 'none',
           'city', 'Vic', 'has_dependents', 'no',
           'clothing_size', 'M', 'shoe_size', '38',
           'reference_entity', null))
       )
     ) $$,
  'onboarding persists a canonical municipality'
);

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_like(
  $$ select public.complete_onboarding(
       jsonb_build_object(
         'first_name', 'Bad', 'last_name', 'Bucket',
         'terms_version', '2026-07-01', 'locale_shown', 'ca',
         'answers', pg_temp.answers(jsonb_build_object(
           'date_of_birth', '1993-11-02', 'place_of_birth', 'Homs',
           'nationality', 'Síria', 'document_type', 'none',
           'city', 'Vich', 'has_dependents', 'no',
           'clothing_size', 'M', 'shoe_size', '38',
           'reference_entity', null))
       )
     ) $$,
  -- Her municipality is a field of the municipality type (RAPP-660, RAPP-661).
  '%does not fit the question%',
  'onboarding cannot create a new free-text reporting bucket'
);

-- Her municipality is an answer since RAPP-662: an answer the catalog does not
-- know (a value from before the type check, or after a type change) shows up.
set local role postgres;
update public.custom_answers a
   set value = '"Vich"'
  from public.profile_fields f
 where f.id = a.question_id and f.system_key = 'city'
   and a.profile_id = '00000000-0000-0000-0000-0000000000f1';

select is(
  (select profile_count from public.municipality_compatibility_report where legacy_value = 'Vich'),
  1::bigint,
  'an unresolved historical value appears in the compatibility report'
);

select * from finish();
rollback;
