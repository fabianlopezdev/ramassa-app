-- Onboarding intake (RAPP-21): the three schema deltas the intake spec asked
-- for, the versioned terms-acceptance record, and the one RPC a player's device
-- calls to complete onboarding atomically.
--
-- Field list, encryption decisions and the "deliberately excluded" list come
-- from the RAPP-4 deliverable (onboarding-intake-schema), which is the contract
-- this migration implements. Anything not in that document is not collected.

-- Schema deltas -----------------------------------------------------------------
-- Both were in the kickoff field list but missing from the SPEC profiles table.

alter table public.profiles add column if not exists place_of_birth text;

comment on column public.profiles.place_of_birth is 'Free text, optional. Kickoff field; cleartext because it carries no locating precision beyond nationality.';

-- Separate from terms_accepted_at ON PURPOSE (RGPD granularity): agreeing to use
-- the app is not agreeing to appear in a public gallery, and this one is
-- revocable from the profile screen without withdrawing from the programme.
alter table public.profiles add column if not exists media_consent_at timestamptz;

comment on column public.profiles.media_consent_at is 'Optional, separate, revocable consent for photos/stories appearing in community surfaces. NULL means not granted. Never required to finish onboarding.';

-- Terms acceptances ------------------------------------------------------------
-- The profiles summary column answers "have they accepted?"; RGPD also requires
-- "accepted WHAT, in WHICH language, WHEN". A boolean cannot answer that after
-- the text is revised, so each acceptance is an append-only event.

create table if not exists public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  terms_version text not null,
  locale_shown text not null check (locale_shown in ('ca', 'es', 'en', 'ar', 'fa')),
  accepted_at timestamptz not null default now()
);

comment on table public.terms_acceptances is 'Append-only record of every terms acceptance: which version, in which language it was displayed, and when. RGPD evidence; never updated or deleted except by cascade with the profile.';

-- Postgres does not index foreign keys automatically, and every read of this
-- table is "the acceptances for one profile" (plus the cascade on profile
-- delete, which would otherwise scan).
create index if not exists terms_acceptances_profile_id_idx
  on public.terms_acceptances (profile_id);

alter table public.terms_acceptances enable row level security;

-- Reads: your own acceptances; staff and admin see their org's, which is how a
-- consent question from a participant gets answered without a database console.
create policy terms_acceptances_select_self_or_org_staff
  on public.terms_acceptances
  for select
  to authenticated
  using (
    profile_id = (select auth.uid())
    or (
      (select public.is_staff_or_admin())
      and exists (
        select 1
        from public.profiles as subject
        where subject.id = terms_acceptances.profile_id
          and subject.org_id = (select public.current_org_id())
      )
    )
  );

-- Writes: only ever about yourself. No update or delete policy exists at all,
-- which is what makes the table append-only for everyone including staff.
create policy terms_acceptances_insert_self
  on public.terms_acceptances
  for insert
  to authenticated
  with check (profile_id = (select auth.uid()));

-- Self-insert of the profile ---------------------------------------------------
-- Onboarding is the moment a player's profile first exists, so INSERT needs a
-- policy of its own. The `with check` is where self-escalation is stopped: the
-- row must be about the caller and must be a player. Staff and admin accounts
-- are created by staff, never by this path.

create policy profiles_insert_self_as_player
  on public.profiles
  for insert
  to authenticated
  with check (id = (select auth.uid()) and role = 'player');

-- Organization resolution -------------------------------------------------------
-- A self-signing-up player has no invite yet, so there is nothing on the request
-- that names their organization. The app currently serves exactly one, so this
-- resolves that one and RAISES if the assumption ever stops holding, rather than
-- silently attaching a participant to an arbitrary tenant.
--
-- RAPP-25 (entity invites) replaces this: the invite carries the org, and this
-- helper becomes the fallback for players who arrive without one.

create or replace function public.default_organization_id()
returns uuid
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  resolved uuid;
  org_count integer;
begin
  select count(*) into org_count from public.organizations;
  if org_count <> 1 then
    raise exception
      'default_organization_id() is only valid while exactly one organization exists (found %). Pass the organization explicitly (RAPP-25).',
      org_count
      using errcode = 'raise_exception';
  end if;
  select id into resolved from public.organizations;
  return resolved;
end;
$$;

comment on function public.default_organization_id is 'The single tenant a self-signup player belongs to. Raises when the count is not exactly one, so a multi-tenant future fails loudly instead of guessing. Superseded by the invite in RAPP-25.';

