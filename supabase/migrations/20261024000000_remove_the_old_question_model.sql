-- Remove the old question model (RAPP-656).
--
-- WHY
--
-- RAPP-649 moved what we know about her to fields, sections and placements,
-- and kept the old question shape alive so each later step could ship on its
-- own: the view `custom_questions` with an INSTEAD OF trigger, the old writers
-- as wrappers, the holder screens of RAPP-642 and `legacy_screen_id`. RAPP-650
-- to RAPP-655 moved every reader and writer to the new model: the Fitxa, the
-- onboarding picker, the entity form, her page, the menu and her app. Nothing
-- reads the old shape any more, so this is the contract step: one shape, one
-- place to change it, no second path around the privacy rules.
--
-- WHAT GOES
--
--   1. The view `custom_questions`, its INSTEAD OF trigger and the helpers that
--      took its row type. `custom_answer_valid`, `custom_answer_text` and
--      `write_custom_answer` now take a `profile_fields` row: a field is
--      seasonal when it is placed on the season form.
--   2. The old writers: `save_custom_question`, `archive_custom_question`,
--      `reorder_custom_questions`, `save_custom_question_required`,
--      `ensure_builtin_screen_holder`, and `save_referral_custom_answers` (the
--      portal and the phone send the entity's answers inside
--      `create_entity_referral` since RAPP-652 and RAPP-655). Their private
--      workers `check_legacy_placements`, `apply_legacy_question_shape`,
--      `legacy_question_section` and the "privacy never changes" switch of
--      `write_profile_field` go with them.
--   3. The holder screens: their rows (after checking that no placement names
--      one), the column `intake_screens.builtin_screen`, its index and check,
--      and `profile_fields.legacy_screen_id`.
--
-- WHAT CHANGES
--
--   4. Every function that read the view reads fields and placements:
--      required where she answers it means a required placement on her
--      onboarding or her season form; asked of her means placed there; on the
--      referral form means placed on `entity_form`.
--   5. Archiving a Ramassà screen removes the placements on it. The fields
--      stay on the Fitxa with their answers, and the team can place them again.
--   6. The custom answers export names the Fitxa section of each answer,
--      since a field no longer belongs to a screen.
--   7. The setup file is schema version 3: screens, sections, fields and
--      placements, and nothing of the old shape. Versions 1 and 2 still import
--      (the launch script, RAPP-621, may meet one), read as version 3 by
--      `private.onboarding_setup_as_version_3`: a holder becomes the app
--      screen it held, a question becomes a field with its placements.
--   8. The bell row of a new field opens `/profile-layout` (RAPP-654).
--
-- The four data foreign keys stay on `profile_fields(id)`. The seeded
-- onboarding is unchanged: the seed writes fields and placements already.
--
-- Docs: https://www.postgresql.org/docs/17/sql-dropview.html,
-- https://www.postgresql.org/docs/17/sql-altertable.html (DROP COLUMN),
-- https://www.postgresql.org/docs/17/plpgsql-declarations.html (row types),
-- https://supabase.com/docs/guides/database/functions (security definer
-- functions with an empty search path).

-- 1. Field helpers ------------------------------------------------------------------------------------------

-- A field is asked again each season, one answer per season, when it is placed
-- on the season form.
create or replace function private.field_is_seasonal(p_field_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.field_placements p
                  where p.field_id = p_field_id and p.surface = 'season');
$$;

-- She must answer it where she is asked it: a required placement on her
-- onboarding or her season form.
create or replace function private.field_required_for_her(p_field_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.field_placements p
                  where p.field_id = p_field_id and p.surface in ('onboarding', 'season') and p.required);
$$;

-- She is asked it: placed on her onboarding or her season form.
create or replace function private.field_asked_of_her(p_field_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.field_placements p
                  where p.field_id = p_field_id and p.surface in ('onboarding', 'season'));
$$;

revoke all on function private.field_is_seasonal(uuid) from public, anon, authenticated;
revoke all on function private.field_required_for_her(uuid) from public, anon, authenticated;
revoke all on function private.field_asked_of_her(uuid) from public, anon, authenticated;

-- The three row helpers, on the field's row type.
create function private.custom_answer_valid(p_field public.profile_fields, p_value jsonb)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.custom_answer_value_valid(
    p_field.question_type, p_field.settings, p_value,
    array(select o.id::text from public.custom_question_options o
           where o.question_id = p_field.id and not o.is_archived));
$$;

create function private.custom_answer_text(p_field public.profile_fields, p_value jsonb)
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
    when p_field.question_type = 'consent' then
      case when p_value = 'true'::jsonb then 'Sí' else 'No' end
    when p_field.question_type = 'signature' then 'Signat'
    when p_field.question_type = 'file_upload' then 'Fitxer: ' || coalesce(p_value ->> 'name', '')
    else p_value #>> '{}'
  end;
$$;

