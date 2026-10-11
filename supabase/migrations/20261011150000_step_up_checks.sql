-- Step-up checks before risky actions (RAPP-235, part of RAPP-211).
--
-- WHY
--
-- A signed-in, verified session can stay open for hours on a phone or a shared
-- computer. For the actions that are hard to undo, an open session alone is not
-- enough: the person confirms with her authenticator code again first. The rule
-- is here in the database, so it holds on the web and in the app alike; the
-- app's device check (biometrics or passcode) comes on top of it.
--
-- WHAT
--
-- RGPD deletion and anonymization, permission and preset changes, role
-- changes and removals, new team and entity accounts, second-factor resets and
-- data exports. Each needs a TOTP verification from the last 10 minutes.
--
-- HOW
--
-- Supabase records every verification in the token's `amr` claim, with the time
-- of the most recent one; a new code moves that time forward, and refreshing the
-- token keeps it. A trusted context with no signed-in user (the service role, a
-- scheduled job) has no `amr` and is not a person at a screen, so the check
-- applies to signed-in users only.

-- The time of the most recent TOTP verification in this session, or null.
create or replace function private.second_factor_verified_at()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(to_timestamp((entry ->> 'timestamp')::bigint))
  from jsonb_array_elements(
    case
      when jsonb_typeof((select auth.jwt()) -> 'amr') = 'array' then (select auth.jwt()) -> 'amr'
      else '[]'::jsonb
    end
  ) as entry
  where entry ->> 'method' = 'totp';
$$;

revoke all on function private.second_factor_verified_at() from public, anon, authenticated;

-- Raises `step_up_required` unless the signed-in caller verified her
-- authenticator code in the last 10 minutes. The apps read that message and ask
-- for the code again.
create or replace function private.require_recent_second_factor()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.jwt()) ->> 'role', '') <> 'authenticated' then
    return;
  end if;
  if coalesce((select private.second_factor_verified_at()) < now() - interval '10 minutes', true) then
    raise exception 'step_up_required'
      using errcode = '42501',
        hint = 'Verify the authenticator code again, then repeat the action.';
  end if;
end;
$$;

revoke all on function private.require_recent_second_factor() from public, anon, authenticated;

-- The risky functions, unchanged except for the step-up check as their first
-- statement. Their grants are kept by `create or replace`.

