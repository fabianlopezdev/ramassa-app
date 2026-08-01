-- Player self-service: read your own profile in clear, edit it, ask to be
-- erased (RAPP-22).
--
-- Three pieces, and one idea behind all of them: the player owns her data and
-- can act on it WITHOUT staff, but the acts that are irreversible or that could
-- escalate privilege stay out of her reach by construction rather than by
-- client-side discipline.
--
--   1. `get_own_profile()` is the ONLY path that decrypts. It keys off
--      auth.uid() and takes no argument, so there is nothing to pass that could
--      widen it to another row.
--   2. `update_own_profile(payload)` re-encrypts what the onboarding RPC
--      encrypted, and silently ignores role, org and terms acceptance. A client
--      that echoes a whole profile back cannot escalate by accident, and an
--      attacker cannot escalate on purpose.
--   3. `deletion_requests` records an RGPD art. 17 request. Asking is not doing:
--      the erasure itself is a staff action with its own safeguards (RAPP-26),
--      so the player's DELETE remains blocked by the existing policy.

-- The erasure request ------------------------------------------------------------

create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- Her own words, in her own language. Staff answering the request need to
  -- know whether this is "delete everything" or "take me off the photos".
  reason text,
  state text not null default 'open' check (state in ('open', 'in_progress', 'done', 'declined')),
  -- What staff did about it, for the audit trail RGPD expects.
  resolution_note text,
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.deletion_requests is 'RGPD art. 17 erasure requests raised by a participant from her own profile. The request is a record, not an action: staff resolve it (RAPP-26).';

-- Staff open the queue by state, so that is what the index serves.
create index deletion_requests_state_idx on public.deletion_requests (state, created_at desc);
create index deletion_requests_profile_id_idx on public.deletion_requests (profile_id);

alter table public.deletion_requests enable row level security;

-- A participant sees her own requests (so the screen can say "we received it")
-- and staff see every request in their org.
create policy deletion_requests_select_self_or_org_staff
  on public.deletion_requests
  for select
  to authenticated
  using (
    profile_id = (select auth.uid())
    or (
      (select public.is_staff_or_admin())
      and exists (
        select 1 from public.profiles subject
        where subject.id = deletion_requests.profile_id
          and subject.org_id = (select public.current_org_id())
      )
    )
  );

-- Only for herself. `profile_id = auth.uid()` is the whole guarantee: a player
-- cannot file a request against another participant.
create policy deletion_requests_insert_self
  on public.deletion_requests
  for insert
  to authenticated
  with check (profile_id = (select auth.uid()));

-- Resolving is staff work. Deliberately no player UPDATE policy: withdrawing a
-- request is a conversation with the team, not a silent row edit, and no DELETE
-- policy at all, because the audit trail of who asked what and when is the point.
create policy deletion_requests_update_org_staff
  on public.deletion_requests
  for update
  to authenticated
  using (
    (select public.is_staff_or_admin())
    and exists (
      select 1 from public.profiles subject
      where subject.id = deletion_requests.profile_id
        and subject.org_id = (select public.current_org_id())
    )
  )
  with check (
    (select public.is_staff_or_admin())
    and exists (
      select 1 from public.profiles subject
      where subject.id = deletion_requests.profile_id
        and subject.org_id = (select public.current_org_id())
    )
  );

-- Reading your own profile --------------------------------------------------------

