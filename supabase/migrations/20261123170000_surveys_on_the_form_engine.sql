-- Surveys on the form engine (RAPP-929).
--
-- WHY
--
-- A survey was its own system (20260821140349_surveys_polls.sql): one long
-- editor, four question types, no screens, no versions. Every other form is
-- built on the form engine (boards of screens, the shared screen editor,
-- versions). A survey becomes a form of the engine, with two differences:
--
--   - Her answers are opinions about one survey. A form's answers go to her
--     record (`custom_answers`, by player); a survey's never do. They are kept
--     per response in `survey_answers`, through `complete_survey`.
--   - Installed builds strict-parse the catalog: a new field kind or question
--     type would stop them loading every form. So a survey and its questions
--     never reach the catalog older builds read. `intake_catalog()` stays as it
--     is; the dashboard reads `intake_catalog_with_surveys()`, and her phone
--     reads her surveys through `my_surveys()`.
--
-- HOW
--
--   1. `custom_forms.kind` takes 'survey': filled by her, optional, never
--      repeating, with an optional activity (`event_id`) and closing time
--      (`closes_at`).
--   2. `profile_fields.kind` takes 'survey': a question of one survey
--      (`survey_form_id`), in no section, placed on that survey only. A
--      survey asks no other field. The 1 to 5 `rating` type is a survey's.
--   3. `survey_answers` keeps each response's answers; `complete_survey` writes
--      them, `complete_custom_form` refuses a survey, `my_custom_forms` and the
--      exports leave surveys out, and a survey rings no phone yet.
--   4. `save_survey_question` creates a survey's question on one of its
--      screens; `save_survey_settings` sets its activity and closing time;
--      `survey_results` reads the answers for the team.
--
-- The old survey tables stay as they are: their surveys stay readable.

-- 1. A survey is a form ---------------------------------------------------------------------------

alter table public.custom_forms drop constraint custom_forms_kind_check;
alter table public.custom_forms
  add constraint custom_forms_kind_check check (kind in ('legal', 'other', 'survey'));
alter table public.custom_forms
  add column event_id uuid references public.events (id) on delete set null,
  add column closes_at timestamptz;
alter table public.custom_forms
  add constraint custom_forms_survey_shape check (
    kind <> 'survey'
    or (filled_by = 'player' and mandatory = 'optional' and deadline is null
        and not repeats_each_season and system_key is null)),
  add constraint custom_forms_survey_only_settings check (
    kind = 'survey' or (event_id is null and closes_at is null));
comment on column public.custom_forms.event_id is 'A survey''s activity (RAPP-929).';
comment on column public.custom_forms.closes_at is 'When a survey stops taking answers; null: open (RAPP-929).';

-- 2. A survey's questions ---------------------------------------------------------------------------

alter table public.profile_fields alter column section_id drop not null;
alter table public.profile_fields drop constraint profile_fields_kind_check;
alter table public.profile_fields
  add constraint profile_fields_kind_check check (kind in ('builtin', 'custom', 'survey'));
alter table public.profile_fields
  add column survey_form_id uuid references public.custom_forms (id) on delete cascade;
alter table public.profile_fields
  add constraint profile_fields_survey_owner check (
    (kind = 'survey') = (survey_form_id is not null) and (kind = 'survey') = (section_id is null)),
  add constraint profile_fields_rating_on_surveys check (question_type <> 'rating' or kind = 'survey');
create index profile_fields_survey_form_id_idx on public.profile_fields (survey_form_id)
  where survey_form_id is not null;
comment on column public.profile_fields.survey_form_id is
  'The survey a survey question belongs to (RAPP-929); null for every other field.';

CREATE OR REPLACE FUNCTION private.custom_question_types()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select array['short_text', 'long_text', 'yes_no_maybe', 'single_choice', 'multiple_choice',
               'number', 'date', 'yes_no', 'phone', 'email', 'search_choice', 'item_list',
               'file_upload', 'country', 'municipality',
               -- A survey's 1 to 5 rating (RAPP-929).
               'rating']::text[];
$function$;