create function private.write_custom_answer(
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
  -- Her own answers name nobody; a staff write with no name given is the
  -- signed-in team member's.
  author uuid := case
    when p_source = 'player' then null
    when p_source = 'staff' then coalesce(p_answered_by, (select auth.uid()))
    else p_answered_by
  end;
begin
  if p_field.kind <> 'custom' then
    raise check_violation using message = 'the app keeps its own fields in her profile';
  end if;
  if p_field.question_type in ('file_upload', 'signature') and p_source <> 'player'
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
$$;

revoke all on function private.custom_answer_valid(public.profile_fields, jsonb) from public, anon, authenticated;
revoke all on function private.custom_answer_text(public.profile_fields, jsonb) from public, anon, authenticated;
revoke all on function private.write_custom_answer(uuid, public.profile_fields, jsonb, text, uuid)
  from public, anon, authenticated;

-- 2. The readers and writers of answers -----------------------------------------------------------------------

create or replace function private.adopt_referral_answers(p_referral_id uuid, p_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  answer record;
  field public.profile_fields;
  adopted uuid[] := '{}';
  skipped integer := 0;
  referral_org uuid;
  referrer uuid;
  actor uuid := (select auth.uid());
begin
  select org_id, entity_user_id into referral_org, referrer
    from public.entity_referrals where id = p_referral_id;
  if referral_org is null or p_profile_id is null then
    return 0;
  end if;
  -- The app's own fields the entity gave were written just before, by the
  -- prefill, which does not know the referral: they are named here.
  update public.profile_answers
     set answered_by = referrer
   where profile_id = p_profile_id and source = 'entity' and answered_by is null;
  for answer in
    select r.question_id, (public.decrypt_field(r.value_encrypted))::jsonb as value
      from public.referral_custom_answers r
     where r.referral_id = p_referral_id
  loop
    field := null;
    select * into field from public.profile_fields f
     where f.id = answer.question_id and f.org_id = referral_org and f.kind = 'custom';
    -- What she or the team already answered stays: a later surface asks again
    -- only through her per-player choice.
    if field.id is null or exists (
         select 1 from public.custom_answers a
          where a.profile_id = p_profile_id and a.question_id = field.id
            and (a.season_id is null or a.season_id = private.current_season_id(referral_org))) then
      skipped := skipped + 1;
      continue;
    end if;
    begin
      perform private.write_custom_answer(p_profile_id, field, answer.value, 'entity', referrer);
      adopted := adopted || field.id;
    exception when check_violation or insufficient_privilege then
      -- An option archived since, or a seasonal field with no season: the
      -- referral keeps no copy either way.
      skipped := skipped + 1;
    end;
  end loop;
  delete from public.referral_custom_answers where referral_id = p_referral_id;
  -- Field ids only, never an answer. A row written with nobody signed in (a
  -- seed, a migration) has no actor to name.
  if actor is not null and (cardinality(adopted) > 0 or skipped > 0) then
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
    values (referral_org, actor, 'intake.entity_answers_adopted', 'entity_referral', p_referral_id,
            jsonb_build_object('profile_id', p_profile_id, 'fields', to_jsonb(adopted), 'skipped', skipped));
  end if;
  return cardinality(adopted);
end;
$$;

create or replace function private.save_player_custom_answers(p_profile_id uuid, p_org_id uuid, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry record;
  field public.profile_fields;
begin
  if jsonb_typeof(p_answers) <> 'object' then
    raise check_violation using message = 'answers must be an object';
  end if;
  for entry in select key, value from jsonb_each(p_answers) loop
    field := null;
    select * into field from public.profile_fields f
     where f.id::text = entry.key and f.org_id = p_org_id and f.kind = 'custom' and not f.is_archived
       and private.field_asked_of_her(f.id);
    if field.id is null then
      raise insufficient_privilege using message = 'not a question she is asked';
    end if;
    perform private.write_custom_answer(p_profile_id, field, entry.value, 'player');
  end loop;
end;
$$;

create or replace function private.save_referral_field_answers(p_referral public.entity_referrals, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry record;
  field public.profile_fields;
  tidied jsonb;
begin
  if jsonb_typeof(p_answers) <> 'object' then
    raise check_violation using message = 'answers must be an object';
  end if;
  for entry in select key, value from jsonb_each(p_answers) loop
    field := null;
    select * into field from public.profile_fields f
     where f.id::text = entry.key and f.org_id = p_referral.org_id and f.kind = 'custom'
       and not f.is_archived
       and exists (select 1 from public.field_placements p
                    where p.field_id = f.id and p.surface = 'entity_form');
    if field.id is null then
      raise insufficient_privilege using message = 'not a question of the referral form';
    end if;
    if private.custom_answer_is_empty(entry.value) then
      delete from public.referral_custom_answers
       where referral_id = p_referral.id and question_id = field.id;
      continue;
    end if;
    tidied := private.custom_answer_tidied(field.question_type, entry.value);
    if not private.custom_answer_valid(field, tidied) then
      raise check_violation using message = 'the answer does not fit the question';
    end if;
    insert into public.referral_custom_answers (referral_id, question_id, org_id, value_encrypted)
    values (p_referral.id, field.id, p_referral.org_id, public.encrypt_field(tidied::text))
    on conflict (referral_id, question_id) do update set value_encrypted = excluded.value_encrypted;
  end loop;
end;
$$;

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
  field public.profile_fields;
begin
  if jsonb_typeof(fill) <> 'object' or jsonb_typeof(clear) <> 'array' then
    raise invalid_parameter_value using message = 'custom answers take a fill object and a clear list';
  end if;
  for entry in select key, value from jsonb_each(fill) loop
    field := null;
    select * into field from public.profile_fields f
     where f.id::text = entry.key and f.org_id = p_target.org_id and f.kind = 'custom' and not f.is_archived;
    if field.id is null then
      raise no_data_found using message = 'no such question';
    end if;
    if field.privacy = 'sensitive'
       and not (select private.participant_permission(p_target.id, 'participants.view_sensitive')) then
      raise insufficient_privilege using message = 'a Sensitive answer needs participants.view_sensitive';
    end if;
    perform private.write_custom_answer(p_target.id, field, entry.value, 'staff');
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

create or replace function public.set_participant_custom_answers(p_profile_id uuid, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
  actor uuid := (select auth.uid());
  entry record;
  field public.profile_fields;
  changed text[] := '{}';
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view_personal')) then
    raise insufficient_privilege using message = 'editing her answers needs participants.view_personal';
  end if;
  if not exists (select 1 from public.profiles
                  where id = p_profile_id and org_id = actor_org and role in ('player', 'invited')) then
    raise no_data_found using message = 'no such participant';
  end if;
  if jsonb_typeof(p_answers) <> 'object' then
    raise check_violation using message = 'answers must be an object';
  end if;
  for entry in select key, value from jsonb_each(p_answers) loop
    field := null;
    select * into field from public.profile_fields f
     where f.id::text = entry.key and f.org_id = actor_org and f.kind = 'custom' and not f.is_archived;
    if field.id is null then
      raise no_data_found using message = 'no such question';
    end if;
    if field.privacy = 'sensitive' and not (select private.participant_permission(p_profile_id, 'participants.view_sensitive')) then
      raise insufficient_privilege using message = 'a Sensitive answer needs participants.view_sensitive';
    end if;
    perform private.write_custom_answer(p_profile_id, field, entry.value, 'staff', actor);
    changed := changed || field.id::text;
  end loop;
  -- The questions only: answers may be Sensitive and never enter the log (ADR-004).
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'profile.custom_answers_update', 'profile', p_profile_id,
          jsonb_build_object('questions', to_jsonb(changed)));
end;
$$;

create or replace function public.participant_custom_answers(p_profile_id uuid)
returns table (question_id uuid, season_id uuid, season_name text, value jsonb, source text,
               answered_at timestamptz, answered_by_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
  sees_personal boolean := (select private.participant_permission(p_profile_id, 'participants.view_personal'));
  sees_sensitive boolean := (select private.participant_permission(p_profile_id, 'participants.view_sensitive'));
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view')) then
    raise insufficient_privilege using message = 'her answers need participants.view';
  end if;
  return query
  select a.question_id, a.season_id, s.name,
         coalesce(a.value, (public.decrypt_field(a.value_encrypted))::jsonb),
         a.source, a.answered_at,
         private.answer_author_name(a.answered_by, a.source, actor_org)
    from public.custom_answers a
    join public.profile_fields f on f.id = a.question_id
    left join public.seasons s on s.id = a.season_id
   where a.profile_id = p_profile_id
     and a.org_id = actor_org
     and (f.privacy = 'normal'
          or (f.privacy = 'personal' and sees_personal)
          or (f.privacy = 'sensitive' and sees_sensitive))
   order by f.sort_order, s.starts_on desc nulls first;
end;
$$;

create or replace function public.referral_custom_answers(p_referral_id uuid)
returns table (question_id uuid, value jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  referral public.entity_referrals;
  is_sender boolean;
  sees_personal boolean := (select public.has_permission('participants.view_personal'));
  sees_sensitive boolean := (select public.has_permission('participants.view_sensitive'));
begin
  select * into referral from public.entity_referrals where id = p_referral_id;
  is_sender := referral.entity_user_id = actor;
  if referral.id is null or not (
    is_sender
    or (referral.org_id = (select public.current_org_id())
        and (select public.has_permission('participants.view')))
  ) then
    raise insufficient_privilege using message = 'not your referral';
  end if;
  return query
  select r.question_id, (public.decrypt_field(r.value_encrypted))::jsonb
    from public.referral_custom_answers r
    join public.profile_fields f on f.id = r.question_id
   where r.referral_id = p_referral_id
     and (is_sender or f.privacy = 'normal'
          or (f.privacy = 'personal' and sees_personal)
          or (f.privacy = 'sensitive' and sees_sensitive));
end;
$$;

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
    select f.privacy, coalesce(a.value, (public.decrypt_field(a.value_encrypted))::jsonb) as value
      from public.custom_answers a
      join public.profile_fields f on f.id = a.question_id
     where a.profile_id = owner_id and f.question_type = 'file_upload'
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

-- What a required field she has not answered yet keeps open: 'wizard' is her
-- onboarding, 'season' her season form. A field on an archived Ramassà screen
-- is no longer asked.
create or replace function private.missing_required_custom_answers(p_profile_id uuid, p_placement text)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(f.id order by pl.sort_order, f.sort_order), array[]::uuid[])
    from public.profile_fields f
    join public.profiles p on p.id = p_profile_id and p.org_id = f.org_id
    join public.field_placements pl
      on pl.field_id = f.id and pl.required
     and pl.surface = case p_placement when 'wizard' then 'onboarding' when 'season' then 'season' end
   where f.kind = 'custom' and not f.is_archived
     and (pl.surface <> 'onboarding'
          or not private.is_uuid_text(pl.screen_key)
          or exists (select 1 from public.intake_screens s
                      where s.id = pl.screen_key::uuid and s.org_id = f.org_id and not s.is_archived))
     and not (private.field_is_seasonal(f.id) and private.current_season_id(f.org_id) is null)
     and (f.show_when_field_id is null or exists (
           select 1 from public.custom_answers c
            where c.profile_id = p_profile_id and c.question_id = f.show_when_field_id
              and coalesce(c.value, (public.decrypt_field(c.value_encrypted))::jsonb)
                  = to_jsonb(f.show_when_option_id::text)))
     and not exists (
           select 1 from public.custom_answers a
            where a.profile_id = p_profile_id and a.question_id = f.id
              and a.season_key = case when private.field_is_seasonal(f.id)
                                      then private.current_season_id(f.org_id)
                                      else '00000000-0000-0000-0000-000000000000'::uuid end);
$$;

create or replace function public.my_custom_question_asking()
returns table (question_id uuid, is_asked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.question_id,
         s.state = 'ask'
         -- Don't ask on a required field whose answer is missing is asked
         -- after all, so a finished profile is always complete.
         or (private.field_required_for_her(f.id) and not exists (
               select 1 from public.custom_answers a
                where a.profile_id = s.profile_id and a.question_id = s.question_id))
    from public.custom_question_states s
    join public.profile_fields f on f.id = s.question_id and f.kind = 'custom' and not f.is_archived
   where s.profile_id = (select auth.uid())
   order by s.question_id;
$$;

-- Per-player choices and the steps of her onboarding.

create or replace function private.apply_intake_question_states(p_profile_id uuid, p_states jsonb, p_actor uuid, p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  entry record;
  old_state text;
  custom_id uuid;
  custom_field public.profile_fields;
  changes jsonb := '{}'::jsonb;
begin
  if p_states is null or jsonb_typeof(p_states) <> 'object' then
    raise invalid_parameter_value using message = 'question states are an object';
  end if;

  for entry in select key as question, value as state from jsonb_each_text(p_states) loop
    if entry.state is null or entry.state not in ('auto', 'ask', 'skip') then
      raise invalid_parameter_value using message = 'unknown state ' || coalesce(entry.state, 'null');
    end if;

    -- A Ramassà field (RAPP-643).
    if entry.question like 'custom:%' then
      if entry.question !~ '^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise invalid_parameter_value using message = 'unknown question ' || entry.question;
      end if;
      custom_id := substr(entry.question, 8)::uuid;
      custom_field := null;
      select * into custom_field from public.profile_fields f
       where f.id = custom_id and f.org_id = p_org_id and f.kind = 'custom' and not f.is_archived;
      if custom_field.id is null then
        raise invalid_parameter_value using message = 'unknown question ' || entry.question;
      end if;
      if entry.state = 'skip' and private.field_required_for_her(custom_id)
         and not exists (
           select 1 from public.custom_answers a
            where a.profile_id = p_profile_id and a.question_id = custom_id)
      then
        raise check_violation
          using message = 'a required question needs an answer before it can be hidden: ' || entry.question;
      end if;

      select s.state into old_state from public.custom_question_states s
       where s.profile_id = p_profile_id and s.question_id = custom_id;
      old_state := coalesce(old_state, 'auto');
      continue when old_state = entry.state;

      if entry.state = 'auto' then
        delete from public.custom_question_states s
         where s.profile_id = p_profile_id and s.question_id = custom_id;
      else
        insert into public.custom_question_states (profile_id, org_id, question_id, state, updated_by)
        values (p_profile_id, p_org_id, custom_id, entry.state, p_actor)
        on conflict (profile_id, question_id) do update
          set state = excluded.state, updated_at = now(), updated_by = excluded.updated_by;
      end if;
      changes := changes || jsonb_build_object(
        entry.question, jsonb_build_object('old', old_state, 'new', entry.state));
      continue;
    end if;

    -- An app question, as before.
    if not (entry.question = any (private.wizard_intake_questions())) then
      raise invalid_parameter_value using message = 'unknown question ' || entry.question;
    end if;
    if entry.state = 'skip'
      and entry.question = any (private.required_intake_questions())
      and not exists (
        select 1 from public.profile_answers a
         where a.profile_id = p_profile_id and a.question = entry.question
      )
    then
      raise check_violation
        using message = 'a required question needs an answer before it can be hidden: ' || entry.question;
    end if;

    select s.state into old_state from public.intake_question_states s
     where s.profile_id = p_profile_id and s.question = entry.question;
    old_state := coalesce(old_state, 'auto');
    continue when old_state = entry.state;

    if entry.state = 'auto' then
      delete from public.intake_question_states s
       where s.profile_id = p_profile_id and s.question = entry.question;
    else
      insert into public.intake_question_states (profile_id, org_id, question, state, updated_by)
      values (p_profile_id, p_org_id, entry.question, entry.state, p_actor)
      on conflict (profile_id, question) do update
        set state = excluded.state, updated_at = now(), updated_by = excluded.updated_by;
    end if;
    changes := changes || jsonb_build_object(
      entry.question, jsonb_build_object('old', old_state, 'new', entry.state));
  end loop;

  if changes <> '{}'::jsonb then
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
    values (p_org_id, p_actor, 'profile.intake_questions_update', 'profile', p_profile_id, changes);
  end if;
end;
$function$;
create or replace function private.intake_flow_order_problem(p_org_id uuid, p_steps text[])
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
create or replace function public.place_field(p_field_id uuid, p_surface text, p_screen_key text DEFAULT NULL::text, p_required boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if field.kind = 'builtin' and p_surface <> 'entity_form' then
    raise check_violation using message = 'the app asks a built-in field on its own screen';
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
  if field.kind = 'builtin' and p_surface = 'entity_form'
     and not (field.builtin_key = any (private.builtin_entity_form_fields())) then
    raise check_violation using message = 'the entity form does not ask this built-in field';
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
$function$;
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
$function$;
-- 3. Screens and the referral form ---------------------------------------------------------------------------

-- Archiving a Ramassà screen removes the placements on it. The fields stay on
-- the Fitxa with their answers. A conditional field leaves before the field it
-- depends on, so the placement guard never sees one without the other.
create or replace function public.archive_intake_screen(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  removed uuid[] := '{}';
  batch uuid[];
begin
  update public.intake_screens set is_archived = true, updated_at = now()
   where id = p_id and org_id = actor_org;
  if not found then
    raise no_data_found using message = 'no such screen';
  end if;
  loop
    with leaves as (
      delete from public.field_placements p
       where p.org_id = actor_org and p.surface = 'onboarding' and p.screen_key = p_id::text
         and not exists (
           select 1 from public.profile_fields child
             join public.field_placements theirs on theirs.field_id = child.id
            where child.show_when_field_id = p.field_id
              and theirs.surface = 'onboarding' and theirs.screen_key = p.screen_key)
      returning p.field_id)
    select coalesce(array_agg(field_id), '{}') into batch from leaves;
    exit when cardinality(batch) = 0;
    removed := removed || batch;
  end loop;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.screen_archive', 'intake_screen', p_id,
          jsonb_build_object('fields', to_jsonb(removed)));
end;
$$;

-- Every required placement of the referral form: the app's fields by payload
-- key, Ramassà's by the answer saved with the referral (RAPP-652). Since
-- RAPP-656 the answers always come in the same call.
create or replace function private.check_entity_form_required(p_referral public.entity_referrals, p_payload jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  item record;
  payload_key text;
  is_missing boolean;
begin
  for item in
    select f.id, f.kind, f.builtin_key, f.show_when_field_id, f.show_when_option_id
      from public.field_placements p
      join public.profile_fields f on f.id = p.field_id
     where p.org_id = p_referral.org_id and p.surface = 'entity_form' and p.required
       and not f.is_archived
  loop
    if item.kind = 'builtin' then
      payload_key := private.entity_form_payload_key(item.builtin_key);
      is_missing := payload_key is not null
        and private.custom_answer_is_empty(p_payload -> payload_key);
    else
      -- A condition that does not apply asks nothing.
      if item.show_when_field_id is not null
         and (p_payload -> 'fields' ->> item.show_when_field_id::text)
             is distinct from item.show_when_option_id::text then
        continue;
      end if;
      is_missing := not exists (
        select 1 from public.referral_custom_answers r
         where r.referral_id = p_referral.id and r.question_id = item.id);
    end if;
    if is_missing then
      raise check_violation using message = 'a required field of the referral form is missing';
    end if;
  end loop;
end;
$$;

-- 4. The field writer loses the old wrapper's switch ---------------------------------------------------------

drop function public.save_custom_question(uuid, uuid, text, jsonb, jsonb, text, text[], jsonb, jsonb);
drop function private.write_profile_field(uuid, uuid, uuid, text, jsonb, jsonb, text, boolean, jsonb, jsonb, boolean);

create function private.write_profile_field(p_org_id uuid, p_id uuid, p_section_id uuid, p_type text, p_label jsonb, p_help jsonb, p_privacy text, p_default_required boolean, p_options jsonb, p_settings jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  existing public.profile_fields;
  saved_id uuid;
  is_choice boolean := p_type in ('single_choice', 'multiple_choice', 'search_choice');
  clean_settings jsonb := coalesce(nullif(p_settings, 'null'::jsonb), '{}'::jsonb);
  options jsonb := coalesce(nullif(p_options, 'null'::jsonb), '[]'::jsonb);
  option_item jsonb;
  position_index integer := 0;
  kept_ids uuid[] := '{}';
  option_id uuid;
  creator uuid := (select auth.uid());
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
    if existing.question_type <> p_type then
      raise check_violation using message = 'the type of a question never changes';
    end if;
    if existing.privacy <> p_privacy then
      if existing.kind = 'builtin' then
        raise check_violation using message = 'the privacy level of a question never changes';
      end if;
      if private.field_has_answers(existing.id) then
        raise check_violation using message = 'the privacy level of a field is fixed once it has answers';
      end if;
    end if;
    if existing.kind = 'builtin' then
      if jsonb_array_length(options) > 0
         or coalesce(p_default_required, existing.default_required) <> existing.default_required then
        raise check_violation using message = 'a built-in field keeps its options and its required default';
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
    update public.profile_fields
       set label = p_label, help = nullif(p_help, 'null'::jsonb), privacy = p_privacy,
           settings = clean_settings, default_required = coalesce(p_default_required, default_required),
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

  return saved_id;
end;
$function$;


revoke all on function private.write_profile_field(uuid, uuid, uuid, text, jsonb, jsonb, text, boolean, jsonb, jsonb)
  from public, anon, authenticated;

create or replace function public.save_profile_field(
  p_id uuid, p_section_id uuid, p_type text, p_label jsonb, p_help jsonb, p_privacy text,
  p_default_required boolean default false, p_options jsonb default '[]'::jsonb,
  p_settings jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  saved_id uuid;
begin
  saved_id := private.write_profile_field(
    actor_org, p_id, p_section_id, p_type, p_label, p_help, p_privacy, p_default_required,
    p_options, p_settings);
  -- The shape only: names and help are in the row.
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.field_save', 'profile_field', saved_id,
          jsonb_build_object('created', p_id is null, 'type', p_type, 'privacy', p_privacy,
                             'default_required', coalesce(p_default_required, false),
                             'options', (select count(*) from public.custom_question_options o
                                          where o.question_id = saved_id and not o.is_archived),
                             'settings', coalesce(nullif(p_settings, 'null'::jsonb), '{}'::jsonb)));
  return saved_id;
end;
$$;

-- 5. The setup file, version 3 -------------------------------------------------------------------------------

-- A file of version 1 or 2 as version 3 (RAPP-656). Version 2 carried the
-- layout already: its holder screens and its screens' questions are left out.
-- Version 1 carried questions on screens: each becomes a custom field of the
-- organization's section the old rule gives it (an app screen's section for a
-- question a holder held, else Support), with a placement for each place it
-- was asked. A question of an archived screen keeps no onboarding placement,
-- as archiving does today. Built-in fields are not in a version 1 file, so
-- the organization keeps its own.
create or replace function private.onboarding_setup_as_version_3(p_document jsonb, p_org_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  version integer := (p_document ->> 'schema_version')::integer;
  holders jsonb;
  converted jsonb;
begin
  if version = 3 then
    return p_document;
  end if;
  select coalesce(jsonb_object_agg(s ->> 'id', s ->> 'builtin_screen'), '{}'::jsonb) into holders
    from jsonb_array_elements(p_document -> 'screens') s
   where nullif(s ->> 'builtin_screen', '') is not null;

  converted := p_document || jsonb_build_object(
    'schema_version', 3,
    'screens', coalesce((
      select jsonb_agg(s - 'questions' - 'builtin_screen' order by ordinality)
        from jsonb_array_elements(p_document -> 'screens') with ordinality as listed(s, ordinality)
       where not holders ? (s ->> 'id')), '[]'::jsonb),
    'flow_order', case when jsonb_typeof(p_document -> 'flow_order') = 'array' then coalesce((
      select jsonb_agg(step order by ordinality)
        from jsonb_array_elements_text(p_document -> 'flow_order') with ordinality as listed(step, ordinality)
       where not (step like 'custom:%' and holders ? substr(step, 8))), '[]'::jsonb)
      else p_document -> 'flow_order' end);

  if version = 2 then
    return converted || jsonb_build_object('fields', coalesce((
      select jsonb_agg(f - 'legacy_screen_id' order by ordinality)
        from jsonb_array_elements(p_document -> 'fields') with ordinality as listed(f, ordinality)), '[]'::jsonb));
  end if;

  -- Version 1.
  return converted || (
    with question as (
      select q, s ->> 'id' as screen_id, holders ->> (s ->> 'id') as app_screen,
             coalesce((s ->> 'is_archived')::boolean, false) as screen_archived,
             array(select jsonb_array_elements_text(private.json_array_or_empty(q -> 'placements'))) as places,
             row_number() over (order by screen_order, question_order) as position
        from jsonb_array_elements(p_document -> 'screens') with ordinality as screens(s, screen_order),
             jsonb_array_elements(s -> 'questions') with ordinality as questions(q, question_order)
    ),
    section as (
      select sec.id, sec.key, sec.title, sec.sort_order
        from public.profile_sections sec where sec.org_id = p_org_id and sec.is_builtin
    ),
    placement as (
      select q ->> 'id' as field_id, 'onboarding' as surface, coalesce(app_screen, screen_id) as screen_key,
             q -> 'sort_order' as sort_order, coalesce((q ->> 'is_required')::boolean, false) as required
        from question
       where places && array['wizard', 'season']::text[] and not screen_archived
      union all
      select q ->> 'id', 'entity_form', null, q -> 'sort_order', false
        from question where 'entity_form' = any (places)
      union all
      select q ->> 'id', 'season', null, q -> 'sort_order', coalesce((q ->> 'is_required')::boolean, false)
        from question where 'season' = any (places)
    )
    select jsonb_build_object(
      'sections', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', section.id, 'key', section.key, 'title', section.title, 'sort_order', section.sort_order,
          'is_builtin', true) order by section.sort_order)
          from section), '[]'::jsonb),
      'fields', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', q ->> 'id',
          'section_id', (select section.id from section
                          where section.key = coalesce(private.app_screen_profile_section(app_screen), 'support')),
          'kind', 'custom', 'builtin_key', null,
          'question_type', q -> 'question_type', 'label', q -> 'label', 'help', q -> 'help',
          'privacy', q -> 'privacy', 'default_required', coalesce((q ->> 'is_required')::boolean, false),
          'settings', q -> 'settings',
          'show_when_field_id', q -> 'show_when_question_id', 'show_when_option_id', q -> 'show_when_option_id',
          'sort_order', 1000 + position, 'is_archived', coalesce((q ->> 'is_archived')::boolean, false),
          'options', private.json_array_or_empty(q -> 'options')) order by position)
          from question), '[]'::jsonb),
      'placements', coalesce((
        select jsonb_agg(jsonb_build_object(
          'field_id', field_id, 'surface', surface, 'screen_key', screen_key,
          'sort_order', sort_order, 'required', required,
          'label_override', null, 'help_override', null))
          from placement), '[]'::jsonb)));
end;
$$;

revoke all on function private.onboarding_setup_as_version_3(jsonb, uuid) from public, anon, authenticated;

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

-- What a file holds. A holder screen of an older file is no screen; the
-- questions are the custom fields (from the screens in a version 1 file).
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
    'authorization_versions', jsonb_array_length(private.json_array_or_empty(p_document -> 'authorization' -> 'published'))
      + case when private.json_value_or_null(p_document -> 'authorization' -> 'draft') is null then 0 else 1 end);
$$;

-- The referral form asks Ramassà's fields in the one call.
create or replace function public.create_entity_referral(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid;
  actor_org uuid;
  actor_role text;
  actor_entity uuid;
  first_name text := nullif(private.name_trim(p_payload ->> 'firstName'), '');
  last_name text := nullif(private.name_trim(p_payload ->> 'lastName'), '');
  phone text := nullif(btrim(p_payload ->> 'phone'), '');
  email text := nullif(lower(btrim(p_payload ->> 'email')), '');
  documentation text := p_payload ->> 'documentationStatus';
  referral_notes text := nullif(btrim(p_payload ->> 'notes'), '');
  -- The season registration answers (RAPP-303), in the profile's own keys so
  -- acceptance hands them to the profile unchanged. Empty answers are left out.
  answers jsonb := jsonb_strip_nulls(jsonb_build_object(
    'date_of_birth', nullif(btrim(p_payload ->> 'dateOfBirth'), ''),
    'nationality', nullif(btrim(p_payload ->> 'nationality'), ''),
    'document_type', nullif(btrim(p_payload ->> 'documentType'), ''),
    'document_number', nullif(upper(btrim(p_payload ->> 'documentNumber')), ''),
    'city', nullif(btrim(p_payload ->> 'city'), ''),
    'applicant_status', nullif(btrim(p_payload ->> 'applicantStatus'), ''),
    'applicant_status_details', nullif(btrim(p_payload ->> 'applicantStatusDetails'), ''),
    'supporting_entities', case
      when jsonb_typeof(p_payload -> 'supportingEntities') = 'array'
        and jsonb_array_length(p_payload -> 'supportingEntities') > 0
      then p_payload -> 'supportingEntities' end,
    'reference_contact_name', nullif(private.name_trim(p_payload ->> 'referenceContactName'), ''),
    'season_number', case when nullif(p_payload ->> 'seasonNumber', '') is not null
      then p_payload -> 'seasonNumber' end,
    'childcare_need', nullif(btrim(p_payload ->> 'childcareNeed'), ''),
    'specific_needs', nullif(btrim(p_payload ->> 'specificNeeds'), '')
  ));
  result uuid;
  referral public.entity_referrals;
begin
  select
    assert_referral_actor.actor_id,
    assert_referral_actor.actor_org_id,
    assert_referral_actor.actor_role
  into actor, actor_org, actor_role
  from private.assert_referral_actor();
  actor_entity := public.current_collaborating_entity_id();

  if actor_role <> 'entity' then
    raise exception 'only entity contacts may submit referrals'
      using errcode = 'insufficient_privilege';
  end if;

  if p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
    or p_payload - array[
      'firstName', 'lastName', 'phone', 'email', 'documentationStatus', 'notes',
      'dateOfBirth', 'nationality', 'documentType', 'documentNumber', 'city',
      'applicantStatus', 'applicantStatusDetails', 'supportingEntities', 'referenceContactName', 'seasonNumber',
      'childcareNeed', 'specificNeeds', 'consentConfirmed', 'fields'
    ] <> '{}'::jsonb
    or (p_payload ? 'fields' and jsonb_typeof(p_payload -> 'fields') <> 'object')
    or first_name is null
    or length(first_name) > 100
    or last_name is null
    or length(last_name) > 100
    or (phone is not null and length(phone) > 50)
    or (email is not null and (length(email) > 254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+$'))
    or documentation not in ('none', 'missing', 'in_progress', 'complete')
    or (referral_notes is not null and length(referral_notes) > 4000)
    -- She agreed that the entity shares her data with Ramassà (RAPP-303).
    or (p_payload -> 'consentConfirmed') is distinct from 'true'::jsonb
    or not private.referral_answers_valid(answers)
  then
    raise check_violation using message = 'invalid entity referral payload';
  end if;

  insert into public.entity_referrals (
    org_id,
    entity_user_id,
    collaborating_entity_id,
    referred_first_name,
    referred_last_name,
    referred_phone,
    referred_email,
    documentation_status,
    notes,
    intake_answers,
    consent_confirmed_at,
    consent_confirmed_by
  ) values (
    actor_org,
    actor,
    actor_entity,
    first_name,
    last_name,
    public.encrypt_field(phone),
    public.encrypt_field(email),
    documentation,
    public.encrypt_field(referral_notes),
    case when answers = '{}'::jsonb then null else public.encrypt_field(answers::text) end,
    now(),
    actor
  )
  returning * into referral;
  result := referral.id;

  -- Her Fitxa fields placed on the form (RAPP-652), saved in the same call so
  -- a referral is never left without them. This is the only way they reach a
  -- referral (RAPP-656): a required one left out refuses the referral below.
  if p_payload ? 'fields' then
    perform private.save_referral_field_answers(referral, p_payload -> 'fields');
  end if;
  perform private.check_entity_form_required(referral, p_payload);

  return result;
end;
$function$;


-- The custom answers export, the catalog, and the setup file.
create or replace function public.create_data_export(p_dataset text, p_scope text, p_format text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_reason text DEFAULT NULL::text, p_confirmed boolean DEFAULT false)
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

  if p_dataset = 'participants' and p_scope = 'default' then
    export_columns := '["id","first_name","last_name","date_of_birth","place_of_birth","nationality","preferred_language","city","reference_entity","reference_contact_name","has_dependents","num_dependents","clothing_size","shoe_size","is_active","created_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', profile.id,
      'first_name', profile.first_name,
      'last_name', profile.last_name,
      'date_of_birth', profile.date_of_birth,
      'place_of_birth', profile.place_of_birth,
      'nationality', profile.nationality,
      'preferred_language', profile.preferred_language,
      'city', profile.city,
      'reference_entity', profile.reference_entity,
      'reference_contact_name', profile.reference_contact_name,
      'has_dependents', profile.has_dependents,
      'num_dependents', profile.num_dependents,
      'clothing_size', profile.clothing_size,
      'shoe_size', profile.shoe_size,
      'is_active', profile.is_active,
      'created_at', profile.created_at
    ) order by profile.last_name, profile.first_name, profile.id), '[]'::jsonb)
    into export_rows
    from public.profiles profile
    where profile.org_id = actor_org
      and profile.role = 'player'
      and not profile.is_test_account;
  elsif p_dataset = 'participants' then
    export_columns := '["id","first_name","last_name","date_of_birth","place_of_birth","nationality","preferred_language","document_type","document_name","document_number","phone","address","city","postal_code","reference_entity","reference_contact_name","has_dependents","num_dependents","clothing_size","shoe_size","is_active","created_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', profile.id,
      'first_name', profile.first_name,
      'last_name', profile.last_name,
      'date_of_birth', profile.date_of_birth,
      'place_of_birth', profile.place_of_birth,
      'nationality', profile.nationality,
      'preferred_language', profile.preferred_language,
      'document_type', profile.document_type,
      'document_name', profile.document_name,
      'document_number', public.decrypt_field(profile.document_number),
      'phone', public.decrypt_field(profile.phone),
      'address', public.decrypt_field(profile.address),
      'city', profile.city,
      'postal_code', public.decrypt_field(profile.postal_code),
      'reference_entity', profile.reference_entity,
      'reference_contact_name', profile.reference_contact_name,
      'has_dependents', profile.has_dependents,
      'num_dependents', profile.num_dependents,
      'clothing_size', profile.clothing_size,
      'shoe_size', profile.shoe_size,
      'is_active', profile.is_active,
      'created_at', profile.created_at
    ) order by profile.last_name, profile.first_name, profile.id), '[]'::jsonb)
    into export_rows
    from public.profiles profile
    where profile.org_id = actor_org
      and profile.role = 'player'
      and not profile.is_test_account;
  elsif p_dataset = 'custom_answers' then
    -- Answers to the fields Ramassà added (RAPP-307), one row per answer. The
    -- default scope holds Normal and Personal answers; Sensitive answers only
    -- the full scope, which needs participants.view_sensitive above.
    export_columns := '["participant_id","first_name","last_name","section","question","privacy","season","answer","answered_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'participant_id', profile.id,
      'first_name', profile.first_name,
      'last_name', profile.last_name,
      'section', section.title ->> 'ca',
      'question', field.label ->> 'ca',
      'privacy', field.privacy,
      'season', season.name,
      'answer', private.custom_answer_text(
        field, coalesce(answer.value, (public.decrypt_field(answer.value_encrypted))::jsonb)),
      'answered_at', answer.answered_at
    ) order by profile.last_name, profile.first_name, profile.id, section.sort_order, field.sort_order,
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
      'first_name', profile.first_name,
      'last_name', profile.last_name,
      'season', season.name,
      'version', version.version_number,
      'consent_key', event.consent_key,
      'consent', event.wording,
      'language', event.language,
      'required', event.required,
      'granted', event.granted,
      'method', event.method,
      'decided_at', event.decided_at
    ) order by profile.last_name, profile.first_name, profile.id, event.decided_at, event.id), '[]'::jsonb)
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
create or replace function public.intake_catalog()
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
begin
  if (select auth.uid()) is null or actor_org is null then
    raise insufficient_privilege using message = 'the question catalog needs an account';
  end if;
  return jsonb_build_object(
    -- Ramassà screens. The fields each one asks are its placements, below.
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'intro', s.intro, 'after_screen', s.after_screen,
        'sort_order', s.sort_order, 'is_archived', s.is_archived)
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
       where v.id is not null),
    -- The profile layout (RAPP-649): sections, fields and where each is asked.
    -- Who created a field, and whether it has answers (which fixes its
    -- privacy level), only for the people who design it.
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'key', s.key, 'title', s.title, 'sort_order', s.sort_order, 'is_builtin', s.is_builtin)
        order by s.sort_order, s.created_at)
        from public.profile_sections s where s.org_id = actor_org), '[]'::jsonb),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'section_id', f.section_id, 'kind', f.kind, 'builtin_key', f.builtin_key,
        'question_type', f.question_type, 'label', f.label, 'help', f.help, 'privacy', f.privacy,
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
            'id', o.id, 'label', o.label, 'sort_order', o.sort_order, 'is_archived', o.is_archived)
            order by o.sort_order, o.id)
            from public.custom_question_options o where o.question_id = f.id), '[]'::jsonb))
        order by f.sort_order, f.created_at)
        from public.profile_fields f
       where f.org_id = actor_org and (with_archived or not f.is_archived)), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'field_id', p.field_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'sort_order', p.sort_order, 'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.surface, p.screen_key, p.sort_order, p.created_at)
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id
       where p.org_id = actor_org and (with_archived or not f.is_archived)), '[]'::jsonb)
  );
