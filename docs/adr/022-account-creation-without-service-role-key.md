# 022. Staff account creation runs in Postgres, with no service-role key

**Status:** Accepted
**Date:** 2026-08-01 (decided by Fabián)

## Context

ADR-005 established the fallback auth path: for a participant with no email,
staff create an account with an internal address and a password. It assumed the
implementation would be an Edge Function holding Supabase's **service-role
key**, and RAPP-25's issue text repeated that assumption.

The service-role key bypasses Row-Level Security on every table in the project.
On this database that is the encrypted personal data of a roster of refugee
women. Wherever the key lives it is a single secret whose loss is a total
compromise, and it has to live somewhere a running process can read it.

Two further facts emerged while planning RAPP-25:

- The repo already creates working auth accounts purely in SQL. `supabase/seed.sql`
  inserts into `auth.users` and `auth.identities`, and the browser QA suite
  signs in as those accounts for real. So the Admin API is not the only way to
  mint an identity that works.
- A Supabase Edge Function is a Deno runtime that cannot cleanly import the bun
  workspace's `@ramassa/shared`, so its schemas would be a second copy
  (against contract rule 6), and `bun test` cannot execute it.

## Decision

Account creation, password reset and invitation all run as **SECURITY DEFINER
Postgres functions**: `create_participant_account`, `reset_participant_password`,
`create_participant_invite`. No service-role key exists in this system.

Each function checks `is_staff_or_admin()` as the first statement of its body,
writes an audit row (ADR-021), and is rate-limited per actor off that same
audit trail.

Generated login addresses live under **`ramassa.invalid`** (see ADR-005, amended
in the same change).

## Alternatives Considered

- **Supabase Edge Function with the service-role key** — what ADR-005 assumed.
  The platform injects the key so we never store it, which is a genuine
  advantage. Rejected because the key still exists and is reachable by running
  code, because the Deno runtime forces a second copy of the validation
  schemas, and because the role-enforcement tests the issue asks for could not
  run under `bun test`.
- **Extend the existing Cloudflare Worker** (`workers/media`) — best code reuse:
  it already verifies Supabase JWTs and resolves role from `profiles`, and it is
  bun-testable. Rejected because it would copy the service-role key into a
  second vendor's secret store, which is the worst of both worlds.

## Consequences

- **There is no service-role key to leak, rotate, or misplace.** The elevated
  authority is three functions that fit on one screen each. A bug in one can do
  only what its body does.
- **The security boundary stays where ADR-009 put it**: in Postgres.
- **Everything is testable in pgTAP**, the project's strongest test layer, from
  all three roles. `0008` and `0009` assert the denials explicitly rather than
  inferring them from a guard's existence.
- **Accepted risk: coupling to `auth.users` and `auth.identities`.** These are
  Supabase's internal tables, not a documented public surface, so a future
  GoTrue release could change them. Mitigations: the exposure is narrow (six
  columns plus one identity row), it is exercised on every `db reset` by the
  seeds, pgTAP verifies the password hash the way GoTrue verifies it, and the
  browser suite signs in with a real generated credential. **What to watch:** a
  Supabase platform upgrade. If account creation ever breaks there, this is the
  first place to look, and the fallback is the Edge Function described above.
- ADR-005's "Edge Function (service role key)" consequence is superseded by
  this record.
