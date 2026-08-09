-- Canonical IDESCAT municipality storage and legacy-row reporting (RAPP-100).

begin;
select plan(14);

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
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_city_municipality_canonical_fkey'
  ),
  'profiles.city references the canonical municipality catalogue'
);
select is(
  (select convalidated from pg_constraint
   where conrelid = 'public.profiles'::regclass
     and conname = 'profiles_city_municipality_canonical_fkey'),
  false,
  'the compatibility FK preserves unresolved pre-existing rows while enforcing new writes'
);
select is_empty(
  $$ select legacy_value from public.municipality_compatibility_report $$,
  'the seeded roster starts with no unresolved legacy municipality values'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
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
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
select lives_ok(
  $$ select public.complete_onboarding(
       jsonb_build_object(
         'first_name', 'Nadia', 'last_name', 'Khoury',
         'date_of_birth', '1993-11-02', 'place_of_birth', 'Homs',
         'nationality', 'Síria', 'document_type', 'none',
         'city', 'Vic', 'has_dependents', false, 'num_dependents', 0,
         'clothing_size', 'M', 'shoe_size', '38',
         'terms_version', '2026-07-01', 'locale_shown', 'ca'
       )
     ) $$,
  'onboarding persists a canonical municipality'
);

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
select throws_like(
  $$ select public.complete_onboarding(
       jsonb_build_object(
         'first_name', 'Bad', 'last_name', 'Bucket',
         'date_of_birth', '1993-11-02', 'place_of_birth', 'Homs',
         'nationality', 'Síria', 'document_type', 'none',
         'city', 'Vich', 'has_dependents', false, 'num_dependents', 0,
         'clothing_size', 'M', 'shoe_size', '38',
         'terms_version', '2026-07-01', 'locale_shown', 'ca'
       )
     ) $$,
  '%profiles_city_municipality_canonical_fkey%',
  'onboarding cannot create a new free-text reporting bucket'
);

set local role postgres;
set local session_replication_role = replica;
update public.profiles
set city = 'Vich'
where id = '00000000-0000-0000-0000-0000000000f1';
set local session_replication_role = origin;

select is(
  (select profile_count from public.municipality_compatibility_report where legacy_value = 'Vich'),
  1::bigint,
  'an unresolved historical value appears in the compatibility report'
);

select * from finish();
rollback;
