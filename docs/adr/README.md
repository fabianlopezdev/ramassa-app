# Architecture Decision Records (ADRs)

Lightweight records of significant architecture decisions made in this project. Each ADR captures the context, decision, and consequences so future developers understand _why_ something was built a certain way.

## When to Write an ADR

Write an ADR when:

- You choose technology A over technology B
- You make a structural decision that would be expensive to reverse
- You deliberately reject a simpler/obvious approach for a specific reason
- An auditor or reviewer questions a decision and you want the rationale preserved

Do NOT write an ADR for:

- Code conventions (those go in CLAUDE.md)
- UX principles (those go in SPEC.md)
- Bug fixes or implementation details

## Template

```markdown
# [NUMBER]. [Title]

**Status:** Accepted | Superseded by [ADR-XXX] | Deprecated
**Date:** YYYY-MM-DD

## Context

What is the issue that we're seeing that motivates this decision?

## Decision

What is the change that we're proposing and/or doing?

## Alternatives Considered

What other options were evaluated and why were they rejected?

## Consequences

What becomes easier or harder because of this decision?
```

## ADR Enforcement

At every checkpoint commit (Checkpoints A, B, C, D in the Phase 1 plan, and equivalents in future phases), review whether any new architecture decisions were made since the last checkpoint. If so, write an ADR before proceeding.

## Index

| #   | Title                                                                          | Status            | Date       |
| --- | ------------------------------------------------------------------------------ | ----------------- | ---------- |
| 001 | [Monorepo split: Expo + Next.js](001-monorepo-split.md)                        | Accepted          | 2026-04-09 |
| 002 | [Cloudflare R2 for media storage](002-cloudflare-r2-media.md)                  | Accepted          | 2026-04-09 |
| 003 | [OpenNext for admin hosting](003-opennext-admin-hosting.md)                    | Superseded by 016 | 2026-04-09 |
| 004 | [pgcrypto encryption from day 1](004-encryption-day-one.md)                    | Accepted          | 2026-04-09 |
| 005 | [Magic link auth + password fallback](005-magic-link-auth.md)                  | Accepted          | 2026-04-09 |
| 006 | [5 languages with RTL from day 1](006-five-languages-rtl.md)                   | Accepted          | 2026-04-09 |
| 007 | [Pluggable auto-translation provider](007-pluggable-translation.md)            | Accepted          | 2026-04-09 |
| 008 | [Expo Web for player web interface](008-expo-web-player.md)                    | Accepted          | 2026-04-09 |
| 009 | [PostgreSQL RLS over app-layer auth](009-rls-over-app-auth.md)                 | Accepted          | 2026-04-09 |
| 010 | [White-label org_id from day 1](010-white-label-org-id.md)                     | Accepted          | 2026-04-09 |
| 011 | [Supabase EU Frankfurt for RGPD](011-supabase-eu-rgpd.md)                      | Accepted          | 2026-04-09 |
| 012 | [Feedback drawer over self-management groups](012-feedback-drawer.md)          | Accepted          | 2026-04-09 |
| 013 | [Client-side image compression before upload](013-client-image-compression.md) | Accepted          | 2026-04-09 |
| 014 | [Forum auto-hide at 3 flags](014-forum-auto-hide.md)                           | Accepted          | 2026-04-09 |
| 015 | [Shared design tokens](015-shared-design-tokens.md)                            | Accepted          | 2026-04-09 |
| 016 | [TanStack Start for the admin app](016-tanstack-start-admin.md)                | Accepted          | 2026-07-17 |
| 017 | [NativeWind 4 stable over v5 preview](017-nativewind-4-stable.md)              | Accepted          | 2026-07-17 |
| 018 | [bun hoisted linker for the monorepo](018-bun-hoisted-linker.md)               | Accepted          | 2026-07-17 |
