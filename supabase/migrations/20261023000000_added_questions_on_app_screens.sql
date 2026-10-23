-- Questions added to the app's own screens (RAPP-642).
--
-- Until now a staff question lived on a staff screen (`custom_questions.screen_id`
-- references `intake_screens`), so the app's own screens (identity, background,
-- documentation, logistics, equipment and the season screens) could only
-- reword, hide or require their built-in questions. Staff now add questions of
-- any type to those screens too.
--
-- The model: an `intake_screens` row may hold the added questions of one app
-- screen (`builtin_screen`), instead of being a screen of its own. Every
-- question keeps exactly one home, its `screen_id`, so the functions that
-- create, edit, archive, reorder, require, answer, report, export and import
-- questions keep working unchanged, and so do the entity referral form,
-- re-registration and the staff answers page, which list the holder under its
-- title (the app screen's title, written in the five languages when the
-- holder is made). What changes:
--
--   1. `intake_screens.builtin_screen`: null for a staff screen, else one of the
--      app screens staff may move (never the summary, the terms or the
--      authorization), at most one live holder per screen and organization.
--   2. `ensure_builtin_screen_holder(screen, title)`: the holder of an app
--      screen, made on first use, for the question builder's Add question.
--   3. A holder is never a step: `private.intake_flow_order_problem` refuses
--      `custom:<holder id>`, so `save_intake_flow_order` and the import do too.
--   4. An app screen with a required added question always shows, as one with
--      a required built-in question does (`private.builtin_screen_hideable`).
--   5. `intake_catalog`, `export_onboarding_setup` and the import carry
--      `builtin_screen`; a file without it imports as before.
--
-- Existing rows keep `builtin_screen` null: nothing about them changes. Grants
-- stay as they are (create or replace keeps them).
--
-- Docs: https://www.postgresql.org/docs/current/indexes-partial.html (a unique
-- index on a subset of rows) and https://supabase.com/docs/guides/database/functions
-- (security definer functions with an empty search path).

-- 1. The column ---------------------------------------------------------------------------------------------

alter table public.intake_screens
  add column builtin_screen text check (builtin_screen is null or builtin_screen = any (array[
    -- The movable app screens, as `private.wizard_screen_questions()` lists them.
    'identity', 'background', 'documentation', 'logistics', 'equipment', 'season',
    'supporting-entities', 'participation-support', 'specific-needs']::text[]));
comment on column public.intake_screens.builtin_screen is
  'Set when the row holds the questions staff added to an app screen (RAPP-642); never a step of its own.';

create unique index intake_screens_one_holder_per_screen
  on public.intake_screens (org_id, builtin_screen)
  where builtin_screen is not null and not is_archived;

-- 2. The holder ---------------------------------------------------------------------------------------------

create or replace function public.ensure_builtin_screen_holder(p_screen text, p_title jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  holder_id uuid;
begin
  if not exists (select 1 from private.wizard_screen_questions() w where w.screen = p_screen) then
    raise check_violation using message = 'questions are added to an app screen staff may move';
  end if;
  select id into holder_id from public.intake_screens
   where org_id = actor_org and builtin_screen = p_screen and not is_archived;
  if holder_id is not null then
    return holder_id;
  end if;
  if not private.catalan_text_valid(p_title) then
    raise check_violation using message = 'a screen needs a title in Catalan';
  end if;
  insert into public.intake_screens (
    org_id, title, after_screen, sort_order, home_after_screen, home_sort_order, builtin_screen)
  values (actor_org, p_title, private.flow_step_anchor(p_screen), 0,
          private.flow_step_anchor(p_screen), 0, p_screen)
  returning id into holder_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.builtin_holder_create', 'intake_screen', holder_id,
          jsonb_build_object('screen', p_screen));
  return holder_id;
end;
$$;

revoke all on function public.ensure_builtin_screen_holder(text, jsonb) from public, anon;
grant execute on function public.ensure_builtin_screen_holder(text, jsonb) to authenticated;

-- 3. A holder is never a step -------------------------------------------------------------------------------

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
    -- The added questions of an app screen show on that screen (RAPP-642).
    when exists (select 1 from step
                  where not exists (select 1 from private.wizard_screen_questions() w where w.screen = step.value)
                    and not exists (select 1 from public.intake_screens i
                                     where i.id = step.screen_id and i.org_id = p_org_id
                                       and i.builtin_screen is null)) then 'unknown_step'
    when exists (select 1 from step
                   join public.intake_screens i on i.id = step.screen_id and i.org_id = p_org_id
                  where i.is_archived) then 'archived_screen'
  end;
$$;

-- 4. A required added question keeps its screen shown ---------------------------------------------------------