end;
$function$;
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
        'id', f.id, 'section_id', f.section_id, 'kind', f.kind, 'builtin_key', f.builtin_key,
        'question_type', f.question_type, 'label', f.label, 'help', f.help, 'privacy', f.privacy,
        'default_required', f.default_required, 'settings', f.settings,
        'show_when_field_id', f.show_when_field_id, 'show_when_option_id', f.show_when_option_id,
        'sort_order', f.sort_order, 'is_archived', f.is_archived,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'label', o.label, 'sort_order', o.sort_order, 'is_archived', o.is_archived)
            order by o.sort_order, o.id)
            from public.custom_question_options o where o.question_id = f.id), '[]'::jsonb))
        -- The app's fields by key, then Ramassà's in their order: the same
        -- setup always gives the same file.
        order by f.kind, f.builtin_key, f.sort_order, f.created_at, f.id)
        from public.profile_fields f where f.org_id = actor_org), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'field_id', p.field_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'sort_order', p.sort_order, 'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.surface, p.screen_key, p.sort_order, coalesce(f.builtin_key, f.id::text))
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
          jsonb_build_object('schema_version', 3, 'app_commit', p_app_commit,
                             'counts', private.onboarding_setup_counts(document)));
  return document;
end;
$function$;
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
       where org_id = p_org_id and builtin_key = item.value ->> 'builtin_key'
      returning id into new_field;
      if new_field is null then
        raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: an app question this app does not know';
      end if;
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
  delete from public.field_placements p
   using public.profile_fields f
   where f.id = p.field_id and f.org_id = p_org_id and f.kind = 'builtin'
     and f.builtin_key in (select b ->> 'builtin_key' from jsonb_array_elements(document -> 'fields') b
                            where b ->> 'kind' = 'builtin');
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

  -- The required list, presets and the document step note.
  insert into public.intake_required_questions (org_id, question, is_required, updated_by)
  select p_org_id, r ->> 'question', (r ->> 'is_required')::boolean, p_actor
    from jsonb_array_elements(p_document -> 'required_questions') r;
  -- The built-in placements follow the required list (RAPP-649).
  perform private.sync_builtin_placements_required(p_org_id);

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
-- 6. The bell opens the Fitxa's own page (RAPP-654) ------------------------------------------------------------

