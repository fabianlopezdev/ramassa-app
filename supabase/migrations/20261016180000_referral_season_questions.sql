-- Entities answer the season registration questions on a referral (RAPP-303).
--
-- Since last season the referring entities register women through a Google
-- Form. The app's referral form asked much less, so the women typed everything
-- again and the entities kept the Google Form. Now:
--   - the referral carries every question of that form, only with the entity's
--     confirmation that she agreed to share her data, and keeps the answers in
--     one encrypted blob (intake_answers);
--   - five answers are new on the profile: applicant status and specific needs
--     (encrypted, sensitive like the document number), other supporting
--     entities, the season number and the childcare need;
--   - accepting the referral (an invitation that carries it) creates her
--     profile with the entity's answers, recorded as given by the entity
--     (RAPP-300 profile_answers), and the referral keeps no copy of them;
--   - the sender reads what it sent while the referral is pending; staff read
--     the sensitive answers only with participants.view_sensitive;
--   - edits that leave the new keys out keep them, so older app builds never
--     wipe them.

-- 1. The new profile answers --------------------------------------------------------------------------

alter table public.profiles
  add column applicant_status bytea,
  add column supporting_entities text[],
  add column season_number smallint
    constraint profiles_season_number_check check (season_number between 1 and 5),
  add column childcare_need text
    constraint profiles_childcare_need_check check (childcare_need in ('yes', 'no', 'maybe')),
  add column specific_needs bytea;

comment on column public.profiles.applicant_status is
  'Encrypted (ADR-004). asylum_seeker, refugee, migrant, other or prefer_not_to_say (RAPP-303). Sensitive: participants.view_sensitive.';
comment on column public.profiles.specific_needs is
  'Encrypted (ADR-004). Free text that may hold health information (RAPP-303). Sensitive: participants.view_sensitive.';
comment on column public.profiles.supporting_entities is
  'Other entities or programmes that support her, besides the referring one (RAPP-303).';
comment on column public.profiles.season_number is
  'Which season of the programme this is for her, 1 to 5, as the entity reported it (RAPP-303).';
comment on column public.profiles.childcare_need is
  'Whether she needs childcare during training: yes, no or maybe (RAPP-303). Separate from dependants.';

alter table public.profile_answers drop constraint profile_answers_question_check;
alter table public.profile_answers add constraint profile_answers_question_check check (question in (
  -- intake-questions:start
  'first_name', 'last_name', 'date_of_birth', 'place_of_birth', 'nationality',
  'preferred_language', 'document', 'phone', 'address', 'city', 'postal_code',
  'reference_entity', 'reference_contact_name', 'dependents', 'clothing_size',
  'shoe_size', 'avatar', 'applicant_status', 'supporting_entities', 'season_number',
  'childcare_need', 'specific_needs'
  -- intake-questions:end
));