create or replace function private.builtin_screen_hideable(p_screen text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select not (s.questions && private.unhideable_intake_questions())
      from private.wizard_screen_questions() s
     where s.screen = p_screen), false)
     and not exists (
       select 1 from public.custom_questions q
         join public.intake_screens h on h.id = q.screen_id
        where h.builtin_screen = p_screen and not h.is_archived
          and h.org_id = coalesce((select public.current_org_id()), (select public.default_organization_id()))
          and q.is_required and not q.is_archived);
$$;

-- 5. The catalog, the export and the import carry it ---------------------------------------------------------

create or replace function public.intake_catalog()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  -- A woman who started on her own has no profile until she completes the
  -- wizard: she reads the default organization's questions.
  actor_org uuid := coalesce((select public.current_org_id()), (select public.default_organization_id()));
  with_archived boolean := (select private.can_design_onboarding());
begin
  if (select auth.uid()) is null or actor_org is null then
    raise insufficient_privilege using message = 'the question catalog needs an account';
  end if;
  return jsonb_build_object(
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'intro', s.intro, 'after_screen', s.after_screen,
        'sort_order', s.sort_order, 'is_archived', s.is_archived,
        -- Added questions of an app screen (RAPP-642): never a step of its own.
        'builtin_screen', s.builtin_screen,
        'questions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', q.id, 'question_type', q.question_type, 'label', q.label, 'help', q.help,
            'privacy', q.privacy, 'placements', to_jsonb(q.placements), 'sort_order', q.sort_order,
            'is_archived', q.is_archived, 'settings', q.settings, 'is_required', q.is_required,
            'show_when_question_id', q.show_when_question_id, 'show_when_option_id', q.show_when_option_id,
            'options', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', o.id, 'label', o.label, 'sort_order', o.sort_order, 'is_archived', o.is_archived)
                order by o.sort_order, o.id)
                from public.custom_question_options o where o.question_id = q.id), '[]'::jsonb))
            order by q.sort_order, q.created_at)
            from public.custom_questions q
           where q.screen_id = s.id and (with_archived or not q.is_archived)), '[]'::jsonb))
        order by array_position(private.intake_builtin_screens(), s.after_screen), s.sort_order, s.created_at)
        from public.intake_screens s
       where s.org_id = actor_org and (with_archived or not s.is_archived)), '[]'::jsonb),
    'overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question', o.question, 'label', o.label, 'help', o.help,
        -- A hide counts only while the question is optional (RAPP-611).
        'is_hidden', o.is_hidden and not (o.question = any (private.required_intake_questions(actor_org))),
        'option_overrides', o.option_overrides) order by o.question)
        from public.builtin_question_overrides o where o.org_id = actor_org), '[]'::jsonb),
    'presets', case when ((select public.has_permission('participants.view_personal')) or (select public.has_permission('onboarding.design'))) then coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'states', p.states)
        order by p.name, p.id)
        from public.intake_state_presets p where p.org_id = actor_org), '[]'::jsonb)
      else '[]'::jsonb end,
    -- Staff wording of the built-in screens and their hide switch (RAPP-612).
    -- A hide counts only while none of the screen's questions is required.
    'builtin_screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'screen', b.screen, 'texts', b.texts,
        'is_hidden', b.is_hidden and private.builtin_screen_hideable(b.screen))
        order by b.screen)
        from public.intake_builtin_screens b where b.org_id = actor_org), '[]'::jsonb),
    -- The wizard steps as staff arranged them (RAPP-612); null is the app's order.
    'flow_order', (
      select to_jsonb(f.step_order) from public.intake_flow_orders f where f.org_id = actor_org),
    -- The built-in questions that need an answer (RAPP-611): the one list her
    -- phone, her summary and the staff preview read.
    'required_questions', to_jsonb(private.required_intake_questions(actor_org)),
    -- The app terms she accepts (RAPP-613): the current published version,
    -- or the draft for a test player when there is one (RAPP-619).
    'terms', (
      select jsonb_build_object('id', v.id, 'version_number', v.version_number, 'content', v.content,
                                'is_draft', v.published_at is null)
        from private.app_terms_version_for(actor_org, (select auth.uid())) v
       where v.id is not null)
  );
end;
$function$;

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
        'is_archived', s.is_archived, 'builtin_screen', s.builtin_screen,
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
      builtin_screen, created_at, updated_at)
    values (
      p_org_id, item.value -> 'title', private.json_value_or_null(item.value -> 'intro'),
      item.value ->> 'after_screen', (item.value ->> 'sort_order')::integer,
      coalesce(item.value ->> 'home_after_screen', item.value ->> 'after_screen'),
      coalesce((item.value ->> 'home_sort_order')::integer, (item.value ->> 'sort_order')::integer),
      coalesce((item.value ->> 'is_archived')::boolean, false),
      -- Absent in a file from before RAPP-642: a screen of its own.
      nullif(private.json_value_or_null(item.value -> 'builtin_screen') #>> '{}', ''),
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
$function$;