create or replace function private.notify_profile_field_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if new.kind <> 'custom' or actor is null then
    return null;
  end if;
  begin
    perform private.notify_staff(new.org_id, 'field_created', new.id,
      '/profile-layout', array[actor, new.created_by]);
  exception when others then
    -- The bell is a hint: never refuse the field over it.
    raise warning 'staff notification for profile_fields % failed: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

update public.staff_notifications
   set path = '/profile-layout'
 where event = 'field_created' and path = '/settings?tab=profile-layout';

-- 7. The old shape goes ----------------------------------------------------------------------------------------

drop trigger custom_questions_write on public.custom_questions;
drop function private.write_custom_questions_view();
drop function public.archive_custom_question(uuid);
drop function public.reorder_custom_questions(uuid, uuid[]);
drop function public.save_custom_question_required(uuid, boolean);
drop function public.ensure_builtin_screen_holder(text, jsonb);
drop function public.save_referral_custom_answers(uuid, jsonb);
drop function private.apply_legacy_question_shape(uuid, uuid, text[], integer, boolean);
drop function private.check_legacy_placements(text, text[]);
drop function private.legacy_question_section(uuid);
drop function private.custom_answer_valid(public.custom_questions, jsonb);
drop function private.custom_answer_text(public.custom_questions, jsonb);
drop function private.write_custom_answer(uuid, public.custom_questions, jsonb, text, uuid);
drop view public.custom_questions;

-- The holder screens (RAPP-642). Their fields are placed on the app screen
-- they held since RAPP-649; a placement or a flow step naming a holder would
-- point at nothing, so the migration stops rather than lose one.
do $$
begin
  if exists (
    select 1 from public.field_placements p
      join public.intake_screens h on h.id::text = p.screen_key
     where h.builtin_screen is not null) then
    raise exception 'a placement still names a holder screen';
  end if;
end;
$$;

update public.intake_flow_orders o
   set step_order = array(
         select step from unnest(o.step_order) with ordinality as listed(step, position)
          where not exists (select 1 from public.intake_screens h
                             where h.builtin_screen is not null and 'custom:' || h.id::text = step)
          order by position)
 where exists (select 1 from unnest(o.step_order) step
                 join public.intake_screens h on 'custom:' || h.id::text = step
                where h.builtin_screen is not null);

alter table public.profile_fields drop column legacy_screen_id;
delete from public.intake_screens where builtin_screen is not null;
drop index public.intake_screens_one_holder_per_screen;
alter table public.intake_screens drop constraint intake_screens_builtin_screen_check;
alter table public.intake_screens drop column builtin_screen;
