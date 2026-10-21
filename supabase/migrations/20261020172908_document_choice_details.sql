-- RAPP-560: name the Other document independently of its optional number.
-- document_name describes the type, follows personal-data access and is erased with it.
alter table public.profiles add column document_name text
  check (document_name is null or (length(btrim(document_name)) between 1 and 100 and document_type = 'other'));

create function private.normalize_document_name() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.document_type is distinct from 'other' then new.document_name := null;
  else new.document_name := nullif(btrim(new.document_name), ''); end if;
  return new;
end;
$$;
revoke all on function private.normalize_document_name() from public, anon, authenticated;
create trigger normalize_document_name before insert or update on public.profiles
for each row execute function private.normalize_document_name();

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

  if not private.season_answers_valid(payload) then
    raise invalid_parameter_value using message = 'a season answer is outside its choices';
  end if;

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
  if payload ?| array['applicant_status', 'supporting_entities', 'childcare_need', 'specific_needs'] then
    update public.profiles p set
      applicant_status = case when payload ? 'applicant_status'
        then public.encrypt_field(nullif(btrim(payload ->> 'applicant_status'), '')) else p.applicant_status end,
      supporting_entities = case when payload ? 'supporting_entities'
        then private.text_array_answer(payload -> 'supporting_entities') else p.supporting_entities end,
      childcare_need = case when payload ? 'childcare_need'
        then nullif(payload ->> 'childcare_need', '') else p.childcare_need end,
      specific_needs = case when payload ? 'specific_needs'
        then public.encrypt_field(nullif(btrim(payload ->> 'specific_needs'), '')) else p.specific_needs end
    where p.id = caller
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
      ('dependents', nullif(payload ->> 'has_dependents', '') is not null, true,
        has_dependents_value is distinct from stored.has_dependents
        or num_dependents_value is distinct from stored.num_dependents),
      ('clothing_size', payload ? 'clothing_size', clothing_size_value is not null,
        clothing_size_value is distinct from stored.clothing_size),
      ('shoe_size', payload ? 'shoe_size', shoe_size_value is not null,
        shoe_size_value is distinct from stored.shoe_size),
      ('avatar', payload ? 'avatar_url', avatar_url_value is not null,
        avatar_url_value is distinct from stored.avatar_url),
      ('applicant_status', payload ? 'applicant_status', saved.applicant_status is not null,
        public.decrypt_field(saved.applicant_status) is distinct from public.decrypt_field(stored.applicant_status)),
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
$function$;

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
    first_name = payload ->> 'first_name',
    last_name = payload ->> 'last_name',
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
    -- The season registration answers (RAPP-303): a key left out keeps its
    -- value, so an older build never wipes them.
    applicant_status = case when payload ? 'applicant_status'
      then public.encrypt_field(nullif(btrim(payload ->> 'applicant_status'), '')) else applicant_status end,
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
$function$;

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
    'document_number', 'phone', 'address', 'postal_code', 'applicant_status', 'specific_needs'];
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
      payload := payload - 'document_number' - 'phone' - 'address' - 'postal_code'
        - 'applicant_status' - 'specific_needs';
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
  if document_type_value in ('nie', 'passport')
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

  if not (select public.has_permission('participants.view_sensitive')) then
    payload := payload - 'applicant_status' - 'specific_needs';
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
    first_name = payload ->> 'first_name',
    last_name = payload ->> 'last_name',
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
    reference_contact_name = nullif(payload ->> 'reference_contact_name', ''),
    has_dependents = coalesce((payload ->> 'has_dependents')::boolean, false),
    num_dependents = coalesce((payload ->> 'num_dependents')::integer, 0),
    clothing_size = nullif(payload ->> 'clothing_size', ''),
    shoe_size = nullif(payload ->> 'shoe_size', ''),
    media_consent_at = case
      when (payload ->> 'media_consent')::boolean then coalesce(media_consent_at, now())
      else null
    end,
    applicant_status = case when payload ? 'applicant_status'
      then public.encrypt_field(nullif(btrim(payload ->> 'applicant_status'), '')) else applicant_status end,
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
$function$;

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

  if (p_payload ? 'first_name' and nullif(btrim(p_payload ->> 'first_name'), '') is null)
    or (p_payload ? 'last_name' and nullif(btrim(p_payload ->> 'last_name'), '') is null)
  then
    raise exception 'a name can be corrected but not removed'
      using errcode = 'not_null_violation';
  end if;

  if not private.season_answers_valid(p_payload) then
    raise invalid_parameter_value using message = 'a season answer is outside its choices';
  end if;

  update public.profiles p set
    first_name = case when p_payload ? 'first_name' then btrim(p_payload ->> 'first_name') else p.first_name end,
    last_name = case when p_payload ? 'last_name' then btrim(p_payload ->> 'last_name') else p.last_name end,
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
      then nullif(btrim(p_payload ->> 'reference_contact_name'), '') else p.reference_contact_name end,
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
      ('applicant_status', p_payload ? 'applicant_status', target.applicant_status is not null),
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
$function$;

