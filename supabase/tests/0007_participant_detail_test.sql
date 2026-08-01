-- The staff-side participant detail: decrypting a participant's record, the
-- access audit that decryption leaves behind, append-only staff notes, editing,
-- and the active/inactive toggle (RAPP-24). Run with: bunx supabase test db
--
-- What these assertions defend, in order of how badly they would hurt:
--
--   1. **A read of someone's sensitive fields leaves a trace, always.** This is
--      the RGPD access log, arriving with the screen that does the reading
--      rather than in Phase 9. If a staff member can open a refugee woman's
--      document number, phone and address without the database recording who
--      did it and when, the organization cannot answer the one question the
--      regulation exists to let a data subject ask.
--   2. **The trace cannot be edited or erased.** An audit log that the auditee
--      can rewrite is decoration. There is no UPDATE and no DELETE policy on
--      it, deliberately, and these tests pin that.
--   3. **The audit never becomes a plaintext copy of the encrypted columns.**
--      Recording old and new values for `phone` or `document_number` would
--      quietly undo ADR-004: a breach would then hand over exactly the fields
--      the encryption exists to protect, in a table nobody thought to look at.
--      Encrypted fields are recorded as HAVING CHANGED, never as values.
--   4. **Only staff walk this path.** A participant reads herself through
--      `get_own_profile()`; the staff RPC is not a second door to her own row,
--      and it is certainly not a door to anybody else's.
--   5. **Notes are append-only.** A note is a record of what the team knew and
--      when. Silently editable notes are worth less than no notes.
--
-- Self-contained where it can be, and otherwise honest about running against the
-- seeded roster: the subject is Rosa Mamani (ordinal 26), who is seeded INACTIVE
-- and holds an encrypted document, which is exactly the shape the toggle and the
-- decryption need. The seeds deliberately audit a DIFFERENT participant, so the
-- counts below describe only what this transaction did.

begin;
select plan(44);

select vault.create_secret('test-encryption-key', 'app_encryption_key', 'pgTAP test key')
where not exists (select 1 from vault.secrets where name = 'app_encryption_key');

-- The cast is repeated rather than stored in a variable: pgTAP has no
-- variables, and a psql \set would not survive into the $$-quoted assertions.
-- Marta Puig is staff, Sílvia Bosch is an entity contact, Rosa Mamani and
-- Yolanda Quispe are participants.

-- Schema -----------------------------------------------------------------------

select has_table('public', 'audit_log', 'the audit log exists');
select has_column('public', 'audit_log', 'actor_id', 'an audit entry names who acted');
select has_column('public', 'audit_log', 'target_id', 'an audit entry names whose record was touched');
select has_column('public', 'audit_log', 'changes', 'an audit entry can carry what changed');
select has_table('public', 'participant_notes', 'staff notes exist');
select has_function(
  'public', 'get_participant_profile', array['uuid'],
  'the staff-side decrypting read RPC exists'
);
select has_function(
  'public', 'update_participant_profile', array['uuid', 'jsonb'],
  'the staff-side re-encrypting write RPC exists'
);
select has_function(
  'public', 'set_participant_active', array['uuid', 'boolean'],
  'the active/inactive toggle exists'
);
select has_function(
  'public', 'participant_activity', array['uuid'],
  'the activity timeline contract exists'
);

-- Reading a participant, as staff ------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated"}';

select is(
  (select document_number from public.get_participant_profile('5eed0000-0000-4000-8000-000000000026')),
  'Y0000026Z',
  'staff read a participant document number in clear'
);

select is(
  (select phone from public.get_participant_profile('5eed0000-0000-4000-8000-000000000026')),
  '+34600000026',
  'and her phone, decrypted server-side'
);

-- THE ASSERTION THIS ISSUE EXISTS FOR. Two reads above, so two audit rows: the
-- log records ACCESSES, not participants. A per-participant row would answer
-- "has anyone ever looked at her" and not "who looked at her, and when", which
-- is the question a data subject is entitled to ask.
select is(
  (select count(*) from public.audit_log
    where action = 'profile.view_sensitive'
      and target_id = '5eed0000-0000-4000-8000-000000000026'
      and actor_id = '5eed0000-0000-4000-8000-000000000002')::int,
  2,
  'every decryption of a participant record writes its own audit row'
);

select is(
  (select target_type from public.audit_log
    where action = 'profile.view_sensitive'
      and target_id = '5eed0000-0000-4000-8000-000000000026'
    limit 1),
  'profile',
  'and the row says what kind of record was read'
);

