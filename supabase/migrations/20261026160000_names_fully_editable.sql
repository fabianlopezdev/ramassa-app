-- Her names are fully editable, like every field (RAPP-693).
--
-- WHY
--
-- Fabián, 2026-10-26: "Everything can be editable and we can then make
-- decisions for them." Nom and Cognoms get an editable type, privacy and
-- options in Dades de les jugadores, like every field. This overturns D2 of
-- ADR 031 (her names were account columns, short text at the Normal level).
-- A viewer without the permission for the level of her name sees her number,
-- "Jugadora 0042" (Fabián, 2026-10-26).
--
-- WHAT CHANGES
--
--   1. `profiles.member_number`: her stable number in her organization, given
--      on insert (one per organization, in order), backfilled by creation.
--   2. Her names are answers in `custom_answers`, written through
--      `private.write_custom_answer`, like every other field. The existing
--      names of every player and invited woman are moved in.
--   3. One display rule. `private.can_read_name(profile, viewer, key)`:
--      herself; a team account (staff names are their account, never a
--      player field); a team member of her organization with the permission
--      of the field's level; `test_players.manage` on a test player; a fellow
--      player while the level is Normal. `private.shown_name(profile, key)`
--      gives the signed-in viewer her answer as text, or, when the viewer may
--      not read it or no answer fits, "Jugadora 0042" in the viewer's
--      language for the first name and nothing for the last name.
--      `private.display_name(profile)` joins both. `public.shown_names(ids)`
--      gives the apps that read profiles from the table the same rule.
--   4. `profiles.first_name` and `last_name` stay for team accounts. For a
--      player they become a copy that respects privacy: her name while its
--      level is Normal (the level every team member reads), otherwise her
--      number in her organization's language. The copy follows every answer
--      write and every change of the name fields (triggers); nothing writes
--      it by hand. A write of a name to the columns by an older path (her
--      wizard, the staff record, an invitation, a walk-in) is stored as her
--      answer first, by a trigger, and is ignored for a writer who may not
--      read the name. An erased profile keeps blank names.
--   5. The D2 refusals go: `write_custom_answer` and `write_field_answers`
--      take her names, `write_profile_field` and `preview_field_change` take a
--      new type, privacy and options for them. Her names stay never archived
--      and on her identity section.
--   6. Every reader that shows her name to someone reads it through the rule:
--      the participant list and her page, her own profile, search (her names
--      are indexed like any text answer at their level, never at Sensitive),
--      attendance (the coach app and reports), chats, her signatures, exports,
--      the notification audience, mentoring, surveys, feedback, the season
--      registration status and equipment recipients. Her signature keeps the
--      name she signed with; it shows to a viewer who may read her name.
--
-- Docs: https://www.postgresql.org/docs/17/sql-createtrigger.html (AFTER triggers, WHEN),
-- https://www.postgresql.org/docs/17/functions-admin.html (set_config, local to the transaction).

-- 1. Her number ---------------------------------------------------------------------------------------------

alter table public.profiles add column member_number integer not null default 0;

alter table public.profiles disable trigger user;
update public.profiles p
   set member_number = numbered.n
  from (select id, row_number() over (partition by org_id order by created_at, id)::integer as n
          from public.profiles) numbered
 where numbered.id = p.id;
alter table public.profiles enable trigger user;

alter table public.profiles
  add constraint profiles_member_number_positive check (member_number > 0),
  add constraint profiles_member_number_unique unique (org_id, member_number);
comment on column public.profiles.member_number is
  'Her stable number in her organization (RAPP-693): "Jugadora 0042" where her name is private. Given on insert.';

create or replace function private.assign_member_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.org_id is not distinct from old.org_id then
    new.member_number := old.member_number;
    return new;
  end if;
  -- One numbering per organization at a time.
  perform pg_advisory_xact_lock(hashtextextended('member_number:' || new.org_id::text, 0));
  new.member_number := coalesce(
    (select max(p.member_number) from public.profiles p where p.org_id = new.org_id), 0) + 1;
  return new;
end;
$$;
revoke all on function private.assign_member_number() from public, anon, authenticated;

create trigger profiles_assign_member_number
  before insert or update of org_id, member_number on public.profiles
  for each row execute function private.assign_member_number();

grant select (member_number) on public.profiles to authenticated;

-- 2. The display rule ---------------------------------------------------------------------------------------

