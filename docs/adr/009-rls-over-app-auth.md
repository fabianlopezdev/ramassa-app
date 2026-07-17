# 009. PostgreSQL RLS over application-layer authorization

**Status:** Accepted
**Date:** 2026-04-09

## Context

Multiple user roles (player, staff, entity, admin) need different data access levels. Authorization can be enforced at the application layer (middleware/guards) or at the database layer (Row-Level Security).

## Decision

Use PostgreSQL Row-Level Security (RLS) as the primary authorization mechanism. Every table has RLS enabled. Policies enforce access rules at the database level.

## Alternatives Considered

- **Application-layer authorization only** — rejected. Doesn't protect against direct database access, API bypasses, or developer mistakes. Every new endpoint would need manual auth checks.
- **Hybrid (RLS + app layer)** — we do light app-layer guards for UX (route protection, UI hiding), but RLS is the security boundary.

## Consequences

- Security enforced at DB level — even direct Supabase client calls respect access rules
- Every new table requires RLS policies (enforced by `/supabase-postgres-best-practices` skill)
- More complex SQL migrations (policies alongside table definitions)
- Supabase client automatically applies RLS based on JWT claims
- Must test RLS policies explicitly (insert/select as different roles)
