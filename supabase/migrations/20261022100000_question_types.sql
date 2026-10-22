-- Builder question types match every field kind the app uses (RAPP-610).
--
-- WHY
--
-- The question builder offered five types (short text, long text,
-- yes/no/maybe, single choice, multiple choice). The app itself asks numbers,
-- dates, yes or no, phones, emails, long searchable lists, lists she adds to
-- one by one, single consents, files and signatures. Staff building a screen
-- must be able to ask any of them.
--
-- WHAT THIS MIGRATION DOES
--
--   1. Ten new types and a `settings` column, checked per type
--      (`private.custom_question_settings_valid`): a number's range and
--      whether it is whole, a date's age range, how many items a list takes, a
--      consent's own text, what a file question accepts. A file or a signature
--      is asked of her only (her wizard, each season).
--   2. One answer check per type (`private.custom_answer_value_valid`), the
--      same rules as the shared Zod schema
--      (`packages/shared/intake-builder/question-types.ts`), kept equal by
--      `tests/custom-answer-parity.test.ts`. A file's key must be in her own
--      private folder; staff never write a file or a signature for a real
--      woman (the scenario tool does, for a test player). Sensitive answers
--      stay encrypted, every type alike.
--   3. `save_custom_question` takes the settings; the catalog carries them;
--      the audit log records them.
--   4. `can_read_custom_answer_object`: the media Worker opens a private
--      answer file for her, and for staff who may read the answer's privacy
--      level, and for nobody else.
--   5. Exports read every type in words.
--   6. The test player scenario tool fills and clears staff questions too
--      (`custom_answers`), and her page lists which are answered.
--
-- Docs: https://supabase.com/docs/guides/database/json (jsonb checks and
-- operators), https://www.postgresql.org/docs/current/functions-json.html,
-- https://www.postgresql.org/docs/current/functions-matching.html (POSIX
-- regular expressions), https://zod.dev/api (the TypeScript side).

-- 1. Types and settings ------------------------------------------------------------------------------------

create or replace function private.custom_question_types()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['short_text', 'long_text', 'yes_no_maybe', 'single_choice', 'multiple_choice',
               'number', 'date', 'yes_no', 'phone', 'email', 'search_choice', 'item_list',
               'consent', 'file_upload', 'signature']::text[];
$$;

