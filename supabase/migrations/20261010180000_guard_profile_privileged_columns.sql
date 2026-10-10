-- Direct profile writes can no longer change who someone is (RAPP-239).
--
-- WHY
--
-- `authenticated` holds INSERT and UPDATE on every `profiles` column, and the
-- row policies check only WHICH rows a person may write. Reproduced on
-- 2026-10-10 with direct API-shaped writes:
--   - a staff member set her own `role` to `admin`, and made a player `staff`
--     (`profiles_update_org_staff`);
--   - a forum-banned player lifted her own ban (`profiles_update_self_no_escalation`);
--   - an entity collaborator moved herself to another partner entity, which
--     would show her that entity's referrals.
--
-- No app code writes `profiles` directly: onboarding, profile edits, activation,
-- role changes and erasure all go through SECURITY DEFINER functions. Those run
-- as the function owner, so this guard reads `current_user` to tell the two
-- paths apart and leaves every function untouched.
--
-- WHAT IT ENFORCES, for writes made directly by a client role
--   - no direct INSERT: a profile is created by onboarding or an invitation;
--   - on UPDATE, these columns cannot change: id, org_id, role, is_active,
--     is_forum_banned, anonymized_at, terms_accepted_at, media_consent_at,
--     auth_method, collaborating_entity_id, created_at.
--
-- Five SECURITY INVOKER functions write profiles under the caller's row
-- policies: complete_onboarding, update_own_profile, update_participant_profile,
-- set_participant_active and set_forum_posting_disabled. Each marks its one
-- write with a transaction-local setting, `ramassa.trusted_profile_write`, and
-- clears it right after. A client cannot set it: the API calls only functions
-- in the exposed schemas, and `set_config` is not one of them.
--
-- The trigger function is deliberately SECURITY INVOKER: as a definer it would
-- always see its owner as `current_user` and guard nothing.

create or replace function private.guard_profile_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
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
    or new.auth_method is distinct from old.auth_method
    or new.collaborating_entity_id is distinct from old.collaborating_entity_id
    or new.created_at is distinct from old.created_at
  then
    -- These columns change only through their own action (an RPC).
    raise exception 'PROFILES/PRIVILEGED_COLUMN' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function private.guard_profile_privileged_columns is 'Blocks direct client inserts on profiles and direct changes to identity, access and consent columns. SECURITY DEFINER functions are unaffected.';

-- PostgreSQL checks no EXECUTE privilege when a trigger fires, so the function
-- stays closed to direct calls like every other private function.
revoke all on function private.guard_profile_privileged_columns() from public, anon, authenticated;

-- The five invoker functions, unchanged except for marking their profile write.

create or replace function public.complete_onboarding(payload jsonb)
 RETURNS profiles
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
declare
  caller uuid := (select auth.uid());
  saved public.profiles;
  document_type_value text := payload ->> 'document_type';
  document_number_value text := nullif(payload ->> 'document_number', '');
  place_of_birth_value text := nullif(trim(payload ->> 'place_of_birth'), '');
  terms_version_value text := nullif(payload ->> 'terms_version', '');
  locale_shown_value text := nullif(payload ->> 'locale_shown', '');
begin
  if caller is null then
    raise exception 'complete_onboarding requires an authenticated caller'
      using errcode = 'insufficient_privilege';
  end if;

  if terms_version_value is null or locale_shown_value is null then
    raise exception 'complete_onboarding requires terms_version and locale_shown'
      using errcode = 'not_null_violation';
  end if;

  if place_of_birth_value is null then
    raise exception 'complete_onboarding requires place_of_birth'
      using errcode = 'not_null_violation';
  end if;

  -- A document number is required unless the answer is "none", which is a
  -- first-class answer: many participants genuinely have no document, and
  -- onboarding must never dead-end on it.
  if document_type_value is distinct from 'none' and document_number_value is null then
    raise exception 'complete_onboarding requires document_number unless document_type is none'
      using errcode = 'not_null_violation';
  end if;

  perform set_config('ramassa.trusted_profile_write', 'on', true);
  insert into public.profiles (
    id, org_id, role,
    first_name, last_name, date_of_birth, place_of_birth, nationality, preferred_language,
    document_type, document_number,
    phone, address, city, postal_code,
    reference_entity, reference_contact_name,
    has_dependents, num_dependents, clothing_size, shoe_size, avatar_url,
    terms_accepted_at, media_consent_at
  )
  values (
    caller,
    (select public.default_organization_id()),
    'player',
    payload ->> 'first_name',
    payload ->> 'last_name',
    (payload ->> 'date_of_birth')::date,
    place_of_birth_value,
    payload ->> 'nationality',
    coalesce(nullif(payload ->> 'preferred_language', ''), 'ca'),
    document_type_value,
    public.encrypt_field(document_number_value),
    public.encrypt_field(nullif(payload ->> 'phone', '')),
    public.encrypt_field(nullif(payload ->> 'address', '')),
    nullif(payload ->> 'city', ''),
    public.encrypt_field(nullif(payload ->> 'postal_code', '')),
    nullif(payload ->> 'reference_entity', ''),
    nullif(payload ->> 'reference_contact_name', ''),
    coalesce((payload ->> 'has_dependents')::boolean, false),
    coalesce((payload ->> 'num_dependents')::integer, 0),
    nullif(payload ->> 'clothing_size', ''),
    nullif(payload ->> 'shoe_size', ''),
    nullif(payload ->> 'avatar_url', ''),
    now(),
    case when (payload ->> 'media_consent')::boolean then now() else null end
  )
  -- Re-running the wizard (a resumed session that reached the end twice) must
  -- update rather than explode. Role and org are deliberately NOT in the update
  -- list: they are not the wizard's to change.
  on conflict (id) do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    date_of_birth = excluded.date_of_birth,
    place_of_birth = excluded.place_of_birth,
    nationality = excluded.nationality,
    preferred_language = excluded.preferred_language,
    document_type = excluded.document_type,
    document_number = excluded.document_number,
    phone = excluded.phone,
    address = excluded.address,
    city = excluded.city,
    postal_code = excluded.postal_code,
    reference_entity = excluded.reference_entity,
    reference_contact_name = excluded.reference_contact_name,
    has_dependents = excluded.has_dependents,
    num_dependents = excluded.num_dependents,
    clothing_size = excluded.clothing_size,
    shoe_size = excluded.shoe_size,
    avatar_url = excluded.avatar_url,
    terms_accepted_at = excluded.terms_accepted_at,
    media_consent_at = excluded.media_consent_at,
    updated_at = now()
  returning * into saved;
  perform set_config('ramassa.trusted_profile_write', '', true);

  insert into public.terms_acceptances (profile_id, terms_version, locale_shown)
  values (caller, terms_version_value, locale_shown_value);

  return saved;
