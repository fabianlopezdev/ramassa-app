-- A name made only of invisible characters, or only of combining marks, is
-- blank on every path that takes a person's name (RAPP-624, verifier round 2).
--
-- 1. `private.name_trim` (20261022211000) trimmed the whitespace JavaScript's
--    trim() removes plus five zero-width characters. A single direction mark
--    (U+200E, U+200F, U+061C), soft hyphen (U+00AD), combining grapheme joiner
--    (U+034F), invisible operator (U+2062), bidi override or isolate (U+202E,
--    U+2066), Hangul filler (U+3164, U+FFA0) or tag character (U+E0020) still
--    passed as a name. It now trims every code point that is Unicode
--    White_Space or Default_Ignorable_Code_Point, and a name whose remaining
--    characters are all combining marks (General_Category M) is blank too: a
--    mark alone has no letter to sit on. Inner characters stay (a Persian name
--    keeps its zero-width non-joiner) and a real letter with an invisible
--    character is still a name.
--
--    The two classes are code point ranges generated from the Unicode
--    properties. The shared Zod schema (`packages/shared/schemas/person-name.ts`)
--    uses the properties themselves, and `tests/person-name-parity.test.ts`
--    reads the ranges between the markers below and compares both sides over
--    every code point. Keep the markers when this function is restated.
--
-- 2. The paths 20261022211000 missed now use it: the walk-in signing (her
--    check and her stored names), the entity referral (her names and the
--    entity contact's name), the emergency contact's name (its required check
--    and the stored value), and the reference contact's name on every path
--    that writes it (the prefill, onboarding, her profile screen, staff's
--    edit). An optional contact's name of only invisible characters is no
--    answer (null).
--
-- Docs: https://www.postgresql.org/docs/current/functions-matching.html#POSIX-ESCAPE-SEQUENCES
-- (\uwxyz and \Ustuvwxyz in a bracket expression),
-- https://www.unicode.org/reports/tr44/#Default_Ignorable_Code_Point,
-- https://www.unicode.org/reports/tr44/#White_Space,
-- https://www.unicode.org/reports/tr44/#General_Category_Values (M).

create or replace function private.name_trim(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  with classes (invisible, marks) as (
    select
      -- name-trim-invisible:start
      '\u0009-\u000d\u0020\u0085\u00a0\u00ad\u034f\u061c\u115f-\u1160\u1680\u17b4-\u17b5\u180b-\u180f' ||
      '\u2000-\u200f\u2028-\u202f\u205f-\u206f\u3000\u3164\ufe00-\ufe0f\ufeff\uffa0\ufff0-\ufff8' ||
      '\U0001bca0-\U0001bca3\U0001d173-\U0001d17a\U000e0000-\U000e0fff',
      -- name-trim-invisible:end
      -- name-trim-marks:start
      '\u0300-\u036f\u0483-\u0489\u0591-\u05bd\u05bf\u05c1-\u05c2\u05c4-\u05c5\u05c7\u0610-\u061a' ||
      '\u064b-\u065f\u0670\u06d6-\u06dc\u06df-\u06e4\u06e7-\u06e8\u06ea-\u06ed\u0711\u0730-\u074a' ||
      '\u07a6-\u07b0\u07eb-\u07f3\u07fd\u0816-\u0819\u081b-\u0823\u0825-\u0827\u0829-\u082d' ||
      '\u0859-\u085b\u0897-\u089f\u08ca-\u08e1\u08e3-\u0903\u093a-\u093c\u093e-\u094f\u0951-\u0957' ||
      '\u0962-\u0963\u0981-\u0983\u09bc\u09be-\u09c4\u09c7-\u09c8\u09cb-\u09cd\u09d7\u09e2-\u09e3\u09fe' ||
      '\u0a01-\u0a03\u0a3c\u0a3e-\u0a42\u0a47-\u0a48\u0a4b-\u0a4d\u0a51\u0a70-\u0a71\u0a75\u0a81-\u0a83' ||
      '\u0abc\u0abe-\u0ac5\u0ac7-\u0ac9\u0acb-\u0acd\u0ae2-\u0ae3\u0afa-\u0aff\u0b01-\u0b03\u0b3c' ||
      '\u0b3e-\u0b44\u0b47-\u0b48\u0b4b-\u0b4d\u0b55-\u0b57\u0b62-\u0b63\u0b82\u0bbe-\u0bc2' ||
      '\u0bc6-\u0bc8\u0bca-\u0bcd\u0bd7\u0c00-\u0c04\u0c3c\u0c3e-\u0c44\u0c46-\u0c48\u0c4a-\u0c4d' ||
      '\u0c55-\u0c56\u0c62-\u0c63\u0c81-\u0c83\u0cbc\u0cbe-\u0cc4\u0cc6-\u0cc8\u0cca-\u0ccd' ||
      '\u0cd5-\u0cd6\u0ce2-\u0ce3\u0cf3\u0d00-\u0d03\u0d3b-\u0d3c\u0d3e-\u0d44\u0d46-\u0d48' ||
      '\u0d4a-\u0d4d\u0d57\u0d62-\u0d63\u0d81-\u0d83\u0dca\u0dcf-\u0dd4\u0dd6\u0dd8-\u0ddf\u0df2-\u0df3' ||
      '\u0e31\u0e34-\u0e3a\u0e47-\u0e4e\u0eb1\u0eb4-\u0ebc\u0ec8-\u0ece\u0f18-\u0f19\u0f35\u0f37\u0f39' ||
      '\u0f3e-\u0f3f\u0f71-\u0f84\u0f86-\u0f87\u0f8d-\u0f97\u0f99-\u0fbc\u0fc6\u102b-\u103e' ||
      '\u1056-\u1059\u105e-\u1060\u1062-\u1064\u1067-\u106d\u1071-\u1074\u1082-\u108d\u108f' ||
      '\u109a-\u109d\u135d-\u135f\u1712-\u1715\u1732-\u1734\u1752-\u1753\u1772-\u1773\u17b4-\u17d3' ||
      '\u17dd\u180b-\u180d\u180f\u1885-\u1886\u18a9\u1920-\u192b\u1930-\u193b\u1a17-\u1a1b\u1a55-\u1a5e' ||
      '\u1a60-\u1a7c\u1a7f\u1ab0-\u1add\u1ae0-\u1aeb\u1b00-\u1b04\u1b34-\u1b44\u1b6b-\u1b73' ||
      '\u1b80-\u1b82\u1ba1-\u1bad\u1be6-\u1bf3\u1c24-\u1c37\u1cd0-\u1cd2\u1cd4-\u1ce8\u1ced\u1cf4' ||
      '\u1cf7-\u1cf9\u1dc0-\u1dff\u20d0-\u20f0\u2cef-\u2cf1\u2d7f\u2de0-\u2dff\u302a-\u302f' ||
      '\u3099-\u309a\ua66f-\ua672\ua674-\ua67d\ua69e-\ua69f\ua6f0-\ua6f1\ua802\ua806\ua80b\ua823-\ua827' ||
      '\ua82c\ua880-\ua881\ua8b4-\ua8c5\ua8e0-\ua8f1\ua8ff\ua926-\ua92d\ua947-\ua953\ua980-\ua983' ||
      '\ua9b3-\ua9c0\ua9e5\uaa29-\uaa36\uaa43\uaa4c-\uaa4d\uaa7b-\uaa7d\uaab0\uaab2-\uaab4\uaab7-\uaab8' ||
      '\uaabe-\uaabf\uaac1\uaaeb-\uaaef\uaaf5-\uaaf6\uabe3-\uabea\uabec-\uabed\ufb1e\ufe00-\ufe0f' ||
      '\ufe20-\ufe2f\U000101fd\U000102e0\U00010376-\U0001037a\U00010a01-\U00010a03\U00010a05-\U00010a06' ||
      '\U00010a0c-\U00010a0f\U00010a38-\U00010a3a\U00010a3f\U00010ae5-\U00010ae6\U00010d24-\U00010d27' ||
      '\U00010d69-\U00010d6d\U00010eab-\U00010eac\U00010efa-\U00010eff\U00010f46-\U00010f50' ||
      '\U00010f82-\U00010f85\U00011000-\U00011002\U00011038-\U00011046\U00011070\U00011073-\U00011074' ||
      '\U0001107f-\U00011082\U000110b0-\U000110ba\U000110c2\U00011100-\U00011102\U00011127-\U00011134' ||
      '\U00011145-\U00011146\U00011173\U00011180-\U00011182\U000111b3-\U000111c0\U000111c9-\U000111cc' ||
      '\U000111ce-\U000111cf\U0001122c-\U00011237\U0001123e\U00011241\U000112df-\U000112ea' ||
      '\U00011300-\U00011303\U0001133b-\U0001133c\U0001133e-\U00011344\U00011347-\U00011348' ||
      '\U0001134b-\U0001134d\U00011357\U00011362-\U00011363\U00011366-\U0001136c\U00011370-\U00011374' ||
      '\U000113b8-\U000113c0\U000113c2\U000113c5\U000113c7-\U000113ca\U000113cc-\U000113d0\U000113d2' ||
      '\U000113e1-\U000113e2\U00011435-\U00011446\U0001145e\U000114b0-\U000114c3\U000115af-\U000115b5' ||
      '\U000115b8-\U000115c0\U000115dc-\U000115dd\U00011630-\U00011640\U000116ab-\U000116b7' ||
      '\U0001171d-\U0001172b\U0001182c-\U0001183a\U00011930-\U00011935\U00011937-\U00011938' ||
      '\U0001193b-\U0001193e\U00011940\U00011942-\U00011943\U000119d1-\U000119d7\U000119da-\U000119e0' ||
      '\U000119e4\U00011a01-\U00011a0a\U00011a33-\U00011a39\U00011a3b-\U00011a3e\U00011a47' ||
      '\U00011a51-\U00011a5b\U00011a8a-\U00011a99\U00011b60-\U00011b67\U00011c2f-\U00011c36' ||
      '\U00011c38-\U00011c3f\U00011c92-\U00011ca7\U00011ca9-\U00011cb6\U00011d31-\U00011d36\U00011d3a' ||
      '\U00011d3c-\U00011d3d\U00011d3f-\U00011d45\U00011d47\U00011d8a-\U00011d8e\U00011d90-\U00011d91' ||
      '\U00011d93-\U00011d97\U00011ef3-\U00011ef6\U00011f00-\U00011f01\U00011f03\U00011f34-\U00011f3a' ||
      '\U00011f3e-\U00011f42\U00011f5a\U00013440\U00013447-\U00013455\U0001611e-\U0001612f' ||
      '\U00016af0-\U00016af4\U00016b30-\U00016b36\U00016f4f\U00016f51-\U00016f87\U00016f8f-\U00016f92' ||
      '\U00016fe4\U00016ff0-\U00016ff1\U0001bc9d-\U0001bc9e\U0001cf00-\U0001cf2d\U0001cf30-\U0001cf46' ||
      '\U0001d165-\U0001d169\U0001d16d-\U0001d172\U0001d17b-\U0001d182\U0001d185-\U0001d18b' ||
      '\U0001d1aa-\U0001d1ad\U0001d242-\U0001d244\U0001da00-\U0001da36\U0001da3b-\U0001da6c\U0001da75' ||
      '\U0001da84\U0001da9b-\U0001da9f\U0001daa1-\U0001daaf\U0001e000-\U0001e006\U0001e008-\U0001e018' ||
      '\U0001e01b-\U0001e021\U0001e023-\U0001e024\U0001e026-\U0001e02a\U0001e08f\U0001e130-\U0001e136' ||
      '\U0001e2ae\U0001e2ec-\U0001e2ef\U0001e4ec-\U0001e4ef\U0001e5ee-\U0001e5ef\U0001e6e3\U0001e6e6' ||
      '\U0001e6ee-\U0001e6ef\U0001e6f5\U0001e8d0-\U0001e8d6\U0001e944-\U0001e94a\U000e0100-\U000e01ef'
      -- name-trim-marks:end
  ),
  edges (trimmed) as (
    select regexp_replace(
      p_text,
      '^[' || classes.invisible || ']+|[' || classes.invisible || ']+$',
      '', 'g')
    from classes
  )
  select case
    when edges.trimmed is null then null
    -- A name needs one character that is neither invisible nor a combining
    -- mark: a mark alone has no letter to sit on.
    when edges.trimmed ~ ('[^' || classes.invisible || classes.marks || ']') then edges.trimmed
    else ''
  end
  from classes, edges;
$$;
revoke all on function private.name_trim(text) from public, anon;
grant execute on function private.name_trim(text) to authenticated;

-- The functions below are their current definitions with each person-name
-- check and write moved to private.name_trim; nothing else changes.

CREATE OR REPLACE FUNCTION public.submit_walk_in_signing(p_id uuid, p_first_name text, p_last_name text, p_version_id uuid, p_payload jsonb, p_signed_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  version public.authorization_versions;
begin
  if not (select public.has_permission('consents.collect')) then
    raise insufficient_privilege using message = 'collecting signatures needs consents.collect';
  end if;
  if exists (select 1 from public.walk_in_signings where id = p_id) then
    return p_id;
  end if;
  select * into version from public.authorization_versions v
   where v.id = p_version_id and v.org_id = actor_org and v.published_at is not null
     and v.season_id = private.current_season_id(actor_org);
  if version.id is null then
    raise check_violation using message = 'sign a version of the current season';
  end if;
  if nullif(private.name_trim(p_first_name), '') is null or nullif(private.name_trim(p_last_name), '') is null then
    raise check_violation using message = 'a walk-in needs her first and last name';
  end if;
  if p_signed_at is null or p_signed_at > now() + interval '10 minutes'
    or p_signed_at < now() - interval '60 days'
  then
    raise check_violation using message = 'the signing time is outside the allowed window';
  end if;
  perform private.validate_signing_payload(p_payload, version.content);

  insert into public.walk_in_signings
    (id, org_id, first_name, last_name, version_id, payload, signed_at, collected_by)
  values (p_id, actor_org, private.name_trim(p_first_name), private.name_trim(p_last_name), p_version_id,
          public.encrypt_field(p_payload::text), p_signed_at, actor)
  on conflict (id) do nothing;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'walk_in.submit', 'walk_in_signing', p_id, '{}'::jsonb);
  return p_id;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.create_entity_referral(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid;
  actor_org uuid;
  actor_role text;
  actor_entity uuid;
  first_name text := nullif(private.name_trim(p_payload ->> 'firstName'), '');
  last_name text := nullif(private.name_trim(p_payload ->> 'lastName'), '');
  phone text := nullif(btrim(p_payload ->> 'phone'), '');
  email text := nullif(lower(btrim(p_payload ->> 'email')), '');
  documentation text := p_payload ->> 'documentationStatus';
  referral_notes text := nullif(btrim(p_payload ->> 'notes'), '');
  -- The season registration answers (RAPP-303), in the profile's own keys so
  -- acceptance hands them to the profile unchanged. Empty answers are left out.
  answers jsonb := jsonb_strip_nulls(jsonb_build_object(
    'date_of_birth', nullif(btrim(p_payload ->> 'dateOfBirth'), ''),
    'nationality', nullif(btrim(p_payload ->> 'nationality'), ''),
    'document_type', nullif(btrim(p_payload ->> 'documentType'), ''),
    'document_number', nullif(upper(btrim(p_payload ->> 'documentNumber')), ''),
    'city', nullif(btrim(p_payload ->> 'city'), ''),
    'applicant_status', nullif(btrim(p_payload ->> 'applicantStatus'), ''),
    'applicant_status_details', nullif(btrim(p_payload ->> 'applicantStatusDetails'), ''),
    'supporting_entities', case
      when jsonb_typeof(p_payload -> 'supportingEntities') = 'array'
        and jsonb_array_length(p_payload -> 'supportingEntities') > 0
      then p_payload -> 'supportingEntities' end,
    'reference_contact_name', nullif(private.name_trim(p_payload ->> 'referenceContactName'), ''),
    'season_number', case when nullif(p_payload ->> 'seasonNumber', '') is not null
      then p_payload -> 'seasonNumber' end,
    'childcare_need', nullif(btrim(p_payload ->> 'childcareNeed'), ''),
    'specific_needs', nullif(btrim(p_payload ->> 'specificNeeds'), '')
  ));
  result uuid;
begin
  select
    assert_referral_actor.actor_id,
    assert_referral_actor.actor_org_id,
    assert_referral_actor.actor_role
  into actor, actor_org, actor_role
  from private.assert_referral_actor();
  actor_entity := public.current_collaborating_entity_id();

  if actor_role <> 'entity' then
    raise exception 'only entity contacts may submit referrals'
      using errcode = 'insufficient_privilege';
  end if;

  if p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
    or p_payload - array[
      'firstName', 'lastName', 'phone', 'email', 'documentationStatus', 'notes',
      'dateOfBirth', 'nationality', 'documentType', 'documentNumber', 'city',
      'applicantStatus', 'applicantStatusDetails', 'supportingEntities', 'referenceContactName', 'seasonNumber',
      'childcareNeed', 'specificNeeds', 'consentConfirmed'
    ] <> '{}'::jsonb
    or first_name is null
    or length(first_name) > 100
    or last_name is null
    or length(last_name) > 100
    or (phone is not null and length(phone) > 50)
    or (email is not null and (length(email) > 254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+$'))
    or documentation not in ('none', 'missing', 'in_progress', 'complete')
    or (referral_notes is not null and length(referral_notes) > 4000)
    -- She agreed that the entity shares her data with Ramassà (RAPP-303).
    or (p_payload -> 'consentConfirmed') is distinct from 'true'::jsonb
    or not private.referral_answers_valid(answers)
  then
    raise check_violation using message = 'invalid entity referral payload';
  end if;

  insert into public.entity_referrals (
    org_id,
    entity_user_id,
    collaborating_entity_id,
    referred_first_name,
    referred_last_name,
    referred_phone,
    referred_email,
    documentation_status,
    notes,
    intake_answers,
    consent_confirmed_at,
    consent_confirmed_by
  ) values (
    actor_org,
    actor,
    actor_entity,
    first_name,
    last_name,
    public.encrypt_field(phone),
    public.encrypt_field(email),
    documentation,
    public.encrypt_field(referral_notes),
    case when answers = '{}'::jsonb then null else public.encrypt_field(answers::text) end,
    now(),
    actor
  )
  returning id into result;

  return result;
end;
$function$

;

CREATE OR REPLACE FUNCTION private.validate_signing_payload(p_payload jsonb, p_content jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  consents jsonb := coalesce(p_payload -> 'consents', '{}'::jsonb);
  health text := nullif(btrim(p_payload ->> 'health_info'), '');
  drawing jsonb := p_payload -> 'signature';
  cannot_draw boolean := coalesce((p_payload ->> 'unable_to_draw')::boolean, false);
  shown_language text := nullif(p_payload ->> 'language', '');
  contact jsonb := case when jsonb_typeof(p_payload -> 'emergency_contact') = 'object'
    then p_payload -> 'emergency_contact' end;
  health_asked boolean := coalesce((p_content -> 'questions' -> 'health' ->> 'asked')::boolean, false);
  health_required boolean := coalesce((p_content -> 'questions' -> 'health' ->> 'required')::boolean, false);
  contact_asked boolean := coalesce((p_content -> 'questions' -> 'emergency_contact' ->> 'asked')::boolean, false);
  contact_required boolean := coalesce((p_content -> 'questions' -> 'emergency_contact' ->> 'required')::boolean, false);
begin
  if jsonb_typeof(consents) <> 'object'
    or exists (
      select 1 from private.authorization_consents(p_content) consent
       where consent.required and (consents -> consent.consent_key) is distinct from 'true'::jsonb
    )
    or exists (
      select 1 from jsonb_each(consents) given
       where not (p_content -> 'consents' ? given.key)
          or jsonb_typeof(given.value) <> 'boolean'
    )
  then
    raise check_violation using message = 'every required consent must be given';
  end if;
  if health_asked then
    if health is null and health_required then
      raise check_violation using message = 'the medical answer is required: "No" or a description';
    end if;
    if length(health) > 4000 then
      raise check_violation using message = 'the medical answer is too long';
    end if;
    -- Her health answer needs her explicit consent to its processing.
    if health is not null and p_content -> 'consents' ? 'health_data'
       and (consents -> 'health_data') is distinct from 'true'::jsonb then
      raise check_violation using message = 'the medical answer needs the health data consent';
    end if;
  end if;
  if drawing is not null and (jsonb_typeof(drawing) <> 'array' or jsonb_array_length(drawing) = 0) then
    drawing := null;
  end if;
  if drawing is not null and octet_length(drawing::text) > 200000 then
    raise check_violation using message = 'the signature is too large';
  end if;
  if (drawing is null) = (not cannot_draw) then
    raise check_violation using message = 'sign with a drawing, or record that she could not draw';
  end if;
  if shown_language is not null and shown_language not in ('ca', 'es', 'en', 'ar', 'fa') then
    raise check_violation using message = 'unsupported language';
  end if;
  if jsonb_typeof(p_payload -> 'emergency_contact') not in ('object', 'null') then
    raise check_violation using message = 'invalid emergency contact';
  end if;
  if contact_asked then
    if contact is not null and (
      length(coalesce(contact ->> 'name', '')) > 200
      or length(coalesce(contact ->> 'relation', '')) > 100
      or length(coalesce(contact ->> 'phone', '')) > 50
    ) then
      raise check_violation using message = 'invalid emergency contact';
    end if;
    if contact_required and (nullif(private.name_trim(contact ->> 'name'), '') is null
                             or nullif(btrim(contact ->> 'phone'), '') is null) then
      raise check_violation using message = 'the emergency contact needs a name and a phone';
    end if;
  end if;
end;
$function$

;

CREATE OR REPLACE FUNCTION private.record_signature(p_signature_id uuid, p_profile_id uuid, p_version_id uuid, p_payload jsonb, p_method text, p_witness uuid, p_signed_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.profiles;
  version public.authorization_versions;
  consents jsonb := coalesce(p_payload -> 'consents', '{}'::jsonb);
  contact jsonb := case when jsonb_typeof(p_payload -> 'emergency_contact') = 'object'
    then p_payload -> 'emergency_contact' end;
  drawing jsonb := case
    when jsonb_typeof(p_payload -> 'signature') = 'array'
     and jsonb_array_length(p_payload -> 'signature') > 0
    then p_payload -> 'signature' end;
  shown_language text := nullif(p_payload ->> 'language', '');
  health_asked boolean;
  contact_asked boolean;
  on_draft boolean;
begin
  if exists (select 1 from public.authorization_signatures where id = p_signature_id) then
    return p_signature_id;
  end if;

  select * into target from public.profiles where id = p_profile_id;
  -- "Is it a draft" is decided on the locked row (pending fix 29): FOR SHARE
  -- waits for a publish or a discard holding the row and then reads the row
  -- it committed, so a draft signature never lands on a published version.
  select * into version from public.authorization_versions where id = p_version_id for share;
  on_draft := version.id is not null and version.published_at is null;
  if on_draft then
    if not private.sees_onboarding_drafts(target.id) then
      raise check_violation using message = 'only a test player signs a draft';
    end if;
    version.season_id := private.current_season_id(target.org_id);
  end if;
  if target.id is null or version.id is null or version.org_id <> target.org_id
    or version.season_id is null
    or version.season_id is distinct from private.current_season_id(target.org_id)
  then
    raise check_violation using message = 'sign a version of the current season';
  end if;
  perform private.validate_signing_payload(p_payload, version.content);
  health_asked := (version.content -> 'questions' -> 'health' ->> 'asked')::boolean;
  contact_asked := (version.content -> 'questions' -> 'emergency_contact' ->> 'asked')::boolean;

  insert into public.authorization_signatures (
    id, org_id, profile_id, season_id, version_id, method, language, device,
    signed_at, signature, unable_to_draw, witnessed_by, is_test_fixture
  ) values (
    p_signature_id, target.org_id, target.id, version.season_id, version.id, p_method,
    shown_language,
    left(nullif(btrim(p_payload ->> 'device'), ''), 200),
    coalesce(p_signed_at, now()), drawing, drawing is null, p_witness, on_draft
  )
  on conflict (id) do nothing;

  -- Every consent of the version she signed, with the words she was shown.
  insert into public.authorization_consent_events
    (org_id, profile_id, signature_id, consent_key, granted, method, decided_at,
     version_id, language, wording, required)
  select target.org_id, target.id, p_signature_id, consent.consent_key,
         coalesce((consents ->> consent.consent_key)::boolean, false), p_method,
         coalesce(p_signed_at, now()), version.id, coalesce(shown_language, 'ca'),
         private.localized_text_in(consent.label, coalesce(shown_language, 'ca')), consent.required
    from private.authorization_consents(version.content) consent;

  perform set_config('ramassa.consent_event_written', 'on', true);
  update public.profiles set
    -- A question the version does not ask keeps what she said before.
    health_info = case when health_asked
      then public.encrypt_field(nullif(btrim(p_payload ->> 'health_info'), '')) else health_info end,
    emergency_contact_name = case when contact_asked and contact ? 'name'
      then nullif(private.name_trim(contact ->> 'name'), '') else emergency_contact_name end,
    emergency_contact_relation = case when contact_asked and contact ? 'relation'
      then nullif(btrim(contact ->> 'relation'), '') else emergency_contact_relation end,
    emergency_contact_phone = case when contact_asked and contact ? 'phone'
      then public.encrypt_field(nullif(btrim(contact ->> 'phone'), '')) else emergency_contact_phone end,
    -- Image rights drive the photo consent, when the version asks them.
    media_consent_at = case
      when not (version.content -> 'consents' ? 'image_rights') then media_consent_at
      when coalesce((consents ->> 'image_rights')::boolean, false)
        then coalesce(media_consent_at, now())
      else null
    end
  where id = target.id;
  perform set_config('ramassa.consent_event_written', '', true);

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (target.org_id, coalesce(p_witness, target.id), 'authorization.sign', 'authorization_signature',
          p_signature_id,
          jsonb_build_object('version_id', version.id, 'method', p_method,
                             'unable_to_draw', drawing is null, 'witnessed_by', p_witness,
                             'draft', on_draft));
  return p_signature_id;
end;
$function$

;

CREATE OR REPLACE FUNCTION private.apply_profile_prefill(p_profile_id uuid, p_payload jsonb, p_source text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.profiles;
begin
  if p_source not in ('staff', 'entity') then
    raise exception 'apply_profile_prefill takes staff or entity answers'
      using errcode = 'invalid_parameter_value';
  end if;

  if (p_payload ? 'first_name' and nullif(private.name_trim(p_payload ->> 'first_name'), '') is null)
    or (p_payload ? 'last_name' and nullif(private.name_trim(p_payload ->> 'last_name'), '') is null)
  then
    raise exception 'a name can be corrected but not removed'
      using errcode = 'not_null_violation';
  end if;

  if not private.season_answers_valid(p_payload) then
    raise invalid_parameter_value using message = 'a season answer is outside its choices';
  end if;

  update public.profiles p set
    first_name = case when p_payload ? 'first_name' then private.name_trim(p_payload ->> 'first_name') else p.first_name end,
    last_name = case when p_payload ? 'last_name' then private.name_trim(p_payload ->> 'last_name') else p.last_name end,
    date_of_birth = case when p_payload ? 'date_of_birth'
      then nullif(p_payload ->> 'date_of_birth', '')::date else p.date_of_birth end,
    place_of_birth = case when p_payload ? 'place_of_birth'
      then nullif(btrim(p_payload ->> 'place_of_birth'), '') else p.place_of_birth end,
    nationality = case when p_payload ? 'nationality'
      then nullif(btrim(p_payload ->> 'nationality'), '') else p.nationality end,
    preferred_language = coalesce(nullif(p_payload ->> 'preferred_language', ''), p.preferred_language),
    document_name = case when p_payload ? 'document_name' then nullif(btrim(p_payload ->> 'document_name'), '') else p.document_name end,
    document_type = case when p_payload ? 'document_type'
      then nullif(p_payload ->> 'document_type', '') else p.document_type end,
    document_number = case when p_payload ? 'document_number'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'document_number'), '')) else p.document_number end,
    phone = case when p_payload ? 'phone'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'phone'), '')) else p.phone end,
    address = case when p_payload ? 'address'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'address'), '')) else p.address end,
    city = case when p_payload ? 'city' then nullif(btrim(p_payload ->> 'city'), '') else p.city end,
    postal_code = case when p_payload ? 'postal_code'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'postal_code'), '')) else p.postal_code end,
    reference_entity = case when p_payload ? 'reference_entity'
      then nullif(btrim(p_payload ->> 'reference_entity'), '') else p.reference_entity end,
    reference_contact_name = case when p_payload ? 'reference_contact_name'
      then nullif(private.name_trim(p_payload ->> 'reference_contact_name'), '') else p.reference_contact_name end,
    has_dependents = case when nullif(p_payload ->> 'has_dependents', '') is not null
      then (p_payload ->> 'has_dependents')::boolean else p.has_dependents end,
    num_dependents = case when nullif(p_payload ->> 'num_dependents', '') is not null
      then (p_payload ->> 'num_dependents')::integer else p.num_dependents end,
    clothing_size = case when p_payload ? 'clothing_size'
      then nullif(p_payload ->> 'clothing_size', '') else p.clothing_size end,
    shoe_size = case when p_payload ? 'shoe_size'
      then nullif(p_payload ->> 'shoe_size', '') else p.shoe_size end,
    applicant_status = case when p_payload ? 'applicant_status'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'applicant_status'), '')) else p.applicant_status end,
    applicant_status_details = case when p_payload ? 'applicant_status_details'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'applicant_status_details'), '')) else p.applicant_status_details end,
    supporting_entities = case when p_payload ? 'supporting_entities'
      then private.text_array_answer(p_payload -> 'supporting_entities') else p.supporting_entities end,
    season_number = case when p_payload ? 'season_number'
      then nullif(p_payload ->> 'season_number', '')::smallint else p.season_number end,
    -- "This is her third year" means two seasons before this one (RAPP-306).
    prior_seasons = case when nullif(p_payload ->> 'season_number', '') is not null
      then greatest((p_payload ->> 'season_number')::smallint - 1, 0) else p.prior_seasons end,
    childcare_need = case when p_payload ? 'childcare_need'
      then nullif(p_payload ->> 'childcare_need', '') else p.childcare_need end,
    specific_needs = case when p_payload ? 'specific_needs'
      then public.encrypt_field(nullif(btrim(p_payload ->> 'specific_needs'), '')) else p.specific_needs end,
    updated_at = now()
  where p.id = p_profile_id
  returning * into target;

  if target.id is null then
    return;
  end if;

  if not target.has_dependents and target.num_dependents <> 0 then
    update public.profiles set num_dependents = 0 where id = p_profile_id;
    target.num_dependents := 0;
  end if;

  with question (name, touched, has_value) as (
    values
      ('first_name', p_payload ? 'first_name', target.first_name is not null),
      ('last_name', p_payload ? 'last_name', target.last_name is not null),
      ('date_of_birth', p_payload ? 'date_of_birth', target.date_of_birth is not null),
      ('place_of_birth', p_payload ? 'place_of_birth', target.place_of_birth is not null),
      ('nationality', p_payload ? 'nationality', target.nationality is not null),
      ('preferred_language', nullif(p_payload ->> 'preferred_language', '') is not null, true),
      ('document', p_payload ?| array['document_type', 'document_number', 'document_name'],
        target.document_type is not null
        and (target.document_type = 'none' or (target.document_type = 'other' and target.document_name is not null) or target.document_number is not null)),
      ('phone', p_payload ? 'phone', target.phone is not null),
      ('address', p_payload ? 'address', target.address is not null),
      ('city', p_payload ? 'city', target.city is not null),
      ('postal_code', p_payload ? 'postal_code', target.postal_code is not null),
      ('reference_entity', p_payload ? 'reference_entity', target.reference_entity is not null),
      ('reference_contact_name', p_payload ? 'reference_contact_name', target.reference_contact_name is not null),
      ('dependents', nullif(p_payload ->> 'has_dependents', '') is not null, true),
      ('clothing_size', p_payload ? 'clothing_size', target.clothing_size is not null),
      ('shoe_size', p_payload ? 'shoe_size', target.shoe_size is not null),
      ('applicant_status', p_payload ?| array['applicant_status', 'applicant_status_details'], target.applicant_status is not null),
      ('supporting_entities', p_payload ? 'supporting_entities', target.supporting_entities is not null),
      ('season_number', p_payload ? 'season_number', target.season_number is not null),
      ('childcare_need', p_payload ? 'childcare_need', target.childcare_need is not null),
      ('specific_needs', p_payload ? 'specific_needs', target.specific_needs is not null)
  ),
  cleared as (
    delete from public.profile_answers answer
     using question
     where answer.profile_id = p_profile_id
       and answer.question = question.name
       and question.touched
       and not question.has_value
  )
  insert into public.profile_answers (profile_id, org_id, question, source)
  select p_profile_id, target.org_id, question.name, p_source
    from question
   where question.touched and question.has_value
  on conflict (profile_id, question) do update
    set source = excluded.source, answered_at = now();
