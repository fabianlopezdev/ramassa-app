-- The RGPD lifecycle: soft deactivation, anonymization, and full erasure
-- (RAPP-26). Run with: bunx supabase test db
--
-- This is the most consequential data path in the schema, and the assertions
-- below are ordered by how badly the failure would hurt.
--
--   1. **Nobody but an admin can erase.** Erasure is terminal and silent to the
--      person it happens to. Staff, an entity contact and a participant are each
--      refused explicitly rather than inferred from the guard existing.
--   2. **Erasure is COMPLETE.** Not "the tables we remembered": the sweep is
--      driven by `personal_data_disposition()`, the registry every table in this
--      schema must appear in, so a table added by a future migration and not
--      registered turns this file red on the next run. That is the standing rule
--      the issue records, enforced by machine rather than by memory.
--   3. **Erasure is never partial-silent.** One transaction, and a post-check
--      that re-reads the registry and raises if anything survived. A half-erased
--      participant is worse than an un-erased one: nobody would go back to look.
--   4. **The media sweep cannot be skipped.** R2 lives outside Postgres, so the
--      objects are removed first, by the media Worker, which records a receipt in
--      the audit trail. This function refuses to run without a fresh one. A
--      client that skips that call cannot delete the rows.
--   5. **Anonymization keeps the aggregate and drops the person.** She still
--      counts in a report by nationality; her name, papers, contact details and
--      the team's notes about her are gone, and her birth date is coarsened to a
--      year because an exact date plus a nationality plus a town identifies one
--      woman in a roster this size.
--   6. **The audit trail survives her**, as target. Decided by Fabián
--      2026-08-01 and recorded in ADR-023: those rows carry opaque IDs and no
--      personal data (ADR-021), they are the evidence the erasure happened and
--      that every earlier access to her record was lawful, and art. 17(3)
--      permits keeping them. Rows where she was the ACTOR go, because that FK
--      does not cascade and would otherwise make her undeletable.
--
-- Runs in a transaction and rolls back. Counts are scoped to
-- `created_at >= now()` (the transaction timestamp) so a suite that has already
-- driven these screens in a browser cannot turn this file red.

begin;
select plan(43);

select vault.create_secret('test-encryption-key', 'app_encryption_key', 'pgTAP test key')
where not exists (select 1 from vault.secrets where name = 'app_encryption_key');

-- The cast: Laia Ferrer is the admin (…001), Marta Puig staff (…002), Sílvia
-- Bosch an entity contact (…004). Amina al-Hassan (…011) is the subject: she is
-- the seeded participant with a row in almost every table, which is what makes
-- the sweep below able to fail.

-- Written as literals rather than held in a temporary table: half of these
-- assertions run as `authenticated`, which has no privileges on a temp table,
-- and a helper that makes a spec fail for a reason unrelated to the thing under
-- test is worse than the repetition it saves.

-- Schema and the registry ---------------------------------------------------------

select has_function('public', 'is_admin', array[]::text[], 'the admin-only predicate exists');
select has_function(
  'public', 'personal_data_disposition', array[]::text[],
  'the personal-data registry exists'
);
select has_function(
  'public', 'anonymize_participant', array['uuid'],
  'the anonymization RPC exists'
);
select has_function(
  'public', 'delete_participant_permanently', array['uuid'],
  'the erasure RPC exists'
);
select ok(
  position(
    'leftovers text[] := array[]::text[];'::text in
    pg_get_functiondef('public.delete_participant_permanently(uuid)'::regprocedure)
  ) > 0,
  'the erasure post-check accumulator has an explicit array type'
);

-- THE COVERAGE ASSERTION, and the reason this file is worth writing.
--
-- Every base table in `public` must appear in the registry with a disposition,
-- so the question "what happens to this table when a woman asks to be erased"
-- is answered ONCE PER TABLE, in writing, at the moment the table is created.
-- A future migration that adds a personal-data table and forgets to register it
-- fails HERE, loudly, rather than quietly leaving her data behind.
select is(
  (
    select coalesce(array_agg(t.table_name::text order by t.table_name::text), '{}')
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and not exists (
        select 1 from public.personal_data_disposition() d
        where d.table_name = t.table_name::text
      )
  ),
  '{}'::text[],
  'every table in the public schema is registered with an erasure disposition'
);

