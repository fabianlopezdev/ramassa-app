-- A NIE keeps its form in the database (RAPP-782).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. A NIE that fits (one letter, seven digits, one letter, read in
--      capitals) is kept; one that does not is refused, also when her type
--      comes in the same write, and also through the team's edit of her record.
--   2. A passport has no form to check.
--   3. A number already stored is never refused: given again unchanged, with
--      other answers, or when only her type changes to NIE.
--   4. An entity's referral refuses a NIE that does not fit.
--
-- Seed: player ...011 and admin ...001 of organization ...000, referral ...8010-...005.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(11);

create function pg_temp.field(p_key text) returns uuid language sql as $$
  select id from public.profile_fields
   where org_id = '5eed0000-0000-4000-8000-000000000000' and system_key = p_key;
$$;
create function pg_temp.type(p_key text) returns text language sql as $$
  select o.id::text from public.custom_question_options o
   where o.question_id = pg_temp.field('document_type') and o.key = p_key;
$$;
create function pg_temp.write(p_answers jsonb) returns uuid[] language sql as $$
  select private.write_field_answers('5eed0000-0000-4000-8000-000000000011', p_answers, 'staff',
                                     '5eed0000-0000-4000-8000-000000000001');
$$;
create function pg_temp.answers(p_type text, p_number text) returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object(
    pg_temp.field('document_type')::text, to_jsonb(pg_temp.type(p_type)),
    pg_temp.field('document_number')::text, to_jsonb(p_number)));
$$;

-- 1. A NIE keeps its form ---------------------------------------------------------------------

select lives_ok($$ select pg_temp.write(pg_temp.answers('nie', 'X1234567L')) $$, 'a NIE that fits is kept');
select lives_ok($$ select pg_temp.write(pg_temp.answers('nie', ' x7654321m ')) $$,
  'read in capitals, as her phone reads it');
select throws_ok($$ select pg_temp.write(pg_temp.answers('nie', 'X123')) $$,
  '23514', 'a NIE is one letter, seven digits, one letter', 'a NIE that does not fit is refused');
select throws_ok($$ select pg_temp.write(pg_temp.answers('passport', 'Z9')) || pg_temp.write(pg_temp.answers('nie', 'Z8')) $$,
  '23514', 'a NIE is one letter, seven digits, one letter',
  'also when her type and her number come in the same write');

-- 2. A passport -------------------------------------------------------------------------------

select lives_ok($$ select pg_temp.write(pg_temp.answers('passport', 'AB12')) $$,
  'a passport has no form to check');

-- 3. A number already stored ------------------------------------------------------------------

-- An ill-formed NIE stored before the check (written past it, as old data is).
select private.write_custom_answer('5eed0000-0000-4000-8000-000000000011',
  (select f from public.profile_fields f where f.id = pg_temp.field('document_type')),
  to_jsonb(pg_temp.type('nie')), 'staff');
select private.write_custom_answer('5eed0000-0000-4000-8000-000000000011',
  (select f from public.profile_fields f where f.id = pg_temp.field('document_number')),
  '"OLD-123"'::jsonb, 'staff');
select lives_ok($$ select pg_temp.write(pg_temp.answers('nie', 'OLD-123')) $$,
  'a stored number given again unchanged is never refused');
select lives_ok(
  format($$ select pg_temp.write(jsonb_build_object(%L, '"+34600111222"'::jsonb)) $$, pg_temp.field('phone')),
  'nor are her other answers');
select is(
  (select private.field_answer_now('5eed0000-0000-4000-8000-000000000011', f)
     from public.profile_fields f where f.id = pg_temp.field('document_number')),
  '"OLD-123"'::jsonb,
  'and it is never rewritten'
);
select private.write_custom_answer('5eed0000-0000-4000-8000-000000000011',
  (select f from public.profile_fields f where f.id = pg_temp.field('document_type')),
  to_jsonb(pg_temp.type('passport')), 'staff');
select lives_ok($$ select pg_temp.write(pg_temp.answers('nie', null)) $$,
  'changing only her type to NIE leaves the number she gave');

-- The team's edit of her record writes through the same check.
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  $$ select public.update_participant_profile('5eed0000-0000-4000-8000-000000000011',
       jsonb_build_object('answers', pg_temp.answers('nie', 'Y12'))) $$,
  '23514', 'a NIE is one letter, seven digits, one letter',
  'the team''s edit of her record refuses it too'
);
reset role;

-- 4. An entity's referral ---------------------------------------------------------------------

select throws_ok(
  $$ select private.save_referral_field_answers(
       (select r from public.entity_referrals r where r.id = '5eed0000-0000-4000-8010-000000000005'),
       pg_temp.answers('nie', 'Q1')) $$,
  '23514', 'a NIE is one letter, seven digits, one letter',
  'an entity''s referral refuses a NIE that does not fit'
);

select * from finish();
rollback;
