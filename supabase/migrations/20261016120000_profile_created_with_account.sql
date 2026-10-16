-- A player's profile is created with her account (RAPP-300).
--
-- WHY
--
-- The intake agreed with Ramassà on 2026-10-13 is entity-first: entities and
-- staff fill in what they already know, and the wizard asks the player only
-- for what is missing. Until now an invitation created her login only, and the
-- wizard wrote her whole profile ("because the consent in it is hers to give",
-- 20261010120000_player_invites_create_accounts.sql). So staff had nowhere to
-- put what they knew, and the wizard asked her everything again.
--
-- Fabián decided on 2026-10-13 to reverse that rule (vault decision
-- "ramassa-player-profile-created-with-the-account"): an invitation with her
-- name creates her profile too. Her consent is still hers: only the wizard
-- sets terms_accepted_at.
--
-- HOW SHE STAYS OUT UNTIL SHE JOINS
--
-- Her profile carries role 'invited' until she accepts the terms. Before this
-- change she had no profile at all, so every staff list, count, roster and
-- push audience, all of which select role = 'player', already behaved as if
-- she did not exist; they keep doing so with no change, the same way the
-- preview account stays out (20261014090000_player_preview_account.sql).
-- current_app_role() gives her no role, so no player action opens for her.
-- Only the participant list shows her, marked as not joined, so staff can
-- complete her record. Finishing the wizard makes her a player.
--
-- WHAT IS ANSWERED
--
-- profiles has defaults that look like answers (no dependants, Catalan), so
-- profile_answers records which questions somebody actually answered, and
-- who: staff, entity or the player. The question list is mirrored in
-- packages/shared/onboarding/questions.ts and kept equal by a parity test.
--
-- WHAT ELSE CHANGES
--
--   - Staff complete a not-joined record in parts: only the fields sent
--     change, and each one becomes an answer.
--   - complete_onboarding merges: a question the wizard did not send keeps
--     its stored value.
--   - The invitation is spent when she joins, no longer when a profile row
--     appears; cancelling it, or a daily purge after it expires, removes her
--     not-joined profile with her account.

-- 1. The invited role ---------------------------------------------------------------------------

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('player', 'staff', 'entity', 'admin', 'preview', 'invited'));

comment on column public.profiles.role is 'player, staff, entity, admin, preview (the read-only player preview), or invited: a woman whose profile staff created with her account and who has not accepted the terms yet (RAPP-300).';

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when role = 'preview' then 'player' else role end
  from public.profiles
  where id = (select auth.uid())
    and is_active
    -- An invited woman has not joined yet: she has no player role (RAPP-300).
    and role <> 'invited'
    and (select private.session_is_current())
    and (role in ('player', 'preview') or (select private.session_is_aal2()));
$$;

-- 2. What was answered, and by whom -------------------------------------------------------------

create table public.profile_answers (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  question text not null check (question in (
    -- intake-questions:start
    'first_name', 'last_name', 'date_of_birth', 'place_of_birth', 'nationality',
    'preferred_language', 'document', 'phone', 'address', 'city', 'postal_code',
    'reference_entity', 'reference_contact_name', 'dependents', 'clothing_size',
    'shoe_size', 'avatar'
    -- intake-questions:end
  )),
  source text not null check (source in ('staff', 'entity', 'player')),
  answered_at timestamptz not null default now(),
  primary key (profile_id, question)
);

comment on table public.profile_answers is 'Which intake questions somebody actually answered for a participant, and who: staff, a partner entity or the player. A column default is never an answer. Written only by the intake functions (RAPP-300).';

create index profile_answers_org_id_idx on public.profile_answers (org_id);

alter table public.profile_answers enable row level security;

revoke all on public.profile_answers from anon, authenticated;
grant select on public.profile_answers to authenticated;

create policy profile_answers_select_self_or_team
  on public.profile_answers
  for select
  to authenticated
  using (
    profile_id = (select auth.uid())
    or (
      (select public.has_permission('participants.view'))
      and org_id = (select public.current_org_id())
    )
  );

