-- The staging fixed code for test accounts (RAPP-616).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Only the Edge Function (service_role) calls the three functions; a
--      signed-in person or an anonymous caller cannot.
--   2. Only an active test account is ever found: a real player never is.
--   3. Attempts are rate limited per address and per network address, and the
--      table keeps hashes only.
--   4. A successful test sign-in is audited, and only for a test account.

begin;
select plan(17);

-- 1. Who may call --------------------------------------------------------------------------------

-- Checked through the privilege catalog, as the other suites do: calling a
-- function without EXECUTE ends the test session on this Postgres build.
select ok(
  not has_function_privilege('authenticated', 'public.test_sign_in_account(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.test_sign_in_account(text)', 'EXECUTE'),
  'a signed-in or anonymous caller cannot look up test accounts'
);
select ok(
  not has_function_privilege('authenticated', 'public.test_sign_in_register_attempt(text, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.test_sign_in_register_attempt(text, text)', 'EXECUTE'),
  'nor record attempts'
);
select ok(
  not has_table_privilege('authenticated', 'private.test_sign_in_attempts', 'SELECT')
  and not has_table_privilege('anon', 'private.test_sign_in_attempts', 'SELECT'),
  'nor read them'
);
select ok(
  not has_function_privilege('authenticated', 'public.test_sign_in_record_success(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.test_sign_in_record_success(uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.test_sign_in_record_success(uuid)', 'EXECUTE'),
  'only the Edge Function writes the audit row'
);

-- 2. Which accounts --------------------------------------------------------------------------------

set local role service_role;
select is(
  public.test_sign_in_account('jugadora.prova@example.test'),
  '5eed0000-0000-4000-8000-000000000096'::uuid, 'the test player is found'
);
select is(
  public.test_sign_in_account('  Disseny@Example.TEST '),
  '5eed0000-0000-4000-8000-000000000097'::uuid, 'a marked team account is found, whatever the case'
);
select is(
  public.test_sign_in_account('amina.alhassan@example.test'), null::uuid,
  'a real player is never found'
);
select is(
  public.test_sign_in_account('laia.ferrer@example.test'), null::uuid,
  'nor an unmarked team account'
);
select is(public.test_sign_in_account('nobody@example.test'), null::uuid, 'nor an unknown address');
reset role;
update public.profiles set is_active = false where id = '5eed0000-0000-4000-8000-000000000096';
set local role service_role;
select is(
  public.test_sign_in_account('jugadora.prova@example.test'), null::uuid,
  'a deactivated test account is not found'
);
reset role;
update public.profiles set is_active = true where id = '5eed0000-0000-4000-8000-000000000096';

-- 3. The rate limit ----------------------------------------------------------------------------------

set local role service_role;
select ok(
  (select bool_and(public.test_sign_in_register_attempt('limit@example.test', '10.0.0.1'))
     from generate_series(1, 5)),
  'five attempts for one address pass'
);
select is(
  public.test_sign_in_register_attempt('limit@example.test', '10.0.0.2'), false,
  'the sixth for that address is refused, from any network'
);
select ok(
  (select bool_and(public.test_sign_in_register_attempt('other' || n || '@example.test', '10.0.0.9'))
     from generate_series(1, 20) n),
  'twenty attempts from one network pass'
);
select is(
  public.test_sign_in_register_attempt('fresh@example.test', '10.0.0.9'), false,
  'the twenty-first from that network is refused, for any address'
);
reset role;
select is(
  (select count(*)::int from private.test_sign_in_attempts where email_hash like '%@%'),
  0, 'the attempts keep hashes, never the address'
);

-- 4. Audit ----------------------------------------------------------------------------------------------

set local role service_role;
select lives_ok(
  $$ select public.test_sign_in_record_success('5eed0000-0000-4000-8000-000000000096') $$,
  'a test sign-in is recorded'
);
select throws_ok(
  $$ select public.test_sign_in_record_success('5eed0000-0000-4000-8000-000000000011') $$,
  '42501', 'TEST_SIGN_IN/NOT_A_TEST_ACCOUNT', 'never for a real player'
);

select * from finish();
rollback;
