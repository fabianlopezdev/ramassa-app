-- The app's answers in the answer store, kept in sync (RAPP-660, D3, D10, D13).
--
-- WHY
--
-- Every field but her names answers into `custom_answers` (D3). The previous
-- migration gave the app's fields that shape; this one copies their answers in,
-- and keeps the copy right while the app still writes its own columns. RAPP-661
-- moves the writers onto the answer store, RAPP-662 the readers, and RAPP-666
-- drops the old columns and everything in sections 2 and 3 below.
--
-- WHAT CHANGES
--
--   1. Every non-null value of an app field on `profiles` becomes an answer at
--      its level: Personal and Normal ones as they are, Sensitive ones through
--      `public.encrypt_field`. A choice becomes its option's id (the option
--      with that key), a yes or no on dependents becomes the yes or no
--      option, the number of dependents counts only on yes, the structured
--      specific needs become the needs (several choices) and one details text,
--      and the supporting organizations a list without repeats.
--   2. A seasonal field (placed on the season form) keeps one answer per season
--      (D10): every `season_answers` row becomes that season's answers, and her
--      profile's current value the current season's.
--   3. Who gave it and when come from `profile_answers` where it has a row for
--      the app question; otherwise her own answer for a player and the team's
--      for anyone else, at the profile's last change. A past season's answer
--      keeps the time of its season row.
--   4. TEMPORARY, until RAPP-666 drops the old storage: the copy is
--      `private.copy_app_answers` (run once here), and three triggers keep the
--      answers equal to the columns the app still writes. A change to an app
--      column of `profiles` rewrites or removes that answer, a `season_answers`
--      row its season's answers, a `profile_answers` row the source of the
--      answers of its question.
--   5. Until RAPP-662 moves the readers, the readers of Ramassà's answers leave
--      the app's answers out (`participant_custom_answers`, `my_custom_answers`
--      and the custom answers export), so her page, her phone and the exports
--      show what they showed.
--
-- A value that does not fit its field (a size the app no longer offers) is left
-- out with a warning naming the field only, never the value.
--
-- Docs: https://www.postgresql.org/docs/17/trigger-definition.html (AFTER row
-- triggers, UPDATE OF columns, firing order by name),
-- https://www.postgresql.org/docs/17/plpgsql-trigger.html.

-- 1. What the app stores, as answers --------------------------------------------------------------------------

-- The structured specific needs (`schemas/support-needs.ts`): the categories she
-- chose, and one text from her explanation and the details per category, each
-- detail named by its category when there are several.
create function private.support_needs_parts(p_text text)
returns table (needs jsonb, details jsonb)
language plpgsql
immutable
set search_path = ''
as $$
declare
  envelope jsonb;
begin
  if p_text is null or btrim(p_text) = '' then
    return;
  end if;
  begin
    envelope := p_text::jsonb;
  exception when others then
    envelope := null;
  end;
  if envelope is null or jsonb_typeof(envelope) <> 'object' or envelope ->> 'kind' <> 'support-needs' then
    -- Text written before the needs were structured reads as another circumstance.
    return query select '["other"]'::jsonb, to_jsonb(btrim(p_text));
    return;
  end if;
  return query
  with part as (
    select 0 as position, null::text as category, btrim(envelope ->> 'explanation') as body
    union all
    select o.sort_order + 1, o.label ->> 'ca', btrim(d.value)
      from jsonb_each_text(coalesce(envelope -> 'details', '{}'::jsonb)) d
      left join private.system_field_options() o on o.system_key = 'specific_needs' and o.key = d.key
  ), kept as (
    select * from part where body is not null and body <> ''
  )
  select envelope -> 'categories',
         to_jsonb((select string_agg(
                     case when (select count(*) from kept) > 1 and k.category is not null
                          then k.category || ': ' else '' end || k.body,
                     E'\n\n' order by k.position)
                     from kept k));
end;
$$;

-- The season answers of one row: those of `season_answers` or the current ones
-- on `profiles`, decrypted.
create function private.season_field_raw_values(
  p_applicant_status text,
  p_applicant_status_details text,
  p_supporting_entities text[],
  p_childcare_need text,
  p_specific_needs text
)
returns table (system_key text, raw jsonb)
language sql
immutable
set search_path = ''
as $$
  select v.system_key, v.raw
    from (values
      ('applicant_status', to_jsonb(nullif(btrim(p_applicant_status), ''))),
      ('applicant_status_details', to_jsonb(nullif(btrim(p_applicant_status_details), ''))),
      -- A list without blanks or repeats, in her order.
      ('supporting_entities', (
        select jsonb_agg(entity.name order by entity.first_seen)
          from (select btrim(listed.name) as name, min(listed.position) as first_seen
                  from unnest(p_supporting_entities) with ordinality as listed(name, position)
                 where btrim(listed.name) <> ''
                 group by btrim(listed.name)) entity)),
      ('childcare_need', to_jsonb(p_childcare_need)),
      ('specific_needs', (select n.needs from private.support_needs_parts(p_specific_needs) n)),
      ('specific_needs_details', (select n.details from private.support_needs_parts(p_specific_needs) n))
    ) as v(system_key, raw);