-- The audit is append-only. Neither of these raises (RLS filters rather than
-- refusing), and neither changes anything, which is the whole guarantee.
select lives_ok(
  $$ delete from public.audit_log where target_id = '5eed0000-0000-4000-8000-000000000026' $$,
  'deleting from the audit log raises nothing'
);

select is(
  (select count(*) from public.audit_log
    where target_id = '5eed0000-0000-4000-8000-000000000026')::int,
  2,
  '...and removes nothing: there is no DELETE policy on the audit log'
);

select lives_ok(
  $$ update public.audit_log set action = 'nothing.happened'
     where target_id = '5eed0000-0000-4000-8000-000000000026' $$,
  'updating the audit log raises nothing'
);

select is_empty(
  $$ select id from public.audit_log where action = 'nothing.happened' $$,
  '...and rewrites nothing: there is no UPDATE policy either'
);

-- An entry can only be written in the writer's own name. Forging one under a
-- colleague's id is the cheapest way to make an audit log useless.
select throws_ok(
  $$ insert into public.audit_log (org_id, actor_id, action, target_type, target_id)
     values ('5eed0000-0000-4000-8000-000000000000',
             '5eed0000-0000-4000-8000-000000000003',
             'profile.view_sensitive', 'profile',
             '5eed0000-0000-4000-8000-000000000026') $$,
  '42501',
  null::text,
  'an audit entry cannot be written in somebody else name'
);

-- Who may walk this path ----------------------------------------------------------

-- An entity contact reads nothing, and leaves no audit row: an access that did
-- not happen must not look like one that did.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated"}';