-- And the other direction: a registry entry for a table that no longer exists
-- means a rename went through without the erasure path following it, which is
-- exactly how a purge starts silently skipping a table.
select is(
  (
    select coalesce(array_agg(distinct d.table_name order by d.table_name), '{}')
    from public.personal_data_disposition() d
    where not exists (
      select 1 from information_schema.tables t
      where t.table_schema = 'public'
        and t.table_type = 'BASE TABLE'
        and t.table_name::text = d.table_name
    )
  ),
  '{}'::text[],
  'and every registered table still exists under that name'
);

-- A retained table has to say WHY in the registry. The retention decision is the
-- one a data-protection reviewer will ask about, so it is not allowed to be an
-- unexplained row.
select ok(
  (
    select bool_and(coalesce(length(btrim(d.reason)), 0) > 20)
    from public.personal_data_disposition() d
    where d.disposition = 'retain'
  ),
  'every retained table carries a written reason for keeping it'
);

-- Where her rows actually are ---------------------------------------------------------

-- The sweep helper the erasure assertions below stand on: it asks the registry
-- which (table, column) pairs must hold nothing for her, and returns the ones
-- that still do.
--
-- Run as the OWNER, deliberately. The claim under test is "no row exists
-- anywhere", and an `authenticated` vantage would answer "no row I am allowed to
-- see", which is the same green for a very different world.
create or replace function pg_temp.rows_left_for(participant uuid)
returns text[]
language plpgsql
as $$
declare
  entry record;
  remaining bigint;
  leftovers text[] := '{}';
begin
  for entry in
    select table_name, participant_column
    from public.personal_data_disposition()
    where disposition = 'purge'
  loop
    execute format(
      'select count(*) from public.%I where %I = $1',
      entry.table_name, entry.participant_column
    ) into remaining using participant;
    if remaining > 0 then
      leftovers := leftovers || format('%s.%s', entry.table_name, entry.participant_column);
    end if;
  end loop;
  return leftovers;
end;
$$;

-- She writes one audit row in her OWN name, through the policy that permits
-- exactly that and nothing wider. Without this row the "actor rows are purged"
-- assertion further down would be asserting nothing at all: the seeds give a
-- participant no actions, so it would pass against a function that never touched
-- the column, and the non-cascading FK it exists for would surface for the first
-- time in production.
set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';
insert into public.audit_log (org_id, actor_id, action, target_type, target_id)
values (
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8000-000000000011',
  'profile.view_own',
  'profile',
  '5eed0000-0000-4000-8000-000000000011'
);
reset role;

-- An invitation she accepted: her email address, on a row whose FK to her
-- profile does NOT cascade. This is the row that makes a naive
-- `delete from profiles` fail with a foreign-key violation.
insert into public.invites (org_id, email, invited_by, expires_at, accepted_at, accepted_by)
values (
  '5eed0000-0000-4000-8000-000000000000',
  'amina.alhassan@example.test',
  '5eed0000-0000-4000-8000-000000000002',
  now() + interval '7 days',
  now(),
  '5eed0000-0000-4000-8000-000000000011'
);

-- THE ASSERTION THAT MAKES EVERY "ZERO ROWS" BELOW MEAN SOMETHING. An absence
-- check succeeds the instant it is true, so on a participant with no rows to
-- begin with the whole erasure section would pass against a function that does
-- nothing. Proving she is PRESENT in several tables first is what turns the
-- later empty result into evidence.
select cmp_ok(
  array_length(pg_temp.rows_left_for('5eed0000-0000-4000-8000-000000000011'::uuid), 1),
  '>=',
  5,
  'the subject starts out with rows in at least five registered places'
);

select cmp_ok(
  (select count(*) from public.attendance
    where player_id = '5eed0000-0000-4000-8000-000000000011'::uuid)::int,
  '>=',
  1,
  'the erasure subject starts with at least one attendance mark'
);

