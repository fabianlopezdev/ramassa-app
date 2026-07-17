# 012. Feedback drawer over self-management groups

**Status:** Accepted
**Date:** 2026-04-09

## Context

The client's proposal mentions "self-management groups" but the scope is unclear. The MVP is already large. We need a way for players to propose activities, share ideas, and report problems without building a full group management system.

## Decision

Implement a feedback drawer in Phase 8 with typed submissions (activity proposal, idea, problem, general). Submissions go to a staff inbox for review. Self-management groups may be added in a future phase based on real usage patterns.

## Alternatives Considered

- **Full self-management groups from MVP** — rejected. Scope risk — unclear requirements, unclear if players will engage with group features. Better to validate with a simpler mechanism first.
- **Skip entirely** — rejected. Players need a voice. The feedback drawer is minimal effort and high value.

## Consequences

- Simpler MVP scope
- Staff gets structured feedback instead of unstructured WhatsApp messages
- Can evolve into full group feature later based on data
- Client needs to clarify self-management group requirements before implementation