-- A JSON array of names, trimmed, empty ones dropped; null when none is left.
create or replace function private.text_array_answer(p_value jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case when count(*) = 0 then null else array_agg(btrim(item) order by position) end
    from jsonb_array_elements_text(
           case when jsonb_typeof(p_value) = 'array' then p_value else '[]'::jsonb end
         ) with ordinality as entry(item, position)
   where btrim(item) <> '';
$$;

-- The season answers in a profile payload (snake_case keys). A key that is
-- absent or empty is valid: every season answer is optional.
create or replace function private.season_answers_valid(p_payload jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    coalesce(nullif(btrim(p_payload ->> 'applicant_status'), '') in
      ('asylum_seeker', 'refugee', 'migrant', 'other', 'prefer_not_to_say'), true)
    and coalesce(nullif(p_payload ->> 'childcare_need', '') in ('yes', 'no', 'maybe'), true)
    and coalesce(nullif(p_payload ->> 'season_number', '') in ('1', '2', '3', '4', '5'), true)
    and coalesce(length(p_payload ->> 'specific_needs') <= 2000, true)
    and (
      not (p_payload ? 'supporting_entities')
      or jsonb_typeof(p_payload -> 'supporting_entities') = 'null'
      or (
        jsonb_typeof(p_payload -> 'supporting_entities') = 'array'
        and jsonb_array_length(p_payload -> 'supporting_entities') <= 20
        and not exists (
          select 1 from jsonb_array_elements(p_payload -> 'supporting_entities') item
           where jsonb_typeof(item) <> 'string' or length(item #>> '{}') > 200
        )
      )
    );
$$;

-- Everything a referral may carry for her profile. Also checked: a valid
-- date of birth, a known document type with a number when it needs one, and a
-- municipality from the catalog (profiles.city refers to it).
create or replace function private.referral_answers_valid(p_answers jsonb)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.season_answers_valid(p_answers) then
    return false;
  end if;
  if p_answers ? 'date_of_birth' then
    perform (p_answers ->> 'date_of_birth')::date;
  end if;
  if (p_answers ? 'document_type'
        and p_answers ->> 'document_type' not in ('nie', 'passport', 'other', 'none'))
     or (p_answers ? 'document_number' and not (p_answers ? 'document_type'))
     or (p_answers ->> 'document_type' in ('nie', 'passport', 'other')
        and not (p_answers ? 'document_number'))
     or length(coalesce(p_answers ->> 'document_number', '')) > 50
     or length(coalesce(p_answers ->> 'nationality', '')) > 100
     or length(coalesce(p_answers ->> 'reference_contact_name', '')) > 200
  then
    return false;
  end if;
  if p_answers ? 'city' and not exists (
    select 1 from public.municipality_catalog m where m.canonical = p_answers ->> 'city'
  ) then
    return false;
  end if;
  return true;
exception
  when invalid_datetime_format or datetime_field_overflow then
    return false;
end;
$$;

-- 2. The referral carries them ------------------------------------------------------------------------

alter table public.entity_referrals
  add column intake_answers bytea,
  add column consent_confirmed_at timestamptz,
  add column consent_confirmed_by uuid references auth.users (id) on delete set null;

comment on column public.entity_referrals.intake_answers is
  'Encrypted JSON of the season registration answers, in profile keys (RAPP-303). Cleared when an invitation accepts the referral.';
comment on column public.entity_referrals.consent_confirmed_at is
  'When the entity confirmed that she agreed to share her data with Ramassà (RAPP-303).';

-- The organization's partner entities, by name, for the "other supporting
-- entities" choice on the referral form (RAPP-303). An entity contact may
-- otherwise read only its own entity; names are not personal data.
create or replace function public.list_supporting_entity_names()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select e.name
    from public.collaborating_entities e
   where e.org_id = (select public.current_org_id())
     and e.is_active
     and (
       (select public.current_collaborating_entity_id()) is not null
       or (select public.is_team_member())
     )
   order by e.name;
$$;


create or replace function private.apply_profile_prefill(p_profile_id uuid, p_payload jsonb, p_source text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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
      ('document', p_payload ?| array['document_type', 'document_number'],
        target.document_type is not null
        and (target.document_type = 'none' or target.document_number is not null)),
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
$$;

create or replace function public.create_entity_referral(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid;
  actor_org uuid;
  actor_role text;
  actor_entity uuid;
  first_name text := nullif(btrim(p_payload ->> 'firstName'), '');
  last_name text := nullif(btrim(p_payload ->> 'lastName'), '');
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
    'supporting_entities', case
      when jsonb_typeof(p_payload -> 'supportingEntities') = 'array'
        and jsonb_array_length(p_payload -> 'supportingEntities') > 0
      then p_payload -> 'supportingEntities' end,
    'reference_contact_name', nullif(btrim(p_payload ->> 'referenceContactName'), ''),
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
      'applicantStatus', 'supportingEntities', 'referenceContactName', 'seasonNumber',
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
$$;

drop function public.get_entity_referral(uuid);

create or replace function public.get_entity_referral(p_referral_id uuid)
 RETURNS TABLE(id uuid, entity_user_id uuid, referred_profile_id uuid, assigned_staff_id uuid, referred_first_name text, referred_last_name text, referred_phone text, referred_email text, documentation_status text, notes text, status text, entity_name text, created_at timestamp with time zone, updated_at timestamp with time zone, intake_answers jsonb, consent_confirmed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $$
begin
  return query
  select
    referral.id,
    referral.entity_user_id,
    referral.referred_profile_id,
    referral.assigned_staff_id,
    referral.referred_first_name,
    referral.referred_last_name,
    public.decrypt_field(referral.referred_phone),
    public.decrypt_field(referral.referred_email),
    referral.documentation_status,
    public.decrypt_field(referral.notes),
    referral.status,
    entity.name,
    referral.created_at,
    referral.updated_at,
    -- The sender reads everything it sent; staff read the sensitive answers
    -- only with participants.view_sensitive (RAPP-303).
    case
      when referral.intake_answers is null then null
      when referral.collaborating_entity_id = (select public.current_collaborating_entity_id())
        or (select public.has_permission('participants.view_sensitive'))
      then public.decrypt_field(referral.intake_answers)::jsonb
      else public.decrypt_field(referral.intake_answers)::jsonb
        - array['applicant_status', 'specific_needs', 'document_number']
    end,
    referral.consent_confirmed_at
  from public.entity_referrals as referral
  join public.collaborating_entities as entity
    on entity.org_id = referral.org_id
   and entity.id = referral.collaborating_entity_id
  where referral.id = p_referral_id;

  if not found then
    raise no_data_found using message = 'referral not found';
  end if;
end;
$$;

create or replace function public.create_participant_invite(payload jsonb)
 RETURNS TABLE(invite_id uuid, email text, expires_at timestamp with time zone, profile_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid;
  email_value text := lower(btrim(payload ->> 'email'));
  reference_entity_value text := nullif(btrim(payload ->> 'reference_entity'), '');
  referral_value uuid := nullif(btrim(payload ->> 'referral_id'), '')::uuid;
  entity_answers jsonb;
  account_id uuid;
  new_invite_id uuid;
  invite_expires_at timestamptz := now() + interval '30 days';
  first_name_value text := nullif(btrim(payload ->> 'first_name'), '');
  last_name_value text := nullif(btrim(payload ->> 'last_name'), '');
  creates_profile boolean;
begin
  if not (select public.has_permission('participants.invite')) then
    raise exception 'inviting a participant is a staff action'
      using errcode = 'insufficient_privilege';
  end if;

  -- The same shape the CHECK constraint enforces, raised here as a clean error
  -- rather than as a constraint violation, because this one is shown to a staff
  -- member who mistyped an address.
  if email_value is null
    or length(email_value) > 254
    or email_value !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  then
    raise exception 'create_participant_invite requires a valid email address'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Her name creates her profile with the account (RAPP-300). A first name
  -- alone is a typo, so both or neither.
  if (first_name_value is null) <> (last_name_value is null) then
    raise exception 'create_participant_invite needs both her first and last name, or neither'
      using errcode = 'invalid_parameter_value';
  end if;
  creates_profile := first_name_value is not null;

  perform public.assert_within_hourly_limit('invite.create', 30);

  actor_org := (select public.current_org_id());

  if referral_value is not null and not exists (
    select 1 from public.entity_referrals referral
    where referral.id = referral_value
      and referral.org_id = actor_org
      and referral.status = 'pending'
  ) then
    raise exception 'an invitation can only carry a pending referral of this organization'
      using errcode = 'invalid_parameter_value';
  end if;

  select account.id into account_id
  from auth.users account
  where lower(account.email) = email_value;

  if account_id is not null
    and exists (select 1 from public.profiles profile where profile.id = account_id)
  then
    raise exception 'this address already belongs to an account'
      using errcode = 'unique_violation';
  end if;

  -- Her account, so her first code request succeeds. Confirmed, because staff
  -- typed the address with her; empty, because the wizard writes her profile.
  if account_id is null then
    account_id := extensions.gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', account_id,
      'authenticated', 'authenticated', email_value, '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', '', '', ''
    );

    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      account_id::text,
      account_id,
      jsonb_build_object('sub', account_id::text, 'email', email_value, 'email_verified', true),
      'email', now(), now(), now()
    );
  end if;

  insert into public.invites (org_id, email, reference_entity, referral_id, invited_by, expires_at)
  values (actor_org, email_value, reference_entity_value, referral_value, actor, invite_expires_at)
  returning id into new_invite_id;

  -- Her profile, created with the account and without consent: role
  -- 'invited' keeps her out of every player list, count and audience until
  -- she accepts the terms herself in the wizard (RAPP-300).
  if creates_profile then
    insert into public.profiles (id, org_id, role, first_name, last_name, preferred_language)
    values (
      account_id, actor_org, 'invited', first_name_value, last_name_value,
      coalesce((select o.locked_default_language from public.organizations o where o.id = actor_org), 'ca')
    );
    perform private.apply_profile_prefill(account_id, payload - 'email' - 'referral_id', 'staff');

    -- From a referral (RAPP-303): the entity's answers fill the rest of her
    -- profile, recorded as given by the entity. What staff typed wins. The
    -- referral then keeps no copy: her answers live on her profile only.
    if referral_value is not null then
      select coalesce(public.decrypt_field(referral.intake_answers)::jsonb, '{}'::jsonb)
             || coalesce(jsonb_build_object('phone', public.decrypt_field(referral.referred_phone)), '{}'::jsonb)
        into entity_answers
        from public.entity_referrals referral
       where referral.id = referral_value;
      entity_answers := jsonb_strip_nulls(entity_answers)
        - array(select jsonb_object_keys(payload - 'email' - 'referral_id'));
      if entity_answers <> '{}'::jsonb then
        perform private.apply_profile_prefill(account_id, entity_answers, 'entity');
      end if;
      update public.entity_referrals
         set intake_answers = null, referred_phone = null, referred_email = null, updated_at = now()
       where id = referral_value;
    end if;
  end if;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org,
    actor,
    'invite.create',
    'invite',
    new_invite_id,
    -- The referring entity and the referral are programme data, not personal
    -- data, so they are recorded. The invited ADDRESS is not: the audit trail
    -- says who invited and when, and the invite row itself holds who was invited.
    jsonb_build_object(
      'reference_entity', reference_entity_value,
      'referral_id', referral_value,
      'profile_created', creates_profile
    )
  );

  -- Her profile id, so staff can open her record and complete it; null for
  -- an email-only invitation, which creates no profile.
  return query select new_invite_id, email_value, invite_expires_at,
    case when creates_profile then account_id end;
end;
$$;

drop function public.get_participant_profile(uuid);

create or replace function public.get_participant_profile(participant_id uuid)
 RETURNS TABLE(id uuid, first_name text, last_name text, date_of_birth date, place_of_birth text, nationality text, preferred_language text, document_type text, document_number text, phone text, address text, city text, postal_code text, reference_entity text, reference_contact_name text, has_dependents boolean, num_dependents integer, clothing_size text, shoe_size text, avatar_url text, media_consent boolean, terms_accepted_at timestamp with time zone, is_active boolean, is_forum_banned boolean, anonymized_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, applicant_status text, supporting_entities text[], season_number smallint, childcare_need text, specific_needs text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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
    s.updated_at,
    -- The season registration answers (RAPP-303). Applicant status and
    -- specific needs are sensitive, like the document number.
    case when (select public.has_permission('participants.view_sensitive')) then public.decrypt_field(s.applicant_status) end,
    case when (select public.has_permission('participants.view_personal')) then s.supporting_entities end,
    s.season_number,
    case when (select public.has_permission('participants.view_personal')) then s.childcare_need end,
    case when (select public.has_permission('participants.view_sensitive')) then public.decrypt_field(s.specific_needs) end
  from subject s;
$$;

drop function public.get_own_profile();

create or replace function public.get_own_profile()
 RETURNS TABLE(id uuid, first_name text, last_name text, date_of_birth date, place_of_birth text, nationality text, preferred_language text, document_type text, document_number text, phone text, address text, city text, postal_code text, reference_entity text, reference_contact_name text, has_dependents boolean, num_dependents integer, clothing_size text, shoe_size text, avatar_url text, media_consent boolean, terms_accepted_at timestamp with time zone, applicant_status text, supporting_entities text[], season_number smallint, childcare_need text, specific_needs text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
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
    p.season_number,
    p.childcare_need,
    public.decrypt_field(p.specific_needs)
  from public.profiles p
  where p.id = (select auth.uid());
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
$$;


revoke all on function public.get_entity_referral(uuid) from public, anon;
revoke all on function public.get_participant_profile(uuid) from public, anon;
revoke all on function public.get_own_profile() from public, anon;
grant execute on function public.get_entity_referral(uuid) to authenticated;
grant execute on function public.get_participant_profile(uuid) to authenticated;
grant execute on function public.get_own_profile() to authenticated;
revoke all on function public.list_supporting_entity_names() from public, anon;
grant execute on function public.list_supporting_entity_names() to authenticated;
