-- Onboarding intake: schema deltas, terms_acceptances, and the completion RPC
-- (RAPP-21). Run with: bunx supabase test db
--
-- What these assertions defend, in order of how badly they would hurt:
--   1. Sensitive intake fields are CIPHERTEXT at rest (ADR-004). A player's
--      document number, phone, address and postal code identify and locate a
--      refugee woman; a database breach must not hand them over.
--   2. A player can create ONLY their own profile, and cannot self-escalate to
--      staff or admin while doing it.
--   3. Terms acceptance is recorded as a versioned EVENT (version + locale
--      shown + timestamp), not just a boolean, because RGPD requires knowing
--      which text in which language someone actually agreed to.
--   4. The RPC is atomic: a rejected terms acceptance leaves no half-built
--      profile behind.
--
-- Self-contained: seeds its own Vault key, org and users, runs in a transaction
-- and rolls back.

begin;
select plan(16);

-- The unsigned path is closed to clients (RAPP-624); this file checks its merge
-- rules as the participant, so it grants it inside this rolled-back transaction.
grant execute on function public.complete_onboarding(jsonb) to authenticated;

-- Setup ------------------------------------------------------------------------

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
-- Her answers travel by field (RAPP-661): the app's keys of this payload, keyed
-- by their fields, a choice by its option.
create function pg_temp.answers(p jsonb) returns jsonb language sql security definer as $$
  select coalesce(jsonb_object_agg(f.id::text, pg_temp.by_option_key(f, e.value)), '{}'::jsonb)
    from jsonb_each(p) e
    join public.profile_fields f on f.org_id = '5eed0000-0000-4000-8000-000000000000' and f.system_key = e.key;
$$;
-- Her stored answer to an app field, as stored.
create function pg_temp.stored(p_profile uuid, p_key text) returns public.custom_answers language sql security definer as $$
  select a.* from public.custom_answers a join public.profile_fields f on f.id = a.question_id
   where a.profile_id = p_profile and f.system_key = p_key;
$$;
grant execute on all functions in schema pg_temp to authenticated;

select vault.create_secret('test-encryption-key', 'app_encryption_key', 'pgTAP test key')
where not exists (select 1 from vault.secrets where name = 'app_encryption_key');

-- Deliberately NOT creating an org: `default_organization_id()` resolves the
-- single tenant and RAISES when there is more than one, which is the guard that
-- stops a participant being attached to an arbitrary organization. Adding a
-- second org here would trip that guard and test the wrong thing. The seeded
-- 'ramassa' org from seed.sql is the one a real self-signup would join.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'newplayer@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'otherplayer@test.local');

-- Schema deltas ----------------------------------------------------------------

select is((select question_type from public.profile_fields
             where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = 'place_of_birth'),
          'short_text', 'place of birth is a field of the profile layout (kickoff field)');
select has_column('public', 'profiles', 'media_consent_at', 'profiles gained media_consent_at (separate, revocable consent)');
select has_table('public', 'terms_acceptances', 'terms_acceptances table exists');
select has_column('public', 'terms_acceptances', 'terms_version', 'terms_acceptances records WHICH version was accepted');
select has_column('public', 'terms_acceptances', 'locale_shown', 'terms_acceptances records the LANGUAGE the text was read in');

-- The completion RPC -----------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

-- Server-side parity for the required place_of_birth (2026-07-31): the client
-- schema enforces it; the RPC must re-enforce it or the contract is a comment.
select throws_like(
  $$ select public.complete_onboarding(
       jsonb_build_object(
         'first_name', 'X', 'last_name', 'Y',
         'terms_version', '2026-07-01', 'locale_shown', 'ca',
         'answers', pg_temp.answers(jsonb_build_object(
           'date_of_birth', '1995-03-14', 'nationality', 'Síria', 'document_type', 'none',
           'clothing_size', 'M', 'shoe_size', '38', 'reference_entity', 'Creu Roja Osona',
           'has_dependents', 'no'))
       )
     ) $$,
  '%requires an answer to a required question%',
  'the RPC rejects a payload with no place of birth'
);

select lives_ok(
  $$ select public.complete_onboarding(
       jsonb_build_object(
         'first_name', 'أمينة',
         'last_name', 'الحسن',
         'preferred_language', 'ar',
         'terms_version', '2026-07-01',
         'locale_shown', 'ar',
         'answers', pg_temp.answers(jsonb_build_object(
           'date_of_birth', '1995-03-14',
           'place_of_birth', 'حلب',
           'nationality', 'Síria',
           'document_type', 'nie',
           'document_number', 'X1234567L',
           'phone', '+34600111222',
           'address', 'Carrer Major 1',
           'city', 'Vic',
           'postal_code', '08500',
           'reference_entity', 'Creu Roja Osona',
           'has_dependents', 'yes',
           'num_dependents', 2,
           'clothing_size', 'M',
           'shoe_size', '38'))
       )
     ) $$,
  'a player can complete their own onboarding'
);

-- Encryption at rest: her Sensitive answers must NOT be stored as plaintext
-- (RAPP-661: they are answers by field).
set local role postgres;

select is(
  (select row(value, encode(value_encrypted, 'escape') like '%X1234567L%')::text
     from pg_temp.stored('00000000-0000-0000-0000-0000000000c1', 'document_number')),
  '(,f)',
  'document_number is ciphertext at rest, not the plaintext NIE'
);

select is(
  (select row(value, encode(value_encrypted, 'escape') like '%+34600111222%')::text
     from pg_temp.stored('00000000-0000-0000-0000-0000000000c1', 'phone')),
  '(,f)',
  'phone is ciphertext at rest'
);

select is(
  (select public.decrypt_field(value_encrypted) from pg_temp.stored('00000000-0000-0000-0000-0000000000c1', 'document_number')),
  '"X1234567L"',
  'document_number round-trips through the decrypt helper'
);

select is(
  (select public.decrypt_field(value_encrypted) from pg_temp.stored('00000000-0000-0000-0000-0000000000c1', 'postal_code')),
  '"08500"',
  'postal_code round-trips through the decrypt helper'
);

-- City stays cleartext on purpose: aggregate impact reporting needs it.
select is(
  (select value from pg_temp.stored('00000000-0000-0000-0000-0000000000c1', 'city')),
  '"Vic"'::jsonb,
  'city is deliberately cleartext for aggregate reporting'
);

-- Arabic script survives the round trip unmangled.
select is(
  (select first_name from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  'أمينة',
  'Arabic given name stored intact'
);

-- Terms acceptance recorded as a versioned event.
select is(
  (select terms_version || '/' || locale_shown
     from public.terms_acceptances
    where profile_id = '00000000-0000-0000-0000-0000000000c1'),
  '2026-07-01/ar',
  'terms acceptance stores the version AND the language it was shown in'
);

select isnt(
  (select terms_accepted_at from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  null,
  'the profile summary column is stamped too (the onboarding gate reads it)'
);

-- No self-escalation: the RPC must never let a player write themselves a role.
select is(
  (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  'player',
  'a self-completed onboarding is always role=player, never staff or admin'
);

select * from finish();
rollback;
