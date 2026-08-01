-- The values the roster's filter dropdowns offer (RAPP-23).
--
-- Derived from the data rather than hardcoded: the entities that actually refer
-- participants and the nationalities actually present change over the life of
-- the programme, and a hardcoded list would quietly stop matching reality.
--
-- SECURITY INVOKER, so RLS decides what the caller can see: staff get their own
-- organization's values, and anyone who cannot read the roster gets nothing.
-- Computing this in the client would mean fetching every row to collect its
-- distinct values, which is exactly what the server-side paging avoids.

create or replace function public.participant_filter_options()
returns table (entities text[], nationalities text[])
language sql
security invoker
set search_path = ''
stable
as $$
  select
    coalesce(array_agg(distinct p.reference_entity) filter (where p.reference_entity is not null), '{}'),
    coalesce(array_agg(distinct p.nationality) filter (where p.nationality is not null), '{}')
  from public.profiles p
  where p.role = 'player';
$$;

comment on function public.participant_filter_options is 'The distinct referring entities and nationalities present in the caller''s own roster, for the staff table''s filters. SECURITY INVOKER: RLS scopes it, so a caller who cannot read participants gets empty arrays.';