-- "Jugadora 0042" in a language.
create or replace function private.member_label(p_number integer, p_language text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_language
           when 'en' then 'Player '
           when 'ar' then 'اللاعبة '
           when 'fa' then 'بازیکن '
           else 'Jugadora '
         end
         || case when p_number between 0 and 9999 then lpad(p_number::text, 4, '0') else p_number::text end;
$$;
revoke all on function private.member_label(integer, text) from public, anon, authenticated;

-- Her answer to one of her name fields, as text whatever its type; null when none.
create or replace function private.name_answer_text(p_profile_id uuid, p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(btrim(private.custom_answer_text(f, private.field_answer_now(p.id, f))), '')
    from public.profiles p
    join public.profile_fields f on f.org_id = p.org_id and f.system_key = p_key
   where p.id = p_profile_id;
$$;
revoke all on function private.name_answer_text(uuid, text) from public, anon, authenticated;

create or replace function private.can_read_name(p_profile_id uuid, p_viewer uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- The database itself (no signed-in caller); never an anonymous one.
    when p_viewer is null then coalesce((select auth.role()), '') <> 'anon'
    when p_viewer = p.id then true
    -- A team account's name is its account, never a player field.
    when p.role not in ('player', 'invited') then true
    when f.id is null then true
    when viewer.org_id is distinct from p.org_id then false
    when private.profile_has_permission(p_viewer, private.privacy_permission(f.privacy)) then true
    -- A test player's answers are made up: test_players.manage reads them, as the lists do.
    when p.is_test_account and private.profile_has_permission(p_viewer, 'test_players.manage') then true
    -- Her teammates know her by her name while it is Normal (forum, chats, gallery).
    when f.privacy = 'normal' and viewer.role in ('player', 'invited') then true
    else false
  end
    from public.profiles p
    left join public.profiles viewer on viewer.id = p_viewer
    left join public.profile_fields f on f.org_id = p.org_id and f.system_key = p_key
   where p.id = p_profile_id;
$$;
revoke all on function private.can_read_name(uuid, uuid, text) from public, anon, authenticated;

-- The language the signed-in viewer reads in.
create or replace function private.viewer_language()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select v.preferred_language from public.profiles v where v.id = (select auth.uid())),
    (select o.default_language from public.organizations o where o.id = (select public.current_org_id())),
    'ca');
$$;
revoke all on function private.viewer_language() from public, anon, authenticated;

-- One part of her name as the signed-in viewer sees it (RAPP-693).
create or replace function private.shown_name(p_profile_id uuid, p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.role not in ('player', 'invited') or p.anonymized_at is not null then
      case p_key when 'first_name' then p.first_name else p.last_name end
    else coalesce(
      case when private.can_read_name(p.id, (select auth.uid()), p_key)
           then private.name_answer_text(p.id, p_key) end,
      case p_key when 'first_name' then private.member_label(p.member_number, private.viewer_language()) else '' end)
  end
    from public.profiles p
   where p.id = p_profile_id;
$$;
revoke all on function private.shown_name(uuid, text) from public, anon, authenticated;
-- The attendance view reads it as the signed-in caller.
grant execute on function private.shown_name(uuid, text) to authenticated;

create or replace function private.display_name(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(btrim(concat_ws(' ', private.shown_name(p_profile_id, 'first_name'),
                                     private.shown_name(p_profile_id, 'last_name'))), '');
$$;
revoke all on function private.display_name(uuid) from public, anon, authenticated;
grant execute on function private.display_name(uuid) to authenticated;

-- The same rule for the apps that read profiles from the table: her names
-- as the signed-in caller may see them, for the profiles of her organization.
create or replace function public.shown_names(p_ids uuid[])
returns table (id uuid, first_name text, last_name text, member_number integer)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, private.shown_name(p.id, 'first_name'), private.shown_name(p.id, 'last_name'), p.member_number
    from public.profiles p
   where p.id = any (p_ids)
     and p.org_id = (select public.current_org_id())
     and (p.id = (select auth.uid()) or (select public.is_team_member()));
$$;
revoke all on function public.shown_names(uuid[]) from public, anon;
grant execute on function public.shown_names(uuid[]) to authenticated;

-- 3. The copy on her account --------------------------------------------------------------------------------

-- What her account columns hold: her name while it is Normal, otherwise her
-- number in her organization's language, so a reader of the columns never
-- sees more than the Normal level.
create or replace function private.cached_name(p_profile_id uuid, p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    case when f.privacy = 'normal' then private.name_answer_text(p.id, p_key) end,
    case p_key when 'first_name' then private.member_label(p.member_number, o.default_language) else '' end)
    from public.profiles p
    join public.organizations o on o.id = p.org_id
    left join public.profile_fields f on f.org_id = p.org_id and f.system_key = p_key
   where p.id = p_profile_id;
$$;
revoke all on function private.cached_name(uuid, text) from public, anon, authenticated;

create or replace function private.sync_name_cache(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_value text := private.cached_name(p_profile_id, 'first_name');
  last_value text := private.cached_name(p_profile_id, 'last_name');
begin
  perform set_config('ramassa.name_cache', 'on', true);
  update public.profiles p
     set first_name = first_value, last_name = last_value
   where p.id = p_profile_id
     and p.role in ('player', 'invited')
     and p.anonymized_at is null
     and (p.first_name is distinct from first_value or p.last_name is distinct from last_value);
  perform set_config('ramassa.name_cache', '', true);
end;
$$;
revoke all on function private.sync_name_cache(uuid) from public, anon, authenticated;

create or replace function private.name_cache_on_answer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  answer_row public.custom_answers := case when tg_op = 'DELETE' then old else new end;
begin
  if exists (select 1 from public.profile_fields f
              where f.id = answer_row.question_id and f.system_key in ('first_name', 'last_name')) then
    perform private.sync_name_cache(answer_row.profile_id);
  end if;
  return null;
end;
$$;
revoke all on function private.name_cache_on_answer() from public, anon, authenticated;

create trigger custom_answers_name_cache
  after insert or update or delete on public.custom_answers
  for each row execute function private.name_cache_on_answer();

create or replace function private.name_cache_on_field()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_name_cache(p.id)
     from public.profiles p
    where p.org_id = new.org_id and p.role in ('player', 'invited');
  return null;
end;
$$;
revoke all on function private.name_cache_on_field() from public, anon, authenticated;

create trigger profile_fields_name_cache
  after update of privacy, question_type on public.profile_fields
  for each row when (new.system_key in ('first_name', 'last_name'))
  execute function private.name_cache_on_field();

-- A name written to her account columns by an older path is her answer.
create or replace function private.names_from_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  writer uuid := (select auth.uid());
  name_key text;
  given text;
  field public.profile_fields;
  value jsonb;
begin
  if current_setting('ramassa.name_cache', true) = 'on' or new.anonymized_at is not null then
    return null;
  end if;
  foreach name_key in array array['first_name', 'last_name'] loop
    given := nullif(private.name_trim(case name_key when 'first_name' then new.first_name else new.last_name end), '');
    continue when given is null;
    continue when tg_op = 'UPDATE'
      and given is not distinct from private.name_trim(case name_key when 'first_name' then old.first_name else old.last_name end);
    select * into field from public.profile_fields f where f.org_id = new.org_id and f.system_key = name_key;
    continue when field.id is null;
    -- A writer who may not read her name leaves it as it is.
    continue when writer is not null and not private.can_read_name(new.id, writer, name_key);
    value := case when field.question_type in ('short_text', 'long_text') then to_jsonb(given)
                  else private.converted_answer('short_text', to_jsonb(given), field.question_type,
                                                field.settings, private.field_options_json(field.id)) end;
    continue when value is null;
    perform private.write_custom_answer(
      new.id, field, value,
      case when writer = new.id then 'player'
           when exists (select 1 from public.profiles w where w.id = writer and w.role = 'entity') then 'entity'
           else 'staff' end,
      null);
  end loop;
  perform private.sync_name_cache(new.id);
  return null;
end;
$$;
revoke all on function private.names_from_account() from public, anon, authenticated;

create trigger profiles_names_to_answers
  after insert or update of first_name, last_name on public.profiles
  for each row when (new.role in ('player', 'invited'))
  execute function private.names_from_account();

-- 4. Her names move into the answer store ------------------------------------------------------------------

insert into public.custom_answers (
  profile_id, question_id, season_key, season_id, org_id, value, value_encrypted, source, answered_by, answered_at)
select p.id, f.id, '00000000-0000-0000-0000-000000000000'::uuid, null, p.org_id,
       case when f.privacy = 'sensitive' then null else to_jsonb(named.text) end,
       case when f.privacy = 'sensitive' then public.encrypt_field(to_jsonb(named.text)::text) end,
       case when p.terms_accepted_at is not null then 'player' else 'staff' end, null,
       coalesce(p.updated_at, p.created_at, now())
  from public.profiles p
  join public.profile_fields f on f.org_id = p.org_id and f.system_key in ('first_name', 'last_name')
  cross join lateral (
    select nullif(btrim(case f.system_key when 'first_name' then p.first_name else p.last_name end), '') as text
  ) named
 where p.role in ('player', 'invited')
   and p.anonymized_at is null
   and named.text is not null
   and f.question_type in ('short_text', 'long_text')
on conflict (profile_id, question_id, season_key) do nothing;

-- 5. The D2 refusals go ---------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.write_custom_answer(p_profile_id uuid, p_field profile_fields, p_value jsonb, p_source text, p_answered_by uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  is_seasonal boolean := private.field_is_seasonal(p_field.id);
  season uuid := case when is_seasonal then private.current_season_id(p_field.org_id) end;
  key uuid := coalesce(season, '00000000-0000-0000-0000-000000000000'::uuid);
  is_empty boolean := private.custom_answer_is_empty(p_value);
  stored jsonb := private.custom_answer_tidied(p_field.question_type, p_value);
  -- Her own answers name nobody; a staff write with no name given is the
  -- signed-in team member's.
  author uuid := case
    when p_source = 'player' then null
    when p_source = 'staff' then coalesce(p_answered_by, (select auth.uid()))
    else p_answered_by
  end;
begin
  if private.field_is_hers_only(p_field.question_type, p_field.settings) and p_source <> 'player'
     and not private.is_test_player(p_profile_id) then
    raise insufficient_privilege using message = 'a file is hers to give';
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
  if not private.custom_answer_valid(p_field, stored) then
    raise check_violation using message = 'the answer does not fit the question';
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
$function$;

CREATE OR REPLACE FUNCTION private.write_field_answers(p_profile_id uuid, p_answers jsonb, p_source text, p_answered_by uuid DEFAULT NULL::uuid, p_hers boolean DEFAULT false, p_sensitive text DEFAULT 'write'::text)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  her_org uuid := (select p.org_id from public.profiles p where p.id = p_profile_id);
  entry record;
  field public.profile_fields;
  given jsonb;
  changed uuid[] := '{}'::uuid[];
begin
  if p_answers is null or jsonb_typeof(p_answers) = 'null' then
    return changed;
  end if;
  if jsonb_typeof(p_answers) <> 'object' then
    raise check_violation using message = 'answers must be an object';
  end if;
  if p_sensitive not in ('write', 'skip', 'refuse') or her_org is null then
    raise invalid_parameter_value using message = 'write_field_answers needs her profile and a Sensitive rule';
  end if;
  for entry in select key, value from jsonb_each(p_answers) order by key loop
    field := null;
    select * into field from public.profile_fields f
     where f.org_id = her_org and f.id::text = entry.key and not f.is_archived;
    if field.id is null or (p_hers and not private.field_asked_of_her(field.id)) then
      -- Nothing given for a field she is not asked: nothing to do. A form that
      -- sends every field it knows never fails on one taken off her surfaces.
      continue when p_hers and private.custom_answer_is_empty(entry.value);
      if p_hers then
        raise insufficient_privilege using message = 'not a question she is asked';
      end if;
      raise no_data_found using message = 'no such field';
    end if;
    if field.privacy = 'sensitive' and p_sensitive <> 'write' then
      if p_sensitive = 'refuse' then
        raise insufficient_privilege using message = 'a Sensitive answer needs participants.view_sensitive';
      end if;
      continue;
    end if;
    given := case when private.custom_answer_is_empty(entry.value) then null
                  else private.custom_answer_tidied(field.question_type, entry.value) end;
    -- Given again unchanged: whoever gave it first stays its source.
    continue when given is not distinct from private.field_answer_now(p_profile_id, field);
    perform private.write_custom_answer(p_profile_id, field, entry.value, p_source, p_answered_by);
    changed := changed || field.id;
  end loop;
  return changed || private.clear_hidden_answers(p_profile_id, changed);
end;
$function$;

CREATE OR REPLACE FUNCTION private.write_profile_field(p_org_id uuid, p_id uuid, p_section_id uuid, p_type text, p_label jsonb, p_help jsonb, p_privacy text, p_default_required boolean, p_options jsonb, p_settings jsonb)
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
$function$;

CREATE OR REPLACE FUNCTION public.preview_field_change(p_field_id uuid, p_type text, p_privacy text, p_options jsonb DEFAULT NULL::jsonb, p_settings jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- The same people by role (RAPP-692), for the warning that names them.
    'roles_losing', private.readers_by_role(actor_org, permission_before, permission_after),
    'roles_gaining', private.readers_by_role(actor_org, permission_after, permission_before),
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
$function$;

CREATE OR REPLACE FUNCTION private.app_question_answered(p_profile_id uuid, p_question text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    -- Her names are answers like any field (RAPP-693).
    when p_question in ('first_name', 'last_name') then
      private.name_answer_text(p_profile_id, p_question) is not null
    when p_question = 'preferred_language' then exists (
      select 1 from public.profiles p
       where p.id = p_profile_id and p.preferred_language is not null)
    when p_question = 'avatar' then exists (
      select 1 from public.profiles p where p.id = p_profile_id and p.avatar_url is not null)
    when p_question = 'season_number' then exists (
      select 1 from public.profiles p where p.id = p_profile_id and p.season_number is not null)
    else exists (
      select 1 from public.profile_fields f
        join public.profiles p on p.id = p_profile_id and p.org_id = f.org_id
       where f.system_key is not null
         and private.system_key_question(f.system_key) = p_question
         and private.field_answer_now(p_profile_id, f) is not null)
  end;
$function$;

CREATE OR REPLACE FUNCTION private.participant_search_text(p_profile_id uuid, p_levels text[])
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- Her names are text answers here like any other (RAPP-693).
  select concat_ws(' ', (
    select string_agg(private.custom_answer_text(f, a.value), ' ' order by f.sort_order)
      from public.custom_answers a
      join public.profile_fields f on f.id = a.question_id
     where a.profile_id = p.id
       -- Only a stored value: a Sensitive answer is encrypted and never read here.
       and a.value is not null
       and f.privacy = any (p_levels)
       and f.privacy <> 'sensitive'
       and f.question_type in ('short_text', 'long_text', 'country', 'municipality', 'item_list')))
    from public.profiles p
   where p.id = p_profile_id;
$function$;

CREATE OR REPLACE FUNCTION private.complete_onboarding_signed(payload jsonb, p_signing jsonb)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  saved public.profiles;
  previous_ids uuid[];
  acceptance uuid;
  drawing jsonb := nullif(p_signing->'signature','null'::jsonb);
  cannot_draw boolean;
  -- Her signatures of the Onboarding blocks (RAPP-690), by block id.
  signatures jsonb := payload -> 'signatures';
  unsigned uuid[];
begin
  if caller is null then raise insufficient_privilege using message='authenticated signing required'; end if;
  if jsonb_typeof(p_signing) is distinct from 'object'
    or (p_signing->'terms_accepted') is distinct from 'true'::jsonb
    or jsonb_typeof(p_signing->'media_consent') is distinct from 'boolean'
    or jsonb_typeof(p_signing->'unable_to_draw') is distinct from 'boolean'
    or (payload->'media_consent') is distinct from (p_signing->'media_consent')
    or length(coalesce(p_signing->>'device',''))>200
  then raise check_violation using message='explicit terms acceptance and matching media choice required'; end if;
  cannot_draw := (p_signing->>'unable_to_draw')::boolean;
  if (cannot_draw and drawing is not null) or
    (not cannot_draw and not private.app_signature_valid(drawing))
  then raise check_violation using message='draw a valid signature or use the cannot-draw alternative'; end if;

  -- Serialize calls for an existing account and identify this acceptance exactly,
  -- including two acceptances made in one transaction with the same timestamp.
  perform 1 from public.profiles where id=caller for update;
  select coalesce(array_agg(id),'{}'::uuid[]) into previous_ids
    from public.terms_acceptances where profile_id=caller;
  -- Every answer, the staff fields' included, travels in `answers` (RAPP-661)
  -- and is saved and checked in the same transaction as her account.
  saved := public.complete_onboarding(payload - 'signatures');
  select id into strict acceptance from public.terms_acceptances
    where profile_id=caller and not (id=any(previous_ids));
  insert into public.app_terms_signatures
    (acceptance_id,profile_id,org_id,signature,unable_to_draw,media_consent,device)
  values (acceptance,caller,saved.org_id,drawing,cannot_draw,(p_signing->>'media_consent')::boolean,nullif(p_signing->>'device',''));
  -- Every signature block of her Onboarding is signed by her (RAPP-690), in
  -- the same transaction as her account.
  perform private.save_form_signatures(
    saved.org_id, 'wizard', caller, null, caller,
    -- The name she signs with is her answer, whatever its level (RAPP-693).
    concat_ws(' ', private.name_answer_text(caller, 'first_name'), private.name_answer_text(caller, 'last_name')),
    signatures);
  unsigned := private.unsigned_form_blocks(saved.org_id, 'wizard', caller, null);
  if cardinality(unsigned) > 0 then
    raise not_null_violation using message = 'complete_onboarding requires her signature on every signature block';
  end if;
  return saved;
end $function$;

-- Her wizard sends her names as she typed them, or as answers by field.
CREATE OR REPLACE FUNCTION public.complete_onboarding(payload jsonb)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  stored public.profiles;
  saved public.profiles;
  answers jsonb := coalesce(nullif(payload -> 'answers', 'null'::jsonb), '{}'::jsonb);
  terms_version_value text := nullif(payload ->> 'terms_version', '');
  locale_shown_value text := nullif(payload ->> 'locale_shown', '');
  first_name_value text;
  last_name_value text;
  preferred_language_value text;
  avatar_url_value text;
  media_consent_at_value timestamptz;
  entity_field uuid;
  missing uuid[];
begin
  if caller is null then
    raise exception 'complete_onboarding requires an authenticated caller'
      using errcode = 'insufficient_privilege';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object'
     or payload - array['first_name', 'last_name', 'preferred_language', 'avatar_url', 'media_consent',
                        'terms_version', 'locale_shown', 'answers'] <> '{}'::jsonb then
    raise invalid_parameter_value
      using message = 'complete_onboarding takes her names, her settings and her answers by field';
  end if;
  if terms_version_value is null or locale_shown_value is null then
    raise exception 'complete_onboarding requires terms_version and locale_shown'
      using errcode = 'not_null_violation';
  end if;

  select * into stored from public.profiles where id = caller for update;
  if stored.id is not null and stored.role not in ('player', 'invited') then
    raise exception 'complete_onboarding is the participant path'
      using errcode = 'insufficient_privilege';
  end if;

  -- A name she sent takes her answer; one she did not send keeps what is stored.
  first_name_value := case when payload ? 'first_name'
    then nullif(private.name_trim(payload ->> 'first_name'), '') else stored.first_name end;
  last_name_value := case when payload ? 'last_name'
    then nullif(private.name_trim(payload ->> 'last_name'), '') else stored.last_name end;
  preferred_language_value := coalesce(
    nullif(payload ->> 'preferred_language', ''), stored.preferred_language, 'ca');
  avatar_url_value := case when payload ? 'avatar_url'
    then nullif(payload ->> 'avatar_url', '') else stored.avatar_url end;
  media_consent_at_value := case
    when nullif(payload ->> 'media_consent', '') is null then stored.media_consent_at
    when (payload ->> 'media_consent')::boolean then coalesce(stored.media_consent_at, now())
    else null
  end;
  -- Her names may also come as answers by field, asked with their own type
  -- (RAPP-693); they are checked once her answers are saved.
  first_name_value := coalesce(first_name_value, '');
  last_name_value := coalesce(last_name_value, '');

  -- Her account first: her answers need it.
  if stored.id is null then
    insert into public.profiles (
      id, org_id, role, first_name, last_name, preferred_language, avatar_url,
      terms_accepted_at, media_consent_at)
    values (
      caller, (select public.default_organization_id()), 'player', first_name_value, last_name_value,
      preferred_language_value, avatar_url_value, now(), media_consent_at_value)
    returning * into saved;
  else
    -- Role and org are not the wizard's to change, except that joining makes
    -- an invited woman a player (RAPP-300).
    update public.profiles set
      role = 'player',
      first_name = first_name_value,
      last_name = last_name_value,
      preferred_language = preferred_language_value,
      avatar_url = avatar_url_value,
      terms_accepted_at = now(),
      media_consent_at = media_consent_at_value,
      updated_at = now()
    where id = caller
    returning * into saved;
  end if;

  -- Her answers by field. One she confirmed unchanged keeps the team's or the
  -- entity's record; one she cleared is no longer answered.
  perform private.write_field_answers(caller, answers, 'player', null, true);
  perform private.apply_document_rule(caller, true, true);
  -- A name she typed that does not fit its field's type leaves her number.
  if (first_name_value = '' and private.name_answer_text(caller, 'first_name') is null)
     or (last_name_value = '' and private.name_answer_text(caller, 'last_name') is null) then
    raise exception 'complete_onboarding requires first_name and last_name'
      using errcode = 'not_null_violation';
  end if;

  -- Every required placement of her onboarding, and of the season form, which
  -- the wizard asks too, has an answer once hers are saved (RAPP-611).
  missing := private.missing_required_custom_answers(caller, 'wizard')
          || private.missing_required_custom_answers(caller, 'season');
  -- "None" is an answer to the entity question: the field sent, even empty.
  select f.id into entity_field from public.profile_fields f
   where f.org_id = saved.org_id and f.system_key = 'reference_entity';
  if entity_field is not null and answers ? entity_field::text then
    missing := array_remove(missing, entity_field);
  end if;
  if cardinality(missing) > 0 then
    raise not_null_violation using message = 'complete_onboarding requires an answer to a required question';
  end if;

  insert into public.terms_acceptances (profile_id, terms_version, locale_shown)
  values (caller, terms_version_value, locale_shown_value);

  return saved;
end;
$function$;

-- 6. Every reader shows her name through the rule -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_participants(p_query text DEFAULT ''::text, p_entity text DEFAULT NULL::text, p_nationality text DEFAULT NULL::text, p_status text DEFAULT 'all'::text, p_dependents text DEFAULT 'all'::text, p_sort text DEFAULT 'last_name'::text, p_dir text DEFAULT 'asc'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25)
 RETURNS TABLE(id uuid, first_name text, last_name text, nationality text, city text, reference_entity text, has_dependents boolean, num_dependents integer, is_active boolean, preferred_language text, created_at timestamp with time zone, joined boolean, is_test_account boolean, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with access as (
    select
      (select public.has_permission('participants.view')) as can_view,
      (select public.has_permission('participants.view_personal')) as personal_permission,
      (select public.has_permission('participants.view_sensitive')) as sensitive_permission,
      (select public.has_permission('test_players.manage')) as manages_test_players
  ),
  -- The fields the registry names for the list (D7), once.
  feature as (
    select
      private.feature_field(org.id, 'participants.nationality') as nationality,
      private.feature_field(org.id, 'participants.city') as city,
      private.feature_field(org.id, 'participants.entity') as entity,
      private.feature_field(org.id, 'participants.has_dependents') as dependents,
      private.feature_field(org.id, 'participants.dependents_count') as dependents_count
    from (select public.current_org_id() as id) org
  ),
  candidate as (
    select
      profile.*,
      -- A test player's answers are made up: test_players.manage reads them.
      access.personal_permission or (profile.is_test_account and access.manages_test_players) as personal,
      access.sensitive_permission or (profile.is_test_account and access.manages_test_players) as sensitive
    from public.profiles as profile
    cross join access
    where (access.can_view or (access.manages_test_players and profile.is_test_account))
      and profile.org_id = (select public.current_org_id())
      -- Invited women are listed too, marked as not joined, so staff can
      -- complete their record before the first login (RAPP-300).
      and profile.role in ('player', 'invited')
  ),
  -- Each column only at its field's level for the caller (D9).
  shown as (
    select
      candidate.*,
      case when private.level_read((feature.nationality).privacy, candidate.personal, candidate.sensitive)
        then private.field_text_now(candidate.id, feature.nationality) end as nationality_text,
      case when private.level_read((feature.city).privacy, candidate.personal, candidate.sensitive)
        then private.field_text_now(candidate.id, feature.city) end as city_text,
      case when private.level_read((feature.entity).privacy, candidate.personal, candidate.sensitive)
        then private.field_text_now(candidate.id, feature.entity) end as entity_text,
      case when private.level_read((feature.dependents).privacy, candidate.personal, candidate.sensitive)
        then case private.answer_key(feature.dependents, private.field_answer_now(candidate.id, feature.dependents))
               when 'yes' then true when 'no' then false end end as dependents_answer,
      case when private.level_read((feature.dependents_count).privacy, candidate.personal, candidate.sensitive)
        then coalesce((private.field_answer_now(candidate.id, feature.dependents_count) #>> '{}')::numeric::integer, 0)
      end as dependents_count_answer,
      private.level_read((feature.nationality).privacy, candidate.personal, candidate.sensitive) as reads_nationality,
      private.level_read((feature.entity).privacy, candidate.personal, candidate.sensitive) as reads_entity,
      private.level_read((feature.dependents).privacy, candidate.personal, candidate.sensitive) as reads_dependents
    from candidate
    cross join feature
  ),
  roster as (
    select
      shown.*,
      case
        when p_sort = 'first_name' then private.shown_name(shown.id, 'first_name')
        when p_sort = 'city' then shown.city_text
        when p_sort = 'nationality' then shown.nationality_text
        when p_sort = 'reference_entity' then shown.entity_text
        when p_sort = 'created_at' then to_char(shown.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
        else private.shown_name(shown.id, 'last_name')
      end as sort_key
    from shown
    left join public.participant_search_documents as search on search.profile_id = shown.id
    where (
        coalesce(p_query, '') = ''
        -- Her names and Normal text answers for everyone, her Personal ones
        -- with the Personal level; a Sensitive answer is never indexed (D12).
        or (case when shown.personal then search.personal_document else search.normal_document end)
             @@ to_tsquery('simple', p_query)
      )
      -- A filter on a field the caller does not read is left out, as before.
      and (p_entity is null or not shown.reads_entity or shown.entity_text = p_entity)
      and (p_nationality is null or not shown.reads_nationality or shown.nationality_text = p_nationality)
      and (
        p_status = 'all'
        or (p_status = 'invited' and shown.role = 'invited')
        or (p_status in ('active', 'inactive') and shown.role = 'player'
            and shown.is_active = (p_status = 'active'))
      )
      and (p_dependents = 'all' or not shown.reads_dependents
           or shown.dependents_answer = (p_dependents = 'with'))
  )
  select
    roster.id,
    private.shown_name(roster.id, 'first_name'),
    private.shown_name(roster.id, 'last_name'),
    roster.nationality_text,
    roster.city_text,
    roster.entity_text,
    roster.dependents_answer,
    roster.dependents_count_answer,
    roster.is_active,
    roster.preferred_language,
    roster.created_at,
    roster.role = 'player',
    roster.is_test_account,
    count(*) over ()
  from roster
  order by
    case when p_dir = 'desc' then null else roster.sort_key end asc nulls last,
    case when p_dir = 'desc' then roster.sort_key end desc nulls first,
    roster.id
  limit least(greatest(coalesce(p_page_size, 25), 1), 100)
  offset (greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_page_size, 25), 1), 100);
$function$;

CREATE OR REPLACE FUNCTION public.get_participant_profile(participant_id uuid)
 RETURNS TABLE(id uuid, first_name text, last_name text, preferred_language text, avatar_url text, media_consent boolean, terms_accepted_at timestamp with time zone, is_active boolean, is_forum_banned boolean, anonymized_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, season_number smallint, health_info text, emergency_contact_name text, emergency_contact_relation text, emergency_contact_phone text, is_test_account boolean, role text, answers jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with subject as (
    select p.*
    from public.profiles p
    where p.id = participant_id
      and p.org_id = (select public.current_org_id())
      and (select private.participant_permission(participant_id, 'participants.view'))
  ),
  access_recorded as (
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id)
    select
      (select public.current_org_id()),
      (select auth.uid()),
      case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then 'profile.view_sensitive' else 'profile.view' end,
      'profile',
      s.id
    from subject s
    returning 1
  )
  select
    s.id,
    private.shown_name(s.id, 'first_name'),
    private.shown_name(s.id, 'last_name'),
    s.preferred_language,
    s.avatar_url,
    s.media_consent_at is not null,
    s.terms_accepted_at,
    s.is_active,
    s.is_forum_banned,
    s.anonymized_at,
    s.created_at,
    s.updated_at,
    -- Counted (RAPP-306): earlier seasons plus the seasons she signed.
    private.season_number(s.id),
    -- The medical answer needs its own permission (RAPP-304); the emergency
    -- contact follows the personal and sensitive levels.
    case when (select private.participant_permission(participant_id, 'participants.view_health')) then public.decrypt_field(s.health_info) end,
    case when (select private.participant_permission(participant_id, private.emergency_contact_permission(s.org_id, s.emergency_contact_privacy))) then s.emergency_contact_name end,
    case when (select private.participant_permission(participant_id, private.emergency_contact_permission(s.org_id, s.emergency_contact_privacy))) then s.emergency_contact_relation end,
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.emergency_contact_phone) end,
    s.is_test_account,
    -- Joined or not, as the writers decide it: only an invited woman is completed in parts.
    s.role,
    -- Every other field, each by its own level (D9).
    private.field_answers_for(s.id, false)
  from subject s;
$function$;

CREATE OR REPLACE FUNCTION public.get_own_profile()
 RETURNS TABLE(id uuid, first_name text, last_name text, preferred_language text, avatar_url text, media_consent boolean, terms_accepted_at timestamp with time zone, season_number smallint, health_info text, emergency_contact_name text, emergency_contact_relation text, emergency_contact_phone text, answers jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.id,
    private.shown_name(p.id, 'first_name'),
    private.shown_name(p.id, 'last_name'),
    p.preferred_language,
    p.avatar_url,
    p.media_consent_at is not null,
    p.terms_accepted_at,
    private.season_number(p.id),
    public.decrypt_field(p.health_info),
    p.emergency_contact_name,
    p.emergency_contact_relation,
    public.decrypt_field(p.emergency_contact_phone),
    -- She reads every answer about her, whatever its level.
    private.field_answers_for(p.id, true)
  from public.profiles p
  where p.id = (select auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.get_conversation_peer(p_user_id uuid)
 RETURNS TABLE(id uuid, first_name text, last_name text, role text, city text, preferred_language text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    peer.id,
    private.shown_name(peer.id, 'first_name'),
    private.shown_name(peer.id, 'last_name'),
    peer.role,
    private.city_for_reader(peer.id),
    peer.preferred_language
  from public.profiles as peer
  where peer.id = p_user_id
    and peer.org_id = (select public.current_org_id())
    and peer.role in ('player', 'entity')
    and (peer.id = (select auth.uid()) or (select public.has_permission('messages.inbox')));
$function$;

CREATE OR REPLACE FUNCTION public.list_staff_conversations(p_unread_only boolean DEFAULT false, p_assigned_to_me boolean DEFAULT false, p_participant_role text DEFAULT 'all'::text, p_query text DEFAULT ''::text)
 RETURNS TABLE(conversation_id uuid, participant_id uuid, participant_first_name text, participant_last_name text, participant_role text, participant_city text, participant_language text, assigned_staff_id uuid, assigned_staff_first_name text, assigned_staff_last_name text, unread_count bigint, latest_message_at timestamp with time zone, latest_message_preview text, latest_sender_id uuid, conversation_created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  search_query tsquery := private.conversation_prefix_tsquery(left(coalesce(p_query, ''), 200));
begin
  if actor is null or not (select public.has_permission('messages.inbox')) then
    raise exception 'only staff may list organization conversations'
      using errcode = 'insufficient_privilege';
  end if;
  if p_participant_role not in ('all', 'player', 'entity') then
    raise exception 'invalid conversation participant filter'
      using errcode = 'check_violation';
  end if;

  return query
  select
    conversation.id,
    participant.id,
    private.shown_name(participant.id, 'first_name'),
    private.shown_name(participant.id, 'last_name'),
    participant.role,
    -- Her municipality at its field's level (RAPP-662, D9).
    private.city_for_reader(participant.id),
    participant.preferred_language,
    conversation.assigned_staff_id,
    assigned.first_name,
    assigned.last_name,
    unread.total,
    latest.created_at,
    left(latest.content, 160),
    latest.sender_id,
    conversation.created_at
  from public.conversations as conversation
  join public.profiles as participant
    on participant.org_id = conversation.org_id
   and participant.id = conversation.user_id
  left join public.profiles as assigned
    on assigned.org_id = conversation.org_id
   and assigned.id = conversation.assigned_staff_id
  left join public.conversation_read_states as read_state
    on read_state.conversation_id = conversation.id
   and read_state.user_id = actor
  left join public.messages as read_message
    on read_message.id = read_state.last_read_message_id
  left join lateral (
    select message.sender_id, message.content, message.created_at
    from public.messages as message
    where message.conversation_id = conversation.id
    order by message.created_at desc, message.id desc
    limit 1
  ) as latest on true
  cross join lateral (
    select count(*)::bigint as total
    from public.messages as message
    where message.conversation_id = conversation.id
      and message.sender_id <> actor
      and (
        read_message.id is null
        or (message.created_at, message.id) > (read_message.created_at, read_message.id)
      )
  ) as unread
  where conversation.org_id = (select public.current_org_id())
    and (not p_unread_only or unread.total > 0)
    and (not p_assigned_to_me or conversation.assigned_staff_id = actor)
    and (p_participant_role = 'all' or participant.role = p_participant_role)
    and (
      search_query is null
      or to_tsvector(
        'simple',
        public.immutable_unaccent(
          concat_ws(' ', private.shown_name(participant.id, 'first_name'), private.shown_name(participant.id, 'last_name'))
        ) || ' ' || concat_ws(' ', private.shown_name(participant.id, 'first_name'), private.shown_name(participant.id, 'last_name'))
      ) @@ search_query
    )
  order by
    (unread.total > 0) desc,
    latest.created_at desc nulls last,
    conversation.created_at desc,
    conversation.id
  limit 200;
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
           -- Her names are columns of their own (D2).
           and f.system_key is distinct from 'first_name'
           and f.system_key is distinct from 'last_name'
           and (p_scope = 'full' or f.privacy <> 'sensitive')
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
      and (p_scope = 'full' or field.privacy <> 'sensitive');
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
    from public.authorization_consent_events event
    join public.profiles profile on profile.id = event.profile_id
    left join public.authorization_versions version on version.id = event.version_id
    left join public.seasons season on season.id = version.season_id
    where event.org_id = actor_org
      and profile.role = 'player'
      and not profile.is_test_account
      and (start_instant is null or event.decided_at >= start_instant)
      and (end_instant is null or event.decided_at < end_instant);
  elsif p_dataset = 'attendance' then
    export_columns := '["attendance_id","occurrence_id","event_id","category_id","player_id","first_name","last_name","status","marked_at","starts_at","ends_at","event_title_ca","event_title_es","event_title_en","event_title_ar","event_title_fa","event_location","category_name_ca","category_name_es","category_name_en","category_name_ar","category_name_fa"]'::jsonb;
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
      'event_title_ar', report.event_title ->> 'ar',
      'event_title_fa', report.event_title ->> 'fa',
      'event_location', report.event_location,
      'category_name_ca', report.category_name ->> 'ca',
      'category_name_es', report.category_name ->> 'es',
      'category_name_en', report.category_name ->> 'en',
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
    export_columns := '["id","category_id","title_ca","title_es","title_en","title_ar","title_fa","location","starts_at","ends_at","time_zone","status","signup_mode","max_participants","created_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', event.id,
      'category_id', event.category_id,
      'title_ca', event.title ->> 'ca',
      'title_es', event.title ->> 'es',
      'title_en', event.title ->> 'en',
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

CREATE OR REPLACE FUNCTION public.preview_notification_audience(p_audience_kind text, p_audience_config jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(participant_id uuid, full_name text, language text, device_count integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not (select public.has_permission('notifications.send')) then
    raise exception 'NOTIFICATIONS/STAFF_ONLY' using errcode = '42501';
  end if;
  if p_audience_kind not in ('all', 'interest', 'signup', 'entity', 'custom_group') then
    raise exception 'NOTIFICATIONS/INVALID_AUDIENCE' using errcode = '22023';
  end if;

  return query
  select
    profile.id,
    btrim(private.shown_name(profile.id, 'first_name') || ' ' || private.shown_name(profile.id, 'last_name')),
    case
      when profile.preferred_language in ('ca', 'es', 'en', 'ar', 'fa')
        then profile.preferred_language
      else 'ca'
    end,
    count(distinct push_token.id)::integer
  from public.profiles as profile
  join public.push_tokens as push_token on push_token.user_id = profile.id
  where profile.org_id = (select public.current_org_id())
    and profile.role = 'player'
    and profile.is_active
    and not (select private.is_test_player(profile.id))
    and profile.push_notifications_enabled
    and (
      p_audience_kind = 'all'
      or (
        p_audience_kind = 'interest'
        and exists (
          select 1
          from public.service_interests as interest
          join public.services as service
            on service.org_id = interest.org_id
           and service.id = interest.service_id
          where interest.org_id = profile.org_id
            and interest.user_id = profile.id
            and service.category_id = nullif(p_audience_config->>'service_category_id', '')::uuid
        )
      )
      or (
        p_audience_kind = 'signup'
        and exists (
          select 1
          from public.event_signups as signup
          where signup.org_id = profile.org_id
            and signup.player_id = profile.id
            and signup.event_id = nullif(p_audience_config->>'event_id', '')::uuid
            and signup.state in ('interested', 'confirmed')
        )
      )
      or (
        p_audience_kind = 'entity'
        -- Her entity at its field's level (RAPP-662, D9).
        and lower(private.entity_audience_text(profile.id)) =
          lower(btrim(nullif(p_audience_config->>'entity_name', '')))
      )
      or (
        p_audience_kind = 'custom_group'
        and exists (
          select 1
          from public.custom_notification_group_members as membership
          where membership.org_id = profile.org_id
            and membership.participant_id = profile.id
            and membership.group_id = nullif(p_audience_config->>'custom_group_id', '')::uuid
        )
      )
    )
  group by profile.id, private.shown_name(profile.id, 'first_name'), private.shown_name(profile.id, 'last_name'), profile.preferred_language
  order by private.shown_name(profile.id, 'last_name'), private.shown_name(profile.id, 'first_name'), profile.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.season_registration_status(p_season_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profile_id uuid, first_name text, last_name text, registered boolean, method text, signed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := (select public.current_org_id());
  season uuid := coalesce(p_season_id, private.current_season_id(actor_org));
begin
  if not (select public.has_permission('participants.view_personal')) then
    raise insufficient_privilege using message = 'the season view needs participants.view_personal';
  end if;
  if not exists (select 1 from public.seasons where id = season and org_id = actor_org and not is_test_fixture) then
    return;
  end if;
  return query
    select p.id, private.shown_name(p.id, 'first_name'), private.shown_name(p.id, 'last_name'), latest.id is not null, latest.method, latest.signed_at
      from public.profiles p
      left join lateral (
        select sig.id, sig.method, sig.signed_at
          from public.authorization_signatures sig
         where sig.profile_id = p.id and sig.season_id = season
         order by sig.signed_at desc
         limit 1
      ) latest on true
     where p.org_id = actor_org and p.role = 'player' and p.is_active and not p.is_test_account
     order by (latest.id is not null), private.shown_name(p.id, 'last_name'), private.shown_name(p.id, 'first_name');
end;
$function$;

CREATE OR REPLACE FUNCTION public.checkout_recipients()
 RETURNS TABLE(profile_id uuid, first_name text, last_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.id, private.shown_name(p.id, 'first_name'), private.shown_name(p.id, 'last_name')
  from public.profiles p
  where p.org_id = (select public.current_org_id())
    and p.role in ('staff', 'admin')
    and p.is_active
    and ((select public.has_permission('equipment.receive')) or (select public.has_permission('equipment.count')))
  order by private.shown_name(p.id, 'first_name'), private.shown_name(p.id, 'last_name'), p.id;
$function$;

CREATE OR REPLACE FUNCTION public.list_staff_mentoring_requests()
 RETURNS TABLE(id uuid, player_id uuid, player_first_name text, player_last_name text, topic text, topic_detail text, preferred_date date, preferred_time time without time zone, status text, scheduled_at timestamp with time zone, assigned_staff_id uuid, assigned_staff_name text, staff_notes text, completed_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    request.id,
    request.player_id,
    private.shown_name(player.id, 'first_name'),
    private.shown_name(player.id, 'last_name'),
    request.topic,
    case
      when request.topic_detail_encrypted is null then null
      else public.decrypt_field(request.topic_detail_encrypted)
    end,
    request.preferred_date,
    request.preferred_time,
    request.status,
    request.scheduled_at,
    request.assigned_staff_id,
    case
      when staff.id is null then null
      else concat_ws(' ', staff.first_name, staff.last_name)
    end,
    case
      when request.staff_notes_encrypted is null then null
      else public.decrypt_field(request.staff_notes_encrypted)
    end,
    request.completed_at,
    request.created_at,
    request.updated_at
  from public.mentoring_requests as request
  join public.profiles as player
    on player.org_id = request.org_id
   and player.id = request.player_id
  left join public.profiles as staff
    on staff.org_id = request.org_id
   and staff.id = request.assigned_staff_id
  where request.org_id = (select public.current_org_id())
    and public.has_permission('mentoring.manage')
  order by
    case request.status
      when 'requested' then 0
      when 'scheduled' then 1
      when 'completed' then 2
      else 3
    end,
    request.created_at,
    request.id;
$function$;

CREATE OR REPLACE FUNCTION public.list_survey_responses(p_survey_id uuid)
 RETURNS TABLE(id uuid, player_id uuid, player_name text, language text, answers jsonb, status text, completed_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (select public.has_permission('surveys.results')) then
    raise exception 'SURVEYS/STAFF_ONLY' using errcode = '42501';
  end if;
  return query
  select
    response.id,
    response.player_id,
    btrim(private.shown_name(profile.id, 'first_name') || ' ' || private.shown_name(profile.id, 'last_name')),
    case when profile.preferred_language in ('ca', 'es', 'en', 'ar', 'fa')
      then profile.preferred_language else 'ca' end,
    public.decrypt_field(response.answers_encrypted)::jsonb,
    response.status,
    response.completed_at,
    response.updated_at
  from public.survey_responses as response
  join public.profiles as profile
    on profile.org_id = response.org_id and profile.id = response.player_id
  where response.org_id = (select public.current_org_id())
    and response.survey_id = p_survey_id
    and not profile.is_test_account
  order by response.completed_at desc nulls last, response.updated_at desc, response.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.participant_activity(participant_id uuid)
 RETURNS TABLE(id uuid, kind text, occurred_at timestamp with time zone, title text, detail text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select events.id, events.kind, events.occurred_at, events.title, events.detail
  from (
    select
      interest.id,
      'service_interest'::text as kind,
      interest.created_at as occurred_at,
      coalesce(service.title->>'ca', service.title->>'en', '') as title,
      nullif(concat_ws(' · ', nullif(service.provider_name, ''), nullif(category.name->>'ca', '')), '') as detail,
      interest.user_id as profile_id
    from public.service_interests as interest
    join public.services as service
      on service.org_id = interest.org_id and service.id = interest.service_id
    join public.service_categories as category
      on category.org_id = service.org_id and category.id = service.category_id

    union all

    select
      message.id,
      'message'::text,
      message.created_at,
      concat_ws(' ', private.shown_name(sender.id, 'first_name'), private.shown_name(sender.id, 'last_name')),
      message.content,
      conversation.user_id
    from public.messages as message
    join public.conversations as conversation
      on conversation.org_id = message.org_id and conversation.id = message.conversation_id
    join public.profiles as sender
      on sender.org_id = message.org_id and sender.id = message.sender_id
    where conversation.user_id = participant_id

    union all

    select
      referral_update.id,
      'referral_update'::text,
      referral_update.created_at,
      concat_ws(' ', entity.first_name, entity.last_name),
      private.referral_update_content(referral_update.id),
      referral.referred_profile_id
    from public.referral_updates as referral_update
    join public.entity_referrals as referral
      on referral.org_id = referral_update.org_id and referral.id = referral_update.referral_id
    join public.profiles as entity
      on entity.org_id = referral.org_id and entity.id = referral.entity_user_id
    where referral.referred_profile_id = participant_id

    union all

    select
      submission.id,
      'feedback'::text,
      submission.created_at,
      submission.type,
      private.feedback_content(submission.id),
      submission.author_id
    from public.feedback_submissions as submission
    where submission.author_id = participant_id

    union all

    select
      mark.id,
      'attendance'::text,
      occurrence.starts_at,
      coalesce(event.title->>'ca', event.title->>'en', ''),
      mark.status,
      mark.player_id
    from public.attendance as mark
    join public.event_occurrences as occurrence
      on occurrence.org_id = mark.org_id and occurrence.id = mark.occurrence_id
    join public.events as event
      on event.org_id = occurrence.org_id and event.id = occurrence.event_id
    where mark.player_id = participant_id

    union all

    select
      signup.id,
      'event_signup'::text,
      signup.created_at,
      coalesce(event.title->>'ca', event.title->>'en', ''),
      signup.state,
      signup.player_id
    from public.event_signups as signup
    join public.events as event
      on event.org_id = signup.org_id and event.id = signup.event_id
    where signup.player_id = participant_id
  ) as events
  where events.profile_id = participant_id
  order by events.occurred_at desc, events.id;
$function$;

CREATE OR REPLACE FUNCTION public.list_staff_feedback_submissions(p_type text DEFAULT NULL::text, p_status text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, author_id uuid, author_first_name text, author_last_name text, type text, content text, image_url text, status text, resolved_by uuid, resolved_at timestamp with time zone, conversation_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.has_permission('feedback.view') then
    raise exception 'only staff may list feedback' using errcode = 'insufficient_privilege';
  end if;
  if p_type is not null and p_type not in ('activity_proposal', 'idea', 'problem', 'general') then
    raise check_violation using message = 'invalid feedback type filter';
  end if;
  if p_status is not null and p_status not in ('new', 'read', 'in_progress', 'resolved') then
    raise check_violation using message = 'invalid feedback status filter';
  end if;

  return query
  select
    submission.id,
    submission.author_id,
    private.shown_name(author.id, 'first_name'),
    private.shown_name(author.id, 'last_name'),
    submission.type,
    public.decrypt_field(submission.content_encrypted),
    submission.image_url,
    submission.status,
    submission.resolved_by,
    submission.resolved_at,
    conversation.id,
    submission.created_at,
    submission.updated_at
  from public.feedback_submissions as submission
  join public.profiles as author
    on author.org_id = submission.org_id and author.id = submission.author_id
  join public.conversations as conversation
    on conversation.org_id = submission.org_id and conversation.user_id = submission.author_id
  where submission.org_id = (select public.current_org_id())
    and (p_type is null or submission.type = p_type)
    and (p_status is null or submission.status = p_status)
  order by submission.created_at desc, submission.id desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.participant_form_signatures(p_profile_id uuid)
 RETURNS TABLE(id uuid, surface text, block_id uuid, screen_key text, body text, language text, signer_kind text, signer_name text, strokes jsonb, signed_at timestamp with time zone, signed_on_tablet boolean, witnessed_by_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := (select public.current_org_id());
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view_personal')) then
    raise insufficient_privilege using message = 'her signatures need participants.view_personal';
  end if;
  return query
  select g.id, g.surface, g.block_id, g.screen_key, g.body, g.language, g.signer_kind,
         -- The name she signed with, to a viewer who may read her name (RAPP-693).
         case when g.signer_kind = 'player' and g.profile_id is not null
                   and not private.can_read_name(g.profile_id, (select auth.uid()), 'first_name')
              then private.display_name(g.profile_id) else g.signer_name end,
         g.strokes, g.signed_at, g.signed_on_tablet,
         (select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
            from public.profiles p where p.id = g.witnessed_by)
    from public.form_signatures g
   where g.org_id = actor_org
     and (g.profile_id = p_profile_id
          or g.referral_id in (select r.id from public.entity_referrals r
                                where r.referred_profile_id = p_profile_id))
   order by g.signed_at, g.id;
end;
$function$;

create or replace view public.attendance_report_rows with (security_invoker = true) as
SELECT attendance.id AS attendance_id,
    attendance.org_id,
    attendance.occurrence_id,
    occurrence.event_id,
    event.category_id,
    attendance.player_id,
    private.shown_name(profile.id, 'first_name') AS first_name,
    private.shown_name(profile.id, 'last_name') AS last_name,
    attendance.status,
    attendance.marked_at,
    occurrence.starts_at,
    occurrence.ends_at,
    event.title AS event_title,
    event.location AS event_location,
    category.name AS category_name,
    category.color AS category_color,
    ( SELECT private.is_test_player(attendance.player_id) AS is_test_player) AS is_test_account
   FROM attendance
     JOIN event_occurrences occurrence ON occurrence.id = attendance.occurrence_id AND occurrence.org_id = attendance.org_id
     JOIN events event ON event.id = occurrence.event_id AND event.org_id = occurrence.org_id
     JOIN event_categories category ON category.id = event.category_id AND category.org_id = event.org_id
     JOIN profiles profile ON profile.id = attendance.player_id AND profile.org_id = attendance.org_id;
