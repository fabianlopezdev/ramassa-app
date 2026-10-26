-- Export the onboarding setup and import it into another organization (RAPP-621).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Onboarding designers and admins export; players and other staff do
--      not. Only an admin (settings.organization) previews or imports.
--   2. The export never carries anything about a person: no profile id, no
--      address, no test player, answer, acceptance or signature, and no
--      `*_by` column. Every export is audited with its counts.
--   3. A round trip: a rich setup (a field of every type, a condition, archived
--      rows, a moved flow, a hidden screen, required flags, presets, the
--      document note, terms and authorization drafts) exported, imported into
--      a fresh organization and exported again gives the same document apart
--      from ids and timestamps. The legal texts arrive as drafts, never
--      published.
--   4. The import runs once: an organization with onboarding settings is
--      refused, in the preview and in the import. A preview writes nothing.
--   5. An unknown schema version is refused with a clear message. The file is
--      version 3 (RAPP-656): screens, sections, fields and placements, and
--      nothing of the old question shape.
--
-- Seed: admin ...001, staff ...002 (no settings.organization), design role
-- ...097, real player ...011, test player ...096, organization ...000.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(42);

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

create temp table run (label text primary key, doc jsonb) on commit drop;
grant all on run to authenticated;

-- Normalizes a document for comparison: every id becomes its order of first
-- appearance, and the times and the legal texts (compared apart) go. Fields
-- and placements are compared as sets: built-in fields tie on their order.
create function pg_temp.normalized(p_doc jsonb) returns jsonb language plpgsql as $$
declare
  stable jsonb := (p_doc - 'exported_at' - 'app_commit' - 'app_terms' - 'authorization' - 'placements')
    || jsonb_build_object('fields', (
         select coalesce(jsonb_agg(f order by f ->> 'kind', f ->> 'system_key', f -> 'label' ->> 'ca', f ->> 'sort_order'), '[]'::jsonb)
           from jsonb_array_elements(p_doc -> 'fields') f));
  body text := stable::text || chr(10) || (p_doc -> 'placements')::text;
  found_id text;
  position integer := 0;
  result jsonb;
begin
  for found_id in
    select m.id from (
      select match[1] as id, min(ordinality) as first_seen
        from regexp_matches(body, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'g')
             with ordinality as found(match, ordinality)
       group by match[1]) m
     order by m.first_seen
  loop
    position := position + 1;
    body := replace(body, found_id, 'ref-' || position);
  end loop;
  result := split_part(body, chr(10), 1)::jsonb;
  return result || jsonb_build_object('placements', (
    select coalesce(jsonb_agg(p order by p::text), '[]'::jsonb)
      from jsonb_array_elements(split_part(body, chr(10), 2)::jsonb) p));
end;
$$;
grant execute on function pg_temp.normalized(jsonb) to authenticated;

-- A rich setup in the seeded organization --------------------------------------------------------------

insert into public.intake_screens (id, org_id, title, intro, after_screen, sort_order)
values ('5eed0000-0000-4000-8044-0000000006b1', '5eed0000-0000-4000-8000-000000000000',
        '{"ca": "Totes les preguntes", "es": "Todas las preguntas"}', '{"ca": "Una de cada tipus."}', 'documentation', 0),
       ('5eed0000-0000-4000-8044-0000000006b2', '5eed0000-0000-4000-8000-000000000000',
        '{"ca": "Pantalla arxivada"}', null, 'identity', 3);
update public.intake_screens set is_archived = true where id = '5eed0000-0000-4000-8044-0000000006b2';
-- Fifteen Fitxa fields, one of each type, placed on that screen; the first required there.
create temp table every_type (n integer, question_type text, settings jsonb) on commit drop;
insert into every_type values
    (1, 'short_text', '{}'), (2, 'long_text', '{}'), (3, 'yes_no_maybe', '{}'), (4, 'single_choice', '{}'),
    (5, 'multiple_choice', '{}'), (6, 'number', '{"integer": true, "min": 1, "max": 10}'),
    (7, 'date', '{"min_age": 16}'), (8, 'yes_no', '{}'), (9, 'phone', '{}'), (10, 'email', '{}'),
    (11, 'search_choice', '{}'), (12, 'item_list', '{"max_items": 5}'),
    (13, 'country', '{}'), (14, 'file_upload', '{"accept": "photo"}'),
    (15, 'municipality', '{}');
