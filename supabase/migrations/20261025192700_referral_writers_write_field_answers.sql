-- The entity referral form and invitations save answers by field (RAPP-661, D3, D7).
--
-- WHY
--
-- Step 2 of 7 (RAPP-660 to RAPP-666), second half. The previous migration moved
-- her own writers and the team's onto field answers. The entity referral form
-- still kept the app's answers in `entity_referrals.intake_answers`, an
-- encrypted object in her profile's column names, and her phone in
-- `referred_phone`; the invitation copied them onto her profile columns. Now
-- the form saves every answer by field, the app's fields included, and the
-- invitation adopts them as the entity's answers.
--
-- WHAT CHANGES
--
--   1. `create_entity_referral` takes the shared payload: her names
--      (`first_name`, `last_name`) and `answers` by field id, plus the
--      referral's own data (`email`, `documentationStatus`, `notes`,
--      `seasonNumber`, `consentConfirmed`). Every answer lands in
--      `referral_custom_answers`, encrypted, through
--      `private.save_referral_field_answers`, which now takes any field placed
--      on the form but her names.
--   2. Her season count is no field: it stays the one thing `intake_answers`
--      holds (`{"season_number": n}`), read by the invitation.
--   3. The rules read the placements: `private.check_entity_form_required`
--      reads the saved answers (a condition that does not hold asks nothing),
--      and the document rule reads the type and number by their system keys:
--      a type other than `none` needs its number, no type takes it away.
--      `private.entity_form_payload_key`, the map from the app's fields to the
--      old payload keys, goes.
--   4. `create_participant_invite` takes the shared payload too. The team's
--      answers come first; then the entity's answers land on every field the
--      team left empty (`private.adopt_referral_answers`), named after the
--      entity's contact. Conditions and the document rule apply to the result.
--   5. TEMPORARY, until RAPP-666 rewrites the seed: a referral written the old
--      way (the seed, or one sent before this migration) gets its answers by
--      field from `intake_answers` and `referred_phone`, once here and by a
--      trigger when they are written, the way RAPP-660 copies her profile
--      columns.
--
-- Docs: https://www.postgresql.org/docs/17/sql-createtrigger.html (WHEN),
-- https://www.postgresql.org/docs/17/functions-json.html.

-- 1. Reading a referral's answers --------------------------------------------------------------------------

