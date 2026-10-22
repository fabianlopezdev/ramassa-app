-- The setup import checks what the editors check, counts what it creates and
-- says clearly why it refuses a file (RAPP-621, pending fixes 31 to 33).
--
--   31. `apply_onboarding_setup` accepted a flow order with a step twice or
--       with an archived staff screen, both of which `save_intake_flow_order`
--       refuses. One helper, `private.intake_flow_order_problem(org, steps)`,
--       now holds the checks (at most 200 steps, each once, no summary,
--       terms or authorization step, built-in screens and live staff
--       screens of the organization only) and both use it.
--   32. The preview, the import report and the import's audit row counted
--       every legal version in the file (3 published authorization versions
--       read "3") while the import creates at most one draft of each.
--       `private.onboarding_setup_import_counts(document)` counts what is
--       imported; the export keeps counting what it wrote, and the
--       `app_terms_history` / `authorization_history` warnings still say how
--       many published versions stay behind.
--   33. A refused file read like Postgres: the preview showed the raw
--       constraint text (`new row for relation "custom_questions" violates
--       check constraint ...`). `private.onboarding_setup_problem` turns a
--       constraint error into the part of the file it concerns and a value
--       of the wrong form into one sentence; the preview shows it and the
--       import raises it. `schema_version: "1"` (a string) is refused as
--       "schema_version must be the number 1". A file with nothing to import
--       (an empty organization's export: no screens, questions, wording,
--       order, required list, presets, note, seasons, and only the bundled
--       terms) is refused, so it can no longer be imported again and again.
--
-- Docs: https://www.postgresql.org/docs/current/plpgsql-control-structures.html#PLPGSQL-EXCEPTION-DIAGNOSTICS
-- (GET STACKED DIAGNOSTICS: RETURNED_SQLSTATE, MESSAGE_TEXT,
-- CONSTRAINT_NAME, TABLE_NAME), https://www.postgresql.org/docs/current/errcodes-appendix.html
-- (class 22 data exception, class 23 integrity constraint violation) and
-- https://www.postgresql.org/docs/current/plpgsql-control-structures.html#PLPGSQL-CONDITIONALS
-- (CASE without a match and no ELSE raises CASE_NOT_FOUND).

-- 31. One set of flow order checks ------------------------------------------------------------------

-- Null when the order is valid for the organization, else why not.
create or replace function private.intake_flow_order_problem(p_org_id uuid, p_steps text[])
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with step as (
    select value, case when value ~ '^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                       then substr(value, 8)::uuid end as screen_id
      from unnest(coalesce(p_steps, array[]::text[])) value
  )
  select case
    when (select count(*) from step) > 200 then 'too_many'
    when exists (select 1 from step where value is null) then 'unknown_step'
    when (select count(distinct value) from step) <> (select count(*) from step) then 'repeated'
    when exists (select 1 from step
                  where value = any (array['summary', 'terms-intro', 'terms', 'authorization'])) then 'fixed_end'
    when exists (select 1 from step
                  where not exists (select 1 from private.wizard_screen_questions() w where w.screen = step.value)
                    and not exists (select 1 from public.intake_screens i
                                     where i.id = step.screen_id and i.org_id = p_org_id)) then 'unknown_step'
    when exists (select 1 from step
                   join public.intake_screens i on i.id = step.screen_id and i.org_id = p_org_id
                  where i.is_archived) then 'archived_screen'
  end;
$$;
revoke all on function private.intake_flow_order_problem(uuid, text[]) from public, anon, authenticated;

-- 32. What the import creates -----------------------------------------------------------------------

