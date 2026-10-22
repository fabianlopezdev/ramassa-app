-- A write never relaxes her emergency contact's saved privacy level, and
-- staff who cannot read the contact cannot write it (RAPP-614, pending fix 27).
--
-- `private.stamp_emergency_contact_privacy` (20261022182000) re-stamped the
-- stored level from the CURRENT version on every write of the contact. Staff
-- with participants.view_personal but without participants.view_sensitive
-- could therefore relax a contact saved as `sensitive` with one direct
-- `update profiles set emergency_contact_relation = 'x'` once a later version
-- made the contact `personal`, and then read it.
--
-- Decision (safer default):
--   1. On UPDATE the stored level is the STRICTER of the stored one and the
--      current version's level. Only clearing the contact (name, relation and
--      phone all empty) clears the level; a new contact then takes the
--      current level.
--   2. A client write to the contact's name or relation by anyone but her is
--      refused unless the writer may read the contact (the stricter of the
--      stored and the current level, `private.emergency_contact_permission`).
--      The phone is already a privileged column. Her own edits stay hers.
--
-- The guard trigger runs as the caller (SECURITY INVOKER), so the permission
-- check is a SECURITY DEFINER helper granted to `authenticated` (a revoked
-- private function would fail there, see BUILD-RULES notes).
--
-- Docs: https://www.postgresql.org/docs/current/plpgsql-trigger.html (BEFORE
-- row triggers may change or refuse the row; OLD is the stored row) and
-- https://supabase.com/docs/guides/database/postgres/row-level-security
-- (security definer functions with an empty search path, checks inside).

create or replace function private.stamp_emergency_contact_privacy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_level text;
begin
  if tg_op = 'INSERT'
     or new.emergency_contact_name is distinct from old.emergency_contact_name
     or new.emergency_contact_relation is distinct from old.emergency_contact_relation
     or new.emergency_contact_phone is distinct from old.emergency_contact_phone
  then
    if new.emergency_contact_name is null and new.emergency_contact_relation is null
       and new.emergency_contact_phone is null then
      new.emergency_contact_privacy := null;
    else
      current_level := private.emergency_contact_level(new.org_id);
      new.emergency_contact_privacy := case
        when tg_op = 'UPDATE' and old.emergency_contact_privacy = 'sensitive' then 'sensitive'
        else current_level end;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.stamp_emergency_contact_privacy() from public, anon, authenticated;

-- May the caller read (and so write) this woman's emergency contact?
create or replace function private.may_write_emergency_contact(
  p_profile_id uuid, p_org_id uuid, p_saved_level text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_profile_id = (select auth.uid())
      or private.participant_permission(
           p_profile_id, private.emergency_contact_permission(p_org_id, p_saved_level));
$$;
revoke all on function private.may_write_emergency_contact(uuid, uuid, text) from public, anon;
grant execute on function private.may_write_emergency_contact(uuid, uuid, text) to authenticated;

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

  -- Staff who cannot read her emergency contact cannot write it either
  -- (pending fix 27): the stricter of its saved and the current level.
  if current_user in ('authenticated', 'anon')
     and tg_op = 'UPDATE'
     and (new.emergency_contact_name is distinct from old.emergency_contact_name
          or new.emergency_contact_relation is distinct from old.emergency_contact_relation)
     and not private.may_write_emergency_contact(old.id, old.org_id, old.emergency_contact_privacy)
  then
    raise exception 'PROFILES/EMERGENCY_CONTACT_HIDDEN' using errcode = '42501';
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
