-- The onboarding setup file carries the signature blocks (RAPP-690).
--
-- WHY
--
-- Signature blocks are part of the onboarding design: the file that moves
-- the setup from staging to production must carry them, as it carries the
-- screens and the placements. A file written before has no blocks and still
-- imports.
--
-- WHAT CHANGES
--
--   1. `export_onboarding_setup` writes `signature_blocks`: each block's
--      surface, screen (an app screen's key or a Ramassà screen's id from the
--      file), text in five languages and place in the shared order. The
--      schema version stays 3: the key is optional.
--   2. `private.apply_onboarding_setup` creates them, a Ramassà screen's id
--      mapped to the new screen. A missing key imports no block.
--   3. The file check accepts the key as a list; the counts and the
--      "already has a setup" blockers name the blocks; a refused block says
--      so in words.

-- 1. The file check ------------------------------------------------------------------------------

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
  -- "1" as a string is not version 1 of something else (pending fix 33).
  if jsonb_typeof(p_document -> 'schema_version') is distinct from 'number' then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: schema_version must be the number 1, 2 or 3';
  end if;
  -- Version 3 carries the profile layout alone (RAPP-656); 1 and 2 still import.
  if (p_document ->> 'schema_version') not in ('1', '2', '3') then
    raise invalid_parameter_value using message = format(
      'ONBOARDING_SETUP/UNKNOWN_SCHEMA_VERSION: this file uses onboarding setup schema version %s; this app reads versions 1, 2 and 3. Export it again from an app at the same version.',
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
     -- The signature blocks (RAPP-690): absent in an older file.
     or jsonb_typeof(p_document -> 'signature_blocks') not in ('array', 'null')
     or exists (select 1 from jsonb_array_elements(private.json_array_or_empty(p_document -> 'signature_blocks')) b
                 where jsonb_typeof(b) <> 'object')
     or exists (select 1 from jsonb_array_elements(p_document -> 'screens') s where jsonb_typeof(s) <> 'object')
     or ((p_document ->> 'schema_version') = '1'
         and exists (select 1 from jsonb_array_elements(p_document -> 'screens') s
                      where jsonb_typeof(s -> 'questions') is distinct from 'array'
                         or exists (select 1 from jsonb_array_elements(s -> 'questions') q
                                     where jsonb_typeof(q) <> 'object'
                                        or jsonb_typeof(q -> 'options') is distinct from 'array')))
     or ((p_document ->> 'schema_version') in ('2', '3') and (
           jsonb_typeof(p_document -> 'sections') is distinct from 'array'
           or jsonb_typeof(p_document -> 'fields') is distinct from 'array'
           or jsonb_typeof(p_document -> 'placements') is distinct from 'array'
           or exists (select 1 from jsonb_array_elements(p_document -> 'fields') f
                       where jsonb_typeof(f) <> 'object' or jsonb_typeof(f -> 'options') is distinct from 'array')
           or exists (select 1 from jsonb_array_elements(p_document -> 'placements') p
                       where jsonb_typeof(p) <> 'object')))
  then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: the file is incomplete or damaged';
  end if;
  if (select count(*) filter (where (s ->> 'is_current')::boolean)
        from jsonb_array_elements(p_document -> 'seasons') s) > 1 then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: more than one current season';
  end if;
end;
$$;

-- 2. The export -----------------------------------------------------------------------------------

create or replace function public.export_onboarding_setup(p_app_commit text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'schema_version', 3,
    'app_commit', p_app_commit,
    'exported_at', now(),
    -- The profile layout (RAPP-649): sections, every field with its options, and
    -- where each is asked. Version 3 (RAPP-656) carries nothing else about them.
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'key', s.key, 'title', s.title, 'sort_order', s.sort_order, 'is_builtin', s.is_builtin)
        order by s.sort_order, s.created_at, s.id)
        from public.profile_sections s where s.org_id = actor_org), '[]'::jsonb),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'section_id', f.section_id, 'kind', f.kind, 'system_key', f.system_key,
        'question_type', f.question_type, 'label', f.label, 'help', f.help, 'privacy', f.privacy,
        'default_required', f.default_required, 'settings', f.settings,
        'show_when_field_id', f.show_when_field_id, 'show_when_option_id', f.show_when_option_id,
        'sort_order', f.sort_order, 'is_archived', f.is_archived,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'key', o.key, 'label', o.label, 'sort_order', o.sort_order, 'is_archived', o.is_archived)
            order by o.sort_order, o.id)
            from public.custom_question_options o where o.question_id = f.id), '[]'::jsonb))
        -- The app's fields by key, then Ramassà's in their order: the same
        -- setup always gives the same file.
        order by f.kind, f.system_key, f.sort_order, f.created_at, f.id)
        from public.profile_fields f where f.org_id = actor_org), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'field_id', p.field_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'sort_order', p.sort_order, 'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.surface, p.screen_key, p.sort_order, coalesce(f.system_key, f.id::text))
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id
       where p.org_id = actor_org), '[]'::jsonb),
    -- Ramassà screens, in the order of their anchors.
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'intro', s.intro,
        'after_screen', s.after_screen, 'sort_order', s.sort_order,
        'home_after_screen', s.home_after_screen, 'home_sort_order', s.home_sort_order,
        'is_archived', s.is_archived)
        order by array_position(private.intake_builtin_screens(), s.after_screen), s.sort_order, s.created_at, s.id)
        from public.intake_screens s where s.org_id = actor_org), '[]'::jsonb),
    -- The placements above carry the wording, the hiding and the required
    -- flag of the app's questions (RAPP-666). The two lists stay in the file,
    -- empty, so it is still a version 3 file; an older file may fill them.
    'builtin_question_overrides', '[]'::jsonb,
    'builtin_screens', coalesce((
      select jsonb_agg(jsonb_build_object('screen', b.screen, 'texts', b.texts, 'is_hidden', b.is_hidden)
        order by b.screen)
        from public.intake_builtin_screens b where b.org_id = actor_org), '[]'::jsonb),
    'flow_order', (select to_jsonb(f.step_order) from public.intake_flow_orders f where f.org_id = actor_org),
    'required_questions', '[]'::jsonb,
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
          from public.authorization_versions v where v.org_id = actor_org and v.published_at is null)),
    -- The signature blocks (RAPP-690), in the order they share with the placements.
    'signature_blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'surface', b.surface, 'screen_key', b.screen_key, 'body', b.body, 'sort_order', b.sort_order)
        order by b.surface, b.screen_key, b.sort_order, b.created_at, b.id)
        from public.form_blocks b where b.org_id = actor_org), '[]'::jsonb)
  );

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'onboarding.export', 'organization', actor_org,
          jsonb_build_object('schema_version', 3, 'app_commit', p_app_commit,
                             'counts', private.onboarding_setup_counts(document)));
  return document;