CREATE OR REPLACE FUNCTION private.custom_answer_value_valid(p_type text, p_settings jsonb, p_value jsonb, p_live_options text[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  kind text := jsonb_typeof(p_value);
  number_value numeric;
  date_value date;
  years integer;
  item text;
  accepted text[];
begin
  if p_value is null then
    return false;
  end if;
  case p_type
    when 'short_text' then
      return kind = 'string' and length(private.js_trim(p_value #>> '{}')) between 1 and 500;
    when 'long_text' then
      return kind = 'string' and length(private.js_trim(p_value #>> '{}')) between 1 and 4000;
    when 'yes_no_maybe' then
      return kind = 'string' and p_value #>> '{}' in ('yes', 'no', 'maybe');
    when 'yes_no' then
      return kind = 'string' and p_value #>> '{}' in ('yes', 'no');
    when 'single_choice', 'search_choice' then
      return kind = 'string' and (p_value #>> '{}') = any (coalesce(p_live_options, '{}'));
    when 'multiple_choice' then
      return kind = 'array' and jsonb_array_length(p_value) > 0
        and not exists (select 1 from jsonb_array_elements(p_value) e where jsonb_typeof(e) <> 'string')
        and (select count(distinct e) from jsonb_array_elements_text(p_value) e) = jsonb_array_length(p_value)
        and not exists (
          select 1 from jsonb_array_elements_text(p_value) e
           where not (e = any (coalesce(p_live_options, '{}'))));
    when 'number' then
      if kind <> 'number' then return false; end if;
      number_value := (p_value #>> '{}')::numeric;
      return abs(number_value) <= 1000000000
        and (not coalesce((p_settings ->> 'integer')::boolean, false) or number_value = trunc(number_value))
        and (not (p_settings ? 'min') or number_value >= (p_settings ->> 'min')::numeric)
        and (not (p_settings ? 'max') or number_value <= (p_settings ->> 'max')::numeric);
    when 'date' then
      if kind <> 'string' or (p_value #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        return false;
      end if;
      begin
        date_value := (p_value #>> '{}')::date;
      exception when others then
        return false;
      end;
      -- A typed date that does not exist (30 February) is refused, not rolled over.
      if to_char(date_value, 'YYYY-MM-DD') <> p_value #>> '{}'
         or extract(year from date_value) not between 1900 and 2100 then
        return false;
      end if;
      years := extract(year from age(current_date, date_value))::integer;
      return (not (p_settings ? 'min_age') or years >= (p_settings ->> 'min_age')::integer)
        and (not (p_settings ? 'max_age') or years <= (p_settings ->> 'max_age')::integer);
    when 'phone' then
      return kind = 'string' and (p_value #>> '{}') ~ '^\+[1-9][0-9]{7,14}$';
    when 'email' then
      return kind = 'string' and length(p_value #>> '{}') <= 254
        and (p_value #>> '{}') ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';
    when 'item_list' then
      if kind <> 'array' or jsonb_array_length(p_value) < 1
         or jsonb_array_length(p_value) > coalesce((p_settings ->> 'max_items')::integer, 20)
         or exists (select 1 from jsonb_array_elements(p_value) e where jsonb_typeof(e) <> 'string')
         or (select count(distinct e) from jsonb_array_elements_text(p_value) e) <> jsonb_array_length(p_value) then
        return false;
      end if;
      for item in select e from jsonb_array_elements_text(p_value) e loop
        if length(item) not between 1 and 120 or item <> private.js_trim(item) then
          return false;
        end if;
      end loop;
      return true;
    when 'file_upload' then
      accepted := case p_settings ->> 'accept'
        when 'photo' then array['image/jpeg', 'image/png', 'image/webp']
        else array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] end;
      return kind = 'object'
        and p_value - array['key', 'name', 'content_type', 'size'] = '{}'::jsonb
        and jsonb_typeof(p_value -> 'key') = 'string'
        and (p_value ->> 'key') ~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/intake-answers/'
                                   '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
                                   '[0-9]{4}/(0[1-9]|1[0-2])/[0-9a-f]{32}\.(jpg|png|webp|pdf)$')
        and jsonb_typeof(p_value -> 'name') = 'string'
        and length(p_value ->> 'name') between 1 and 120
        and jsonb_typeof(p_value -> 'content_type') = 'string'
        and (p_value ->> 'content_type') = any (accepted)
        and private.json_int_between(p_value -> 'size', 1, 10485760);
    -- The two lists the app ships: the canonical name, exactly as stored.
    when 'country' then
      return kind = 'string' and (p_value #>> '{}') = any (private.country_names());
    when 'municipality' then
      return kind = 'string' and private.is_municipality(p_value #>> '{}');
    -- A survey's rating: a whole number from 1 to 5 (RAPP-929).
    when 'rating' then
      return kind = 'number' and (p_value #>> '{}')::numeric in (1, 2, 3, 4, 5);
    else
      return false;
  end case;
end;
$function$;

CREATE OR REPLACE FUNCTION private.write_profile_field(p_org_id uuid, p_id uuid, p_section_id uuid, p_type text, p_label jsonb, p_help jsonb, p_privacy text, p_default_required boolean, p_options jsonb, p_settings jsonb, p_survey_form_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  existing public.profile_fields;
  saved public.profile_fields;
  saved_id uuid;
  is_choice boolean := p_type in ('single_choice', 'multiple_choice', 'search_choice');
  clean_settings jsonb := coalesce(nullif(p_settings, 'null'::jsonb), '{}'::jsonb);
  options jsonb := coalesce(nullif(p_options, 'null'::jsonb), '[]'::jsonb);
  option_item jsonb;
  position_index integer := 0;
  kept_ids uuid[] := '{}';
  option_id uuid;
  creator uuid := (select auth.uid());
  conditions_cleared integer := 0;
  change jsonb;
begin
  -- A survey's question belongs to its survey and no section (RAPP-929).
  if p_survey_form_id is not null
     and not exists (select 1 from public.custom_forms f
                      where f.id = p_survey_form_id and f.org_id = p_org_id and f.kind = 'survey') then
    raise no_data_found using message = 'no such survey';
  end if;
  if p_section_id is not null
     and not exists (select 1 from public.profile_sections where id = p_section_id and org_id = p_org_id) then
    raise no_data_found using message = 'no such section';
  end if;
  if not private.catalan_text_valid(p_label) then
    raise check_violation using message = 'a question needs a label in Catalan';
  end if;
  if nullif(p_help, 'null'::jsonb) is not null and not private.localized_text_valid(p_help) then
    raise check_violation using message = 'the help is text in the five languages';
  end if;

  if p_id is not null then
    select * into existing from public.profile_fields where id = p_id and org_id = p_org_id for update;
    if existing.id is null then
      raise no_data_found using message = 'no such question';
    end if;
  end if;

  if not (p_type = any (private.custom_question_types())) then
    raise check_violation using message = 'not a question type';
  end if;
  if p_type = 'rating' and coalesce(p_survey_form_id, existing.survey_form_id) is null then
    raise check_violation using message = 'a rating is asked on a survey only';
  end if;
  if p_privacy is null or p_privacy not in ('normal', 'personal', 'sensitive') then
    raise check_violation using message = 'the privacy level is normal, personal or sensitive';
  end if;
  if not private.custom_question_settings_valid(p_type, clean_settings) then
    raise check_violation using message = 'the settings do not fit the type';
  end if;
  if jsonb_typeof(options) <> 'array' then
    raise check_violation using message = 'options must be a list';
  end if;
  if is_choice and jsonb_array_length(options) < 2 then
    raise check_violation using message = 'a choice question needs at least two options';
  end if;
  if not is_choice and jsonb_array_length(options) > 0 then
    raise check_violation using message = 'only a choice question has options';
  end if;
  if jsonb_array_length(options) > (case when p_type = 'search_choice' then 500 else 60 end) then
    raise check_violation using message = 'too many options';
  end if;
  -- A file or a consent she signs is hers to give: it never goes on the entity form.
  if p_id is not null and private.field_is_hers_only(p_type, clean_settings)
     and exists (select 1 from public.field_placements where field_id = p_id and surface = 'entity_form') then
    raise check_violation using message = 'a file or a signature is asked of her only';
  end if;

  if p_id is null then
    if p_section_id is null and p_survey_form_id is null then
      raise no_data_found using message = 'no such section';
    end if;
    insert into public.profile_fields (
      org_id, section_id, kind, survey_form_id, question_type, label, help, privacy, default_required,
      settings, sort_order, created_by)
    values (
      p_org_id, case when p_survey_form_id is null then p_section_id end,
      case when p_survey_form_id is null then 'custom' else 'survey' end, p_survey_form_id,
      p_type, p_label, nullif(p_help, 'null'::jsonb), p_privacy,
      coalesce(p_default_required, false), clean_settings,
      case when p_survey_form_id is null
           then coalesce((select max(f.sort_order) + 1 from public.profile_fields f where f.section_id = p_section_id), 0)
           else coalesce((select max(f.sort_order) + 1 from public.profile_fields f where f.survey_form_id = p_survey_form_id), 0) end,
      case when exists (select 1 from public.profiles where id = creator) then creator end)
    returning id into saved_id;
  else
    -- A one-choice field that stops being one frees the fields that opened on its options.
    if existing.question_type = 'single_choice' and p_type <> 'single_choice' then
      update public.profile_fields
         set show_when_field_id = null, show_when_option_id = null, updated_at = now()
       where show_when_field_id = p_id;
      get diagnostics conditions_cleared = row_count;
    end if;
    update public.profile_fields
       set label = p_label, help = nullif(p_help, 'null'::jsonb), question_type = p_type, privacy = p_privacy,
           settings = clean_settings,
           -- An app field's required default follows the app's required list.
           default_required = case when kind = 'builtin' then default_required
                                   else coalesce(p_default_required, default_required) end,
           section_id = case when kind = 'survey' then null else coalesce(p_section_id, section_id) end,
           sort_order = case when p_section_id is null or p_section_id = section_id then sort_order
                             else coalesce((select max(f.sort_order) + 1 from public.profile_fields f
                                             where f.section_id = p_section_id), 0) end,
           is_archived = false, updated_at = now()
     where id = p_id;
    saved_id := p_id;
  end if;

  for option_item in select value from jsonb_array_elements(options) loop
    if not private.catalan_text_valid(option_item -> 'label') then
      raise check_violation using message = 'every option needs a label in Catalan';
    end if;
    option_id := nullif(option_item ->> 'id', '')::uuid;
    if option_id is not null then
      update public.custom_question_options
         set label = option_item -> 'label', sort_order = position_index, is_archived = false
       where id = option_id and question_id = saved_id;
      if not found then
        raise no_data_found using message = 'no such option';
      end if;
    else
      insert into public.custom_question_options (org_id, question_id, label, sort_order)
      values (p_org_id, saved_id, option_item -> 'label', position_index)
      returning id into option_id;
    end if;
    kept_ids := kept_ids || option_id;
    position_index := position_index + 1;
  end loop;
  update public.custom_question_options
     set is_archived = true
   where question_id = saved_id and not (id = any (kept_ids)) and not is_archived;

  -- Her answers follow the field, in this transaction (D8).
  if p_id is not null and (existing.question_type <> p_type or existing.privacy <> p_privacy) then
    select * into saved from public.profile_fields where id = p_id;
    change := private.apply_field_change(existing, saved)
              || jsonb_build_object('conditions_cleared', conditions_cleared);
    if (change ->> 'answers')::integer > 0 or conditions_cleared > 0 then
      insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
      values (p_org_id, creator, 'intake.field_change', 'profile_field', p_id, change);
    end if;
  end if;

  return saved_id;
end;
$function$;

-- The writer gained the survey owner: the old signature goes.
drop function if exists private.write_profile_field(uuid, uuid, uuid, text, jsonb, jsonb, text, boolean, jsonb, jsonb);
revoke all on function private.write_profile_field(uuid, uuid, uuid, text, jsonb, jsonb, text, boolean, jsonb, jsonb, uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.place_field(p_field_id uuid, p_surface text, p_screen_key text DEFAULT NULL::text, p_required boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := private.require_question_builder();
  field public.profile_fields;
  form_id uuid;
  saved_id uuid;
begin
  select * into field from public.profile_fields where id = p_field_id and org_id = actor_org and not is_archived;
  if field.id is null then
    raise no_data_found using message = 'no such question';
  end if;
  -- A survey's question goes on its own survey only (RAPP-929).
  if field.kind = 'survey' and (p_surface is distinct from 'custom_form'
       or private.custom_form_of_screen(actor_org, p_screen_key) is distinct from field.survey_form_id) then
    raise check_violation using message = 'a survey question goes on its own survey only';
  end if;
  if p_surface is null or p_surface not in ('onboarding', 'entity_form', 'season', 'authorization', 'custom_form') then
    raise check_violation using message = 'a field is placed on onboarding, the entity form, the season, the authorization or a form';
  end if;
  -- Her names live on her account: her Onboarding, the entity form and her forms ask them.
  if private.is_name_field(field) and p_surface not in ('entity_form', 'onboarding', 'custom_form') then
    raise check_violation using message = 'her names are asked on her onboarding, the entity form and her forms';
  end if;
  if p_surface = 'onboarding' then
    -- An app screen or one of the app's follow-ups (RAPP-720).
    if p_screen_key is null or not (
         private.is_onboarding_app_screen(p_screen_key)
         or (private.is_uuid_text(p_screen_key)
             and exists (select 1 from public.intake_screens s
                          where s.id = p_screen_key::uuid and s.org_id = actor_org
                            and not s.is_archived))) then
      raise no_data_found using message = 'no such screen';
    end if;
  elsif p_surface = 'custom_form' then
    form_id := private.custom_form_of_screen(actor_org, p_screen_key);
    if form_id is null then
      raise no_data_found using message = 'no such screen';
    end if;
    -- A survey asks only its own questions: her answers there are not her record (RAPP-929).
    if field.kind <> 'survey'
       and exists (select 1 from public.custom_forms f where f.id = form_id and f.kind = 'survey') then
      raise check_violation using message = 'a survey asks its own questions only';
    end if;
    if private.field_is_hers_only(field.question_type, field.settings)
       and exists (select 1 from public.custom_forms f where f.id = form_id and f.filled_by <> 'player') then
      raise check_violation using message = 'a file or a signature is asked of her only';
    end if;
  elsif p_screen_key is not null then
    raise check_violation using message = 'only an onboarding placement names a screen';
  end if;
  if private.field_is_hers_only(field.question_type, field.settings) and p_surface = 'entity_form' then
    raise check_violation using message = 'a file or a signature is asked of her only';
  end if;

  if p_surface in ('onboarding', 'custom_form') then
    -- Already on this screen: nothing to do (a picker sends a controller and
    -- its condition together, and the controller brings the condition).
    select p.id into saved_id from public.field_placements p
     where p.field_id = p_field_id and p.surface = p_surface
       and p.custom_form_id is not distinct from form_id and p.screen_key = p_screen_key;
    if saved_id is not null then
      return saved_id;
    end if;
    -- On another screen of the same form: it moves here (RAPP-782). A field
    -- may also sit on every sibling document follow-up (RAPP-720).
    if exists (select 1 from public.field_placements p
                where p.field_id = p_field_id and p.surface = p_surface
                  and p.custom_form_id is not distinct from form_id
                  and not private.can_share_field(p.screen_key, p_screen_key)) then
      return private.move_field_group(actor_org, p_field_id, p_surface, form_id, p_screen_key);
    end if;
  elsif exists (select 1 from public.field_placements
                 where field_id = p_field_id and surface = p_surface) then
    raise unique_violation using message = 'the field is already asked there';
  end if;

  -- A hidden screen asks nothing required (RAPP-711): a field placed on it is optional.
  if private.screen_is_hidden(actor_org, p_surface, p_screen_key) and coalesce(p_required, false) then
    raise check_violation using message = 'a hidden screen asks nothing required';
  end if;
  insert into public.field_placements (org_id, field_id, surface, screen_key, custom_form_id, sort_order, required)
  values (actor_org, p_field_id, p_surface, p_screen_key, form_id,
          coalesce((select max(p.sort_order) + 1 from public.field_placements p
                     where p.org_id = actor_org and p.surface = p_surface
                       and p.screen_key is not distinct from p_screen_key), 0),
          coalesce(p_required, field.default_required)
            and not private.screen_is_hidden(actor_org, p_surface, p_screen_key))
  returning id into saved_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.field_place', 'profile_field', p_field_id,
          jsonb_build_object('placement_id', saved_id, 'surface', p_surface, 'screen', p_screen_key,
                             'custom_form', form_id));
  return saved_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_custom_form(p_response_id uuid, payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  her public.profiles;
  response public.custom_form_responses;
  form public.custom_forms;
  live public.custom_form_versions;
  content jsonb;
  shown_language text;
  ticks jsonb := coalesce(nullif(payload -> 'consents', 'null'::jsonb), '{}'::jsonb);
  signatures jsonb := coalesce(nullif(payload -> 'signatures', 'null'::jsonb), '{}'::jsonb);
  block jsonb;
  given jsonb;
  block_language text;
  is_unable boolean;
  asked record;
begin
  select * into her from public.profiles where id = caller;
  select * into response from public.custom_form_responses where id = p_response_id for update;
  if her.id is null or her.role <> 'player' or response.id is null or response.profile_id <> caller then
    raise insufficient_privilege using message = 'a form is answered by the player it asks';
  end if;
  select * into form from public.custom_forms where id = response.form_id;
  select * into live from private.custom_form_version_for(form.id, caller);
  if form.filled_by <> 'player' or form.is_archived or live.id is null then
    raise insufficient_privilege using message = 'this form is not asked now';
  end if;
  -- A survey's answers never go to her record: complete_survey keeps them (RAPP-929).
  if form.kind = 'survey' then
    raise invalid_parameter_value using message = 'a survey is answered with complete_survey';
  end if;
  if response.status <> 'pending' then
    raise check_violation using message = 'the form is already answered';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object'
     or payload - array['answers', 'signatures', 'consents', 'language'] <> '{}'::jsonb
     or jsonb_typeof(ticks) <> 'object' or jsonb_typeof(signatures) <> 'object' then
    raise invalid_parameter_value
      using message = 'complete_custom_form takes her answers by field, her signatures, her consents and her language';
  end if;
  content := live.content;
  shown_language := case when payload ->> 'language' in ('ca', 'es', 'en', 'fr', 'ar', 'fa')
                         then payload ->> 'language' else her.preferred_language end;

  perform private.write_field_answers(caller, coalesce(nullif(payload -> 'answers', 'null'::jsonb), '{}'::jsonb),
                                      'player', null, true);
  perform private.apply_document_rule(caller, true, true);

  -- Every required field the version asks has an answer (shown on its condition).
  if exists (
    select 1
      from jsonb_array_elements(content -> 'placements') p
      join public.profile_fields f on f.id = (p ->> 'field_id')::uuid and not f.is_archived
     where (p ->> 'required')::boolean
       -- Only on a screen that opens for her (RAPP-715).
       and private.content_screen_opens(caller, content, p ->> 'screen_key')
       and (f.show_when_field_id is null or exists (
             select 1 from public.profile_fields gate
              where gate.id = f.show_when_field_id
                and private.field_answer_now(caller, gate) = to_jsonb(f.show_when_option_id::text)))
       and private.field_answer_now(caller, f) is null
  ) then
    raise not_null_violation using message = 'complete_custom_form requires an answer to a required question';
  end if;

  -- Every signature block, with the text the version published. A text or
  -- points block asks nothing (RAPP-770); a version published before names
  -- no kind, and its blocks are signatures. "No puc signar" keeps the text
  -- she accepted with no strokes (RAPP-771).
  for block in select value from jsonb_array_elements(content -> 'blocks')
                where coalesce(value ->> 'kind', 'signature') = 'signature'
                  and private.content_screen_opens(caller, content, value ->> 'screen_key') loop
    given := signatures -> (block ->> 'id');
    if given is null or not private.form_signature_given_valid(given) then
      raise not_null_violation using message = 'complete_custom_form requires her signature on every signature block';
    end if;
    is_unable := coalesce((given ->> 'unable_to_draw')::boolean, false);
    block_language := case when length(btrim(coalesce(block -> 'body' ->> (given ->> 'language'), ''))) > 0
                           then given ->> 'language' else 'ca' end;
    insert into public.form_signatures (
      org_id, profile_id, surface, block_id, screen_key, body, language, signer_kind,
      signer_user_id, signer_name, strokes, unable_to_draw, custom_form_id)
    values (
      her.org_id, caller, 'custom_form',
      (select b.id from public.form_blocks b where b.id = (block ->> 'id')::uuid),
      block ->> 'screen_key', block -> 'body' ->> block_language, block_language, 'player', caller,
      coalesce(nullif(concat_ws(' ', private.name_answer_text(caller, 'first_name'),
                                     private.name_answer_text(caller, 'last_name')), ''), '-'),
      case when is_unable then null else given -> 'strokes' end, is_unable, form.id);
  end loop;

  -- Her ticks of the consents the version asks, each recorded with the key,
  -- the text and the requiredness the version froze; a version before schema
  -- 2 records the consent's text as it is now.
  if exists (select 1 from jsonb_each(ticks) t
              where jsonb_typeof(t.value) <> 'boolean'
                 or not exists (
                   select 1 from jsonb_array_elements(content -> 'consent_placements') p
                     join public.consents c on c.id = (p ->> 'consent_id')::uuid and not c.is_archived
                    where coalesce(p -> 'consent' ->> 'key', c.key) = t.key)) then
    raise check_violation using message = 'her consents are ticks of the consents the form asks';
  end if;
  for asked in
    select c.id, coalesce(p -> 'consent' ->> 'key', c.key) as key,
           coalesce(p -> 'consent' -> 'body', c.body) as body,
           (p ->> 'required')::boolean as required, p ->> 'screen_key' as screen_key
      from jsonb_array_elements(content -> 'consent_placements') p
      join public.consents c on c.id = (p ->> 'consent_id')::uuid and not c.is_archived
     where private.content_screen_opens(caller, content, p ->> 'screen_key')
     order by p ->> 'screen_key', (p ->> 'sort_order')::integer
  loop
    if asked.required and (ticks -> asked.key) is distinct from 'true'::jsonb then
      raise check_violation using message = 'every required consent must be given';
    end if;
    insert into public.consent_events
      (org_id, profile_id, consent_id, consent_key, granted, method, language, wording, required,
       form, screen_key, custom_form_id)
    values (her.org_id, her.id, asked.id, asked.key, coalesce((ticks ->> asked.key)::boolean, false), 'app',
            shown_language, private.localized_text_in(asked.body, shown_language), asked.required,
            'custom_form', asked.screen_key, form.id);
    perform private.apply_consent_effects(her.id, asked.key, coalesce((ticks ->> asked.key)::boolean, false), her.id);
  end loop;

  update public.custom_form_responses
     set status = 'done', answered_at = now(), answered_by = caller, filled_by = 'player',
         version = live.version
   where id = response.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.my_custom_forms()
 RETURNS TABLE(response_id uuid, form_id uuid, version integer, name jsonb, mandatory text, deadline date, is_blocking boolean, asked_at timestamp with time zone, kind text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
begin
  if private.sees_onboarding_drafts(caller) then
    insert into public.custom_form_responses (org_id, form_id, version, profile_id, season_id)
    select f.org_id, f.id, v.version, caller, v.season_id
      from public.custom_forms f
      join public.profiles me on me.id = caller and me.org_id = f.org_id and me.role = 'player'
      cross join lateral private.custom_form_version_for(f.id, caller) v
     where f.kind = 'legal' and f.filled_by = 'player' and not f.is_archived
       -- The terms and the authorization are asked by their own gates.
       and f.system_key is null
       and caller = any (private.custom_form_audience(f.id))
       and not exists (select 1 from public.custom_form_responses r
                        where r.form_id = f.id and r.profile_id = caller)
    on conflict do nothing;
  end if;
  return query
  select r.id, f.id, v.version, v.content -> 'name', v.content ->> 'mandatory',
         (v.content ->> 'deadline')::date,
         private.custom_form_blocks_her(v.content ->> 'mandatory', (v.content ->> 'deadline')::date),
         r.asked_at, f.kind
    from public.custom_form_responses r
    join public.custom_forms f on f.id = r.form_id
    cross join lateral private.custom_form_version_for(f.id, caller) v
   where r.profile_id = caller and r.status = 'pending'
     and f.filled_by = 'player' and not f.is_archived and f.system_key is null
     -- Surveys are listed by my_surveys (RAPP-929).
     and f.kind <> 'survey'
     and jsonb_array_length(v.content -> 'screens') > 0
   order by private.custom_form_blocks_her(v.content ->> 'mandatory', (v.content ->> 'deadline')::date) desc,
            (v.content ->> 'deadline')::date nulls last, r.asked_at, r.id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.notify_custom_form(p_org_id uuid, p_response_id uuid, p_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  publication_id uuid;
begin
  -- An older build would open a survey as a form: surveys ring no phone yet (RAPP-929).
  if exists (select 1 from public.custom_form_responses r
               join public.custom_forms f on f.id = r.form_id
              where r.id = p_response_id and f.kind = 'survey') then
    return;
  end if;
  insert into public.push_publications (org_id, content_type, content_id, recipient_id, scheduled_for, state)
  values (p_org_id, 'custom_form', p_response_id, p_profile_id, now(), 'processing')
  on conflict do nothing
  returning id into publication_id;
  if publication_id is null then
    return;
  end if;
  insert into public.push_deliveries (org_id, publication_id, push_token_id, recipient_id, language, next_attempt_at)
  select p_org_id, publication_id, push_token.id, player.id,
         case when player.preferred_language in ('ca', 'es', 'en', 'fr', 'ar', 'fa')
              then player.preferred_language else 'ca' end,
         now()
    from public.profiles as player
    join public.push_tokens as push_token on push_token.user_id = player.id
   where player.org_id = p_org_id and player.id = p_profile_id and player.role = 'player'
     and player.is_active and player.push_notifications_enabled
  on conflict on constraint push_deliveries_publication_token_unique do nothing;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_custom_form(p_name jsonb, p_filled_by text, p_mandatory text, p_deadline date, p_audience text, p_repeats_each_season boolean, p_kind text DEFAULT 'other'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := private.require_question_builder();
  saved_id uuid;
  form_kind text := coalesce(p_kind, 'other');
begin
  perform private.check_custom_form_choices(p_name, p_filled_by, p_mandatory, p_deadline, p_audience);
  if form_kind not in ('legal', 'other', 'survey') then
    raise check_violation using message = 'a form is legal or other';
  end if;
  insert into public.custom_forms (org_id, name, filled_by, mandatory, deadline, audience,
                                   repeats_each_season, kind, created_by)
  values (actor_org, p_name, p_filled_by, p_mandatory, p_deadline, p_audience,
          coalesce(p_repeats_each_season, false), form_kind, (select auth.uid()))
  returning id into saved_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.create', 'custom_form', saved_id,
          jsonb_build_object('name', p_name, 'filled_by', p_filled_by, 'mandatory', p_mandatory,
                             'deadline', p_deadline, 'audience', p_audience,
                             'repeats_each_season', coalesce(p_repeats_each_season, false),
                             'kind', form_kind));
  return saved_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_custom_form(p_id uuid, p_name jsonb, p_filled_by text, p_mandatory text, p_deadline date, p_audience text, p_repeats_each_season boolean, p_kind text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := private.require_question_builder();
  form public.custom_forms;
  form_kind text;
begin
  select * into form from public.custom_forms where id = p_id and org_id = actor_org for update;
  if form.id is null then
    raise no_data_found using message = 'no such form';
  end if;
  perform private.check_custom_form_choices(p_name, p_filled_by, p_mandatory, p_deadline, p_audience);
  if coalesce(p_repeats_each_season, false) <> form.repeats_each_season and form.published_at is not null then
    raise check_violation using message = 'whether a form repeats stays once it was published';
  end if;
  form_kind := coalesce(p_kind, form.kind);
  if form_kind not in ('legal', 'other', 'survey') then
    raise check_violation using message = 'a form is legal, other or a survey';
  end if;
  -- A survey stays a survey and a form a form: its questions are its own (RAPP-929).
  if (form.kind = 'survey') <> (form_kind = 'survey') then
    raise check_violation using message = 'a survey stays a survey';
  end if;
  if form_kind <> form.kind and (form.published_at is not null or form.system_key is not null) then
    raise check_violation using message = 'a form keeps its kind once it was published';
  end if;
  update public.custom_forms
     set name = p_name, filled_by = p_filled_by, mandatory = p_mandatory, deadline = p_deadline,
         audience = p_audience, repeats_each_season = coalesce(p_repeats_each_season, false),
         kind = form_kind, updated_at = now()
   where id = form.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'custom_form.save', 'custom_form', form.id,
          jsonb_build_object('name', p_name, 'filled_by', p_filled_by, 'mandatory', p_mandatory,
                             'deadline', p_deadline, 'audience', p_audience,
                             'repeats_each_season', coalesce(p_repeats_each_season, false),
                             'kind', form_kind));
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_data_export(p_dataset text, p_scope text, p_format text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_reason text DEFAULT NULL::text, p_confirmed boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  export_id uuid := gen_random_uuid();
  export_columns jsonb;
  field_columns jsonb;
  export_rows jsonb;
  start_instant timestamptz;
  end_instant timestamptz;
begin
  perform private.require_recent_second_factor();
  if actor is null or actor_org is null or not (
    -- Custom answers (RAPP-307) need what the participants export needs.
    case (case when p_dataset in ('custom_answers', 'consents') then 'participants' else p_dataset end)
      when 'participants' then case
        when p_scope = 'full' then (select public.has_permission('export.participants_sensitive'))
          and (select public.has_permission('participants.view_sensitive'))
        else (select public.has_permission('export.participants'))
      end
      when 'attendance' then (select public.has_permission('export.attendance'))
      when 'events' then (select public.has_permission('export.events'))
      -- An unknown dataset falls through to the validation below for anyone
      -- who may export something, so the error names the real problem.
      else (select public.has_permission('export.participants'))
        or (select public.has_permission('export.attendance'))
        or (select public.has_permission('export.events'))
    end
  ) then
    raise insufficient_privilege using message = 'data exports require admin access';
  end if;
  if p_dataset not in ('participants', 'custom_answers', 'consents', 'attendance', 'events') then
    raise invalid_parameter_value using message = 'unsupported export dataset';
  end if;
  if p_scope not in ('default', 'full') then
    raise invalid_parameter_value using message = 'unsupported export scope';
  end if;
  if p_format not in ('csv', 'xlsx') then
    raise invalid_parameter_value using message = 'unsupported export format';
  end if;
  if p_start_date is not null and p_end_date is not null and p_start_date > p_end_date then
    raise invalid_datetime_format using message = 'invalid export period';
  end if;
  if p_scope = 'full' and not p_confirmed then
    raise invalid_parameter_value using message = 'full export requires explicit confirmation';
  end if;
  if p_scope = 'full' and length(btrim(coalesce(p_reason, ''))) < 10 then
    raise invalid_parameter_value using message = 'full export requires a reason of at least 10 characters';
  end if;
  if length(coalesce(p_reason, '')) > 500 then
    raise invalid_parameter_value using message = 'export reason is too long';
  end if;
  if (
    select count(*)
    from public.audit_log log
    where log.actor_id = actor
      and log.action like 'data_export.%'
      and log.created_at >= now() - interval '1 minute'
  ) >= 5 then
    raise sqlstate '42901' using message = 'export rate limit exceeded';
  end if;

  start_instant := case
    when p_start_date is null then null
    else p_start_date::timestamp at time zone 'Europe/Madrid'
  end;
  end_instant := case
    when p_end_date is null then null
    else (p_end_date + 1)::timestamp at time zone 'Europe/Madrid'
  end;

  if p_dataset = 'participants' then
    -- One column per field (RAPP-662, D9): her names and account, then every
    -- field of Dades de les jugadores in its order, by its system key or its
    -- Catalan name. The level decides: the default scope holds Normal and
    -- Personal fields, the full scope Sensitive ones too. Each value is her
    -- current answer (this season's for a seasonal field) as text, the way
    -- the custom answers export writes it.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', named.id, 'column_name', named.column_name, 'season_key', named.season_key)
             order by named.section_order, named.sort_order, named.id), '[]'::jsonb)
      into field_columns
      from (
        select f.id, s.sort_order as section_order, f.sort_order,
               case when private.field_is_seasonal(f.id)
                    then private.current_season_id(f.org_id)
                    else '00000000-0000-0000-0000-000000000000'::uuid end as season_key,
               -- Two fields with one name, or a name a fixed column has, get
               -- the start of their id so no column hides another.
               case when count(*) over (partition by coalesce(f.system_key, f.label ->> 'ca')) > 1
                      or coalesce(f.system_key, f.label ->> 'ca')
                         in ('id', 'first_name', 'last_name', 'preferred_language', 'is_active', 'created_at')
                    then coalesce(f.system_key, f.label ->> 'ca') || ' (' || left(f.id::text, 8) || ')'
                    else coalesce(f.system_key, f.label ->> 'ca') end as column_name
          from public.profile_fields f
          join public.profile_sections s on s.id = f.section_id
         where f.org_id = actor_org
           and f.kind <> 'survey'
           -- Her names are columns of their own (D2).
           and f.system_key is distinct from 'first_name'
           and f.system_key is distinct from 'last_name'
           and (p_scope = 'full' or f.privacy <> 'sensitive')
           -- Her health only for someone with the health permission (RAPP-698).
           and (f.read_permission is null or (select public.has_permission(f.read_permission)))
      ) named;
    export_columns := '["id","first_name","last_name","preferred_language"]'::jsonb
      || coalesce((select jsonb_agg(c -> 'column_name' order by ordinality)
                     from jsonb_array_elements(field_columns) with ordinality as listed(c, ordinality)), '[]'::jsonb)
      || '["is_active","created_at"]'::jsonb;
    select coalesce(jsonb_agg(
             jsonb_build_object(
               'id', profile.id,
               'first_name', private.shown_name(profile.id, 'first_name'),
               'last_name', private.shown_name(profile.id, 'last_name'),
               'preferred_language', profile.preferred_language,
               'is_active', profile.is_active,
               'created_at', profile.created_at)
             || coalesce((
               select jsonb_object_agg(
                        c.column_name,
                        private.custom_answer_text(
                          field, coalesce(answer.value, (public.decrypt_field(answer.value_encrypted))::jsonb)))
                 from jsonb_to_recordset(field_columns) as c(id uuid, column_name text, season_key uuid)
                 join public.profile_fields field on field.id = c.id
                 join public.custom_answers answer
                   on answer.profile_id = profile.id and answer.question_id = c.id
                  and answer.season_key = c.season_key), '{}'::jsonb)
             order by private.shown_name(profile.id, 'last_name'), private.shown_name(profile.id, 'first_name'), profile.id), '[]'::jsonb)
    into export_rows
    from public.profiles profile
    where profile.org_id = actor_org
      and profile.role = 'player'
      and not profile.is_test_account;
  elsif p_dataset = 'custom_answers' then
    -- Answers to every field (RAPP-307, RAPP-662), one row per answer. The
    -- default scope holds Normal and Personal answers; Sensitive answers only
    -- the full scope, which needs participants.view_sensitive above.
    export_columns := '["participant_id","first_name","last_name","section","question","privacy","season","answer","answered_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'participant_id', profile.id,
      'first_name', private.shown_name(profile.id, 'first_name'),
      'last_name', private.shown_name(profile.id, 'last_name'),
      'section', section.title ->> 'ca',
      'question', field.label ->> 'ca',
      'privacy', field.privacy,
      'season', season.name,
      'answer', private.custom_answer_text(
        field, coalesce(answer.value, (public.decrypt_field(answer.value_encrypted))::jsonb)),
      'answered_at', answer.answered_at
    ) order by private.shown_name(profile.id, 'last_name'), private.shown_name(profile.id, 'first_name'), profile.id, section.sort_order, field.sort_order,
             season.starts_on), '[]'::jsonb)
    into export_rows
    from public.custom_answers answer
    -- Her Fitxa: every field, in the section the team reads it (RAPP-656).
    join public.profile_fields field on field.id = answer.question_id
    join public.profile_sections section on section.id = field.section_id
    join public.profiles profile on profile.id = answer.profile_id
    left join public.seasons season on season.id = answer.season_id
    where answer.org_id = actor_org
      and profile.role = 'player'
      and not profile.is_test_account
      and (p_scope = 'full' or field.privacy <> 'sensitive')
      and (field.read_permission is null or (select public.has_permission(field.read_permission)));
  elsif p_dataset = 'consents' then
    -- Every consent decision with the words she was shown (RAPP-614): one row
    -- per decision, signing and later changes alike. No health answer, no
    -- signature: a consent's wording is the organization's own text.
    export_columns := '["participant_id","first_name","last_name","season","version","consent_key","consent","language","required","granted","method","decided_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'participant_id', profile.id,
      'first_name', private.shown_name(profile.id, 'first_name'),
      'last_name', private.shown_name(profile.id, 'last_name'),
      'season', season.name,
      'version', version.version_number,
      'consent_key', event.consent_key,
      'consent', event.wording,
      'language', event.language,
      'required', event.required,
      'granted', event.granted,
      'method', event.method,
      'decided_at', event.decided_at
    ) order by private.shown_name(profile.id, 'last_name'), private.shown_name(profile.id, 'first_name'), profile.id, event.decided_at, event.id), '[]'::jsonb)
    into export_rows
    from public.consent_events event
    join public.profiles profile on profile.id = event.profile_id
    left join public.authorization_versions version on version.id = event.version_id
    left join public.seasons season on season.id = version.season_id
    where event.org_id = actor_org
      and profile.role = 'player'
      and not profile.is_test_account
      and (start_instant is null or event.decided_at >= start_instant)
      and (end_instant is null or event.decided_at < end_instant);
  elsif p_dataset = 'attendance' then
    export_columns := '["attendance_id","occurrence_id","event_id","category_id","player_id","first_name","last_name","status","marked_at","starts_at","ends_at","event_title_ca","event_title_es","event_title_en","event_title_fr","event_title_ar","event_title_fa","event_location","category_name_ca","category_name_es","category_name_en","category_name_fr","category_name_ar","category_name_fa"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'attendance_id', report.attendance_id,
      'occurrence_id', report.occurrence_id,
      'event_id', report.event_id,
      'category_id', report.category_id,
      'player_id', report.player_id,
      'first_name', report.first_name,
      'last_name', report.last_name,
      'status', report.status,
      'marked_at', report.marked_at,
      'starts_at', report.starts_at,
      'ends_at', report.ends_at,
      'event_title_ca', report.event_title ->> 'ca',
      'event_title_es', report.event_title ->> 'es',
      'event_title_en', report.event_title ->> 'en',
      'event_title_fr', report.event_title ->> 'fr',
      'event_title_ar', report.event_title ->> 'ar',
      'event_title_fa', report.event_title ->> 'fa',
      'event_location', report.event_location,
      'category_name_ca', report.category_name ->> 'ca',
      'category_name_es', report.category_name ->> 'es',
      'category_name_en', report.category_name ->> 'en',
      'category_name_fr', report.category_name ->> 'fr',
      'category_name_ar', report.category_name ->> 'ar',
      'category_name_fa', report.category_name ->> 'fa'
    ) order by report.starts_at, report.last_name, report.first_name, report.attendance_id), '[]'::jsonb)
    into export_rows
    from public.attendance_report_rows report
    where report.org_id = actor_org
      and not report.is_test_account
      and (start_instant is null or report.starts_at >= start_instant)
      and (end_instant is null or report.starts_at < end_instant);
  else
    export_columns := '["id","category_id","title_ca","title_es","title_en","title_fr","title_ar","title_fa","location","starts_at","ends_at","time_zone","status","signup_mode","max_participants","created_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', event.id,
      'category_id', event.category_id,
      'title_ca', event.title ->> 'ca',
      'title_es', event.title ->> 'es',
      'title_en', event.title ->> 'en',
      'title_fr', event.title ->> 'fr',
      'title_ar', event.title ->> 'ar',
      'title_fa', event.title ->> 'fa',
      'location', event.location,
      'starts_at', event.starts_at,
      'ends_at', event.ends_at,
      'time_zone', event.time_zone,
      'status', event.status,
      'signup_mode', event.signup_mode,
      'max_participants', event.max_participants,
      'created_at', event.created_at
    ) order by event.starts_at, event.id), '[]'::jsonb)
    into export_rows
    from public.events event
    where event.org_id = actor_org
      and (start_instant is null or event.starts_at >= start_instant)
      and (end_instant is null or event.starts_at < end_instant);
  end if;

  insert into public.audit_log (id, org_id, actor_id, action, target_type, target_id, changes)
  values (
    gen_random_uuid(), actor_org, actor, 'data_export.' || p_scope, 'data_export', export_id,
    jsonb_strip_nulls(jsonb_build_object(
      'dataset', p_dataset,
      'format', p_format,
      'scope', p_scope,
      'start_date', p_start_date,
      'end_date', p_end_date,
      'reason', case when p_scope = 'full' then btrim(p_reason) else null end,
      'row_count', jsonb_array_length(export_rows)
    ))
  );

  return jsonb_build_object(
    'version', 1,
    'export_id', export_id,
    'dataset', p_dataset,
    'scope', p_scope,
    'format', p_format,
    'generated_at', now(),
    'columns', export_columns,
    'rows', export_rows
  );
end;
$function$;

-- 3. The catalog: older builds read it as before --------------------------------------------------

CREATE OR REPLACE FUNCTION private.intake_catalog_core(p_with_surveys boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- A woman who started on her own has no profile until she completes the
  -- wizard: she reads the default organization's questions.
  actor_org uuid := coalesce((select public.current_org_id()), (select public.default_organization_id()));
  with_archived boolean := (select private.can_design_onboarding());
  reads_team_forms boolean := with_archived or (select public.has_permission('participants.view'))
    -- The survey builder reads its surveys' drafts (RAPP-929).
    or (p_with_surveys and (select public.has_permission('surveys.results')));
  forms_shown uuid[];
  forms_json jsonb;
  form_placements_json jsonb;
  form_blocks_json jsonb;
  form_consents_json jsonb;
  -- The old Health screen an older build draws: the questions of the
  -- authorization she is shown (RAPP-773). Designers read the form itself.
  old_health_json jsonb := case when with_archived then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', private.stable_uuid((x.p ->> 'id') || ':authorization'), 'field_id', x.p -> 'field_id',
             'surface', 'authorization', 'screen_key', null, 'sort_order', x.place,
             'required', x.p -> 'required', 'label_override', x.p -> 'label_override',
             'help_override', x.p -> 'help_override')
           order by x.place)
      from (select value as p, row_number() over (order by (value ->> 'sort_order')::integer) - 1 as place
              from jsonb_array_elements(coalesce(
                     private.authorization_snapshot_for(actor_org, (select auth.uid())) -> 'placements',
                     '[]'::jsonb))) x
      join public.profile_fields f on f.id = (x.p ->> 'field_id')::uuid and not f.is_archived), '[]'::jsonb) end;
begin
  if (select auth.uid()) is null or actor_org is null then
    raise insufficient_privilege using message = 'the question catalog needs an account';
  end if;
  if reads_team_forms then
    -- The team reads each form's draft, and designers its published versions.
    select coalesce(array_agg(f.id), array[]::uuid[]) into forms_shown
      from public.custom_forms f
     where f.org_id = actor_org and (with_archived or not f.is_archived)
       -- Surveys only for the dashboard that asks for them (RAPP-929).
       and (p_with_surveys or f.kind <> 'survey');
    forms_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'filled_by', f.filled_by, 'mandatory', f.mandatory,
        'deadline', f.deadline,
        -- A survey's activity and closing time (RAPP-929).
        'event_id', f.event_id, 'closes_at', f.closes_at,
        -- What an older build reads (RAPP-700).
        'appears', case when f.audience = 'chosen' then 'sent'
                        when f.repeats_each_season then 'every_season' else 'once' end,
        'audience', f.audience, 'repeats_each_season', f.repeats_each_season,
        -- Legal or other, and the app's own legal forms (RAPP-771).
        'kind', f.kind, 'system_key', f.system_key,
        'recipient_count', (select count(*) from public.custom_form_recipients r where r.form_id = f.id),
        'version', f.version, 'published_at', f.published_at, 'is_archived', f.is_archived,
        'versions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'version', v.version, 'season_id', v.season_id, 'is_correction', v.is_correction,
            'published_at', v.published_at) order by v.version desc)
            from public.custom_form_versions v where v.form_id = f.id and f.system_key is null), '[]'::jsonb)
          -- The app terms' versions are their ledger's (RAPP-772).
          || coalesce((
          select jsonb_agg(jsonb_build_object(
            'version', v.version_number, 'season_id', null, 'is_correction', v.is_correction,
            'published_at', v.published_at) order by v.version_number desc)
            from public.app_terms_versions v
           where f.system_key = 'app_terms' and v.org_id = f.org_id and v.published_at is not null), '[]'::jsonb)
          -- The authorization's are its ledger's, numbered per season (RAPP-773).
          || coalesce((
          select jsonb_agg(jsonb_build_object(
            'version', v.version_number, 'season_id', v.season_id, 'is_correction', v.is_correction,
            'published_at', v.published_at) order by v.published_at desc, v.version_number desc)
            from public.authorization_versions v
           where f.system_key = 'season_authorization' and v.org_id = f.org_id
             and v.published_at is not null), '[]'::jsonb),
        'screens', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', s.id, 'title', s.title, 'intro', s.intro, 'sort_order', s.sort_order,
            'is_hidden', s.is_hidden,
            -- The answer that opens it (RAPP-715); null: it always shows.
            'show_when_field_id', s.show_when_field_id, 'show_when_values', to_jsonb(s.show_when_values),
            -- Its help line and buttons, and its locked part (RAPP-771).
            'texts', s.texts, 'system_screen', s.system_screen,
            -- The season documents (RAPP-773).
            'attachments', s.attachments)
            order by s.sort_order, s.created_at)
            from public.custom_form_screens s
           where s.form_id = f.id and not s.is_archived), '[]'::jsonb))
        order by f.created_at, f.id)
        from public.custom_forms f where f.id = any (forms_shown)), '[]'::jsonb);
    form_placements_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'field_id', p.field_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'custom_form_id', p.custom_form_id, 'sort_order', p.sort_order, 'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.screen_key, p.sort_order, p.created_at)
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id and not f.is_archived
       where p.surface = 'custom_form' and p.custom_form_id = any (forms_shown)), '[]'::jsonb);
    form_blocks_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'surface', b.surface, 'screen_key', b.screen_key, 'custom_form_id', b.custom_form_id,
        'kind', b.kind, 'body', b.body, 'title', b.title, 'points', b.points,
        -- A legal form's own signature and its texts (RAPP-773).
        'settings', b.settings, 'sort_order', b.sort_order)
        order by b.screen_key, b.sort_order, b.created_at)
        from public.form_blocks b
       where b.surface = 'custom_form' and b.custom_form_id = any (forms_shown)), '[]'::jsonb);
    form_consents_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'consent_id', p.consent_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'custom_form_id', p.custom_form_id, 'sort_order', p.sort_order, 'required', p.required,
        -- The form's own wording of the consent (RAPP-771).
        'body_override', p.body_override)
        order by p.screen_key, p.sort_order, p.created_at)
        from public.consent_placements p
        join public.consents c on c.id = p.consent_id and not c.is_archived
       where p.surface = 'custom_form' and p.custom_form_id = any (forms_shown)), '[]'::jsonb);
  else
    -- She reads the published version of each live form she fills in
    -- (RAPP-701); a test player the draft of a legal form (RAPP-771).
    with live as (
      select f.id, f.audience, f.repeats_each_season, f.published_at, f.kind, f.system_key, v.version, v.content
        from public.custom_forms f
        cross join lateral private.custom_form_version_for(f.id, (select auth.uid())) v
       where f.org_id = actor_org and f.filled_by = 'player' and not f.is_archived
         and f.system_key is null
         -- A survey reaches her through my_surveys, never the catalog (RAPP-929).
         and f.kind <> 'survey'
      union all
      -- The terms form as the version she is shown holds it (RAPP-772).
      select f.id, f.audience, f.repeats_each_season, f.published_at, f.kind, f.system_key,
             coalesce(v.version_number, (select coalesce(max(x.version_number), 0) + 1
                                           from public.app_terms_versions x where x.org_id = f.org_id)),
             private.app_terms_version_snapshot(v)
        from public.custom_forms f
        cross join lateral private.app_terms_version_for(f.org_id, (select auth.uid())) v
       where f.org_id = actor_org and f.system_key = 'app_terms' and v.id is not null
         and private.app_terms_version_snapshot(v) is not null
      union all
      -- The authorization form as the version she is shown holds it (RAPP-773).
      select f.id, f.audience, f.repeats_each_season, f.published_at, f.kind, f.system_key,
             coalesce(v.version_number, (select coalesce(max(x.version_number), 0) + 1
                                           from public.authorization_versions x where x.season_id = v.season_id)),
             private.authorization_version_snapshot(v)
        from public.custom_forms f
        cross join lateral private.authorization_version_for(f.org_id, (select auth.uid())) v
       where f.org_id = actor_org and f.system_key = 'season_authorization' and v.id is not null
         and private.authorization_version_snapshot(v) is not null)
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'name', l.content -> 'name', 'filled_by', 'player',
        'mandatory', l.content ->> 'mandatory', 'deadline', l.content -> 'deadline',
        'appears', case when l.audience = 'chosen' then 'sent'
                        when l.repeats_each_season then 'every_season' else 'once' end,
        'audience', l.audience, 'repeats_each_season', l.repeats_each_season,
        'kind', l.kind, 'system_key', l.system_key,
        'version', l.version, 'published_at', l.published_at, 'is_archived', false,
        'screens', l.content -> 'screens')), '[]'::jsonb),
      coalesce((
        select jsonb_agg(p || jsonb_build_object('surface', 'custom_form', 'custom_form_id', l2.id))
          from live l2
          cross join lateral jsonb_array_elements(l2.content -> 'placements') p
          join public.profile_fields f on f.id = (p ->> 'field_id')::uuid and not f.is_archived), '[]'::jsonb),
      coalesce((
        -- A version published before RAPP-770 names no kind: its blocks are signatures.
        select jsonb_agg(b || jsonb_build_object('surface', 'custom_form', 'custom_form_id', l2.id,
                                                 'kind', coalesce(b ->> 'kind', 'signature')))
          from live l2
          cross join lateral jsonb_array_elements(l2.content -> 'blocks') b), '[]'::jsonb),
      coalesce((
        select jsonb_agg(p || jsonb_build_object('surface', 'custom_form', 'custom_form_id', l2.id))
          from live l2
          cross join lateral jsonb_array_elements(l2.content -> 'consent_placements') p
          join public.consents c on c.id = (p ->> 'consent_id')::uuid and not c.is_archived), '[]'::jsonb)
      into forms_json, form_placements_json, form_blocks_json, form_consents_json
      from live l;
  end if;
  return jsonb_build_object(
    -- Ramassà screens. The fields each one asks are its placements, below.
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'intro', s.intro, 'after_screen', s.after_screen,
        'sort_order', s.sort_order, 'is_archived', s.is_archived, 'is_hidden', s.is_hidden,
            -- The answer that opens it (RAPP-715); null: it always shows.
            'show_when_field_id', s.show_when_field_id, 'show_when_values', to_jsonb(s.show_when_values),
            -- Its help line and buttons (RAPP-771).
            'texts', s.texts)
        order by array_position(private.intake_builtin_screens(), s.after_screen), s.sort_order, s.created_at)
        from public.intake_screens s
       where s.org_id = actor_org and (with_archived or not s.is_archived)), '[]'::jsonb),
    -- The app's questions as staff worded or hid them (RAPP-666).
    'overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question', q.question, 'label', p.label_override, 'help', p.help_override,
        'is_hidden', p.id is null) order by q.question)
        from unnest(private.wizard_intake_questions()) q(question)
        join public.profile_fields f
          on f.org_id = actor_org and f.system_key = private.question_system_key(q.question)
        left join public.field_placements p on p.field_id = f.id and p.surface = 'onboarding'
       where p.id is null or p.label_override is not null or p.help_override is not null), '[]'::jsonb),
    'presets', case when ((select public.has_permission('participants.view_personal')) or (select public.has_permission('onboarding.design'))) then coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'states', p.states)
        order by p.name, p.id)
        from public.intake_state_presets p where p.org_id = actor_org), '[]'::jsonb)
      else '[]'::jsonb end,
    -- Staff wording of the built-in screens and their hide switch (RAPP-612).
    'builtin_screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'screen', b.screen, 'texts', b.texts,
        'is_deleted', b.is_deleted,
        'is_hidden', b.is_deleted or (b.is_hidden and private.builtin_screen_hideable(b.screen)))
        order by b.screen)
        from public.intake_builtin_screens b where b.org_id = actor_org), '[]'::jsonb),
    -- The wizard steps as staff arranged them (RAPP-612); null is the app's order.
    'flow_order', (
      select to_jsonb(f.step_order) from public.intake_flow_orders f where f.org_id = actor_org),
    -- The built-in questions that need an answer (RAPP-611).
    'required_questions', to_jsonb(private.required_intake_questions(actor_org)),
    -- The app terms she accepts (RAPP-613, RAPP-772).
    'terms', (
      select jsonb_build_object('id', v.id, 'version_number', v.version_number,
                                'content', private.app_terms_version_content(v),
                                'is_draft', v.published_at is null,
                                'form_id', private.app_terms_form_id(actor_org),
                                'legacy_compatible', private.app_terms_version_compatible(v))
        from private.app_terms_version_for(actor_org, (select auth.uid())) v
       where v.id is not null),
    -- The profile layout (RAPP-649): sections, fields and where each is asked.
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'key', s.key, 'title', s.title, 'sort_order', s.sort_order, 'is_builtin', s.is_builtin)
        order by s.sort_order, s.created_at)
        from public.profile_sections s where s.org_id = actor_org), '[]'::jsonb),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'section_id', f.section_id, 'kind', f.kind, 'survey_form_id', f.survey_form_id, 'system_key', f.system_key,
        'question_type', f.question_type, 'label', f.label, 'help', f.help, 'privacy', f.privacy,
        'read_permission', f.read_permission,
        'default_required', f.default_required, 'settings', f.settings,
        'show_when_field_id', f.show_when_field_id, 'show_when_option_id', f.show_when_option_id,
        'sort_order', f.sort_order, 'is_archived', f.is_archived, 'created_at', f.created_at,
        'created_by', case when with_archived then f.created_by end,
        'created_by_name', case when with_archived then (
          select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
            from public.profiles p where p.id = f.created_by) end,
        'has_answers', case when with_archived then private.field_has_answers(f.id) end,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'key', o.key, 'label', o.label, 'sort_order', o.sort_order, 'is_archived', o.is_archived)
            order by o.sort_order, o.id)
            from public.custom_question_options o where o.question_id = f.id), '[]'::jsonb))
        order by f.sort_order, f.created_at)
        from public.profile_fields f
       where f.org_id = actor_org and (with_archived or not f.is_archived)
         -- A survey's questions only for the dashboard that asks for them (RAPP-929).
         and (p_with_surveys or f.kind <> 'survey')), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'field_id', p.field_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'sort_order', p.sort_order, 'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.surface, p.screen_key, p.sort_order, p.created_at)
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id
       where p.org_id = actor_org and p.surface <> 'custom_form'
         and (with_archived or not f.is_archived)), '[]'::jsonb) || old_health_json,
    -- The blocks of each screen and of the entity form (RAPP-690).
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'surface', b.surface, 'screen_key', b.screen_key, 'kind', b.kind,
        'body', b.body, 'title', b.title, 'points', b.points, 'sort_order', b.sort_order)
        order by b.surface, b.screen_key, b.sort_order, b.created_at)
        from public.form_blocks b where b.org_id = actor_org and b.surface <> 'custom_form'), '[]'::jsonb),
    -- Dades legals (RAPP-699): the consents and where each is asked.
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'key', c.key, 'system_key', c.system_key, 'name', c.name, 'body', c.body,
        'is_archived', c.is_archived)
        order by c.created_at, c.key)
        from public.consents c
       where c.org_id = actor_org and (with_archived or not c.is_archived)), '[]'::jsonb),
    'consent_placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'consent_id', p.consent_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'sort_order', p.sort_order, 'required', p.required)
        order by p.surface, p.screen_key, p.sort_order, p.created_at)
        from public.consent_placements p
        join public.consents c on c.id = p.consent_id and not c.is_archived
       where p.org_id = actor_org and p.surface <> 'custom_form'), '[]'::jsonb),
    -- The forms the team created (RAPP-700, RAPP-701), with their screens in order.
    'custom_forms', forms_json,
    'custom_form_placements', form_placements_json,
    'custom_form_blocks', form_blocks_json,
    'custom_form_consent_placements', form_consents_json
  );
