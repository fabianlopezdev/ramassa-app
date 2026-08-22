-- Admin-only grant-reporting exports and audit-log viewer (RAPP-63).
--
-- Export payloads stay structured at the database boundary. The browser owns
-- CSV and XLSX serialization, while Postgres owns tenant scoping, role checks,
-- encrypted-field minimization, rate limiting, and the inseparable audit row.

create index audit_log_org_action_created_id_idx
  on public.audit_log (org_id, action, created_at desc, id desc);
create index audit_log_org_actor_created_id_idx
  on public.audit_log (org_id, actor_id, created_at desc, id desc);
create index audit_log_org_target_created_id_idx
  on public.audit_log (org_id, target_type, target_id, created_at desc, id desc);

revoke update, delete on public.audit_log from authenticated;

create or replace function public.create_data_export(
  p_dataset text,
  p_scope text,
  p_format text,
  p_start_date date default null,
  p_end_date date default null,
  p_reason text default null,
  p_confirmed boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  export_id uuid := gen_random_uuid();
  export_columns jsonb;
  export_rows jsonb;
  start_instant timestamptz;
  end_instant timestamptz;
begin
  if actor is null or actor_org is null or not (select public.is_admin()) then
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
    where (start_instant is null or report.starts_at >= start_instant)
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

revoke all on function public.create_data_export(text, text, text, date, date, text, boolean)
  from public, anon;
grant execute on function public.create_data_export(text, text, text, date, date, text, boolean)
  to authenticated;
comment on function public.create_data_export(text, text, text, date, date, text, boolean) is
  'Admin-only, tenant-scoped participant, attendance, and event export. Default participant exports exclude encrypted fields. Full exports require confirmation and a reason. Every successful export is rate-limited and audited without duplicating sensitive values.';

create or replace function public.get_audit_log_page(
  p_actor_id uuid default null,
  p_action text default null,
  p_target_type text default null,
  p_target_id uuid default null,
  p_start_date date default null,
  p_end_date date default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not (select public.is_admin()) then
    raise insufficient_privilege using message = 'audit viewer requires admin access';
  end if;
  if p_page_size < 1 or p_page_size > 100 then
    raise invalid_parameter_value using message = 'audit page size must be between 1 and 100';
  end if;
  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise invalid_parameter_value using message = 'audit cursor is incomplete';
  end if;
  if p_start_date is not null and p_end_date is not null and p_start_date > p_end_date then
    raise invalid_datetime_format using message = 'invalid audit period';
  end if;

  with filtered as (
    select
      log.id,
      log.actor_id,
      trim(concat(actor.first_name, ' ', actor.last_name)) as actor_name,
      log.action,
      log.target_type,
      log.target_id,
      log.changes,
      log.created_at
    from public.audit_log log
    join public.profiles actor on actor.id = log.actor_id
    where log.org_id = (select public.current_org_id())
      and (p_actor_id is null or log.actor_id = p_actor_id)
      and (p_action is null or log.action = p_action)
      and (p_target_type is null or log.target_type = p_target_type)
      and (p_target_id is null or log.target_id = p_target_id)
      and (p_start_date is null or log.created_at >= p_start_date::timestamp at time zone 'Europe/Madrid')
      and (p_end_date is null or log.created_at < (p_end_date + 1)::timestamp at time zone 'Europe/Madrid')
      and (
        p_cursor_created_at is null
        or (log.created_at, log.id) < (p_cursor_created_at, p_cursor_id)
      )
    order by log.created_at desc, log.id desc
    limit p_page_size + 1
  ), page as (
    select * from filtered
    order by created_at desc, id desc
    limit p_page_size
  ), last_row as (
    select created_at, id from page order by created_at, id limit 1
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc, id desc) from page), '[]'::jsonb),
    'has_more', (select count(*) from filtered) > p_page_size,
    'next_cursor_created_at', (select created_at from last_row),
    'next_cursor_id', (select id from last_row)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_audit_log_page(uuid, text, text, uuid, date, date, timestamptz, uuid, integer)
  from public, anon;
grant execute on function public.get_audit_log_page(uuid, text, text, uuid, date, date, timestamptz, uuid, integer)
  to authenticated;
comment on function public.get_audit_log_page(uuid, text, text, uuid, date, date, timestamptz, uuid, integer) is
  'Admin-only tenant audit viewer with actor, exact action, target, inclusive Europe/Madrid period filters, and stable created_at plus id cursor pagination. Audit rows are retained for the life of the organization unless a documented legal retention policy supersedes that operational default.';
