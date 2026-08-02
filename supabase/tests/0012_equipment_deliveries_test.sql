-- Equipment deliveries: what the team handed a participant, when, and who
-- handed it over (RAPP-27). Run with: bunx supabase test db
--
-- What these assertions defend, in order of how badly they would hurt:
--
--   1. **A participant cannot read her own delivery log, and neither can an
--      entity contact.** This is the team's operational record, not hers: it
--      says which women needed boots and when, which is exactly the kind of
--      inference about a person's circumstances that should not travel. Staff
--      only, asserted from every other role rather than inferred from a policy
--      existing.
--   2. **The item is drawn from a catalog, never typed.** A free-text item turns
--      the season's equipment report into "botes", "Botes", "bota" and "boots",
--      and the field dies by a thousand typos (CLAUDE.md rule 18). The catalog
--      lives in one place and the database refuses anything outside it.
--   3. **The table is registered for RGPD erasure.** This is the first table
--      added since the registry landed (RAPP-26), so it is also the first real
--      test of the standing rule: a personal-data table that is not registered
--      must not be able to ship. Watched fail on purpose, 2026-08-01: creating
--      this table WITHOUT its registry entry turns `0011` red on the coverage
--      assertion, exactly as designed.
--
-- Runs in a transaction and rolls back.

begin;
select plan(25);

-- Marta Puig is staff (…002), Laia Ferrer admin (…001), Sílvia Bosch an entity
-- contact (…004), Amina al-Hassan a participant (…011).

-- Schema ---------------------------------------------------------------------------

select has_table('public', 'equipment_deliveries', 'the delivery log exists');
select has_column('public', 'equipment_deliveries', 'profile_id', 'it names who received');
select has_column('public', 'equipment_deliveries', 'item', 'and what she received');
select has_column('public', 'equipment_deliveries', 'delivered_by', 'and who handed it over');
select has_column('public', 'equipment_deliveries', 'delivered_on', 'and when');

-- ON DELETE CASCADE from the participant, so an erasure reaches this table
-- through the same route every other attached table uses.
select col_is_fk('public', 'equipment_deliveries', 'profile_id', 'the receiver is a real profile');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.equipment_deliveries'::regclass),
  'row-level security is enabled on it'
);

-- The catalog ------------------------------------------------------------------------

-- Reportability is the whole reason this is a constraint and not a comment. The
-- question the season report asks is "how many pairs of boots did we hand out",
-- and it can only be answered if every row spells boots the same way.
select throws_ok(
  $$ insert into public.equipment_deliveries (profile_id, item, size, delivered_by, delivered_on)
     values ('5eed0000-0000-4000-8000-000000000011', 'unes botes qualsevol', '38',
             '5eed0000-0000-4000-8000-000000000002', current_date) $$,
  '23514',
  null::text,
  'an item outside the catalog is refused by the database, not merely by the form'
);

-- Who may read and write ----------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.equipment_deliveries (profile_id, item, size, delivered_by, delivered_on)
     values ('5eed0000-0000-4000-8000-000000000011', 'boots', '38',
             '5eed0000-0000-4000-8000-000000000002', current_date) $$,
  'staff record a delivery'
);

select is(
  (select count(*) from public.equipment_deliveries
    where profile_id = '5eed0000-0000-4000-8000-000000000011')::int,
  1,
  'and can read it back'
);

-- An item with no size is a real case (a water bottle, a rucksack), and a
-- schema that demanded one would push staff into typing a fake value.
select lives_ok(
  $$ insert into public.equipment_deliveries (profile_id, item, delivered_by, delivered_on)
     values ('5eed0000-0000-4000-8000-000000000011', 'water_bottle',
             '5eed0000-0000-4000-8000-000000000002', current_date) $$,
  'an item that has no size is recorded without one'
);

-- A second participant's delivery, so the erasure below can be shown to remove
-- HERS and not simply to empty the table.
insert into public.equipment_deliveries (profile_id, item, size, delivered_by, delivered_on)
values ('5eed0000-0000-4000-8000-000000000012', 'boots', '39',
        '5eed0000-0000-4000-8000-000000000002', current_date);

-- Attributed to the person who actually handed it over, and only her. A row
-- written in a colleague's name is a false record of who met the participant.
select throws_ok(
  $$ insert into public.equipment_deliveries (profile_id, item, delivered_by, delivered_on)
     values ('5eed0000-0000-4000-8000-000000000011', 'jersey',
             '5eed0000-0000-4000-8000-000000000003', current_date) $$,
  '42501',
  null::text,
  'staff cannot record a delivery in a colleague name'
);

