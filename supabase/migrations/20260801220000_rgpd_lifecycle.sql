-- The RGPD lifecycle: soft deactivation, anonymization, and full erasure
-- (RAPP-26; ADR-023 for the runtime and the audit-retention decision).
--
-- Three gestures, deliberately three, in increasing order of consequence:
--
--   1. **Deactivate** (`set_participant_active`, already built in RAPP-24). She
--      leaves the operational views and stays in the reports. Reversible with
--      one click, which is what keeps it the easy option.
--   2. **Anonymize** (`anonymize_participant`). The person is removed from the
--      row and the row stays countable. Irreversible, staff.
--   3. **Erase** (`delete_participant_permanently`). Nothing of hers survives
--      except an audit trail of opaque ids. Irreversible, ADMIN ONLY.
--
-- WHY THIS IS NOT AN EDGE FUNCTION WITH THE SERVICE-ROLE KEY
--
-- The issue that commissioned this work assumed one, and ADR-022 had already
-- ruled that key out of this project: it bypasses RLS on every table holding the
-- personal data of a roster of refugee women, and wherever it is stored it is a
-- single secret whose loss is a total compromise. So erasure follows the path
-- RAPP-25 established: a SECURITY DEFINER function that checks the caller first,
-- audits, and can be read in full on one screen.
--
-- SECURITY DEFINER here is load-bearing in a way it was not in RAPP-25, and it
-- cuts both ways. It is REQUIRED because the purge deletes from tables that have
-- no DELETE policy at all by design (`participant_notes` and `audit_log` are
-- append-only, and that is the point of them). It is DANGEROUS for exactly the
-- same reason, so the org check below is not decoration: RLS is not scoping
-- these statements, this function is, and without it an admin of one tenant
-- could erase another tenant's participant (ADR-010).
--
-- WHY R2 IS SWEPT FIRST, AND WHY POSTGRES REFUSES WITHOUT A RECEIPT
--
-- Her uploaded media lives in R2, which no database transaction can reach. The
-- media Worker (RAPP-14) already verifies Supabase tokens against JWKS and reads
-- role from `profiles` under RLS, so it sweeps the `<orgId>/<folder>/<userId>/`
-- prefix and writes a `profile.media_purged` audit row in the admin's own name,
-- through the ordinary insert policy and nothing wider.
--
-- This function then REFUSES to run without a fresh receipt for that exact
-- participant. That is what turns "the client promised it called the Worker"
-- into a condition the database checks. The ordering is chosen so that the only
-- possible partial failure falls on the safe side: media gone, record still
-- present, retryable, and the sweep is idempotent. The reverse order would
-- orphan objects in a bucket with nothing left to say whose they were.

-- The admin predicate --------------------------------------------------------------

-- Staff run the day-to-day record; erasure stops at the admin. A separate
-- predicate rather than a role check inline, so the boundary is one testable
-- thing and every later irreversible action asks the same question.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

comment on function public.is_admin is 'True when the caller is an organization admin. The boundary for irreversible actions: staff run the record, admins end it.';

-- The personal-data registry -----------------------------------------------------------

-- THE STANDING RULE OF THIS ISSUE, made executable.
--
-- Every base table in `public` must appear here, saying what happens to its rows
-- when a woman exercises her right to erasure. Not a document that drifts: the
-- pgTAP suite fails when a table exists and is not listed, and the erasure
-- function below SWEEPS FROM THIS LIST at runtime, so a table registered as
-- `purge` whose rows survive raises rather than passing quietly.
--
-- A migration that adds a table holding personal data and does not extend this
-- function is therefore a migration that cannot ship green. That is the whole
-- design: the coverage question is asked once per table, in writing, by the
-- person adding the table, at the moment they know the answer.
--
-- `participant_column` is the uuid column that points at her. `invites` also
-- carries her EMAIL ADDRESS, which is personal data on a column no uuid registry
-- can express; the erasure function purges those rows explicitly and pgTAP
-- asserts it separately.
create or replace function public.personal_data_disposition()
returns table (
  table_name text,
  participant_column text,
  disposition text,
  reason text
)
language sql
immutable
security invoker
set search_path = ''
as $$
  values
    ('profiles', 'id', 'purge',
     'The record itself, including the four columns encrypted under ADR-004.'),
    ('participant_notes', 'profile_id', 'purge',
     'The team''s prose about her life. Append-only against editing, not against erasure.'),
    ('push_tokens', 'user_id', 'purge',
     'Device tokens. Anything left here could still deliver a notification to her phone.'),
    ('terms_acceptances', 'profile_id', 'purge',
     'Her consent records; there is nothing left for them to be consent to.'),
    ('deletion_requests', 'profile_id', 'purge',
     'Carries `reason`, written in her own words. The audit trail records that the request was fulfilled.'),
    ('invites', 'accepted_by', 'purge',
     'The invitation that admitted her, and separately every row carrying her email address.'),
    ('audit_log', 'actor_id', 'purge',
     'Rows where SHE acted. The FK does not cascade, so leaving these would make her undeletable.'),
    ('audit_log', 'target_id', 'retain',
     'Kept on purpose (ADR-023): opaque ids only, never personal data (ADR-021). This is the evidence that access to her record was lawful and that the erasure happened, which art. 17(3) permits keeping and which erasing would destroy along with the thing it proves.'),
    ('organizations', null, 'not_personal',
     'A tenant, not a person. No participant column exists to purge.');
