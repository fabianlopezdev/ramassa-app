-- Entity answers land on her Fitxa fields when staff invite her (RAPP-652).
--
-- WHY
--
-- The entity referral form is now composed from the Fitxa de la jugadora
-- (RAPP-649): staff place fields on the surface `entity_form`, each required
-- or not there. Until now the answers an entity gave to Ramassà's own fields
-- waited in `referral_custom_answers` until she finished her onboarding (the
-- trigger on `entity_referrals.referred_profile_id`), and were copied there
-- with a direct insert that skipped `private.write_custom_answer`. So her
-- onboarding, planned while she is still an invited profile, asked her again
-- what the entity had already said, and the copy did not go through the one
-- writer that tidies, checks and encrypts an answer.
--
-- WHAT THIS MIGRATION DOES
--
--   1. private.adopt_referral_answers(referral, profile): writes every answer
--      the entity gave to a field through private.write_custom_answer with
--      source 'entity' (so a Sensible answer is encrypted there), keeps an
--      answer she or the team already gave, skips one that no longer fits its
--      field, empties the referral's copy and audits the field ids.
--   2. create_participant_invite calls it as soon as her profile exists, next
--      to the built-in answers it already copied: the answers are hers from
--      the invitation on, and her onboarding treats them as answered (Auto
--      skips them, Ask shows them to confirm). The trigger at the end of her
--      onboarding calls it too, for a referral linked without an invitation.
--   3. referral_answer_keys also names the fields the entity answered, so the
--      invitation's last step counts them as answered.
--   4. create_entity_referral takes the field answers in the same call
--      (`fields`) and refuses a referral that leaves out a field the form
--      marks required. The older two-step client sends no `fields`; only its
--      built-in required fields are checked.
--   5. The form's limits: a built-in field goes on the entity form only when
--      the form can ask it (the twelve it asks today), and her first and last
--      name never leave it and stay required, because a referral names her.

-- 1. Adopting the entity's answers -----------------------------------------------------------------

create or replace function private.entity_form_always_asked()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['first_name', 'last_name']::text[];
$$;

revoke all on function private.entity_form_always_asked() from public, anon, authenticated;

