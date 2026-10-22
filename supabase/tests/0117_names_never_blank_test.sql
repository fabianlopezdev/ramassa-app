-- Her first and last name are never blank, by any write (RAPP-624, pending
-- fix 24).
-- Run with: bunx supabase test db
--
-- What these assertions defend: the profile RPCs already refuse a blank name;
-- a direct UPDATE of the table, by her or by staff with
-- participants.view_personal, is refused too. Erasure still blanks a name
-- (it runs as the database, not as a client).
--
-- Seed: real player ...011, staff ...002 (participants.view_personal).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(6);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select throws_ok(
  $$ update public.profiles set first_name = '' where id = '5eed0000-0000-4000-8000-000000000011' $$,
  '23514', null::text,
  'she cannot blank her own first name with a direct write'
);
select throws_ok(
  $$ update public.profiles set last_name = '   ' where id = '5eed0000-0000-4000-8000-000000000011' $$,
  '23514', null::text,
  'nor her last name with spaces'
);
select lives_ok(
  $$ update public.profiles set first_name = 'Amina' where id = '5eed0000-0000-4000-8000-000000000011' $$,
  'a real name is still saved'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ update public.profiles set last_name = ' ' where id = '5eed0000-0000-4000-8000-000000000012' $$,
  '23514', null::text,
  'staff cannot blank a player''s last name with a direct write'
);
select throws_ok(
  $$ update public.profiles set first_name = null where id = '5eed0000-0000-4000-8000-000000000012' $$,
  '23502', null::text,
  'nor empty it'
);

reset role;
select lives_ok(
  $$ update public.profiles set first_name = '', last_name = '' where id = '5eed0000-0000-4000-8000-000000000012' $$,
  'the database itself (erasure) still blanks a name'
);

select * from finish();
rollback;
