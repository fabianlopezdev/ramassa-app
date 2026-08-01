-- Staff creating an account for a participant who has no email, and resetting
-- its password later (RAPP-25; ADR-005 fallback path, ADR-022 for the runtime).
--
-- WHY THIS LIVES IN POSTGRES AND NOT IN AN EDGE FUNCTION
--
-- The obvious way to create an auth user is Supabase's Admin API with the
-- service-role key. That key bypasses RLS on every table in the project, so
-- wherever it is stored it becomes one secret whose loss exposes the whole
-- roster of refugee women at once, and it has to be stored somewhere a running
-- process can read it.
--
-- Doing the work here means NO SUCH KEY EXISTS. The elevated authority is a
-- SECURITY DEFINER function that does exactly one thing, refuses anyone who is
-- not staff, and can be read in full on one screen. A bug in it can do only
-- what its body does; a leaked service-role key can do anything.
--
-- The cost, stated plainly: `auth.users` and `auth.identities` are Supabase's
-- internal tables, not a documented public surface, so a future GoTrue release
-- could change them under us. The exposure is narrow (six columns and one
-- identity row), it is exercised on every `db reset` by the seeds, and pgTAP
-- verifies the password hash the way GoTrue verifies it. ADR-022 records the
-- decision and what to watch.
--
-- WHY THE GENERATED ADDRESS IS UNROUTABLE
--
-- These addresses are LOGIN IDENTIFIERS, not mailboxes: the woman they belong
-- to has no email, which is the entire reason the account exists. `.invalid`
-- is reserved by RFC 2606 so it can never resolve, anywhere, ever. A real
-- domain would mean that any automatic mail Supabase sends (recovery, email
-- change, a resend we add in a later phase) could one day be delivered to
-- whoever holds that mailbox — a password link for a participant's account,
-- to a stranger. Reserved is not a convention here, it is the safeguard.

-- How a profile signs in ----------------------------------------------------------

alter table public.profiles
  add column auth_method text not null default 'magic_link'
  check (auth_method in ('magic_link', 'admin_created'));

comment on column public.profiles.auth_method is 'How this identity authenticates: a magic link to a real inbox, or an internal address plus a password staff issued (ADR-005). Only admin_created accounts can have their password reset, because only they have one.';

-- The default describes the world as it already is rather than relabelling it:
-- every account that existed before this migration signs in with a magic link.

-- Generated credentials -------------------------------------------------------------

-- Characters that look alike on a slip of paper are the difference between a
-- woman logging in and being turned away at the door: no i/l/1, no o/O/0. The
-- alphabet is deliberately lowercase, because a phone keyboard's shift key is
-- one more thing to get wrong.
create or replace function public.unambiguous_token(length integer)
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(
    substr(
      'abcdefghjkmnpqrstuvwxyz23456789',
      1 + (get_byte(extensions.gen_random_bytes(1), 0) % 31),
      1
    ),
    ''
  )
  from generate_series(1, length);
$$;

comment on function public.unambiguous_token is 'Random lowercase text drawn from an alphabet with no look-alike characters (no i/l/1, no o/O/0), for credentials a person reads off paper and types on a phone.';

-- ASCII, because GoTrue validates addresses against a plain-ASCII pattern and
-- most of this roster writes in Arabic, Farsi or Cyrillic. Folding an accented
-- Latin name keeps it recognizable ("Núria" -> "nuria"); a name in another
-- script folds to nothing at all, so the address falls back to a neutral word.
-- Her real name is on her profile either way: the address is a credential, not
-- a label.
create or replace function public.ascii_local_part(source text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      regexp_replace(lower(public.immutable_unaccent(coalesce(source, ''))), '[^a-z0-9]', '', 'g'),
      ''
    ),
    'participant'
  );
$$;

comment on function public.ascii_local_part is 'The ASCII, address-safe form of a name. Falls back to a neutral word for names written in a script that folds to nothing, because the address is a login identifier and her real name lives on her profile.';

-- Rate limiting ------------------------------------------------------------------------