-- A JSON number that is a whole number within a range.
create or replace function private.json_int_between(p_value jsonb, p_low integer, p_high integer)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  number_value numeric;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'number' then
    return false;
  end if;
  number_value := (p_value #>> '{}')::numeric;
  return number_value = trunc(number_value) and number_value between p_low and p_high;
end;
$$;

-- The settings each type takes: the same rules as `questionSettingsSchema`.
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
      return p_settings - 'text' = '{}'::jsonb and private.catalan_text_valid(p_settings -> 'text');
    when 'file_upload' then
      return p_settings - 'accept' = '{}'::jsonb
        and (p_settings ->> 'accept') in ('photo', 'document')
        and jsonb_typeof(p_settings -> 'accept') = 'string';
    else
      return p_settings = '{}'::jsonb;
  end case;
end;
$$;

revoke all on function private.custom_question_types() from public, anon, authenticated;
revoke all on function private.json_int_between(jsonb, integer, integer) from public, anon, authenticated;
revoke all on function private.custom_question_settings_valid(text, jsonb) from public, anon, authenticated;

alter table public.custom_questions drop constraint custom_questions_question_type_check;
alter table public.custom_questions
  add constraint custom_questions_question_type_check
    check (question_type = any (private.custom_question_types())),
  add column settings jsonb not null default '{}'::jsonb,
  add constraint custom_questions_settings_fit_type
    check (private.custom_question_settings_valid(question_type, settings)),
  -- A file or a signature is hers to give: her wizard or each season only.
  add constraint custom_questions_own_answers_only
    check (question_type not in ('file_upload', 'signature')
           or placements <@ array['wizard', 'season']::text[]);
comment on column public.custom_questions.settings is
  'Per-type settings (RAPP-610): number {integer, min?, max?}, date {min_age?, max_age?}, item_list {max_items}, consent {text}, file_upload {accept}; {} for the rest.';

-- 2. Answers --------------------------------------------------------------------------------------------------

-- An answer of a type, with the type's settings and the options still offered.
-- The same rules as `customAnswerSchema`; change both together.
create or replace function private.custom_answer_value_valid(
  p_type text,
  p_settings jsonb,
  p_value jsonb,
  p_live_options text[]
)
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
      return kind = 'string' and length(btrim(p_value #>> '{}')) between 1 and 500;
    when 'long_text' then
      return kind = 'string' and length(btrim(p_value #>> '{}')) between 1 and 4000;
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
        if length(item) not between 1 and 120 or item ~ '^[[:space:]]' or item ~ '[[:space:]]$' then
          return false;
        end if;
      end loop;
      return true;
    when 'consent' then
      return p_value = 'true'::jsonb;
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
    when 'signature' then
      return private.app_signature_valid(p_value);
    else
      return false;
  end case;
end;
$$;

revoke all on function private.custom_answer_value_valid(text, jsonb, jsonb, text[])
  from public, anon, authenticated;

create or replace function private.custom_answer_valid(p_question public.custom_questions, p_value jsonb)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.custom_answer_value_valid(
    p_question.question_type, p_question.settings, p_value,
    array(select o.id::text from public.custom_question_options o
           where o.question_id = p_question.id and not o.is_archived));
$$;

revoke all on function private.custom_answer_valid(public.custom_questions, jsonb) from public, anon, authenticated;

-- Writes one answer: an empty value (an unticked consent included) removes it.
-- A seasonal question answers the current season. Sensitive answers are
-- encrypted. A file must be in her own folder; a file or a signature comes
-- from her, or from the scenario tool on a test player.
create or replace function private.write_custom_answer(
  p_profile_id uuid,
  p_question public.custom_questions,
  p_value jsonb,
  p_source text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  season uuid := case when 'season' = any (p_question.placements)
                      then private.current_season_id(p_question.org_id) end;
  key uuid := coalesce(season, '00000000-0000-0000-0000-000000000000'::uuid);
  is_empty boolean := p_value is null or jsonb_typeof(p_value) = 'null'
    or p_value = 'false'::jsonb
    or (jsonb_typeof(p_value) = 'string' and btrim(p_value #>> '{}') = '')
    or (jsonb_typeof(p_value) = 'array' and jsonb_array_length(p_value) = 0);
  stored jsonb := case when jsonb_typeof(p_value) = 'string' then to_jsonb(btrim(p_value #>> '{}')) else p_value end;
begin
  if p_question.question_type in ('file_upload', 'signature') and p_source <> 'player'
     and not private.is_test_player(p_profile_id) then
    raise insufficient_privilege using message = 'a file or a signature is hers to give';
  end if;
  -- With no current season there is nowhere to keep a seasonal answer. Her
  -- registration never stops on it; staff are told.
  if 'season' = any (p_question.placements) and season is null then
    if p_source = 'player' then
      return;
    end if;
    raise check_violation using message = 'a seasonal question needs a current season';
  end if;
  if is_empty then
    delete from public.custom_answers
     where profile_id = p_profile_id and question_id = p_question.id and season_key = key;
    return;
  end if;
  if not private.custom_answer_valid(p_question, stored) then
    raise check_violation using message = 'the answer does not fit the question';
  end if;
  -- Her file lives in her own private folder of her organization.
  if p_question.question_type = 'file_upload'
     and (split_part(stored ->> 'key', '/', 1) <> p_question.org_id::text
          or split_part(stored ->> 'key', '/', 3) <> p_profile_id::text) then
    raise check_violation using message = 'the answer does not fit the question';
  end if;
  insert into public.custom_answers (
    profile_id, question_id, season_key, season_id, org_id, value, value_encrypted, source, answered_at)
  values (
    p_profile_id, p_question.id, key, season, p_question.org_id,
    case when p_question.privacy = 'sensitive' then null else stored end,
    case when p_question.privacy = 'sensitive' then public.encrypt_field(stored::text) end,
    p_source, now())
  on conflict (profile_id, question_id, season_key) do update
    set value = excluded.value, value_encrypted = excluded.value_encrypted,
        source = excluded.source, answered_at = now();
end;
$$;

revoke all on function private.write_custom_answer(uuid, public.custom_questions, jsonb, text)
  from public, anon, authenticated;

-- 3. Building -------------------------------------------------------------------------------------------------

drop function public.save_custom_question(uuid, uuid, text, jsonb, jsonb, text, text[], jsonb);

-- Creates or changes a question. p_options: [{id?: uuid, label: localized text}]
-- in order; an option left out is archived and its answers keep it.
-- p_settings: the type's settings (RAPP-610). The type and the privacy level
-- never change; the settings and the wording may.
create or replace function public.save_custom_question(
  p_id uuid,
  p_screen_id uuid,
  p_type text,
  p_label jsonb,
  p_help jsonb,
  p_privacy text,
  p_placements text[],
  p_options jsonb default '[]'::jsonb,
  p_settings jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  existing public.custom_questions;
  saved_id uuid;
  is_choice boolean := p_type in ('single_choice', 'multiple_choice', 'search_choice');
  clean_settings jsonb := coalesce(nullif(p_settings, 'null'::jsonb), '{}'::jsonb);
  option_item jsonb;
  position_index integer := 0;
  kept_ids uuid[] := '{}';
  option_id uuid;
begin
  if not exists (select 1 from public.intake_screens
                  where id = p_screen_id and org_id = actor_org and not is_archived) then
    raise no_data_found using message = 'no such screen';
  end if;
  if not (p_type = any (private.custom_question_types())) then
    raise check_violation using message = 'not a question type';
  end if;
  if not private.catalan_text_valid(p_label) then
    raise check_violation using message = 'a question needs a label in Catalan';
  end if;
  if not private.custom_question_settings_valid(p_type, clean_settings) then
    raise check_violation using message = 'the settings do not fit the type';
  end if;
  if p_type in ('file_upload', 'signature')
     and not (coalesce(p_placements, '{}') <@ array['wizard', 'season']::text[]) then
    raise check_violation using message = 'a file or a signature is asked of her only';
  end if;
  if jsonb_typeof(coalesce(p_options, '[]'::jsonb)) <> 'array' then
    raise check_violation using message = 'options must be a list';
  end if;
  if is_choice and (
    select count(*) from jsonb_array_elements(coalesce(p_options, '[]'::jsonb))) < 2 then
    raise check_violation using message = 'a choice question needs at least two options';
  end if;
  if not is_choice and jsonb_array_length(coalesce(p_options, '[]'::jsonb)) > 0 then
    raise check_violation using message = 'only a choice question has options';
  end if;
  if jsonb_array_length(coalesce(p_options, '[]'::jsonb))
     > (case when p_type = 'search_choice' then 500 else 60 end) then
    raise check_violation using message = 'too many options';
  end if;

  if p_id is null then
    insert into public.custom_questions (
      org_id, screen_id, question_type, label, help, privacy, placements, settings, sort_order)
    values (actor_org, p_screen_id, p_type, p_label, nullif(p_help, 'null'::jsonb), p_privacy, p_placements,
            clean_settings,
            coalesce((select max(sort_order) + 1 from public.custom_questions where screen_id = p_screen_id), 0))
    returning id into saved_id;
  else
    select * into existing from public.custom_questions where id = p_id and org_id = actor_org for update;
    if existing.id is null then
      raise no_data_found using message = 'no such question';
    end if;
    if existing.question_type <> p_type then
      raise check_violation using message = 'the type of a question never changes';
    end if;
    if existing.privacy <> p_privacy then
      raise check_violation using message = 'the privacy level of a question never changes';
    end if;
    update public.custom_questions
       set screen_id = p_screen_id, label = p_label, help = nullif(p_help, 'null'::jsonb),
           placements = p_placements, settings = clean_settings, is_archived = false, updated_at = now()
     where id = p_id;
    saved_id := p_id;
  end if;

  for option_item in select value from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) loop
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
      values (actor_org, saved_id, option_item -> 'label', position_index)
      returning id into option_id;
    end if;
    kept_ids := kept_ids || option_id;
    position_index := position_index + 1;
  end loop;
  update public.custom_question_options
     set is_archived = true
   where question_id = saved_id and not (id = any (kept_ids)) and not is_archived;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.question_save', 'custom_question', saved_id,
          jsonb_build_object('created', p_id is null, 'type', p_type, 'privacy', p_privacy,
                             'placements', to_jsonb(p_placements), 'options', cardinality(kept_ids),
                             'settings', clean_settings));
  return saved_id;
end;
$$;

revoke all on function public.save_custom_question(uuid, uuid, text, jsonb, jsonb, text, text[], jsonb, jsonb)
  from public, anon;
grant execute on function public.save_custom_question(uuid, uuid, text, jsonb, jsonb, text, text[], jsonb, jsonb)
  to authenticated;

-- The catalog carries each question's settings.
create or replace function public.intake_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
        'questions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', q.id, 'question_type', q.question_type, 'label', q.label, 'help', q.help,
            'privacy', q.privacy, 'placements', to_jsonb(q.placements), 'sort_order', q.sort_order,
            'is_archived', q.is_archived, 'settings', q.settings,
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
        'question', o.question, 'label', o.label, 'help', o.help, 'is_hidden', o.is_hidden,
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
    -- The app terms she accepts (RAPP-613): the current published version.
    'terms', (
      select jsonb_build_object('id', v.id, 'version_number', v.version_number, 'content', v.content)
        from private.current_app_terms_version(actor_org) v
       where v.id is not null)
  );
end;
$$;

-- 4. Her private files ---------------------------------------------------------------------------------------

-- Whether the caller may open a file kept in the private answer folder. The
-- key's third segment is the woman who uploaded it. She opens her own; staff
-- open it when an answer of hers names this key and they may read that
-- question's privacy level for her (the design role: test players only).
create or replace function public.can_read_custom_answer_object(p_object_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  owner_id uuid;
  answer record;
begin
  if caller is null or p_object_key is null
     or split_part(p_object_key, '/', 2) <> 'intake-answers'
     or split_part(p_object_key, '/', 1) is distinct from (select public.current_org_id())::text then
    return false;
  end if;
  begin
    owner_id := split_part(p_object_key, '/', 3)::uuid;
  exception when others then
    return false;
  end;
  if owner_id = caller then
    return true;
  end if;
  for answer in
    select q.privacy, coalesce(a.value, (public.decrypt_field(a.value_encrypted))::jsonb) as value
      from public.custom_answers a
      join public.custom_questions q on q.id = a.question_id
     where a.profile_id = owner_id and q.question_type = 'file_upload'
  loop
    if answer.value ->> 'key' = p_object_key then
      return (select private.participant_permission(owner_id,
        case answer.privacy
          when 'normal' then 'participants.view'
          when 'personal' then 'participants.view_personal'
          else 'participants.view_sensitive' end));
    end if;
  end loop;
  return false;
end;
$$;

revoke all on function public.can_read_custom_answer_object(text) from public, anon;
grant execute on function public.can_read_custom_answer_object(text) to authenticated;

-- 5. Exports in words ------------------------------------------------------------------------------------------

create or replace function private.custom_answer_text(p_question public.custom_questions, p_value jsonb)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_question.question_type in ('single_choice', 'multiple_choice', 'search_choice') then (
      select string_agg(
               coalesce(o.label ->> 'ca', chosen.id)
                 || case when o.is_archived then ' (arxivada)' else '' end,
               '; ' order by o.sort_order)
        from (select jsonb_array_elements_text(
                       case when jsonb_typeof(p_value) = 'array' then p_value
                            else jsonb_build_array(p_value) end) as id) chosen
        left join public.custom_question_options o
          on o.id::text = chosen.id and o.question_id = p_question.id)
    when p_question.question_type in ('yes_no_maybe', 'yes_no') then
      case p_value #>> '{}' when 'yes' then 'Sí' when 'no' then 'No' when 'maybe' then 'Potser'
                            else p_value #>> '{}' end
    when p_question.question_type = 'date' and jsonb_typeof(p_value) = 'string' then
      to_char((p_value #>> '{}')::date, 'DD/MM/YYYY')
    when p_question.question_type = 'item_list' and jsonb_typeof(p_value) = 'array' then (
      select string_agg(item, '; ' order by position)
        from jsonb_array_elements_text(p_value) with ordinality as listed(item, position))
    when p_question.question_type = 'consent' then
      case when p_value = 'true'::jsonb then 'Sí' else 'No' end
    when p_question.question_type = 'signature' then 'Signat'
    when p_question.question_type = 'file_upload' then 'Fitxer: ' || coalesce(p_value ->> 'name', '')
    else p_value #>> '{}'
  end;
$$;

revoke all on function private.custom_answer_text(public.custom_questions, jsonb) from public, anon, authenticated;

-- 6. The scenario tool ----------------------------------------------------------------------------------------

-- Fills or clears the staff questions of a test player:
-- {"kind": "custom_answers", "fill": {question id: value}, "clear": [question id]}.
-- Each value is checked like any answer; files and signatures included.
create or replace function private.scenario_custom_answers(p_target public.profiles, p_change jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  fill jsonb := coalesce(p_change -> 'fill', '{}'::jsonb);
  clear jsonb := coalesce(p_change -> 'clear', '[]'::jsonb);
  entry record;
  question public.custom_questions;
begin
  if jsonb_typeof(fill) <> 'object' or jsonb_typeof(clear) <> 'array' then
    raise invalid_parameter_value using message = 'custom answers take a fill object and a clear list';
  end if;
  for entry in select key, value from jsonb_each(fill) loop
    select * into question from public.custom_questions q
     where q.id::text = entry.key and q.org_id = p_target.org_id and not q.is_archived;
    if question.id is null then
      raise no_data_found using message = 'no such question';
    end if;
    if question.privacy = 'sensitive'
       and not (select private.participant_permission(p_target.id, 'participants.view_sensitive')) then
      raise insufficient_privilege using message = 'a Sensitive answer needs participants.view_sensitive';
    end if;
    perform private.write_custom_answer(p_target.id, question, entry.value, 'staff');
  end loop;
  delete from public.custom_answers a
   where a.profile_id = p_target.id
     and a.question_id::text in (select jsonb_array_elements_text(clear));
  -- The question ids only: answers may be Sensitive and never enter the log (ADR-004).
  return jsonb_build_object(
    'filled', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(fill) k),
    'cleared', clear);
end;
$$;

revoke all on function private.scenario_custom_answers(public.profiles, jsonb) from public, anon, authenticated;

create or replace function public.set_test_player_scenario(p_profile_id uuid, p_change jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles := private.scenario_test_player(p_profile_id);
  kind text := p_change ->> 'kind';
  summary jsonb;
begin
  if p_change is null or jsonb_typeof(p_change) <> 'object' then
    raise invalid_parameter_value using message = 'a scenario change is an object';
  end if;
  summary := case kind
    when 'answers' then private.scenario_answers(target, p_change)
    when 'custom_answers' then private.scenario_custom_answers(target, p_change)
    when 'terms' then private.scenario_terms(target, p_change)
    when 'season_signature' then private.scenario_season_signature(target, p_change)
    when 'returning' then private.scenario_returning(target, p_change)
    when 'reset' then private.scenario_reset(target)
  end;
  if summary is null then
    raise invalid_parameter_value using message = 'unknown scenario switch ' || coalesce(kind, 'null');
  end if;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (target.org_id, (select auth.uid()), 'test_player.scenario', 'profile', target.id,
          jsonb_build_object('kind', kind) || summary);
end;
$$;

revoke all on function public.set_test_player_scenario(uuid, jsonb) from public, anon;
grant execute on function public.set_test_player_scenario(uuid, jsonb) to authenticated;

create or replace function public.test_player_scenario(p_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.profiles;
  current_season uuid;
begin
  select * into target from public.profiles p
   where p.id = p_profile_id
     and p.org_id = (select public.current_org_id())
     and p.is_test_account
     and p.role in ('player', 'invited');
  if target.id is null
    or not (select private.participant_permission(p_profile_id, 'participants.view_personal'))
  then
    raise insufficient_privilege using message = 'scenario switches are for test players only';
  end if;
  current_season := private.current_season_id(target.org_id);
  return jsonb_build_object(
    -- Joined and signed the CURRENT app terms (RAPP-613), as her gate asks.
    'terms_accepted', target.role = 'player'
      and private.signed_terms_version(target.id, (private.current_app_terms_version(target.org_id)).id),
    'current_season', (select s.name from public.seasons s where s.id = current_season),
    'signed_this_season', exists (
      select 1 from public.authorization_signatures s
       where s.profile_id = target.id and s.season_id = current_season),
    'returning', exists (
      select 1 from public.authorization_signatures s
       where s.profile_id = target.id and s.season_id is distinct from current_season),
    'answered', (select coalesce(jsonb_agg(a.question order by a.question), '[]'::jsonb)
                   from public.profile_answers a where a.profile_id = target.id),
    -- The staff questions she has an answer to, for no season or this one (RAPP-610).
    'custom_answered', (select coalesce(jsonb_agg(distinct c.question_id), '[]'::jsonb)
                          from public.custom_answers c
                         where c.profile_id = target.id
                           and (c.season_id is null or c.season_id = current_season)),
    -- Her organization: a sample file is a key in her own private folder.
    'org_id', target.org_id,
    'preferred_language', target.preferred_language);
end;
$$;

revoke all on function public.test_player_scenario(uuid) from public, anon;
grant execute on function public.test_player_scenario(uuid) to authenticated;