select is_empty(
  $$ select id from public.get_participant_profile('5eed0000-0000-4000-8000-000000000026') $$,
  'an entity contact reads no participant through the staff RPC'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000026", "role": "authenticated"}';

select is_empty(
  $$ select id from public.get_participant_profile('5eed0000-0000-4000-8000-000000000025') $$,
  'a participant cannot read another participant through it'
);

-- Not even herself. She has `get_own_profile()`; a second decrypting door onto
-- her own row would be a second thing to keep safe for no gain.
select is_empty(
  $$ select id from public.get_participant_profile('5eed0000-0000-4000-8000-000000000026') $$,
  'and not herself either: this is the staff path, not a second self-service one'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated"}';

select is(
  (select count(*) from public.audit_log
    where target_id = '5eed0000-0000-4000-8000-000000000026')::int,
  2,
  'and none of those refused reads wrote an audit row'
);

-- Editing a participant, as staff ---------------------------------------------------

select lives_ok(
  $$ select public.update_participant_profile(
       '5eed0000-0000-4000-8000-000000000026',
       jsonb_build_object(
         'first_name', 'Rosa', 'last_name', 'Mamani',
         'date_of_birth', '1996-03-27', 'place_of_birth', 'Oruro',
         'nationality', 'Bolívia', 'preferred_language', 'es',
         'document_type', 'nie', 'document_number', 'Y0000026Z',
         'phone', '+34600999026', 'address', 'Carrer de Prova, 26',
         'city', 'Manlleu', 'postal_code', '08560',
         'reference_entity', 'Creu Roja Osona', 'reference_contact_name', 'Sílvia Bosch',
         'has_dependents', true, 'num_dependents', 3,
         'clothing_size', 'M', 'shoe_size', '38', 'media_consent', false
       )
     ) $$,
  'staff edit a participant profile'
);

select is(
  (select public.decrypt_field(phone) from public.profiles
    where id = '5eed0000-0000-4000-8000-000000000026'),
  '+34600999026',
  'the edited phone round-trips through the encryption helpers'
);

-- Ciphertext in the column, not plaintext. A second write path that forgot to
-- encrypt is exactly the drift this asserts against.
select is_empty(
  $$ select id from public.profiles
     where id = '5eed0000-0000-4000-8000-000000000026'
       and encode(phone, 'escape') like '%+34600999026%' $$,
  'and it is stored as ciphertext, not as text that happens to decrypt'
);

select is(
  (select count(*) from public.audit_log
    where action = 'profile.update'
      and target_id = '5eed0000-0000-4000-8000-000000000026')::int,
  1,
  'an edit writes its own audit row'
);

select ok(
  (select changes ? 'city' and changes ? 'phone' from public.audit_log
    where action = 'profile.update'
      and target_id = '5eed0000-0000-4000-8000-000000000026'),
  'the audit row names the fields that actually changed'
);

select ok(
  (select not (changes ? 'nationality') from public.audit_log
    where action = 'profile.update'
      and target_id = '5eed0000-0000-4000-8000-000000000026'),
  'and does not name the fields that did not'
);

select is(
  (select changes -> 'city' from public.audit_log
    where action = 'profile.update'
      and target_id = '5eed0000-0000-4000-8000-000000000026'),
  '{"old": "Vic", "new": "Manlleu"}'::jsonb,
  'an ordinary field records what it went from and to'
);

-- THE OTHER ASSERTION THIS ISSUE EXISTS FOR. An audit log that stores the old
-- and new phone number is a plaintext mirror of the column ADR-004 encrypts.
select is(
  (select changes -> 'phone' from public.audit_log
    where action = 'profile.update'
      and target_id = '5eed0000-0000-4000-8000-000000000026'),
  '{"changed": true}'::jsonb,
  'an ENCRYPTED field records only that it changed: the audit is not a plaintext copy'
);

-- The edit RPC is not an escalation hole either.
select is(
  (select role from public.profiles where id = '5eed0000-0000-4000-8000-000000000026'),
  'player',
  'an edit cannot change the role, whatever the payload carries'
);

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000026", "role": "authenticated"}';

select throws_ok(
  $$ select public.update_participant_profile(
       '5eed0000-0000-4000-8000-000000000025',
       jsonb_build_object('first_name', 'Nobody')
     ) $$,
  '42501',
  null::text,
  'a participant cannot edit another participant through the staff RPC'
);

-- The active/inactive toggle ---------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated"}';

-- Rosa is seeded inactive (ordinal 26, a multiple of 13), so this is a real
-- transition rather than a write that changes nothing.
select is(
  (select is_active from public.profiles where id = '5eed0000-0000-4000-8000-000000000026'),
  false,
  'the subject starts out deactivated, as the seeds leave her'
);

select lives_ok(
  $$ select public.set_participant_active('5eed0000-0000-4000-8000-000000000026', true) $$,
  'staff reactivate a participant'
);

select is(
  (select is_active from public.profiles where id = '5eed0000-0000-4000-8000-000000000026'),
  true,
  'and she is active afterwards'
);

select is(
  (select changes from public.audit_log
    where action = 'profile.activate'
      and target_id = '5eed0000-0000-4000-8000-000000000026'),
  '{"is_active": {"old": false, "new": true}}'::jsonb,
  'the status change is audited with what it went from and to'
);

-- Staff notes --------------------------------------------------------------------------

select lives_ok(
  $$ insert into public.participant_notes (profile_id, author_id, body)
     values ('5eed0000-0000-4000-8000-000000000026',
             '5eed0000-0000-4000-8000-000000000002',
             'Ha demanat canviar l''horari dels entrenaments.') $$,
  'staff add a note about a participant'
);

select lives_ok(
  $$ update public.participant_notes set body = 'rewritten'
     where profile_id = '5eed0000-0000-4000-8000-000000000026' $$,
  'editing a note raises nothing'
);

select is_empty(
  $$ select id from public.participant_notes where body = 'rewritten' $$,
  '...and changes nothing: notes are append-only, with no UPDATE policy'
);

select lives_ok(
  $$ delete from public.participant_notes
     where profile_id = '5eed0000-0000-4000-8000-000000000026' $$,
  'deleting a note raises nothing'
);

select cmp_ok(
  (select count(*) from public.participant_notes
    where profile_id = '5eed0000-0000-4000-8000-000000000026')::int,
  '>=', 1,
  '...and removes nothing either'
);

-- Notes are the team's working record, written in front of a participant but not
-- addressed to her. She must not be able to read them, and must not be able to
-- write one in a staff member's name.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000026", "role": "authenticated"}';

select is_empty(
  $$ select id from public.participant_notes
     where profile_id = '5eed0000-0000-4000-8000-000000000026' $$,
  'a participant cannot read the staff notes about her'
);

select throws_ok(
  $$ insert into public.participant_notes (profile_id, author_id, body)
     values ('5eed0000-0000-4000-8000-000000000026',
             '5eed0000-0000-4000-8000-000000000026',
             'let me in') $$,
  '42501',
  null::text,
  'and cannot write one'
);

-- The timeline contract ------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated"}';

-- Phase 2 has no activity sources yet. What matters now is that the CONTRACT
-- exists and is typed, so the screen renders a real empty state and every later
-- phase adds a branch instead of inventing its own shape.
select is_empty(
  $$ select id from public.participant_activity('5eed0000-0000-4000-8000-000000000026') $$,
  'the activity timeline returns a typed empty set until later phases feed it'
);

select * from finish();
rollback;
