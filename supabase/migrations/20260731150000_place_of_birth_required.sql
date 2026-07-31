-- Place of birth becomes REQUIRED at intake (RAPP-21; decided by Fabián
-- 2026-07-31, amending the RAPP-4 deliverable). It was in Marc's kickoff field
-- list all along; the optional marking was a data-minimization judgement, now
-- reversed.
--
-- The COLUMN stays nullable on purpose: seeded and staff-created profiles
-- predate the requirement and carry NULL, and a NOT NULL constraint would
-- rewrite history to satisfy the present. The requirement belongs to the
-- INTAKE path, so it is enforced where the client schema already enforces it -
-- in the RPC's re-validation - keeping "the server re-checks exactly what the
-- form promised" true (CONVENTIONS rule 2).

create or replace function public.complete_onboarding(payload jsonb)
returns public.profiles
language plpgsql
security invoker
set search_path = ''
as $$
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

  insert into public.terms_acceptances (profile_id, terms_version, locale_shown)
  values (caller, terms_version_value, locale_shown_value);

  return saved;
end;
$$;

comment on function public.complete_onboarding is 'Writes a player profile and its terms acceptance in ONE transaction, encrypting the sensitive fields server-side so the key never reaches a device. SECURITY INVOKER: RLS still decides what the caller may write. place_of_birth required since 2026-07-31.';