-- THE ASSERTION THIS TABLE'S POLICIES EXIST FOR. Her delivery log says which
-- women needed boots and when, which is an inference about her circumstances
-- that belongs to the team and not to the roster.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';

select is(
  (select count(*) from public.equipment_deliveries)::int,
  0,
  'a participant cannot read her own delivery log'
);

select throws_ok(
  $$ insert into public.equipment_deliveries (profile_id, item, delivered_by, delivered_on)
     values ('5eed0000-0000-4000-8000-000000000011', 'boots',
             '5eed0000-0000-4000-8000-000000000011', current_date) $$,
  '42501',
  null::text,
  'and cannot write herself one'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated"}';

select is(
  (select count(*) from public.equipment_deliveries)::int,
  0,
  'an entity contact cannot read the delivery log either'
);

select throws_ok(
  $$ insert into public.equipment_deliveries (profile_id, item, delivered_by, delivered_on)
     values ('5eed0000-0000-4000-8000-000000000011', 'boots',
             '5eed0000-0000-4000-8000-000000000004', current_date) $$,
  '42501',
  null::text,
  'and cannot write one'
);

-- An admin is staff for this purpose: she runs the same programme.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated"}';

select cmp_ok(
  (select count(*) from public.equipment_deliveries)::int,
  '>=',
  2,
  'an admin reads the delivery log'
);

-- Append-only, like the notes and the audit trail next door: a delivery log the
-- team can quietly rewrite is not a record of what happened.
--
-- Asserted as "removes nothing" rather than as a raised error, which is what the
-- first draft expected. A table with no DELETE policy does not refuse the
-- statement: RLS simply shows it no rows to delete, so the delete SUCCEEDS and
-- affects none. Expecting an exception there would have been a red test hiding a
-- correct implementation, and expecting `lives_ok` alone would have been a green
-- test hiding a policy that deleted everything.
select lives_ok(
  $$ delete from public.equipment_deliveries
      where profile_id = '5eed0000-0000-4000-8000-000000000011' $$,
  'a delete statement is accepted'
);

reset role;
select cmp_ok(
  (select count(*) from public.equipment_deliveries
    where profile_id = '5eed0000-0000-4000-8000-000000000011')::int,
  '>=',
  2,
  'and removes nothing: the log is append-only through every path the API offers'
);
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated"}';

-- RGPD coverage ------------------------------------------------------------------------

-- THE STANDING RULE, exercised by the first table added since it landed. The
-- coverage assertion in 0011 fails when a table is missing from the registry;
-- these two assert the entry says the right thing, because "registered" and
-- "registered correctly" are different claims and only the second one erases her
-- data.
reset role;

select is(
  (select disposition from public.personal_data_disposition()
    where table_name = 'equipment_deliveries'),
  'purge',
  'the delivery log is registered for purge, not merely registered'
);

select is(
  (select participant_column from public.personal_data_disposition()
    where table_name = 'equipment_deliveries'),
  'profile_id',
  'and the registry names the column that points at her'
);

-- And the behaviour, not only the declaration: erasing her must leave nothing
-- here. Driven through the real function so the runtime sweep is what proves it.
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated"}';

insert into public.audit_log (org_id, actor_id, action, target_type, target_id)
values (
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8000-000000000001',
  'profile.media_purged',
  'profile',
  '5eed0000-0000-4000-8000-000000000011'
);

-- Present first: without this the "zero rows" below would pass against a
-- participant who never had a delivery.
reset role;
select cmp_ok(
  (select count(*) from public.equipment_deliveries
    where profile_id = '5eed0000-0000-4000-8000-000000000011')::int,
  '>=',
  2,
  'she has deliveries on record before the erasure'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated"}';

select lives_ok(
  $$ select public.delete_participant_permanently('5eed0000-0000-4000-8000-000000000011') $$,
  'erasing her succeeds with the new table in the schema'
);

reset role;

select is(
  (select count(*) from public.equipment_deliveries
    where profile_id = '5eed0000-0000-4000-8000-000000000011')::int,
  0,
  'and her delivery log is gone with everything else'
);

-- The other participants' rows are untouched, which is the half that stops
-- "erasure" from meaning "empty the table".
select cmp_ok(
  (select count(*) from public.equipment_deliveries)::int,
  '>=',
  1,
  'while another participant deliveries survive'
);

select * from finish();
rollback;
