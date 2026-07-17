# 016. TanStack Start for the admin app (supersedes 003, amends 001)

**Status:** Accepted
**Date:** 2026-07-17
**Supersedes:** [003 — OpenNext for admin hosting](003-opennext-admin-hosting.md)
**Vault issue:** RAPP-71

## Context

ADR-001/003 chose Next.js deployed to Cloudflare Workers through the OpenNext adapter. As of 2026-07-17 no admin code exists yet (only the RAPP-5 repo skeleton), so the framework choice could be revisited at zero migration cost. The OpenNext adapter was the most fragile link in the plan: it exists because Next.js assumes Vercel-shaped infrastructure, and it historically lags Next releases. Meanwhile TanStack Start reached 1.x with first-class Cloudflare Workers support and the mobile app already commits to TanStack React Query.

## Decision

Build `apps/admin` with **TanStack Start** (Vite, TanStack Router file routes), deployed to Cloudflare Workers **natively** via `@cloudflare/vite-plugin` + wrangler. No adapter layer.

Deployment shape (per the official hosting guide, verified 2026-07-17):

- `vite.config.ts`: `cloudflare({ viteEnvironment: { name: 'ssr' } })` + `tanstackStart()` + `viteReact()`
- `wrangler.jsonc`: `compatibility_flags: ["nodejs_compat"]`, `main: "@tanstack/react-start/server-entry"`
- Deploy: `vite build && wrangler deploy`

**Hard rule attached to this decision:** any issue implementing TanStack Start or TanStack Router code MUST consult the official docs (https://tanstack.com/start/latest, https://tanstack.com/router/latest) at execution time, before writing code, and verify APIs against the installed version. The framework is young and moving; training-data knowledge is presumed stale.

## Alternatives Considered

- **Keep Next.js + OpenNext** — rejected. Adapter fragility (tracks Next releases with lag), no stack alignment with mobile, and the admin (login-gated CRUD dashboard, no SEO) gets little from Next's server-components model.
- **Next.js on Vercel** — rejected previously in 003 (cost, third provider); still rejected.
- **Vite + React Router SPA (no SSR)** — viable for a pure dashboard, but Start adds typed server functions (useful for RGPD-sensitive operations that must not run client-side) at similar complexity.

## Consequences

- OpenNext (`@opennextjs/cloudflare`, `open-next.config.ts`) is deleted from the plan entirely
- Admin and mobile share TanStack Query patterns and mental models
- End-to-end type safety across routes, search params, and server functions
- Risk accepted: Start is younger (1.0 late 2025); the official guide flags the Cloudflare Vite integration as under active development. Mitigated by the official-docs-first hard rule and by the admin being internal, closed-access
- Versions at decision time: `@tanstack/react-start` 1.168.28, `@tanstack/react-router` 1.170.18, `@cloudflare/vite-plugin` 1.45.1, `wrangler` 4.112.0
- Sentry SDK for the admin becomes `@sentry/tanstackstart-react` (was `@sentry/nextjs`)