drop function public.get_own_profile();

CREATE OR REPLACE FUNCTION public.get_own_profile()
 RETURNS TABLE(id uuid, first_name text, last_name text, date_of_birth date, place_of_birth text, nationality text, preferred_language text, document_type text, document_number text, document_name text, phone text, address text, city text, postal_code text, reference_entity text, reference_contact_name text, has_dependents boolean, num_dependents integer, clothing_size text, shoe_size text, avatar_url text, media_consent boolean, terms_accepted_at timestamp with time zone, applicant_status text, supporting_entities text[], season_number smallint, childcare_need text, specific_needs text, health_info text, emergency_contact_name text, emergency_contact_relation text, emergency_contact_phone text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.id,
    p.first_name,
    p.last_name,
    p.date_of_birth,
    p.place_of_birth,
    p.nationality,
    p.preferred_language,
    p.document_type,
    public.decrypt_field(p.document_number),
    p.document_name,
    public.decrypt_field(p.phone),
    public.decrypt_field(p.address),
    p.city,
    public.decrypt_field(p.postal_code),
    p.reference_entity,
    p.reference_contact_name,
    p.has_dependents,
    p.num_dependents,
    p.clothing_size,
    p.shoe_size,
    p.avatar_url,
    p.media_consent_at is not null,
    p.terms_accepted_at,
    public.decrypt_field(p.applicant_status),
    p.supporting_entities,
    private.season_number(p.id),
    p.childcare_need,
    public.decrypt_field(p.specific_needs),
    public.decrypt_field(p.health_info),
    p.emergency_contact_name,
    p.emergency_contact_relation,
    public.decrypt_field(p.emergency_contact_phone)
  from public.profiles p
  where p.id = (select auth.uid());
$function$;
revoke all on function public.get_own_profile() from public, anon;
grant execute on function public.get_own_profile() to authenticated;

drop function public.get_participant_profile(uuid);

CREATE OR REPLACE FUNCTION public.get_participant_profile(participant_id uuid)
 RETURNS TABLE(id uuid, first_name text, last_name text, date_of_birth date, place_of_birth text, nationality text, preferred_language text, document_type text, document_number text, document_name text, phone text, address text, city text, postal_code text, reference_entity text, reference_contact_name text, has_dependents boolean, num_dependents integer, clothing_size text, shoe_size text, avatar_url text, media_consent boolean, terms_accepted_at timestamp with time zone, is_active boolean, is_forum_banned boolean, anonymized_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, applicant_status text, supporting_entities text[], season_number smallint, childcare_need text, specific_needs text, health_info text, emergency_contact_name text, emergency_contact_relation text, emergency_contact_phone text)
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
    case when (select public.has_permission('participants.view_personal')) then s.document_name end,
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
    s.updated_at,
    -- The season registration answers (RAPP-303). Applicant status and
    -- specific needs are sensitive, like the document number.
    case when (select public.has_permission('participants.view_sensitive')) then public.decrypt_field(s.applicant_status) end,
    case when (select public.has_permission('participants.view_personal')) then s.supporting_entities end,
    -- Counted (RAPP-306): earlier seasons plus the seasons she signed.
    private.season_number(s.id),
    case when (select public.has_permission('participants.view_personal')) then s.childcare_need end,
    case when (select public.has_permission('participants.view_sensitive')) then public.decrypt_field(s.specific_needs) end,
    -- The medical answer needs its own permission (RAPP-304); the emergency
    -- contact follows the personal and sensitive levels.
    case when (select public.has_permission('participants.view_health')) then public.decrypt_field(s.health_info) end,
    case when (select public.has_permission('participants.view_personal')) then s.emergency_contact_name end,
    case when (select public.has_permission('participants.view_personal')) then s.emergency_contact_relation end,
    case when (select public.has_permission('participants.view_sensitive')) then public.decrypt_field(s.emergency_contact_phone) end
  from subject s;
$function$;
revoke all on function public.get_participant_profile(uuid) from public, anon;
grant execute on function public.get_participant_profile(uuid) to authenticated;

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
    document_name = null,
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

-- RAPP-561: remove the known example note, keeping genuinely custom dashboard copy.
update public.organizations set document_step_explanation = null
where document_step_explanation ->> 'ca' in (
  'Només el fem servir quan cal.',
  'Només el fem servir quan cal, per exemple per inscriure''t a un curs. Si l''entitat que t''acompanya el té, també ens el pot donar més endavant.'
);

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
    -- Custom answers (RAPP-307) need what the participants export needs.
    case (case when p_dataset = 'custom_answers' then 'participants' else p_dataset end)
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
  if p_dataset not in ('participants', 'custom_answers', 'attendance', 'events') then
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
    export_columns := '["id","first_name","last_name","date_of_birth","place_of_birth","nationality","preferred_language","document_type","document_name","document_number","phone","address","city","postal_code","reference_entity","reference_contact_name","has_dependents","num_dependents","clothing_size","shoe_size","is_active","created_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', profile.id,
      'first_name', profile.first_name,
      'last_name', profile.last_name,
      'date_of_birth', profile.date_of_birth,
      'place_of_birth', profile.place_of_birth,
      'nationality', profile.nationality,
      'preferred_language', profile.preferred_language,
      'document_type', profile.document_type,
      'document_name', profile.document_name,
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
  elsif p_dataset = 'custom_answers' then
    -- Answers to the questions staff added (RAPP-307), one row per answer. The
    -- default scope holds Normal and Personal answers; Sensitive answers only
    -- the full scope, which needs participants.view_sensitive above.
    export_columns := '["participant_id","first_name","last_name","screen","question","privacy","season","answer","answered_at"]'::jsonb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'participant_id', profile.id,
      'first_name', profile.first_name,
      'last_name', profile.last_name,
      'screen', screen.title ->> 'ca',
      'question', question.label ->> 'ca',
      'privacy', question.privacy,
      'season', season.name,
      'answer', private.custom_answer_text(
        question, coalesce(answer.value, (public.decrypt_field(answer.value_encrypted))::jsonb)),
      'answered_at', answer.answered_at
    ) order by profile.last_name, profile.first_name, profile.id, screen.sort_order, question.sort_order,
             season.starts_on), '[]'::jsonb)
    into export_rows
    from public.custom_answers answer
    join public.custom_questions question on question.id = answer.question_id
    join public.intake_screens screen on screen.id = question.screen_id
    join public.profiles profile on profile.id = answer.profile_id
    left join public.seasons season on season.id = answer.season_id
    where answer.org_id = actor_org
      and profile.role = 'player'
      and (p_scope = 'full' or question.privacy <> 'sensitive');
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

notify pgrst, 'reload schema';
