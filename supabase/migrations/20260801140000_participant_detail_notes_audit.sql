-- The staff-side participant detail: an access audit, append-only staff notes,
-- and the RPCs the detail screen reads and writes through (RAPP-24).
--
-- ONE IDEA HOLDS THIS FILE TOGETHER: a staff member can see and change a
-- participant's record, and every one of those acts leaves a record of its own
-- that nobody, including her, can edit or erase.
--
-- Four pieces:
--
--   1. `audit_log` (SPEC § Database Schema). Who did what to whose record, and
--      when. INSERT is allowed only in the writer's own name; there is no
--      UPDATE policy and no DELETE policy at all, so the log is append-only
--      through every path the API offers.
--   2. `participant_notes`. The team's working record about a participant,
--      also append-only, also invisible to her.
--   3. `get_participant_profile()`. The ONLY staff path that decrypts, and it
--      writes its own audit row in the same statement. Reading without being
--      logged is not a thing this function can do.
--   4. `update_participant_profile()`, `set_participant_active()` and the
--      `participant_activity()` timeline contract.
--
-- WHY THE AUDIT DOES NOT STORE OLD AND NEW VALUES FOR EVERYTHING
--
-- SPEC sketches `changes` as `{"field": {"old": ..., "new": ...}}`, and that is
-- what an ordinary column gets. The ENCRYPTED columns (document number, phone,
-- address, postal code) get `{"changed": true}` instead. Storing their values
-- would turn the audit log into a plaintext mirror of exactly the fields
-- ADR-004 encrypts: a breach would hand over the identity documents and home
-- addresses of a roster of refugee women, out of a table nobody thought of as
-- sensitive, and the encryption would have bought nothing. Knowing that the
-- phone was changed, by whom, and when is what the audit is for; knowing what
-- it was changed from is the participant's data, and it lives in one place.
-- Confirmed by Fabián 2026-08-01 as the standing rule for every writer of this
-- table, present and future: ADR-021.
--
-- WHY NO `org_id` ON `participant_notes`
--
-- The tenant is derived from the subject profile, the way `deletion_requests`
-- (RAPP-22) derives it. A copied `org_id` on a row that already points at a
-- profile is a second answer to the same question, and the two can drift; a
-- derived one cannot. `audit_log` DOES carry `org_id`, because SPEC pins that
-- shape and because an audit row must stay attributable even when its target
-- row is gone (RGPD erasure, RAPP-26).

-- The audit log ------------------------------------------------------------------

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  actor_id uuid not null references public.profiles (id),
  -- 'profile.view_sensitive', 'profile.update', 'profile.activate',
  -- 'profile.deactivate'. Free text rather than an enum so a later phase can
  -- log its own actions without a migration that locks the whole table.
  action text not null,
  target_type text not null,
  target_id uuid not null,
  changes jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_log is 'Who did what to whose record, and when (SPEC § Audit log). Append-only by construction: there is no UPDATE or DELETE policy. Values of ENCRYPTED columns are never recorded, only the fact that they changed (ADR-004).';

-- Reading the log is "what happened in this organization lately", so the org
-- leads the index and the newest row comes first.
create index audit_log_org_created_at_idx on public.audit_log (org_id, created_at desc);

-- And "who has looked at this participant", which is the question a data
-- subject is entitled to ask.
create index audit_log_target_idx on public.audit_log (target_type, target_id, created_at desc);

-- Foreign keys are not indexed automatically, and the actor column is both a FK
-- and the second question staff ask of this table.
create index audit_log_actor_id_idx on public.audit_log (actor_id, created_at desc);

alter table public.audit_log enable row level security;

create policy audit_log_select_org_staff
  on public.audit_log
  for select
  to authenticated
  using (
    (select public.is_staff_or_admin())
    and org_id = (select public.current_org_id())
  );

-- The WITH CHECK is the whole integrity story. An entry can only be written in
-- the writer's OWN name and into her OWN organization, so the worst a caller
-- can do by hand is add noise attributed to herself, which hides nothing and
-- incriminates only her. What she cannot do is write one as a colleague, and
-- (below) she cannot alter or remove one at all.
create policy audit_log_insert_self
  on public.audit_log
  for insert
  to authenticated
  with check (
    actor_id = (select auth.uid())
    and org_id = (select public.current_org_id())
  );

-- Deliberately NO update policy and NO delete policy. An audit log the auditee
-- can rewrite is decoration. Erasing a participant (RAPP-26) anonymizes the
-- target rather than deleting the trail.

-- Staff notes -----------------------------------------------------------------------

create table public.participant_notes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

comment on table public.participant_notes is 'Internal staff notes about a participant. Append-only (no UPDATE or DELETE policy) and never visible to her: a note is a record of what the team knew and when, and a silently editable one is worth less than none.';

-- The screen reads one participant's notes, newest first, which is the only
-- query this table has.
create index participant_notes_profile_id_created_at_idx
  on public.participant_notes (profile_id, created_at desc);

create index participant_notes_author_id_idx on public.participant_notes (author_id);

alter table public.participant_notes enable row level security;