-- Anonymization ------------------------------------------------------------------------

-- Primed so the assertions can fail: a woman who never granted media consent
-- would make "consent is revoked" green against a function that ignores the
-- column entirely.
update public.profiles
   set media_consent_at = now(),
       reference_entity = 'Creu Roja Osona',
       reference_contact_name = 'Marta Vidal',
       phone = public.encrypt_field('600111222'),
       address = public.encrypt_field('Carrer de la Riera 14'),
       postal_code = public.encrypt_field('08500'),
       document_number = public.encrypt_field('X1234567L'),
       avatar_url = 'profile-photos/fatima.jpg'
 where id = '5eed0000-0000-4000-8000-000000000012'::uuid;

-- And one staff note about her. The seeds give this participant none, so
-- without it the "the notes are removed" assertion below would compare zero to
-- zero and pass against a function that never touches the table.
insert into public.participant_notes (profile_id, author_id, body)
values (
  '5eed0000-0000-4000-8000-000000000012'::uuid,
  '5eed0000-0000-4000-8000-000000000002',
  'Ha demanat ajuda amb el transport els dimarts.'
);

-- A submitted story gives the subject two references from knowledge_articles:
-- author_id cascades the article, while created_by is cleared first. This order
-- used to make the article preparation trigger reject the erasure halfway
-- through, even though both references were headed for deletion.
insert into public.knowledge_articles (
  category_id,
  title,
  body,
  content_type,
  story_status,
  author_id,
  submission_language,
  publication_consent,
  publication_consent_at,
  publication_consent_version,
  created_by
)
values (
  '5eed0000-0000-4000-8004-000000000004',
  '{"ca":"La història que vull compartir"}'::jsonb,
  '{"ca":[{"type":"paragraph","text":"Vaig trobar un lloc on sentir-me part de l''equip."}]}'::jsonb,
  'participant_story',
  'submitted',
  '5eed0000-0000-4000-8000-000000000011',
  'ca',
  true,
  now(),
  'story-publication-v1',
  '5eed0000-0000-4000-8000-000000000011'
);