-- Staff and entity answers: only the keys sent change, a key sent with an
-- empty value clears it, and every key sent updates the answer record. Names
-- can be corrected but never removed, and consent is never prefilled.
create or replace function private.apply_profile_prefill(
  p_profile_id uuid,
  p_payload jsonb,
  p_source text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
      ('shoe_size', p_payload ? 'shoe_size', target.shoe_size is not null)
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

comment on function private.apply_profile_prefill is 'Writes staff or entity answers into a profile: only the keys sent change, an empty value clears, and every key sent updates profile_answers (RAPP-300).';

revoke all on function private.apply_profile_prefill(uuid, jsonb, text)
  from public, anon, authenticated, service_role;

-- Which of her own questions are already answered: the wizard skips them.
create or replace function public.my_answered_questions()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select answer.question
  from public.profile_answers answer
  where answer.profile_id = (select auth.uid());
$$;

comment on function public.my_answered_questions is 'The intake questions already answered for the signed-in person, so the wizard asks only the rest (RAPP-300).';

revoke all on function public.my_answered_questions() from public, anon;
grant execute on function public.my_answered_questions() to authenticated;

-- 3. An invitation with her name creates her profile ------------------------------------------

create or replace function public.create_participant_invite(payload jsonb)
 RETURNS TABLE(invite_id uuid, email text, expires_at timestamp with time zone)
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

  return query select new_invite_id, email_value, invite_expires_at;
end;
$$;

-- 4. Staff complete a not-joined record in parts ------------------------------------------------

create or replace function public.update_participant_profile(participant_id uuid, payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
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
  if document_type_value is distinct from 'none' and document_number_value is null
    and (select public.has_permission('participants.view_sensitive'))
  then
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
    if document_type_value is distinct from 'none' and document_number_value is null then
      raise exception 'update_participant_profile requires document_number unless document_type is none'
        using errcode = 'not_null_violation';
    end if;
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

-- 5. The wizard merges, makes her a player and records her own answers ------------------------

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
  if document_type_value = 'none' then
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

  -- A document number is required unless the answer is "none", which is a
  -- first-class answer: many participants genuinely have no document, and
  -- onboarding must never dead-end on it.
  if document_type_value is distinct from 'none' and document_number_value is null then
    raise exception 'complete_onboarding requires document_number unless document_type is none'
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
      ('document', payload ?| array['document_type', 'document_number'], document_type_value is not null,
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

-- 6. The invitation is spent at joining; cancelling or expiry removes her ---------------------

create or replace function public.spend_pending_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_email text;
begin
  -- Joining spends the invitation (RAPP-300): a new player profile, or an
  -- invited profile that becomes a player when she accepts the terms. An
  -- invited profile alone spends nothing, or her invitation would be used
  -- up the moment staff created it.
  if new.role <> 'player' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.role is distinct from 'invited' then
    return new;
  end if;

  select u.email into owner_email from auth.users u where u.id = new.id;
  if owner_email is null then
    return new;
  end if;

  with spent as (
    update public.invites
       set accepted_at = now(), accepted_by = new.id
     where email = lower(owner_email)
       and accepted_at is null
    returning referral_id, invited_by, created_at
  ),
  newest_referral as (
    select referral_id, invited_by
    from spent
    where referral_id is not null
    order by created_at desc
    limit 1
  )
  update public.entity_referrals referral
     set referred_profile_id = new.id,
         assigned_staff_id = newest_referral.invited_by,
         status = case when new.is_active then 'active' else 'inactive' end
    from newest_referral
   where referral.id = newest_referral.referral_id
     and referral.org_id = new.org_id
     and referral.status = 'pending'
     and new.role = 'player';

  return new;
end;
$$;

drop trigger profiles_spend_pending_invite on public.profiles;
create trigger profiles_spend_pending_invite
  after insert or update of role on public.profiles
  for each row
  execute function public.spend_pending_invite();

create or replace function public.revoke_participant_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  invite_email text;
  removed_account boolean := false;
begin
  if not (select public.has_permission('participants.invite')) then
    raise exception 'cancelling an invitation is a staff action'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.invites
   where id = p_invite_id
     and org_id = actor_org
     and accepted_at is null
  returning email into invite_email;
  if invite_email is null then
    raise exception 'no open invitation with that id in this organization'
      using errcode = 'no_data_found';
  end if;

  -- The empty account goes only when nothing else stands on it: no profile,
  -- no other open participant invite, and no staff or entity invitation for
  -- the same address.
  delete from auth.users account
   where lower(account.email) = invite_email
     -- An invited profile goes with its account (RAPP-300); a joined one stays.
     and not exists (
       select 1 from public.profiles profile
        where profile.id = account.id and profile.role <> 'invited'
     )
     and not exists (
       select 1 from public.invites other
        where other.email = invite_email and other.accepted_at is null
     )
     and not exists (
       select 1 from public.staff_invitations staff
        where lower(staff.email) = invite_email and staff.accepted_at is null
     )
     and not exists (
       select 1 from public.entity_invitations entity
        where lower(entity.email) = invite_email and entity.accepted_at is null
     );
  removed_account := found;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'invite.revoke', 'invite', p_invite_id,
    jsonb_build_object('account_removed', removed_account));
end;
$$;

-- A woman who never joins: when her invitation has expired and nobody renewed
-- it, her not-joined profile and her account are removed, with the expired
-- invitation that held her address. Runs daily.
create or replace function private.purge_unjoined_participants(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  with gone as (
    delete from auth.users account
     using public.profiles profile
     where profile.id = account.id
       and profile.role = 'invited'
       and not exists (
         select 1 from public.invites open_invite
          where open_invite.email = lower(account.email)
            and open_invite.accepted_at is null
            and open_invite.expires_at > p_now
       )
    returning lower(account.email) as email
  ),
  expired_invites as (
    delete from public.invites stale
     using gone
     where stale.email = gone.email
       and stale.accepted_at is null
  )
  select count(*)::integer into removed from gone;

  return removed;
end;
$$;

comment on function private.purge_unjoined_participants is 'Removes invited women who never joined once their invitation has expired: the profile, the account and the expired invitation (RAPP-300). Scheduled daily.';

revoke all on function private.purge_unjoined_participants(timestamptz)
  from public, anon, authenticated, service_role;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'ramassa-purge-unjoined-participants';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'ramassa-purge-unjoined-participants',
    '17 3 * * *',
    'select private.purge_unjoined_participants();'
  );
end;
$$;

-- 7. The participant list shows invited women as not joined ------------------------------------

drop function public.list_participants(text, text, text, text, text, text, text, integer, integer);

create or replace function public.list_participants(
  p_query text default '',
  p_entity text default null,
  p_nationality text default null,
  p_status text default 'all',
  p_dependents text default 'all',
  p_sort text default 'last_name',
  p_dir text default 'asc',
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  id uuid,
  first_name text,
  last_name text,
  nationality text,
  city text,
  reference_entity text,
  has_dependents boolean,
  num_dependents integer,
  is_active boolean,
  preferred_language text,
  created_at timestamptz,
  joined boolean,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with access as (
    select
      (select public.has_permission('participants.view')) as can_view,
      (select public.has_permission('participants.view_personal')) as personal
  ),
  roster as (
    select
      profile.*,
      case
        when p_sort = 'first_name' then profile.first_name
        when p_sort = 'city' and access.personal then profile.city
        when p_sort = 'nationality' and access.personal then profile.nationality
        when p_sort = 'reference_entity' then profile.reference_entity
        when p_sort = 'created_at' then to_char(profile.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
        else profile.last_name
      end as sort_key,
      access.personal
    from public.profiles as profile
    cross join access
    where access.can_view
      and profile.org_id = (select public.current_org_id())
      -- Invited women are listed too, marked as not joined, so staff can
      -- complete their record before the first login (RAPP-300).
      and profile.role in ('player', 'invited')
      and (
        coalesce(p_query, '') = ''
        or (access.personal and profile.search_document @@ to_tsquery('simple', p_query))
        or (not access.personal and to_tsvector('simple',
              public.immutable_unaccent(concat_ws(' ', profile.first_name, profile.last_name, profile.reference_entity))
              || ' ' || concat_ws(' ', profile.first_name, profile.last_name, profile.reference_entity))
            @@ to_tsquery('simple', p_query))
      )
      and (p_entity is null or profile.reference_entity = p_entity)
      and (p_nationality is null or not access.personal or profile.nationality = p_nationality)
      and (
        p_status = 'all'
        or (p_status = 'invited' and profile.role = 'invited')
        or (p_status in ('active', 'inactive') and profile.role = 'player'
            and profile.is_active = (p_status = 'active'))
      )
      and (p_dependents = 'all' or not access.personal or profile.has_dependents = (p_dependents = 'with'))
  )
  select
    roster.id,
    roster.first_name,
    roster.last_name,
    case when roster.personal then roster.nationality end,
    case when roster.personal then roster.city end,
    roster.reference_entity,
    case when roster.personal then roster.has_dependents end,
    case when roster.personal then roster.num_dependents end,
    roster.is_active,
    roster.preferred_language,
    roster.created_at,
    roster.role = 'player',
    count(*) over ()
  from roster
  order by
    case when p_dir = 'desc' then null else roster.sort_key end asc nulls last,
    case when p_dir = 'desc' then roster.sort_key end desc nulls first,
    roster.id
  limit least(greatest(coalesce(p_page_size, 25), 1), 100)
  offset (greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_page_size, 25), 1), 100);
$$;

comment on function public.list_participants is 'The participant roster page. Needs participants.view; Personal fields, and the filters, sorts and search over them, need participants.view_personal. Invited women who have not joined are listed with joined = false (RAPP-300).';
revoke all on function public.list_participants(text, text, text, text, text, text, text, integer, integer) from public, anon;
grant execute on function public.list_participants(text, text, text, text, text, text, text, integer, integer) to authenticated;

-- 8. The erasure registry learns profile_answers (RAPP-26) ----------------------------------------

CREATE OR REPLACE FUNCTION public.personal_data_disposition()
 RETURNS TABLE(table_name text, participant_column text, disposition text, reason text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select * from (values
    ('profiles', 'id', 'purge', 'The participant profile and its encrypted fields.'),
    ('participant_notes', 'profile_id', 'purge', 'Staff prose about the participant.'),
    ('push_tokens', 'user_id', 'purge', 'Registered participant devices.'),
    ('push_deliveries', 'recipient_id', 'purge', 'Per-device notification delivery history.'),
    ('custom_notification_group_members', 'participant_id', 'purge', 'Curated notification membership.'),
    ('terms_acceptances', 'profile_id', 'purge', 'Participant consent records.'),
    ('deletion_requests', 'profile_id', 'purge', 'Participant erasure requests.'),
    ('invites', 'accepted_by', 'purge', 'The invitation that admitted the participant.'),
    ('entity_invitations', 'profile_id', 'purge', 'The invitation that admitted an entity collaborator.'),
    ('equipment_deliveries', 'profile_id', 'purge', 'Participant equipment history.'),
    ('event_signups', 'player_id', 'purge', 'Participant event activity.'),
    ('attendance', 'player_id', 'purge', 'Participant attendance history.'),
    ('service_interests', 'user_id', 'purge', 'Participant service interests.'),
    ('conversations', 'user_id', 'purge', 'Participant direct correspondence.'),
    ('messages', 'sender_id', 'purge', 'Participant-authored messages.'),
    ('conversation_read_states', 'user_id', 'purge', 'Participant message read history.'),
    ('conversation_assignment_history', 'user_id', 'purge', 'Participant conversation handling history.'),
    ('forum_posts', 'author_id', 'purge', 'Participant-authored forum posts.'),
    ('forum_replies', 'author_id', 'purge', 'Participant-authored forum replies.'),
    ('forum_flags', 'flagger_id', 'purge', 'Participant safety reports and optional comments.'),
    ('media_items', 'uploaded_by', 'purge', 'Participant gallery media and its consent record.'),
    ('entity_referrals', 'referred_profile_id', 'purge', 'Referral intake cascades with the linked participant.'),
    ('referral_updates', 'author_id', 'purge', 'Referral updates authored by the participant.'),
    ('mentoring_requests', 'player_id', 'purge', 'Private support requests belonging to the player.'),
    ('mentoring_notification_events', 'recipient_id', 'purge', 'Technical mentoring schedule notifications.'),
    ('feedback_submissions', 'author_id', 'purge', 'Encrypted feedback and its private attachment key.'),
    ('survey_responses', 'player_id', 'purge', 'Attributed encrypted survey responses.'),
    ('audit_log', 'actor_id', 'purge', 'Rows where the participant acted.'),
    ('audit_log', 'target_id', 'retain', 'Opaque lawful-access and erasure record.'),
    ('entity_referrals', null, 'retain_limited', 'Unlinked referral intake is purged after 24 months.'),
    ('entity_invitations', null, 'retain_limited', 'Expired entity invitations are purged after 24 months.'),
    ('notification_templates', null, 'not_personal', 'Organization-owned notification copy.'),
    ('custom_notification_groups', null, 'not_personal', 'Organization-owned audience definitions.'),
    ('targeted_notification_sends', null, 'not_personal', 'Aggregate organization send history.'),
    ('surveys', null, 'not_personal', 'Organization-owned survey definitions.'),
    ('survey_questions', null, 'not_personal', 'Organization-owned survey questions.'),
    ('staff_invitations', null, 'not_personal', 'Organization staff access administration history.'),
    ('internal_documents', null, 'not_personal', 'Organization-owned private operational documents.'),
    ('announcements', null, 'not_personal', 'Organization-owned operational content.'),
    ('event_categories', null, 'not_personal', 'Organization-owned event vocabulary.'),
    ('events', null, 'not_personal', 'Organization-owned schedules.'),
    ('event_occurrences', null, 'not_personal', 'Materialized organization schedules.'),
    ('knowledge_categories', null, 'not_personal', 'Organization-owned knowledge vocabulary.'),
    ('knowledge_articles', 'author_id', 'purge', 'Participant-authored knowledge stories.'),
    ('push_publications', 'recipient_id', 'purge', 'Recipient-specific push publications.'),
    ('service_categories', null, 'not_personal', 'Organization-owned service vocabulary.'),
    ('services', null, 'not_personal', 'Organization-owned directory content.'),
    ('service_images', null, 'not_personal', 'Organization-owned service media.'),
    ('service_submission_comments', null, 'not_personal', 'Organization review correspondence.'),
    ('service_submission_notifications', null, 'not_personal', 'Organization staff queue.'),
    ('forum_categories', null, 'not_personal', 'Organization-owned forum vocabulary.'),
    ('collaborating_entities', null, 'not_personal', 'A tenant-owned partner organization.'),
    ('organizations', null, 'not_personal', 'A tenant, not a person.'),
    ('municipality_catalog', null, 'not_personal', 'Official geography with no participant data.'),
    ('permissions', null, 'not_personal', 'The product permission catalog.'),
    ('permission_preset_defaults', null, 'not_personal', 'Product default permissions of the built-in presets.'),
    ('permission_presets', null, 'not_personal', 'Organization-owned access presets.'),
    ('permission_preset_permissions', null, 'not_personal', 'Organization-owned access presets.'),
    ('team_member_access', null, 'not_personal', 'Team access administration; players never hold permissions.'),
    ('team_member_permissions', null, 'not_personal', 'Team access administration; players never hold permissions.'),
    ('equipment_item_types', null, 'not_personal', 'The organization''s material catalog.'),
    ('stock_movements', 'participant_id', 'purge', 'Stock movements keep their quantity so stock stays right; her link is cleared by ON DELETE SET NULL.'),
    ('stock_alerts', null, 'not_personal', 'Stock that went below zero, for the team to count.'),
    ('equipment_arrivals', null, 'not_personal', 'Goods received: source, problems and cost. No participant data.'),
    ('equipment_arrival_photos', null, 'not_personal', 'Photos of goods received and their receipts.'),
    ('stock_counts', null, 'not_personal', 'Stock counts: what was expected and what was on the shelf.'),
    ('staff_checkouts', null, 'not_personal', 'Material lent to a staff member for a trip or an event.'),
    ('photo_handoffs', null, 'not_personal', 'A staff member''s request to take a document photo with the phone.'),
    ('profile_answers', 'profile_id', 'purge', 'Which intake questions were answered, and by whom.')
  ) as disposition(table_name, participant_column, disposition, reason);
$function$;
