-- The emergency contact keeps the privacy level it was saved under (RAPP-614,
-- pending fix 26).
--
-- `private.emergency_contact_permission` read the CURRENT authorization
-- version's level, so a contact collected as `sensitive` became readable at
-- `personal` when a later version relaxed the level. Decision (safer default):
-- each profile stores the level in force when its contact was saved
-- (`emergency_contact_privacy`, stamped by a trigger on every write of the
-- contact), and reading the name and relation needs the STRICTER of that and
-- the current level. The phone was always sensitive and stays so. The stored
-- level is a privileged column: no client sets it.
--
-- Existing contacts take the level of the version of her latest signature,
-- else the current one.
--
-- Docs: https://www.postgresql.org/docs/current/plpgsql-trigger.html (BEFORE
-- row triggers fire in name order and may change the row) and
-- https://supabase.com/docs/guides/database/postgres/row-level-security.

alter table public.profiles
  add column emergency_contact_privacy text
    check (emergency_contact_privacy is null or emergency_contact_privacy in ('personal', 'sensitive'));
comment on column public.profiles.emergency_contact_privacy is
  'The emergency contact''s privacy level in force when it was saved (RAPP-614). Reading it needs the stricter of this and the current version''s level.';

-- The level the current version gives the contact.
create or replace function private.emergency_contact_level(p_org_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (private.current_authorization_version(p_org_id)).content
         -> 'questions' -> 'emergency_contact' ->> 'privacy' = 'sensitive'
    then 'sensitive' else 'personal' end;
$$;

create or replace function private.stamp_emergency_contact_privacy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.emergency_contact_name is distinct from old.emergency_contact_name
     or new.emergency_contact_relation is distinct from old.emergency_contact_relation
     or new.emergency_contact_phone is distinct from old.emergency_contact_phone
  then
    new.emergency_contact_privacy := case
      when new.emergency_contact_name is null and new.emergency_contact_relation is null
           and new.emergency_contact_phone is null then null
      else private.emergency_contact_level(new.org_id) end;
  end if;
  return new;
end;
$$;

revoke all on function private.emergency_contact_level(uuid) from public, anon, authenticated;
revoke all on function private.stamp_emergency_contact_privacy() from public, anon, authenticated;

-- Named to fire after profiles_guard_privileged_columns, which refuses a
-- client that sets the level itself.
create trigger profiles_stamp_emergency_contact_privacy
  before insert or update on public.profiles
  for each row execute function private.stamp_emergency_contact_privacy();

update public.profiles p
   set emergency_contact_privacy = coalesce(
         (select case when v.content -> 'questions' -> 'emergency_contact' ->> 'privacy' = 'sensitive'
                      then 'sensitive' else 'personal' end
            from public.authorization_signatures s
            join public.authorization_versions v on v.id = s.version_id
           where s.profile_id = p.id
           order by s.signed_at desc limit 1),
         private.emergency_contact_level(p.org_id))
 where p.emergency_contact_name is not null or p.emergency_contact_relation is not null
    or p.emergency_contact_phone is not null;

-- The stricter of the saved and the current level.
create or replace function private.emergency_contact_permission(p_org_id uuid, p_saved_level text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.emergency_contact_level(p_org_id) = 'sensitive' or p_saved_level = 'sensitive'
    then 'participants.view_sensitive'
    else 'participants.view_personal'
  end;
$$;
revoke all on function private.emergency_contact_permission(uuid, text) from public, anon, authenticated;

-- No client sets the stored level.
CREATE OR REPLACE FUNCTION private.guard_profile_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- A client write (her app, the admin, a direct table write) never leaves a
  -- name blank (pending fix 24). The database's own writes (security definer
  -- functions, the erasure) are not clients.
  if current_user in ('authenticated', 'anon')
     and tg_op = 'UPDATE'
     and ((new.first_name is distinct from old.first_name and btrim(new.first_name) = '')
          or (new.last_name is distinct from old.last_name and btrim(new.last_name) = ''))
  then
    raise exception 'PROFILES/NAME_REQUIRED' using errcode = '23514';
  end if;

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
    or new.is_test_account is distinct from old.is_test_account
    -- The encrypted fields (RAPP-624): only the server encrypts them, so a
    -- client can never plant a ciphertext a profile read would decrypt.
    or new.document_number is distinct from old.document_number
    or new.phone is distinct from old.phone
    or new.address is distinct from old.address
    or new.postal_code is distinct from old.postal_code
    or new.applicant_status is distinct from old.applicant_status
    or new.applicant_status_details is distinct from old.applicant_status_details
    or new.specific_needs is distinct from old.specific_needs
    or new.health_info is distinct from old.health_info
    or new.emergency_contact_phone is distinct from old.emergency_contact_phone
    or new.emergency_contact_privacy is distinct from old.emergency_contact_privacy
  then
    -- These columns change only through their own action (an RPC).
    raise exception 'PROFILES/PRIVILEGED_COLUMN' using errcode = '42501';
  end if;

  return new;
end;
$function$;


-- Her page reads the contact at the stricter level.
CREATE OR REPLACE FUNCTION public.get_participant_profile(participant_id uuid)
 RETURNS TABLE(id uuid, first_name text, last_name text, date_of_birth date, place_of_birth text, nationality text, preferred_language text, document_type text, document_number text, document_name text, phone text, address text, city text, postal_code text, reference_entity text, reference_contact_name text, has_dependents boolean, num_dependents integer, clothing_size text, shoe_size text, avatar_url text, media_consent boolean, terms_accepted_at timestamp with time zone, is_active boolean, is_forum_banned boolean, anonymized_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, applicant_status text, applicant_status_details text, supporting_entities text[], season_number smallint, childcare_need text, specific_needs text, health_info text, emergency_contact_name text, emergency_contact_relation text, emergency_contact_phone text, is_test_account boolean)
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
    s.first_name,
    s.last_name,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.date_of_birth end,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.place_of_birth end,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.nationality end,
    s.preferred_language,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.document_type end,
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.document_number) end,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.document_name end,
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.phone) end,
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.address) end,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.city end,
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.postal_code) end,
    s.reference_entity,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.reference_contact_name end,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.has_dependents end,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.num_dependents end,
    s.clothing_size,
    s.shoe_size,
    s.avatar_url,
    s.media_consent_at is not null,
    s.terms_accepted_at,
    s.is_active,
    s.is_forum_banned,
    s.anonymized_at,
    s.created_at,
    s.updated_at,
    -- The season registration answers (RAPP-303). Applicant status and
    -- specific needs are sensitive, like the document number.
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.applicant_status) end,
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.applicant_status_details) end,
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.supporting_entities end,
    -- Counted (RAPP-306): earlier seasons plus the seasons she signed.
    private.season_number(s.id),
    case when (select private.participant_permission(participant_id, 'participants.view_personal')) then s.childcare_need end,
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.specific_needs) end,
    -- The medical answer needs its own permission (RAPP-304); the emergency
    -- contact follows the personal and sensitive levels.
    case when (select private.participant_permission(participant_id, 'participants.view_health')) then public.decrypt_field(s.health_info) end,
    case when (select private.participant_permission(participant_id, private.emergency_contact_permission(s.org_id, s.emergency_contact_privacy))) then s.emergency_contact_name end,
    case when (select private.participant_permission(participant_id, private.emergency_contact_permission(s.org_id, s.emergency_contact_privacy))) then s.emergency_contact_relation end,
    case when (select private.participant_permission(participant_id, 'participants.view_sensitive')) then public.decrypt_field(s.emergency_contact_phone) end,
    s.is_test_account
  from subject s;
$function$;


drop function private.emergency_contact_permission(uuid);