create or replace function private.onboarding_setup_import_counts(p_document jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select private.onboarding_setup_counts(p_document) || jsonb_build_object(
    'app_terms_versions',
      case when (private.onboarding_setup_legal_plan(p_document) -> 'app_terms' ->> 'imported')::boolean
           then 1 else 0 end,
    'authorization_versions',
      case when (private.onboarding_setup_legal_plan(p_document) -> 'authorization' ->> 'imported')::boolean
           then 1 else 0 end);
$$;
revoke all on function private.onboarding_setup_import_counts(jsonb) from public, anon, authenticated;

-- 33. Nothing to import, and clear refusals ----------------------------------------------------------

create or replace function private.onboarding_setup_is_empty(p_document jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not exists (
    select 1 from jsonb_each_text(private.onboarding_setup_import_counts(p_document)) count_entry
     where count_entry.value::integer > 0);
$$;
revoke all on function private.onboarding_setup_is_empty(jsonb) from public, anon, authenticated;

-- A refusal an admin can read. Our own ONBOARDING_SETUP/* messages and the
-- draft functions' sentences stay; a constraint names the part of the file;
-- a value of the wrong form (class 22) is one sentence.
create or replace function private.onboarding_setup_problem(
  p_state text, p_message text, p_constraint text, p_table text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_message like 'ONBOARDING_SETUP/%' then p_message
    when nullif(p_constraint, '') is not null or (p_state like '23%' and nullif(p_table, '') is not null) then
      'ONBOARDING_SETUP/REFUSED_VALUE: ' || case p_table
        when 'intake_screens' then 'a screen'
        when 'custom_questions' then 'a question'
        when 'custom_question_options' then 'an answer option'
        when 'builtin_question_overrides' then 'a change to an app question'
        when 'intake_builtin_screens' then 'the wording of an app screen'
        when 'intake_flow_orders' then 'the screen order'
        when 'intake_required_questions' then 'the list of required questions'
        when 'intake_state_presets' then 'a preset'
        when 'organizations' then 'the document step note'
        when 'seasons' then 'a season'
        when 'app_terms_versions' then 'the app terms'
        when 'authorization_versions' then 'the authorization'
        else 'a part' end
      || ' in the file has a value this app does not accept. Download the file again from an app at the same version.'
    when p_state like '22%' then
      'ONBOARDING_SETUP/MALFORMED: a value in the file has the wrong form (a date, a number or an id). Download the file again from an app at the same version.'
    else p_message
  end;
$$;
revoke all on function private.onboarding_setup_problem(text, text, text, text) from public, anon, authenticated;

-- The functions below are the current definitions with the changes above.

CREATE OR REPLACE FUNCTION public.save_intake_flow_order(p_order text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := private.require_question_builder();
  steps text[] := coalesce(p_order, array[]::text[]);
  anchor text := 'identity';
  entry record;
begin
  -- The same checks an imported setup's flow order passes (pending fix 31).
  case private.intake_flow_order_problem(actor_org, steps)
    when 'too_many' then
      raise check_violation using message = 'too many steps';
    when 'repeated' then
      raise check_violation using message = 'each step appears once';
    when 'fixed_end' then
      raise check_violation using message = 'the summary, the terms and the authorization always end the onboarding';
    when 'unknown_step', 'archived_screen' then
      raise check_violation using message = 'not a step of this onboarding';
    else
      null;
  end case;

  if cardinality(steps) = 0 then
    delete from public.intake_flow_orders where org_id = actor_org;
    update public.intake_screens
       set after_screen = home_after_screen, sort_order = home_sort_order, updated_at = now()
     where org_id = actor_org
       and (after_screen is distinct from home_after_screen or sort_order is distinct from home_sort_order);
  else
    insert into public.intake_flow_orders (org_id, step_order, updated_at, updated_by)
    values (actor_org, steps, now(), (select auth.uid()))
    on conflict (org_id) do update
      set step_order = excluded.step_order, updated_at = now(), updated_by = excluded.updated_by;
    -- Each staff screen is anchored to the built-in step before it, so the
    -- question builder lists it where it shows. Its home stays.
    for entry in select step, step_position from unnest(steps) with ordinality as o(step, step_position) loop
      if entry.step like 'custom:%' then
        update public.intake_screens
           set after_screen = anchor, sort_order = entry.step_position::integer, updated_at = now()
         where id = substr(entry.step, 8)::uuid and org_id = actor_org;
      else
        anchor := private.flow_step_anchor(entry.step);
      end if;
    end loop;
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.flow_reorder', 'organization', actor_org,
          jsonb_build_object('order', to_jsonb(steps)));
end;
$function$
;

CREATE OR REPLACE FUNCTION private.check_onboarding_setup_document(p_document jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
begin
  if p_document is null or jsonb_typeof(p_document) <> 'object'
     or p_document ->> 'format' is distinct from 'ramassa.onboarding-setup' then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/NOT_A_SETUP: this file is not an onboarding setup export';
  end if;
  -- "1" as a string is not version 1 of something else (pending fix 33).
  if jsonb_typeof(p_document -> 'schema_version') is distinct from 'number' then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: schema_version must be the number 1';
  end if;
  if (p_document ->> 'schema_version') is distinct from '1' then
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
$function$
;

CREATE OR REPLACE FUNCTION private.apply_onboarding_setup(p_document jsonb, p_org_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  flow_problem text;
begin
  -- A file with nothing to import is refused, or an empty export could be
  -- imported again and again (pending fix 33).
  if private.onboarding_setup_is_empty(p_document) then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/EMPTY: the file holds no onboarding setup to import';
  end if;

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
    -- The same checks as save_intake_flow_order (pending fix 31), on the
    -- screens just created with the file's archived flags.
    flow_problem := private.intake_flow_order_problem(p_org_id, coalesce(steps, array[]::text[]));
    if flow_problem is not null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: ' || case flow_problem
        when 'too_many' then 'the flow order has more than 200 steps'
        when 'repeated' then 'the flow order names a step twice'
        when 'fixed_end' then 'the summary, the terms and the authorization always end the onboarding'
        when 'archived_screen' then 'the flow order names an archived screen'
        else 'the flow order names a step that is not in the file' end;
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
    'counts', private.onboarding_setup_import_counts(p_document),
    'legal', jsonb_build_object(
      'app_terms', (legal -> 'app_terms') - 'content',
      'authorization', (legal -> 'authorization') - 'content'));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.preview_onboarding_setup_import(p_document jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  blockers text[];
  problem text;
  failed_state text;
  failed_message text;
  failed_constraint text;
  failed_table text;
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
      when others then
        -- A clear sentence, never a table or constraint name (pending fix 33).
        get stacked diagnostics failed_state = returned_sqlstate, failed_message = message_text,
                                failed_constraint = constraint_name, failed_table = table_name;
        problem := private.onboarding_setup_problem(failed_state, failed_message, failed_constraint, failed_table);
    end;
  end if;
  return jsonb_build_object(
    'can_import', cardinality(blockers) = 0 and problem is null,
    'blockers', to_jsonb(blockers),
    'problem', problem,
    'schema_version', (p_document ->> 'schema_version')::integer,
    'app_commit', p_document ->> 'app_commit',
    'exported_at', p_document ->> 'exported_at',
    'counts', private.onboarding_setup_import_counts(p_document),
    'warnings', private.onboarding_setup_warnings(p_document),
    'legal', jsonb_build_object(
      'app_terms', (private.onboarding_setup_legal_plan(p_document) -> 'app_terms') - 'content',
      'authorization', (private.onboarding_setup_legal_plan(p_document) -> 'authorization') - 'content'));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.import_onboarding_setup(p_document jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  blockers text[];
  report jsonb;
  failed_state text;
  failed_message text;
  failed_constraint text;
  failed_table text;
  clear_message text;
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
  begin
    report := private.apply_onboarding_setup(p_document, actor_org, actor);
  exception when others then
    -- The preview's clear sentence, never a table or constraint name.
    get stacked diagnostics failed_state = returned_sqlstate, failed_message = message_text,
                            failed_constraint = constraint_name, failed_table = table_name;
    clear_message := private.onboarding_setup_problem(failed_state, failed_message, failed_constraint, failed_table);
    if clear_message is distinct from failed_message then
      raise invalid_parameter_value using message = clear_message;
    end if;
    raise;
  end;
  report := report || jsonb_build_object('warnings', private.onboarding_setup_warnings(p_document));
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'onboarding.import', 'organization', actor_org,
          jsonb_build_object('schema_version', 1, 'app_commit', p_document ->> 'app_commit',
                             'counts', report -> 'counts', 'legal', report -> 'legal'));
  return report;
end;
$function$
;
