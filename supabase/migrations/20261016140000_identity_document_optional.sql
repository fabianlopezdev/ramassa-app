-- The identity document is optional (RAPP-302).
--
-- Referring entities often hold back a woman's documents to protect her, and
-- Ramassà needs the document only in some cases (to enrol her in a course, for
-- example). So the document step can be skipped:
--   - an empty type is a valid answer in the wizard, in her own profile edit and
--     in the staff edit; a number cannot stand without a type;
--   - once a type is chosen, the old rule holds: a type other than "none" needs
--     a number;
--   - a skipped wizard step is recorded as asked (RAPP-300 profile_answers), so
--     "asked and skipped" stays different from "never asked".
-- No new document type is added, so phones on older builds keep reading
-- profiles without errors.
--
-- Staff also write an optional explanation that the document step shows under
-- its intro (why Ramassà asks, what it is used for). It is multilingual like
-- other staff content: Catalan required, the other languages optional and
-- falling back to Catalan. Written with settings.organization and audited.

alter table public.organizations
  add column document_step_explanation jsonb
    constraint organizations_document_step_explanation_shape check (
      document_step_explanation is null
      or (
        jsonb_typeof(document_step_explanation) = 'object'
        and length(btrim(coalesce(document_step_explanation ->> 'ca', ''))) > 0
        and document_step_explanation - array['ca', 'es', 'en', 'ar', 'fa'] = '{}'::jsonb
      )
    );

comment on column public.organizations.document_step_explanation is
  'Optional staff-written text shown under the wizard''s document step intro (RAPP-302). {ca, es?, en?, ar?, fa?}; Catalan is the fallback.';

create or replace function public.set_document_step_explanation(p_explanation jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
  cleaned jsonb;
begin
  if not (select public.has_permission('settings.organization')) then
    raise insufficient_privilege
      using message = 'the document step explanation needs settings.organization';
  end if;

  if p_explanation is not null and jsonb_typeof(p_explanation) <> 'object' then
    raise check_violation using message = 'the explanation is an object of languages';
  end if;
  if p_explanation is not null
    and p_explanation - array['ca', 'es', 'en', 'ar', 'fa'] <> '{}'::jsonb
  then
    raise check_violation using message = 'the explanation has an unsupported language';
  end if;

  -- Empty languages are dropped, so they fall back to Catalan when shown.
  select jsonb_object_agg(entry.key, btrim(entry.value))
    into cleaned
    from jsonb_each_text(coalesce(p_explanation, '{}'::jsonb)) as entry
   where btrim(entry.value) <> '';

  if cleaned is not null and cleaned ->> 'ca' is null then
    raise check_violation using message = 'the explanation needs a Catalan text';
  end if;
  if exists (
    select 1 from jsonb_each_text(coalesce(cleaned, '{}'::jsonb)) as entry
     where length(entry.value) > 1000
  ) then
    raise check_violation using message = 'each explanation is at most 1000 characters';
  end if;

  update public.organizations
     set document_step_explanation = cleaned
   where id = actor_org;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org,
    (select auth.uid()),
    'organization.document_explanation_update',
    'organization',
    actor_org,
    jsonb_build_object(
      'languages', coalesce((select jsonb_agg(key order by key) from jsonb_object_keys(cleaned) key), '[]'::jsonb)
    )
  );

  return cleaned;
end;
$$;

-- Read by the wizard, so it must work for a woman who has not joined yet and
-- for a self-started intake with no profile at all, which belongs to the
-- default organization (as in complete_onboarding).
create or replace function public.get_document_step_explanation()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select organization.document_step_explanation
    from public.organizations as organization
   where (select auth.uid()) is not null
     and organization.id = coalesce(
       (select profile.org_id from public.profiles as profile where profile.id = (select auth.uid())),
       (select public.default_organization_id())
     );
$$;