create function private.referral_answer(p_referral_id uuid, p_field_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select (public.decrypt_field(r.value_encrypted))::jsonb
    from public.referral_custom_answers r
   where r.referral_id = p_referral_id and r.question_id = p_field_id;
$$;
revoke all on function private.referral_answer(uuid, uuid) from public, anon, authenticated;

-- 2. Saving them ------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.save_referral_field_answers(p_referral public.entity_referrals, p_answers jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  entry record;
  field public.profile_fields;
  tidied jsonb;
begin
  if jsonb_typeof(p_answers) <> 'object' then
    raise check_violation using message = 'answers must be an object';
  end if;
  for entry in select key, value from jsonb_each(p_answers) loop
    field := null;
    select * into field from public.profile_fields f
     where f.id::text = entry.key and f.org_id = p_referral.org_id and not f.is_archived
       -- Her names are the referral's own columns.
       and f.system_key is distinct from 'first_name' and f.system_key is distinct from 'last_name'
       and exists (select 1 from public.field_placements p
                    where p.field_id = f.id and p.surface = 'entity_form');
    -- Nothing given for a field off the form: nothing to do.
    continue when field.id is null and private.custom_answer_is_empty(entry.value);
    if field.id is null then
      raise insufficient_privilege using message = 'not a question of the referral form';
    end if;
    if private.custom_answer_is_empty(entry.value) then
      delete from public.referral_custom_answers
       where referral_id = p_referral.id and question_id = field.id;
      continue;
    end if;
    tidied := private.custom_answer_tidied(field.question_type, entry.value);
    if not private.custom_answer_valid(field, tidied) then
      raise check_violation using message = 'the answer does not fit the question';
    end if;
    insert into public.referral_custom_answers (referral_id, question_id, org_id, value_encrypted)
    values (p_referral.id, field.id, p_referral.org_id, public.encrypt_field(tidied::text))
    on conflict (referral_id, question_id) do update set value_encrypted = excluded.value_encrypted;
  end loop;
end;
$function$;

-- 3. The rules, from the placements and the fields ---------------------------------------------------------

drop function private.check_entity_form_required(public.entity_referrals, jsonb);
drop function private.entity_form_payload_key(text);

-- Every required field of the form has an answer. Her names are checked with
-- the payload; a condition that does not hold asks nothing.
create function private.check_entity_form_required(p_referral public.entity_referrals)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  item record;
begin
  for item in
    select f.id, f.system_key, f.show_when_field_id, f.show_when_option_id
      from public.field_placements p
      join public.profile_fields f on f.id = p.field_id
     where p.org_id = p_referral.org_id and p.surface = 'entity_form' and p.required
       and not f.is_archived
  loop
    continue when item.system_key in ('first_name', 'last_name');
    continue when item.show_when_field_id is not null
      and private.referral_answer(p_referral.id, item.show_when_field_id)
          is distinct from to_jsonb(item.show_when_option_id::text);
    if private.referral_answer(p_referral.id, item.id) is null then
      raise check_violation using message = 'a required field of the referral form is missing';
    end if;
  end loop;
end;
$$;
revoke all on function private.check_entity_form_required(public.entity_referrals) from public, anon, authenticated;

-- The document rule on a referral, as on her profile: no type, or `none`, takes
-- the number away; any other type needs one.
create function private.apply_referral_document_rule(p_referral public.entity_referrals)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  type_field public.profile_fields;
  number_field public.profile_fields;
  type_answer jsonb;
  type_key text;
begin
  select * into type_field from public.profile_fields f
   where f.org_id = p_referral.org_id and f.system_key = 'document_type';
  select * into number_field from public.profile_fields f
   where f.org_id = p_referral.org_id and f.system_key = 'document_number';
  if type_field.id is null or number_field.id is null
     or type_field.question_type not in ('single_choice', 'search_choice') then
    return;
  end if;
  type_answer := private.referral_answer(p_referral.id, type_field.id);
  select o.key into type_key from public.custom_question_options o
   where o.question_id = type_field.id and to_jsonb(o.id::text) = type_answer;
  if type_answer is null or type_key = 'none' then
    delete from public.referral_custom_answers
     where referral_id = p_referral.id and question_id = number_field.id;
  elsif private.referral_answer(p_referral.id, number_field.id) is null then
    raise check_violation using message = 'a document needs its number';
  end if;
end;
$$;
revoke all on function private.apply_referral_document_rule(public.entity_referrals) from public, anon, authenticated;

-- 4. The entity's form ------------------------------------------------------------------------------------

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
  first_name text := nullif(private.name_trim(p_payload ->> 'first_name'), '');
  last_name text := nullif(private.name_trim(p_payload ->> 'last_name'), '');
  email text := nullif(lower(btrim(p_payload ->> 'email')), '');
  documentation text := p_payload ->> 'documentationStatus';
  referral_notes text := nullif(btrim(p_payload ->> 'notes'), '');
  season_number_value text := nullif(p_payload ->> 'seasonNumber', '');
  answers jsonb := coalesce(nullif(p_payload -> 'answers', 'null'::jsonb), '{}'::jsonb);
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
      'first_name', 'last_name', 'email', 'documentationStatus', 'notes', 'seasonNumber',
      'consentConfirmed', 'answers'
    ] <> '{}'::jsonb
    or jsonb_typeof(answers) <> 'object'
    or first_name is null
    or length(first_name) > 100
    or last_name is null
    or length(last_name) > 100
    or (email is not null and (length(email) > 254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+$'))
    or documentation is null
    or documentation not in ('none', 'missing', 'in_progress', 'complete')
    or (referral_notes is not null and length(referral_notes) > 4000)
    or coalesce(season_number_value not in ('1', '2', '3', '4', '5'), false)
    -- She agreed that the entity shares her data with Ramassà (RAPP-303).
    or (p_payload -> 'consentConfirmed') is distinct from 'true'::jsonb
  then
    raise check_violation using message = 'invalid entity referral payload';
  end if;

  insert into public.entity_referrals (
    org_id,
    entity_user_id,
    collaborating_entity_id,
    referred_first_name,
    referred_last_name,
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
    public.encrypt_field(email),
    documentation,
    public.encrypt_field(referral_notes),
    -- Her season count is no field: the one answer kept on the referral itself.
    case when season_number_value is null then null
         else public.encrypt_field(jsonb_build_object('season_number', season_number_value::integer)::text) end,
    now(),
    actor
  )
  returning * into referral;

  -- Every answer by field, saved in the same call, so a referral is never left
  -- without them. A required one left out refuses the referral below.
  perform private.save_referral_field_answers(referral, answers);
  perform private.apply_referral_document_rule(referral);
  perform private.check_entity_form_required(referral);

  return referral.id;
end;
$function$;

-- 5. Her invitation adopts them ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.adopt_referral_answers(p_referral_id uuid, p_profile_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  answer record;
  field public.profile_fields;
  adopted uuid[] := '{}';
  skipped integer := 0;
  referral_org uuid;
  referrer uuid;
  actor uuid := (select auth.uid());
begin
  select org_id, entity_user_id into referral_org, referrer
    from public.entity_referrals where id = p_referral_id;
  if referral_org is null or p_profile_id is null then
    return 0;
  end if;
  for answer in
    select r.question_id, (public.decrypt_field(r.value_encrypted))::jsonb as value
      from public.referral_custom_answers r
     where r.referral_id = p_referral_id
  loop
    field := null;
    select * into field from public.profile_fields f
     where f.id = answer.question_id and f.org_id = referral_org
       and f.system_key is distinct from 'first_name' and f.system_key is distinct from 'last_name';
    -- What she or the team already answered stays: a later surface asks again
    -- only through her per-player choice.
    if field.id is null or private.field_answer_now(p_profile_id, field) is not null then
      skipped := skipped + 1;
      continue;
    end if;
    begin
      perform private.write_custom_answer(p_profile_id, field, answer.value, 'entity', referrer);
      adopted := adopted || field.id;
    exception when check_violation or insufficient_privilege then
      -- An option archived since, or a seasonal field with no season: the
      -- referral keeps no copy either way.
      skipped := skipped + 1;
    end;
  end loop;
  perform private.clear_hidden_answers(p_profile_id, adopted);
  perform private.apply_document_rule(p_profile_id, false);
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
$function$;

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
  entity_season text;
  referrer uuid;
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
  -- Hers to answer, in the shared payload: names, language, season count and
  -- answers by field. `reference_entity` is the invitation's own: the entity
  -- her wizard offers first.
  prefill_payload jsonb := payload - 'email' - 'referral_id' - 'is_test_account' - 'question_states'
                                   - 'reference_entity';
begin
  -- participants.invite creates any player. test_players.manage creates test
  -- players only, so for a caller who holds just that the option is forced on.
  if not (select public.has_permission('participants.invite'))
    and not (test_account_value and (select public.has_permission('test_players.manage')))
  then
    raise exception 'inviting a participant is a staff action'
      using errcode = 'insufficient_privilege';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object'
     or prefill_payload - array['first_name', 'last_name', 'preferred_language', 'season_number', 'answers']
        <> '{}'::jsonb then
    raise invalid_parameter_value
      using message = 'an invitation takes her address, her names, her settings and her answers by field';
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

    -- From a referral (RAPP-303): the entity's answers fill every field the
    -- team left empty, recorded as given by the entity. The referral then
    -- keeps no copy: her answers live on her profile only.
    if referral_value is not null then
      select (public.decrypt_field(referral.intake_answers)::jsonb) ->> 'season_number', referral.entity_user_id
        into entity_season, referrer
        from public.entity_referrals referral
       where referral.id = referral_value;
      if entity_season is not null and nullif(prefill_payload ->> 'season_number', '') is null then
        perform private.apply_profile_prefill(
          account_id, jsonb_build_object('season_number', entity_season), 'entity', referrer);
      end if;
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

-- 6. TEMPORARY until RAPP-666: referrals written the old way ----------------------------------------------

-- The answers of a referral whose app answers sit in `intake_answers` (her
-- profile's column names) and `referred_phone`, as answers by field. A value
-- that does not fit its field is left out; one already there is kept.
create function private.referral_blob_answers(p_referral public.entity_referrals)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  blob jsonb := jsonb_strip_nulls(
    coalesce(nullif(public.decrypt_field(p_referral.intake_answers), '')::jsonb, '{}'::jsonb)
    || jsonb_build_object('phone', nullif(btrim(public.decrypt_field(p_referral.referred_phone)), '')));
  item record;
  field public.profile_fields;
  given jsonb;
begin
  for item in
    select b.key as system_key, b.value as raw
      from jsonb_each(blob - 'specific_needs' - 'season_number') b
    union all
    select 'specific_needs', n.needs from private.support_needs_parts(blob ->> 'specific_needs') n
    union all
    select 'specific_needs_details', n.details from private.support_needs_parts(blob ->> 'specific_needs') n
  loop
    field := null;
    select * into field from public.profile_fields f
     where f.org_id = p_referral.org_id and f.system_key = item.system_key and not f.is_archived;
    continue when field.id is null or item.raw is null;
    given := private.custom_answer_tidied(field.question_type, private.app_answer_value(field, item.raw));
    continue when private.custom_answer_is_empty(given)
      or not private.custom_answer_value_valid(
               field.question_type, field.settings, given,
               array(select o.id::text from public.custom_question_options o where o.question_id = field.id));
    insert into public.referral_custom_answers (referral_id, question_id, org_id, value_encrypted)
    values (p_referral.id, field.id, p_referral.org_id, public.encrypt_field(given::text))
    on conflict (referral_id, question_id) do nothing;
  end loop;
end;
$$;
revoke all on function private.referral_blob_answers(public.entity_referrals) from public, anon, authenticated;

create function private.mirror_referral_blob_answers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.referral_blob_answers(new);
  return null;
end;
$$;
revoke all on function private.mirror_referral_blob_answers() from public, anon, authenticated;

create trigger entity_referrals_temporary_blob_answers
  after insert or update of intake_answers, referred_phone on public.entity_referrals
  for each row
  when (new.intake_answers is not null or new.referred_phone is not null)
  execute function private.mirror_referral_blob_answers();
comment on trigger entity_referrals_temporary_blob_answers on public.entity_referrals is
  'TEMPORARY (RAPP-661): a referral written with the old answer object gets its answers by field. RAPP-666 drops it with the seed rewrite.';

do $$
declare
  referral public.entity_referrals;
begin
  for referral in
    select * from public.entity_referrals r
     where r.status = 'pending' and (r.intake_answers is not null or r.referred_phone is not null)
  loop
    perform private.referral_blob_answers(referral);
  end loop;
end;
$$;
