# 025. Stable collaborating entity membership

**Status:** Accepted
**Date:** 2026-08-14

## Context

Entity collaborators need to share referrals, tracking, impact statistics, and event access with
other collaborators at the same entity. Profiles already carried `reference_entity`, but that field
is mutable display text. Using it as an authorization key would make a spelling change alter tenant
membership, and two entities with similar names could be joined accidentally. Removing one
collaborator must also leave the entity's referral history intact.

## Decision

Represent each partner as a tenant-owned `collaborating_entities` record. Entity profiles reference
that record through `collaborating_entity_id`, and referrals retain the same stable entity identity
independently of the collaborator who submitted them.

Entity access remains enforced in PostgreSQL through the RLS boundary established by ADR-009.
Collaborator and entity deactivation are soft lifecycle changes. They revoke refreshable sessions
where supported, ban new authentication, and make database authorization helpers deny an already
issued access token immediately. The existing `reference_entity` text remains descriptive only.

## Alternatives Considered

### Group by `profiles.reference_entity`

Rejected because display text is not a stable authorization identifier. Renaming, capitalization,
translation, or a typo could split or merge access unexpectedly.

### Keep referrals owned only by the submitting profile

Rejected because a second collaborator at the same entity would not see shared work, and removing
the original collaborator would orphan the entity's operational history.

### Delete entities and collaborators when access ends

Rejected because staff need the referral and audit history after the relationship ends. Soft
deactivation preserves that history while preventing new sessions and data access.

## Consequences

- Entity authorization and reporting use stable UUID membership rather than display text.
- Multiple collaborators can share one entity's referral history without seeing another entity.
- Referral history survives collaborator removal and entity deactivation.
- Every entity-role profile must carry a valid `collaborating_entity_id`.
- Entity renaming no longer changes authorization, but backfills and seeds must map legacy text to a
  stable record once.
- Immediate denial depends on active-aware database helpers because session revocation alone cannot
  invalidate an access token that has already been issued.
