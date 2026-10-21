-- Staff confirm what her guided registration asks while creating her (RAPP-618).
--
-- WHY
--
-- The Auto / Ask / Don't ask choice per question (RAPP-301) was only on her
-- page, after the invitation existed. Staff now confirm it as the last step of
-- creating her, on the web and on the phone, and when they accept an entity's
-- referral. Saving must create the invitation and the choices together: if a
-- choice is refused, nothing of the invitation remains.
--
-- WHAT THIS MIGRATION DOES
--
--   1. `private.apply_intake_question_states`: the checks, the writes and the
--      audit row of `set_intake_question_states`, unchanged, in one place.
--   2. `set_intake_question_states` and `participant_question_states` call it
--      and use `private.participant_permission`, so the design role sets the
--      questions of a test player (RAPP-615) and of no real one. Her rows are
--      readable the same way.
--   3. `create_participant_invite` accepts `question_states` in its payload and
--      applies it, after staff's and the entity's answers, in its own
--      transaction. The audit row of the invitation says whether it carried
--      choices; the choices themselves are audited as on her page.
--   4. `referral_answer_keys`: which of her profile fields a pending referral
--      answers, never their values, so the preview of a referral acceptance
--      counts the same answers the invitation will record.

-- 1. The shared checks and writes ------------------------------------------------------------------

create or replace function private.apply_intake_question_states(
  p_profile_id uuid,
  p_states jsonb,
  p_actor uuid,
  p_org_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry record;
  old_state text;
  changes jsonb := '{}'::jsonb;
begin
  if p_states is null or jsonb_typeof(p_states) <> 'object' then
    raise invalid_parameter_value using message = 'question states are an object';
  end if;

  for entry in select key as question, value as state from jsonb_each_text(p_states) loop
    if not (entry.question = any (private.wizard_intake_questions())) then
      raise invalid_parameter_value using message = 'unknown question ' || entry.question;
    end if;
    if entry.state is null or entry.state not in ('auto', 'ask', 'skip') then
      raise invalid_parameter_value using message = 'unknown state ' || coalesce(entry.state, 'null');
    end if;
    if entry.state = 'skip'
      and entry.question = any (private.required_intake_questions())
      and not exists (
        select 1 from public.profile_answers a
         where a.profile_id = p_profile_id and a.question = entry.question
      )
    then
      raise check_violation
        using message = 'a required question needs an answer before it can be hidden: ' || entry.question;
    end if;

    select s.state into old_state from public.intake_question_states s
     where s.profile_id = p_profile_id and s.question = entry.question;
    old_state := coalesce(old_state, 'auto');
    continue when old_state = entry.state;

    if entry.state = 'auto' then
      delete from public.intake_question_states s
       where s.profile_id = p_profile_id and s.question = entry.question;
    else
      insert into public.intake_question_states (profile_id, org_id, question, state, updated_by)
      values (p_profile_id, p_org_id, entry.question, entry.state, p_actor)
      on conflict (profile_id, question) do update
        set state = excluded.state, updated_at = now(), updated_by = excluded.updated_by;
    end if;
    changes := changes || jsonb_build_object(
      entry.question, jsonb_build_object('old', old_state, 'new', entry.state));
  end loop;

  if changes <> '{}'::jsonb then
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
    values (p_org_id, p_actor, 'profile.intake_questions_update', 'profile', p_profile_id, changes);
  end if;
end;
$$;

revoke all on function private.apply_intake_question_states(uuid, jsonb, uuid, uuid)
  from public, anon, authenticated;

-- 2. Her page, for staff and for the design role on a test player ---------------------------------

create or replace function public.participant_question_states(p_profile_id uuid)
returns table (question text, state text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view_personal')) then
    raise insufficient_privilege using message = 'reading question states needs participants.view_personal';
  end if;
  return query
    select s.question, s.state
      from public.intake_question_states s
     where s.profile_id = p_profile_id
       and s.org_id = (select public.current_org_id())
     order by s.question;
end;
$$;

create or replace function public.set_intake_question_states(p_profile_id uuid, p_states jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
  target public.profiles;
begin
  if not (select private.participant_permission(p_profile_id, 'participants.view_personal')) then
    raise insufficient_privilege using message = 'setting question states needs participants.view_personal';
  end if;

  select * into target from public.profiles p
   where p.id = p_profile_id and p.org_id = actor_org
   for update;
  if target.id is null then
    raise insufficient_privilege using message = 'no participant of this organization';
  end if;
  -- Read-only once she has joined: the wizard is behind her.
  if target.role <> 'invited' then
    raise object_not_in_prerequisite_state
      using message = 'question states change only before she joins';
  end if;

  perform private.apply_intake_question_states(p_profile_id, p_states, (select auth.uid()), actor_org);
end;
$$;

-- Written out like profile_answers_select_test_players (RAPP-615) rather than
-- through participant_permission: the per-row call of that helper inside this
-- policy crashed the local Postgres backend (signal 11) in the pgTAP run.
alter policy intake_question_states_select_team on public.intake_question_states
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.has_permission('participants.view_personal'))
      or ((select public.has_permission('test_players.manage')) and private.is_test_player(profile_id))
    )
  );

-- 3. The invitation carries the confirmed questions --------------------------------------------------

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


-- 4. Which fields a pending referral answers ----------------------------------------------------------

-- The keys only: staff without participants.view_sensitive do not read the
-- sensitive answers, yet the preview must count them as answered, as the
-- invitation will. A key is listed when its value is not empty.
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

  return query
    select entry.key
      from jsonb_each(jsonb_strip_nulls(answers)) entry
     where not (jsonb_typeof(entry.value) = 'string' and btrim(entry.value #>> '{}') = '')
       and not (jsonb_typeof(entry.value) = 'array' and jsonb_array_length(entry.value) = 0)
     order by entry.key;
end;
$$;

revoke all on function public.referral_answer_keys(uuid) from public, anon;
grant execute on function public.referral_answer_keys(uuid) to authenticated;
