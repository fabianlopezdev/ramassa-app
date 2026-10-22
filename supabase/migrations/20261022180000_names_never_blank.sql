-- Her first and last name are never blank, by any client write (RAPP-624,
-- pending fix 24).
--
-- The profile RPCs refuse a blank name (pending fix 22), but a direct UPDATE
-- of `profiles` as `authenticated` (by her, or by staff with
-- participants.view_personal) still saved '' or spaces. The guard trigger
-- that already protects the privileged columns now refuses a first or last
-- name that a client write makes blank. A check constraint would also refuse
-- the erasure, which blanks the name on purpose (`anonymize_participant`), so
-- the rule lives where client writes are told apart from the database's own.
--
-- Docs: https://www.postgresql.org/docs/current/plpgsql-trigger.html (a
-- BEFORE row trigger that raises refuses the write) and
-- https://supabase.com/docs/guides/database/postgres/row-level-security.

create or replace function private.guard_profile_privileged_columns()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
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
  then
    -- These columns change only through their own action (an RPC).
    raise exception 'PROFILES/PRIVILEGED_COLUMN' using errcode = '42501';
  end if;

  return new;
end;
$function$;

