-- Test players see the draft app terms and the draft authorization (RAPP-619,
-- pending fix 23).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. A test player reads the current draft of the app terms (catalog, gate,
--      acceptance) and of the authorization (status, signing) when one
--      exists, so the design role tests a text without publishing it.
--   2. A real player never sees a draft, on every path, while a draft exists:
--      the catalog, the terms gate, accepting, the authorization status,
--      signing, and the wizard's acceptance.
--   3. An acceptance or a signature on a draft is a test fixture, and it goes
--      when the draft is published or discarded: a published version never
--      carries a draft acceptance.
--   4. The scenario switches follow the same rule, and her page says a draft
--      is what she sees.
--
-- Seed: admin ...001, design role ...097, real player ...011, invited real
-- woman ...098, test player ...096 (invited, no answers), the current season
-- 2026/27 with authorization version 1, app terms version 1.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(46);

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

create temp table run (label text primary key, id uuid, content jsonb) on commit drop;
grant all on run to authenticated;
insert into run (label, id, content)
select 'terms-v1', id, content from public.app_terms_versions
 where org_id = '5eed0000-0000-4000-8000-000000000000' and version_number = 1;
insert into run (label, id, content)
select 'auth-v1', id, content from public.authorization_versions
 where org_id = '5eed0000-0000-4000-8000-000000000000' and version_number = 1;
-- A valid signing of version 1's shape: every required consent given.
insert into run (label, content)
select 'auth-payload', jsonb_build_object(
  'consents', (select jsonb_object_agg(c.consent_key, c.required)
                 from private.authorization_consents((select content from run where label = 'auth-v1')) c),
  'health_info', 'No',
  'emergency_contact', jsonb_build_object('name', 'Olena', 'phone', '+34600222333'),
  'unable_to_draw', true, 'language', 'ca');

-- She joins through the scenario tool, with her answers filled.
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096', jsonb_build_object(
       'kind', 'answers',
       'fill', jsonb_build_object(
         'first_name', 'Joana', 'last_name', 'Prova', 'preferred_language', 'ca',
         -- Her answers by field (RAPP-661).
         'answers', pg_temp.answers('{
           "date_of_birth": "1995-05-15", "place_of_birth": "Marroc", "nationality": "Marroc",
           "reference_entity": "Entitat de prova", "has_dependents": "no",
           "clothing_size": "M", "shoe_size": "38"}')))) $$,
  'the design role fills her answers'
);

-- 1. App terms: the draft ---------------------------------------------------------------------------------

select lives_ok(
  $$ select public.save_app_terms_draft(
       jsonb_set((select content from run where label = 'terms-v1'),
                 '{body}', '{"ca": "Esborrany de termes de Marc."}'::jsonb)) $$,
  'the design role writes a terms draft'
);
reset role;
insert into run (label, id) select 'terms-draft', id from public.app_terms_versions
 where org_id = '5eed0000-0000-4000-8000-000000000000' and published_at is null;