select is(
  (select count(*) from public.knowledge_articles
    where author_id = '5eed0000-0000-4000-8000-000000000011'::uuid)::int,
  1,
  'the erasure subject starts with a submitted story attributed to her'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated"}';

select throws_ok(
  $$ select public.anonymize_participant('5eed0000-0000-4000-8000-000000000012') $$,
  '42501',
  null::text,
  'an entity contact cannot anonymize a participant'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000026", "role": "authenticated"}';

select throws_ok(
  $$ select public.anonymize_participant('5eed0000-0000-4000-8000-000000000012') $$,
  '42501',
  null::text,
  'and neither can a participant, including on her own record'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated"}';

select lives_ok(
  $$ select public.anonymize_participant('5eed0000-0000-4000-8000-000000000012') $$,
  'staff can anonymize a participant'
);

reset role;

select ok(
  (select not is_active from public.profiles where id = '5eed0000-0000-4000-8000-000000000012'::uuid),
  'an anonymized participant is deactivated in the same gesture'
);

select ok(
  (
    select first_name <> 'فاطمة' and last_name <> 'الزهراء'
    from public.profiles where id = '5eed0000-0000-4000-8000-000000000012'::uuid
  ),
  'her name no longer appears on the row'
);

select ok(
  (
    select document_number is null and phone is null and address is null and postal_code is null
    from public.profiles where id = '5eed0000-0000-4000-8000-000000000012'::uuid
  ),
  'the four encrypted fields are emptied, not merely re-encrypted'
);

select ok(
  (
    select reference_contact_name is null and place_of_birth is null and avatar_url is null
    from public.profiles where id = '5eed0000-0000-4000-8000-000000000012'::uuid
  ),
  'and so are the free-text fields that name her or place her'
);

-- An exact birth date next to a nationality and a town identifies one woman in a
-- roster this size. The year alone still answers every age-band question a
-- funder report asks.
select is(
  (select date_of_birth from public.profiles where id = '5eed0000-0000-4000-8000-000000000012'::uuid),
  '1997-01-01'::date,
  'her birth date is coarsened to the first of her birth year'
);

-- THE OTHER HALF OF ANONYMIZATION, and the reason it is not just deletion: the
-- row still carries what a report counts.
select is(
  (select nationality from public.profiles where id = '5eed0000-0000-4000-8000-000000000012'::uuid),
  'Marroc',
  'her nationality survives, because the impact report counts it'
);

select is(
  (select reference_entity from public.profiles where id = '5eed0000-0000-4000-8000-000000000012'::uuid),
  'Creu Roja Osona',
  'and so does the entity that referred her'
);

-- Consent to appear in photographs cannot outlive the person it belonged to: a
-- standing permission on an anonymous row is a permission nobody can withdraw.
select ok(
  (select media_consent_at is null from public.profiles where id = '5eed0000-0000-4000-8000-000000000012'::uuid),
  'her media consent is revoked rather than inherited by the anonymous row'
);

-- The team's notes are prose about her life. Keeping them would leave the row
-- anonymous in the columns and fully identifying in the paragraphs.
select is(
  (select count(*) from public.participant_notes where profile_id = '5eed0000-0000-4000-8000-000000000012'::uuid)::int,
  0,
  'the staff notes about her are removed, not anonymized around'
);

select is(
  (select count(*) from public.push_tokens where user_id = '5eed0000-0000-4000-8000-000000000012'::uuid)::int,
  0,
  'and her device tokens go, so nothing can be delivered to her phone afterwards'
);

select is(
  (select count(*) from public.audit_log
    where action = 'profile.anonymize'
      and target_id = '5eed0000-0000-4000-8000-000000000012'::uuid
      and created_at >= now())::int,
  1,
  'anonymizing is audited under its own action'
);

-- Erasure: who may ------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated"}';

-- Staff run the day-to-day record. Erasure is terminal, so it is the one action
-- that stops at the admin. This assertion is the difference between the two
-- roles meaning something and the distinction being decorative.
select throws_ok(
  $$ select public.delete_participant_permanently('5eed0000-0000-4000-8000-000000000011') $$,
  '42501',
  null::text,
  'a staff member cannot erase a participant: erasure is an admin action'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated"}';

select throws_ok(
  $$ select public.delete_participant_permanently('5eed0000-0000-4000-8000-000000000011') $$,
  '42501',
  null::text,
  'nor can an entity contact'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';

select throws_ok(
  $$ select public.delete_participant_permanently('5eed0000-0000-4000-8000-000000000011') $$,
  '42501',
  null::text,
  'and neither can the participant herself, whose own request is a request'
);

-- Erasure: the media receipt ----------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated"}';

-- The objects in R2 are outside this database and outside this transaction, so
-- "her media is gone" cannot be something the caller merely promises. The media
-- Worker records a receipt in the append-only trail, in the admin's own name,
-- and this function refuses without a fresh one.
select throws_ok(
  $$ select public.delete_participant_permanently('5eed0000-0000-4000-8000-000000000011') $$,
  'P0001',
  null::text,
  'an admin without a media-purge receipt is refused: the objects come first'
);

select is(
  (select count(*) from public.profiles where id = '5eed0000-0000-4000-8000-000000000011'::uuid)::int,
  1,
  'and nothing was deleted on the way to that refusal'
);

-- The receipt the Worker writes after it has swept her prefix from the bucket.
insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
values (
  '5eed0000-0000-4000-8000-000000000000',
  '5eed0000-0000-4000-8000-000000000001',
  'profile.media_purged',
  'profile',
  '5eed0000-0000-4000-8000-000000000011',
  jsonb_build_object('objects_deleted', 3)
);

-- A receipt for SOMEBODY ELSE must not unlock this erasure. Without this
-- assertion the check above would pass against a function that only counts
-- receipts and never looks at whose they are.
select throws_ok(
  $$ select public.delete_participant_permanently('5eed0000-0000-4000-8000-000000000013') $$,
  'P0001',
  null::text,
  'a receipt for one participant does not authorize erasing another'
);

-- Erasure: the act -----------------------------------------------------------------------

select lives_ok(
  $$ select public.delete_participant_permanently('5eed0000-0000-4000-8000-000000000011') $$,
  'an admin with a fresh receipt erases the participant'
);

reset role;

-- THE ASSERTION THE WHOLE FILE EXISTS FOR. Registry-driven, so it grows itself:
-- a table added next year and registered as `purge` is swept here without anyone
-- editing this line, and one added without being registered fails the coverage
-- assertion at the top instead.
select is(
  pg_temp.rows_left_for('5eed0000-0000-4000-8000-000000000011'::uuid),
  '{}'::text[],
  'no row referencing her survives in any table registered for purge'
);

select is(
  (select count(*) from public.attendance
    where player_id = '5eed0000-0000-4000-8000-000000000011'::uuid)::int,
  0,
  'attendance marks are removed with the participant rather than retaining a shadow identity'
);

select is(
  (select count(*) from auth.users where id = '5eed0000-0000-4000-8000-000000000011'::uuid)::int,
  0,
  'her authentication identity is gone, so the credential cannot sign in again'
);

select is(
  (select count(*) from auth.identities where user_id = '5eed0000-0000-4000-8000-000000000011'::uuid)::int,
  0,
  'and so is the email identity a login would resolve through'
);

select is(
  (select count(*) from public.invites where email = 'amina.alhassan@example.test')::int,
  0,
  'the invitation carrying her email address goes too, keyed by the address itself'
);

-- The retention decision, asserted in both directions ---------------------------------

select is(
  (select count(*) from public.audit_log
    where actor_id = '5eed0000-0000-4000-8000-000000000011'::uuid)::int,
  0,
  'audit rows where SHE was the actor are purged'
);

-- Kept on purpose (ADR-023): opaque IDs, no personal data, and the only record
-- that her data was ever accessed lawfully and then erased.
select cmp_ok(
  (select count(*) from public.audit_log where target_id = '5eed0000-0000-4000-8000-000000000011'::uuid)::int,
  '>=',
  2,
  'audit rows where she was the TARGET survive her, as the trail of what was done'
);

select is(
  (select count(*) from public.audit_log
    where action = 'profile.delete'
      and target_id = '5eed0000-0000-4000-8000-000000000011'::uuid
      and created_at >= now())::int,
  1,
  'the erasure itself is audited, and that row outlives the row it describes'
);

-- NOT asserted here, on purpose: that the audit row is written BEFORE the
-- deletes. Both writes land in one transaction, so their timestamps are
-- identical and any ordering check would be green whatever the function does.
-- The ordering is still how the function is written (a failure should leave the
-- attempt on the record), but an assertion that cannot fail is not evidence, and
-- one sitting here would read as though that property were covered.
--
-- What IS assertable is that the row describing her erasure does not itself
-- become the last copy of her data (ADR-021, inherited by every writer).
select ok(
  (
    select changes::text not like '%الزهراء%'
       and changes::text not like '%amina%'
       and coalesce(changes ->> 'first_name', '') = ''
       and coalesce(changes ->> 'phone', '') = ''
    from public.audit_log
    where action = 'profile.delete' and target_id = '5eed0000-0000-4000-8000-000000000011'::uuid
  ),
  'and it names no field of hers: the trail that outlives her holds only opaque ids'
);

-- Erasure: failing loudly ------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated"}';

-- A no-op that reports success is how a staff member tells a woman her data is
-- gone when it is not. Erasing nothing is an error.
select throws_ok(
  $$ select public.delete_participant_permanently('5eed0000-0000-4000-8000-999999999999') $$,
  'P0001',
  null::text,
  'erasing an id that matches nobody fails rather than reporting success'
);

-- Deactivation still works on its own, unchanged: not every request to leave is
-- a request to be erased, and the reversible option must stay the easy one.
select lives_ok(
  $$ select public.set_participant_active('5eed0000-0000-4000-8000-000000000014', false) $$,
  'plain deactivation is untouched and remains the reversible option'
);

select * from finish();
rollback;
