-- The staging fixed code has a global attempt cap (RAPP-616).
--
-- WHY
--
-- The fixed code is shared by every test account. The limits per address
-- (five) and per network (twenty) in fifteen minutes did not bound a caller
-- who changes both on every request: a verifier forged a new X-Forwarded-For
-- each time and never met a 429. The function now keys the network on the
-- address the platform saw (handler.ts, networkOf), and this cap bounds all
-- attempts together, however many addresses and networks are used.
--
-- WHAT THIS MIGRATION DOES
--
-- test_sign_in_register_attempt also refuses once thirty attempts in all were
-- made in the last fifteen minutes. That is about 2,900 guesses a day at most,
-- so a six-digit code would take months to find, and it is far above what
-- one person designing the onboarding uses. An index on the attempt time
-- keeps the count cheap.

create index test_sign_in_attempts_attempted_at_idx on private.test_sign_in_attempts (attempted_at);

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
  ) <= 20
  and (
    select count(*) from private.test_sign_in_attempts
     where attempted_at >= window_start
  ) <= 30;
end;
$$;

revoke all on function public.test_sign_in_register_attempt(text, text) from public, anon, authenticated;
grant execute on function public.test_sign_in_register_attempt(text, text) to service_role;
