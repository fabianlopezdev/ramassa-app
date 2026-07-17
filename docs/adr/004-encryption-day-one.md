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
