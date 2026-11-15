-- Every field is edited on Dades de les jugadores, answered ones included (RAPP-665, D8).
--
-- WHY
--
-- Step 6 of 7 (RAPP-660 to RAPP-666). Fabián, 2026-10-25: Dades de les
-- jugadores decides which data Ramassà gathers, the kind of answer for each and
-- how private it is, for every field. Until now `write_profile_field` refused a
-- new answer type on any field, a new privacy level on an app field or on any
-- answered field, and options or archiving on an app field. `place_field` and
-- `remove_placement` kept an app field on its own screen. Her names are the one
-- exception (D2): renamed, never retyped, never made private, never archived.
--
-- WHAT CHANGES
--
--   1. `private.write_profile_field` takes a new type, privacy level and
--      options on every field but her names. A field that has answers is
--      converted in the same transaction (`private.apply_field_change`):
--        - what fits the new type is converted (`private.converted_answer`):
--          a choice to text keeps its Catalan label, text to a number when it
--          reads as one, one choice to several keeps the option, a choice
--          matches an option by id, by key or by a label in any language;
--        - what does not fit leaves the field and is set aside in the audit
--          log, one row per answer (`intake.answer_set_aside`), its value
--          always encrypted;
--        - every kept answer is stored again at the new level through
--          `public.encrypt_field` (Sensitive) or in clear (Normal, Personal);
--        - a one-choice field that stops being one frees the fields that
--          opened on one of its options;
--        - one `intake.field_change` audit row holds the counts, never a value.
--   2. `public.preview_field_change(field, type, privacy, options, settings)`
--      returns the same counts before anything is saved, the privacy effect
--      (answers to encrypt or decrypt, the permission that reads before and
--      after, how many team members gain or lose access) and the registry's
--      features the change affects (D7). It checks the same permission as
--      saving.
--   3. `archive_profile_field` archives every field but her names.
--   4. `place_field` and `remove_placement` place an app field on any screen,
--      the entity form and the season form, like any field. Her names stay on
--      her identity screen and on the entity form.
--   5. Staff option wording of an app question lands on the field's options
--      (a trigger on `builtin_question_overrides`), so the field is the one
--      place an option is named. What is stored is folded in once.
--   6. `anonymize_participant` also deletes what a field change set aside
--      about her.
--
-- Docs: https://www.postgresql.org/docs/17/plpgsql-control-structures.html
-- (FOR loops over queries, RETURN QUERY), https://www.postgresql.org/docs/17/pgcrypto.html
-- (pgp_sym_encrypt through public.encrypt_field), https://supabase.com/docs/guides/database/functions
-- (security definer functions with an empty search path).

-- 1. Her names stay; every other field may be archived ------------------------------------------------------

alter table public.profile_fields drop constraint profile_fields_builtin_stays;
alter table public.profile_fields
  add constraint profile_fields_names_stay
  check (not is_archived or system_key is null or system_key not in ('first_name', 'last_name'));

create or replace function private.is_name_field(p_field public.profile_fields)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_field.system_key in ('first_name', 'last_name'), false);
$$;
revoke all on function private.is_name_field(public.profile_fields) from public, anon, authenticated;

