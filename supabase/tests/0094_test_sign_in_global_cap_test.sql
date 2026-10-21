-- The staging fixed code has a global attempt cap (RAPP-616).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   The per-address and per-network limits alone let a caller who changes
--   both on every request try the shared code without end. All attempts
--   together are capped too: thirty in fifteen minutes, whatever the address
--   and the network.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(4);

set local role service_role;
select ok(
  (select bool_and(public.test_sign_in_register_attempt('spread' || n || '@example.test', '198.51.100.' || n))
     from generate_series(1, 30) n),
  'thirty attempts from thirty addresses and thirty networks pass'
);
select is(
  public.test_sign_in_register_attempt('fresh@example.test', '203.0.113.99'), false,
  'the thirty-first is refused, from a new address and a new network'
);

-- Fifteen minutes later the window is open again.
reset role;
update private.test_sign_in_attempts set attempted_at = now() - interval '16 minutes';
set local role service_role;
select is(
  public.test_sign_in_register_attempt('fresh@example.test', '203.0.113.99'), true,
  'after the window an attempt passes again'
);
reset role;
select ok(
  exists (select 1 from pg_indexes where schemaname = 'private' and indexname = 'test_sign_in_attempts_attempted_at_idx'),
  'the global count reads an index on the attempt time'
);

select * from finish();
rollback;
