# 008. Expo Web for player web interface

**Status:** Accepted
**Date:** 2026-04-09

> [!note] Amended 2026-07-17 (ADR-016 / RAPP-71): the admin framework is now **TanStack Start**, not Next.js. This ADR's core decision stands; read "Next.js" as "TanStack Start" for the admin app.

> [!note] Amended 2026-07-23 (RAPP-15): "static export" here means Expo web `output: "single"` (a static **SPA** bundle served by Cloudflare Pages), not `output: "static"` (per-route SSG prerender). The player app is auth-gated and reads a persisted session from storage on first paint, which SSG cannot run on the server (`Tried to access storage on the server`); and the app is closed-access / invite-only (SPEC), so there is no SEO reason to prerender. Still a static export on Pages, still cheap; rendering happens client-side.

## Context

Players need a browser fallback for when they can't install the mobile app. Maintaining a separate web codebase for player screens would double the frontend work.

## Decision

Export Expo to web for the player-facing interface. Deploy as a static export to Cloudflare Pages. Player screens are simple enough (feed, calendar, profile) that Expo Web handles them well.

## Alternatives Considered

- **Separate React web app** — rejected. Maintenance burden, code duplication, inconsistent UX between mobile and web.
- **Next.js for player web too** — rejected. Would mean rewriting all player components in non-RN React. The admin app already uses Next.js for complex screens, but player screens don't need it.

## Consequences

- Single codebase for mobile and player web
- Static export — fast, cheap hosting on Cloudflare Pages
- Some RN components may need web-specific tweaks (tested during scaffold)
- Complex features (rich data tables, charts) stay on Next.js admin only
