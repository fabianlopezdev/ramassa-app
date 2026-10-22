-- Export the onboarding setup from one organization and import it into another (RAPP-621).
--
-- WHY
--
-- Marc designs the onboarding Ramassà launches with on staging. Production is
-- created at the end (RAPP-74). The design must move there as data, without
-- a single test player, answer, consent, signature or audit row.
--
-- WHAT THIS MIGRATION DOES
--
--   1. `export_onboarding_setup(app_commit)`: one versioned JSON document
--      (`format`, `schema_version` 1, the app commit, the export time) with
--      the organization's onboarding configuration: staff screens (their
--      anchors and home places), staff questions (type, settings, privacy,
--      placements, required flag, show-when) and their options, archived ones
--      included; built-in question overrides; built-in screen wording and hide
--      switches; the flow order; the required list; the intake presets; the
--      document step explanation; the app terms versions (published and the
--      draft); the real seasons; the authorization versions (published and
--      the draft, with their attachment links). Ids are the source's
--      configuration ids, used only to rebuild references. Nothing about a
--      person is read: no profile, answer, consent, signature, audit row or
--      test fixture, and no `*_by` column. Onboarding designers and admins
--      export (`private.can_design_onboarding`). Audited as `onboarding.export`
--      with the counts.
--   2. `preview_onboarding_setup_import(document)`: admins only
--      (settings.organization). It reads the document, lists what would be
--      created (counts per type), the warnings, and what blocks it. It runs
--      the whole import in a subtransaction and rolls it back, so a preview
--      that says yes is an import that works.
--   3. `import_onboarding_setup(document)`: admins only, once per organization:
--      refused unless the organization has no onboarding configuration yet
--      (only the automatic app terms version 1). It recreates everything with
--      new ids, the same order and wording, every reference remapped
--      (show-when, flow order). The legal texts are never published here: the
--      newest app terms and authorization (the draft, else the latest
--      published version) are saved as DRAFTS through `save_app_terms_draft`
--      and `save_authorization_draft`, which validate them, and the report
--      says an admin must publish them. Audited as `onboarding.import` with
--      the counts.
--   4. An unknown format or schema version is refused with a clear message.
--
-- No table is added: the RGPD register is unchanged.
--
-- Docs: https://supabase.com/docs/guides/database/json (jsonb in Postgres),
-- https://www.postgresql.org/docs/current/functions-json.html (jsonb_agg,
-- jsonb_array_elements ... with ordinality), https://www.postgresql.org/docs/current/plpgsql-control-structures.html#PLPGSQL-ERROR-TRAPPING
-- (a block with an EXCEPTION clause is a subtransaction: everything it did is
-- rolled back when the error is caught) and
-- https://supabase.com/docs/guides/database/postgres/row-level-security
-- (security definer functions with an empty search path, permission checks
-- inside).

-- 1. Helpers ----------------------------------------------------------------------------------------------

create or replace function private.json_array_or_empty(p_value jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_value) = 'array' then p_value else '[]'::jsonb end;
$$;

