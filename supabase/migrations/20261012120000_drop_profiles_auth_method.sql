-- Drop profiles.auth_method (RAPP-243, part of RAPP-211).
--
-- Since RAPP-224 every account signs in with an email code, so the column only
-- ever held 'magic_link' (25 of 25 local profiles, 2026-10-12) and nothing in
-- the apps reads it. The four functions that named it are redefined without
-- it, unchanged otherwise, and then the column (with its check constraint) goes.

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
    document_type, terms_accepted_at
  ) values (
    new_profile_id, actor_org, p_role, clean_first_name, clean_last_name,
    org_language, 'none', now()
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
    terms_accepted_at
  ) values (
    new_profile_id,
    actor_org,
    'entity',
    clean_first_name,
    clean_last_name,
    entity_name,
    p_collaborating_entity_id,
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

CREATE OR REPLACE FUNCTION private.guard_profile_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- A SECURITY DEFINER function runs as its owner. The five SECURITY INVOKER
  -- functions that write profiles mark their one write as trusted (below).
  if current_user not in ('authenticated', 'anon')
    or current_setting('ramassa.trusted_profile_write', true) = 'on'
  then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Profiles are created by onboarding or an invitation, never by a direct insert.
    raise exception 'PROFILES/DIRECT_INSERT' using errcode = '42501';
  end if;

  if new.id is distinct from old.id
    or new.org_id is distinct from old.org_id
    or new.role is distinct from old.role
    or new.is_active is distinct from old.is_active
    or new.is_forum_banned is distinct from old.is_forum_banned
    or new.anonymized_at is distinct from old.anonymized_at
    or new.terms_accepted_at is distinct from old.terms_accepted_at
    or new.media_consent_at is distinct from old.media_consent_at
    or new.collaborating_entity_id is distinct from old.collaborating_entity_id
    or new.created_at is distinct from old.created_at
    or new.sessions_valid_after is distinct from old.sessions_valid_after
  then
    -- These columns change only through their own action (an RPC).
    raise exception 'PROFILES/PRIVILEGED_COLUMN' using errcode = '42501';
  end if;

  return new;
end;
$function$;

-- Its result loses a column, which `create or replace` cannot do, so it is
-- dropped and created again. A new function gets the same default grants the
-- old one had.
drop function public.get_participant_profile(uuid);

CREATE FUNCTION public.get_participant_profile(participant_id uuid)
 RETURNS TABLE(id uuid, first_name text, last_name text, date_of_birth date, place_of_birth text, nationality text, preferred_language text, document_type text, document_number text, phone text, address text, city text, postal_code text, reference_entity text, reference_contact_name text, has_dependents boolean, num_dependents integer, clothing_size text, shoe_size text, avatar_url text, media_consent boolean, terms_accepted_at timestamp with time zone, is_active boolean, is_forum_banned boolean, anonymized_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    s.anonymized_at,
    s.created_at,
    s.updated_at
  from subject s;
$function$;

alter table public.profiles drop column auth_method;
