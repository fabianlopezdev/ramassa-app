-- Her page knows whether she joined the way the database decides it (fixes RAPP-653).
--
-- WHY
--
-- `update_participant_profile` completes a record in parts only for role
-- `invited`; any other player is saved whole. The apps read "not joined" from
-- `terms_accepted_at is null`, which also holds for a joined player who never
-- accepted the terms (three seeded players, and records from before the terms
-- existed). For her, the apps sent only the changed fields, the database saved
-- them as a whole record, and the save failed on a null name. Her page in the
-- admin and the staff phone both hit it.
--
-- WHAT CHANGES
--
-- `get_participant_profile` also returns her `role`, so the apps read the same
-- rule the writers apply. The role is basic: every caller who passes the
-- participants.view check already sees her in the roster as joined or not.
-- A changed result type needs drop and create; the body, the checks, the
-- audit row, SECURITY DEFINER, the search_path and the grants are unchanged.

drop function public.get_participant_profile(uuid);

create function public.get_participant_profile(participant_id uuid)
 RETURNS TABLE(id uuid, first_name text, last_name text, date_of_birth date, place_of_birth text, nationality text, preferred_language text, document_type text, document_number text, document_name text, phone text, address text, city text, postal_code text, reference_entity text, reference_contact_name text, has_dependents boolean, num_dependents integer, clothing_size text, shoe_size text, avatar_url text, media_consent boolean, terms_accepted_at timestamp with time zone, is_active boolean, is_forum_banned boolean, anonymized_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, applicant_status text, applicant_status_details text, supporting_entities text[], season_number smallint, childcare_need text, specific_needs text, health_info text, emergency_contact_name text, emergency_contact_relation text, emergency_contact_phone text, is_test_account boolean, role text)
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
    s.is_test_account,
    -- Joined or not, as the writers decide it: only an invited woman is completed in parts.
    s.role
  from subject s;
$function$;


revoke all on function public.get_participant_profile(uuid) from public, anon;
grant execute on function public.get_participant_profile(uuid) to authenticated, service_role;
