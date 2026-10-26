-- Her names count as answered only once her profile holds them (RAPP-661).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. A woman who signs up on her own has no profile yet: her wizard asks
--      her names (the final QA found the name screen skipped).
--   2. A joined player and an invited woman whose names staff gave are not
--      asked them again.
--   3. Her app language is answered only when her profile holds one.
--   4. The check stays private: a signed-in user cannot call it.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(6);

set local role authenticated;

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000099", "role": "authenticated", "aal": "aal1"}';
select ok(
  'first_name' in (select public.my_questions_to_ask())
  and 'last_name' in (select public.my_questions_to_ask()),
  'no profile yet: her wizard asks her names'
);
select is(
  (select public.my_questions_to_ask() limit 1),
  'first_name',
  'and asks them first'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated", "aal": "aal1"}';
select ok(
  'first_name' not in (select public.my_questions_to_ask()),
  'a joined player is not asked her names again'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000098", "role": "authenticated", "aal": "aal1"}';
select ok(
  'first_name' not in (select public.my_questions_to_ask()),
  'an invited woman whose names staff gave skips them'
);

select throws_ok(
  $$ select private.app_question_answered('5eed0000-0000-4000-8000-000000000099', 'first_name') $$,
  '42501', null::text,
  'a signed-in user cannot call the check'
);
reset role;

select ok(
  not private.app_question_answered('5eed0000-0000-4000-8000-000000000099', 'preferred_language'),
  'no profile yet: her app language is not answered'
);

select * from finish();
rollback;