set local role authenticated;

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000096", "role": "authenticated"}';
select is(
  public.intake_catalog() -> 'terms' ->> 'id',
  (select id::text from run where label = 'terms-draft'),
  'the invited test player''s catalog carries the draft'
);
select is(
  public.intake_catalog() -> 'terms' -> 'content' -> 'body' ->> 'ca',
  'Esborrany de termes de Marc.',
  'with its words'
);
select ok(
  (public.intake_catalog() -> 'terms' ->> 'is_draft')::boolean
    and (public.intake_catalog() -> 'terms' -> 'version_number') = 'null'::jsonb,
  'marked as a draft, with no number'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000098", "role": "authenticated"}';
select is(
  public.intake_catalog() -> 'terms' ->> 'id',
  (select id::text from run where label = 'terms-v1'),
  'an invited real woman''s catalog carries the published version'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(
  (public.intake_catalog() -> 'terms' ->> 'is_draft')::boolean,
  false,
  'a real player''s catalog is never the draft'
);
select is(public.my_terms_acceptance_needed(), false, 'a real player''s gate ignores the draft');
select throws_ok(
  $$ select public.accept_current_app_terms((select id from run where label = 'terms-draft'), 'ca',
       '{"terms_accepted": true, "media_consent": false, "unable_to_draw": true}'::jsonb) $$,
  '55000', null::text,
  'a real player cannot accept the draft'
);

-- The wizard's acceptance names the draft; only a test player's may.
reset role;
select throws_ok(
  $$ insert into public.terms_acceptances (profile_id, terms_version, locale_shown)
     values ('5eed0000-0000-4000-8000-000000000011', 'draft', 'ca') $$,
  '23514', null::text,
  'a real player''s wizard acceptance never lands on the draft'
);
select throws_ok(
  $$ insert into public.terms_acceptances (profile_id, terms_version, locale_shown, version_id)
     values ('5eed0000-0000-4000-8000-000000000011', '1', 'ca', (select id from run where label = 'terms-draft')) $$,
  '23514', null::text,
  'nor does any acceptance naming the draft'
);
set local role authenticated;

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select ok(
  (public.test_player_scenario('5eed0000-0000-4000-8000-000000000096') ->> 'terms_draft')::boolean,
  'her page says she sees the draft terms'
);
select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096',
       '{"kind": "terms", "accepted": true}'::jsonb) $$,
  'the scenario switch makes her join on the draft'
);
reset role;
select is(
  (select count(*)::integer from public.terms_acceptances
    where profile_id = '5eed0000-0000-4000-8000-000000000096'
      and version_id = (select id from run where label = 'terms-draft') and is_test_fixture
      and terms_version = 'draft'),
  1,
  'her acceptance is recorded against the draft, as a test fixture'
);
set local role authenticated;
select is(
  (public.test_player_scenario('5eed0000-0000-4000-8000-000000000096') ->> 'terms_accepted')::boolean,
  true,
  'her page says she accepted what she sees'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000096", "role": "authenticated"}';
select is(public.my_terms_acceptance_needed(), false, 'her gate is open on the draft she accepted');
select lives_ok(
  $$ select public.accept_current_app_terms((select id from run where label = 'terms-draft'), 'ca',
       '{"terms_accepted": true, "media_consent": false, "unable_to_draw": true}'::jsonb) $$,
  'she accepts the draft from the terms screen'
);
select throws_ok(
  $$ select public.accept_current_app_terms((select id from run where label = 'terms-v1'), 'ca',
       '{"terms_accepted": true, "media_consent": false, "unable_to_draw": true}'::jsonb) $$,
  '55000', null::text,
  'the published version is not what she is shown while a draft exists'
);

-- Publishing the draft drops her draft acceptances.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(public.publish_app_terms_draft(), 2, 'an admin publishes the draft as version 2');
reset role;
select is(
  (select count(*)::integer from public.terms_acceptances
    where version_id = (select id from run where label = 'terms-draft')),
  0,
  'the published version carries no draft acceptance'
);
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000096", "role": "authenticated"}';
select is(public.my_terms_acceptance_needed(), true, 'so she is asked again for version 2');
select is(
  (public.intake_catalog() -> 'terms' ->> 'version_number')::integer,
  2,
  'her catalog now carries version 2'
);

-- Discarding a draft drops them too.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.save_app_terms_draft(
       jsonb_set((select content from run where label = 'terms-v1'),
                 '{body}', '{"ca": "Un altre esborrany."}'::jsonb)) $$,
  'the design role writes another draft'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000096", "role": "authenticated"}';
select lives_ok(
  $$ select public.accept_current_app_terms(
       (public.intake_catalog() -> 'terms' ->> 'id')::uuid, 'ca',
       '{"terms_accepted": true, "media_consent": false, "unable_to_draw": true}'::jsonb) $$,
  'she accepts it'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok($$ select public.discard_app_terms_draft() $$, 'the design role discards it');
reset role;
select is(
  (select count(*)::integer from public.terms_acceptances t
     left join public.app_terms_versions v on v.id = t.version_id
    where t.profile_id = '5eed0000-0000-4000-8000-000000000096' and (v.id is null or v.published_at is null)),
  0,
  'her acceptance of the discarded draft is gone'
);
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000096", "role": "authenticated"}';
select is(public.my_terms_acceptance_needed(), true, 'and version 2 is still asked');
select lives_ok(
  $$ select public.accept_current_app_terms(
       (public.intake_catalog() -> 'terms' ->> 'id')::uuid, 'ca',
       '{"terms_accepted": true, "media_consent": false, "unable_to_draw": true}'::jsonb) $$,
  'she accepts version 2'
);

-- 2. The authorization draft --------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.save_authorization_draft(
       jsonb_set((select content from run where label = 'auth-v1'),
                 '{title}', '{"ca": "Autorització en esborrany"}'::jsonb)) $$,
  'the design role writes an authorization draft'
);
select ok(
  (public.test_player_scenario('5eed0000-0000-4000-8000-000000000096') ->> 'authorization_draft')::boolean,
  'her page says she sees the draft authorization'
);
reset role;
insert into run (label, id) select 'auth-draft', id from public.authorization_versions
 where org_id = '5eed0000-0000-4000-8000-000000000000' and published_at is null;
set local role authenticated;

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000096", "role": "authenticated"}';
select is(
  (select version_id from public.my_authorization_status()),
  (select id from run where label = 'auth-draft'),
  'the test player is asked to sign the draft'
);
select ok(
  (select is_draft and version_number is null and required
          and season_id = '5eed0000-0000-4000-8040-000000000001'
     from public.my_authorization_status()),
  'a draft, with no number, for the current season'
);
select lives_ok(
  $$ select public.sign_authorization((select id from run where label = 'auth-draft'),
       (select content from run where label = 'auth-payload')) $$,
  'she signs the draft'
);
select is((select required from public.my_authorization_status()), false, 'and is not asked again');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select ok(
  (select version_id = (select id from run where label = 'auth-v1') and not is_draft
     from public.my_authorization_status()),
  'a real player is asked for the published version while a draft exists'
);
select throws_ok(
  $$ select public.sign_authorization((select id from run where label = 'auth-draft'),
       (select content from run where label = 'auth-payload')) $$,
  '23514', null::text,
  'a real player cannot sign the draft'
);

reset role;
select is(
  (select count(*)::integer from public.authorization_signatures
    where profile_id = '5eed0000-0000-4000-8000-000000000096'
      and version_id = (select id from run where label = 'auth-draft')
      and is_test_fixture and season_id = '5eed0000-0000-4000-8040-000000000001'),
  1,
  'her signature is recorded against the draft, as a test fixture'
);
select throws_ok(
  $$ select private.record_signature(gen_random_uuid(), '5eed0000-0000-4000-8000-000000000011',
       (select id from run where label = 'auth-draft'), (select content from run where label = 'auth-payload'),
       'staff_device', '5eed0000-0000-4000-8000-000000000001', now()) $$,
  '23514', null::text,
  'no signing path records a real player on the draft'
);
set local role authenticated;

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(public.publish_authorization_draft(), 2, 'an admin publishes the draft as version 2');
reset role;
select is(
  (select count(*)::integer from public.authorization_signatures
    where version_id = (select id from run where label = 'auth-draft')),
  0,
  'the published version carries no draft signature'
);
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000096", "role": "authenticated"}';
select ok(
  (select required and version_number = 2 and not is_draft from public.my_authorization_status()),
  'so she is asked to sign version 2'
);

-- The scenario switch signs a new draft, and discarding it drops the signature.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.save_authorization_draft((select content from run where label = 'auth-v1')) $$,
  'the design role writes another authorization draft'
);
select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096',
       '{"kind": "season_signature", "signed": true}'::jsonb) $$,
  'the signed switch signs the draft for her'
);
reset role;
select is(
  (select count(*)::integer from public.authorization_signatures s
     join public.authorization_versions v on v.id = s.version_id
    where s.profile_id = '5eed0000-0000-4000-8000-000000000096' and v.published_at is null and s.is_test_fixture),
  1,
  'on the draft, as a test fixture'
);
set local role authenticated;
select lives_ok($$ select public.discard_authorization_draft() $$, 'the design role discards the draft');
reset role;
select is(
  (select count(*)::integer from public.authorization_signatures s
    where s.profile_id = '5eed0000-0000-4000-8000-000000000096'
      and not exists (select 1 from public.authorization_versions v
                       where v.id = s.version_id and v.published_at is not null)),
  0,
  'her signature of the discarded draft is gone'
);

select * from finish();
rollback;
