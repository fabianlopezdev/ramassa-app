> [!warning] HISTORICAL (superseded 2026-07-16 by the vault issue plan, RAPP-5..71; see CLAUDE.md Workflow Contract rule 1). Framework note 2026-07-17: admin is now TanStack Start, not Next.js (ADR-016); Next/OpenNext references below are stale.

# Phase 1: Task List — Monorepo Scaffold, Auth & Infrastructure

## Foundation (Tasks 1-5)

- [ ] **Task 1:** Monorepo structure + tooling (bun workspace, ESLint, Prettier, TypeScript, husky, lint-staged, CI/CD) `[M]`
- [ ] **Task 2:** Shared package foundations — tokens, constants, logger `[S]` — _depends on: T1_
- [ ] **Task 3:** Supabase project + initial migration (organizations, profiles, pgcrypto encryption, RLS) `[M]` — `/supabase-postgres-best-practices` `/supabase` — _depends on: T1_
- [ ] **Task 4:** i18n config + 5 language files (CA, ES, EN, AR, FA) + RTL support `[M]` — _depends on: T2_
- [ ] **Task 5:** Supabase client + auth hooks + safeAsync utility (shared) `[M]` — `/supabase` — _depends on: T2, T3_

### CHECKPOINT A: Foundation

- [ ] Monorepo builds and typechecks
- [ ] Shared package exports everything
- [ ] Supabase running with tables + RLS
- [ ] All 5 translation files exist
- [ ] CI pipeline works

## App Shells (Tasks 6-7)

- [ ] **Task 6:** Expo app scaffold + NativeWind + 5-tab layout shell + RTL + MMKV + Arabic/Farsi fonts `[M-L]` — `/react-native-perfection` — _depends on: T2, T4_
- [ ] **Task 7:** Next.js app scaffold + shadcn/ui + admin sidebar + entity portal + OpenNext config `[M-L]` — `/web-perf` — _depends on: T2, T4_

### CHECKPOINT B: App Shells

- [ ] Both apps render without errors
- [ ] Navigation works (tabs on mobile, sidebar on admin)
- [ ] i18n works in both apps
- [ ] RTL works in both apps

## Auth (Tasks 8-10)

- [ ] **Task 8:** Mobile magic link login + MMKV session persistence + deep linking `[S-M]` — `/react-native-perfection` `/supabase` — _depends on: T5, T6_
- [ ] **Task 9:** Admin magic link login + session + role-based routing `[S-M]` — `/supabase` — _depends on: T5, T7_
- [ ] **Task 10:** Admin create user account (fallback auth — Edge Function) `[M]` — `/supabase-postgres-best-practices` `/supabase` — _depends on: T3, T9_

### CHECKPOINT C: Auth Complete

- [ ] All 3 auth flows work (player magic link, staff magic link, admin-created account)
- [ ] Sessions persist
- [ ] Role-based routing works

## Infrastructure (Tasks 11-13)

- [ ] **Task 11:** Push notification token registration (mobile) `[S]` — `/supabase` `/react-native-perfection` — _depends on: T3, T8_
- [ ] **Task 12:** Cloudflare R2 + Worker presigned URL upload + image compression `[M]` — `/cloudflare` `/wrangler` `/workers-best-practices` — _depends on: T2, T5_
- [ ] **Task 13:** Developer menu scaffold (both apps) `[M]` — _depends on: T2, T6, T7_

## Verification (Task 14)

- [ ] **Task 14:** Cloudflare deployment (OpenNext + Pages) + full E2E verification `[M]` — `/cloudflare` `/wrangler` — _depends on: all previous_

### CHECKPOINT D: Phase 1 Complete

- [ ] All 14 tasks done
- [ ] Full E2E verification passes
- [ ] Ready for Phase 2: Onboarding & Profiles + Equipment Tracking

---

## Task Sizing Key

`[XS]` 1 file | `[S]` 1-2 files | `[M]` 3-5 files | `[M-L]` 5-8 files | `[L]` 8+ files (should be split)

## Platform Skills Key

Each task lists which platform skills MUST run before committing:

- `/react-native-perfection` — mobile `.tsx`/`.ts` files
- `/supabase-postgres-best-practices` — database migrations, RLS, queries
- `/supabase` — Supabase client code, auth, Edge Functions
- `/cloudflare` — R2, Pages, Workers
- `/wrangler` — Cloudflare Workers development
- `/workers-best-practices` — Workers runtime best practices
- `/web-perf` — Next.js admin performance