-- Read off the audit trail itself rather than a second counter table: the trail
-- is already append-only and already records exactly these actions, so there is
-- no store to keep in sync and no way to mint an account without also
-- incrementing the count.
--
-- PER ACTOR, deliberately. A cap shared across the organization would let one
-- burned staff session lock out the whole team, which turns a containment
-- measure into a denial of service against the people it protects.
create or replace function public.assert_within_hourly_limit(
  limited_action text,
  maximum_per_hour integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  select count(*) into recent
  from public.audit_log
  where action = limited_action
    and actor_id = (select auth.uid())
    and created_at > now() - interval '1 hour';

  if recent >= maximum_per_hour then
    raise exception
      'rate limit reached for % (% in the last hour); wait before trying again',
      limited_action, recent
      using errcode = 'raise_exception';
  end if;
end;
$$;

comment on function public.assert_within_hourly_limit is 'Refuses an action once the caller has performed it too often in the last hour, counted off the append-only audit trail. Per actor, so one compromised session cannot lock out a colleague.';

-- Creating an account -------------------------------------------------------------------

create or replace function public.create_participant_account(payload jsonb)
returns table (profile_id uuid, email text, password text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid;
  first_name_value text := nullif(btrim(payload ->> 'first_name'), '');
  last_name_value text := nullif(btrim(payload ->> 'last_name'), '');
  reference_entity_value text := nullif(btrim(payload ->> 'reference_entity'), '');
  new_user_id uuid := extensions.gen_random_uuid();
  generated_email text;
  generated_password text;
begin
  -- SECURITY DEFINER means RLS is not doing this check for us, so it is the
  -- first thing in the body and it is asserted from three roles in pgTAP.
  if not (select public.is_staff_or_admin()) then
    raise exception 'creating a participant account is a staff action'
      using errcode = 'insufficient_privilege';
  end if;

  if first_name_value is null or last_name_value is null then
    raise exception 'create_participant_account requires first_name and last_name'
      using errcode = 'not_null_violation';
  end if;

  perform public.assert_within_hourly_limit('account.create', 20);

  actor_org := (select public.current_org_id());

  -- Retry rather than trust: the suffix makes a collision vanishingly unlikely,
  -- and "vanishingly unlikely" is not the same as "cannot happen" on a unique
  -- index. Bounded, so a pathological case fails loudly instead of spinning.
  for attempt in 1..10 loop
    generated_email :=
      public.ascii_local_part(first_name_value) || '.' ||
      public.unambiguous_token(4) || '@ramassa.invalid';
    exit when not exists (select 1 from auth.users u where u.email = generated_email);
    generated_email := null;
  end loop;

  if generated_email is null then
    raise exception 'could not generate a free internal address after 10 attempts'
      using errcode = 'raise_exception';
  end if;

  -- Three groups of four, hyphenated: a person reading it aloud to another
  -- person keeps their place, and a person typing it can see where they are.
  generated_password :=
    public.unambiguous_token(4) || '-' ||
    public.unambiguous_token(4) || '-' ||
    public.unambiguous_token(4);

  -- The empty-string token columns are deliberate: GoTrue scans them as strings
  -- and errors on NULL. `raw_user_meta_data` stays empty because it is
  -- user-editable and must never carry anything an authorization decision reads.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, reauthentication_token
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    generated_email,
    extensions.crypt(generated_password, extensions.gen_salt('bf')),
    -- Confirmed on creation: there is no inbox to confirm from, and an
    -- unconfirmed account cannot sign in at all.
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now(), '', '', '', '', '', ''
  );

  -- Without this row GoTrue cannot resolve the address to the user, and the
  -- login fails even though the password hash is correct.
  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  values (
    new_user_id::text,
    new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', generated_email, 'email_verified', true),
    'email',
    now(), now(), now()
  );

  -- `terms_accepted_at` is absent, on purpose and permanently. Staff create the
  -- ACCOUNT; the CONSENT is hers to give, so her first login lands in the
  -- onboarding wizard and she accepts the terms herself (RGPD: consent cannot
  -- be given on someone's behalf).
  insert into public.profiles (
    id, org_id, role, first_name, last_name, reference_entity, auth_method
  )
  values (
    new_user_id,
    actor_org,
    'player',
    first_name_value,
    last_name_value,
    reference_entity_value,
    'admin_created'
  );

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org,
    actor,
    'account.create',
    'profile',
    new_user_id,
    -- The generated address is an identifier, not a secret, and staff need to
    -- see in the trail WHICH account was minted. The password is nowhere here:
    -- it exists in this function's response and in nothing else, ever.
    jsonb_build_object('auth_method', 'admin_created')
  );

  return query select new_user_id, generated_email, generated_password;
end;
$$;

comment on function public.create_participant_account is 'Creates an account for a participant with no email: an internal unroutable address plus a one-time password, returned ONCE and stored nowhere readable. Staff only, audited, rate-limited. Does not accept the terms on her behalf.';

-- Resetting a password ----------------------------------------------------------------

create or replace function public.reset_participant_password(participant_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid;
  subject_auth_method text;
  generated_password text;
begin
  if not (select public.is_staff_or_admin()) then
    raise exception 'resetting a participant password is a staff action'
      using errcode = 'insufficient_privilege';
  end if;

  perform public.assert_within_hourly_limit('account.password_reset', 20);

  actor_org := (select public.current_org_id());

  select p.auth_method into subject_auth_method
  from public.profiles p
  where p.id = participant_id and p.org_id = actor_org;

  if subject_auth_method is null then
    raise exception 'no such participant in this organization'
      using errcode = 'no_data_found';
  end if;

  -- A magic-link account has no password. Setting one would quietly turn her
  -- account into something she was never told about, and would leave a
  -- credential in existence that nobody has ever seen. She recovers her access
  -- through her own inbox, which is the whole point of that method.
  if subject_auth_method <> 'admin_created' then
    raise exception 'this account signs in with a magic link and has no password to reset'
      using errcode = 'raise_exception';
  end if;

  generated_password :=
    public.unambiguous_token(4) || '-' ||
    public.unambiguous_token(4) || '-' ||
    public.unambiguous_token(4);

  update auth.users
     set encrypted_password = extensions.crypt(generated_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = participant_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id)
  values (actor_org, actor, 'account.password_reset', 'profile', participant_id);

  return generated_password;
end;
$$;

comment on function public.reset_participant_password is 'Issues a new one-time password for an admin-created account, invalidating the old one. Staff only, same organization only, audited and rate-limited. Refuses magic-link accounts, which have no password and recover through their own inbox.';
