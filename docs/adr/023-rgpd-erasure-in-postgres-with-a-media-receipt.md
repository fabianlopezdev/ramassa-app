# 023. RGPD erasure runs in Postgres, and refuses to run without a media receipt

**Status:** Accepted
**Date:** 2026-08-01 (decided by Fabián)

## Context

RAPP-26's own scope said full deletion would run in "a server-side Edge Function
(service role)". That sentence predates ADR-022, which removed the service-role
key from this project entirely: it bypasses Row-Level Security on every table
holding the personal data of a roster of refugee women, and wherever it lives it
is a single secret whose loss is a total compromise. RAPP-25 answered the same
question for account creation with SECURITY DEFINER Postgres functions.

Erasure has to answer it again, and it is harder than account creation, because
two of the things that must disappear are not rows in this database:

- the `auth.users` row, and
- the objects she uploaded, which live in Cloudflare R2 (ADR-002).

A third question came with it. `audit_log` is append-only by construction: no
UPDATE policy, no DELETE policy, and per ADR-021 it stores no plaintext of any
encrypted field, only opaque IDs. Deleting her audit rows and keeping them are
both defensible, and the choice had to be made explicitly rather than fall out
of whatever the code happened to do.

Two structural facts shaped the answer:

- `audit_log.actor_id` and `invites.accepted_by` are foreign keys to `profiles`
  that do **not** cascade. A naive `delete from profiles` fails on them. Any
  design had to decide what happens to those rows, not discover it in
  production.
- The schema grew three tables after the issue was written
  (`participant_notes`, `invites`, `deletion_requests`). A written list of
  tables in an issue was already stale within two weeks of being written.

## Decision

**Erasure and anonymization are SECURITY DEFINER Postgres functions**,
`anonymize_participant()` and `delete_participant_permanently()`. No
service-role key is introduced. `auth.users` is deleted in the same transaction
as everything else, which is a narrower use of the `auth.users` coupling
ADR-022 already accepted than the INSERT that ADR made.

SECURITY DEFINER is required here rather than convenient: the purge deletes from
`participant_notes` and `audit_log`, which have no DELETE policy at all, by
design. Because RLS is therefore not scoping these statements, both functions
check the caller's organization explicitly. That check is the tenant boundary
(ADR-010), not decoration.

**Erasure is admin-only.** A new `is_admin()` predicate is the boundary. Staff
run the day-to-day record; the one irreversible, untraceable action stops one
role higher. Anonymization stays with staff.

**The media sweep is a database-checked precondition.** The media Worker
(RAPP-14) grows an authenticated endpoint that deletes every object under
`<orgId>/<folder>/<participantId>/` and writes a `profile.media_purged` audit
row in the calling admin's own name, through the existing `audit_log_insert_self`
policy and nothing wider. `delete_participant_permanently()` refuses to run
without a fresh receipt for that exact participant. A client that skips the
Worker call cannot delete the rows.

The ordering is deliberate: media first, then the record. The only possible
partial failure then falls on the safe side, with her record still present and
the operation retryable, and the sweep is idempotent. The reverse order would
leave objects in a bucket with nothing left to say whose they were.

**Coverage is a runtime registry, not a list in a document.**
`personal_data_disposition()` names every table in `public` with a disposition
(`purge`, `retain`, `not_personal`), the uuid column that points at the
participant, and a written reason. pgTAP fails when a table exists and is not
registered, and `delete_participant_permanently()` sweeps **from that registry**
after its deletes, raising `DELETION_INCOMPLETE` if anything survived. A future
migration that adds a personal-data table and does not extend the registry
cannot ship green.

**`audit_log` is retained where she was the TARGET, and purged where she was the
ACTOR.** Target rows carry opaque IDs and no personal data (ADR-021); they are
the evidence that every earlier access to her record was lawful and that the
erasure happened, which art. 17(3) permits keeping and which deleting would
destroy along with the thing it proves. Actor rows go because that foreign key
does not cascade and leaving them would make her undeletable. The RAPP-24
migration already anticipated this in a comment; this record makes it a
decision.

**Anonymization keeps coarse aggregates and drops the person.** Kept:
nationality, birth **year**, town, dependants, referring entity, sizes. Dropped:
name, papers, phone, address, postal code, place of birth, entity contact name,
photo, and the staff notes about her. Media consent is revoked rather than
inherited. The birth date is coarsened because an exact date beside a
nationality and a town of 40,000 people identifies exactly one woman, while the
year alone answers every age-band question a funder report asks.

## Alternatives Considered

- **Edge Function with the service-role key**, what the issue assumed.
  Rejected for the reasons ADR-022 gives, unchanged and stronger here: the
  function that erases is the last one that should hold a key which can read
  everything.
- **Defer the R2 half to the issue that ships the gallery.** Tempting, because
  nothing writes `avatar_url` yet, so no participant-owned object exists today.
  Rejected: it ships an erasure that by design does not erase, and the gap would
  be discovered by whoever inherits it rather than by us.
- **A purge queue drained by a scheduled Worker.** Retryable and free of
  ordering constraints. Rejected because it makes "deleted" eventually-true, a
  stalled queue is an undetected compliance failure, and it needs the same
  Worker capability _plus_ a scheduler, so it is strictly more surface for a
  weaker guarantee.
- **A hand-maintained list of tables in the deletion function.** What the issue
  described. Rejected: the list in the issue was already three tables out of
  date when this work started, which is the entire argument.

## Consequences

- **There is still no service-role key in this system.** The elevated authority
  is two functions, each readable on one screen, each refusing a caller who is
  not staff (or not an admin) as its first statement.
- **Erasure cannot silently half-happen.** One transaction, plus a
  registry-driven post-check that raises rather than returning. Proven by
  breaking it: a table registered for purge whose rows survive unwinds the whole
  transaction and leaves the record intact.
- **"What happens to this table on erasure" is now asked once per table, at the
  moment the table is created**, by the person who knows the answer, and a
  migration that skips the question fails the suite.
- **Accepted cost: two systems, one act.** The media sweep and the row deletion
  cannot share a transaction, so a sweep that succeeds followed by a deletion
  that fails leaves her media gone and her record present. That is the chosen
  direction of failure, it is visible in the audit trail as a
  `profile.media_purged` with no matching `profile.delete`, and the retry is
  safe. **What to watch:** if a later phase gives participants substantial media,
  add a reconciliation that lists receipts without deletions.
- **Accepted cost: the erasure trail is not itself erasable.** A data subject
  who asks for "everything" still leaves rows saying that an id was viewed, was
  updated, and was erased. That is the trade this record makes, and it is the
  answer to give if it is ever asked.
