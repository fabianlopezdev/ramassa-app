-- Participant field levels hold on every read (RAPP-240, part of RAPP-211).
--
-- WHY
--
-- Participant fields come in three levels, each behind its own permission:
-- Basic (participants.view), Personal (participants.view_personal) and
-- Sensitive (participants.view_sensitive). Row policies decide WHICH rows a
-- person reads, never which columns, and `authenticated` could select every
-- column of `profiles`. So any team member who could read a row read its
-- Personal fields too, and could search or filter by them.
--
-- WHAT CHANGES
--
--   1. Column privileges: a signed-in user selects only the Basic and system
--      columns of `profiles`. The Personal and Sensitive columns, and the
--      search document built from them, are no longer readable directly.
--   2. The functions that read those columns run with owner rights, scope the
--      organization themselves, and return Personal or Sensitive values only
--      to a holder of the permission: the participant detail and edit, the
--      exports, the impact report (aggregates only), the inbox list, and the
--      filter options. A player's own onboarding, profile read and profile edit
--      already read only her own row.
--   3. New `list_participants` and `get_conversation_peer` replace the two
--      direct reads the apps made. Without participants.view_personal, the list
--      leaves those fields empty, ignores the filters and sorts on them, and
--      searches the Basic fields only, so a search cannot reveal them either.
--
-- Nobody's access changes today: every team member holds Staff or Admin, and
-- both include participants.view and participants.view_personal.

-- 1. Column privileges ---------------------------------------------------------------------

revoke select on public.profiles from anon, authenticated;
grant select (
  id, org_id, role, first_name, last_name, reference_entity, clothing_size, shoe_size,
  preferred_language, avatar_url, is_active, is_forum_banned, terms_accepted_at,
  created_at, updated_at, media_consent_at, auth_method, anonymized_at,
  push_notifications_enabled, collaborating_entity_id
) on public.profiles to authenticated;

comment on table public.profiles is 'Participants and team members. Signed-in users select only Basic and system columns; Personal and Sensitive fields are read through permission-checked functions (RAPP-240).';

-- 2. A player's own data: these already read only the caller's row ----------------------------

alter function public.get_own_profile() security definer;
alter function public.update_own_profile(jsonb) security definer;
alter function public.complete_onboarding(jsonb) security definer;

-- Team functions that read Personal or Sensitive columns (generated from the
-- live definitions; the changes are owner rights, an explicit organization
-- filter where row policies used to supply it, and the inbox city by permission).

create or replace function public.get_participant_profile(participant_id uuid)
 RETURNS TABLE(id uuid, first_name text, last_name text, date_of_birth date, place_of_birth text, nationality text, preferred_language text, document_type text, document_number text, phone text, address text, city text, postal_code text, reference_entity text, reference_contact_name text, has_dependents boolean, num_dependents integer, clothing_size text, shoe_size text, avatar_url text, media_consent boolean, terms_accepted_at timestamp with time zone, is_active boolean, is_forum_banned boolean, auth_method text, anonymized_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
  with subject as (
    select p.*
    from public.profiles p
    where p.id = participant_id
      and p.org_id = (select public.current_org_id())
      and (select public.has_permission('participants.view'))
  ),
  access_recorded as (
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id)
    select
      (select public.current_org_id()),
      (select auth.uid()),
      case when (select public.has_permission('participants.view_sensitive')) then 'profile.view_sensitive' else 'profile.view' end,
      'profile',
      s.id
    from subject s
    returning 1
  )
  select
    s.id,
    s.first_name,
    s.last_name,
    case when (select public.has_permission('participants.view_personal')) then s.date_of_birth end,
    case when (select public.has_permission('participants.view_personal')) then s.place_of_birth end,
    case when (select public.has_permission('participants.view_personal')) then s.nationality end,
    s.preferred_language,
    case when (select public.has_permission('participants.view_personal')) then s.document_type end,
    case when (select public.has_permission('participants.view_sensitive')) then public.decrypt_field(s.document_number) end,
    case when (select public.has_permission('participants.view_sensitive')) then public.decrypt_field(s.phone) end,
    case when (select public.has_permission('participants.view_sensitive')) then public.decrypt_field(s.address) end,
    case when (select public.has_permission('participants.view_personal')) then s.city end,
    case when (select public.has_permission('participants.view_sensitive')) then public.decrypt_field(s.postal_code) end,
    s.reference_entity,
    case when (select public.has_permission('participants.view_personal')) then s.reference_contact_name end,
    case when (select public.has_permission('participants.view_personal')) then s.has_dependents end,
    case when (select public.has_permission('participants.view_personal')) then s.num_dependents end,
    s.clothing_size,
    s.shoe_size,
    s.avatar_url,
    s.media_consent_at is not null,
    s.terms_accepted_at,
    s.is_active,
    s.is_forum_banned,
    s.auth_method,
    s.anonymized_at,
    s.created_at,
    s.updated_at
  from subject s;