end;
$function$;

-- 3. The import ------------------------------------------------------------------------------------

create or replace function private.apply_onboarding_setup(p_document jsonb, p_org_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  season_map jsonb := '{}'::jsonb;
  screen_map jsonb := '{}'::jsonb;
  option_map jsonb := '{}'::jsonb;
  section_map jsonb := '{}'::jsonb;
  field_map jsonb := '{}'::jsonb;
  -- A file of an older version is read as version 3 (RAPP-656).
  document jsonb := private.onboarding_setup_as_version_3(p_document, p_org_id);
  new_field uuid;
  placed_screen text;
  item record;
  option_item record;
  new_id uuid;
  new_screen uuid;
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
  if (select count(*) <> count(distinct s ->> 'id') from jsonb_array_elements(document -> 'screens') s)
     or (select count(*) <> count(distinct s ->> 'id') from jsonb_array_elements(document -> 'seasons') s)
     or (select count(*) <> count(distinct s ->> 'id') from jsonb_array_elements(document -> 'sections') s)
     or (select count(*) <> count(distinct f ->> 'id') from jsonb_array_elements(document -> 'fields') f)
     or (select count(*) <> count(distinct o ->> 'id')
           from jsonb_array_elements(document -> 'fields') f, jsonb_array_elements(f -> 'options') o)
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

  -- Ramassà screens. Fields reach them through placements, below.
  for item in select value, ordinality from jsonb_array_elements(document -> 'screens') with ordinality loop
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
  end loop;

  -- The profile layout (RAPP-649): built-in sections and fields by their key,
  -- the others new; then where each is asked; then conditions.
  for item in select value from jsonb_array_elements(document -> 'sections') loop
    new_id := null;
    if coalesce((item.value ->> 'is_builtin')::boolean, false) then
      update public.profile_sections
         set title = item.value -> 'title', sort_order = (item.value ->> 'sort_order')::integer, updated_at = now()
       where org_id = p_org_id and key = item.value ->> 'key' and is_builtin
      returning id into new_id;
    end if;
    if new_id is null then
      new_id := gen_random_uuid();
      insert into public.profile_sections (id, org_id, key, title, sort_order)
      values (new_id, p_org_id, 'custom_' || replace(new_id::text, '-', ''), item.value -> 'title',
              (item.value ->> 'sort_order')::integer);
    end if;
    section_map := section_map || jsonb_build_object(item.value ->> 'id', new_id);
  end loop;

  for item in select value, ordinality from jsonb_array_elements(document -> 'fields') with ordinality loop
    if section_map ->> (item.value ->> 'section_id') is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a question names a section that is not in the file';
    end if;
    if item.value ->> 'kind' = 'builtin' then
      update public.profile_fields
         set label = item.value -> 'label', help = private.json_value_or_null(item.value -> 'help'),
             section_id = (section_map ->> (item.value ->> 'section_id'))::uuid,
             sort_order = (item.value ->> 'sort_order')::integer, updated_at = now()
       where org_id = p_org_id and system_key = private.setup_system_key(item.value)
      returning id into new_field;
      if new_field is null then
        raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: an app question this app does not know';
      end if;
      -- Its options are the app's: a condition in the file finds them by key.
      for option_item in select value from jsonb_array_elements(item.value -> 'options') loop
        select o.id into new_id from public.custom_question_options o
         where o.question_id = new_field and o.key = option_item.value ->> 'key';
        if new_id is not null then
          option_map := option_map || jsonb_build_object(option_item.value ->> 'id', new_id);
        end if;
      end loop;
    else
      question_count := question_count + 1;
      insert into public.profile_fields (
        org_id, section_id, kind, question_type, label, help, privacy, default_required, settings,
        sort_order, created_by, is_archived, created_at, updated_at)
      values (
        p_org_id, (section_map ->> (item.value ->> 'section_id'))::uuid, 'custom', item.value ->> 'question_type',
        item.value -> 'label', private.json_value_or_null(item.value -> 'help'), item.value ->> 'privacy',
        coalesce((item.value ->> 'default_required')::boolean, false),
        coalesce(private.json_value_or_null(item.value -> 'settings'), '{}'::jsonb),
        (item.value ->> 'sort_order')::integer,
        p_actor, coalesce((item.value ->> 'is_archived')::boolean, false),
        now() + question_count * interval '1 microsecond', now())
      returning id into new_field;
      select count(*) <> count(distinct o ->> 'sort_order') into option_ties
        from jsonb_array_elements(item.value -> 'options') o;
      for option_item in select value, ordinality from jsonb_array_elements(item.value -> 'options') with ordinality loop
        insert into public.custom_question_options (org_id, question_id, label, sort_order, is_archived)
        values (p_org_id, new_field, option_item.value -> 'label',
                case when option_ties then option_item.ordinality::integer - 1
                     else (option_item.value ->> 'sort_order')::integer end,
                coalesce((option_item.value ->> 'is_archived')::boolean, false))
        returning id into new_id;
        option_map := option_map || jsonb_build_object(option_item.value ->> 'id', new_id);
      end loop;
    end if;
    field_map := field_map || jsonb_build_object(item.value ->> 'id', new_field);
  end loop;

  -- The built-in fields the file names are placed as the file says. A file
  -- converted from version 1 names none, so theirs stay as they are.
  -- The parts of a split field go with their first part, and the parts shown
  -- on a condition go first, so no condition is left without its field.
  delete from public.field_placements p
   using public.profile_fields f
   where f.id = p.field_id and f.org_id = p_org_id and f.kind = 'builtin'
     and f.show_when_field_id is not null
     and private.question_system_key(private.system_key_question(f.system_key))
         in (select private.question_system_key(private.system_key_question(private.setup_system_key(b)))
               from jsonb_array_elements(document -> 'fields') b where b ->> 'kind' = 'builtin');
  delete from public.field_placements p
   using public.profile_fields f
   where f.id = p.field_id and f.org_id = p_org_id and f.kind = 'builtin'
     and private.question_system_key(private.system_key_question(f.system_key))
         in (select private.question_system_key(private.system_key_question(private.setup_system_key(b)))
               from jsonb_array_elements(document -> 'fields') b where b ->> 'kind' = 'builtin');
  for item in select value from jsonb_array_elements(document -> 'placements') loop
    if field_map ->> (item.value ->> 'field_id') is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a placement names a question that is not in the file';
    end if;
    placed_screen := private.json_value_or_null(item.value -> 'screen_key') #>> '{}';
    if private.is_uuid_text(placed_screen) then
      placed_screen := screen_map ->> placed_screen;
      if placed_screen is null then
        raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a placement names a screen that is not in the file';
      end if;
    end if;
    insert into public.field_placements (
      org_id, field_id, surface, screen_key, sort_order, required, label_override, help_override)
    values (
      p_org_id, (field_map ->> (item.value ->> 'field_id'))::uuid, item.value ->> 'surface', placed_screen,
      (item.value ->> 'sort_order')::integer, coalesce((item.value ->> 'required')::boolean, false),
      private.json_value_or_null(item.value -> 'label_override'),
      private.json_value_or_null(item.value -> 'help_override'));
  end loop;
  -- The signature blocks (RAPP-690), each on its screen; an older file has none.
  for item in select value from jsonb_array_elements(private.json_array_or_empty(p_document -> 'signature_blocks')) loop
    placed_screen := private.json_value_or_null(item.value -> 'screen_key') #>> '{}';
    if private.is_uuid_text(placed_screen) then
      placed_screen := screen_map ->> placed_screen;
      if placed_screen is null then
        raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a signature block names a screen that is not in the file';
      end if;
    end if;
    insert into public.form_blocks (org_id, surface, screen_key, kind, body, sort_order)
    values (p_org_id, item.value ->> 'surface', placed_screen, 'signature', item.value -> 'body',
            coalesce((item.value ->> 'sort_order')::integer, 0));
  end loop;
  -- A file from before the split places the first parts only.
  perform private.place_system_field_parts(p_org_id);

  for item in
    select value from jsonb_array_elements(document -> 'fields')
     where private.json_value_or_null(value -> 'show_when_field_id') is not null
  loop
    if field_map ->> (item.value ->> 'show_when_field_id') is null
       or option_map ->> (item.value ->> 'show_when_option_id') is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a condition names a question or option that is not in the file';
    end if;
    update public.profile_fields
       set show_when_field_id = (field_map ->> (item.value ->> 'show_when_field_id'))::uuid,
           show_when_option_id = (option_map ->> (item.value ->> 'show_when_option_id'))::uuid
     where id = (field_map ->> (item.value ->> 'id'))::uuid;
  end loop;

  -- An older file's required list, then its wording, hiding and option
  -- changes of the app's questions, land on their fields and placements
  -- (RAPP-666). A hide counts only while the question is optional.
  for item in select value from jsonb_array_elements(p_document -> 'required_questions') loop
    if not (item.value ->> 'question' = any (private.wizard_intake_questions())) then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a required question this app does not know';
    end if;
    if jsonb_typeof(item.value -> 'is_required') is distinct from 'boolean' then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: the file is incomplete or damaged';
    end if;
    continue when item.value ->> 'question' = any (private.locked_required_intake_questions());
    perform private.set_app_question_required(p_org_id, item.value ->> 'question', (item.value ->> 'is_required')::boolean);
  end loop;
  for item in select value from jsonb_array_elements(p_document -> 'builtin_question_overrides') loop
    if not (item.value ->> 'question' = any (private.wizard_intake_questions())) then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a change to an app question this app does not know';
    end if;
    perform private.fold_app_option_overrides(
      p_org_id, item.value ->> 'question', private.json_value_or_null(item.value -> 'option_overrides'));
    if coalesce((item.value ->> 'is_hidden')::boolean, false)
       and not (item.value ->> 'question' = any (private.required_intake_questions(p_org_id))) then
      perform private.set_app_question_hidden(p_org_id, item.value ->> 'question', true);
    end if;
    perform private.set_app_question_wording(
      p_org_id, item.value ->> 'question',
      private.json_value_or_null(item.value -> 'label'), private.json_value_or_null(item.value -> 'help'));
  end loop;

  -- The app screens' wording.
  insert into public.intake_builtin_screens (org_id, screen, texts, is_hidden, updated_by)
  select p_org_id, b ->> 'screen', coalesce(private.json_value_or_null(b -> 'texts'), '{}'::jsonb),
         coalesce((b ->> 'is_hidden')::boolean, false), p_actor
    from jsonb_array_elements(p_document -> 'builtin_screens') b;

  -- The flow order, staff screens remapped.
  if jsonb_typeof(document -> 'flow_order') = 'array' then
    select array_agg(
             case when step.value like 'custom:%' then 'custom:' || (screen_map ->> substr(step.value, 8))
                  else step.value end
             order by step.ordinality)
      into steps
      from jsonb_array_elements_text(document -> 'flow_order') with ordinality as step(value, ordinality);
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

  -- Presets and the document step note.
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

-- 4. Counts, blockers and refusals -------------------------------------------------------------------

create or replace function private.onboarding_setup_counts(p_document jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'screens', (select count(*) from jsonb_array_elements(private.json_array_or_empty(p_document -> 'screens')) s
                 where nullif(s ->> 'builtin_screen', '') is null),
    'questions', case when p_document ->> 'schema_version' = '1'
      then (select count(*) from jsonb_array_elements(private.json_array_or_empty(p_document -> 'screens')) s,
                 jsonb_array_elements(private.json_array_or_empty(s -> 'questions')) q)
      else (select count(*) from jsonb_array_elements(private.json_array_or_empty(p_document -> 'fields')) f
             where f ->> 'kind' = 'custom') end,
    'options', case when p_document ->> 'schema_version' = '1'
      then (select count(*) from jsonb_array_elements(private.json_array_or_empty(p_document -> 'screens')) s,
                 jsonb_array_elements(private.json_array_or_empty(s -> 'questions')) q,
                 jsonb_array_elements(private.json_array_or_empty(q -> 'options')) o)
      else (select count(*) from jsonb_array_elements(private.json_array_or_empty(p_document -> 'fields')) f,
                 jsonb_array_elements(private.json_array_or_empty(f -> 'options')) o
             where f ->> 'kind' = 'custom') end,
    'builtin_question_overrides', jsonb_array_length(private.json_array_or_empty(p_document -> 'builtin_question_overrides')),
    'builtin_screens', jsonb_array_length(private.json_array_or_empty(p_document -> 'builtin_screens')),
    'flow_order_steps', jsonb_array_length(private.json_array_or_empty(p_document -> 'flow_order')),
    'required_questions', jsonb_array_length(private.json_array_or_empty(p_document -> 'required_questions')),
    'presets', jsonb_array_length(private.json_array_or_empty(p_document -> 'presets')),
    'document_step_explanation', case when private.json_value_or_null(p_document -> 'document_step_explanation') is null then 0 else 1 end,
    'app_terms_versions', jsonb_array_length(private.json_array_or_empty(p_document -> 'app_terms' -> 'published'))
      + case when private.json_value_or_null(p_document -> 'app_terms' -> 'draft') is null then 0 else 1 end,
    'seasons', jsonb_array_length(private.json_array_or_empty(p_document -> 'seasons')),
    'signature_blocks', jsonb_array_length(private.json_array_or_empty(p_document -> 'signature_blocks')),
    'authorization_versions', jsonb_array_length(private.json_array_or_empty(p_document -> 'authorization' -> 'published'))
      + case when private.json_value_or_null(p_document -> 'authorization' -> 'draft') is null then 0 else 1 end);
$$;

create or replace function private.onboarding_setup_blockers(p_org_id uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(array_agg(blocker.code order by blocker.ordinal), array[]::text[])
    from (values
      (1, 'screens', exists (select 1 from public.intake_screens where org_id = p_org_id)),
      (2, 'questions', exists (select 1 from public.profile_fields where org_id = p_org_id and kind = 'custom')),
      -- Staff wording on an app question (RAPP-666: on its placements).
      (3, 'builtin_question_overrides', exists (
         select 1 from public.field_placements p
           join public.profile_fields f on f.id = p.field_id and f.kind = 'builtin'
          where p.org_id = p_org_id and (p.label_override is not null or p.help_override is not null))),
      (4, 'builtin_screens', exists (select 1 from public.intake_builtin_screens where org_id = p_org_id)),
      (5, 'flow_order', exists (select 1 from public.intake_flow_orders where org_id = p_org_id)),
      -- An app question made required or optional (RAPP-666: on its placements).
      (6, 'required_questions', exists (
         select 1 from unnest(private.wizard_intake_questions()) q(question)
          where (q.question = any (private.required_intake_questions(p_org_id)))
                <> (q.question = any (private.default_required_intake_questions()
                                      || private.locked_required_intake_questions())))),
      (7, 'presets', exists (select 1 from public.intake_state_presets where org_id = p_org_id)),
      (8, 'document_step_explanation', exists (select 1 from public.organizations
                                                where id = p_org_id and document_step_explanation is not null)),
      (9, 'app_terms', exists (select 1 from public.app_terms_versions v
                                where v.org_id = p_org_id
                                  and (v.version_number is distinct from 1
                                       or v.content <> private.app_terms_version_one()))),
      (10, 'seasons', exists (select 1 from public.seasons where org_id = p_org_id and not is_test_fixture)),
      (11, 'authorization', exists (select 1 from public.authorization_versions where org_id = p_org_id)),
      (12, 'signature_blocks', exists (select 1 from public.form_blocks where org_id = p_org_id))
    ) as blocker(ordinal, code, present)
   where blocker.present;
$function$;

create or replace function private.onboarding_setup_problem(p_state text, p_message text, p_constraint text, p_table text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_message like 'ONBOARDING_SETUP/%' then p_message
    when nullif(p_constraint, '') is not null or (p_state like '23%' and nullif(p_table, '') is not null) then
      'ONBOARDING_SETUP/REFUSED_VALUE: ' || case p_table
        when 'intake_screens' then 'a screen'
        when 'profile_fields' then 'a question'
        when 'field_placements' then 'where a question is asked'
        when 'profile_sections' then 'a section of the player profile'
        when 'custom_question_options' then 'an answer option'
        when 'intake_builtin_screens' then 'the wording of an app screen'
        when 'intake_flow_orders' then 'the screen order'
        when 'intake_state_presets' then 'a preset'
        when 'organizations' then 'the document step note'
        when 'seasons' then 'a season'
        when 'app_terms_versions' then 'the app terms'
        when 'authorization_versions' then 'the authorization'
        when 'form_blocks' then 'a signature block'
        else 'a part' end
      || ' in the file has a value this app does not accept. Download the file again from an app at the same version.'
    when p_state like '22%' then
      'ONBOARDING_SETUP/MALFORMED: a value in the file has the wrong form (a date, a number or an id). Download the file again from an app at the same version.'
    else p_message
  end;
$function$;