$$;

comment on function public.personal_data_disposition is 'What happens to each table when a participant is erased. Every table in public must appear; pgTAP fails when one does not, and delete_participant_permanently() sweeps from this list at runtime so the registry and the behaviour cannot drift apart.';

-- Anonymization ------------------------------------------------------------------------

-- A first-class state rather than a name that looks odd. The screens read this
-- column, so "anonymized" never has to be inferred from a blank field, and a
-- report can exclude or include those rows deliberately.
alter table public.profiles add column anonymized_at timestamptz;

comment on column public.profiles.anonymized_at is 'When the person was removed from this row while the row was kept for aggregate reporting (RAPP-26). Irreversible: the values are gone, not hidden.';

create index profiles_org_anonymized_idx
  on public.profiles (org_id)
  where anonymized_at is not null;

-- WHAT SURVIVES ANONYMIZATION, AND WHY THAT LINE IS WHERE IT IS
--
-- Kept: nationality, birth YEAR, town, dependants, referring entity, sizes, the
-- dates. Those are the figures the grant reporting actually counts, and none of
-- them names anyone.
--
-- Dropped: her name, her papers, her phone, her address, her postal code, where
-- she was born, the contact at her entity, her photo.
--
-- The birth DATE is coarsened rather than kept, and that is the judgement call
-- in this function. An exact date of birth beside a nationality and a town of
-- 40,000 people identifies exactly one woman; the year alone answers every
-- age-band question a funder asks. Confirmed by Fabián 2026-08-01.
--
-- Media consent is REVOKED rather than inherited. A standing permission to use
-- her photographs, attached to a row nobody can trace back to a person, is a
-- permission that can never be withdrawn by the only person entitled to.
create or replace function public.anonymize_participant(participant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid;
  subject_role text;
  subject_anonymized_at timestamptz;
begin
  -- SECURITY DEFINER means RLS is not doing this check, so it is the first
  -- statement in the body and pgTAP asserts it from three roles.
  if not (select public.is_staff_or_admin()) then
    raise exception 'anonymizing a participant is a staff action'
      using errcode = 'insufficient_privilege';
  end if;

  actor_org := (select public.current_org_id());

  -- The tenant scope RLS would normally provide. Without it, SECURITY DEFINER
  -- would let a staff member of one organization anonymize another's roster.
  select p.role, p.anonymized_at into subject_role, subject_anonymized_at
  from public.profiles p
  where p.id = participant_id and p.org_id = actor_org;

  if subject_role is null then
    raise exception 'ANONYMIZE_NO_SUBJECT: no such participant in this organization'
      using errcode = 'raise_exception';
  end if;

  -- Anonymizing a colleague would strip the name off an account that still signs
  -- in and still acts, which is a different and much worse thing than what this
  -- function is for.
  if subject_role <> 'player' then
    raise exception 'ANONYMIZE_NOT_A_PARTICIPANT: only a participant record can be anonymized'
      using errcode = 'raise_exception';
  end if;

  -- Already done. Silently re-running would rewrite `anonymized_at` and lose the
  -- date the person actually left the record.
  if subject_anonymized_at is not null then
    raise exception 'ANONYMIZE_ALREADY_DONE: this record was already anonymized'
      using errcode = 'raise_exception';
  end if;

  update public.profiles set
    -- Emptied rather than filled with a placeholder word: the screens read
    -- `anonymized_at` and show a translated label, so no invented name has to
    -- exist in five languages or leak out of a CSV export as though it were one.
    first_name = '',
    last_name = '',
    place_of_birth = null,
    reference_contact_name = null,
    avatar_url = null,
    document_type = null,
    document_number = null,
    phone = null,
    address = null,
    postal_code = null,
    date_of_birth = case
      when date_of_birth is null then null
      else make_date(extract(year from date_of_birth)::int, 1, 1)
    end,
    media_consent_at = null,
    is_active = false,
    anonymized_at = now(),
    updated_at = now()
  where id = participant_id;

  -- Prose about her life, which no column-level anonymization can reach. Deleted
  -- through this function and only through this function: the table has no
  -- DELETE policy precisely so that no staff member can quietly revise the
  -- record, and the right to erasure is a different thing from revising it.
  delete from public.participant_notes where profile_id = participant_id;

  -- A retained device token would keep a channel open to a real phone belonging
  -- to a person this row no longer claims to know.
  delete from public.push_tokens where user_id = participant_id;

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org,
    actor,
    'profile.anonymize',
    'profile',
    participant_id,
    -- WHICH fields were cleared, never what was in them (ADR-021). The audit row
    -- must not become the last surviving copy of the data it describes.
    jsonb_build_object('fields_cleared', true, 'notes_deleted', true)
  );