end;
$$;

create or replace function public.set_forum_posting_disabled(p_participant_id uuid, p_disabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
begin
  if not (select public.is_staff_or_admin()) then
    raise exception 'forum posting status action denied' using errcode = 'insufficient_privilege';
  end if;
  perform set_config('ramassa.trusted_profile_write', 'on', true);
  update public.profiles
  set is_forum_banned = p_disabled
  where id = p_participant_id
    and org_id = (select public.current_org_id())
    and role = 'player';
  perform set_config('ramassa.trusted_profile_write', '', true);
  if not found then
    raise exception 'participant not found' using errcode = 'no_data_found';
  end if;
end;
$$;

create or replace function public.set_participant_active(participant_id uuid, next_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
declare
  previous_is_active boolean;
begin
  if not (select public.is_staff_or_admin()) then
    raise exception 'set_participant_active is a staff action'
      using errcode = 'insufficient_privilege';
  end if;

  select p.is_active into previous_is_active
  from public.profiles p
  where p.id = participant_id;

  if previous_is_active is null then
    return;
  end if;

  perform set_config('ramassa.trusted_profile_write', 'on', true);
  update public.profiles
     set is_active = next_is_active, updated_at = now()
   where id = participant_id;
  perform set_config('ramassa.trusted_profile_write', '', true);

  if not found then
    return;
  end if;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    (select public.current_org_id()),
    (select auth.uid()),
    case when next_is_active then 'profile.activate' else 'profile.deactivate' end,
    'profile',
    participant_id,
    jsonb_build_object(
      'is_active',
      jsonb_build_object('old', previous_is_active, 'new', next_is_active)
    )
  );
end;
$$;

create or replace function public.update_own_profile(payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
declare
  caller uuid := (select auth.uid());
  document_type_value text := payload ->> 'document_type';
  document_number_value text := nullif(payload ->> 'document_number', '');
  place_of_birth_value text := nullif(trim(payload ->> 'place_of_birth'), '');
begin
  if caller is null then
    raise exception 'update_own_profile requires an authenticated caller'
      using errcode = 'insufficient_privilege';
  end if;

  if place_of_birth_value is null then
    raise exception 'update_own_profile requires place_of_birth'
      using errcode = 'not_null_violation';
  end if;

  -- Same first-class "no document" answer the wizard offers. Editing must not
  -- be stricter than intake, or a participant who has no papers cannot save.
  if document_type_value is distinct from 'none' and document_number_value is null then
    raise exception 'update_own_profile requires document_number unless document_type is none'
      using errcode = 'not_null_violation';
  end if;

  -- The column list IS the authorization boundary. `role`, `org_id`,
  -- `terms_accepted_at`, `is_active` and `is_forum_banned` are absent on
  -- purpose: they are not the participant's to change, and a payload that
  -- carries them (a client echoing the whole profile back, or an attacker
  -- trying it on) simply has those keys ignored.
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
    avatar_url = coalesce(nullif(payload ->> 'avatar_url', ''), avatar_url),
    -- Revocable in both directions, unlike the terms: a woman who agreed to
    -- appear in photos must be able to change her mind from this screen.
    media_consent_at = case
      when (payload ->> 'media_consent')::boolean then coalesce(media_consent_at, now())
      else null
    end,
    updated_at = now()
  where id = caller;
  perform set_config('ramassa.trusted_profile_write', '', true);
end;
$$;

create or replace function public.update_participant_profile(participant_id uuid, payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
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
  if not (select public.is_staff_or_admin()) then
    raise exception 'update_participant_profile is the staff path; a participant edits herself through update_own_profile()'
      using errcode = 'insufficient_privilege';
  end if;

  if place_of_birth_value is null then
    raise exception 'update_participant_profile requires place_of_birth'
      using errcode = 'not_null_violation';
  end if;

  if document_type_value is distinct from 'none' and document_number_value is null then
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
  where p.id = participant_id;

  -- No readable row means no row this caller may edit: RLS has already decided,
  -- and there is nothing to audit.
  if before_document is null then
    return;
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
  where id = participant_id;
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

create trigger profiles_guard_privileged_columns
  before insert or update on public.profiles
  for each row execute function private.guard_profile_privileged_columns();
