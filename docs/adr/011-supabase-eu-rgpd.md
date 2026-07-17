# 011. Supabase EU Frankfurt for RGPD compliance

**Status:** Accepted
**Date:** 2026-04-09

## Context

The app stores personal data of refugee women (names, addresses, document numbers, nationality, dependents). RGPD (EU data protection regulation) requires data residency in the EU. The Generalitat grant also implies compliance with Spanish/Catalan data protection laws.

## Decision

Host the Supabase project in EU — Frankfurt region. All user data stays within the EU.

## Alternatives Considered

- **US regions** — rejected. RGPD non-compliant for EU citizen/resident data. Legal risk for the grant.
- **Self-hosted Supabase in EU** — viable but adds operational burden. Managed Supabase in Frankfurt is simpler and still compliant.

## Consequences

- Full RGPD compliance for data residency
- Slightly higher latency for non-EU users (acceptable — all users are in Barcelona)
- Supabase Pro plan ($25/month) in EU region
- Encryption at rest (ADR-004) adds another layer of RGPD compliance
