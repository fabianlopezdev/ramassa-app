-- Full-text search over the participant roster (RAPP-23).
--
-- WHAT IS SEARCHABLE, AND WHY THAT LIST STOPS WHERE IT DOES
--
-- The document covers the non-encrypted, non-identifying-on-their-own fields a
-- staff member would actually type: names, nationality, town, place of birth,
-- and the referring entity and contact.
--
-- The ENCRYPTED columns (document number, phone, address, postal code) are
-- absent, and that is the design rather than an omission. They hold ciphertext,
-- so the only way to make them searchable would be to keep a plaintext copy or
-- a plaintext-derived index somewhere, which is precisely what ADR-004 refuses:
-- a database breach would then hand over the identity documents and home
-- addresses of a roster of refugee women. Searching by document number is not
-- worth that, so it is not possible, and 0006_participant_search_test.sql pins
-- the limitation so a future "improvement" has to argue with a failing test.
--
-- ACCENTS
--
-- The team types "nuria" and expects Núria. `unaccent` is STABLE rather than
-- IMMUTABLE (it reads a dictionary), so it cannot be used directly in a
-- generated column; the wrapper below pins the dictionary by name, which makes
-- it immutable in the sense Postgres needs. Arabic, Farsi and Cyrillic pass
-- through as their own tokens under the 'simple' configuration, which is what
-- this roster needs: no stemmer for those scripts would be an improvement over
-- exact-token matching on names.

create extension if not exists unaccent with schema extensions;

create or replace function public.immutable_unaccent(value text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, value);
$$;

comment on function public.immutable_unaccent is 'Accent-folding that Postgres will accept in a generated column and an index. The dictionary is named explicitly, which is what makes it immutable rather than stable.';

alter table public.profiles
  add column search_document tsvector
  generated always as (
    to_tsvector(
      'simple',
      public.immutable_unaccent(
        coalesce(first_name, '') || ' ' ||
        coalesce(last_name, '') || ' ' ||
        coalesce(nationality, '') || ' ' ||
        coalesce(city, '') || ' ' ||
        coalesce(place_of_birth, '') || ' ' ||
        coalesce(reference_entity, '') || ' ' ||
        coalesce(reference_contact_name, '')
      )
    )
  ) stored;

comment on column public.profiles.search_document is 'Searchable text: names, nationality, town, place of birth and referring entity. Deliberately excludes every encrypted column (ADR-004): making ciphertext searchable would mean keeping the plaintext somewhere.';

create index profiles_search_document_idx on public.profiles using gin (search_document);

-- The filters the staff table offers, each backed by the index the query will
-- actually use. `org_id` leads every one of them because RLS scopes every query
-- to the caller's organization, so it is the first predicate in practice.
create index profiles_org_role_active_idx
  on public.profiles (org_id, role, is_active);

create index profiles_org_reference_entity_idx
  on public.profiles (org_id, reference_entity)
  where reference_entity is not null;

create index profiles_org_nationality_idx
  on public.profiles (org_id, nationality)
  where nationality is not null;

-- Sorting defaults to the name the table shows, so it is worth an index of its
-- own rather than a sort of the whole org on every page.
create index profiles_org_last_name_idx
  on public.profiles (org_id, last_name, first_name);
