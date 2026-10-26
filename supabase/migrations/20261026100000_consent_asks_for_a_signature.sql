-- A consent can ask for her signature; the signature type goes away (RAPP-671).
--
-- WHY
--
-- A signature always signs a text, so a signature question with no text says
-- nothing. A consent without a signature is still useful (contact by
-- WhatsApp). So there is one answer type, the consent: the text to accept, a
-- tick, and a setting `requires_signature`. With it on, she ticks and then
-- signs with her finger under the tick.
--
-- WHAT THIS MIGRATION DOES
--
--   1. Consent settings take an optional boolean `requires_signature`.
--   2. A consent that asks for a signature stores
--      `{"accepted": true, "signature": <strokes>, "signed_on": "YYYY-MM-DD"}`,
--      the strokes in the format of the authorization pad. The server stamps
--      `signed_on` (Europe/Madrid) when the drawing is new and keeps the day of
--      a drawing it already holds. A consent without it stores `true`, as
--      before.
--   3. Such a consent follows the old signature rules: only she answers it
--      (`p_source = 'player'`), it is never placed on the entity form, staff
--      never write it. `private.field_is_hers_only` says so for a file and for
--      such a consent, in one place.
--   4. A consent she already answered keeps that answer when the setting
--      changes: an unchanged answer saved again is left as it is, so a tick
--      given before the switch went on stays. Only a new answer needs the
--      signature.
--   5. Every signature field becomes a consent with the switch on, its label
--      as the consent text, and every answer to it the new shape, signed on the
--      day it was answered.
--   6. Exports and the search text read a signed consent as
--      "Acceptada, signada el DD/MM/YYYY".
--
-- The season authorization signing (`authorization_signatures`, `p_signing`)
-- is a separate flow and is not touched.