CREATE OR REPLACE FUNCTION public.anonymize_participant(participant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid;
  subject_role text;
  subject_anonymized_at timestamptz;
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

  update public.profiles set
    -- Emptied rather than filled with a placeholder word: the screens read
    -- `anonymized_at` and show a translated label, so no invented name has to
    -- exist in five languages or leak out of a CSV export as though it were one.
    first_name = '',
    last_name = '',
    place_of_birth = null,
    reference_contact_name = null,
    avatar_url = null,
    document_type = null,
    document_number = null,
    phone = null,
    address = null,
    postal_code = null,
    date_of_birth = case
      when date_of_birth is null then null
      else make_date(extract(year from date_of_birth)::int, 1, 1)
    end,
    media_consent_at = null,
    is_active = false,
    anonymized_at = now(),
    updated_at = now()
  where id = participant_id;

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
    -- WHICH fields were cleared, never what was in them (ADR-021). The audit row
    -- must not become the last surviving copy of the data it describes.
    jsonb_build_object('fields_cleared', true, 'notes_deleted', true)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_permission_preset(p_preset_id uuid, p_profile_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := (select public.current_org_id());
  preset_codes text[];
  target uuid;
  applied integer := 0;
begin
  perform private.require_recent_second_factor();
  if not (select public.has_permission('team.manage')) then
    raise exception 'PERMISSIONS/TEAM_MANAGE_REQUIRED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.permission_presets where id = p_preset_id and org_id = actor_org) then
    raise exception 'PERMISSIONS/UNKNOWN_PRESET' using errcode = '22023';
  end if;

  select coalesce(array_agg(permission_code), '{}') into preset_codes
  from public.permission_preset_permissions where preset_id = p_preset_id;

  foreach target in array coalesce(p_profile_ids, '{}'::uuid[]) loop
    perform public.set_team_member_permissions(target, preset_codes, p_preset_id);
    applied := applied + 1;
  end loop;
  return applied;
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
  export_rows jsonb;
  start_instant timestamptz;
  end_instant timestamptz;
begin
  perform private.require_recent_second_factor();
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
$function$;

CREATE OR REPLACE FUNCTION public.delete_participant_permanently(participant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid;
  subject_role text;
  subject_email text;
  entry record;
  remaining bigint;
  leftovers text[] := array[]::text[];
begin
  perform private.require_recent_second_factor();
  if not (select (public.has_permission('rgpd.erase') and public.has_permission('team.manage'))) then
    raise exception 'erasing a participant is an admin action'
      using errcode = 'insufficient_privilege';
  end if;

  actor_org := (select public.current_org_id());

  select p.role into subject_role
  from public.profiles p
  where p.id = participant_id and p.org_id = actor_org;

  if subject_role is null then
    raise exception 'DELETION_NO_SUBJECT: no such participant in this organization'
      using errcode = 'raise_exception';
  end if;

  if subject_role <> 'player' then
    raise exception 'DELETION_NOT_A_PARTICIPANT: only a participant record can be erased here'
      using errcode = 'raise_exception';
  end if;

  if participant_id = actor then
    raise exception 'DELETION_SELF: an admin cannot erase her own account through this path'
      using errcode = 'raise_exception';
  end if;

  if not exists (
    select 1 from public.audit_log
    where action = 'profile.media_purged'
      and target_id = participant_id
      and actor_id = actor
      and created_at > now() - interval '30 minutes'
  ) then
    raise exception 'DELETION_MEDIA_NOT_PURGED: her uploaded media must be removed before the record'
      using errcode = 'raise_exception';
  end if;

  select u.email into subject_email from auth.users u where u.id = participant_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org,
    actor,
    'profile.delete',
    'profile',
    participant_id,
    jsonb_build_object('erased', true)
  );

  delete from public.invites
   where accepted_by = participant_id
      or (subject_email is not null and email = subject_email);

  delete from public.audit_log where actor_id = participant_id;

  delete from auth.users where id = participant_id;

  for entry in
    select d.table_name, d.participant_column
    from public.personal_data_disposition() d
    where d.disposition = 'purge'
  loop
    execute format(
      'select count(*) from public.%I where %I = $1',
      entry.table_name, entry.participant_column
    ) into remaining using participant_id;
    if remaining > 0 then
      leftovers := leftovers || format('%s.%s', entry.table_name, entry.participant_column);
    end if;
  end loop;

  if array_length(leftovers, 1) > 0 then
    raise exception 'DELETION_INCOMPLETE: rows survived in %', array_to_string(leftovers, ', ')
      using errcode = 'raise_exception';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_permission_preset(p_preset_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := (select public.current_org_id());
begin
  perform private.require_recent_second_factor();
  if not (select public.has_permission('team.manage')) then
    raise exception 'PERMISSIONS/TEAM_MANAGE_REQUIRED' using errcode = '42501';
  end if;
  if exists (select 1 from public.permission_presets where id = p_preset_id and org_id = actor_org and builtin_key is not null) then
    raise exception 'PERMISSIONS/BUILTIN_PRESET' using errcode = '22023';
  end if;
  delete from public.permission_presets where id = p_preset_id and org_id = actor_org;
  if not found then
    raise exception 'PERMISSIONS/UNKNOWN_PRESET' using errcode = '22023';
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'team.preset_delete', 'permission_preset', p_preset_id, '{}'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.invite_entity_collaborator(p_collaborating_entity_id uuid, p_email text, p_first_name text, p_last_name text)
 RETURNS TABLE(invitation_id uuid, profile_id uuid, email text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  clean_email text := lower(btrim(p_email));
  clean_first_name text := nullif(btrim(p_first_name), '');
  clean_last_name text := nullif(btrim(p_last_name), '');
  entity_name text;
  new_profile_id uuid := extensions.gen_random_uuid();
  new_invitation_id uuid := extensions.gen_random_uuid();
  invitation_expires_at timestamptz := now() + interval '30 days';
begin
  perform private.require_recent_second_factor();
  if not (select public.has_permission('entities.manage')) then
    raise exception 'only admins may invite entity collaborators'
      using errcode = 'insufficient_privilege';
  end if;
  if clean_email is null
    or length(clean_email) > 254
    or clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or clean_first_name is null
    or length(clean_first_name) > 100
    or clean_last_name is null
    or length(clean_last_name) > 100
  then
    raise check_violation using message = 'invalid entity collaborator invitation';
  end if;

  select entity.name into entity_name
  from public.collaborating_entities as entity
  where entity.id = p_collaborating_entity_id
    and entity.org_id = actor_org
    and entity.is_active;

  if entity_name is null then
    raise no_data_found using message = 'active collaborating entity not found';
  end if;
  if exists (
    select 1
    from auth.users as account
    where lower(account.email) = clean_email
  ) then
    raise unique_violation using message = 'an auth identity already uses this email';
  end if;

  perform public.assert_within_hourly_limit('entity.collaborator_invite', 30);

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    new_profile_id,
    'authenticated',
    'authenticated',
    clean_email,
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now(), '', '', '', '', '', ''
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    new_profile_id::text,
    new_profile_id,
    jsonb_build_object(
      'sub', new_profile_id::text,
      'email', clean_email,
      'email_verified', true
    ),
    'email',
    now(), now(), now()
  );

  insert into public.profiles (
    id,
    org_id,
    role,
    first_name,
    last_name,
    reference_entity,
    collaborating_entity_id,
    auth_method,
    terms_accepted_at
  ) values (
    new_profile_id,
    actor_org,
    'entity',
    clean_first_name,
    clean_last_name,
    entity_name,
    p_collaborating_entity_id,
    'magic_link',
    now()
  );

  insert into public.entity_invitations (
    id,
    org_id,
    collaborating_entity_id,
    email,
    profile_id,
    invited_by,
    expires_at
  ) values (
    new_invitation_id,
    actor_org,
    p_collaborating_entity_id,
    clean_email,
    new_profile_id,
    actor,
    invitation_expires_at
  );

  insert into public.audit_log (
    org_id, actor_id, action, target_type, target_id, changes
  ) values (
    actor_org,
    actor,
    'entity.collaborator_invite',
    'profile',
    new_profile_id,
    jsonb_build_object('collaborating_entity_id', p_collaborating_entity_id)
  );

  return query
  select new_invitation_id, new_profile_id, clean_email, invitation_expires_at;
end;
$function$;

CREATE OR REPLACE FUNCTION public.invite_staff_member(p_email text, p_first_name text, p_last_name text, p_role text)
 RETURNS TABLE(profile_id uuid, email text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  clean_email text := lower(btrim(p_email));
  clean_first_name text := nullif(btrim(p_first_name), '');
  clean_last_name text := nullif(btrim(p_last_name), '');
  new_profile_id uuid := extensions.gen_random_uuid();
  invitation_expires_at timestamptz := now() + interval '30 days';
  org_language text;
begin
  perform private.require_recent_second_factor();
  if not (select public.has_permission('team.manage')) then
    raise insufficient_privilege using message = 'only active admins may invite staff members';
  end if;
  if clean_email is null
    or length(clean_email) > 254
    or clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or clean_first_name is null
    or length(clean_first_name) > 100
    or clean_last_name is null
    or length(clean_last_name) > 100
    or p_role not in ('staff', 'admin')
  then
    raise check_violation using message = 'invalid staff invitation';
  end if;
  if exists (select 1 from auth.users as account where lower(account.email) = clean_email) then
    raise unique_violation using message = 'an auth identity already uses this email';
  end if;

  perform public.assert_within_hourly_limit('staff.invite', 30);
  select default_language into org_language from public.organizations where id = actor_org;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', new_profile_id,
    'authenticated', 'authenticated', clean_email, '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), '', '', '', '', '', ''
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    new_profile_id::text,
    new_profile_id,
    jsonb_build_object('sub', new_profile_id::text, 'email', clean_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.profiles (
    id, org_id, role, first_name, last_name, preferred_language,
    document_type, auth_method, terms_accepted_at
  ) values (
    new_profile_id, actor_org, p_role, clean_first_name, clean_last_name,
    org_language, 'none', 'magic_link', now()
  );

  insert into public.staff_invitations (
    org_id, profile_id, email, role, invited_by, expires_at
  ) values (
    actor_org, new_profile_id, clean_email, p_role, actor, invitation_expires_at
  );

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org, actor, 'staff.invite', 'profile', new_profile_id,
    jsonb_build_object('role', p_role)
  );

  return query select new_profile_id, clean_email, invitation_expires_at;
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_staff_member(p_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  subject_role text;
begin
  perform private.require_recent_second_factor();
  if not (select public.has_permission('team.manage')) then
    raise insufficient_privilege using message = 'only active admins may remove staff members';
  end if;
  perform private.lock_staff_admin_count(actor_org);
  perform private.lock_team_permissions(actor_org);
  select role into subject_role
  from public.profiles
  where id = p_profile_id and org_id = actor_org and role in ('staff', 'admin') and is_active
  for update;
  if subject_role is null then
    raise no_data_found using message = 'active staff member not found';
  end if;
  if subject_role = 'admin' then
    perform private.assert_another_active_admin(actor_org, p_profile_id);
  end if;

  update public.profiles set is_active = false where id = p_profile_id;
  -- Removing the last person who can manage the team would lock everyone out
  -- of access changes; the whole removal is undone instead (RAPP-231).
  perform private.assert_team_manage_remains(actor_org);
  update auth.users
  set banned_until = now() + interval '100 years', updated_at = now()
  where id = p_profile_id;
  delete from auth.refresh_tokens where user_id = p_profile_id::text;
  delete from auth.sessions where user_id = p_profile_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org, actor, 'staff.remove', 'profile', p_profile_id,
    jsonb_build_object('role', subject_role, 'sessions_revoked', true)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.reset_second_factor(p_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  subject_role text;
begin
  perform private.require_recent_second_factor();
  if p_profile_id = actor then
    raise exception 'SECOND_FACTOR/OWN_RESET' using errcode = '42501';
  end if;

  select role into subject_role
  from public.profiles
  where id = p_profile_id and org_id = actor_org and role in ('staff', 'admin', 'entity');
  if subject_role is null then
    raise exception 'SECOND_FACTOR/NOT_FOUND' using errcode = 'P0002';
  end if;
  if subject_role = 'entity' and not (select public.has_permission('entities.manage')) then
    raise exception 'SECOND_FACTOR/ENTITIES_MANAGE_REQUIRED' using errcode = '42501';
  end if;
  if subject_role <> 'entity' and not (select public.has_permission('team.manage')) then
    raise exception 'SECOND_FACTOR/TEAM_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  delete from auth.mfa_factors where user_id = p_profile_id;
  delete from auth.refresh_tokens where user_id = p_profile_id::text;
  delete from auth.sessions where user_id = p_profile_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'team.second_factor_reset', 'profile', p_profile_id, '{}'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.restore_permission_preset_default(p_preset_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  key text;
begin
  perform private.require_recent_second_factor();
  select builtin_key into key
  from public.permission_presets
  where id = p_preset_id and org_id = (select public.current_org_id());
  if key is null then
    raise exception 'PERMISSIONS/NOT_A_BUILTIN_PRESET' using errcode = '22023';
  end if;
  perform public.save_permission_preset(
    p_preset_id,
    null,
    array(select permission_code from public.permission_preset_defaults where builtin_key = key)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_permission_preset(p_preset_id uuid, p_name text, p_permission_codes text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  clean_name text := nullif(btrim(p_name), '');
  wanted text[] := array(select distinct unnest(coalesce(p_permission_codes, '{}'::text[])));
  current_codes text[] := '{}';
  saved_id uuid := p_preset_id;
  is_builtin boolean := false;
begin
  perform private.require_recent_second_factor();
  if not (select public.has_permission('team.manage')) then
    raise exception 'PERMISSIONS/TEAM_MANAGE_REQUIRED' using errcode = '42501';
  end if;
  perform private.assert_known_permissions(wanted);
  perform private.lock_team_permissions(actor_org);

  if saved_id is null then
    if clean_name is null then
      raise exception 'PERMISSIONS/PRESET_NAME_REQUIRED' using errcode = '22023';
    end if;
    insert into public.permission_presets (org_id, name)
    values (actor_org, clean_name)
    returning id into saved_id;
  else
    select builtin_key is not null into is_builtin
    from public.permission_presets where id = saved_id and org_id = actor_org;
    if not found then
      raise exception 'PERMISSIONS/UNKNOWN_PRESET' using errcode = '22023';
    end if;
    if clean_name is null and not is_builtin then
      raise exception 'PERMISSIONS/PRESET_NAME_REQUIRED' using errcode = '22023';
    end if;
    update public.permission_presets
       set name = clean_name, updated_at = now()
     where id = saved_id;
    select coalesce(array_agg(permission_code), '{}') into current_codes
    from public.permission_preset_permissions where preset_id = saved_id;
  end if;

  perform private.assert_actor_holds(
    actor,
    array(
      select code from unnest(wanted) as code where not (code = any (current_codes))
      union
      select code from unnest(current_codes) as code where not (code = any (wanted))
    )
  );

  delete from public.permission_preset_permissions
  where preset_id = saved_id and not (permission_code = any (wanted));
  insert into public.permission_preset_permissions (org_id, preset_id, permission_code)
  select actor_org, saved_id, code from unnest(wanted) as code
  on conflict do nothing;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org, actor, 'team.preset_save', 'permission_preset', saved_id,
    jsonb_build_object('name', clean_name, 'permissions', to_jsonb(wanted))
  );
  return saved_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_entity_collaborator_active(p_profile_id uuid, p_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  subject_entity uuid;
begin
  perform private.require_recent_second_factor();
  if not (select public.has_permission('entities.manage')) then
    raise exception 'only admins may change entity collaborator access'
      using errcode = 'insufficient_privilege';
  end if;

  select profile.collaborating_entity_id into subject_entity
  from public.profiles as profile
  join public.collaborating_entities as entity
    on entity.org_id = profile.org_id
   and entity.id = profile.collaborating_entity_id
  where profile.id = p_profile_id
    and profile.org_id = actor_org
    and profile.role = 'entity'
    and (not p_is_active or entity.is_active);

  if subject_entity is null then
    raise no_data_found using message = 'entity collaborator not found';
  end if;

  update public.profiles
  set is_active = p_is_active
  where id = p_profile_id and org_id = actor_org;

  update auth.users
  set
    banned_until = case when p_is_active then null else now() + interval '100 years' end,
    updated_at = now()
  where id = p_profile_id;

  if not p_is_active then
    delete from auth.refresh_tokens where user_id = p_profile_id::text;
    delete from auth.sessions where user_id = p_profile_id;
  end if;

  insert into public.audit_log (
    org_id, actor_id, action, target_type, target_id, changes
  ) values (
    actor_org,
    actor,
    'entity.collaborator_access',
    'profile',
    p_profile_id,
    jsonb_build_object(
      'collaborating_entity_id', subject_entity,
      'is_active', p_is_active
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_staff_member_role(p_profile_id uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  old_role text;
begin
  perform private.require_recent_second_factor();
  if not (select public.has_permission('team.manage')) then
    raise insufficient_privilege using message = 'only active admins may change staff roles';
  end if;
  if p_role not in ('staff', 'admin') then
    raise check_violation using message = 'staff role must be staff or admin';
  end if;
  perform private.lock_staff_admin_count(actor_org);
  select role into old_role
  from public.profiles
  where id = p_profile_id and org_id = actor_org and role in ('staff', 'admin') and is_active
  for update;
  if old_role is null then
    raise no_data_found using message = 'active staff member not found';
  end if;
  if old_role = 'admin' and p_role = 'staff' then
    perform private.assert_another_active_admin(actor_org, p_profile_id);
  end if;
  update public.profiles set role = p_role where id = p_profile_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org, actor, 'staff.role_change', 'profile', p_profile_id,
    jsonb_build_object('from', old_role, 'to', p_role)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_team_member_permissions(p_profile_id uuid, p_permission_codes text[], p_preset_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  current_codes text[];
  wanted text[] := array(select distinct unnest(coalesce(p_permission_codes, '{}'::text[])));
  change jsonb;
begin
  perform private.require_recent_second_factor();
  if not (select public.has_permission('team.manage')) then
    raise exception 'PERMISSIONS/TEAM_MANAGE_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_profile_id and org_id = actor_org and role in ('staff', 'admin')
  ) then
    raise exception 'PERMISSIONS/NOT_A_TEAM_MEMBER' using errcode = 'P0002';
  end if;
  if p_preset_id is not null and not exists (
    select 1 from public.permission_presets where id = p_preset_id and org_id = actor_org
  ) then
    raise exception 'PERMISSIONS/UNKNOWN_PRESET' using errcode = '22023';
  end if;
  perform private.assert_known_permissions(wanted);
  perform private.lock_team_permissions(actor_org);

  select coalesce(array_agg(permission_code), '{}') into current_codes
  from public.team_member_permissions where profile_id = p_profile_id;

  perform private.assert_actor_holds(
    actor,
    array(
      select code from unnest(wanted) as code where not (code = any (current_codes))
      union
      select code from unnest(current_codes) as code where not (code = any (wanted))
    )
  );

  change := private.write_member_permissions(actor, actor_org, p_profile_id, wanted, p_preset_id);
  perform private.assert_team_manage_remains(actor_org);

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'team.permissions_update', 'profile', p_profile_id, change);
end;
$function$;

CREATE OR REPLACE FUNCTION public.transition_deletion_request(p_request_id uuid, p_state text, p_resolution_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  previous_state text;
begin
  perform private.require_recent_second_factor();
  if actor is null or not public.has_permission('rgpd.erase') then
    raise exception 'staff or admin authentication required' using errcode = '42501';
  end if;

  select request.state
    into previous_state
    from public.deletion_requests request
    join public.profiles subject on subject.id = request.profile_id
   where request.id = p_request_id
     and subject.org_id = public.current_org_id()
   for update of request;

  if not found then
    raise exception 'deletion request not found' using errcode = 'P0002';
  end if;

  if p_state not in ('in_progress', 'done', 'declined')
     or previous_state in ('done', 'declined')
     or (previous_state = 'in_progress' and p_state = 'in_progress') then
    raise exception 'invalid deletion request state transition' using errcode = '23514';
  end if;

  update public.deletion_requests
     set state = p_state,
         resolution_note = nullif(btrim(p_resolution_note), ''),
         resolved_by = case when p_state in ('done', 'declined') then actor else null end,
         resolved_at = case when p_state in ('done', 'declined') then now() else null end
   where id = p_request_id;
end;
$function$;
