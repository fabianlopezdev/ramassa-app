# 010. White-label org_id from day 1

**Status:** Accepted
**Date:** 2026-04-09

## Context

The app is built for AE Ramassa, but the Generalitat grant values replicability. Other social entities and sports clubs should be able to adopt the platform. Adding multi-tenancy later requires touching every table and query.

## Decision

Every table has an `org_id` foreign key to `organizations`. Every query filters by org. Branding (logo, colors, available languages) is configurable per organization.

## Alternatives Considered

- **Single-tenant, add multi-tenancy later** — rejected. Retrofitting `org_id` on every table and query is a massive, error-prone migration. Cheaper to add the column from day 1 even if there's only one org initially.

## Consequences

- Every query requires `org_id` filter (RLS policies handle this automatically)
- `organizations` table stores branding config (colors, logo, available languages)
- Design tokens can be overridden per org at runtime
- Slightly more complex initial schema, but scales to multiple orgs with zero code changes