create or replace function private.json_value_or_null(p_value jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when p_value is null or jsonb_typeof(p_value) = 'null' then null else p_value end;
$$;

-- What a document holds, per type.
create or replace function private.onboarding_setup_counts(p_document jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'screens', jsonb_array_length(private.json_array_or_empty(p_document -> 'screens')),
    'questions', (select count(*) from jsonb_array_elements(private.json_array_or_empty(p_document -> 'screens')) s,
                       jsonb_array_elements(private.json_array_or_empty(s -> 'questions')) q),
    'options', (select count(*) from jsonb_array_elements(private.json_array_or_empty(p_document -> 'screens')) s,
                     jsonb_array_elements(private.json_array_or_empty(s -> 'questions')) q,
                     jsonb_array_elements(private.json_array_or_empty(q -> 'options')) o),
    'builtin_question_overrides', jsonb_array_length(private.json_array_or_empty(p_document -> 'builtin_question_overrides')),
    'builtin_screens', jsonb_array_length(private.json_array_or_empty(p_document -> 'builtin_screens')),
    'flow_order_steps', jsonb_array_length(private.json_array_or_empty(p_document -> 'flow_order')),
    'required_questions', jsonb_array_length(private.json_array_or_empty(p_document -> 'required_questions')),
    'presets', jsonb_array_length(private.json_array_or_empty(p_document -> 'presets')),
    'document_step_explanation', case when private.json_value_or_null(p_document -> 'document_step_explanation') is null then 0 else 1 end,
    'app_terms_versions', jsonb_array_length(private.json_array_or_empty(p_document -> 'app_terms' -> 'published'))
      + case when private.json_value_or_null(p_document -> 'app_terms' -> 'draft') is null then 0 else 1 end,
    'seasons', jsonb_array_length(private.json_array_or_empty(p_document -> 'seasons')),
    'authorization_versions', jsonb_array_length(private.json_array_or_empty(p_document -> 'authorization' -> 'published'))
      + case when private.json_value_or_null(p_document -> 'authorization' -> 'draft') is null then 0 else 1 end);
$$;

-- A document this database can read, or a clear refusal.
create or replace function private.check_onboarding_setup_document(p_document jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_document is null or jsonb_typeof(p_document) <> 'object'
     or p_document ->> 'format' is distinct from 'ramassa.onboarding-setup' then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/NOT_A_SETUP: this file is not an onboarding setup export';
  end if;
  if jsonb_typeof(p_document -> 'schema_version') is distinct from 'number'
     or (p_document ->> 'schema_version') is distinct from '1' then
    raise invalid_parameter_value using message = format(
      'ONBOARDING_SETUP/UNKNOWN_SCHEMA_VERSION: this file uses onboarding setup schema version %s; this app reads version 1. Export it again from an app at the same version.',
      coalesce(p_document ->> 'schema_version', 'none'));
  end if;
  if octet_length(p_document::text) > 5000000 then
    raise program_limit_exceeded using message = 'ONBOARDING_SETUP/TOO_LARGE: the file is larger than 5 MB';
  end if;
  if jsonb_typeof(p_document -> 'screens') is distinct from 'array'
     or jsonb_typeof(p_document -> 'builtin_question_overrides') is distinct from 'array'
     or jsonb_typeof(p_document -> 'builtin_screens') is distinct from 'array'
     or jsonb_typeof(p_document -> 'required_questions') is distinct from 'array'
     or jsonb_typeof(p_document -> 'presets') is distinct from 'array'
     or jsonb_typeof(p_document -> 'seasons') is distinct from 'array'
     or jsonb_typeof(p_document -> 'flow_order') not in ('array', 'null')
     or jsonb_typeof(p_document -> 'app_terms') is distinct from 'object'
     or jsonb_typeof(p_document -> 'app_terms' -> 'published') is distinct from 'array'
     or jsonb_typeof(p_document -> 'authorization') is distinct from 'object'
     or jsonb_typeof(p_document -> 'authorization' -> 'published') is distinct from 'array'
     or exists (select 1 from jsonb_array_elements(p_document -> 'screens') s
                 where jsonb_typeof(s) <> 'object' or jsonb_typeof(s -> 'questions') is distinct from 'array'
                    or exists (select 1 from jsonb_array_elements(s -> 'questions') q
                                where jsonb_typeof(q) <> 'object'
                                   or jsonb_typeof(q -> 'options') is distinct from 'array'))
  then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: the file is incomplete or damaged';
  end if;
  if (select count(*) filter (where (s ->> 'is_current')::boolean)
        from jsonb_array_elements(p_document -> 'seasons') s) > 1 then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: more than one current season';
  end if;
end;
$$;

-- What already holds onboarding configuration in an organization. Empty
-- means: nothing but the automatic app terms version 1.
create or replace function private.onboarding_setup_blockers(p_org_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(blocker.code order by blocker.ordinal), array[]::text[])
    from (values
      (1, 'screens', exists (select 1 from public.intake_screens where org_id = p_org_id)),
      (2, 'questions', exists (select 1 from public.custom_questions where org_id = p_org_id)),
      (3, 'builtin_question_overrides', exists (select 1 from public.builtin_question_overrides where org_id = p_org_id)),
      (4, 'builtin_screens', exists (select 1 from public.intake_builtin_screens where org_id = p_org_id)),
      (5, 'flow_order', exists (select 1 from public.intake_flow_orders where org_id = p_org_id)),
      (6, 'required_questions', exists (select 1 from public.intake_required_questions where org_id = p_org_id)),
      (7, 'presets', exists (select 1 from public.intake_state_presets where org_id = p_org_id)),
      (8, 'document_step_explanation', exists (select 1 from public.organizations
                                                where id = p_org_id and document_step_explanation is not null)),
      (9, 'app_terms', exists (select 1 from public.app_terms_versions v
                                where v.org_id = p_org_id
                                  and (v.version_number is distinct from 1
                                       or v.content <> private.app_terms_version_one()))),
      (10, 'seasons', exists (select 1 from public.seasons where org_id = p_org_id and not is_test_fixture)),
      (11, 'authorization', exists (select 1 from public.authorization_versions where org_id = p_org_id))
    ) as blocker(ordinal, code, present)
   where blocker.present;
$$;

-- Which legal text the import saves as a draft: the draft, else the newest
-- published version. The bundled app terms (version 1, unchanged) are not
-- imported: the target already has them.
create or replace function private.onboarding_setup_legal_plan(p_document jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with terms as (
    select case
      when private.json_value_or_null(p_document -> 'app_terms' -> 'draft') is not null
        then jsonb_build_object('source', 'draft', 'version_number', null,
                                'content', p_document -> 'app_terms' -> 'draft' -> 'content')
      else (select jsonb_build_object('source', 'published', 'version_number', (v ->> 'version_number')::integer,
                                      'content', v -> 'content')
              from jsonb_array_elements(p_document -> 'app_terms' -> 'published') v
             order by (v ->> 'version_number')::integer desc limit 1)
    end as chosen
  ),
  authorization_text as (
    select case
      when private.json_value_or_null(p_document -> 'authorization' -> 'draft') is not null
        then jsonb_build_object('source', 'draft', 'version_number', null, 'season_name', null,
                                'content', p_document -> 'authorization' -> 'draft' -> 'content')
      else (select jsonb_build_object('source', 'published', 'version_number', (v ->> 'version_number')::integer,
                                      'season_name', season ->> 'name', 'content', v -> 'content')
              from jsonb_array_elements(p_document -> 'authorization' -> 'published') v
              left join lateral (
                select s from jsonb_array_elements(p_document -> 'seasons') s
                 where s ->> 'id' = v ->> 'season_id') season_row(season) on true
             order by (season ->> 'starts_on') desc nulls last, (v ->> 'version_number')::integer desc
             limit 1)
    end as chosen
  )
  select jsonb_build_object(
    'app_terms', case
      when terms.chosen is null then jsonb_build_object('source', 'none', 'imported', false)
      when terms.chosen ->> 'source' = 'published' and terms.chosen -> 'content' = private.app_terms_version_one()
        then jsonb_build_object('source', 'bundled', 'imported', false)
      else terms.chosen || jsonb_build_object('imported', true) end,
    'authorization', case
      when authorization_text.chosen is null then jsonb_build_object('source', 'none', 'imported', false)
      else authorization_text.chosen || jsonb_build_object('imported', true) end)
    from terms, authorization_text;
$$;

-- The warnings an admin reads before importing.
create or replace function private.onboarding_setup_warnings(p_document jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with plan as (select private.onboarding_setup_legal_plan(p_document) as legal),
  hosts as (
    select coalesce(jsonb_agg(distinct substring(a ->> 'url' from '^https://([^/?#]+)')), '[]'::jsonb) as list
      from (select v -> 'content' as content
              from jsonb_array_elements(p_document -> 'authorization' -> 'published') v
            union all
            select p_document -> 'authorization' -> 'draft' -> 'content'
             where private.json_value_or_null(p_document -> 'authorization' -> 'draft') is not null) c,
           jsonb_array_elements(private.json_array_or_empty(c.content -> 'attachments')) a
  )
  select coalesce(jsonb_agg(warning.value order by warning.ordinal), '[]'::jsonb)
    from plan cross join hosts cross join lateral (values
      (1, case when (plan.legal -> 'app_terms' ->> 'imported')::boolean
                 or (plan.legal -> 'authorization' ->> 'imported')::boolean
               then jsonb_build_object('code', 'legal_drafts') end),
      (2, case when jsonb_array_length(p_document -> 'app_terms' -> 'published')
                    - case when plan.legal -> 'app_terms' ->> 'source' in ('published', 'bundled') then 1 else 0 end > 0
               then jsonb_build_object('code', 'app_terms_history',
                      'count', jsonb_array_length(p_document -> 'app_terms' -> 'published')
                               - case when plan.legal -> 'app_terms' ->> 'source' in ('published', 'bundled') then 1 else 0 end) end),
      (3, case when jsonb_array_length(p_document -> 'authorization' -> 'published')
                    - case when plan.legal -> 'authorization' ->> 'source' = 'published' then 1 else 0 end > 0
               then jsonb_build_object('code', 'authorization_history',
                      'count', jsonb_array_length(p_document -> 'authorization' -> 'published')
                               - case when plan.legal -> 'authorization' ->> 'source' = 'published' then 1 else 0 end) end),
      (4, case when jsonb_array_length(hosts.list) > 0
               then jsonb_build_object('code', 'attachment_links', 'hosts', hosts.list) end),
      (5, case when (plan.legal -> 'authorization' ->> 'imported')::boolean
                and not exists (select 1 from jsonb_array_elements(p_document -> 'seasons') s
                                 where (s ->> 'is_current')::boolean)
               then jsonb_build_object('code', 'no_current_season') end)
    ) as warning(ordinal, value)
   where warning.value is not null;
$$;

revoke all on function private.json_array_or_empty(jsonb) from public, anon, authenticated;
revoke all on function private.json_value_or_null(jsonb) from public, anon, authenticated;
revoke all on function private.onboarding_setup_counts(jsonb) from public, anon, authenticated;
revoke all on function private.check_onboarding_setup_document(jsonb) from public, anon, authenticated;
revoke all on function private.onboarding_setup_blockers(uuid) from public, anon, authenticated;
revoke all on function private.onboarding_setup_legal_plan(jsonb) from public, anon, authenticated;
revoke all on function private.onboarding_setup_warnings(jsonb) from public, anon, authenticated;

-- 2. Export -----------------------------------------------------------------------------------------------

create or replace function public.export_onboarding_setup(p_app_commit text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  document jsonb;
begin
  if not (select private.can_design_onboarding()) or actor_org is null then
    raise insufficient_privilege using message = 'exporting the onboarding setup needs settings.organization or onboarding.design';
  end if;
  if p_app_commit is not null and p_app_commit !~ '^[0-9A-Za-z._-]{1,64}$' then
    raise check_violation using message = 'the app commit is a short version name';
  end if;

  document := jsonb_build_object(
    'format', 'ramassa.onboarding-setup',
    'schema_version', 1,
    'app_commit', p_app_commit,
    'exported_at', now(),
    -- Staff screens, in the order the question builder lists them.
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'intro', s.intro,
        'after_screen', s.after_screen, 'sort_order', s.sort_order,
        'home_after_screen', s.home_after_screen, 'home_sort_order', s.home_sort_order,
        'is_archived', s.is_archived,
        'questions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', q.id, 'question_type', q.question_type, 'label', q.label, 'help', q.help,
            'privacy', q.privacy, 'placements', to_jsonb(q.placements), 'settings', q.settings,
            'is_required', q.is_required, 'sort_order', q.sort_order, 'is_archived', q.is_archived,
            'show_when_question_id', q.show_when_question_id, 'show_when_option_id', q.show_when_option_id,
            'options', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', o.id, 'label', o.label, 'sort_order', o.sort_order, 'is_archived', o.is_archived)
                order by o.sort_order, o.id)
                from public.custom_question_options o where o.question_id = q.id), '[]'::jsonb))
            order by q.sort_order, q.created_at, q.id)
            from public.custom_questions q where q.screen_id = s.id), '[]'::jsonb))
        order by array_position(private.intake_builtin_screens(), s.after_screen), s.sort_order, s.created_at, s.id)
        from public.intake_screens s where s.org_id = actor_org), '[]'::jsonb),
    'builtin_question_overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question', o.question, 'label', o.label, 'help', o.help, 'is_hidden', o.is_hidden,
        'option_overrides', o.option_overrides) order by o.question)
        from public.builtin_question_overrides o where o.org_id = actor_org), '[]'::jsonb),
    'builtin_screens', coalesce((
      select jsonb_agg(jsonb_build_object('screen', b.screen, 'texts', b.texts, 'is_hidden', b.is_hidden)
        order by b.screen)
        from public.intake_builtin_screens b where b.org_id = actor_org), '[]'::jsonb),
    'flow_order', (select to_jsonb(f.step_order) from public.intake_flow_orders f where f.org_id = actor_org),
    'required_questions', coalesce((
      select jsonb_agg(jsonb_build_object('question', r.question, 'is_required', r.is_required)
        order by r.question)
        from public.intake_required_questions r where r.org_id = actor_org), '[]'::jsonb),
    'presets', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.name, 'states', p.states) order by p.name, p.id)
        from public.intake_state_presets p where p.org_id = actor_org), '[]'::jsonb),
    'document_step_explanation', (
      select o.document_step_explanation from public.organizations o where o.id = actor_org),
    'app_terms', jsonb_build_object(
      'published', coalesce((
        select jsonb_agg(jsonb_build_object(
          'version_number', v.version_number, 'published_at', v.published_at, 'content', v.content)
          order by v.version_number)
          from public.app_terms_versions v where v.org_id = actor_org and v.published_at is not null), '[]'::jsonb),
      'draft', (
        select jsonb_build_object('content', v.content)
          from public.app_terms_versions v where v.org_id = actor_org and v.published_at is null)),
    -- Real seasons only: a test fixture season is never moved.
    'seasons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'starts_on', s.starts_on, 'is_current', s.is_current)
        order by s.starts_on, s.name)
        from public.seasons s where s.org_id = actor_org and not s.is_test_fixture), '[]'::jsonb),
    'authorization', jsonb_build_object(
      'published', coalesce((
        select jsonb_agg(jsonb_build_object(
          'season_id', v.season_id, 'version_number', v.version_number,
          'published_at', v.published_at, 'content', v.content)
          order by s.starts_on, v.version_number)
          from public.authorization_versions v
          join public.seasons s on s.id = v.season_id and not s.is_test_fixture
         where v.org_id = actor_org and v.published_at is not null), '[]'::jsonb),
      'draft', (
        select jsonb_build_object('content', v.content)
          from public.authorization_versions v where v.org_id = actor_org and v.published_at is null))
  );

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'onboarding.export', 'organization', actor_org,
          jsonb_build_object('schema_version', 1, 'app_commit', p_app_commit,
                             'counts', private.onboarding_setup_counts(document)));
  return document;