-- 1. Who answers a field: only she gives a file, or a consent she signs.
create or replace function private.field_is_hers_only(p_type text, p_settings jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_type = 'file_upload'
    or (p_type = 'consent' and coalesce(p_settings -> 'requires_signature' = 'true'::jsonb, false));
$$;
revoke all on function private.field_is_hers_only(text, jsonb) from public, anon, authenticated;

-- 2. A consent's settings: its text, and whether it asks for her signature.
create or replace function private.custom_question_settings_valid(p_type text, p_settings jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  low numeric;
  high numeric;
begin
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    return false;
  end if;
  case p_type
    when 'number' then
      if p_settings - array['integer', 'min', 'max'] <> '{}'::jsonb
         or jsonb_typeof(p_settings -> 'integer') is distinct from 'boolean' then
        return false;
      end if;
      if p_settings ? 'min' then
        if jsonb_typeof(p_settings -> 'min') <> 'number' then return false; end if;
        low := (p_settings ->> 'min')::numeric;
        if abs(low) > 1000000000 then return false; end if;
      end if;
      if p_settings ? 'max' then
        if jsonb_typeof(p_settings -> 'max') <> 'number' then return false; end if;
        high := (p_settings ->> 'max')::numeric;
        if abs(high) > 1000000000 then return false; end if;
      end if;
      return low is null or high is null or low <= high;
    when 'date' then
      if p_settings - array['min_age', 'max_age'] <> '{}'::jsonb
         or (p_settings ? 'min_age' and not private.json_int_between(p_settings -> 'min_age', 0, 120))
         or (p_settings ? 'max_age' and not private.json_int_between(p_settings -> 'max_age', 0, 120)) then
        return false;
      end if;
      return not (p_settings ? 'min_age' and p_settings ? 'max_age')
        or (p_settings ->> 'min_age')::integer <= (p_settings ->> 'max_age')::integer;
    when 'item_list' then
      return p_settings - 'max_items' = '{}'::jsonb
        and private.json_int_between(p_settings -> 'max_items', 1, 50);
    when 'consent' then
      return p_settings - array['text', 'requires_signature'] = '{}'::jsonb
        and private.catalan_text_valid(p_settings -> 'text')
        and (not (p_settings ? 'requires_signature')
             or jsonb_typeof(p_settings -> 'requires_signature') = 'boolean');
    when 'file_upload' then
      return p_settings - 'accept' = '{}'::jsonb
        and (p_settings ->> 'accept') in ('photo', 'document')
        and jsonb_typeof(p_settings -> 'accept') = 'string';
    else
      return p_settings = '{}'::jsonb;
  end case;
end;
$$;

-- 3. The answer check: a signed consent is the tick, her drawing and its day.
-- `customAnswerSchema` in packages/shared states the same rules.
create or replace function private.custom_answer_value_valid(
  p_type text, p_settings jsonb, p_value jsonb, p_live_options text[])
returns boolean
language plpgsql
stable
set search_path = ''
as $$
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
    when 'consent' then
      if not private.field_is_hers_only(p_type, p_settings) then
        return p_value = 'true'::jsonb;
      end if;
      -- She ticks and signs (RAPP-671): the day is a calendar day when present.
      if kind <> 'object'
         or p_value - array['accepted', 'signature', 'signed_on'] <> '{}'::jsonb
         or p_value -> 'accepted' is distinct from 'true'::jsonb
         or not private.app_signature_valid(p_value -> 'signature') then
        return false;
      end if;
      if not (p_value ? 'signed_on') then
        return true;
      end if;
      if jsonb_typeof(p_value -> 'signed_on') <> 'string'
         or (p_value ->> 'signed_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        return false;
      end if;
      begin
        date_value := (p_value ->> 'signed_on')::date;
      exception when others then
        return false;
      end;
      return to_char(date_value, 'YYYY-MM-DD') = p_value ->> 'signed_on';
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
    else
      return false;
  end case;
end;
$$;

-- 4. An answer in words: a signed consent says the day she signed.
create or replace function private.custom_answer_text(p_field public.profile_fields, p_value jsonb)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_field.question_type in ('single_choice', 'multiple_choice', 'search_choice') then (
      select string_agg(
               coalesce(o.label ->> 'ca', chosen.id)
                 || case when o.is_archived then ' (arxivada)' else '' end,
               '; ' order by o.sort_order)
        from (select jsonb_array_elements_text(
                       case when jsonb_typeof(p_value) = 'array' then p_value
                            else jsonb_build_array(p_value) end) as id) chosen
        left join public.custom_question_options o
          on o.id::text = chosen.id and o.question_id = p_field.id)
    when p_field.question_type in ('yes_no_maybe', 'yes_no') then
      case p_value #>> '{}' when 'yes' then 'Sí' when 'no' then 'No' when 'maybe' then 'Potser'
                            else p_value #>> '{}' end
    when p_field.question_type = 'date' and jsonb_typeof(p_value) = 'string' then
      to_char((p_value #>> '{}')::date, 'DD/MM/YYYY')
    when p_field.question_type = 'item_list' and jsonb_typeof(p_value) = 'array' then (
      select string_agg(item, '; ' order by position)
        from jsonb_array_elements_text(p_value) with ordinality as listed(item, position))
    when p_field.question_type = 'consent' and jsonb_typeof(p_value) = 'object' then
      case when p_value ->> 'signed_on' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
           then 'Acceptada, signada el ' || to_char((p_value ->> 'signed_on')::date, 'DD/MM/YYYY')
           else 'Acceptada, signada' end
    when p_field.question_type = 'consent' then
      case when p_value = 'true'::jsonb then 'Sí' else 'No' end
    when p_field.question_type = 'file_upload' then 'Fitxer: ' || coalesce(p_value ->> 'name', '')
    else p_value #>> '{}'
  end;
$$;

-- 5. Saving an answer: a file or a signed consent is hers to give; a signed
-- consent gets its day; an unchanged consent is left as it is.
create or replace function private.write_custom_answer(
  p_profile_id uuid, p_field public.profile_fields, p_value jsonb, p_source text,
  p_answered_by uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_seasonal boolean := private.field_is_seasonal(p_field.id);
  season uuid := case when is_seasonal then private.current_season_id(p_field.org_id) end;
  key uuid := coalesce(season, '00000000-0000-0000-0000-000000000000'::uuid);
  is_empty boolean := private.custom_answer_is_empty(p_value);
  stored jsonb := private.custom_answer_tidied(p_field.question_type, p_value);
  is_signed boolean := p_field.question_type = 'consent'
                       and private.field_is_hers_only(p_field.question_type, p_field.settings);
  previous jsonb;
  -- Her own answers name nobody; a staff write with no name given is the
  -- signed-in team member's.
  author uuid := case
    when p_source = 'player' then null
    when p_source = 'staff' then coalesce(p_answered_by, (select auth.uid()))
    else p_answered_by
  end;
begin
  -- Her names stay on her account (D2): chat, lists, invites and erasure read them there.
  if p_field.system_key in ('first_name', 'last_name') then
    raise check_violation using message = 'her names stay on her account';
  end if;
  if private.field_is_hers_only(p_field.question_type, p_field.settings) and p_source <> 'player'
     and not private.is_test_player(p_profile_id) then
    raise insufficient_privilege using message = 'a file or a signature is hers to give';
  end if;
  -- With no current season there is nowhere to keep a seasonal answer. Her
  -- registration never stops on it; staff are told.
  if is_seasonal and season is null then
    if p_source = 'player' then
      return;
    end if;
    raise check_violation using message = 'a seasonal question needs a current season';
  end if;
  if is_empty then
    delete from public.custom_answers
     where profile_id = p_profile_id and question_id = p_field.id and season_key = key;
    return;
  end if;
  if p_field.question_type = 'consent' then
    select coalesce(a.value, (public.decrypt_field(a.value_encrypted))::jsonb) into previous
      from public.custom_answers a
     where a.profile_id = p_profile_id and a.question_id = p_field.id and a.season_key = key;
    -- A consent she already gave stays as it is when the setting changes
    -- (RAPP-671): only a new answer needs her signature.
    if previous is not null and previous = stored then
      return;
    end if;
  end if;
  if not private.custom_answer_valid(p_field, stored) then
    raise check_violation using message = 'the answer does not fit the question';
  end if;
  -- The day she signed, by the server: kept for a drawing it already holds.
  if is_signed then
    stored := (stored - 'signed_on') || jsonb_build_object('signed_on',
      case when jsonb_typeof(previous) = 'object' and previous -> 'signature' = stored -> 'signature'
                and previous ? 'signed_on'
           then previous -> 'signed_on'
           else to_jsonb(to_char((now() at time zone 'Europe/Madrid')::date, 'YYYY-MM-DD')) end);
  end if;
  -- Her file lives in her own private folder of her organization.
  if p_field.question_type = 'file_upload'
     and (split_part(stored ->> 'key', '/', 1) <> p_field.org_id::text
          or split_part(stored ->> 'key', '/', 3) <> p_profile_id::text) then
    raise check_violation using message = 'the answer does not fit the question';
  end if;
  insert into public.custom_answers (
    profile_id, question_id, season_key, season_id, org_id, value, value_encrypted, source,
    answered_by, answered_at)
  values (
    p_profile_id, p_field.id, key, season, p_field.org_id,
    case when p_field.privacy = 'sensitive' then null else stored end,
    case when p_field.privacy = 'sensitive' then public.encrypt_field(stored::text) end,
    p_source, author, now())
  on conflict (profile_id, question_id, season_key) do update
    set value = excluded.value, value_encrypted = excluded.value_encrypted,
        source = excluded.source, answered_by = excluded.answered_by, answered_at = now();
end;
$$;

-- 6. Placing a field: a file or a signed consent never goes on the entity form.
create or replace function public.place_field(
  p_field_id uuid, p_surface text, p_screen_key text default null, p_required boolean default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  field public.profile_fields;
  saved_id uuid;
begin
  select * into field from public.profile_fields where id = p_field_id and org_id = actor_org and not is_archived;
  if field.id is null then
    raise no_data_found using message = 'no such question';
  end if;
  if p_surface is null or p_surface not in ('onboarding', 'entity_form', 'season') then
    raise check_violation using message = 'a field is placed on onboarding, the entity form or the season';
  end if;
  -- Her names live on her account: her identity screen and the entity form ask them.
  if private.is_name_field(field)
     and not (p_surface = 'entity_form' or (p_surface = 'onboarding' and p_screen_key = 'identity')) then
    raise check_violation using message = 'her names are asked on her identity screen';
  end if;
  if p_surface = 'onboarding' then
    if p_screen_key is null or not (
         exists (select 1 from private.system_profile_fields() s where s.screen = p_screen_key)
         or (private.is_uuid_text(p_screen_key)
             and exists (select 1 from public.intake_screens s
                          where s.id = p_screen_key::uuid and s.org_id = actor_org
                            and not s.is_archived))) then
      raise no_data_found using message = 'no such screen';
    end if;
  elsif p_screen_key is not null then
    raise check_violation using message = 'only an onboarding placement names a screen';
  end if;
  if private.field_is_hers_only(field.question_type, field.settings) and p_surface = 'entity_form' then
    raise check_violation using message = 'a file or a signature is asked of her only';
  end if;
  if exists (select 1 from public.field_placements where field_id = p_field_id and surface = p_surface) then
    raise unique_violation using message = 'the field is already asked there';
  end if;

  insert into public.field_placements (org_id, field_id, surface, screen_key, sort_order, required)
  values (actor_org, p_field_id, p_surface, p_screen_key,
          coalesce((select max(p.sort_order) + 1 from public.field_placements p
                     where p.org_id = actor_org and p.surface = p_surface
                       and p.screen_key is not distinct from p_screen_key), 0),
          coalesce(p_required, field.default_required))
  returning id into saved_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.field_place', 'profile_field', p_field_id,
          jsonb_build_object('placement_id', saved_id, 'surface', p_surface, 'screen', p_screen_key));
  return saved_id;
end;
$$;

-- 7. Saving a field: a consent that starts asking for her signature leaves the entity form first.
create or replace function private.write_profile_field(
  p_org_id uuid, p_id uuid, p_section_id uuid, p_type text, p_label jsonb, p_help jsonb,
  p_privacy text, p_default_required boolean, p_options jsonb, p_settings jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
    -- Her names (D2): their name and help per language, nothing else.
    if private.is_name_field(existing) then
      if existing.question_type <> p_type or existing.privacy <> p_privacy then
        raise check_violation using message = 'her names keep their type and privacy';
      end if;
      if jsonb_array_length(options) > 0 then
        raise check_violation using message = 'only a choice question has options';
      end if;
      update public.profile_fields
         set label = p_label, help = nullif(p_help, 'null'::jsonb),
             section_id = coalesce(p_section_id, section_id),
             sort_order = case when p_section_id is null or p_section_id = section_id then sort_order
                               else coalesce((select max(f.sort_order) + 1 from public.profile_fields f
                                               where f.section_id = p_section_id), 0) end,
             updated_at = now()
       where id = p_id;
      return p_id;
    end if;
  end if;

  if not (p_type = any (private.custom_question_types())) then
    raise check_violation using message = 'not a question type';
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
    if p_section_id is null then
      raise no_data_found using message = 'no such section';
    end if;
    insert into public.profile_fields (
      org_id, section_id, kind, question_type, label, help, privacy, default_required, settings,
      sort_order, created_by)
    values (
      p_org_id, p_section_id, 'custom', p_type, p_label, nullif(p_help, 'null'::jsonb), p_privacy,
      coalesce(p_default_required, false), clean_settings,
      coalesce((select max(f.sort_order) + 1 from public.profile_fields f where f.section_id = p_section_id), 0),
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
           section_id = coalesce(p_section_id, section_id),
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
$$;

-- 8. Every signature field becomes a consent that asks for her signature: its
-- label is the text she accepts. Its answers take the new shape, signed on
-- the day she answered. Staging holds none; the QA seed holds one.
update public.profile_fields
   set question_type = 'consent',
       settings = jsonb_build_object('text', label, 'requires_signature', true),
       updated_at = now()
 where question_type = 'signature';

update public.custom_answers a
   set value = jsonb_build_object(
         'accepted', true, 'signature', a.value,
         'signed_on', to_char((a.answered_at at time zone 'Europe/Madrid')::date, 'YYYY-MM-DD'))
  from public.profile_fields f
 where f.id = a.question_id and f.question_type = 'consent'
   and a.value is not null and jsonb_typeof(a.value) = 'array';

update public.custom_answers a
   set value_encrypted = public.encrypt_field(jsonb_build_object(
         'accepted', true, 'signature', (public.decrypt_field(a.value_encrypted))::jsonb,
         'signed_on', to_char((a.answered_at at time zone 'Europe/Madrid')::date, 'YYYY-MM-DD'))::text)
  from public.profile_fields f
 where f.id = a.question_id and f.question_type = 'consent'
   and a.value_encrypted is not null
   and jsonb_typeof((public.decrypt_field(a.value_encrypted))::jsonb) = 'array';

-- 9. The types a field can take: the signature is gone.
create or replace function private.custom_question_types()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['short_text', 'long_text', 'yes_no_maybe', 'single_choice', 'multiple_choice',
               'number', 'date', 'yes_no', 'phone', 'email', 'search_choice', 'item_list',
               'consent', 'file_upload', 'country', 'municipality']::text[];
$$;