$$;

create or replace function public.update_participant_profile(participant_id uuid, payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  document_type_value text := payload ->> 'document_type';
  document_number_value text := nullif(payload ->> 'document_number', '');
  place_of_birth_value text := nullif(btrim(payload ->> 'place_of_birth'), '');
  -- The columns whose VALUES must never reach the audit log (ADR-004).
  encrypted_fields text[] := array['document_number', 'phone', 'address', 'postal_code'];
  before_document jsonb;
  changes_document jsonb;
begin
  if not (select public.has_permission('participants.view_personal')) then
    raise exception 'update_participant_profile is the staff path; a participant edits herself through update_own_profile()'
      using errcode = 'insufficient_privilege';
  end if;

  if place_of_birth_value is null then
    raise exception 'update_participant_profile requires place_of_birth'
      using errcode = 'not_null_violation';
  end if;

  -- A caller without participants.view_sensitive never sends the document
  -- number; for her the check runs below, on the stored value.
  if document_type_value is distinct from 'none' and document_number_value is null
    and (select public.has_permission('participants.view_sensitive'))
  then
    raise exception 'update_participant_profile requires document_number unless document_type is none'
      using errcode = 'not_null_violation';
  end if;

  -- The record as it stands, in the payload's own shape, so the diff below is a
  -- key-by-key comparison rather than nineteen hand-written IF statements that
  -- a twentieth column would silently escape. The encrypted values are decrypted
  -- HERE and never leave this block: they are what makes "did the phone actually
  -- change" answerable at all.
  select jsonb_build_object(
    'first_name', p.first_name,
    'last_name', p.last_name,
    'date_of_birth', p.date_of_birth,
    'place_of_birth', p.place_of_birth,
    'nationality', p.nationality,
    'preferred_language', p.preferred_language,
    'document_type', p.document_type,
    'document_number', public.decrypt_field(p.document_number),
    'phone', public.decrypt_field(p.phone),
    'address', public.decrypt_field(p.address),
    'city', p.city,
    'postal_code', public.decrypt_field(p.postal_code),
    'reference_entity', p.reference_entity,
    'reference_contact_name', p.reference_contact_name,
    'has_dependents', p.has_dependents,
    'num_dependents', p.num_dependents,
    'clothing_size', p.clothing_size,
    'shoe_size', p.shoe_size,
    'media_consent', p.media_consent_at is not null
  )
  into before_document
  from public.profiles p
  where p.id = participant_id
    and p.org_id = (select public.current_org_id());

  -- No readable row means no row this caller may edit: RLS has already decided,
  -- and there is nothing to audit.
  if before_document is null then
    return;
  end if;

  -- The four encrypted fields change only for a caller who may see them. For
  -- anyone else the stored values are kept, whatever the payload says, so a
  -- screen without them can never wipe them (RAPP-230).
  if not (select public.has_permission('participants.view_sensitive')) then
    payload := payload || jsonb_build_object(
      'document_number', before_document ->> 'document_number',
      'phone', before_document ->> 'phone',
      'address', before_document ->> 'address',
      'postal_code', before_document ->> 'postal_code'
    );
    document_number_value := nullif(payload ->> 'document_number', '');
    if document_type_value is distinct from 'none' and document_number_value is null then
      raise exception 'update_participant_profile requires document_number unless document_type is none'
        using errcode = 'not_null_violation';
    end if;
  end if;

  perform set_config('ramassa.trusted_profile_write', 'on', true);
  update public.profiles set
    first_name = payload ->> 'first_name',
    last_name = payload ->> 'last_name',
    date_of_birth = (payload ->> 'date_of_birth')::date,
    place_of_birth = place_of_birth_value,
    nationality = payload ->> 'nationality',
    preferred_language = coalesce(nullif(payload ->> 'preferred_language', ''), preferred_language),
    document_type = document_type_value,
    document_number = public.encrypt_field(document_number_value),
    phone = public.encrypt_field(nullif(payload ->> 'phone', '')),
    address = public.encrypt_field(nullif(payload ->> 'address', '')),
    city = nullif(payload ->> 'city', ''),
    postal_code = public.encrypt_field(nullif(payload ->> 'postal_code', '')),
    reference_entity = nullif(payload ->> 'reference_entity', ''),
    reference_contact_name = nullif(payload ->> 'reference_contact_name', ''),
    has_dependents = coalesce((payload ->> 'has_dependents')::boolean, false),
    num_dependents = coalesce((payload ->> 'num_dependents')::integer, 0),
    clothing_size = nullif(payload ->> 'clothing_size', ''),
    shoe_size = nullif(payload ->> 'shoe_size', ''),
    media_consent_at = case
      when (payload ->> 'media_consent')::boolean then coalesce(media_consent_at, now())
      else null
    end,
    updated_at = now()
  where id = participant_id
    and org_id = (select public.current_org_id());
  perform set_config('ramassa.trusted_profile_write', '', true);

  if not found then
    return;
  end if;

  select coalesce(jsonb_object_agg(submitted.key, entry), '{}'::jsonb)
  into changes_document
  from jsonb_each_text(payload) submitted
  cross join lateral (
    select case
      when submitted.key = any(encrypted_fields) then jsonb_build_object('changed', true)
      else jsonb_build_object(
        'old', to_jsonb(before_document ->> submitted.key),
        'new', to_jsonb(submitted.value)
      )
    end as entry
  ) built
  where before_document ? submitted.key
    and (before_document ->> submitted.key) is distinct from submitted.value;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    (select public.current_org_id()),
    actor,
    'profile.update',
    'profile',
    participant_id,
    changes_document
  );