end;
$$;

revoke all on function public.export_onboarding_setup(text) from public, anon;
grant execute on function public.export_onboarding_setup(text) to authenticated;

-- 3. Import ----------------------------------------------------------------------------------------------

-- Recreates the document in an organization with new ids, the same order and
-- wording, every reference remapped. The caller checks permission, the
-- document and that the organization is empty. Order inside a parent is kept
-- by sort order, and ties by creation time, which follows the file's order.
create or replace function private.apply_onboarding_setup(p_document jsonb, p_org_id uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  season_map jsonb := '{}'::jsonb;
  screen_map jsonb := '{}'::jsonb;
  question_map jsonb := '{}'::jsonb;
  option_map jsonb := '{}'::jsonb;
  item record;
  question record;
  option_item record;
  new_id uuid;
  new_screen uuid;
  new_question uuid;
  question_count integer := 0;
  option_ties boolean;
  steps text[];
  legal jsonb := private.onboarding_setup_legal_plan(p_document);
begin
  -- Ids inside the file are unique per type, or references are ambiguous.
  if (select count(*) <> count(distinct s ->> 'id') from jsonb_array_elements(p_document -> 'screens') s)
     or (select count(*) <> count(distinct q ->> 'id')
           from jsonb_array_elements(p_document -> 'screens') s, jsonb_array_elements(s -> 'questions') q)
     or (select count(*) <> count(distinct o ->> 'id')
           from jsonb_array_elements(p_document -> 'screens') s, jsonb_array_elements(s -> 'questions') q,
                jsonb_array_elements(q -> 'options') o)
     or (select count(*) <> count(distinct s ->> 'id') from jsonb_array_elements(p_document -> 'seasons') s)
  then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: an id appears twice';
  end if;

  -- Seasons.
  for item in select value from jsonb_array_elements(p_document -> 'seasons') loop
    insert into public.seasons (org_id, name, starts_on, is_current)
    values (p_org_id, item.value ->> 'name', (item.value ->> 'starts_on')::date,
            coalesce((item.value ->> 'is_current')::boolean, false))
    returning id into new_id;
    season_map := season_map || jsonb_build_object(item.value ->> 'id', new_id);
  end loop;

  -- Screens, questions and options.
  for item in select value, ordinality from jsonb_array_elements(p_document -> 'screens') with ordinality loop
    insert into public.intake_screens (
      org_id, title, intro, after_screen, sort_order, home_after_screen, home_sort_order, is_archived,
      created_at, updated_at)
    values (
      p_org_id, item.value -> 'title', private.json_value_or_null(item.value -> 'intro'),
      item.value ->> 'after_screen', (item.value ->> 'sort_order')::integer,
      coalesce(item.value ->> 'home_after_screen', item.value ->> 'after_screen'),
      coalesce((item.value ->> 'home_sort_order')::integer, (item.value ->> 'sort_order')::integer),
      coalesce((item.value ->> 'is_archived')::boolean, false),
      now() + item.ordinality * interval '1 microsecond', now())
    returning id into new_screen;
    screen_map := screen_map || jsonb_build_object(item.value ->> 'id', new_screen);

    for question in select value, ordinality from jsonb_array_elements(item.value -> 'questions') with ordinality loop
      question_count := question_count + 1;
      insert into public.custom_questions (
        org_id, screen_id, question_type, label, help, privacy, placements, settings, is_required,
        sort_order, is_archived, created_at, updated_at)
      values (
        p_org_id, new_screen, question.value ->> 'question_type', question.value -> 'label',
        private.json_value_or_null(question.value -> 'help'), question.value ->> 'privacy',
        array(select jsonb_array_elements_text(private.json_array_or_empty(question.value -> 'placements'))),
        coalesce(private.json_value_or_null(question.value -> 'settings'), '{}'::jsonb),
        coalesce((question.value ->> 'is_required')::boolean, false),
        (question.value ->> 'sort_order')::integer, coalesce((question.value ->> 'is_archived')::boolean, false),
        now() + question_count * interval '1 microsecond', now())
      returning id into new_question;
      question_map := question_map || jsonb_build_object(question.value ->> 'id', new_question);

      -- Options are ordered by sort order alone: equal places get the file's order.
      select count(*) <> count(distinct o ->> 'sort_order') into option_ties
        from jsonb_array_elements(question.value -> 'options') o;
      for option_item in select value, ordinality from jsonb_array_elements(question.value -> 'options') with ordinality loop
        insert into public.custom_question_options (org_id, question_id, label, sort_order, is_archived)
        values (p_org_id, new_question, option_item.value -> 'label',
                case when option_ties then option_item.ordinality::integer - 1
                     else (option_item.value ->> 'sort_order')::integer end,
                coalesce((option_item.value ->> 'is_archived')::boolean, false))
        returning id into new_id;
        option_map := option_map || jsonb_build_object(option_item.value ->> 'id', new_id);
      end loop;
    end loop;
  end loop;

  -- Show-when, once every question and option exists.
  for question in
    select q.value from jsonb_array_elements(p_document -> 'screens') s, jsonb_array_elements(s -> 'questions') q
     where private.json_value_or_null(q.value -> 'show_when_question_id') is not null
  loop
    if question_map ->> (question.value ->> 'show_when_question_id') is null
       or option_map ->> (question.value ->> 'show_when_option_id') is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a condition names a question or option that is not in the file';
    end if;
    update public.custom_questions
       set show_when_question_id = (question_map ->> (question.value ->> 'show_when_question_id'))::uuid,
           show_when_option_id = (option_map ->> (question.value ->> 'show_when_option_id'))::uuid
     where id = (question_map ->> (question.value ->> 'id'))::uuid;
  end loop;

  -- Built-in questions and screens.
  insert into public.builtin_question_overrides (org_id, question, label, help, is_hidden, option_overrides, updated_by)
  select p_org_id, o ->> 'question', private.json_value_or_null(o -> 'label'), private.json_value_or_null(o -> 'help'),
         coalesce((o ->> 'is_hidden')::boolean, false),
         coalesce(private.json_value_or_null(o -> 'option_overrides'), '{}'::jsonb), p_actor
    from jsonb_array_elements(p_document -> 'builtin_question_overrides') o;

  insert into public.intake_builtin_screens (org_id, screen, texts, is_hidden, updated_by)
  select p_org_id, b ->> 'screen', coalesce(private.json_value_or_null(b -> 'texts'), '{}'::jsonb),
         coalesce((b ->> 'is_hidden')::boolean, false), p_actor
    from jsonb_array_elements(p_document -> 'builtin_screens') b;

  -- The flow order, staff screens remapped.
  if jsonb_typeof(p_document -> 'flow_order') = 'array' then
    select array_agg(
             case when step.value like 'custom:%' then 'custom:' || (screen_map ->> substr(step.value, 8))
                  else step.value end
             order by step.ordinality)
      into steps
      from jsonb_array_elements_text(p_document -> 'flow_order') with ordinality as step(value, ordinality);
    if exists (select 1 from unnest(steps) s
                where s is null or s = 'custom:'
                   or (s not like 'custom:%' and not exists (
                         select 1 from private.wizard_screen_questions() w where w.screen = s))) then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: the flow order names a step that is not in the file';
    end if;
    if cardinality(steps) > 0 then
      insert into public.intake_flow_orders (org_id, step_order, updated_by) values (p_org_id, steps, p_actor);
    end if;
  end if;

  -- The required list, presets and the document step note.
  insert into public.intake_required_questions (org_id, question, is_required, updated_by)
  select p_org_id, r ->> 'question', (r ->> 'is_required')::boolean, p_actor
    from jsonb_array_elements(p_document -> 'required_questions') r;

  if exists (
    select 1 from jsonb_array_elements(p_document -> 'presets') p
     where jsonb_typeof(p -> 'states') is distinct from 'object'
        or exists (select 1 from jsonb_each_text(p -> 'states') entry
                    where not (entry.key = any (private.wizard_intake_questions()))
                       or entry.value not in ('ask', 'skip'))
  ) then
    raise check_violation using message = 'ONBOARDING_SETUP/MALFORMED: a preset sets ask or skip on wizard questions';
  end if;
  insert into public.intake_state_presets (org_id, name, states, created_by)
  select p_org_id, btrim(p ->> 'name'), p -> 'states', p_actor
    from jsonb_array_elements(p_document -> 'presets') p;

  update public.organizations
     set document_step_explanation = private.json_value_or_null(p_document -> 'document_step_explanation')
   where id = p_org_id;

  -- The legal texts: drafts only, through the draft functions that validate them.
  if (legal -> 'app_terms' ->> 'imported')::boolean then
    perform public.save_app_terms_draft(legal -> 'app_terms' -> 'content');
  end if;
  if (legal -> 'authorization' ->> 'imported')::boolean then
    perform public.save_authorization_draft(legal -> 'authorization' -> 'content');
  end if;

  return jsonb_build_object(
    'counts', private.onboarding_setup_counts(p_document),
    'legal', jsonb_build_object(
      'app_terms', (legal -> 'app_terms') - 'content',
      'authorization', (legal -> 'authorization') - 'content'));
end;
$$;

revoke all on function private.apply_onboarding_setup(jsonb, uuid, uuid) from public, anon, authenticated;

create or replace function public.preview_onboarding_setup_import(p_document jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  blockers text[];
  problem text;
begin
  if not (select public.has_permission('settings.organization')) or actor_org is null then
    raise insufficient_privilege using message = 'importing the onboarding setup needs settings.organization';
  end if;
  perform private.check_onboarding_setup_document(p_document);
  blockers := private.onboarding_setup_blockers(actor_org);
  if cardinality(blockers) = 0 then
    -- The real import, rolled back: the subtransaction undoes every write.
    begin
      perform private.apply_onboarding_setup(p_document, actor_org, actor);
      raise exception using errcode = 'RA621', message = 'preview only';
    exception
      when sqlstate 'RA621' then null;
      when others then problem := sqlerrm;
    end;
  end if;
  return jsonb_build_object(
    'can_import', cardinality(blockers) = 0 and problem is null,
    'blockers', to_jsonb(blockers),
    'problem', problem,
    'schema_version', (p_document ->> 'schema_version')::integer,
    'app_commit', p_document ->> 'app_commit',
    'exported_at', p_document ->> 'exported_at',
    'counts', private.onboarding_setup_counts(p_document),
    'warnings', private.onboarding_setup_warnings(p_document),
    'legal', jsonb_build_object(
      'app_terms', (private.onboarding_setup_legal_plan(p_document) -> 'app_terms') - 'content',
      'authorization', (private.onboarding_setup_legal_plan(p_document) -> 'authorization') - 'content'));
end;
$$;

create or replace function public.import_onboarding_setup(p_document jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  blockers text[];
  report jsonb;
begin
  if not (select public.has_permission('settings.organization')) or actor_org is null then
    raise insufficient_privilege using message = 'importing the onboarding setup needs settings.organization';
  end if;
  perform private.check_onboarding_setup_document(p_document);
  -- One import at a time per organization.
  perform 1 from public.organizations where id = actor_org for update;
  blockers := private.onboarding_setup_blockers(actor_org);
  if cardinality(blockers) > 0 then
    raise object_not_in_prerequisite_state using message = format(
      'ONBOARDING_SETUP/NOT_EMPTY: this organization already has onboarding settings (%s)',
      array_to_string(blockers, ', '));
  end if;
  report := private.apply_onboarding_setup(p_document, actor_org, actor);
  report := report || jsonb_build_object('warnings', private.onboarding_setup_warnings(p_document));
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'onboarding.import', 'organization', actor_org,
          jsonb_build_object('schema_version', 1, 'app_commit', p_document ->> 'app_commit',
                             'counts', report -> 'counts', 'legal', report -> 'legal'));
  return report;
end;
$$;

revoke all on function public.preview_onboarding_setup_import(jsonb) from public, anon;
revoke all on function public.import_onboarding_setup(jsonb) from public, anon;
grant execute on function public.preview_onboarding_setup_import(jsonb) to authenticated;
grant execute on function public.import_onboarding_setup(jsonb) to authenticated;
