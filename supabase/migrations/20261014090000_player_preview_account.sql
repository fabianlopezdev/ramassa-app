-- The preview player account (RAPP-370, decided in RAPP-171, ADR-027).
--
-- WHAT IT IS FOR
--
-- A team member must be able to see, at any moment, what players see in the
-- app, to confirm that a change they made shows as expected. Staff must never
-- see a real player's private data while doing so, so the preview cannot be
-- an impersonation of a real player. Each organization gets one preview
-- account instead: a separate account with no personal data that reads
-- exactly what any player reads.
--
-- WHY A ROLE OF ITS OWN
--
-- The account carries `profiles.role = 'preview'`, and `current_app_role()`
-- reports it as 'player'. Every player read policy goes through that function,
-- so the preview reads what a player reads. Every staff list, count and push
-- audience selects `role = 'player'`, so the preview account stays out of
-- participant lists, impact reports, exports and notifications with no change
-- to any of them.
--
-- WHY READ-ONLY IN THE DATABASE
--
-- The preview must change nothing: no sign-up, no forum post, no message, no
-- read receipt. Many player writes run in SECURITY DEFINER functions, which
-- RLS does not reach. So PostgREST's pre-request hook turns every request of
-- the preview account into a read-only transaction. Postgres then refuses
-- every write, in a table or in a function, and nothing can turn it back.
-- The media worker refuses its uploads on its own (packages/shared upload
-- rules).
--
-- HOW IT STARTS, WITH NO SERVICE-ROLE KEY
--
-- `start_player_preview()` confirms the caller is a team member with `aal2`
-- (`is_team_member()` checks both and that the session is current), creates
-- the account on first use as ADR-022 creates accounts, gives it a new random
-- password and returns the address and password once. The app signs in with
-- them on a second client, so the team member's own session is untouched. The
-- password is stored only as its hash, and each start replaces it, so a
-- password that leaks opens nothing after the next start, and it never opens
-- more than the read-only player view.

-- The role ---------------------------------------------------------------------

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('player', 'staff', 'entity', 'admin', 'preview'));

create unique index profiles_one_preview_per_org
  on public.profiles (org_id)
  where role = 'preview';

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
    and (select private.session_is_current())
    and (role in ('player', 'preview') or (select private.session_is_aal2()));
$$;

-- Read-only for every request of the preview account -----------------------------

create or replace function private.is_player_preview()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'preview'
  );
$$;

create or replace function private.player_preview_pre_request()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.is_player_preview()) then
    -- Once a transaction is read-only, Postgres refuses to make it writable again.
    perform set_config('transaction_read_only', 'on', true);
  end if;
end;
$$;

revoke all on function private.is_player_preview() from public;
revoke all on function private.player_preview_pre_request() from public;
grant execute on function private.is_player_preview() to anon, authenticated, service_role;
grant execute on function private.player_preview_pre_request() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request to 'private.player_preview_pre_request';
notify pgrst, 'reload config';

-- Starting a preview -----------------------------------------------------------

create or replace function public.start_player_preview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  preview_id uuid;
  preview_email text;
  preview_password text := encode(extensions.gen_random_bytes(24), 'base64');
  org_language text;
begin
  if actor_org is null or not (select public.is_team_member()) then
    raise exception 'only a team member with a verified second factor can preview as a player'
      using errcode = '42501';
  end if;

  perform public.assert_within_hourly_limit('player.preview', 60);
  -- Two team members starting the first preview at once create one account.
  perform pg_advisory_xact_lock(hashtext('player-preview:' || actor_org::text));

  preview_email := 'preview+' || actor_org::text || '@preview.ramassa.invalid';
  select id into preview_id
  from public.profiles
  where org_id = actor_org and role = 'preview';

  if preview_id is null then
    preview_id := gen_random_uuid();
    select default_language into org_language from public.organizations where id = actor_org;

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', preview_id,
      'authenticated', 'authenticated', preview_email, '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', '', '', ''
    );

    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      preview_id::text,
      preview_id,
      jsonb_build_object('sub', preview_id::text, 'email', preview_email, 'email_verified', true),
      'email', now(), now(), now()
    );

    -- No personal data: a fixed name, no document, no contact details.
    insert into public.profiles (
      id, org_id, role, first_name, last_name, preferred_language,
      document_type, terms_accepted_at
    ) values (
      preview_id, actor_org, 'preview', 'Preview', '', org_language, 'none', now()
    );
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(preview_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = preview_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id)
  values (actor_org, actor_id, 'player_preview.start', 'profile', preview_id);

  return jsonb_build_object('email', preview_email, 'password', preview_password);
end;
$$;

revoke all on function public.start_player_preview() from public, anon;
grant execute on function public.start_player_preview() to authenticated;