create policy participant_notes_select_org_staff
  on public.participant_notes
  for select
  to authenticated
  using (
    (select public.is_staff_or_admin())
    and exists (
      select 1 from public.profiles subject
      where subject.id = participant_notes.profile_id
        and subject.org_id = (select public.current_org_id())
    )
  );

create policy participant_notes_insert_org_staff
  on public.participant_notes
  for insert
  to authenticated
  with check (
    (select public.is_staff_or_admin())
    and author_id = (select auth.uid())
    and exists (
      select 1 from public.profiles subject
      where subject.id = participant_notes.profile_id
        and subject.org_id = (select public.current_org_id())
    )
  );

-- Reading a participant, as staff -------------------------------------------------------

-- The decrypting read and the audit row it owes are ONE statement, so there is
-- no ordering, no branch and no future edit that could produce a read without a
-- trace. The audit INSERT lives in a data-modifying CTE, which Postgres
-- executes exactly once and to completion whether or not the outer query reads
-- its output; it is driven by `subject`, so a lookup that matched nothing (a
-- stranger's id, another organization's participant, a caller who is not staff)
-- writes nothing and returns nothing.
--
-- SECURITY INVOKER: the org scoping is the existing RLS policy on `profiles`,
-- not a predicate copied into this function that could drift from it. The
-- `is_staff_or_admin()` guard on top is not authorization (RLS already covers
-- that) but ROUTING: a participant reads herself through `get_own_profile()`,
-- and a second decrypting door onto her own row would be a second thing to keep
-- safe for no gain, plus an audit entry that reads as staff access when it was
-- not.

create or replace function public.get_participant_profile(participant_id uuid)
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
  terms_accepted_at timestamptz,
  is_active boolean,
  is_forum_banned boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  with subject as (
    select p.*
    from public.profiles p
    where p.id = participant_id
      and (select public.is_staff_or_admin())
  ),
  access_recorded as (
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id)
    select
      (select public.current_org_id()),
      (select auth.uid()),
      'profile.view_sensitive',
      'profile',
      s.id
    from subject s
    returning 1
  )
  select
    s.id,
    s.first_name,
    s.last_name,
    s.date_of_birth,
    s.place_of_birth,
    s.nationality,
    s.preferred_language,
    s.document_type,
    public.decrypt_field(s.document_number),
    public.decrypt_field(s.phone),
    public.decrypt_field(s.address),
    s.city,
    public.decrypt_field(s.postal_code),
    s.reference_entity,
    s.reference_contact_name,
    s.has_dependents,
    s.num_dependents,
    s.clothing_size,
    s.shoe_size,
    s.avatar_url,
    s.media_consent_at is not null,
    s.terms_accepted_at,
    s.is_active,
    s.is_forum_banned,
    s.created_at,
    s.updated_at
  from subject s;
$$;

comment on function public.get_participant_profile is 'A participant record with its encrypted fields decrypted, for staff, WITH the RGPD access-audit row written in the same statement. SECURITY INVOKER, so the profiles RLS policy still does the org scoping. Returns no rows (and audits nothing) for a caller who is not staff.';

-- Editing a participant, as staff ---------------------------------------------------------

-- The staff twin of `update_own_profile`. It reads the SAME snake_case payload,
-- because the admin form composes it with the same mapper the player app uses,
-- and it applies the same two rules intake applies (a place of birth is
-- required; a document number is required unless the type is 'none') so that
-- editing is never stricter or looser than the wizard.
--
-- The column list is again the authorization boundary: `role`, `org_id`,
-- `terms_accepted_at`, `is_active` and `is_forum_banned` are absent, so a
-- payload that carries them simply has those keys ignored. Status is a separate
-- gesture with its own function and its own audit action.

