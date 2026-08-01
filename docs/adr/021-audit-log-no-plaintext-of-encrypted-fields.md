# 021. The audit log never stores values of encrypted fields

**Status:** Accepted
**Date:** 2026-08-01 (decided by Fabián)

## Context

RAPP-24 landed the RGPD data-access audit (`audit_log`): who did what to whose
record, and when. For profile edits, the SPEC § Database Schema sketch shows a
`changes` column shaped `{"field": {"old": ..., "new": ...}}` for every field.

Four profile columns are encrypted at rest under ADR-004 precisely so a
database breach yields ciphertext, not the home addresses and identity
documents of a roster of refugee women: `document_number`, `phone`, `address`,
`postal_code`.

Following the SPEC sketch literally would write the old and the new value of
those four fields into `audit_log` in plain text on every edit. Over time the
audit table would accumulate an unencrypted historical copy of exactly the
data ADR-004 encrypts, in a table nobody treats as sensitive because "it's
just logs". A breach would then recover the protected values from the log,
and the encryption would have bought nothing.

## Decision

The `changes` document records:

- **Ordinary fields**: full detail, `{"field": {"old": ..., "new": ...}}`,
  exactly as SPEC sketches.
- **The four encrypted fields**: only the fact of change,
  `{"field": {"changed": true}}`. Never the values, in either direction.

The diff is computed inside `update_participant_profile()` (the values are
decrypted only within that function and never leave it), and the rule is
pinned by pgTAP (`0007_participant_detail_test.sql`: "an ENCRYPTED field
records only that it changed") so a future "improvement" has to argue with a
failing test. `packages/shared/testing/factories.ts` (`buildAuditLogEntry`)
carries the same rule for fixtures.

The audit still answers the RGPD questions it exists for: who read a record,
who changed a field, which field, and when. What it gives up is the previous
value of a sensitive field, which is the participant's data and lives
encrypted in one place.

## Alternatives Considered

- **SPEC sketch literally (plaintext old/new for everything)** — rejected, as
  above: it silently undoes ADR-004 through a side table.
- **Encrypt the old/new values inside `changes`** — rejected for now. It
  preserves forensics but adds a second encrypted read path, complicates the
  append-only guarantees (a re-key would have to rewrite an immutable table),
  and no current requirement asks "what was her phone number before". If a
  funder or a legal request ever needs it, this is the variant to revisit,
  as its own issue.
- **No `changes` at all for edits** — rejected: knowing WHICH fields changed
  is cheap, safe, and most of the value.

## Consequences

- A breach of `audit_log` reveals actor, action, subject and timestamps, but
  no sensitive values. The audit table does not need ADR-004 treatment.
- "What was the value before" is deliberately unanswerable for the four
  encrypted fields. Staff who need the history of a phone number do not have
  it; that is the accepted cost.
- The SPEC sketch is amended where it defines `audit_log` and points here.
- Every later phase that writes audit entries (RAPP-25 account actions,
  RAPP-26 RGPD lifecycle, RAPP-63 audit-log viewer) inherits this rule:
  values of encrypted columns never enter `changes`, whatever the action.