insert into public.profile_fields (id, org_id, section_id, kind, question_type, label, privacy, settings, sort_order)
select ('5eed0000-0000-4000-8045-0000000006' || lpad(t.n::text, 2, '0'))::uuid,
       '5eed0000-0000-4000-8000-000000000000', s.id, 'custom',
       t.question_type, jsonb_build_object('ca', 'Pregunta ' || t.question_type), 'normal', t.settings, 200 + t.n
  from every_type t
  join public.profile_sections s on s.org_id = '5eed0000-0000-4000-8000-000000000000' and s.key = 'support';
insert into public.field_placements (org_id, field_id, surface, screen_key, sort_order, required)
select '5eed0000-0000-4000-8000-000000000000', ('5eed0000-0000-4000-8045-0000000006' || lpad(t.n::text, 2, '0'))::uuid,
       'onboarding', '5eed0000-0000-4000-8044-0000000006b1', t.n, t.n = 1
  from every_type t;
insert into public.custom_question_options (id, org_id, question_id, label, sort_order, is_archived)
values ('5eed0000-0000-4000-8046-0000000006c1', '5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8045-000000000604', '{"ca": "Sí, molt"}', 0, false),
       ('5eed0000-0000-4000-8046-0000000006c2', '5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8045-000000000604', '{"ca": "Gens"}', 1, false),
       ('5eed0000-0000-4000-8046-0000000006c3', '5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8045-000000000604', '{"ca": "Antiga"}', 2, true),
       ('5eed0000-0000-4000-8046-0000000006c4', '5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8045-000000000605', '{"ca": "A"}', 0, false),
       ('5eed0000-0000-4000-8046-0000000006c5', '5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8045-000000000611', '{"ca": "B"}', 0, false);
-- A condition on the same screen, and an archived field.
update public.profile_fields
   set show_when_field_id = '5eed0000-0000-4000-8045-000000000604',
       show_when_option_id = '5eed0000-0000-4000-8046-0000000006c1'
 where id = '5eed0000-0000-4000-8045-000000000602';
update public.profile_fields set is_archived = true where id = '5eed0000-0000-4000-8045-000000000603';
update public.organizations
   set document_step_explanation = '{"ca": "Porta el teu document si el tens.", "en": "Bring your document if you have it."}'
 where id = '5eed0000-0000-4000-8000-000000000000';

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.save_builtin_screen('specific-needs', '{"title": {"ca": "Necessitats"}}'::jsonb, true) $$,
  'the design role words and hides a screen'
);
select lives_ok(
  $$ select public.save_intake_flow_order(array['identity', 'background', 'equipment', 'documentation',
       'custom:5eed0000-0000-4000-8044-0000000006b1', 'logistics',
       'custom:5eed0000-0000-4000-8044-000000000001', 'custom:5eed0000-0000-4000-8044-000000000002',
       'custom:5eed0000-0000-4000-8044-000000000003',
       'season', 'supporting-entities', 'participation-support', 'specific-needs']) $$,
  'moves the flow'
);
select lives_ok(
  $$ select public.save_app_terms_draft(jsonb_set(
       (select content from public.app_terms_versions where version_number = 1),
       '{body}', '{"ca": "Termes dissenyats per en Marc."}'::jsonb)) $$,
  'writes a terms draft'
);
select lives_ok(
  $$ select public.save_authorization_draft(jsonb_set(
       (select content from public.authorization_versions where version_number = 1),
       '{title}', '{"ca": "Autorització dissenyada"}'::jsonb)) $$,
  'and an authorization draft'
);
-- A test player with answers and an acceptance: none of it may travel.
select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096', jsonb_build_object(
       'kind', 'answers',
       'fill', jsonb_build_object(
         'first_name', 'Joana', 'last_name', 'Provatura', 'preferred_language', 'ca',
         -- Her answers by field (RAPP-661).
         'answers', pg_temp.answers('{
           "date_of_birth": "1995-05-15", "place_of_birth": "Marroc", "nationality": "Marroc",
           "reference_entity": "Entitat de prova", "has_dependents": "no",
           "clothing_size": "M", "shoe_size": "38"}')))) $$,
  'a test player has answers'
);