-- The permission that reads a privacy level (D9).
create or replace function private.privacy_permission(p_privacy text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_privacy
    when 'normal' then 'participants.view'
    when 'personal' then 'participants.view_personal'
    when 'sensitive' then 'participants.view_sensitive'
  end;
$$;
revoke all on function private.privacy_permission(text) from public, anon, authenticated;

-- 2. Converting an answer ------------------------------------------------------------------------------------

-- An answer as a list of items: each with the option it chose (id and key),
-- and its text. A choice reads its Catalan label; yes and no read in Catalan.
create or replace function private.answer_items(p_type text, p_value jsonb)
returns table (option_id text, option_key text, item_text text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  kind text := jsonb_typeof(p_value);
begin
  if p_value is null or kind = 'null' then
    return;
  end if;
  if p_type in ('short_text', 'long_text', 'country', 'municipality', 'phone', 'email', 'date') then
    if kind = 'string' then
      return query select null::text, null::text, p_value #>> '{}';
    end if;
  elsif p_type = 'number' then
    if kind = 'number' then
      return query select null::text, null::text, p_value #>> '{}';
    end if;
  elsif p_type in ('yes_no', 'yes_no_maybe') then
    if kind = 'string' and (p_value #>> '{}') in ('yes', 'no', 'maybe') then
      return query select null::text, p_value #>> '{}',
        case p_value #>> '{}' when 'yes' then 'Sí' when 'no' then 'No' else 'Potser' end;
    end if;
  elsif p_type in ('single_choice', 'search_choice') then
    if kind = 'string' then
      return query select o.id::text, o.key, o.label ->> 'ca'
        from public.custom_question_options o where o.id::text = p_value #>> '{}';
    end if;
  elsif p_type = 'multiple_choice' then
    if kind = 'array' then
      return query select o.id::text, o.key, o.label ->> 'ca'
        from jsonb_array_elements_text(p_value) with ordinality as e(value, position)
        join public.custom_question_options o on o.id::text = e.value
       order by e.position;
    end if;
  elsif p_type = 'item_list' then
    if kind = 'array' then
      return query select null::text, null::text, e.value
        from jsonb_array_elements_text(p_value) with ordinality as e(value, position)
       order by e.position;
    end if;
  end if;
  -- A consent, a file or a signature has no text another type could take.
  return;
end;
$$;
revoke all on function private.answer_items(text, jsonb) from public, anon, authenticated;

-- The option an item matches, as its id, or `new:<position>` for an option the
-- preview offers that is not saved yet. The same option first, then its key,
-- then a label in any language.
create or replace function private.matching_option(
  p_options jsonb, p_option_id text, p_option_key text, p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(o ->> 'id', 'new:' || (x.position - 1))
    from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) with ordinality as x(o, position)
   where (p_option_id is not null and o ->> 'id' = p_option_id)
      or (p_option_key is not null and o ->> 'key' = p_option_key)
      or (p_text is not null and jsonb_typeof(o -> 'label') = 'object'
          and exists (select 1 from jsonb_each_text(o -> 'label') l
                       where lower(btrim(l.value)) = lower(btrim(p_text))))
   order by (p_option_id is not null and o ->> 'id' = p_option_id) desc,
            (p_option_key is not null and o ->> 'key' = p_option_key) desc,
            x.position
   limit 1;
$$;
revoke all on function private.matching_option(jsonb, text, text, text) from public, anon, authenticated;

-- An answer converted to another type, or null when it does not fit. The
-- options are the target's live options as [{id, key, label}].
create or replace function private.converted_answer(
  p_from_type text, p_value jsonb, p_to_type text, p_to_settings jsonb, p_to_options jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ids text[];
  keys text[];
  texts text[];
  item_count integer;
  token text;
  result jsonb;
  matched text;
  position_index integer;
  option_tokens text[] := '{}';
  is_choice boolean := p_to_type in ('single_choice', 'multiple_choice', 'search_choice');
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;
  if p_from_type = p_to_type then
    return p_value;
  end if;
  select coalesce(array_agg(a.option_id), '{}'), coalesce(array_agg(a.option_key), '{}'),
         coalesce(array_agg(a.item_text), '{}'), count(*)
    into ids, keys, texts, item_count
    from private.answer_items(p_from_type, p_value) a;
  if item_count = 0 then
    return null;
  end if;
  if is_choice then
    option_tokens := array(
      select coalesce(o ->> 'id', 'new:' || (x.position - 1))
        from jsonb_array_elements(coalesce(p_to_options, '[]'::jsonb)) with ordinality as x(o, position));
  end if;

  if p_to_type in ('short_text', 'long_text') then
    result := to_jsonb(array_to_string(texts, ', '));
  elsif p_to_type = 'item_list' then
    result := to_jsonb(array(
      select btrim(t.value) from unnest(texts) with ordinality as t(value, position)
       group by btrim(t.value) order by min(t.position)));
  elsif p_to_type = 'multiple_choice' then
    result := '[]'::jsonb;
    for position_index in 1..item_count loop
      matched := private.matching_option(
        p_to_options, ids[position_index], keys[position_index], texts[position_index]);
      if matched is null then
        return null;
      end if;
      if not result ? matched then
        result := result || to_jsonb(matched);
      end if;
    end loop;
  elsif item_count <> 1 then
    -- Every other type holds one answer.
    return null;
  elsif p_to_type = 'number' then
    token := replace(btrim(texts[1]), ',', '.');
    if token !~ '^-?[0-9]{1,12}(\.[0-9]{1,6})?$' then
      return null;
    end if;
    result := to_jsonb(token::numeric);
  elsif p_to_type = 'date' then
    result := to_jsonb(btrim(texts[1]));
  elsif p_to_type = 'email' then
    result := to_jsonb(lower(btrim(texts[1])));
  elsif p_to_type = 'phone' then
    token := regexp_replace(btrim(texts[1]), '[[:space:]().-]', '', 'g');
    if token ~ '^00' then
      token := '+' || substr(token, 3);
    elsif token ~ '^[6-9][0-9]{8}$' then
      -- A Spanish number without its code, as the phone input reads it.
      token := '+34' || token;
    end if;
    result := to_jsonb(token);
  elsif p_to_type = 'country' then
    select c into token from unnest(private.country_names()) c where lower(c) = lower(btrim(texts[1])) limit 1;
    if token is null then
      return null;
    end if;
    result := to_jsonb(token);
  elsif p_to_type = 'municipality' then
    select m.canonical into token from public.municipality_catalog m
     where lower(m.canonical) = lower(btrim(texts[1])) limit 1;
    if token is null then
      return null;
    end if;
    result := to_jsonb(token);
  elsif p_to_type in ('yes_no', 'yes_no_maybe') then
    token := coalesce(keys[1], case lower(btrim(texts[1]))
      when 'sí' then 'yes' when 'si' then 'yes' when 'yes' then 'yes' when 'no' then 'no'
      when 'potser' then 'maybe' when 'maybe' then 'maybe' end);
    if token is null then
      return null;
    end if;
    result := to_jsonb(token);
  elsif p_to_type in ('single_choice', 'search_choice') then
    matched := private.matching_option(p_to_options, ids[1], keys[1], texts[1]);
    if matched is null then
      return null;
    end if;
    result := to_jsonb(matched);
  else
    return null;
  end if;

  return case
    when private.custom_answer_value_valid(
           p_to_type, coalesce(p_to_settings, '{}'::jsonb),
           private.custom_answer_tidied(p_to_type, result), option_tokens)
      then private.custom_answer_tidied(p_to_type, result)
  end;
end;
$$;
revoke all on function private.converted_answer(text, jsonb, text, jsonb, jsonb) from public, anon, authenticated;

-- The live options of a field as the conversion reads them.
create or replace function private.field_options_json(p_field_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id::text, 'key', o.key, 'label', o.label)
                            order by o.sort_order, o.id), '[]'::jsonb)
    from public.custom_question_options o
   where o.question_id = p_field_id and not o.is_archived;
$$;
revoke all on function private.field_options_json(uuid) from public, anon, authenticated;

-- 3. Applying a change to the answers ------------------------------------------------------------------------

-- Converts and re-stores every answer of a field after its type or privacy
-- changed, in the caller's transaction. Returns the counts, never a value.
create or replace function private.apply_field_change(p_old public.profile_fields, p_new public.profile_fields)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  type_changed boolean := p_old.question_type <> p_new.question_type;
  options jsonb := private.field_options_json(p_new.id);
  actor uuid := (select auth.uid());
  answer record;
  plain jsonb;
  converted jsonb;
  total integer := 0;
  kept integer := 0;
  set_aside integer := 0;
  encrypted integer := 0;
  decrypted integer := 0;
begin
  for answer in
    select a.profile_id, a.question_id, a.season_key, a.season_id, a.value, a.value_encrypted, a.source,
           a.answered_at
      from public.custom_answers a where a.question_id = p_new.id for update
  loop
    total := total + 1;
    plain := coalesce(answer.value, public.decrypt_field(answer.value_encrypted)::jsonb);
    converted := case when type_changed
      then private.converted_answer(p_old.question_type, plain, p_new.question_type, p_new.settings, options)
      else plain end;
    if converted is null then
      set_aside := set_aside + 1;
      -- Her answer history: out of the field, kept encrypted whatever its level.
      insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
      values (p_new.org_id, actor, 'intake.answer_set_aside', 'profile', answer.profile_id,
              jsonb_build_object('field_id', p_new.id, 'season_id', answer.season_id,
                                 'type', p_old.question_type, 'source', answer.source,
                                 'answered_at', answer.answered_at,
                                 'value_encrypted', encode(public.encrypt_field(plain::text), 'base64')));
      delete from public.custom_answers
       where profile_id = answer.profile_id and question_id = answer.question_id
         and season_key = answer.season_key;
    else
      kept := kept + 1;
      if p_new.privacy = 'sensitive' and answer.value is not null then
        encrypted := encrypted + 1;
      elsif p_new.privacy <> 'sensitive' and answer.value_encrypted is not null then
        decrypted := decrypted + 1;
      end if;
      update public.custom_answers
         set value = case when p_new.privacy = 'sensitive' then null else converted end,
             value_encrypted = case when p_new.privacy = 'sensitive'
                                    then public.encrypt_field(converted::text) end
       where profile_id = answer.profile_id and question_id = answer.question_id
         and season_key = answer.season_key;
    end if;
  end loop;

  -- A referral not yet joined keeps its answers encrypted at every level: only the type matters.
  for answer in
    select r.referral_id, r.value_encrypted from public.referral_custom_answers r
     where r.question_id = p_new.id for update
  loop
    total := total + 1;
    if not type_changed then
      kept := kept + 1;
      continue;
    end if;
    plain := public.decrypt_field(answer.value_encrypted)::jsonb;
    converted := private.converted_answer(
      p_old.question_type, plain, p_new.question_type, p_new.settings, options);
    if converted is null then
      set_aside := set_aside + 1;
      insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
      values (p_new.org_id, actor, 'intake.answer_set_aside', 'entity_referral', answer.referral_id,
              jsonb_build_object('field_id', p_new.id, 'type', p_old.question_type, 'source', 'entity',
                                 'value_encrypted', answer.value_encrypted));
      delete from public.referral_custom_answers
       where referral_id = answer.referral_id and question_id = p_new.id;
    else
      kept := kept + 1;
      update public.referral_custom_answers
         set value_encrypted = public.encrypt_field(converted::text)
       where referral_id = answer.referral_id and question_id = p_new.id;
    end if;
  end loop;

  return jsonb_build_object(
    'type_from', p_old.question_type, 'type_to', p_new.question_type,
    'privacy_from', p_old.privacy, 'privacy_to', p_new.privacy,
    'answers', total, 'converted', kept, 'not_converted', set_aside,
    'encrypted', encrypted, 'decrypted', decrypted);
end;
$$;
revoke all on function private.apply_field_change(public.profile_fields, public.profile_fields)
  from public, anon, authenticated;

-- 4. Saving a field ------------------------------------------------------------------------------------------

create or replace function private.write_profile_field(
  p_org_id uuid, p_id uuid, p_section_id uuid, p_type text, p_label jsonb, p_help jsonb, p_privacy text,
  p_default_required boolean, p_options jsonb, p_settings jsonb)
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
  -- A file or a signature is hers to give: it never goes on the entity form.
  if p_id is not null and p_type in ('file_upload', 'signature')
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
revoke all on function private.write_profile_field(uuid, uuid, uuid, text, jsonb, jsonb, text, boolean, jsonb, jsonb)
  from public, anon, authenticated;

-- 5. Previewing a change -------------------------------------------------------------------------------------

create or replace function public.preview_field_change(
  p_field_id uuid, p_type text, p_privacy text, p_options jsonb default null, p_settings jsonb default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  field public.profile_fields;
  to_type text;
  to_privacy text;
  to_settings jsonb;
  options jsonb := '[]'::jsonb;
  type_changed boolean;
  answer record;
  plain jsonb;
  converted jsonb;
  total integer := 0;
  kept integer := 0;
  not_kept integer := 0;
  to_encrypt integer := 0;
  to_decrypt integer := 0;
  permission_before text;
  permission_after text;
begin
  select * into field from public.profile_fields where id = p_field_id and org_id = actor_org;
  if field.id is null then
    raise no_data_found using message = 'no such question';
  end if;
  to_type := coalesce(p_type, field.question_type);
  to_privacy := coalesce(p_privacy, field.privacy);
  if private.is_name_field(field) and (to_type <> field.question_type or to_privacy <> field.privacy) then
    raise check_violation using message = 'her names keep their type and privacy';
  end if;
  if not (to_type = any (private.custom_question_types())) then
    raise check_violation using message = 'not a question type';
  end if;
  if to_privacy not in ('normal', 'personal', 'sensitive') then
    raise check_violation using message = 'the privacy level is normal, personal or sensitive';
  end if;
  type_changed := to_type <> field.question_type;
  to_settings := coalesce(nullif(p_settings, 'null'::jsonb),
                          case when type_changed then '{}'::jsonb else field.settings end);
  if to_type in ('single_choice', 'multiple_choice', 'search_choice') then
    if nullif(p_options, 'null'::jsonb) is null then
      options := private.field_options_json(field.id);
    elsif jsonb_typeof(p_options) <> 'array' then
      raise check_violation using message = 'options must be a list';
    else
      -- A saved option keeps its key, so an answer still matches it by key.
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', saved.id::text, 'key', saved.key, 'label', x.o -> 'label') order by x.position), '[]'::jsonb)
        into options
        from jsonb_array_elements(p_options) with ordinality as x(o, position)
        left join public.custom_question_options saved
          on saved.question_id = field.id and saved.id::text = x.o ->> 'id';
    end if;
  end if;

  for answer in
    select a.value, a.value_encrypted, false as is_referral
      from public.custom_answers a where a.question_id = field.id
    union all
    select null::jsonb, r.value_encrypted, true from public.referral_custom_answers r where r.question_id = field.id
  loop
    total := total + 1;
    if not type_changed then
      converted := '"kept"'::jsonb;
    else
      plain := coalesce(answer.value, public.decrypt_field(answer.value_encrypted)::jsonb);
      converted := private.converted_answer(field.question_type, plain, to_type, to_settings, options);
    end if;
    if converted is null then
      not_kept := not_kept + 1;
    else
      kept := kept + 1;
      if not answer.is_referral then
        if to_privacy = 'sensitive' and answer.value is not null then
          to_encrypt := to_encrypt + 1;
        elsif to_privacy <> 'sensitive' and answer.value_encrypted is not null then
          to_decrypt := to_decrypt + 1;
        end if;
      end if;
    end if;
  end loop;

  permission_before := private.privacy_permission(field.privacy);
  permission_after := private.privacy_permission(to_privacy);
  return jsonb_build_object(
    'type_from', field.question_type, 'type_to', to_type,
    'privacy_from', field.privacy, 'privacy_to', to_privacy,
    'answers', total, 'converted', kept, 'not_converted', not_kept,
    'to_encrypt', to_encrypt, 'to_decrypt', to_decrypt,
    'permission_before', permission_before, 'permission_after', permission_after,
    -- Team members who will read these answers, or stop reading them.
    'readers_gaining', (
      select count(*) from public.profiles member
       where member.org_id = actor_org
         and private.profile_has_permission(member.id, permission_after)
         and not private.profile_has_permission(member.id, permission_before)),
    'readers_losing', (
      select count(*) from public.profiles member
       where member.org_id = actor_org
         and private.profile_has_permission(member.id, permission_before)
         and not private.profile_has_permission(member.id, permission_after)),
    -- The registry's features that read this field (D7), before and after.
    'features', coalesce((
      select jsonb_agg(jsonb_build_object(
               'feature', r.feature,
               'fits_now', field.question_type = any (r.accepted_types),
               'fits_after', to_type = any (r.accepted_types)) order by r.feature)
        from private.field_features() r where r.system_key = field.system_key), '[]'::jsonb),
    'conditions_cleared', case when field.question_type = 'single_choice' and to_type <> 'single_choice'
      then (select count(*) from public.profile_fields child where child.show_when_field_id = field.id)
      else 0 end);
end;
$$;
revoke all on function public.preview_field_change(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.preview_field_change(uuid, text, text, jsonb, jsonb) to authenticated;

-- 6. Archiving every field but her names ---------------------------------------------------------------------

create or replace function private.archive_field(p_org_id uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  field public.profile_fields;
begin
  select * into field from public.profile_fields where id = p_id and org_id = p_org_id for update;
  if field.id is null then
    raise no_data_found using message = 'no such question';
  end if;
  if private.is_name_field(field) then
    raise check_violation using message = 'her names are always asked';
  end if;
  update public.profile_fields set is_archived = true, updated_at = now() where id = p_id;
end;
$$;
revoke all on function private.archive_field(uuid, uuid) from public, anon, authenticated;

-- 7. An app field goes on any screen ------------------------------------------------------------------------

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
         exists (select 1 from private.wizard_screen_questions() w where w.screen = p_screen_key)
         or (private.is_uuid_text(p_screen_key)
             and exists (select 1 from public.intake_screens s
                          where s.id = p_screen_key::uuid and s.org_id = actor_org
                            and not s.is_archived))) then
      raise no_data_found using message = 'no such screen';
    end if;
  elsif p_screen_key is not null then
    raise check_violation using message = 'only an onboarding placement names a screen';
  end if;
  if field.question_type in ('file_upload', 'signature') and p_surface = 'entity_form' then
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
revoke all on function public.place_field(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.place_field(uuid, text, text, boolean) to authenticated;

create or replace function public.remove_placement(p_placement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  placement public.field_placements;
begin
  select p.* into placement from public.field_placements p where p.id = p_placement_id and p.org_id = actor_org;
  if placement.id is null then
    raise no_data_found using message = 'no such placement';
  end if;
  -- Her names never leave her identity screen, and a referral names her (RAPP-652).
  if exists (select 1 from public.profile_fields f where f.id = placement.field_id and private.is_name_field(f)) then
    raise check_violation using message = case when placement.surface = 'entity_form'
      then 'the entity form always asks her names' else 'her names are asked on her identity screen' end;
  end if;
  delete from public.field_placements where id = p_placement_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.placement_remove', 'profile_field', placement.field_id,
          jsonb_build_object('placement_id', p_placement_id, 'surface', placement.surface,
                             'screen', placement.screen_key));
end;
$$;
revoke all on function public.remove_placement(uuid) from public, anon, authenticated;
grant execute on function public.remove_placement(uuid) to authenticated;

-- 8. An app question's option wording lives on its field -----------------------------------------------------

-- Staff wording or hiding of an app question's options (the old override
-- path, still written by an older admin or an imported setup file) lands on
-- the options of the question's field and is not kept on the override.
create or replace function private.fold_option_overrides()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry record;
begin
  for entry in select key, value from jsonb_each(coalesce(new.option_overrides, '{}'::jsonb)) loop
    update public.custom_question_options o
       set label = case when jsonb_typeof(entry.value -> 'label') = 'object'
                             and private.catalan_text_valid(o.label || (entry.value -> 'label'))
                        then o.label || (entry.value -> 'label') else o.label end,
           is_archived = o.is_archived or coalesce((entry.value ->> 'hidden')::boolean, false)
      from public.profile_fields f
     where f.org_id = new.org_id
       and f.system_key = private.question_system_key(new.question)
       and o.question_id = f.id and o.key = entry.key;
  end loop;
  new.option_overrides := '{}'::jsonb;
  return new;
end;
$$;
revoke all on function private.fold_option_overrides() from public, anon, authenticated;

create trigger builtin_question_overrides_fold_options
  before insert or update of option_overrides on public.builtin_question_overrides
  for each row execute function private.fold_option_overrides();

-- What is stored is folded once.
update public.builtin_question_overrides set option_overrides = option_overrides
 where option_overrides <> '{}'::jsonb;

-- 9. Erasure also removes what a field change set aside ------------------------------------------------------

create or replace function public.anonymize_participant(participant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid;
  subject_role text;
  subject_anonymized_at timestamptz;
  birth_field public.profile_fields;
  birth_date date;
begin
  perform private.require_recent_second_factor();
  -- SECURITY DEFINER means RLS is not doing this check, so it runs before any
  -- work, right after the step-up check, and pgTAP asserts it from three roles.
  if not (select public.has_permission('rgpd.erase')) then
    raise exception 'anonymizing a participant is a staff action'
      using errcode = 'insufficient_privilege';
  end if;

  actor_org := (select public.current_org_id());

  -- The tenant scope RLS would normally provide. Without it, SECURITY DEFINER
  -- would let a staff member of one organization anonymize another's roster.
  select p.role, p.anonymized_at into subject_role, subject_anonymized_at
  from public.profiles p
  where p.id = participant_id and p.org_id = actor_org;

  if subject_role is null then
    raise exception 'ANONYMIZE_NO_SUBJECT: no such participant in this organization'
      using errcode = 'raise_exception';
  end if;

  -- Anonymizing a colleague would strip the name off an account that still signs
  -- in and still acts, which is a different and much worse thing than what this
  -- function is for.
  if subject_role <> 'player' then
    raise exception 'ANONYMIZE_NOT_A_PARTICIPANT: only a participant record can be anonymized'
      using errcode = 'raise_exception';
  end if;

  -- Already done. Silently re-running would rewrite `anonymized_at` and lose the
  -- date the person actually left the record.
  if subject_anonymized_at is not null then
    raise exception 'ANONYMIZE_ALREADY_DONE: this record was already anonymized'
      using errcode = 'raise_exception';
  end if;

  -- The one answer that survives, read before anything goes: her birth year,
  -- from the field the registry names, only while it is still a date (D7, D11).
  birth_field := private.feature_field(actor_org, 'erasure.birth_year');
  if birth_field.id is not null then
    birth_date := (private.field_answer_now(participant_id, birth_field) #>> '{}')::date;
  end if;

  update public.profiles set
    -- Emptied rather than filled with a placeholder word: the screens read
    -- `anonymized_at` and show a translated label, so no invented name has to
    -- exist in five languages or leak out of a CSV export as though it were one.
    first_name = '',
    last_name = '',
    avatar_url = null,
    -- The app's old columns, until RAPP-666 drops them: none of them may keep
    -- a copy of what the answers held.
    date_of_birth = null,
    place_of_birth = null,
    nationality = null,
    document_type = null,
    document_name = null,
    document_number = null,
    phone = null,
    address = null,
    city = null,
    postal_code = null,
    reference_entity = null,
    reference_contact_name = null,
    has_dependents = null,
    num_dependents = 0,
    clothing_size = null,
    shoe_size = null,
    applicant_status = null,
    applicant_status_details = null,
    supporting_entities = null,
    childcare_need = null,
    specific_needs = null,
    media_consent_at = null,
    is_active = false,
    anonymized_at = now(),
    updated_at = now()
  where id = participant_id;

  -- Every answer of hers (D11): the app's fields and the team's, every season.
  delete from public.season_answers where profile_id = participant_id;
  delete from public.profile_answers where profile_id = participant_id;
  delete from public.custom_answers where profile_id = participant_id;
  delete from public.referral_custom_answers r
   using public.entity_referrals referral
   where r.referral_id = referral.id and referral.referred_profile_id = participant_id;
  -- What a field change set aside (RAPP-665) is hers too: it leaves with her.
  delete from public.audit_log a
   where a.action = 'intake.answer_set_aside'
     and ((a.target_type = 'profile' and a.target_id = participant_id)
          or (a.target_type = 'entity_referral'
              and a.target_id in (select referral.id from public.entity_referrals referral
                                   where referral.referred_profile_id = participant_id)));

  -- Her birth year alone still answers every age band a funder report asks.
  if birth_date is not null then
    begin
      perform private.write_custom_answer(
        participant_id, birth_field,
        to_jsonb(make_date(extract(year from birth_date)::int, 1, 1)::text), 'staff', actor);
    exception when check_violation then
      -- A seasonal date field with no current season keeps nothing.
      null;
    end;
  end if;

  -- Prose about her life, which no column-level anonymization can reach. Deleted
  -- through this function and only through this function: the table has no
  -- DELETE policy precisely so that no staff member can quietly revise the
  -- record, and the right to erasure is a different thing from revising it.
  delete from public.participant_notes where profile_id = participant_id;

  -- A retained device token would keep a channel open to a real phone belonging
  -- to a person this row no longer claims to know.
  delete from public.push_tokens where user_id = participant_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org,
    actor,
    'profile.anonymize',
    'profile',
    participant_id,
    -- WHICH things were cleared, never what was in them (ADR-021). The audit row
    -- must not become the last surviving copy of the data it describes.
    jsonb_build_object('fields_cleared', true, 'answers_deleted', true, 'notes_deleted', true,
                       'birth_year_kept', birth_date is not null)
  );
end;
$$;
revoke all on function public.anonymize_participant(uuid) from public, anon;
grant execute on function public.anonymize_participant(uuid) to authenticated, service_role;
