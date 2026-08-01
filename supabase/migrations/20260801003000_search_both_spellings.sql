-- Search has to work for the word as it is WRITTEN as well as for the word as
-- it is typed (RAPP-23 follow-up).
--
-- The first version folded accents on the stored side only: "torello" found
-- Torelló, but "Torelló" found nothing, because nothing folds the QUERY. The
-- app cannot fold it either: `unaccent` is a database dictionary, and
-- reimplementing it in JavaScript would be a second copy to drift.
--
-- So the document now carries BOTH spellings, the folded one and the original.
-- Whichever the staff member types is present in the index, and the dictionary
-- stays in exactly one place. The cost is a slightly larger index over a table
-- of hundreds of rows, which is nothing next to a search box that fails for
-- anyone who types their own language correctly.
--
-- The column is generated, so its expression cannot be altered in place: it is
-- dropped and rebuilt, and the index with it.

drop index if exists profiles_search_document_idx;
alter table public.profiles drop column if exists search_document;

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
      ) || ' ' ||
      coalesce(first_name, '') || ' ' ||
      coalesce(last_name, '') || ' ' ||
      coalesce(nationality, '') || ' ' ||
      coalesce(city, '') || ' ' ||
      coalesce(place_of_birth, '') || ' ' ||
      coalesce(reference_entity, '') || ' ' ||
      coalesce(reference_contact_name, '')
    )
  ) stored;

comment on column public.profiles.search_document is 'Searchable text in BOTH spellings, accent-folded and as written, so a query matches whichever the staff member types. Deliberately excludes every encrypted column (ADR-004): making ciphertext searchable would mean keeping the plaintext somewhere.';

create index profiles_search_document_idx on public.profiles using gin (search_document);
