-- A name made only of Unicode whitespace or invisible characters is blank
-- (RAPP-624, pending fix 28).
-- Run with: bunx supabase test db
--
-- What these assertions defend: `btrim` strips only the ASCII space, so a
-- first or last name of a tab, a newline, a no-break space, an ideographic
-- space, a zero-width space, a word joiner or a byte order mark was saved as
-- a name on every client path. Every path now uses one test,
-- `private.name_trim`: the whitespace JavaScript's trim() removes
-- (`private.js_trim`) plus the zero-width characters, the same rule the
-- shared Zod name schema applies.
--
-- Paths: her direct table write, staff's direct table write, update_own_profile,
-- update_participant_profile, the test scenario's answer fill (the staff
-- prefill), create_participant_invite, invite_staff_member and
-- invite_entity_collaborator.
--
-- Seed: admin ...001, staff ...002 (participants.view_personal), design role
-- ...097, real players ...011 and ...012, test player ...096.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(92);

create temp table blank (ordinal integer primary key, label text, value text) on commit drop;
grant all on blank to authenticated;
insert into blank (ordinal, label, value) values
  (1, 'a tab', E'\t'),
  (2, 'a newline', E'\n'),
  (3, 'a no-break space U+00A0', U&'\00A0'),
  (4, 'an ideographic space U+3000', U&'\3000'),
  (5, 'a zero-width space U+200B', U&'\200B'),
  (6, 'a zero-width non-joiner U+200C', U&'\200C'),
  (7, 'a zero-width joiner U+200D', U&'\200D'),
  (8, 'a word joiner U+2060', U&'\2060'),
  (9, 'a byte order mark U+FEFF', U&'\FEFF'),
  (10, 'an en space U+2002', U&'\2002'),
  (11, 'a mix of them', U&'\00A0\200B\0009\3000\FEFF');

set local role authenticated;

-- 1. Her direct write.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select throws_ok(
  format($$ update public.profiles set first_name = %L where id = '5eed0000-0000-4000-8000-000000000011' $$, value),
  '23514', null::text, 'her direct write refuses a first name of ' || label)
  from blank order by ordinal;

-- 2. Her profile screen.
select throws_ok(
  format($$ select public.update_own_profile(jsonb_build_object('first_name', 'Amina', 'last_name', %L)) $$, value),
  '23514', null::text, 'update_own_profile refuses a last name of ' || label)
  from blank order by ordinal;

-- 3. Staff's direct write.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  format($$ update public.profiles set last_name = %L where id = '5eed0000-0000-4000-8000-000000000012' $$, value),
  '23514', null::text, 'staff''s direct write refuses a last name of ' || label)
  from blank order by ordinal;

-- 4. Her page in the admin.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  format($$ select public.update_participant_profile('5eed0000-0000-4000-8000-000000000012',
                     jsonb_build_object('first_name', %L, 'last_name', 'Haddad')) $$, value),
  '23514', null::text, 'update_participant_profile refuses a first name of ' || label)
  from blank order by ordinal;

-- 5. Inviting her with her name.
select throws_ok(
  format($$ select * from public.create_participant_invite(jsonb_build_object(
                     'email', 'blank-name-%s@example.test', 'first_name', %L, 'last_name', 'Prova')) $$,
         ordinal, value),
  '22023', null::text, 'an invitation refuses a first name of ' || label)
  from blank order by ordinal;

-- 6. Inviting a team member or an entity's collaborator.
select throws_ok(
  format($$ select * from public.invite_staff_member('blank-staff-%s@example.test', %L, 'Prova', 'staff') $$,
         ordinal, value),
  '23514', null::text, 'a staff invitation refuses a first name of ' || label)
  from blank order by ordinal;
select throws_ok(
  format($$ select * from public.invite_entity_collaborator(gen_random_uuid(),
                     'blank-collaborator-%s@example.test', 'Prova', %L) $$, ordinal, value),
  '23514', null::text, 'a collaborator invitation refuses a last name of ' || label)
  from blank order by ordinal;

-- 7. The test scenario's answer fill (the staff prefill path).
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select throws_ok(
  format($$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096',
                     jsonb_build_object('kind', 'answers', 'fill', jsonb_build_object('first_name', %L))) $$, value),
  '23502', null::text, 'the scenario fill refuses a first name of ' || label)
  from blank order by ordinal;

-- A real name with an inner no-break space is still a name, and edges are trimmed.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
select lives_ok(
  $$ update public.profiles set first_name = U&'Ana\00A0Maria' where id = '5eed0000-0000-4000-8000-000000000011' $$,
  'a name with an inner no-break space is saved'
);
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000097", "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp", "timestamp": 4102444800}]}';
select lives_ok(
  $$ select public.set_test_player_scenario('5eed0000-0000-4000-8000-000000000096',
       jsonb_build_object('kind', 'answers', 'fill', jsonb_build_object('first_name', U&'\200B\00A0Joana\3000'))) $$,
  'a name wrapped in invisible characters is accepted'
);
reset role;
select is(
  (select first_name from public.profiles where id = '5eed0000-0000-4000-8000-000000000096'),
  'Joana',
  'and saved without them'
);
select is(private.name_trim(U&'\FEFF\2060 Fatima \200D'), 'Fatima', 'name_trim strips whitespace and zero-width edges');

select * from finish();
rollback;