create or replace function private.adopt_referral_answers(p_referral_id uuid, p_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  answer record;
  question public.custom_questions;
  adopted uuid[] := '{}';
  skipped integer := 0;
  referral_org uuid;
  actor uuid := (select auth.uid());
begin
  select org_id into referral_org from public.entity_referrals where id = p_referral_id;
  if referral_org is null or p_profile_id is null then
    return 0;
  end if;
  for answer in
    select r.question_id, (public.decrypt_field(r.value_encrypted))::jsonb as value
      from public.referral_custom_answers r
     where r.referral_id = p_referral_id
  loop
    select * into question from public.custom_questions q
     where q.id = answer.question_id and q.org_id = referral_org;
    -- What she or the team already answered stays: a later surface asks again
    -- only through her per-player choice.
    if question.id is null or exists (
         select 1 from public.custom_answers a
          where a.profile_id = p_profile_id and a.question_id = question.id
            and (a.season_id is null or a.season_id = private.current_season_id(referral_org))) then
      skipped := skipped + 1;
      continue;
    end if;
    begin
      perform private.write_custom_answer(p_profile_id, question, answer.value, 'entity');
      adopted := adopted || question.id;
    exception when check_violation or insufficient_privilege then
      -- An option archived since, or a seasonal field with no season: the
      -- referral keeps no copy either way.
      skipped := skipped + 1;
    end;
  end loop;
  delete from public.referral_custom_answers where referral_id = p_referral_id;
  -- Field ids only, never an answer. A row written with nobody signed in (a
  -- seed, a migration) has no actor to name.
  if actor is not null and (cardinality(adopted) > 0 or skipped > 0) then
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
    values (referral_org, actor, 'intake.entity_answers_adopted', 'entity_referral', p_referral_id,
            jsonb_build_object('profile_id', p_profile_id, 'fields', to_jsonb(adopted), 'skipped', skipped));
  end if;
  return cardinality(adopted);
end;
$$;

comment on function private.adopt_referral_answers(uuid, uuid) is
  'Writes the answers an entity gave to her Fitxa fields onto her profile with source entity, through write_custom_answer (RAPP-652).';

revoke all on function private.adopt_referral_answers(uuid, uuid) from public, anon, authenticated;

create or replace function private.adopt_referral_custom_answers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.adopt_referral_answers(new.id, new.referred_profile_id);
  return new;
end;
$$;

revoke all on function private.adopt_referral_custom_answers() from public, anon, authenticated;

-- 2. Saving the field answers of a referral ------------------------------------------------------------

create or replace function private.save_referral_field_answers(
  p_referral public.entity_referrals,
  p_answers jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry record;
  question public.custom_questions;
  tidied jsonb;
begin
  if jsonb_typeof(p_answers) <> 'object' then
    raise check_violation using message = 'answers must be an object';
  end if;
  for entry in select key, value from jsonb_each(p_answers) loop
    select * into question from public.custom_questions q
     where q.id::text = entry.key and q.org_id = p_referral.org_id and not q.is_archived
       and 'entity_form' = any (q.placements);
    if question.id is null then
      raise insufficient_privilege using message = 'not a question of the referral form';
    end if;
    if private.custom_answer_is_empty(entry.value) then
      delete from public.referral_custom_answers
       where referral_id = p_referral.id and question_id = question.id;
      continue;
    end if;
    tidied := private.custom_answer_tidied(question.question_type, entry.value);
    if not private.custom_answer_valid(question, tidied) then
      raise check_violation using message = 'the answer does not fit the question';
    end if;
    insert into public.referral_custom_answers (referral_id, question_id, org_id, value_encrypted)
    values (p_referral.id, question.id, p_referral.org_id, public.encrypt_field(tidied::text))
    on conflict (referral_id, question_id) do update set value_encrypted = excluded.value_encrypted;
  end loop;
end;
$$;

revoke all on function private.save_referral_field_answers(public.entity_referrals, jsonb)
  from public, anon, authenticated;

create or replace function public.save_referral_custom_answers(p_referral_id uuid, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  referral public.entity_referrals;
begin
  select * into referral from public.entity_referrals where id = p_referral_id;
  if referral.id is null or referral.entity_user_id <> actor or referral.referred_profile_id is not null then
    raise insufficient_privilege using message = 'only the entity that sent the referral adds its answers';
  end if;
  perform private.save_referral_field_answers(referral, p_answers);
end;
$$;

revoke all on function public.save_referral_custom_answers(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_referral_custom_answers(uuid, jsonb) to authenticated;

-- 3. The required fields of the entity form ---------------------------------------------------------

-- The referral payload key of each built-in field the entity form asks.
create or replace function private.entity_form_payload_key(p_builtin_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_builtin_key
    when 'first_name' then 'firstName'
    when 'last_name' then 'lastName'
    when 'phone' then 'phone'
    when 'date_of_birth' then 'dateOfBirth'
    when 'nationality' then 'nationality'
    when 'document' then 'documentType'
    when 'city' then 'city'
    when 'applicant_status' then 'applicantStatus'
    when 'supporting_entities' then 'supportingEntities'
    when 'reference_contact_name' then 'referenceContactName'
    when 'childcare_need' then 'childcareNeed'
    when 'specific_needs' then 'specificNeeds'
  end;
$$;

revoke all on function private.entity_form_payload_key(text) from public, anon, authenticated;

create or replace function private.check_entity_form_required(
  p_referral public.entity_referrals,
  p_payload jsonb
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  item record;
  payload_key text;
  has_fields boolean := p_payload ? 'fields';
  is_missing boolean;
begin
  for item in
    select f.id, f.kind, f.builtin_key, f.show_when_field_id, f.show_when_option_id
      from public.field_placements p
      join public.profile_fields f on f.id = p.field_id
     where p.org_id = p_referral.org_id and p.surface = 'entity_form' and p.required
       and not f.is_archived
  loop
    is_missing := false;
    if item.kind = 'builtin' then
      payload_key := private.entity_form_payload_key(item.builtin_key);
      is_missing := payload_key is not null
        and private.custom_answer_is_empty(p_payload -> payload_key);
    elsif has_fields then
      -- A condition that does not apply asks nothing.
      if item.show_when_field_id is not null
         and (p_payload -> 'fields' ->> item.show_when_field_id::text)
             is distinct from item.show_when_option_id::text then
        continue;
      end if;
      is_missing := not exists (
        select 1 from public.referral_custom_answers r
         where r.referral_id = p_referral.id and r.question_id = item.id);
    end if;
    if is_missing then
      raise check_violation using message = 'a required field of the referral form is missing';
    end if;
  end loop;
end;
$$;

revoke all on function private.check_entity_form_required(public.entity_referrals, jsonb)
  from public, anon, authenticated;

-- 4. The fields the referral answered, for the invitation's last step ------------------------------------

create or replace function public.referral_answer_keys(p_referral_id uuid)
returns setof text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  answers jsonb;
begin
  if not (select public.has_permission('participants.invite')) then
    raise insufficient_privilege using message = 'reading a referral to invite her needs participants.invite';
  end if;

  select coalesce(public.decrypt_field(referral.intake_answers)::jsonb, '{}'::jsonb)
         || coalesce(jsonb_build_object('phone', public.decrypt_field(referral.referred_phone)), '{}'::jsonb)
    into answers
    from public.entity_referrals referral
   where referral.id = p_referral_id
     and referral.org_id = (select public.current_org_id())
     and referral.status = 'pending';
  if answers is null then
    return;
  end if;

  -- Her profile keys, then the ids of the Fitxa fields the entity answered
  -- (RAPP-652). Which fields, never the answers.
  return query
    select keys.key from (
      select entry.key
        from jsonb_each(jsonb_strip_nulls(answers)) entry
       where not (jsonb_typeof(entry.value) = 'string' and btrim(entry.value #>> '{}') = '')
         and not (jsonb_typeof(entry.value) = 'array' and jsonb_array_length(entry.value) = 0)
      union all
      select r.question_id::text
        from public.referral_custom_answers r
        join public.profile_fields f on f.id = r.question_id and not f.is_archived
       where r.referral_id = p_referral_id
    ) keys
    order by keys.key;
end;
$$;

-- 5. Recreated with the changes named above ------------------------------------------------------------


CREATE OR REPLACE FUNCTION public.create_participant_invite(payload jsonb)
 RETURNS TABLE(invite_id uuid, email text, expires_at timestamp with time zone, profile_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  first_name_value text := nullif(private.name_trim(payload ->> 'first_name'), '');
  last_name_value text := nullif(private.name_trim(payload ->> 'last_name'), '');
  creates_profile boolean;
  -- A test player (RAPP-615): only a team member sets this, here, at creation.
  test_account_value boolean := coalesce((payload ->> 'is_test_account')::boolean, false);
  -- A caller who creates test players only must not learn whether an address
  -- belongs to a real person: every refusal of the address is the same one.
  test_players_only boolean := not (select public.has_permission('participants.invite'));
  -- What staff confirmed her wizard asks (RAPP-618): Ask and Don't ask only.
  question_states_value jsonb := nullif(payload -> 'question_states', '{}'::jsonb);
  -- The keys that are hers to answer, without the invitation's own fields.
  prefill_payload jsonb := payload - 'email' - 'referral_id' - 'is_test_account' - 'question_states';
begin
  -- participants.invite creates any player. test_players.manage creates test
  -- players only, so for a caller who holds just that the option is forced on.
  if not (select public.has_permission('participants.invite'))
    and not (test_account_value and (select public.has_permission('test_players.manage')))
  then
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
    if test_players_only then
      raise exception 'this address cannot be used for a test player'
        using errcode = 'invalid_parameter_value';
    end if;
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

  -- The question states belong to her profile, so they need her name.
  if question_states_value is not null and not creates_profile then
    raise exception 'the questions she is asked need her first and last name'
      using errcode = 'invalid_parameter_value';
  end if;

  -- The flag lives on her profile, so a test player always has one. She is
  -- made up, so she carries no real referral.
  if test_account_value and not creates_profile then
    raise exception 'a test player needs her first and last name'
      using errcode = 'invalid_parameter_value';
  end if;
  if test_account_value and referral_value is not null then
    raise exception 'a test player cannot answer a referral'
      using errcode = 'invalid_parameter_value';
  end if;

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

  -- The same refusal whether the address has a profile, an account only, or
  -- is malformed, so the design role cannot test whether a real person is
  -- registered (RAPP-615).
  if test_players_only and account_id is not null then
    raise exception 'this address cannot be used for a test player'
      using errcode = 'invalid_parameter_value';
  end if;

  if account_id is not null
    and exists (select 1 from public.profiles profile where profile.id = account_id)
  then
    raise exception 'this address already belongs to an account'
      using errcode = 'unique_violation';
  end if;

  -- A test player is always a new account: an address that already has one
  -- may be a real woman's (an email-only invitation has no profile yet), and
  -- a test player can be deleted outright (RAPP-617).
  if test_account_value and account_id is not null then
    raise exception 'a test player needs an address that has no account yet'
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
    insert into public.profiles (id, org_id, role, first_name, last_name, preferred_language, is_test_account)
    values (
      account_id, actor_org, 'invited', first_name_value, last_name_value,
      coalesce((select o.locked_default_language from public.organizations o where o.id = actor_org), 'ca'),
      test_account_value
    );
    perform private.apply_profile_prefill(account_id, prefill_payload, 'staff');

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
        - array(select jsonb_object_keys(prefill_payload));
      if entity_answers <> '{}'::jsonb then
        perform private.apply_profile_prefill(account_id, entity_answers, 'entity');
      end if;
      -- Her Fitxa fields the entity answered (RAPP-652) land on her profile now,
      -- through the one writer that encrypts Sensible answers, so her
      -- onboarding plans with them from the start.
      perform private.adopt_referral_answers(referral_value, account_id);
      update public.entity_referrals
         set intake_answers = null, referred_phone = null, referred_email = null, updated_at = now()
       where id = referral_value;
    end if;

    -- The questions staff confirmed before inviting her (RAPP-618), checked
    -- and audited as on her page (RAPP-301). Any refusal undoes the whole
    -- invitation: account, profile and invite.
    if question_states_value is not null then
      if not (select private.participant_permission(account_id, 'participants.view_personal')) then
        raise exception 'choosing her questions needs participants.view_personal'
          using errcode = 'insufficient_privilege';
      end if;
      perform private.apply_intake_question_states(account_id, question_states_value, actor, actor_org);
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
      'profile_created', creates_profile,
      'test_account', test_account_value,
      'question_states', question_states_value is not null
    )
  );

  -- Her profile id, so staff can open her record and complete it; null for
  -- an email-only invitation, which creates no profile.
  return query select new_invite_id, email_value, invite_expires_at,
    case when creates_profile then account_id end;
end;
$function$;

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
  referral public.entity_referrals;
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
      'childcareNeed', 'specificNeeds', 'consentConfirmed', 'fields'
    ] <> '{}'::jsonb
    or (p_payload ? 'fields' and jsonb_typeof(p_payload -> 'fields') <> 'object')
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
  returning * into referral;
  result := referral.id;

  -- Her Fitxa fields placed on the form (RAPP-652), saved in the same call so
  -- a referral is never left without them. A client of the older two-step
  -- shape sends none and saves them with save_referral_custom_answers.
  if p_payload ? 'fields' then
    perform private.save_referral_field_answers(referral, p_payload -> 'fields');
  end if;
  perform private.check_entity_form_required(referral, p_payload);

  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.place_field(p_field_id uuid, p_surface text, p_screen_key text DEFAULT NULL::text, p_required boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := private.require_question_builder();
  field public.profile_fields;
  saved_id uuid;
begin
  select * into field from public.profile_fields where id = p_field_id and org_id = actor_org and not is_archived;
  if field.id is null then
    raise no_data_found using message = 'no such question';
  end if;
  if p_surface is null or p_surface not in ('onboarding', 'entity_form', 'season') then
    raise check_violation using message = 'a field is placed on onboarding, the entity form or the season';
  end if;
  if field.kind = 'builtin' and p_surface <> 'entity_form' then
    raise check_violation using message = 'the app asks a built-in field on its own screen';
  end if;
  if p_surface = 'onboarding' then
    if p_screen_key is null or not (
         exists (select 1 from private.wizard_screen_questions() w where w.screen = p_screen_key)
         or (private.is_uuid_text(p_screen_key)
             and exists (select 1 from public.intake_screens s
                          where s.id = p_screen_key::uuid and s.org_id = actor_org
                            and s.builtin_screen is null and not s.is_archived))) then
      raise no_data_found using message = 'no such screen';
    end if;
  elsif p_screen_key is not null then
    raise check_violation using message = 'only an onboarding placement names a screen';
  end if;
  if field.kind = 'builtin' and p_surface = 'entity_form'
     and not (field.builtin_key = any (private.builtin_entity_form_fields())) then
    raise check_violation using message = 'the entity form does not ask this built-in field';
  end if;
  if field.question_type in ('file_upload', 'signature') and p_surface = 'entity_form' then
    raise check_violation using message = 'a file or a signature is asked of her only';
  end if;
  if exists (select 1 from public.field_placements where field_id = p_field_id and surface = p_surface) then
    raise unique_violation using message = 'the field is already asked there';
  end if;

  insert into public.field_placements (org_id, field_id, surface, screen_key, sort_order, required)
  values (actor_org, p_field_id, p_surface, p_screen_key,
          coalesce((select max(p.sort_order) + 1 from public.field_placements p
                     where p.org_id = actor_org and p.surface = p_surface
                       and p.screen_key is not distinct from p_screen_key), 0),
          coalesce(p_required, field.default_required))
  returning id into saved_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.field_place', 'profile_field', p_field_id,
          jsonb_build_object('placement_id', saved_id, 'surface', p_surface, 'screen', p_screen_key));
  return saved_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_placement(p_placement_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := private.require_question_builder();
  placement public.field_placements;
begin
  select p.* into placement from public.field_placements p where p.id = p_placement_id and p.org_id = actor_org;
  if placement.id is null then
    raise no_data_found using message = 'no such placement';
  end if;
  if placement.surface <> 'entity_form'
     and exists (select 1 from public.profile_fields where id = placement.field_id and kind = 'builtin') then
    raise check_violation using message = 'the app asks a built-in field on its own screen';
  end if;
  -- A referral names her: the entity form always asks her names (RAPP-652).
  if placement.surface = 'entity_form'
     and exists (select 1 from public.profile_fields where id = placement.field_id
                    and builtin_key = any (private.entity_form_always_asked())) then
    raise check_violation using message = 'the entity form always asks her names';
  end if;
  delete from public.field_placements where id = p_placement_id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.placement_remove', 'profile_field', placement.field_id,
          jsonb_build_object('placement_id', p_placement_id, 'surface', placement.surface,
                             'screen', placement.screen_key));
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_placement(p_placement_id uuid, p_required boolean, p_label_override jsonb DEFAULT NULL::jsonb, p_help_override jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_org uuid := private.require_question_builder();
  placement public.field_placements;
  field public.profile_fields;
  clean_label jsonb := nullif(nullif(p_label_override, 'null'::jsonb), '{}'::jsonb);
  clean_help jsonb := nullif(nullif(p_help_override, 'null'::jsonb), '{}'::jsonb);
  new_required boolean;
begin
  select p.* into placement from public.field_placements p where p.id = p_placement_id and p.org_id = actor_org;
  if placement.id is null then
    raise no_data_found using message = 'no such placement';
  end if;
  select * into field from public.profile_fields where id = placement.field_id;
  if (clean_label is not null and not private.localized_text_valid(clean_label))
     or (clean_help is not null and not private.localized_text_valid(clean_help)) then
    raise check_violation using message = 'a wording is text in the five languages';
  end if;
  new_required := coalesce(p_required, placement.required);
  if field.kind = 'builtin' and placement.surface <> 'entity_form' then
    if new_required is distinct from placement.required then
      perform public.save_builtin_question_required(field.builtin_key, new_required);
    end if;
    new_required := field.builtin_key = any (private.required_intake_questions(actor_org));
  end if;
  if placement.surface = 'entity_form' and field.builtin_key = any (private.entity_form_always_asked()) then
    new_required := true;
  end if;
  update public.field_placements
     set required = new_required, label_override = clean_label, help_override = clean_help, updated_at = now()
   where id = p_placement_id;
  -- The field names only: the wording is in the row.
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.placement_save', 'profile_field', placement.field_id,
          jsonb_build_object('placement_id', p_placement_id, 'surface', placement.surface,
                             'required', new_required,
                             'label_override', coalesce((select jsonb_agg(k order by k) from jsonb_object_keys(clean_label) k), '[]'::jsonb),
                             'help_override', coalesce((select jsonb_agg(k order by k) from jsonb_object_keys(clean_help) k), '[]'::jsonb)));
end;
$function$;
