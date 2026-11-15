-- App terms, editable and versioned (RAPP-613).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Version 1 is the text the app bundled, made for every organization,
--      and every acceptance made before is an acceptance of version 1, so
--      nobody is asked again at deploy.
--   2. Staff with onboarding design rights keep one draft; only
--      settings.organization publishes; every save, discard and publish is
--      audited. Players never read a draft.
--   3. A published version never changes and is never deleted.
--   4. After a publish, a player who joined must accept the new version
--      (the gate), accepts it alone (no wizard), and her acceptance keeps the
--      version and the language shown, with her signature.
--   5. An acceptance made through the wizard or the scenario tool records the
--      version it was given (a stale screen is asked again), and an old app
--      build's dated version maps to version 1.
--
-- Seed: admin ...001, staff ...002 (no settings.organization), design role
-- ...097, real players ...011 and ...012, invited woman ...098, test player
-- ...096, organization ...000.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(40);

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

create temp table ids (label text primary key, id uuid) on commit drop;
grant all on ids to authenticated;
insert into ids select 'v1', id from public.app_terms_versions
 where org_id = '5eed0000-0000-4000-8000-000000000000' and version_number = 1;

-- 1. Version 1 -------------------------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.app_terms_versions
    where org_id = '5eed0000-0000-4000-8000-000000000000' and published_at is not null),
  1,
  'the organization starts with one published version'
);
select is(
  (select content -> 'title' ->> 'ca' from public.app_terms_versions where id = (select id from ids where label = 'v1')),
  'Termes i condicions de l’app',
  'version 1 is the bundled Catalan text'
);
select is(
  (select jsonb_array_length(content -> 'points') from public.app_terms_versions where id = (select id from ids where label = 'v1')),
  4,
  'with the four introduction points'
);
select is(
  (select count(*)::integer from public.terms_acceptances where version_id is distinct from (select id from ids where label = 'v1')),
  0,
  'every acceptance made before is an acceptance of version 1'
);
insert into public.organizations (id, name, slug)
values ('5eed0000-0000-4000-8000-0000000000aa', 'Organització de prova', 'prova-613');
select is(
  (select version_number from public.app_terms_versions where org_id = '5eed0000-0000-4000-8000-0000000000aa'),
  1,
  'a new organization starts with version 1 too'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(public.my_terms_acceptance_needed(), false, 'a player who joined is not asked again at deploy');
select is(
  (public.intake_catalog() -> 'terms' ->> 'version_number')::integer,
  1,
  'the onboarding catalog carries the current version'
);

-- 2. Draft and publish ------------------------------------------------------------------------------------

select throws_ok(
  $$ select public.save_app_terms_draft((select content from public.app_terms_versions limit 1)) $$,
  '42501', null::text,
  'a player cannot write a draft'
);
select throws_ok(
  $$ select * from public.list_app_terms_versions() $$,
  '42501', null::text,
  'nor list the versions'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.save_app_terms_draft(
       jsonb_set((select content from public.app_terms_versions where version_number = 1),
                 '{body}', '{"ca": "Text legal nou de l''entitat.", "es": "Nuevo texto legal."}'::jsonb)) $$,
  'the design role writes a draft'
);
select lives_ok(
  $$ select public.save_app_terms_draft(
       jsonb_set((select content from public.app_terms_versions where version_number = 1),
                 '{body}', '{"ca": "Text legal nou de l''entitat, revisat."}'::jsonb)) $$,
  'and saves it again'
);
select is(
  (select count(*)::integer from public.list_app_terms_versions() v where v.version_number is null),
  1,
  'there is one draft, saved in place'
);
select throws_ok(
  $$ select public.save_app_terms_draft(
       jsonb_set((select content from public.app_terms_versions where version_number = 1),
                 '{title}', '{"en": "English only"}'::jsonb)) $$,
  '23514', null::text,
  'a field without Catalan is refused'
);
select throws_ok(
  $$ select public.publish_app_terms_draft() $$,
  '42501', 'publishing the app terms needs settings.organization',
  'the design role cannot publish'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(
  (select count(*)::integer from public.app_terms_versions where published_at is null),
  0,
  'a player never reads a draft'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select is(public.publish_app_terms_draft(), 2, 'an admin publishes it as version 2');
reset role;
insert into ids select 'v2', id from public.app_terms_versions
 where org_id = '5eed0000-0000-4000-8000-000000000000' and version_number = 2;
select is(
  (select array_agg(action order by created_at, action) from public.audit_log
    where action like 'app_terms.%' and target_id = (select id from ids where label = 'v2')),
  array['app_terms.draft_saved', 'app_terms.draft_saved', 'app_terms.publish'],
  'every save and the publish are audited'
);
select is(
  (select changes ->> 'version_number' from public.audit_log
    where action = 'app_terms.publish' and target_id = (select id from ids where label = 'v2')),
  '2',
  'the publish audit names the version'
);
set local role authenticated;
select throws_ok(
  $$ select public.publish_app_terms_draft() $$,
  '55000', 'there is no draft to publish',
  'nothing to publish without a draft'
);

-- 3. Immutable -------------------------------------------------------------------------------------------

reset role;
select throws_ok(
  $$ update public.app_terms_versions set content = jsonb_set(content, '{body,ca}', '"Canviat"')
      where id = (select id from ids where label = 'v2') $$,
  '55000', 'APP_TERMS/PUBLISHED_IMMUTABLE',
  'a published version never changes, whoever writes'
);
select throws_ok(
  $$ delete from public.app_terms_versions where id = (select id from ids where label = 'v1') $$,
  '55000', 'APP_TERMS/PUBLISHED_IMMUTABLE',
  'and is never deleted'
);
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ update public.app_terms_versions set version_number = 9 $$,
  '42501', null::text,
  'nobody writes the table directly'
);

-- A draft can be discarded, audited.
select lives_ok(
  $$ select public.save_app_terms_draft((select content from public.app_terms_versions where version_number = 2)) $$,
  'a new draft'
);
select lives_ok($$ select public.discard_app_terms_draft() $$, 'discarded');
select is(
  (select count(*)::integer from public.list_app_terms_versions() v where v.version_number is null),
  0,
  'and gone'
);
reset role;
select is(
  (select count(*)::integer from public.audit_log where action = 'app_terms.draft_discarded'),
  1,
  'the discard is audited'
);

-- 4. Acceptance again --------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select is(public.my_terms_acceptance_needed(), true, 'after the publish, the player must accept again');
select is(
  (public.intake_catalog() -> 'terms' ->> 'version_number')::integer,
  2,
  'and her app reads version 2'
);
select throws_ok(
  $$ select public.accept_current_app_terms((select id from ids where label = 'v1'), 'es',
       '{"terms_accepted": true, "media_consent": false, "signature": null, "unable_to_draw": true}'::jsonb) $$,
  '55000', 'accept the current version',
  'an old version cannot be accepted'
);
select throws_ok(
  $$ select public.accept_current_app_terms((select id from ids where label = 'v2'), 'es',
       '{"terms_accepted": false, "media_consent": false, "signature": null, "unable_to_draw": true}'::jsonb) $$,
  '23514', null::text,
  'acceptance must be explicit'
);
select lives_ok(
  $$ select public.accept_current_app_terms((select id from ids where label = 'v2'), 'es',
       '{"terms_accepted": true, "media_consent": true, "signature": null, "unable_to_draw": true, "device": "test"}'::jsonb) $$,
  'she accepts version 2 from the terms screen alone'
);
select is(public.my_terms_acceptance_needed(), false, 'and the gate opens');
reset role;
select is(
  (select t.terms_version || ':' || t.locale_shown || ':' || (s.acceptance_id is not null)::text
     from public.terms_acceptances t
     left join public.app_terms_signatures s on s.acceptance_id = t.id
    where t.profile_id = '5eed0000-0000-4000-8000-000000000011'
      and t.version_id = (select id from ids where label = 'v2')),
  '2:es:true',
  'her acceptance keeps the version, the language shown and her signature'
);
select isnt(
  (select media_consent_at from public.profiles where id = '5eed0000-0000-4000-8000-000000000011'),
  null,
  'and her photo choice'
);

-- 5. Other paths record the version they were given ---------------------------------------------------------

insert into public.terms_acceptances (profile_id, terms_version, locale_shown)
values ('5eed0000-0000-4000-8000-000000000012', '2026-07-01', 'ca'),
       ('5eed0000-0000-4000-8000-000000000013', '2', 'ca');
select is(
  (select array_agg(t.terms_version || '=' || v.version_number order by t.terms_version)
     from public.terms_acceptances t join public.app_terms_versions v on v.id = t.version_id
    where t.profile_id in ('5eed0000-0000-4000-8000-000000000012', '5eed0000-0000-4000-8000-000000000013')
      and t.accepted_at = now()),
  array['2=2', '2026-07-01=1'],
  'an old build''s dated version is version 1; a numbered one is that version'
);

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
  'the design role fills the test player''s answers'
);
select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096',
       '{"kind": "terms", "accepted": true}'::jsonb) $$,
  'and sets her terms accepted, with no version to send'
);
reset role;
select is(
  (select v.version_number from public.terms_acceptances t
     join public.app_terms_versions v on v.id = t.version_id
    where t.profile_id = '5eed0000-0000-4000-8000-000000000096'),
  2,
  'the scenario tool accepts the current version'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000098", "role": "authenticated"}';
select is(public.my_terms_acceptance_needed(), false, 'an invited woman meets the terms in her wizard, not the gate');

select ok(
  not has_function_privilege('anon', 'public.accept_current_app_terms(uuid, text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.save_app_terms_draft(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.publish_app_terms_draft(boolean)', 'execute')
  and not has_function_privilege('anon', 'public.discard_app_terms_draft()', 'execute')
  and not has_function_privilege('anon', 'public.list_app_terms_versions()', 'execute')
  and not has_function_privilege('anon', 'public.my_terms_acceptance_needed()', 'execute'),
  'none of it is open to anon'
);

select * from finish();
rollback;