create or replace function public.get_own_profile()
returns table (
  id uuid,
  first_name text,
  last_name text,
  date_of_birth date,
  place_of_birth text,
  nationality text,
  preferred_language text,
  document_type text,
  document_number text,
  phone text,
  address text,
  city text,
  postal_code text,
  reference_entity text,
  reference_contact_name text,
  has_dependents boolean,
  num_dependents integer,
  clothing_size text,
  shoe_size text,
  avatar_url text,
  media_consent boolean,
  terms_accepted_at timestamptz
)
language sql
security invoker
set search_path = ''
stable
as $$
  select
    p.id,
    p.first_name,
    p.last_name,
    p.date_of_birth,
    p.place_of_birth,
    p.nationality,
    p.preferred_language,
    p.document_type,
    public.decrypt_field(p.document_number),
    public.decrypt_field(p.phone),
    public.decrypt_field(p.address),
    p.city,
    public.decrypt_field(p.postal_code),
    p.reference_entity,
    p.reference_contact_name,
    p.has_dependents,
    p.num_dependents,
    p.clothing_size,
    p.shoe_size,
    p.avatar_url,
    p.media_consent_at is not null,
    p.terms_accepted_at
  from public.profiles p
  where p.id = (select auth.uid());
$$;

comment on function public.get_own_profile is 'The caller own profile with the encrypted fields decrypted. SECURITY INVOKER and keyed on auth.uid(): RLS still applies and there is no argument that could widen it to another row.';

-- Editing your own profile ---------------------------------------------------------

create or replace function public.update_own_profile(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  document_type_value text := payload ->> 'document_type';
  document_number_value text := nullif(payload ->> 'document_number', '');
  place_of_birth_value text := nullif(trim(payload ->> 'place_of_birth'), '');
begin
  if caller is null then
    raise exception 'update_own_profile requires an authenticated caller'
      using errcode = 'insufficient_privilege';
  end if;

  if place_of_birth_value is null then
    raise exception 'update_own_profile requires place_of_birth'
      using errcode = 'not_null_violation';
  end if;

  -- Same first-class "no document" answer the wizard offers. Editing must not
  -- be stricter than intake, or a participant who has no papers cannot save.
  if document_type_value is distinct from 'none' and document_number_value is null then
    raise exception 'update_own_profile requires document_number unless document_type is none'
      using errcode = 'not_null_violation';
  end if;

  -- The column list IS the authorization boundary. `role`, `org_id`,
  -- `terms_accepted_at`, `is_active` and `is_forum_banned` are absent on
  -- purpose: they are not the participant's to change, and a payload that
  -- carries them (a client echoing the whole profile back, or an attacker
  -- trying it on) simply has those keys ignored.
  update public.profiles set
    first_name = payload ->> 'first_name',
    last_name = payload ->> 'last_name',
    date_of_birth = (payload ->> 'date_of_birth')::date,
    place_of_birth = place_of_birth_value,
    nationality = payload ->> 'nationality',
    preferred_language = coalesce(nullif(payload ->> 'preferred_language', ''), preferred_language),
    document_type = document_type_value,
    document_number = public.encrypt_field(document_number_value),
    phone = public.encrypt_field(nullif(payload ->> 'phone', '')),
    address = public.encrypt_field(nullif(payload ->> 'address', '')),
    city = nullif(payload ->> 'city', ''),
    postal_code = public.encrypt_field(nullif(payload ->> 'postal_code', '')),
    reference_entity = nullif(payload ->> 'reference_entity', ''),
    reference_contact_name = nullif(payload ->> 'reference_contact_name', ''),
    has_dependents = coalesce((payload ->> 'has_dependents')::boolean, false),
    num_dependents = coalesce((payload ->> 'num_dependents')::integer, 0),
    clothing_size = nullif(payload ->> 'clothing_size', ''),
    shoe_size = nullif(payload ->> 'shoe_size', ''),
    avatar_url = coalesce(nullif(payload ->> 'avatar_url', ''), avatar_url),
    -- Revocable in both directions, unlike the terms: a woman who agreed to
    -- appear in photos must be able to change her mind from this screen.
    media_consent_at = case
      when (payload ->> 'media_consent')::boolean then coalesce(media_consent_at, now())
      else null
    end,
    updated_at = now()
  where id = caller;
end;
$$;

comment on function public.update_own_profile is 'Edits the caller own profile, re-encrypting the sensitive fields server-side. SECURITY INVOKER, so the no-escalation UPDATE policy still applies; role, org and terms acceptance are not in the column list and cannot be changed through it.';
