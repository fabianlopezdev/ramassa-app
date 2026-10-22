-- Creating a test player never confirms that a real person has an account (RAPP-615).
--
-- WHY
--
-- A caller who may create test players only (test_players.manage, without
-- participants.invite) got "this address already belongs to an account" for a
-- real player's address, and "a test player needs an address that has no
-- account yet" for an email-only invitation. Each answer confirmed that a
-- real person is registered.
--
-- WHAT THIS MIGRATION DOES
--
-- For that caller, a malformed address, an address with a profile and an
-- address with an account only all get one refusal: errcode 22023,
-- "this address cannot be used for a test player". Staff with
-- participants.invite still learn that the address is in use (23505), so they
-- can find her in the list. The hourly invitation limit (30) still counts
-- every attempt, before the account lookup.
--
-- Residual: a free address succeeds and a used one is refused, so a caller can
-- still tell the two apart one attempt at a time, within the hourly limit.

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
  first_name_value text := nullif(btrim(payload ->> 'first_name'), '');
  last_name_value text := nullif(btrim(payload ->> 'last_name'), '');
  creates_profile boolean;
  -- A test player (RAPP-615): only a team member sets this, here, at creation.
  test_account_value boolean := coalesce((payload ->> 'is_test_account')::boolean, false);
  -- A caller who creates test players only must not learn whether an address
  -- belongs to a real person: every refusal of the address is the same one.
  test_players_only boolean := not (select public.has_permission('participants.invite'));
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
    perform private.apply_profile_prefill(
      account_id, payload - 'email' - 'referral_id' - 'is_test_account', 'staff');

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
        - array(select jsonb_object_keys(payload - 'email' - 'referral_id' - 'is_test_account'));
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
      'profile_created', creates_profile,
      'test_account', test_account_value
    )
  );

  -- Her profile id, so staff can open her record and complete it; null for
  -- an email-only invitation, which creates no profile.
  return query select new_invite_id, email_value, invite_expires_at,
    case when creates_profile then account_id end;
end;
$function$;