end;
$function$;
revoke all on function private.intake_catalog_core(boolean) from public, anon, authenticated;

create or replace function public.intake_catalog()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.intake_catalog_core(false);
$$;

-- The dashboard's catalog: the same, with the surveys and their questions (RAPP-929).
create or replace function public.intake_catalog_with_surveys()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not ((select private.can_design_onboarding())
          or (select public.has_permission('participants.view'))
          or (select public.has_permission('surveys.results'))) then
    raise insufficient_privilege using message = 'the surveys are read by the team';
  end if;
  return private.intake_catalog_core(true);
end;
$$;
revoke all on function public.intake_catalog_with_surveys() from public, anon;
grant execute on function public.intake_catalog_with_surveys() to authenticated;

-- 4. Her answers to a survey ------------------------------------------------------------------------

create table public.survey_answers (
  response_id uuid not null references public.custom_form_responses (id) on delete cascade,
  field_id uuid not null references public.profile_fields (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- Whose answers: the erasure registry purges by it (RAPP-929).
  profile_id uuid not null references public.profiles (id) on delete cascade,
  value jsonb not null,
  primary key (response_id, field_id)
);
create index survey_answers_field_id_idx on public.survey_answers (field_id);
create index survey_answers_org_id_idx on public.survey_answers (org_id);
create index survey_answers_profile_id_idx on public.survey_answers (profile_id);
comment on table public.survey_answers is
  'A response''s answers to a survey (RAPP-929): never her record. Written by complete_survey, read by survey_results.';
alter table public.survey_answers enable row level security;
-- No client reads or writes the table: its functions do.
revoke all on table public.survey_answers from public, anon, authenticated;

-- Her survey answers in the erasure registry.
CREATE OR REPLACE FUNCTION public.personal_data_disposition()
 RETURNS TABLE(table_name text, participant_column text, disposition text, reason text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select * from (values
    ('app_terms_signatures', 'profile_id', 'purge', 'The app terms signature and photo/video choice.'),
    ('profiles', 'id', 'purge', 'The participant profile and its encrypted fields.'),
    ('participant_notes', 'profile_id', 'purge', 'Staff prose about the participant.'),
    ('push_tokens', 'user_id', 'purge', 'Registered participant devices.'),
    ('push_deliveries', 'recipient_id', 'purge', 'Per-device notification delivery history.'),
    ('custom_notification_group_members', 'participant_id', 'purge', 'Curated notification membership.'),
    ('terms_acceptances', 'profile_id', 'purge', 'Participant consent records.'),
    ('deletion_requests', 'profile_id', 'purge', 'Participant erasure requests.'),
    ('invites', 'accepted_by', 'purge', 'The invitation that admitted the participant.'),
    ('entity_invitations', 'profile_id', 'purge', 'The invitation that admitted an entity collaborator.'),
    ('equipment_deliveries', 'profile_id', 'purge', 'Participant equipment history.'),
    ('event_signups', 'player_id', 'purge', 'Participant event activity.'),
    ('attendance', 'player_id', 'purge', 'Participant attendance history.'),
    ('service_interests', 'user_id', 'purge', 'Participant service interests.'),
    ('conversations', 'user_id', 'purge', 'Participant direct correspondence.'),
    ('messages', 'sender_id', 'purge', 'Participant-authored messages.'),
    ('conversation_read_states', 'user_id', 'purge', 'Participant message read history.'),
    ('conversation_assignment_history', 'user_id', 'purge', 'Participant conversation handling history.'),
    ('forum_posts', 'author_id', 'purge', 'Participant-authored forum posts.'),
    ('forum_replies', 'author_id', 'purge', 'Participant-authored forum replies.'),
    ('forum_flags', 'flagger_id', 'purge', 'Participant safety reports and optional comments.'),
    ('media_items', 'uploaded_by', 'purge', 'Participant gallery media and its consent record.'),
    ('entity_referrals', 'referred_profile_id', 'purge', 'Referral intake cascades with the linked participant.'),
    ('referral_updates', 'author_id', 'purge', 'Referral updates authored by the participant.'),
    ('mentoring_requests', 'player_id', 'purge', 'Private support requests belonging to the player.'),
    ('mentoring_notification_events', 'recipient_id', 'purge', 'Technical mentoring schedule notifications.'),
    ('feedback_submissions', 'author_id', 'purge', 'Encrypted feedback and its private attachment key.'),
    ('survey_responses', 'player_id', 'purge', 'Attributed encrypted survey responses.'),
    ('audit_log', 'actor_id', 'purge', 'Rows where the participant acted.'),
    ('audit_log', 'target_id', 'retain', 'Opaque lawful-access and erasure record.'),
    ('entity_referrals', null, 'retain_limited', 'Unlinked referral intake is purged after 24 months.'),
    ('entity_invitations', null, 'retain_limited', 'Expired entity invitations are purged after 24 months.'),
    ('notification_templates', null, 'not_personal', 'Organization-owned notification copy.'),
    ('custom_notification_groups', null, 'not_personal', 'Organization-owned audience definitions.'),
    ('targeted_notification_sends', null, 'not_personal', 'Aggregate organization send history.'),
    ('surveys', null, 'not_personal', 'Organization-owned survey definitions.'),
    ('survey_questions', null, 'not_personal', 'Organization-owned survey questions.'),
    ('staff_invitations', null, 'not_personal', 'Organization staff access administration history.'),
    ('internal_documents', null, 'not_personal', 'Organization-owned private operational documents.'),
    ('announcements', null, 'not_personal', 'Organization-owned operational content.'),
    ('event_categories', null, 'not_personal', 'Organization-owned event vocabulary.'),
    ('events', null, 'not_personal', 'Organization-owned schedules.'),
    ('event_occurrences', null, 'not_personal', 'Materialized organization schedules.'),
    ('knowledge_categories', null, 'not_personal', 'Organization-owned knowledge vocabulary.'),
    ('knowledge_articles', 'author_id', 'purge', 'Participant-authored knowledge stories.'),
    ('push_publications', 'recipient_id', 'purge', 'Recipient-specific push publications.'),
    ('service_categories', null, 'not_personal', 'Organization-owned service vocabulary.'),
    ('services', null, 'not_personal', 'Organization-owned directory content.'),
    ('service_images', null, 'not_personal', 'Organization-owned service media.'),
    ('service_submission_comments', null, 'not_personal', 'Organization review correspondence.'),
    ('service_submission_notifications', null, 'not_personal', 'Organization staff queue.'),
    ('forum_categories', null, 'not_personal', 'Organization-owned forum vocabulary.'),
    ('collaborating_entities', null, 'not_personal', 'A tenant-owned partner organization.'),
    ('organizations', null, 'not_personal', 'A tenant, not a person.'),
    ('municipality_catalog', null, 'not_personal', 'Official geography with no participant data.'),
    ('permissions', null, 'not_personal', 'The product permission catalog.'),
    ('permission_preset_defaults', null, 'not_personal', 'Product default permissions of the built-in presets.'),
    ('permission_presets', null, 'not_personal', 'Organization-owned access presets.'),
    ('permission_preset_permissions', null, 'not_personal', 'Organization-owned access presets.'),
    ('team_member_access', null, 'not_personal', 'Team access administration; players never hold permissions.'),
    ('team_member_permissions', null, 'not_personal', 'Team access administration; players never hold permissions.'),
    ('equipment_item_types', null, 'not_personal', 'The organization''s material catalog.'),
    ('stock_movements', 'participant_id', 'purge', 'Stock movements keep their quantity so stock stays right; her link is cleared by ON DELETE SET NULL.'),
    ('stock_alerts', null, 'not_personal', 'Stock that went below zero, for the team to count.'),
    ('equipment_arrivals', null, 'not_personal', 'Goods received: source, problems and cost. No participant data.'),
    ('equipment_arrival_photos', null, 'not_personal', 'Photos of goods received and their receipts.'),
    ('stock_counts', null, 'not_personal', 'Stock counts: what was expected and what was on the shelf.'),
    ('staff_checkouts', null, 'not_personal', 'Material lent to a staff member for a trip or an event.'),
    ('photo_handoffs', null, 'not_personal', 'A staff member''s request to take a document photo with the phone.'),
    ('seasons', null, 'not_personal', 'The organization''s seasons.'),
    ('authorization_versions', null, 'not_personal', 'The organization''s published authorization texts.'),
    ('app_terms_versions', null, 'not_personal', 'The organization''s app terms texts, draft and published.'),
    ('authorization_signatures', 'profile_id', 'purge', 'Her signed or paper authorizations, with her drawn signature.'),
    ('consent_events', 'profile_id', 'purge', 'Each consent she gave or withdrew, with the text she was shown. Anonymizing keeps them as proof without her name and clears a staff reason; deleting her account deletes them.'),
    ('consents', null, 'not_personal', 'The consents of the organization, defined once (Dades legals).'),
    ('consent_placements', null, 'not_personal', 'Where each consent is asked.'),
    ('walk_in_signings', null, 'retain_limited', 'A walk-in''s tablet signing until staff confirm it; purged after 60 days.'),
    ('intake_screens', null, 'not_personal', 'Registration screens staff built.'),
    ('profile_sections', null, 'not_personal', 'Sections of the player profile layout.'),
    ('profile_fields', null, 'not_personal', 'The pieces of information the profile holds, and who created each.'),
    ('field_placements', null, 'not_personal', 'Where each piece of information is asked.'),
    ('form_blocks', null, 'not_personal', 'The blocks of the forms: a signature with the text it asks to accept, a text, a list of points.'),
    ('form_signatures', 'profile_id', 'purge', 'Her signatures of the form blocks, and the entity''s for her on a referral, with the strokes.'),
    ('walk_in_consents', null, 'retain_limited', 'A walk-in''s ticks of the Onboarding consents on the tablet until staff confirm her; moved to her consent history then, or purged with the walk-in.'),
    ('walk_in_form_signatures', null, 'retain_limited', 'A walk-in''s signatures of the Onboarding blocks until staff confirm her; moved to her profile then, or purged with the walk-in.'),
    ('custom_question_options', null, 'not_personal', 'Options of those questions.'),
    ('intake_builtin_screens', null, 'not_personal', 'Staff wording of the built-in onboarding screens and which are hidden.'),
    ('intake_flow_orders', null, 'not_personal', 'The order of the onboarding screens staff arranged.'),
    ('intake_state_presets', null, 'not_personal', 'Organization presets for which questions are asked.'),
    ('custom_answers', 'profile_id', 'purge', 'Every answer of her record, the app''s fields and the team''s. Anonymizing deletes them all and keeps only her birth year.'),
    ('referral_custom_answers', null, 'retain_limited', 'Extra answers sent with a referral; moved to her profile when she is invited, or purged with the referral.'),
    ('custom_question_states', 'profile_id', 'purge', 'Which fields staff chose to ask or not ask her, the app''s and the team''s.'),
    ('participant_search_documents', 'profile_id', 'purge', 'Her names and her Normal and Personal text answers, indexed for the participants search.'),
    ('staff_notifications', null, 'not_personal', 'The team''s bell: one row per team member; names render live from the source row and params hold no personal value.'),
    ('custom_forms', null, 'not_personal', 'Forms the team created: their names and choices.'),
    ('custom_form_screens', null, 'not_personal', 'The screens of the forms the team created.'),
    ('custom_form_responses', 'profile_id', 'purge', 'Each time she was asked a form, and when and by whom it was answered.'),
    ('custom_form_recipients', 'profile_id', 'purge', 'The forms the team picked her for.'),
    ('custom_form_versions', null, 'not_personal', 'The forms the team created as each was published.'),
    ('custom_form_reminders', null, 'not_personal', 'When the team was reminded to renew a repeating form.'),
    ('announcement_reads', 'user_id', 'purge', 'The announcements she has seen.'),
    ('event_reads', 'user_id', 'purge', 'The activities she has opened.'),
    ('onboarding_form_chains', null, 'not_personal', 'The order of the forms after Onboarding, set by the team.'),
    ('list_visits', 'user_id', 'purge', 'When she last saw each list of posts, photos, stories, activities, services or guides.'),
    ('forum_post_reads', 'user_id', 'purge', 'The forum posts she has opened, and when she last opened her own.'),
    ('media_item_reads', 'user_id', 'purge', 'The gallery items she has opened.'),
    ('knowledge_article_reads', 'user_id', 'purge', 'The guides and stories she has opened.'),
    ('service_reads', 'user_id', 'purge', 'The services she has opened.'),
    ('mentoring_request_reads', 'user_id', 'purge', 'When she last opened each of her mentoring requests.'),
    ('feedback_submission_reads', 'user_id', 'purge', 'When she last opened each of her suggestions.'),
    ('custom_form_progress', 'profile_id', 'purge', 'Her answers so far to a form she left half way, encrypted, and the screen she left it on. Removed when she sends or deletes the form, and with the ask or her account.'),
    -- Her answers to a survey, kept apart from her record (RAPP-929).
    ('survey_answers', 'profile_id', 'purge', 'Her answers to a survey, kept with the response and never on her record. Removed with the ask or her account.')
  ) as disposition(table_name, participant_column, disposition, reason);
$function$;

-- 5. Building a survey ------------------------------------------------------------------------------

-- A survey's question, created on one of its screens or saved again (RAPP-929).
create or replace function public.save_survey_question(
  p_id uuid,
  p_screen_id uuid,
  p_type text,
  p_label jsonb,
  p_help jsonb,
  p_required boolean default false,
  p_options jsonb default '[]'::jsonb,
  p_settings jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  form_id uuid := private.custom_form_of_screen(actor_org, p_screen_id::text);
  saved_id uuid;
begin
  if form_id is null
     or not exists (select 1 from public.custom_forms f where f.id = form_id and f.kind = 'survey') then
    raise no_data_found using message = 'no such survey screen';
  end if;
  if p_id is not null
     and not exists (select 1 from public.profile_fields f
                      where f.id = p_id and f.org_id = actor_org and f.survey_form_id = form_id) then
    raise no_data_found using message = 'no such survey question';
  end if;
  saved_id := private.write_profile_field(
    actor_org, p_id, null, p_type, p_label, p_help, 'normal', p_required, p_options, p_settings, form_id);
  if p_id is null then
    perform public.place_field(saved_id, 'custom_form', p_screen_id::text, coalesce(p_required, false));
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'survey.question_save', 'profile_field', saved_id,
          jsonb_build_object('survey', form_id, 'type', p_type));
  return saved_id;
end;
$$;
revoke all on function public.save_survey_question(uuid, uuid, text, jsonb, jsonb, boolean, jsonb, jsonb) from public, anon;
grant execute on function public.save_survey_question(uuid, uuid, text, jsonb, jsonb, boolean, jsonb, jsonb) to authenticated;

-- A survey's activity and closing time (RAPP-929).
create or replace function public.save_survey_settings(p_form_id uuid, p_event_id uuid, p_closes_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
begin
  if p_event_id is not null
     and not exists (select 1 from public.events e where e.id = p_event_id and e.org_id = actor_org) then
    raise no_data_found using message = 'no such activity';
  end if;
  update public.custom_forms
     set event_id = p_event_id, closes_at = p_closes_at, updated_at = now()
   where id = p_form_id and org_id = actor_org and kind = 'survey';
  if not found then
    raise no_data_found using message = 'no such survey';
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'survey.settings_save', 'custom_form', p_form_id,
          jsonb_build_object('event', p_event_id, 'closes_at', p_closes_at));
end;
$$;
revoke all on function public.save_survey_settings(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.save_survey_settings(uuid, uuid, timestamptz) to authenticated;

-- 6. Her surveys ------------------------------------------------------------------------------------

-- The surveys waiting for her, each as the version she was asked (RAPP-929).
create or replace function public.my_surveys()
returns table (
  response_id uuid,
  form_id uuid,
  version integer,
  name jsonb,
  event_id uuid,
  closes_at timestamptz,
  asked_at timestamptz,
  content jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, f.id, v.version, v.content -> 'name', f.event_id, f.closes_at, r.asked_at, v.content
    from public.custom_form_responses r
    join public.custom_forms f on f.id = r.form_id
    join public.custom_form_versions v on v.form_id = f.id and v.version = r.version
   where r.profile_id = (select auth.uid()) and r.status = 'pending'
     and f.kind = 'survey' and not f.is_archived
     and (f.closes_at is null or f.closes_at > now())
     and jsonb_array_length(v.content -> 'screens') > 0
   order by f.closes_at nulls last, r.asked_at, r.id;
$$;
revoke all on function public.my_surveys() from public, anon;
grant execute on function public.my_surveys() to authenticated;

-- Her answers to a survey, kept with the response and never on her record (RAPP-929).
create or replace function public.complete_survey(p_response_id uuid, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  response public.custom_form_responses;
  form public.custom_forms;
  asked jsonb;
  placement jsonb;
  asked_field uuid;
  answer jsonb;
  question_type text;
  live_options text[];
  answers jsonb := coalesce(nullif(p_answers, 'null'::jsonb), '{}'::jsonb);
begin
  select * into response from public.custom_form_responses where id = p_response_id for update;
  if response.id is null or response.profile_id is distinct from caller then
    raise insufficient_privilege using message = 'a survey is answered by the player it asks';
  end if;
  select * into form from public.custom_forms where id = response.form_id;
  if form.kind is distinct from 'survey' or form.is_archived then
    raise insufficient_privilege using message = 'this survey is not asked now';
  end if;
  if response.status <> 'pending' then
    raise check_violation using message = 'the survey is already answered';
  end if;
  if form.closes_at is not null and form.closes_at <= now() then
    raise check_violation using message = 'the survey is closed';
  end if;
  if jsonb_typeof(answers) <> 'object' then
    raise invalid_parameter_value using message = 'the answers are an object by question';
  end if;
  select v.content into asked
    from public.custom_form_versions v where v.form_id = form.id and v.version = response.version;
  if asked is null then
    raise insufficient_privilege using message = 'this survey is not asked now';
  end if;
  -- Only the questions of the version she was asked.
  if exists (select 1 from jsonb_object_keys(answers) k
              where not exists (select 1 from jsonb_array_elements(asked -> 'placements') p
                                 where p ->> 'field_id' = k)) then
    raise invalid_parameter_value using message = 'an answer to a question the survey does not ask';
  end if;
  for placement in select value from jsonb_array_elements(asked -> 'placements') loop
    asked_field := (placement ->> 'field_id')::uuid;
    answer := nullif(answers -> (placement ->> 'field_id'), 'null'::jsonb);
    if answer is null then
      if coalesce((placement ->> 'required')::boolean, false) then
        raise check_violation using message = 'a required question has no answer';
      end if;
      continue;
    end if;
    question_type := placement -> 'field' ->> 'question_type';
    select coalesce(array_agg(o ->> 'id'), '{}') into live_options
      from jsonb_array_elements(coalesce(placement -> 'field' -> 'options', '[]'::jsonb)) o;
    answer := private.custom_answer_tidied(question_type, answer);
    if not private.custom_answer_value_valid(
         question_type, coalesce(placement -> 'field' -> 'settings', '{}'::jsonb), answer, live_options) then
      raise check_violation using message = 'an answer does not fit its question';
    end if;
    insert into public.survey_answers (response_id, field_id, org_id, profile_id, value)
    values (response.id, asked_field, response.org_id, response.profile_id, answer)
    on conflict (response_id, field_id) do update set value = excluded.value;
  end loop;
  update public.custom_form_responses
     set status = 'done', answered_at = now(), answered_by = caller, filled_by = 'player'
   where id = response.id;
end;
$$;
revoke all on function public.complete_survey(uuid, jsonb) from public, anon;
grant execute on function public.complete_survey(uuid, jsonb) to authenticated;

-- 7. The results ------------------------------------------------------------------------------------

-- Each answered response of a survey with its answers, for the team (RAPP-929).
create or replace function public.survey_results(p_form_id uuid)
returns table (
  response_id uuid,
  profile_id uuid,
  display_name text,
  member_number integer,
  version integer,
  answered_at timestamptz,
  answers jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
begin
  if not ((select public.has_permission('participants.view'))
          or (select public.has_permission('surveys.results'))) then
    raise insufficient_privilege using message = 'survey results are read by the team';
  end if;
  if not exists (select 1 from public.custom_forms f
                  where f.id = p_form_id and f.org_id = actor_org and f.kind = 'survey') then
    raise no_data_found using message = 'no such survey';
  end if;
  return query
  select r.id, r.profile_id,
         nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
         p.member_number, r.version, r.answered_at,
         coalesce((select jsonb_object_agg(a.field_id::text, a.value)
                     from public.survey_answers a where a.response_id = r.id), '{}'::jsonb)
    from public.custom_form_responses r
    join public.profiles p on p.id = r.profile_id
   where r.form_id = p_form_id and r.status = 'done'
   order by r.answered_at desc, r.id;
end;
$$;
revoke all on function public.survey_results(uuid) from public, anon;
grant execute on function public.survey_results(uuid) to authenticated;
