# 004. pgcrypto encryption from day 1

**Status:** Accepted
**Date:** 2026-04-09

## Context

The `profiles` table stores sensitive personal data: address, postal code, phone, document number (NIE/passport). An auditor suggested deferring encryption to Phase 2 to simplify the foundation sprint.

## Decision

Implement pgcrypto encryption in the initial migration. Sensitive columns (`address`, `postal_code`, `phone`, `document_number`) are stored as BYTEA using `pgp_sym_encrypt`/`pgp_sym_decrypt` with a key stored in Supabase Vault.

## Alternatives Considered

- **Defer to Phase 2** — rejected. Migrating from TEXT to BYTEA with real user data is a risky, breaking change. All queries written against unencrypted columns in Phase 1 would need rewriting. The upfront cost is small (write encrypt/decrypt helpers once).

## Consequences

- Small upfront cost: write SQL helper functions for encrypt/decrypt
- Every developer works with the correct encrypted schema from Phase 2 onward
- No risky data migration later
- Requires Supabase Vault setup for encryption key management
- This is a RGPD requirement for refugee women's personal data — encryption is foundational, not polish

## Addendum 2026-10-21 (RAPP-624): who may call the helpers

Until 2026-10-21 `public.encryption_key()`, `encrypt_field` and `decrypt_field` kept the
default EXECUTE grants, so an anonymous REST call returned the Vault key. Since
`20261021220000_field_encryption_access.sql`:

- Only database functions call the three helpers. EXECUTE is revoked from `PUBLIC`, `anon`,
  `authenticated` and `service_role`.
- A `SECURITY DEFINER` function that decrypts checks its caller's permission for that exact
  field first (participant field levels, RAPP-240).
- A `SECURITY INVOKER` function never calls `decrypt_field`. It calls a narrow private helper
  (`private.referral_private_fields`, `private.referral_update_content`,
  `private.feedback_content`) that reads the ciphertext by row id and decrypts only for a
  caller the table's own select policy admits.
- Ciphertext columns are never written directly by a client. On `profiles` they are
  privileged columns, so a user cannot plant a ciphertext she can read into a field that a
  profile read decrypts for her.

Sources: https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker,
https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY,
https://supabase.com/docs/guides/database/vault.