create or replace function public.complete_onboarding(payload jsonb)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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
    then nullif(btrim(payload ->> 'first_name'), '') else stored.first_name end;
  last_name_value := case when payload ? 'last_name'
    then nullif(btrim(payload ->> 'last_name'), '') else stored.last_name end;
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
    then nullif(btrim(payload ->> 'reference_contact_name'), '') else stored.reference_contact_name end;
  has_dependents_value := coalesce(
    nullif(payload ->> 'has_dependents', '')::boolean, stored.has_dependents, false);
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

  if first_name_value is null or last_name_value is null then
    raise exception 'complete_onboarding requires first_name and last_name'
      using errcode = 'not_null_violation';
  end if;

  if place_of_birth_value is null then
    raise exception 'complete_onboarding requires place_of_birth'
      using errcode = 'not_null_violation';
  end if;

  -- The document is optional (RAPP-302): she may skip it. Once she chooses a
  -- type, a number is required unless the answer is "none", which is a
  -- first-class answer: many participants genuinely have no document, and
  -- onboarding must never dead-end on it.
  if document_type_value is not null and document_type_value <> 'none'
    and document_number_value is null
  then
    raise exception 'complete_onboarding requires document_number for a chosen document_type'
      using errcode = 'not_null_violation';
  end if;

  if stored.id is null then
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
      caller, (select public.default_organization_id()), 'player',
      first_name_value, last_name_value, date_of_birth_value, place_of_birth_value,
      nationality_value, preferred_language_value,
      document_type_value, public.encrypt_field(document_number_value),
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
      ('document', payload ?| array['document_type', 'document_number'], true,
        document_type_value is distinct from stored.document_type
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
      ('dependents', nullif(payload ->> 'has_dependents', '') is not null, true,
        has_dependents_value is distinct from stored.has_dependents
        or num_dependents_value is distinct from stored.num_dependents),
      ('clothing_size', payload ? 'clothing_size', clothing_size_value is not null,
        clothing_size_value is distinct from stored.clothing_size),
      ('shoe_size', payload ? 'shoe_size', shoe_size_value is not null,
        shoe_size_value is distinct from stored.shoe_size),
      ('avatar', payload ? 'avatar_url', avatar_url_value is not null,
        avatar_url_value is distinct from stored.avatar_url)
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
$$;

create or replace function public.update_own_profile(payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  caller uuid := (select auth.uid());
  document_type_value text := nullif(payload ->> 'document_type', '');
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

  -- Same rule the wizard follows. Editing must not be stricter than intake, or
  -- a participant who has no papers cannot save. The document is optional
  -- (RAPP-302), and a number cannot stand without a type.
  if document_type_value is null or document_type_value = 'none' then
    document_number_value := null;
  elsif document_number_value is null then
    raise exception 'update_own_profile requires document_number for a chosen document_type'
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
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  document_type_value text := nullif(payload ->> 'document_type', '');
  document_number_value text := nullif(payload ->> 'document_number', '');
  place_of_birth_value text := nullif(btrim(payload ->> 'place_of_birth'), '');
  -- The columns whose VALUES must never reach the audit log (ADR-004).
  encrypted_fields text[] := array['document_number', 'phone', 'address', 'postal_code'];
  before_document jsonb;
  changes_document jsonb;
begin
  if not (select public.has_permission('participants.view_personal')) then
    raise exception 'update_participant_profile is the staff path; a participant edits herself through update_own_profile()'
      using errcode = 'insufficient_privilege';
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
    if not (select public.has_permission('participants.view_sensitive')) then
      payload := payload - 'document_number' - 'phone' - 'address' - 'postal_code';
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

  if place_of_birth_value is null then
    raise exception 'update_participant_profile requires place_of_birth'
      using errcode = 'not_null_violation';
  end if;

  -- A caller without participants.view_sensitive never sends the document
  -- number; for her the check runs below, on the stored value.
  -- The document is optional (RAPP-302): only a chosen type needs a number.
  if document_type_value is not null and document_type_value <> 'none'
    and document_number_value is null
    and (select public.has_permission('participants.view_sensitive'))
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
  if not (select public.has_permission('participants.view_sensitive')) then
    payload := payload || jsonb_build_object(
      'document_number', before_document ->> 'document_number',
      'phone', before_document ->> 'phone',
      'address', before_document ->> 'address',
      'postal_code', before_document ->> 'postal_code'
    );
    document_number_value := nullif(payload ->> 'document_number', '');
    if document_type_value is not null and document_type_value <> 'none'
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
$$;

revoke all on function public.set_document_step_explanation(jsonb) from public, anon;
revoke all on function public.get_document_step_explanation() from public, anon;
grant execute on function public.set_document_step_explanation(jsonb) to authenticated;
grant execute on function public.get_document_step_explanation() to authenticated;