-- Completion RPC ----------------------------------------------------------------
-- One call, one transaction: the profile row and its terms acceptance are
-- written together or not at all. A wizard that created a profile and then
-- failed to record consent would leave a participant in the app without the
-- legal basis for holding their data.
--
-- SECURITY INVOKER on purpose: RLS still governs every write, so this function
-- grants no authority the caller does not already have. Its whole job is to
-- encrypt the sensitive fields server-side (the key never reaches the device)
-- and to make the two writes atomic.
--
-- The payload is validated again HERE even though the client already validated
-- it with the same Zod schema: the client check is for humans, this one is for
-- security (CONVENTIONS: "the client validates for UX; the server re-validates
-- for security").

create or replace function public.complete_onboarding(payload jsonb)
returns public.profiles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  saved public.profiles;
  document_type_value text := payload ->> 'document_type';
  document_number_value text := nullif(payload ->> 'document_number', '');
  terms_version_value text := nullif(payload ->> 'terms_version', '');
  locale_shown_value text := nullif(payload ->> 'locale_shown', '');
begin
  if caller is null then
    raise exception 'complete_onboarding requires an authenticated caller'
      using errcode = 'insufficient_privilege';
  end if;

  if terms_version_value is null or locale_shown_value is null then
    raise exception 'complete_onboarding requires terms_version and locale_shown'
      using errcode = 'not_null_violation';
  end if;

  -- A document number is required unless the answer is "none", which is a
  -- first-class answer: many participants genuinely have no document, and
  -- onboarding must never dead-end on it.
  if document_type_value is distinct from 'none' and document_number_value is null then
    raise exception 'complete_onboarding requires document_number unless document_type is none'
      using errcode = 'not_null_violation';
  end if;

  insert into public.profiles (
    id, org_id, role,
    first_name, last_name, date_of_birth, place_of_birth, nationality, preferred_language,
    document_type, document_number,
    phone, address, city, postal_code,
    reference_entity, reference_contact_name,
    has_dependents, num_dependents, clothing_size, shoe_size, avatar_url,
    terms_accepted_at, media_consent_at
  )
  values (
    caller,
    (select public.default_organization_id()),
    'player',
    payload ->> 'first_name',
    payload ->> 'last_name',
    (payload ->> 'date_of_birth')::date,
    nullif(payload ->> 'place_of_birth', ''),
    payload ->> 'nationality',
    coalesce(nullif(payload ->> 'preferred_language', ''), 'ca'),
    document_type_value,
    public.encrypt_field(document_number_value),
    public.encrypt_field(nullif(payload ->> 'phone', '')),
    public.encrypt_field(nullif(payload ->> 'address', '')),
    nullif(payload ->> 'city', ''),
    public.encrypt_field(nullif(payload ->> 'postal_code', '')),
    nullif(payload ->> 'reference_entity', ''),
    nullif(payload ->> 'reference_contact_name', ''),
    coalesce((payload ->> 'has_dependents')::boolean, false),
    coalesce((payload ->> 'num_dependents')::integer, 0),
    nullif(payload ->> 'clothing_size', ''),
    nullif(payload ->> 'shoe_size', ''),
    nullif(payload ->> 'avatar_url', ''),
    now(),
    case when (payload ->> 'media_consent')::boolean then now() else null end
  )
  -- Re-running the wizard (a resumed session that reached the end twice) must
  -- update rather than explode. Role and org are deliberately NOT in the update
  -- list: they are not the wizard's to change.
  on conflict (id) do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    date_of_birth = excluded.date_of_birth,
    place_of_birth = excluded.place_of_birth,
    nationality = excluded.nationality,
    preferred_language = excluded.preferred_language,
    document_type = excluded.document_type,
    document_number = excluded.document_number,
    phone = excluded.phone,
    address = excluded.address,
    city = excluded.city,
    postal_code = excluded.postal_code,
    reference_entity = excluded.reference_entity,
    reference_contact_name = excluded.reference_contact_name,
    has_dependents = excluded.has_dependents,
    num_dependents = excluded.num_dependents,
    clothing_size = excluded.clothing_size,
    shoe_size = excluded.shoe_size,
    avatar_url = excluded.avatar_url,
    terms_accepted_at = excluded.terms_accepted_at,
    media_consent_at = excluded.media_consent_at,
    updated_at = now()
  returning * into saved;

  insert into public.terms_acceptances (profile_id, terms_version, locale_shown)
  values (caller, terms_version_value, locale_shown_value);

  return saved;
end;
$$;

comment on function public.complete_onboarding is 'Writes a player profile and its terms acceptance in ONE transaction, encrypting the sensitive fields server-side so the key never reaches a device. SECURITY INVOKER: RLS still decides what the caller may write.';

grant execute on function public.complete_onboarding(jsonb) to authenticated;