end;
$$;

create or replace function public.create_data_export(p_dataset text, p_scope text, p_format text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_reason text DEFAULT NULL::text, p_confirmed boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  export_id uuid := gen_random_uuid();
  export_columns jsonb;
  export_rows jsonb;
  start_instant timestamptz;
  end_instant timestamptz;
begin
  if actor is null or actor_org is null or not (
    case p_dataset
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
  if p_dataset not in ('participants', 'attendance', 'events') then
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
      and profile.role = 'player';
  elsif p_dataset = 'participants' then
    export_columns := '["id","first_name","last_name","date_of_birth","place_of_birth","nationality","preferred_language","document_type","document_number","phone","address","city","postal_code","reference_entity","reference_contact_name","has_dependents","num_dependents","clothing_size","shoe_size","is_active","created_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', profile.id,
      'first_name', profile.first_name,
      'last_name', profile.last_name,
      'date_of_birth', profile.date_of_birth,
      'place_of_birth', profile.place_of_birth,
      'nationality', profile.nationality,
      'preferred_language', profile.preferred_language,
      'document_type', profile.document_type,
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
      and profile.role = 'player';
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
$$;

create or replace function public.list_staff_conversations(p_unread_only boolean DEFAULT false, p_assigned_to_me boolean DEFAULT false, p_participant_role text DEFAULT 'all'::text, p_query text DEFAULT ''::text)
 RETURNS TABLE(conversation_id uuid, participant_id uuid, participant_first_name text, participant_last_name text, participant_role text, participant_city text, participant_language text, assigned_staff_id uuid, assigned_staff_first_name text, assigned_staff_last_name text, unread_count bigint, latest_message_at timestamp with time zone, latest_message_preview text, latest_sender_id uuid, conversation_created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 STABLE
 SET search_path TO ''
AS $$
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
    participant.first_name,
    participant.last_name,
    participant.role,
    case when (select public.has_permission('participants.view_personal')) then participant.city end,
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
          concat_ws(' ', participant.first_name, participant.last_name)
        ) || ' ' || concat_ws(' ', participant.first_name, participant.last_name)
      ) @@ search_query
    )
  order by
    (unread.total > 0) desc,
    latest.created_at desc nulls last,
    conversation.created_at desc,
    conversation.id
  limit 200;
end;
$$;
-- Aggregates only: cohort counts by nationality and age band, never a name.
alter function public.get_impact_report(date, date, uuid, uuid) security definer;

create or replace function public.participant_filter_options()
returns table (entities text[], nationalities text[])
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(array_agg(distinct p.reference_entity) filter (where p.reference_entity is not null), '{}'),
    case when (select public.has_permission('participants.view_personal'))
      then coalesce(array_agg(distinct p.nationality) filter (where p.nationality is not null), '{}')
      else '{}'::text[]
    end
  from public.profiles as p
  where p.role = 'player'
    and p.org_id = (select public.current_org_id())
    and (select public.has_permission('participants.view'));
