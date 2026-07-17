# 001. Monorepo split: Expo + Next.js

**Status:** Accepted
**Date:** 2026-04-09

## Context

We need both a mobile app (Android-first, iOS secondary) and a web admin panel. The admin panel requires complex data tables, charts, sidebar navigation, and rich form editors that React Native Web handles poorly. Research confirmed that Expo Web is suitable for simple consumer screens but not for admin dashboards.

## Decision

Use a bun workspace monorepo with three packages:

- `apps/mobile` — Expo SDK 52+ / React Native / NativeWind / Expo Router (player mobile + player web export)
- `apps/admin` — Next.js (App Router) / Tailwind CSS / shadcn/ui (staff admin + entity portal)
- `packages/shared` — TypeScript types, hooks, i18n, Supabase client, design tokens

## Alternatives Considered

- **Single Expo codebase for everything** — rejected because Expo Web cannot render complex admin UIs (data tables, sidebars, charts) at production quality. Would require fighting the framework.
- **Separate repos** — rejected because shared code (types, hooks, i18n, Supabase client) would need to be published as packages or duplicated.

## Consequences

- Each tool is used for what it does best (Expo for mobile, Next.js for admin)
- Shared package prevents code duplication for business logic
- Two build pipelines to maintain (Expo + Next.js)
- Developers need familiarity with both frameworks