end;
$function$

;

CREATE OR REPLACE FUNCTION public.complete_onboarding(payload jsonb)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  stored public.profiles;
  saved public.profiles;
  terms_version_value text := nullif(payload ->> 'terms_version', '');
  locale_shown_value text := nullif(payload ->> 'locale_shown', '');
  -- Every value below is the merge: a question the wizard sent takes her
  -- answer, and a question it did not send keeps what is stored.
  first_name_value text;
  last_name_value text;
  date_of_birth_value date;
  place_of_birth_value text;
  nationality_value text;
  preferred_language_value text;
  document_type_value text;
  document_number_value text;
  document_name_value text;
  phone_value text;
  address_value text;
  city_value text;
  postal_code_value text;
  reference_entity_value text;
  reference_contact_name_value text;
  has_dependents_value boolean;
  num_dependents_value integer;
  clothing_size_value text;
  shoe_size_value text;
  avatar_url_value text;
  media_consent_at_value timestamptz;
  required_questions text[];
  missing text[];
begin
  if caller is null then
    raise exception 'complete_onboarding requires an authenticated caller'
      using errcode = 'insufficient_privilege';
  end if;

  if terms_version_value is null or locale_shown_value is null then
    raise exception 'complete_onboarding requires terms_version and locale_shown'
      using errcode = 'not_null_violation';
  end if;

  select * into stored from public.profiles where id = caller for update;
  if stored.id is not null and stored.role not in ('player', 'invited') then
    raise exception 'complete_onboarding is the participant path'
      using errcode = 'insufficient_privilege';
  end if;

  first_name_value := case when payload ? 'first_name'
    then nullif(private.name_trim(payload ->> 'first_name'), '') else stored.first_name end;
  last_name_value := case when payload ? 'last_name'
    then nullif(private.name_trim(payload ->> 'last_name'), '') else stored.last_name end;
  date_of_birth_value := case when payload ? 'date_of_birth'
    then nullif(payload ->> 'date_of_birth', '')::date else stored.date_of_birth end;
  place_of_birth_value := case when payload ? 'place_of_birth'
    then nullif(btrim(payload ->> 'place_of_birth'), '') else stored.place_of_birth end;
  nationality_value := case when payload ? 'nationality'
    then nullif(btrim(payload ->> 'nationality'), '') else stored.nationality end;
  preferred_language_value := coalesce(
    nullif(payload ->> 'preferred_language', ''), stored.preferred_language, 'ca');
  document_type_value := case when payload ? 'document_type'
    then nullif(payload ->> 'document_type', '') else stored.document_type end;
  document_name_value := case when document_type_value is distinct from 'other' then null
    when payload ? 'document_name' then nullif(btrim(payload ->> 'document_name'), '')
    when stored.document_type = 'other' then stored.document_name else null end;
  if payload ? 'document_type' and document_type_value = 'other' and document_name_value is null then
    raise not_null_violation using message = 'enter the name of the other document';
  end if;
  document_number_value := case when payload ? 'document_number'
    then nullif(btrim(payload ->> 'document_number'), '')
    else public.decrypt_field(stored.document_number) end;
  -- No type means no document was given (RAPP-302), so a number cannot stand
  -- alone either.
  if document_type_value is null or document_type_value = 'none' then
    document_number_value := null;
  end if;
  phone_value := case when payload ? 'phone'
    then nullif(btrim(payload ->> 'phone'), '') else public.decrypt_field(stored.phone) end;
  address_value := case when payload ? 'address'
    then nullif(btrim(payload ->> 'address'), '') else public.decrypt_field(stored.address) end;
  city_value := case when payload ? 'city'
    then nullif(btrim(payload ->> 'city'), '') else stored.city end;
  postal_code_value := case when payload ? 'postal_code'
    then nullif(btrim(payload ->> 'postal_code'), '') else public.decrypt_field(stored.postal_code) end;
  reference_entity_value := case when payload ? 'reference_entity'
    then nullif(btrim(payload ->> 'reference_entity'), '') else stored.reference_entity end;
  reference_contact_name_value := case when payload ? 'reference_contact_name'
    then nullif(private.name_trim(payload ->> 'reference_contact_name'), '') else stored.reference_contact_name end;
  -- Dependants can be optional (RAPP-611): an answer she did not give stays
  -- unknown (null), never "no". A stored value counts only when somebody
  -- answered it (RAPP-300); the column default is not an answer.
  has_dependents_value := case
    when payload ? 'has_dependents' then nullif(payload ->> 'has_dependents', '')::boolean
    -- A player who joined already gave it (it was required); for anyone else
    -- a stored value counts only when somebody answered it (RAPP-300).
    when stored.role = 'player' or exists (select 1 from public.profile_answers a
                  where a.profile_id = caller and a.question = 'dependents') then stored.has_dependents
    else null end;
  num_dependents_value := case when has_dependents_value
    then coalesce(nullif(payload ->> 'num_dependents', '')::integer, stored.num_dependents, 0)
    else 0 end;
  clothing_size_value := case when payload ? 'clothing_size'
    then nullif(payload ->> 'clothing_size', '') else stored.clothing_size end;
  shoe_size_value := case when payload ? 'shoe_size'
    then nullif(payload ->> 'shoe_size', '') else stored.shoe_size end;
  avatar_url_value := case when payload ? 'avatar_url'
    then nullif(payload ->> 'avatar_url', '') else stored.avatar_url end;
  media_consent_at_value := case
    when nullif(payload ->> 'media_consent', '') is null then stored.media_consent_at
    when (payload ->> 'media_consent')::boolean then coalesce(stored.media_consent_at, now())
    else null
  end;

  if not private.season_answers_valid(payload) then
    raise invalid_parameter_value using message = 'a season answer is outside its choices';
  end if;

  if first_name_value is null or last_name_value is null then
    raise exception 'complete_onboarding requires first_name and last_name'
      using errcode = 'not_null_violation';
  end if;


  -- The document is optional (RAPP-302): she may skip it. Once she chooses a
  -- type, a number is required unless the answer is "none", which is a
  -- first-class answer: many participants genuinely have no document, and
  -- onboarding must never dead-end on it.
  if document_type_value in ('nie', 'passport')
    and document_number_value is null
  then
    raise exception 'complete_onboarding requires document_number for a chosen document_type'
      using errcode = 'not_null_violation';
  end if;

  if stored.id is null then
    insert into public.profiles (
      id, org_id, role,
      first_name, last_name, date_of_birth, place_of_birth, nationality, preferred_language,
      document_type, document_number, document_name,
      phone, address, city, postal_code,
      reference_entity, reference_contact_name,
      has_dependents, num_dependents, clothing_size, shoe_size, avatar_url,
      terms_accepted_at, media_consent_at
    )
    values (
      caller, (select public.default_organization_id()), 'player',
      first_name_value, last_name_value, date_of_birth_value, place_of_birth_value,
      nationality_value, preferred_language_value,
      document_type_value, public.encrypt_field(document_number_value), document_name_value,
      public.encrypt_field(phone_value), public.encrypt_field(address_value), city_value,
      public.encrypt_field(postal_code_value),
      reference_entity_value, reference_contact_name_value,
      has_dependents_value, num_dependents_value, clothing_size_value, shoe_size_value,
      avatar_url_value, now(), media_consent_at_value
    )
    returning * into saved;
  else
    -- Role and org are not the wizard's to change, except that joining makes
    -- an invited woman a player (RAPP-300).
    update public.profiles set
      role = 'player',
      first_name = first_name_value,
      last_name = last_name_value,
      date_of_birth = date_of_birth_value,
      place_of_birth = place_of_birth_value,
      nationality = nationality_value,
      preferred_language = preferred_language_value,
      document_type = document_type_value,
      document_name = document_name_value,
      document_number = public.encrypt_field(document_number_value),
      phone = public.encrypt_field(phone_value),
      address = public.encrypt_field(address_value),
      city = city_value,
      postal_code = public.encrypt_field(postal_code_value),
      reference_entity = reference_entity_value,
      reference_contact_name = reference_contact_name_value,
      has_dependents = has_dependents_value,
      num_dependents = num_dependents_value,
      clothing_size = clothing_size_value,
      shoe_size = shoe_size_value,
      avatar_url = avatar_url_value,
      terms_accepted_at = now(),
      media_consent_at = media_consent_at_value,
      updated_at = now()
    where id = caller
    returning * into saved;
  end if;

  -- The registration questions (RAPP-306): optional wizard questions. A key
  -- left out keeps its value; the trigger keeps the season's copy.
  if payload ?| array['applicant_status_details', 'applicant_status', 'supporting_entities', 'childcare_need', 'specific_needs'] then
    update public.profiles p set
      applicant_status = case when payload ? 'applicant_status'
        then public.encrypt_field(nullif(btrim(payload ->> 'applicant_status'), '')) else p.applicant_status end,
    applicant_status_details = case when payload ? 'applicant_status_details'
      then public.encrypt_field(nullif(btrim(payload ->> 'applicant_status_details'), '')) else p.applicant_status_details end,
      supporting_entities = case when payload ? 'supporting_entities'
        then private.text_array_answer(payload -> 'supporting_entities') else p.supporting_entities end,
      childcare_need = case when payload ? 'childcare_need'
        then nullif(payload ->> 'childcare_need', '') else p.childcare_need end,
      specific_needs = case when payload ? 'specific_needs'
        then public.encrypt_field(nullif(btrim(payload ->> 'specific_needs'), '')) else p.specific_needs end
    where p.id = caller
    returning * into saved;
  end if;

  -- Every question staff made required (RAPP-611), read from the one list,
  -- has an answer once the wizard's answers are merged with what is stored.
  -- Her name and her app language are always required, and checked above.
  required_questions := private.required_intake_questions(saved.org_id);
  select array_agg(r.question order by r.position) into missing
    from unnest(required_questions) with ordinality as r(question, position)
   where not case r.question
     when 'first_name' then first_name_value is not null
     when 'last_name' then last_name_value is not null
     when 'preferred_language' then true
     when 'date_of_birth' then date_of_birth_value is not null
     when 'place_of_birth' then place_of_birth_value is not null
     when 'nationality' then nationality_value is not null
     when 'document' then document_type_value is not null
     when 'phone' then phone_value is not null
     when 'address' then address_value is not null
     when 'city' then city_value is not null
     when 'postal_code' then postal_code_value is not null
     -- "None" is an answer: the key sent, even empty, or an entity stored.
     when 'reference_entity' then payload ? 'reference_entity' or reference_entity_value is not null
     -- Her contact there is asked only once she names an entity.
     when 'reference_contact_name' then reference_entity_value is null or reference_contact_name_value is not null
     when 'dependents' then has_dependents_value is not null
     when 'clothing_size' then clothing_size_value is not null
     when 'shoe_size' then shoe_size_value is not null
     when 'applicant_status' then saved.applicant_status is not null
     when 'supporting_entities' then coalesce(cardinality(saved.supporting_entities), 0) > 0
     when 'childcare_need' then saved.childcare_need is not null
     when 'specific_needs' then saved.specific_needs is not null
     else true end;
  if missing is not null then
    raise exception 'complete_onboarding requires %', array_to_string(missing, ', ')
      using errcode = 'not_null_violation';
  end if;

  -- Her own answers: a question she sent with a value becomes hers when it was
  -- unanswered or she changed it; one she confirmed unchanged keeps the staff
  -- or entity record; one she cleared is no longer answered.
  with question (name, touched, has_value, changed) as (
    values
      ('first_name', payload ? 'first_name', first_name_value is not null,
        first_name_value is distinct from stored.first_name),
      ('last_name', payload ? 'last_name', last_name_value is not null,
        last_name_value is distinct from stored.last_name),
      ('date_of_birth', payload ? 'date_of_birth', date_of_birth_value is not null,
        date_of_birth_value is distinct from stored.date_of_birth),
      ('place_of_birth', payload ? 'place_of_birth', place_of_birth_value is not null,
        place_of_birth_value is distinct from stored.place_of_birth),
      ('nationality', payload ? 'nationality', nationality_value is not null,
        nationality_value is distinct from stored.nationality),
      ('preferred_language', nullif(payload ->> 'preferred_language', '') is not null, true,
        preferred_language_value is distinct from stored.preferred_language),
      ('document', payload ?| array['document_type', 'document_number', 'document_name'], true,
        document_name_value is distinct from stored.document_name
        or document_type_value is distinct from stored.document_type
        or document_number_value is distinct from public.decrypt_field(stored.document_number)),
      ('phone', payload ? 'phone', phone_value is not null,
        phone_value is distinct from public.decrypt_field(stored.phone)),
      ('address', payload ? 'address', address_value is not null,
        address_value is distinct from public.decrypt_field(stored.address)),
      ('city', payload ? 'city', city_value is not null, city_value is distinct from stored.city),
      ('postal_code', payload ? 'postal_code', postal_code_value is not null,
        postal_code_value is distinct from public.decrypt_field(stored.postal_code)),
      ('reference_entity', payload ? 'reference_entity', reference_entity_value is not null,
        reference_entity_value is distinct from stored.reference_entity),
      ('reference_contact_name', payload ? 'reference_contact_name', reference_contact_name_value is not null,
        reference_contact_name_value is distinct from stored.reference_contact_name),
      ('dependents', payload ? 'has_dependents', has_dependents_value is not null,
        has_dependents_value is distinct from stored.has_dependents
        or num_dependents_value is distinct from stored.num_dependents),
      ('clothing_size', payload ? 'clothing_size', clothing_size_value is not null,
        clothing_size_value is distinct from stored.clothing_size),
      ('shoe_size', payload ? 'shoe_size', shoe_size_value is not null,
        shoe_size_value is distinct from stored.shoe_size),
      ('avatar', payload ? 'avatar_url', avatar_url_value is not null,
        avatar_url_value is distinct from stored.avatar_url),
      ('applicant_status', payload ?| array['applicant_status', 'applicant_status_details'], saved.applicant_status is not null,
        public.decrypt_field(saved.applicant_status) is distinct from public.decrypt_field(stored.applicant_status)
        or public.decrypt_field(saved.applicant_status_details) is distinct from public.decrypt_field(stored.applicant_status_details)),
      ('supporting_entities', payload ? 'supporting_entities', saved.supporting_entities is not null,
        saved.supporting_entities is distinct from stored.supporting_entities),
      ('childcare_need', payload ? 'childcare_need', saved.childcare_need is not null,
        saved.childcare_need is distinct from stored.childcare_need),
      ('specific_needs', payload ? 'specific_needs', saved.specific_needs is not null,
        public.decrypt_field(saved.specific_needs) is distinct from public.decrypt_field(stored.specific_needs))
  ),
  cleared as (
    delete from public.profile_answers answer
     using question
     where answer.profile_id = caller
       and answer.question = question.name
       and question.touched
       and not question.has_value
  )
  insert into public.profile_answers (profile_id, org_id, question, source)
  select caller, saved.org_id, question.name, 'player'
    from question
   where question.touched
     and question.has_value
     and (
       question.changed
       or not exists (
         select 1 from public.profile_answers existing
          where existing.profile_id = caller and existing.question = question.name
       )
     )
  on conflict (profile_id, question) do update
    set source = 'player', answered_at = now();

  insert into public.terms_acceptances (profile_id, terms_version, locale_shown)
  values (caller, terms_version_value, locale_shown_value);

  return saved;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.update_own_profile(payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  document_type_value text := nullif(payload ->> 'document_type', '');
  document_number_value text := nullif(payload ->> 'document_number', '');
  place_of_birth_value text := nullif(trim(payload ->> 'place_of_birth'), '');
begin
  -- Her first name, last name and app language are always required (RAPP-611
  -- locks them; pending fix 22): a name sent is never empty.
  if (payload ? 'first_name' and nullif(private.name_trim(payload ->> 'first_name'), '') is null)
     or (payload ? 'last_name' and nullif(private.name_trim(payload ->> 'last_name'), '') is null) then
    raise check_violation using message = 'her first name, last name and app language are always required';
  end if;
  if caller is null then
    raise exception 'update_own_profile requires an authenticated caller'
      using errcode = 'insufficient_privilege';
  end if;

  -- Editing is never stricter than intake: her place of birth is required
  -- only when staff keep it required, and her registration checks that
  -- (RAPP-611). An edit checks every value it is given.

  -- Same rule the wizard follows. Editing must not be stricter than intake, or
  -- a participant who has no papers cannot save. The document is optional
  -- (RAPP-302), and a number cannot stand without a type.
  if document_type_value is null or document_type_value = 'none' then
    document_number_value := null;
  elsif document_type_value in ('nie', 'passport') and document_number_value is null then
    raise exception 'update_own_profile requires document_number for a chosen document_type'
      using errcode = 'not_null_violation';
  end if;

  -- The column list IS the authorization boundary. `role`, `org_id`,
  -- `terms_accepted_at`, `is_active` and `is_forum_banned` are absent on
  -- purpose: they are not the participant's to change, and a payload that
  -- carries them (a client echoing the whole profile back, or an attacker
  -- trying it on) simply has those keys ignored.
  if not private.season_answers_valid(payload) then
    raise invalid_parameter_value using message = 'a season answer is outside its choices';
  end if;

  perform set_config('ramassa.trusted_profile_write', 'on', true);
  update public.profiles set
    first_name = private.name_trim(payload ->> 'first_name'),
    last_name = private.name_trim(payload ->> 'last_name'),
    date_of_birth = (payload ->> 'date_of_birth')::date,
    place_of_birth = place_of_birth_value,
    nationality = payload ->> 'nationality',
    preferred_language = coalesce(nullif(payload ->> 'preferred_language', ''), preferred_language),
    document_type = document_type_value,
    document_name = case when payload ? 'document_name' then nullif(btrim(payload ->> 'document_name'), '') else document_name end,
    document_number = public.encrypt_field(document_number_value),
    phone = public.encrypt_field(nullif(payload ->> 'phone', '')),
    address = public.encrypt_field(nullif(payload ->> 'address', '')),
    city = nullif(payload ->> 'city', ''),
    postal_code = public.encrypt_field(nullif(payload ->> 'postal_code', '')),
    reference_entity = nullif(payload ->> 'reference_entity', ''),
    reference_contact_name = nullif(private.name_trim(payload ->> 'reference_contact_name'), ''),
    -- No answer stays unknown, never "no" (RAPP-611).
    has_dependents = nullif(payload ->> 'has_dependents', '')::boolean,
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
    -- The season registration answers (RAPP-303): a key left out keeps its
    -- value, so an older build never wipes them.
    applicant_status = case when payload ? 'applicant_status'
      then public.encrypt_field(nullif(btrim(payload ->> 'applicant_status'), '')) else applicant_status end,
    applicant_status_details = case when payload ? 'applicant_status_details'
      then public.encrypt_field(nullif(btrim(payload ->> 'applicant_status_details'), '')) else applicant_status_details end,
    supporting_entities = case when payload ? 'supporting_entities'
      then private.text_array_answer(payload -> 'supporting_entities') else supporting_entities end,
    season_number = case when payload ? 'season_number'
      then nullif(payload ->> 'season_number', '')::smallint else season_number end,
    childcare_need = case when payload ? 'childcare_need'
      then nullif(payload ->> 'childcare_need', '') else childcare_need end,
    specific_needs = case when payload ? 'specific_needs'
      then public.encrypt_field(nullif(btrim(payload ->> 'specific_needs'), '')) else specific_needs end,
    updated_at = now()
  where id = caller;
  perform set_config('ramassa.trusted_profile_write', '', true);
end;
$function$

;

CREATE OR REPLACE FUNCTION public.update_participant_profile(participant_id uuid, payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  document_type_value text := nullif(payload ->> 'document_type', '');
  document_number_value text := nullif(payload ->> 'document_number', '');
  place_of_birth_value text := nullif(btrim(payload ->> 'place_of_birth'), '');
  -- The columns whose VALUES must never reach the audit log (ADR-004).
  encrypted_fields text[] := array[
    'document_number', 'phone', 'address', 'postal_code', 'applicant_status', 'applicant_status_details', 'specific_needs'];
  before_document jsonb;
  changes_document jsonb;
begin
  if not (select private.participant_permission(participant_id, 'participants.view_personal')) then
    raise exception 'update_participant_profile is the staff path; a participant edits herself through update_own_profile()'
      using errcode = 'insufficient_privilege';
  end if;

  -- Her first name, last name and app language are always required (RAPP-611
  -- locks them; pending fix 22): a name sent is never empty.
  if (payload ? 'first_name' and nullif(private.name_trim(payload ->> 'first_name'), '') is null)
     or (payload ? 'last_name' and nullif(private.name_trim(payload ->> 'last_name'), '') is null) then
    raise check_violation using message = 'her first name, last name and app language are always required';
  end if;

  -- A woman who has not joined yet is completed in parts: only the fields
  -- sent change, each one becomes an answer, and her consent stays hers
  -- (RAPP-300). Sensitive fields need their own permission, as below.
  if exists (
    select 1 from public.profiles p
     where p.id = participant_id
       and p.org_id = (select public.current_org_id())
       and p.role = 'invited'
  ) then
    if not (select private.participant_permission(participant_id, 'participants.view_sensitive')) then
      payload := payload - 'document_number' - 'phone' - 'address' - 'postal_code'
        - 'applicant_status' - 'applicant_status_details' - 'specific_needs';
    end if;
    perform private.apply_profile_prefill(participant_id, payload, 'staff');
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
    values (
      (select public.current_org_id()), actor, 'profile.update', 'profile', participant_id,
      jsonb_build_object('fields', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb)
                                      from jsonb_object_keys(payload) k))
    );
    return;
  end if;

  -- Staff correct her record as she does: a place of birth left empty is
  -- unknown (RAPP-611); the organization's required list binds registration.

  -- A caller without participants.view_sensitive never sends the document
  -- number; for her the check runs below, on the stored value.
  -- The document is optional (RAPP-302): only a chosen type needs a number.
  if document_type_value in ('nie', 'passport')
    and document_number_value is null
    and (select private.participant_permission(participant_id, 'participants.view_sensitive'))
  then
    raise exception 'update_participant_profile requires document_number for a chosen document_type'
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
    'document_name', p.document_name,
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
    'media_consent', p.media_consent_at is not null,
    'applicant_status', public.decrypt_field(p.applicant_status),
    'applicant_status_details', public.decrypt_field(p.applicant_status_details),
    'supporting_entities', p.supporting_entities,
    'season_number', p.season_number,
    'childcare_need', p.childcare_need,
    'specific_needs', public.decrypt_field(p.specific_needs)
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
  if not private.season_answers_valid(payload) then
    raise invalid_parameter_value using message = 'a season answer is outside its choices';
  end if;

  if not (select private.participant_permission(participant_id, 'participants.view_sensitive')) then
    payload := payload - 'applicant_status' - 'applicant_status_details' - 'specific_needs';
    payload := payload || jsonb_build_object(
      'document_number', before_document ->> 'document_number',
      'phone', before_document ->> 'phone',
      'address', before_document ->> 'address',
      'postal_code', before_document ->> 'postal_code'
    );
    document_number_value := nullif(payload ->> 'document_number', '');
    if document_type_value in ('nie', 'passport')
      and document_number_value is null
    then
      raise exception 'update_participant_profile requires document_number for a chosen document_type'
        using errcode = 'not_null_violation';
    end if;
  end if;

  -- No type, or "none", means no number: a stored number goes with the type.
  if document_type_value is null or document_type_value = 'none' then
    document_number_value := null;
    payload := payload || jsonb_build_object('document_number', null);
  end if;

  perform set_config('ramassa.trusted_profile_write', 'on', true);
  update public.profiles set
    first_name = private.name_trim(payload ->> 'first_name'),
    last_name = private.name_trim(payload ->> 'last_name'),
    date_of_birth = (payload ->> 'date_of_birth')::date,
    place_of_birth = place_of_birth_value,
    nationality = payload ->> 'nationality',
    preferred_language = coalesce(nullif(payload ->> 'preferred_language', ''), preferred_language),
    document_type = document_type_value,
    document_name = case when payload ? 'document_name' then nullif(btrim(payload ->> 'document_name'), '') else document_name end,
    document_number = public.encrypt_field(document_number_value),
    phone = public.encrypt_field(nullif(payload ->> 'phone', '')),
    address = public.encrypt_field(nullif(payload ->> 'address', '')),
    city = nullif(payload ->> 'city', ''),
    postal_code = public.encrypt_field(nullif(payload ->> 'postal_code', '')),
    reference_entity = nullif(payload ->> 'reference_entity', ''),
    reference_contact_name = nullif(private.name_trim(payload ->> 'reference_contact_name'), ''),
    has_dependents = nullif(payload ->> 'has_dependents', '')::boolean,
    num_dependents = coalesce((payload ->> 'num_dependents')::integer, 0),
    clothing_size = nullif(payload ->> 'clothing_size', ''),
    shoe_size = nullif(payload ->> 'shoe_size', ''),
    media_consent_at = case
      when (payload ->> 'media_consent')::boolean then coalesce(media_consent_at, now())
      else null
    end,
    applicant_status = case when payload ? 'applicant_status'
      then public.encrypt_field(nullif(btrim(payload ->> 'applicant_status'), '')) else applicant_status end,
    applicant_status_details = case when payload ? 'applicant_status_details'
      then public.encrypt_field(nullif(btrim(payload ->> 'applicant_status_details'), '')) else applicant_status_details end,
    supporting_entities = case when payload ? 'supporting_entities'
      then private.text_array_answer(payload -> 'supporting_entities') else supporting_entities end,
    season_number = case when payload ? 'season_number'
      then nullif(payload ->> 'season_number', '')::smallint else season_number end,
    childcare_need = case when payload ? 'childcare_need'
      then nullif(payload ->> 'childcare_need', '') else childcare_need end,
    specific_needs = case when payload ? 'specific_needs'
      then public.encrypt_field(nullif(btrim(payload ->> 'specific_needs'), '')) else specific_needs end,
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
$function$

;
