-- The staging fixed code for test accounts (RAPP-616).
--
-- WHY
--
-- The person designing the onboarding signs in as a test player on a phone,
-- deletes her and starts again, many times a day. Waiting for an email code
-- each time, to a made-up address, does not work. Supabase has fixed test
-- codes for phone sign-in only, so the email equivalent is built: the
-- `test-sign-in` Edge Function, switched on by two staging-only secrets.
--
-- WHAT LIVES HERE
--
-- The function is the door; these three functions are what it asks, and only
-- it can call them (service_role). The attempts table rate-limits by address
-- and by network address, and keeps hashes only, for one day. A successful
-- test sign-in is audited. Without the secrets the function answers 404 to
-- everything and never calls any of this.

-- PostgREST runs `private.player_preview_pre_request()` before every request
-- (RAPP-372), and it already grants that function to service_role. Without
-- usage on the schema a service_role request fails before it starts, so the
-- function below could not call its three functions at all. Usage only: the
-- private functions keep their own grants.
grant usage on schema private to service_role;

create table private.test_sign_in_attempts (
  id bigint generated always as identity primary key,
  -- Hashes, never the address: a rate limit needs equality, nothing more.
  email_hash text not null,
  network_hash text not null,
  attempted_at timestamptz not null default now()
);

create index test_sign_in_attempts_email_idx on private.test_sign_in_attempts (email_hash, attempted_at);
create index test_sign_in_attempts_network_idx on private.test_sign_in_attempts (network_hash, attempted_at);

alter table private.test_sign_in_attempts enable row level security;
alter table private.test_sign_in_attempts force row level security;
revoke all on private.test_sign_in_attempts from public, anon, authenticated;

comment on table private.test_sign_in_attempts is
  'Test sign-in attempts (RAPP-616), hashed, kept one day, for the rate limit. No row policy: only the functions below touch it.';

-- Records one attempt and says whether it is within the limits: five per
-- address and twenty per network address in fifteen minutes, counting this
-- one. Rows older than a day are removed on the way.
create or replace function public.test_sign_in_register_attempt(p_email text, p_network text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  email_digest text := encode(extensions.digest(lower(btrim(coalesce(p_email, ''))), 'sha256'), 'hex');
  network_digest text := encode(extensions.digest(coalesce(nullif(btrim(p_network), ''), 'unknown'), 'sha256'), 'hex');
  window_start timestamptz := now() - interval '15 minutes';
begin
  delete from private.test_sign_in_attempts where attempted_at < now() - interval '1 day';

  insert into private.test_sign_in_attempts (email_hash, network_hash)
  values (email_digest, network_digest);

  return (
    select count(*) from private.test_sign_in_attempts
     where email_hash = email_digest and attempted_at >= window_start
  ) <= 5
  and (
    select count(*) from private.test_sign_in_attempts
     where network_hash = network_digest and attempted_at >= window_start
  ) <= 20;
end;
$$;

-- The account behind an address, when it is an active test account: a test
-- player (joined or not) or a team account an admin marked. Null otherwise,
-- and the function answers every null the same way.
create or replace function public.test_sign_in_account(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select profile.id
    from auth.users as account
    join public.profiles as profile on profile.id = account.id
   where lower(account.email) = lower(btrim(coalesce(p_email, '')))
     and profile.is_test_account
     and profile.is_active
     and profile.anonymized_at is null
     and profile.role in ('player', 'invited', 'staff', 'admin')
   limit 1;
$$;

-- The audit row of a test sign-in, in the account's own name.
create or replace function public.test_sign_in_record_success(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  select profile.org_id, profile.id, 'auth.test_sign_in', 'profile', profile.id, '{}'::jsonb
    from public.profiles as profile
   where profile.id = p_profile_id and profile.is_test_account;
  if not found then
    raise exception 'TEST_SIGN_IN/NOT_A_TEST_ACCOUNT' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.test_sign_in_register_attempt(text, text) from public, anon, authenticated;
revoke all on function public.test_sign_in_account(text) from public, anon, authenticated;
revoke all on function public.test_sign_in_record_success(uuid) from public, anon, authenticated;
grant execute on function public.test_sign_in_register_attempt(text, text) to service_role;
grant execute on function public.test_sign_in_account(text) to service_role;
grant execute on function public.test_sign_in_record_success(uuid) to service_role;