$$;

-- Every app field of a profile row but her names, decrypted. Choices are still
-- the strings the app stores: `private.app_answer_value` turns them into options.
create function private.app_field_raw_values(p public.profiles)
returns table (system_key text, raw jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select v.system_key, v.raw
    from (values
      ('date_of_birth', to_jsonb(to_char(p.date_of_birth, 'YYYY-MM-DD'))),
      ('place_of_birth', to_jsonb(p.place_of_birth)),
      ('nationality', to_jsonb(p.nationality)),
      ('document_type', to_jsonb(p.document_type)),
      ('document_number', to_jsonb(public.decrypt_field(p.document_number))),
      ('document_name', to_jsonb(p.document_name)),
      ('phone', to_jsonb(public.decrypt_field(p.phone))),
      ('address', to_jsonb(public.decrypt_field(p.address))),
      ('city', to_jsonb(p.city)),
      ('postal_code', to_jsonb(public.decrypt_field(p.postal_code))),
      ('reference_entity', to_jsonb(p.reference_entity)),
      ('reference_contact_name', to_jsonb(p.reference_contact_name)),
      ('has_dependents', to_jsonb(case p.has_dependents when true then 'yes' when false then 'no' end)),
      -- How many counts only on yes: the column keeps 0 otherwise.
      ('num_dependents', case when p.has_dependents and p.num_dependents > 0 then to_jsonb(p.num_dependents) end),
      ('clothing_size', to_jsonb(p.clothing_size)),
      ('shoe_size', to_jsonb(p.shoe_size))
    ) as v(system_key, raw)
  union all
  select s.system_key, s.raw
    from private.season_field_raw_values(
      public.decrypt_field(p.applicant_status), public.decrypt_field(p.applicant_status_details),
      p.supporting_entities, p.childcare_need, public.decrypt_field(p.specific_needs)) s;
$$;

-- A stored string as the answer of its field: a choice by its option's key.
-- A key no option has is returned as it is, so the answer check refuses it.
create function private.app_answer_value(p_field public.profile_fields, p_raw jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_raw is null or jsonb_typeof(p_raw) = 'null' then null
    when p_field.question_type in ('single_choice', 'search_choice') and jsonb_typeof(p_raw) = 'string' then
      coalesce((select to_jsonb(o.id::text) from public.custom_question_options o
                 where o.question_id = p_field.id and o.key = p_raw #>> '{}'), p_raw)
    when p_field.question_type = 'multiple_choice' and jsonb_typeof(p_raw) = 'array' then
      coalesce((select jsonb_agg(o.id::text order by o.sort_order)
                  from public.custom_question_options o
                 where o.question_id = p_field.id
                   and o.key in (select jsonb_array_elements_text(p_raw))
                having count(*) = jsonb_array_length(p_raw)), p_raw)
    else p_raw
  end;
$$;

revoke all on function private.support_needs_parts(text) from public, anon, authenticated;
revoke all on function private.season_field_raw_values(text, text, text[], text, text) from public, anon, authenticated;
revoke all on function private.app_field_raw_values(public.profiles) from public, anon, authenticated;
revoke all on function private.app_answer_value(public.profile_fields, jsonb) from public, anon, authenticated;

-- 2. TEMPORARY until RAPP-666: one writer and three triggers ------------------------------------------------

-- Writes, or removes, the answer of one app field as the app stored it. From her
-- profile (no season given) a seasonal field is the current season's; from a
-- `season_answers` row, that season's, and only for seasonal fields.
create function private.mirror_app_answer(
  p_profile_id uuid,
  p_org_id uuid,
  p_role text,
  p_system_key text,
  p_season_id uuid,
  p_raw jsonb,
  p_answered_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  field public.profile_fields;
  origin public.profile_answers;
  is_seasonal boolean;
  season uuid;
  key uuid;
  stored jsonb;
begin
  select * into field from public.profile_fields f where f.org_id = p_org_id and f.system_key = p_system_key;
  if field.id is null or p_system_key in ('first_name', 'last_name') then
    return;
  end if;
  is_seasonal := private.field_is_seasonal(field.id);
  if p_season_id is null then
    season := case when is_seasonal then private.current_season_id(p_org_id) end;
    if is_seasonal and season is null then
      return;
    end if;
  else
    if not is_seasonal then
      return;
    end if;
    season := p_season_id;
  end if;
  key := coalesce(season, '00000000-0000-0000-0000-000000000000'::uuid);
  stored := private.custom_answer_tidied(field.question_type, private.app_answer_value(field, p_raw));

  if private.custom_answer_is_empty(stored)
     -- Archived options still read: the column holds what she said.
     or not private.custom_answer_value_valid(
              field.question_type, field.settings, stored,
              array(select o.id::text from public.custom_question_options o where o.question_id = field.id)) then
    delete from public.custom_answers
     where profile_id = p_profile_id and question_id = field.id and season_key = key;
    if not private.custom_answer_is_empty(stored) then
      raise warning 'RAPP-660: an answer to % does not fit its field and was left out of the answer store', p_system_key;
    end if;
    return;
  end if;

  select * into origin from public.profile_answers a
   where a.profile_id = p_profile_id and a.question = private.system_key_question(p_system_key);
  insert into public.custom_answers (
    profile_id, question_id, season_key, season_id, org_id, value, value_encrypted, source,
    answered_by, answered_at)
  values (
    p_profile_id, field.id, key, season, p_org_id,
    case when field.privacy = 'sensitive' then null else stored end,
    case when field.privacy = 'sensitive' then public.encrypt_field(stored::text) end,
    coalesce(origin.source, case when p_role = 'player' then 'player' else 'staff' end),
    origin.answered_by,
    -- A past season keeps its own time; her current answers the time of the answer.
    case when p_season_id is null then coalesce(origin.answered_at, p_answered_at, now())
         else coalesce(p_answered_at, now()) end)
  on conflict (profile_id, question_id, season_key) do update
    set value = excluded.value, value_encrypted = excluded.value_encrypted, source = excluded.source,
        answered_by = excluded.answered_by, answered_at = excluded.answered_at;
end;
$$;
revoke all on function private.mirror_app_answer(uuid, uuid, text, text, uuid, jsonb, timestamptz)
  from public, anon, authenticated;

-- A change to an app column of her profile.
create function private.mirror_app_answers_from_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
begin
  for item in
    select now_value.system_key, now_value.raw
      from private.app_field_raw_values(new) now_value
      left join private.app_field_raw_values(old) before on before.system_key = now_value.system_key
     where now_value.raw is distinct from before.raw
  loop
    perform private.mirror_app_answer(new.id, new.org_id, new.role, item.system_key, null, item.raw, now());
  end loop;
  return null;
end;
$$;
revoke all on function private.mirror_app_answers_from_profile() from public, anon, authenticated;

-- A season's row: written, changed or removed.
create function private.mirror_app_answers_from_season()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_now public.season_answers := case when tg_op = 'DELETE' then old else new end;
  her_role text;
  item record;
begin
  select p.role into her_role from public.profiles p where p.id = row_now.profile_id;
  -- Her profile is being removed: its answers go with it.
  if her_role is null then
    return null;
  end if;
  for item in
    select s.system_key, case when tg_op = 'DELETE' then null else s.raw end as raw
      from private.season_field_raw_values(
        public.decrypt_field(row_now.applicant_status), public.decrypt_field(row_now.applicant_status_details),
        row_now.supporting_entities, row_now.childcare_need, public.decrypt_field(row_now.specific_needs)) s
  loop
    perform private.mirror_app_answer(row_now.profile_id, row_now.org_id, her_role, item.system_key,
                                      row_now.season_id, item.raw, row_now.updated_at);
  end loop;
  return null;
end;
$$;
revoke all on function private.mirror_app_answers_from_season() from public, anon, authenticated;

-- Who gave an app answer: the answers of its question take the row's source.
create function private.mirror_app_answer_origin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.custom_answers a
     set source = new.source, answered_by = new.answered_by, answered_at = new.answered_at
    from public.profile_fields f
   where f.id = a.question_id and f.org_id = new.org_id and f.system_key is not null
     and private.system_key_question(f.system_key) = new.question
     and a.profile_id = new.profile_id
     and a.season_key in ('00000000-0000-0000-0000-000000000000'::uuid,
                          coalesce(private.current_season_id(new.org_id), '00000000-0000-0000-0000-000000000000'::uuid));
  return null;
end;
$$;
revoke all on function private.mirror_app_answer_origin() from public, anon, authenticated;

-- Named to fire after `profiles_record_joined_answers`, which writes who changed what.
create trigger profiles_temporary_app_answers_sync
  after insert or update of date_of_birth, place_of_birth, nationality, document_type, document_number,
    document_name, phone, address, city, postal_code, reference_entity, reference_contact_name,
    has_dependents, num_dependents, clothing_size, shoe_size, applicant_status, applicant_status_details,
    supporting_entities, childcare_need, specific_needs
  on public.profiles
  for each row execute function private.mirror_app_answers_from_profile();
comment on trigger profiles_temporary_app_answers_sync on public.profiles is
  'TEMPORARY (RAPP-660): mirrors the app columns into custom_answers until RAPP-661 moves the writers. RAPP-666 drops it.';

create trigger season_answers_temporary_app_answers_sync
  after insert or update or delete on public.season_answers
  for each row execute function private.mirror_app_answers_from_season();
comment on trigger season_answers_temporary_app_answers_sync on public.season_answers is
  'TEMPORARY (RAPP-660): mirrors each season row into that season''s custom_answers. RAPP-666 drops it.';

create trigger profile_answers_temporary_app_answers_sync
  after insert or update of source, answered_by, answered_at on public.profile_answers
  for each row execute function private.mirror_app_answer_origin();
comment on trigger profile_answers_temporary_app_answers_sync on public.profile_answers is
  'TEMPORARY (RAPP-660): gives the mirrored answers of a question its source. RAPP-666 drops it.';

-- 3. The copy (D13) -------------------------------------------------------------------------------------------

-- The season rows first; her profile then gives the current season its current
-- values. A function so the copy can be checked again (pgTAP 0139); RAPP-666
-- drops it with the triggers.
create function private.copy_app_answers()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  season_row record;
  her public.profiles;
  item record;
begin
  for season_row in
    select s.*, p.role from public.season_answers s join public.profiles p on p.id = s.profile_id
  loop
    for item in
      select v.system_key, v.raw
        from private.season_field_raw_values(
          public.decrypt_field(season_row.applicant_status), public.decrypt_field(season_row.applicant_status_details),
          season_row.supporting_entities, season_row.childcare_need, public.decrypt_field(season_row.specific_needs)) v
       where v.raw is not null
    loop
      perform private.mirror_app_answer(season_row.profile_id, season_row.org_id, season_row.role,
                                        item.system_key, season_row.season_id, item.raw, season_row.updated_at);
    end loop;
  end loop;
  for her in select * from public.profiles loop
    for item in select v.system_key, v.raw from private.app_field_raw_values(her) v where v.raw is not null loop
      perform private.mirror_app_answer(her.id, her.org_id, her.role, item.system_key, null, item.raw, her.updated_at);
    end loop;
  end loop;
end;
$$;
revoke all on function private.copy_app_answers() from public, anon, authenticated;

select private.copy_app_answers();

-- 4. Until RAPP-662: the readers of Ramassà's answers show what they showed --------------------------------

-- Her page.
CREATE OR REPLACE FUNCTION public.participant_custom_answers(p_profile_id uuid)
 RETURNS TABLE(question_id uuid, season_id uuid, season_name text, value jsonb, source text, answered_at timestamp with time zone, answered_by_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
     -- TEMPORARY until RAPP-662: her page reads the app's fields from her record.
     and f.kind = 'custom'
     and (f.privacy = 'normal'
          or (f.privacy = 'personal' and sees_personal)
          or (f.privacy = 'sensitive' and sees_sensitive))
   order by f.sort_order, s.starts_on desc nulls first;
end;
$function$;

-- Her phone.
CREATE OR REPLACE FUNCTION public.my_custom_answers()
 RETURNS TABLE(question_id uuid, value jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select a.question_id,
         coalesce(a.value, (public.decrypt_field(a.value_encrypted))::jsonb)
    from public.custom_answers a
   where a.profile_id = (select auth.uid())
     -- TEMPORARY until RAPP-662: her phone reads the app's fields from her profile.
     and exists (select 1 from public.profile_fields f where f.id = a.question_id and f.kind = 'custom')
     and (a.season_id is null
          or a.season_id = private.current_season_id((select public.current_org_id())));
$function$;

-- The custom answers export.
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
      and (p_scope = 'full' or field.privacy <> 'sensitive')
      -- TEMPORARY until RAPP-662: the participants export carries the app's fields.
      and field.kind = 'custom';
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
