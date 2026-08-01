-- Full-text search over participants, and who is allowed to run it (RAPP-23).
-- Run with: bunx supabase test db
--
-- What these assertions defend:
--   1. Staff find people the way they actually type their names. "Nuria" must
--      find Núria and "Osona" must find the entity, or the search box is
--      decoration and the team goes back to scrolling.
--   2. Arabic and Cyrillic names are searchable as first-class text, not as
--      transliterations someone has to guess.
--   3. ENCRYPTED fields are NOT searchable, by construction. A document number
--      cannot be found by typing it, because the column holds ciphertext and no
--      index could see through it without defeating the encryption. This is a
--      deliberate limitation and the test pins it so nobody "fixes" it later by
--      indexing the plaintext.
--   4. The table is staff-only. An entity contact and a participant must not be
--      able to enumerate the roster, whatever query they send.
--
-- Runs in a transaction and rolls back. Uses the seeded roster: the point is
-- that search works against the data the app actually ships with.

begin;
select plan(13);

select vault.create_secret('test-encryption-key', 'app_encryption_key', 'pgTAP test key')
where not exists (select 1 from vault.secrets where name = 'app_encryption_key');

-- Schema -------------------------------------------------------------------------

select has_column('public', 'profiles', 'search_document', 'profiles carries a searchable document');
select has_index('public', 'profiles', 'profiles_search_document_idx', 'the search document is indexed');

-- Searching as staff ---------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000002", "role": "authenticated"}';

-- Accent folding, in both directions: the team types what is on their keyboard,
-- and a name typed with its accents must still find itself.
select isnt_empty(
  $$ select id from public.profiles
     where search_document @@ websearch_to_tsquery('simple', public.immutable_unaccent('nuria')) $$,
  'searching "nuria" finds Núria: accents are folded'
);

select isnt_empty(
  $$ select id from public.profiles
     where search_document @@ websearch_to_tsquery('simple', public.immutable_unaccent('Núria')) $$,
  'searching "Núria" finds her too: folding works in both directions'
);

select isnt_empty(
  $$ select id from public.profiles
     where search_document @@ websearch_to_tsquery('simple', public.immutable_unaccent('أمينة')) $$,
  'Arabic names are searchable in Arabic'
);

select isnt_empty(
  $$ select id from public.profiles
     where search_document @@ websearch_to_tsquery('simple', public.immutable_unaccent('Оксана')) $$,
  'Cyrillic names are searchable in Cyrillic'
);

-- The searchable fields are the non-encrypted ones, so a team member can find
-- everyone referred by an entity, or everyone from one town.
select isnt_empty(
  $$ select id from public.profiles
     where search_document @@ websearch_to_tsquery('simple', public.immutable_unaccent('Creu Roja')) $$,
  'the referring entity is searchable'
);

select isnt_empty(
  $$ select id from public.profiles
     where search_document @@ websearch_to_tsquery('simple', public.immutable_unaccent('Vic')) $$,
  'the town is searchable'
);

-- The deliberate limitation. A document number is ciphertext at rest; there is
-- no index that could find it without holding the plaintext somewhere, which is
-- exactly what ADR-004 refuses to do.
select is_empty(
  $$ select id from public.profiles
     where search_document @@ websearch_to_tsquery('simple', public.immutable_unaccent('X1234567L')) $$,
  'encrypted fields are NOT searchable, and that is the design, not a gap'
);

-- Who may run it -------------------------------------------------------------------

-- Staff see their own organization's roster.
select cmp_ok(
  (select count(*) from public.profiles where role = 'player')::int,
  '>=', 20,
  'staff can enumerate the roster of their own organization'
);

-- An entity contact sees NOTHING here. Access to the participants she referred
-- arrives with the referrals table; the roster itself is not hers to read.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000004", "role": "authenticated"}';

select is(
  (select count(*) from public.profiles where role = 'player')::int, 0,
  'an entity contact cannot enumerate participants'
);

-- A participant sees only herself, however she searches.
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000011", "role": "authenticated"}';

select is(
  (select count(*) from public.profiles where role = 'player')::int, 1,
  'a participant sees only her own row, not the roster'
);

select is(
  (select count(*) from public.profiles
    where search_document @@ websearch_to_tsquery('simple', public.immutable_unaccent('Оксана')))::int,
  0,
  'and searching for another participant by name does not widen that by one row'
);

select * from finish();
rollback;