end;
$$;

comment on function public.anonymize_participant is 'Removes the person from a participant record while keeping the row countable in reports: names, papers, contact details, photo and staff notes go; nationality, town, birth YEAR, dependants and referring entity stay. Irreversible. Staff only, same organization only, audited.';

-- Erasure -----------------------------------------------------------------------------------

create or replace function public.delete_participant_permanently(participant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid;
  subject_role text;
  subject_email text;
  entry record;
  remaining bigint;
  leftovers text[] := '{}';
begin
  -- ADMIN, not staff. Erasure is the one action in this schema with no undo and
  -- no trace of what was lost, so it sits one role above everything else.
  if not (select public.is_admin()) then
    raise exception 'erasing a participant is an admin action'
      using errcode = 'insufficient_privilege';
  end if;

  actor_org := (select public.current_org_id());

  select p.role into subject_role
  from public.profiles p
  where p.id = participant_id and p.org_id = actor_org;

  -- A no-op that reports success is how a staff member tells a woman her data is
  -- gone when it is not.
  if subject_role is null then
    raise exception 'DELETION_NO_SUBJECT: no such participant in this organization'
      using errcode = 'raise_exception';
  end if;

  if subject_role <> 'player' then
    raise exception 'DELETION_NOT_A_PARTICIPANT: only a participant record can be erased here'
      using errcode = 'raise_exception';
  end if;

  -- Erasing yourself mid-transaction would delete the actor the audit row points
  -- at, and the FK would take the trail down with it.
  if participant_id = actor then
    raise exception 'DELETION_SELF: an admin cannot erase her own account through this path'
      using errcode = 'raise_exception';
  end if;

  -- THE RECEIPT. R2 is outside this transaction, so its sweep cannot be rolled
  -- into it; what CAN be required is proof that it already happened, for this
  -- participant, recently, by this admin. A client that skips the Worker call
  -- cannot get past this line.
  if not exists (
    select 1 from public.audit_log
    where action = 'profile.media_purged'
      and target_id = participant_id
      and actor_id = actor
      and created_at > now() - interval '30 minutes'
  ) then
    raise exception 'DELETION_MEDIA_NOT_PURGED: her uploaded media must be removed before the record'
      using errcode = 'raise_exception';
  end if;

  select u.email into subject_email from auth.users u where u.id = participant_id;

  -- Audited BEFORE the deletes, so the record of the act is written while there
  -- is still something to describe. This row survives: its target is an id that
  -- from now on points at nothing, which is exactly what makes it safe to keep.
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (
    actor_org,
    actor,
    'profile.delete',
    'profile',
    participant_id,
    jsonb_build_object('erased', true)
  );

  -- Her email address on an invitation is personal data on a column the registry
  -- cannot express as a uuid, and it has to go before `auth.users` does, because
  -- afterwards there is nothing left to look the address up from.
  delete from public.invites
   where accepted_by = participant_id
      or (subject_email is not null and email = subject_email);

  -- Rows where SHE acted. Their FK does not cascade, so this is also what makes
  -- the delete below possible at all. Rows where she was the TARGET stay
  -- (ADR-023).
  delete from public.audit_log where actor_id = participant_id;

  -- One statement for everything else: `profiles.id` cascades from `auth.users`,
  -- and `participant_notes`, `push_tokens`, `terms_acceptances` and
  -- `deletion_requests` cascade from `profiles`. Referential actions are not
  -- subject to RLS, so the append-only tables go too, which is the intended
  -- behaviour here and nowhere else.
  delete from auth.users where id = participant_id;

  -- THE POST-CHECK, driven by the registry rather than by this function's memory
  -- of what it just wrote. A table added by a future migration and registered as
  -- `purge` is swept HERE, at runtime, without anyone editing this block: if its
  -- rows survive, this raises and the whole transaction unwinds. Partial and
  -- silent is the one outcome this path must never have.
  for entry in
    select d.table_name, d.participant_column
    from public.personal_data_disposition() d
    where d.disposition = 'purge'
  loop
    execute format(
      'select count(*) from public.%I where %I = $1',
      entry.table_name, entry.participant_column
    ) into remaining using participant_id;
    if remaining > 0 then
      leftovers := leftovers || format('%s.%s', entry.table_name, entry.participant_column);
    end if;
  end loop;

  if array_length(leftovers, 1) > 0 then
    raise exception 'DELETION_INCOMPLETE: rows survived in %', array_to_string(leftovers, ', ')
      using errcode = 'raise_exception';
  end if;
end;
$$;

comment on function public.delete_participant_permanently is 'Erases a participant: every row registered for purge, her authentication identity, and the invitation carrying her address. Admin only, same organization only, and refused unless her R2 media was already swept and receipted. Audited before it runs; the audit trail of opaque ids survives (ADR-023). Verifies its own completeness from the registry and raises DELETION_INCOMPLETE rather than finishing partially.';
