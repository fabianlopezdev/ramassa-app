-- Player invitations create the player's account (RAPP-227), and the
-- access-code account path is removed (RAPP-224).
--
-- WHY THE INVITATION CREATES THE ACCOUNT
--
-- Players request their sign-in code with `shouldCreateUser: false`, so the
-- auth server refuses any address that has no account. An invitation used to
-- write only a row in `public.invites`; an invited player then asked for a code
-- and was refused ("Signups not allowed for otp"). The access-code account was
-- the only path that created a player account, and the app stopped accepting
-- codes in RAPP-140, so no new player could join.
--
-- Staff and entity invitations already create the auth identity in Postgres
-- (ADR-022). A player invitation now does the same, with one difference: it
-- creates the auth account only. Her profile is still written by the onboarding
-- wizard, because the consent in it is hers to give. `profiles.auth_method`
-- stays for now and only ever holds 'magic_link'; RAPP-211 drops it while it
-- rewrites the functions that write it.
--
-- WHY THE INVITATION CARRIES THE REFERRAL
--
-- A partner entity's referral was completed only by the access-code path,
-- because that path had a profile id at hand. An invited player has no profile
-- until she finishes the wizard, so the invitation remembers the referral and
-- `spend_pending_invite` links it the moment her profile exists.

-- The access-code account path ------------------------------------------------

drop function public.create_participant_account(jsonb);
drop function public.reset_participant_password(uuid);
drop function public.unambiguous_token(integer);

-- The referral an invitation carries ---------------------------------------------

alter table public.invites
  add column referral_id uuid,
  add constraint invites_referral_tenant_fkey
    foreign key (org_id, referral_id)
    references public.entity_referrals (org_id, id)
    on delete set null (referral_id);

create index invites_referral_id_idx on public.invites (referral_id)
  where referral_id is not null;

comment on column public.invites.referral_id is 'The pending partner-entity referral this invitation answers, if any. Linked to her profile by spend_pending_invite when the wizard creates it.';

-- Sending an invitation -------------------------------------------------------------

create or replace function public.create_participant_invite(payload jsonb)
returns table (invite_id uuid, email text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid;
  email_value text := lower(btrim(payload ->> 'email'));
  reference_entity_value text := nullif(btrim(payload ->> 'reference_entity'), '');
  referral_value uuid := nullif(btrim(payload ->> 'referral_id'), '')::uuid;
  account_id uuid;
  new_invite_id uuid;
  invite_expires_at timestamptz := now() + interval '30 days';
begin
  if not (select public.is_staff_or_admin()) then
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
    jsonb_build_object('reference_entity', reference_entity_value, 'referral_id', referral_value)
  );

  return query select new_invite_id, email_value, invite_expires_at;
end;
$$;

comment on function public.create_participant_invite is 'Invites a player by email: creates her empty auth account so her first sign-in code request succeeds, and records a 30-day invitation with an optional referring-entity prefill and pending referral. Staff only, audited, rate-limited.';

-- Spending it -------------------------------------------------------------------------

create or replace function public.spend_pending_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_email text;
begin
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

comment on function public.spend_pending_invite is 'Marks any pending invitation for a new profile owner address as accepted, and links the referral the newest one carries to her profile.';