create or replace function public.update_participant_profile(participant_id uuid, payload jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  document_type_value text := payload ->> 'document_type';
  document_number_value text := nullif(payload ->> 'document_number', '');
  place_of_birth_value text := nullif(btrim(payload ->> 'place_of_birth'), '');
  -- The columns whose VALUES must never reach the audit log (ADR-004).
  encrypted_fields text[] := array['document_number', 'phone', 'address', 'postal_code'];
  before_document jsonb;
  changes_document jsonb;
begin
  if not (select public.is_staff_or_admin()) then
    raise exception 'update_participant_profile is the staff path; a participant edits herself through update_own_profile()'
      using errcode = 'insufficient_privilege';
  end if;

  if place_of_birth_value is null then
    raise exception 'update_participant_profile requires place_of_birth'
      using errcode = 'not_null_violation';
  end if;

  if document_type_value is distinct from 'none' and document_number_value is null then
    raise exception 'update_participant_profile requires document_number unless document_type is none'
      using errcode = 'not_null_violation';
  end if;

  -- The record as it stands, in the payload's own shape, so the diff below is a
  -- key-by-key comparison rather than nineteen hand-written IF statements that
  -- a twentieth column would silently escape. The encrypted values are decrypted
  -- HERE and never leave this block: they are what makes "did the phone actually
  -- change" answerable at all.
  select jsonb_build_object(
    'first_name', p.first_name,
    'last_name', p.last_name,
    'date_of_birth', p.date_of_birth,
    'place_of_birth', p.place_of_birth,
    'nationality', p.nationality,
    'preferred_language', p.preferred_language,
    'document_type', p.document_type,
    'document_number', public.decrypt_field(p.document_number),
    'phone', public.decrypt_field(p.phone),
    'address', public.decrypt_field(p.address),
    'city', p.city,
    'postal_code', public.decrypt_field(p.postal_code),
    'reference_entity', p.reference_entity,
    'reference_contact_name', p.reference_contact_name,
    'has_dependents', p.has_dependents,
    'num_dependents', p.num_dependents,
    'clothing_size', p.clothing_size,
    'shoe_size', p.shoe_size,
    'media_consent', p.media_consent_at is not null
  )
  into before_document
  from public.profiles p
  where p.id = participant_id;

  -- No readable row means no row this caller may edit: RLS has already decided,
  -- and there is nothing to audit.
  if before_document is null then
    return;
  end if;

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
    media_consent_at = case
      when (payload ->> 'media_consent')::boolean then coalesce(media_consent_at, now())
      else null
    end,
    updated_at = now()
  where id = participant_id;

  if not found then
    return;
  end if;

  select coalesce(jsonb_object_agg(submitted.key, entry), '{}'::jsonb)
  into changes_document
  from jsonb_each_text(payload) submitted
  cross join lateral (
    select case
      when submitted.key = any(encrypted_fields) then jsonb_build_object('changed', true)
      else jsonb_build_object(
        'old', to_jsonb(before_document ->> submitted.key),
        'new', to_jsonb(submitted.value)
      )
    end as entry
  ) built
  where before_document ? submitted.key
    and (before_document ->> submitted.key) is distinct from submitted.value;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    (select public.current_org_id()),
    actor,
    'profile.update',
    'profile',
    participant_id,
    changes_document
  );
end;
$$;

comment on function public.update_participant_profile is 'Edits a participant profile as staff, re-encrypting the sensitive fields server-side and auditing which fields changed. Encrypted fields are audited as {"changed": true}, never by value (ADR-004). Role, organization and terms acceptance are not in the column list and cannot be changed through it.';

-- The active/inactive toggle -------------------------------------------------------------

-- A separate gesture from editing, so it carries its own audit action: "who
-- deactivated her, and when" is a question the team and a funder both ask, and
-- burying it inside a nineteen-field diff answers it badly. The full
-- deactivation flow, with anonymization, is RAPP-26; this is the soft state.

create or replace function public.set_participant_active(participant_id uuid, next_is_active boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous_is_active boolean;
begin
  if not (select public.is_staff_or_admin()) then
    raise exception 'set_participant_active is a staff action'
      using errcode = 'insufficient_privilege';
  end if;

  select p.is_active into previous_is_active
  from public.profiles p
  where p.id = participant_id;

  if previous_is_active is null then
    return;
  end if;

  update public.profiles
     set is_active = next_is_active, updated_at = now()
   where id = participant_id;

  if not found then
    return;
  end if;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    (select public.current_org_id()),
    (select auth.uid()),
    case when next_is_active then 'profile.activate' else 'profile.deactivate' end,
    'profile',
    participant_id,
    jsonb_build_object(
      'is_active',
      jsonb_build_object('old', previous_is_active, 'new', next_is_active)
    )
  );
end;
$$;

comment on function public.set_participant_active is 'Flips a participant between active and inactive as staff, auditing the change under its own action. Soft state only; the anonymizing deactivation flow is RAPP-24 follow-up RAPP-26.';

-- The activity timeline contract ------------------------------------------------------------

-- Phase 2 has no activity sources yet, and this function exists anyway, on
-- purpose. The detail screen needs a real, typed empty state now, and every
-- later phase that produces participant activity (attendance, event signups,
-- chat, forum posts, feedback, equipment deliveries) adds a BRANCH to the union
-- below rather than inventing its own shape and its own screen section.
--
-- Each branch selects its own `profile_id` and the outer query filters on it, so
-- adding one is a copy of the sample line with a real FROM. SECURITY INVOKER, so
-- every branch is scoped by its own table's RLS policy; nothing here can widen
-- what a caller may read.

create or replace function public.participant_activity(participant_id uuid)
returns table (
  id uuid,
  kind text,
  occurred_at timestamptz,
  title text,
  detail text
)
language sql
security invoker
set search_path = ''
stable
as $$
  select events.id, events.kind, events.occurred_at, events.title, events.detail
  from (
    -- No sources yet. Later phases UNION ALL their own branch here; the `where
    -- false` line is the shape they copy, and it keeps the column types pinned
    -- so the contract is honest before anything feeds it.
    select
      null::uuid as id,
      null::text as kind,
      null::timestamptz as occurred_at,
      null::text as title,
      null::text as detail,
      null::uuid as profile_id
    where false
  ) events
  where events.profile_id = participant_id
  order by events.occurred_at desc;
$$;

comment on function public.participant_activity is 'The participant activity timeline: one typed row shape that every later phase appends a branch to (attendance, event signups, chat, forum, feedback, equipment). Returns an empty set until those sources exist.';