$$;

-- 3. The participant list -------------------------------------------------------------------------

-- `p_query` is the prefix tsquery the client builds (buildPrefixTsQuery);
-- passed straight to to_tsquery, it can only narrow the caller's own rows.
create or replace function public.list_participants(
  p_query text default '',
  p_entity text default null,
  p_nationality text default null,
  p_status text default 'all',
  p_dependents text default 'all',
  p_sort text default 'last_name',
  p_dir text default 'asc',
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  id uuid,
  first_name text,
  last_name text,
  nationality text,
  city text,
  reference_entity text,
  has_dependents boolean,
  num_dependents integer,
  is_active boolean,
  preferred_language text,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with access as (
    select
      (select public.has_permission('participants.view')) as can_view,
      (select public.has_permission('participants.view_personal')) as personal
  ),
  roster as (
    select
      profile.*,
      case
        when p_sort = 'first_name' then profile.first_name
        when p_sort = 'city' and access.personal then profile.city
        when p_sort = 'nationality' and access.personal then profile.nationality
        when p_sort = 'reference_entity' then profile.reference_entity
        when p_sort = 'created_at' then to_char(profile.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
        else profile.last_name
      end as sort_key,
      access.personal
    from public.profiles as profile
    cross join access
    where access.can_view
      and profile.org_id = (select public.current_org_id())
      and profile.role = 'player'
      and (
        coalesce(p_query, '') = ''
        or (access.personal and profile.search_document @@ to_tsquery('simple', p_query))
        or (not access.personal and to_tsvector('simple',
              public.immutable_unaccent(concat_ws(' ', profile.first_name, profile.last_name, profile.reference_entity))
              || ' ' || concat_ws(' ', profile.first_name, profile.last_name, profile.reference_entity))
            @@ to_tsquery('simple', p_query))
      )
      and (p_entity is null or profile.reference_entity = p_entity)
      and (p_nationality is null or not access.personal or profile.nationality = p_nationality)
      and (p_status = 'all' or profile.is_active = (p_status = 'active'))
      and (p_dependents = 'all' or not access.personal or profile.has_dependents = (p_dependents = 'with'))
  )
  select
    roster.id,
    roster.first_name,
    roster.last_name,
    case when roster.personal then roster.nationality end,
    case when roster.personal then roster.city end,
    roster.reference_entity,
    case when roster.personal then roster.has_dependents end,
    case when roster.personal then roster.num_dependents end,
    roster.is_active,
    roster.preferred_language,
    roster.created_at,
    count(*) over ()
  from roster
  order by
    case when p_dir = 'desc' then null else roster.sort_key end asc nulls last,
    case when p_dir = 'desc' then roster.sort_key end desc nulls first,
    roster.id
  limit least(greatest(coalesce(p_page_size, 25), 1), 100)
  offset (greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_page_size, 25), 1), 100);
$$;

comment on function public.list_participants is 'The participant roster page. Needs participants.view; Personal fields, and the filters, sorts and search over them, need participants.view_personal.';

-- The person a conversation belongs to, for the chat header. A team member
-- with messages.inbox reads it for any conversation; a player or entity
-- contact reads her own (her own conversation's owner is herself).
create or replace function public.get_conversation_peer(p_user_id uuid)
returns table (
  id uuid,
  first_name text,
  last_name text,
  role text,
  city text,
  preferred_language text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    peer.id,
    peer.first_name,
    peer.last_name,
    peer.role,
    case
      when peer.id = (select auth.uid()) or (select public.has_permission('participants.view_personal'))
        then peer.city
    end,
    peer.preferred_language
  from public.profiles as peer
  where peer.id = p_user_id
    and peer.org_id = (select public.current_org_id())
    and peer.role in ('player', 'entity')
    and (peer.id = (select auth.uid()) or (select public.has_permission('messages.inbox')));
$$;

revoke all on function public.list_participants(text, text, text, text, text, text, text, integer, integer) from public, anon;
revoke all on function public.get_conversation_peer(uuid) from public, anon;
revoke all on function public.participant_filter_options() from public, anon;
grant execute on function public.list_participants(text, text, text, text, text, text, text, integer, integer) to authenticated;
grant execute on function public.get_conversation_peer(uuid) to authenticated;
grant execute on function public.participant_filter_options() to authenticated;