-- 1. Who exports ----------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select throws_ok($$ select public.export_onboarding_setup(null) $$, '42501', null::text,
  'a player cannot export');
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok($$ select public.export_onboarding_setup(null) $$, '42501', null::text,
  'nor staff without onboarding rights');
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal1"}';
select throws_ok($$ select public.export_onboarding_setup(null) $$, '42501', null::text,
  'nor an admin without her second factor');

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok($$ select public.preview_onboarding_setup_import('{}'::jsonb) $$, '42501', null::text,
  'the design role does not preview an import');
select throws_ok($$ select public.import_onboarding_setup('{}'::jsonb) $$, '42501', null::text,
  'nor import');
select lives_ok(
  $$ insert into run (label, doc) values ('design', public.export_onboarding_setup('abc1234')) $$,
  'the design role exports'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
insert into run (label, doc) values ('first', public.export_onboarding_setup('abc1234'));
reset role;

-- 2. Never people data ----------------------------------------------------------------------------------

select ok(
  (select doc ->> 'format' = 'ramassa.onboarding-setup' and (doc ->> 'schema_version')::integer = 3
          and doc ->> 'app_commit' = 'abc1234' from run where label = 'first'),
  'one versioned document with the app commit'
);
select is(
  (select count(*)::integer from public.profiles p, run r
    where r.label = 'first' and strpos(r.doc::text, p.id::text) > 0),
  0,
  'no profile id is in the export'
);
select is(
  (select count(*)::integer from auth.users u, run r
    where r.label = 'first' and u.email is not null and strpos(lower(r.doc::text), lower(u.email)) > 0),
  0,
  'no address is in the export'
);
select ok(
  (select strpos(doc::text, 'Provatura') = 0 and strpos(doc::text, '"updated_by"') = 0
          and strpos(doc::text, '"created_by"') = 0 and strpos(doc::text, '"published_by"') = 0
     from run where label = 'first'),
  'no answer and no author column'
);
select is(
  (select count(*)::integer from public.authorization_signatures s, run r
    where r.label = 'first' and strpos(r.doc::text, s.id::text) > 0)
  + (select count(*)::integer from public.terms_acceptances t, run r
    where r.label = 'first' and strpos(r.doc::text, t.id::text) > 0)
  + (select count(*)::integer from public.audit_log a, run r
    where r.label = 'first' and strpos(r.doc::text, a.id::text) > 0),
  0,
  'no signature, acceptance or audit row'
);
select is(
  (select count(*)::integer from public.seasons s, run r
    where r.label = 'first' and s.is_test_fixture and strpos(r.doc::text, s.id::text) > 0),
  0,
  'no test fixture season'
);
select ok(
  (select jsonb_array_length(doc -> 'screens') = 5
          and (select count(*) from jsonb_array_elements(doc -> 'fields') f where f ->> 'kind' = 'custom') = 20
          and not exists (select 1 from jsonb_array_elements(doc -> 'screens') s
                           where s ? 'questions' or s ? 'builtin_screen')
          and not exists (select 1 from jsonb_array_elements(doc -> 'fields') f where f ? 'legacy_screen_id')
          and doc -> 'app_terms' -> 'draft' -> 'content' -> 'body' ->> 'ca' = 'Termes dissenyats per en Marc.'
          and doc -> 'authorization' -> 'draft' -> 'content' -> 'title' ->> 'ca' = 'Autorització dissenyada'
          and jsonb_array_length(doc -> 'app_terms' -> 'published') = 1
          and jsonb_array_length(doc -> 'authorization' -> 'published') = 1
     from run where label = 'first'),
  'screens, fields, archived rows and both legal drafts are in it, and nothing of the old question shape'
);
select is(
  (select changes -> 'counts' ->> 'questions' from public.audit_log
    where action = 'onboarding.export' and actor_id = '5eed0000-0000-4000-8000-000000000001'),
  '20',
  'the export is audited with its counts'
);

-- 3. Into a fresh organization ----------------------------------------------------------------------------

insert into public.organizations (id, name, slug)
values ('5eed0000-0000-4000-8000-0000000006a0', 'Producció de prova', 'prova-621');
insert into auth.users (id, email) values ('5eed0000-0000-4000-8000-0000000006a1', 'admin-621@example.test');
insert into public.profiles (id, org_id, role, first_name, last_name)
values ('5eed0000-0000-4000-8000-0000000006a1', '5eed0000-0000-4000-8000-0000000006a0', 'admin', 'Admin', 'Nou')
on conflict (id) do update set org_id = excluded.org_id, role = excluded.role;
insert into public.team_member_permissions (org_id, profile_id, permission_code)
values ('5eed0000-0000-4000-8000-0000000006a0', '5eed0000-0000-4000-8000-0000000006a1', 'settings.organization')
on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-0000000006a1", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';

select throws_ok(
  $$ select public.preview_onboarding_setup_import(
       jsonb_set((select doc from run where label = 'first'), '{schema_version}', '99')) $$,
  '22023', 'ONBOARDING_SETUP/UNKNOWN_SCHEMA_VERSION: this file uses onboarding setup schema version 99; this app reads versions 1, 2 and 3. Export it again from an app at the same version.',
  'an unknown schema version is refused with a clear message'
);
select throws_ok(
  $$ select public.import_onboarding_setup('{"format": "something-else"}'::jsonb) $$,
  '22023', null::text,
  'and a file that is not an export'
);
select ok(
  (select (p ->> 'can_import')::boolean and p -> 'blockers' = '[]'::jsonb and p ->> 'problem' is null
          and (p -> 'counts' ->> 'questions')::integer = 20 and (p -> 'counts' ->> 'screens')::integer = 5
          and p -> 'legal' -> 'app_terms' ->> 'source' = 'draft'
          and p -> 'legal' -> 'authorization' ->> 'source' = 'draft'
          and p -> 'warnings' @> '[{"code": "legal_drafts"}]'
     from public.preview_onboarding_setup_import((select doc from run where label = 'first')) p),
  'the preview says what will be created, from which legal drafts, and that it will work'
);
reset role;
select is(
  (select count(*)::integer from public.intake_screens where org_id = '5eed0000-0000-4000-8000-0000000006a0')
  + (select count(*)::integer from public.app_terms_versions where org_id = '5eed0000-0000-4000-8000-0000000006a0'),
  1,
  'a preview writes nothing (only the automatic terms version 1 is there)'
);
set local role authenticated;

select lives_ok(
  $$ insert into run (label, doc) values ('report', public.import_onboarding_setup((select doc from run where label = 'first'))) $$,
  'the admin imports it'
);
insert into run (label, doc) values ('second', public.export_onboarding_setup(null));
reset role;

select is(
  (select pg_temp.normalized(doc) from run where label = 'second'),
  (select pg_temp.normalized(doc) from run where label = 'first'),
  'exported again, it is the same document apart from ids and times'
);
select is(
  (select doc -> 'app_terms' -> 'draft' from run where label = 'second'),
  (select doc -> 'app_terms' -> 'draft' from run where label = 'first'),
  'the terms draft arrives word for word'
);
select is(
  (select doc -> 'authorization' -> 'draft' from run where label = 'second'),
  (select doc -> 'authorization' -> 'draft' from run where label = 'first'),
  'and the authorization draft'
);
select is(
  (select count(*)::integer from public.authorization_versions
    where org_id = '5eed0000-0000-4000-8000-0000000006a0' and published_at is not null)
  + (select count(*)::integer from public.app_terms_versions
    where org_id = '5eed0000-0000-4000-8000-0000000006a0' and published_at is not null and version_number <> 1),
  0,
  'the import publishes no legal text'
);
set local role authenticated;
select is(
  (select array_agg(is_current) from public.list_authorization_versions()),
  array[false],
  'the imported authorization draft lists as not current, never as unknown'
);
reset role;
select ok(
  (select doc -> 'legal' -> 'app_terms' ->> 'source' = 'draft' and (doc -> 'legal' -> 'app_terms' ->> 'imported')::boolean
     from run where label = 'report'),
  'the report says the terms arrived as a draft to publish'
);
select is(
  (select count(*)::integer from public.intake_screens s
    where s.org_id = '5eed0000-0000-4000-8000-0000000006a0'
      and s.id in (select id from public.intake_screens where org_id = '5eed0000-0000-4000-8000-000000000000')),
  0,
  'every screen has a new id'
);
select is(
  (select count(*)::integer from public.profile_fields q
     join public.profile_fields gate on gate.id = q.show_when_field_id
     join public.custom_question_options o on o.id = q.show_when_option_id
    where q.org_id = '5eed0000-0000-4000-8000-0000000006a0'
      and gate.org_id = q.org_id and o.org_id = q.org_id),
  (select count(*)::integer from public.profile_fields
    where org_id = '5eed0000-0000-4000-8000-000000000000' and show_when_field_id is not null),
  'every condition points inside the new organization'
);
select ok(
  (select bool_and(substr(step, 8)::uuid in (select id from public.intake_screens where org_id = '5eed0000-0000-4000-8000-0000000006a0'))
     from public.intake_flow_orders f, unnest(f.step_order) step
    where f.org_id = '5eed0000-0000-4000-8000-0000000006a0' and step like 'custom:%'),
  'the flow order names the new screens'
);
select ok(
  (select is_hidden from public.intake_builtin_screens
    where org_id = '5eed0000-0000-4000-8000-0000000006a0' and screen = 'specific-needs'),
  'the hidden screen stays hidden'
);
select is(
  (select count(*)::integer from public.seasons
    where org_id = '5eed0000-0000-4000-8000-0000000006a0' and is_current and name = '2026/27'),
  1,
  'the current season arrives'
);
select is(
  (select changes -> 'counts' ->> 'questions' from public.audit_log
    where action = 'onboarding.import' and org_id = '5eed0000-0000-4000-8000-0000000006a0'),
  '20',
  'the import is audited with its counts'
);

-- 4. Once per organization ------------------------------------------------------------------------------

set local role authenticated;
select ok(
  (select not (p ->> 'can_import')::boolean and p -> 'blockers' ? 'screens' and p -> 'blockers' ? 'app_terms'
     from public.preview_onboarding_setup_import((select doc from run where label = 'first')) p),
  'a second preview says the organization already has a setup'
);
select throws_ok(
  $$ select public.import_onboarding_setup((select doc from run where label = 'first')) $$,
  '55000', null::text,
  'and a second import is refused'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.import_onboarding_setup((select doc from run where label = 'second')) $$,
  '55000', null::text,
  'an organization with its own setup is never overwritten'
);

-- A preview that would fail says why, and still writes nothing.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-0000000006a1", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
reset role;
delete from public.intake_screens where org_id = '5eed0000-0000-4000-8000-0000000006a0';
delete from public.profile_fields where org_id = '5eed0000-0000-4000-8000-0000000006a0' and kind = 'custom';
-- The app questions' wording and required flags live on their placements (RAPP-666).
update public.field_placements p
   set label_override = null, help_override = null
  from public.profile_fields f
 where f.id = p.field_id and f.org_id = '5eed0000-0000-4000-8000-0000000006a0' and f.kind = 'builtin';
select private.set_app_question_required('5eed0000-0000-4000-8000-0000000006a0', q.question,
         q.question = any (private.default_required_intake_questions()))
  from unnest(private.wizard_intake_questions()) q(question)
 where not (q.question = any (private.locked_required_intake_questions()));
delete from public.intake_builtin_screens where org_id = '5eed0000-0000-4000-8000-0000000006a0';
delete from public.intake_flow_orders where org_id = '5eed0000-0000-4000-8000-0000000006a0';
delete from public.intake_state_presets where org_id = '5eed0000-0000-4000-8000-0000000006a0';
update public.organizations set document_step_explanation = null where id = '5eed0000-0000-4000-8000-0000000006a0';
delete from public.app_terms_versions where org_id = '5eed0000-0000-4000-8000-0000000006a0' and published_at is null;
delete from public.authorization_versions where org_id = '5eed0000-0000-4000-8000-0000000006a0';
delete from public.seasons where org_id = '5eed0000-0000-4000-8000-0000000006a0';
set local role authenticated;
select ok(
  (select (p ->> 'can_import')::boolean
     from public.preview_onboarding_setup_import((select doc from run where label = 'first')) p),
  'emptied again, the organization can import again'
);
select ok(
  (select not (p ->> 'can_import')::boolean
          and p ->> 'problem' like 'ONBOARDING_SETUP/REFUSED_VALUE: a question in the file%'
     from public.preview_onboarding_setup_import((
       select jsonb_set(r.doc,
                array['fields', (select (f.ordinality - 1)::text
                                   from jsonb_array_elements(r.doc -> 'fields') with ordinality as f(field, ordinality)
                                  where f.field ->> 'kind' = 'custom' order by f.ordinality limit 1),
                      'question_type'],
                '"not_a_type"')
         from run r where r.label = 'first')) p),
  'a file the database would refuse is reported by the preview'
);
reset role;
select is(
  (select count(*)::integer from public.profile_fields
    where org_id = '5eed0000-0000-4000-8000-0000000006a0' and kind = 'custom'),
  0,
  'and nothing was written'
);

select * from finish();
rollback;
