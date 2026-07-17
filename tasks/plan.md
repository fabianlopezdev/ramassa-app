> [!warning] HISTORICAL (superseded 2026-07-16 by the vault issue plan, RAPP-5..71; see CLAUDE.md Workflow Contract rule 1). Framework note 2026-07-17: admin is now TanStack Start, not Next.js (ADR-016); Next/OpenNext references below are stale.

# Implementation Plan: App Ramassa

## Overview

Cross-platform application for AE Ramassa's inclusive women's football program. Monorepo with two apps (Expo mobile + Next.js admin) and a shared package, backed by Supabase (EU) and Cloudflare (R2, Pages, Workers).

This plan details **Phase 1** (Monorepo Scaffold, Auth & Infrastructure) with granular tasks, and provides the high-level roadmap for Phases 2-9. Each subsequent phase will be planned in detail when we reach it.

## Architecture Decisions (Locked In)

- **Monorepo**: bun workspaces — `apps/mobile`, `apps/admin`, `packages/shared`
- **Mobile + Player Web**: Expo SDK 52+ / React Native / NativeWind / Expo Router
- **Admin + Entity Portal**: Next.js (App Router) / Tailwind CSS / shadcn/ui
- **Backend**: Supabase (EU — Frankfurt) — PostgreSQL, Auth, Realtime, Edge Functions
- **Media Storage**: Cloudflare R2 (zero egress, 10GB free)
- **Admin Hosting**: Cloudflare Workers via OpenNext (`@opennextjs/cloudflare`) — NOT `@cloudflare/next-on-pages` (deprecated, broken in production). OpenNext is Cloudflare's official recommendation for Next.js, supports full Node.js runtime.
- **Player Web Hosting**: Cloudflare Pages (static Expo web export)
- **Serverless**: Cloudflare Workers (presigned URLs for R2, image compression, auto-translation)
- **Encryption**: pgcrypto from day 1 — sensitive fields (`address`, `postal_code`, `phone`, `document_number`) encrypted in the initial migration, not deferred. Rationale: migrating from TEXT to BYTEA with real data is riskier than building encryption into the foundation. For a project handling refugee women's personal data under RGPD, encryption is a foundational requirement, not a polish step. The small upfront cost of writing encrypt/decrypt helpers is worth avoiding a data migration later.
- **Auth**: Magic link (email) primary, admin-created account fallback
- **i18n**: 5 languages from day 1 — CA, ES, EN, AR, FA — full RTL
- **Design Tokens**: Shared `tokens.ts` consumed by both NativeWind and Tailwind configs

## Phase Dependency Graph

```
Phase 1: Scaffold + Auth + Infra ─────────────────────────────┐
    │                                                          │
    ├── Phase 2: Onboarding + Profiles + Equipment             │
    │     │                                                    │
    │     ├── Phase 3: CMS (Events, Announcements, KB,         │
    │     │            Participant Stories, Scheduling)          │
    │     │     │                                               │
    │     │     ├── Phase 4: Attendance Tracking                │
    │     │     │                                               │
    │     │     ├── Phase 5a: Services + Entity Portal          │
    │     │     │     │                                         │
    │     │     │     ├── Phase 5b: Messaging                   │
    │     │     │     │                                         │
    │     │     │     └── Phase 7: Entity Referrals + Tracking  │
    │     │     │                                               │
    │     │     ├── Phase 6: Forum + Media Sharing              │
    │     │     │   (parallel with 5a — no dependency)          │
    │     │     │                                               │
    │     │     └── Phase 8: Mentoring, Feedback, Surveys       │
    │     │                                                    │
    └── Phase 9: Analytics, Reporting, Polish ─────────────────┘
```

---

## Phase 1: Monorepo Scaffold, Auth & Infrastructure

### Internal Dependency Graph

```
Task 1: Monorepo + tooling
    │
    ├── Task 2: Shared package foundations (tokens, constants, logger)
    │     │
    │     ├── Task 3: Supabase project + initial migration + RLS
    │     │     │
    │     │     └── Task 5: Supabase client + auth hooks (shared)
    │     │
    │     └── Task 4: i18n config + translation files + RTL
    │
    ├── Task 6: Expo app scaffold + NativeWind + tab layout
    │     │
    │     ├── Task 8: Mobile magic link login + session persistence
    │     │
    │     └── Task 11: Push notification token registration
    │
    ├── Task 7: Next.js app scaffold + shadcn/ui + sidebar/entity layouts
    │     │
    │     ├── Task 9: Admin magic link login + session
    │     │
    │     └── Task 10: Admin create user account (fallback auth)
    │
    ├── Task 12: Cloudflare R2 + presigned URL upload
    │
    └── Task 13: Developer menu scaffold (both apps)

    CHECKPOINT → Task 14: E2E verification
```

---

### Task 1: Monorepo structure + tooling

**Description:** Initialize the bun workspace monorepo with three packages. Configure shared TypeScript, ESLint, Prettier, and pre-commit hooks (husky + lint-staged). Set up GitHub Actions CI pipeline.

**Acceptance criteria:**

- [ ] `bun install` at root installs all workspace dependencies
- [ ] `apps/mobile/`, `apps/admin/`, `packages/shared/` exist as workspace packages
- [ ] Shared TypeScript config (`tsconfig.base.json`) with strict mode, extended by all packages
- [ ] ESLint config shared at root, extends to both apps
- [ ] Prettier config shared at root
- [ ] husky pre-commit hook runs: `bunx lint-staged` then `bunx tsc --noEmit`
- [ ] lint-staged config: `*.{ts,tsx}` → eslint + prettier, `*.{json,md,css}` → prettier
- [ ] `.github/workflows/ci.yml` runs lint, typecheck, test, build in parallel
- [ ] `.github/workflows/eas-build.yml` triggers on version tags
- [ ] `.github/dependabot.yml` configured for weekly updates
- [ ] `.gitignore` covers node_modules, .env, dist, .expo, .next, etc.

**Verification:**

- [ ] `bun run typecheck` passes (zero errors)
- [ ] `bun run lint` passes
- [ ] `bun run format` runs without errors
- [ ] Git commit triggers pre-commit hooks successfully

**Dependencies:** None (first task)

**Files created:**

- `package.json` (root workspace)
- `apps/mobile/package.json`
- `apps/admin/package.json`
- `packages/shared/package.json`
- `tsconfig.base.json`
- `.eslintrc.js` (or `eslint.config.js`)
- `.prettierrc`
- `.husky/pre-commit`
- `.github/workflows/ci.yml`
- `.github/workflows/eas-build.yml`
- `.github/dependabot.yml`
- `.gitignore`
- `.env.example`

**Estimated scope:** Medium (10+ config files, but mostly boilerplate)

---

### Task 2: Shared package foundations — tokens, constants, logger

**Description:** Create the shared package with design tokens, app-wide constants, logger utility, and TypeScript types barrel. Both apps will import from `@ramassa/shared`.

**Acceptance criteria:**

- [ ] `packages/shared/lib/tokens.ts` defines colors, spacing, radius, fontSize, tapTarget, upload limits, forum thresholds
- [ ] `packages/shared/lib/constants.ts` defines app-wide constants (roles, auth types, forum flag reasons, survey question types, etc.)
- [ ] `packages/shared/lib/logger.ts` implements tagged logger (info, warn, error) — active in dev, stripped in production
- [ ] `packages/shared/types/index.ts` exports shared type definitions
- [ ] Package exports are configured in `package.json` (exports field)
- [ ] Both apps can `import { tokens } from '@ramassa/shared/lib/tokens'`
- [ ] Logger uses `__DEV__` (mobile) and `process.env.NODE_ENV` (admin) for environment detection

**Verification:**

- [ ] `bun run typecheck` passes
- [ ] Import from `@ramassa/shared` resolves in both apps (test with a dummy import)
- [ ] Unit test: logger outputs in dev, is silent in prod

**Dependencies:** Task 1

**Files created:**

- `packages/shared/lib/tokens.ts`
- `packages/shared/lib/constants.ts`
- `packages/shared/lib/logger.ts`
- `packages/shared/types/index.ts`
- `packages/shared/types/database.ts` (placeholder, generated later)
- `packages/shared/tsconfig.json`
- `packages/shared/package.json` (updated with exports)

**Estimated scope:** Small (5-6 files)

---

### Task 3: Supabase project + initial migration + RLS

**Description:** Set up the Supabase project (EU — Frankfurt), create the initial SQL migration with `organizations` and `profiles` tables including pgcrypto encryption, and apply RLS policies. Establish the migration workflow for all future phases.

> **Decision: encryption from day 1.** An auditor suggested deferring encryption to Phase 2 to avoid slowing down the foundation. We deliberately chose NOT to defer. Rationale: (1) migrating from TEXT to BYTEA with real user data is a risky, breaking change — much harder than setting it up in an empty database; (2) this project handles refugee women's personal data under RGPD — encryption is a foundational security requirement, not a polish step; (3) the upfront cost is small (write encrypt/decrypt helpers once) and it ensures every developer who touches profiles from Phase 2 onward works with the correct encrypted schema from the start, rather than accidentally writing queries against unencrypted TEXT columns that will later need to be rewritten.

**Acceptance criteria:**

- [ ] Supabase project created in EU (Frankfurt) region and **deployed to cloud** (not just local — Edge Functions in Task 10 require a cloud-deployed project)
- [ ] `supabase/` directory initialized (`bunx supabase init`)
- [ ] First migration creates: `organizations` table (with `available_languages`, `default_language`)
- [ ] First migration creates: `profiles` table with encrypted columns (`address`, `postal_code`, `phone`, `document_number` as BYTEA)
- [ ] `CREATE EXTENSION IF NOT EXISTS pgcrypto` in migration
- [ ] Encryption helpers created: reusable SQL functions for `pgp_sym_encrypt`/`pgp_sym_decrypt` using Supabase Vault key
- [ ] RLS enabled on both tables
- [ ] RLS policies: players see own profile; staff see all profiles in org; admin full access
- [ ] `supabase/seed.sql` creates a test organization ("AE Ramassa") and a test admin user
- [ ] Generated TypeScript types via `bunx supabase gen types typescript` → `packages/shared/types/database.ts`
- [ ] Migration workflow documented: `bunx supabase db diff` to generate migrations, naming convention (`NNNNN_description.sql`), and process for creating new migrations in future tasks

**Verification:**

- [ ] `bunx supabase db push` applies migration without errors (both local and cloud)
- [ ] `bunx supabase gen types typescript` generates types successfully
- [ ] Seed data is queryable via Supabase Studio
- [ ] RLS: authenticated request as player cannot read other profiles (test via Supabase Studio or REST)
- [ ] Encryption: can insert and read back an encrypted `document_number` via SQL

**Dependencies:** Task 1

**Files created:**

- `supabase/config.toml`
- `supabase/migrations/00001_initial_schema.sql`
- `supabase/seed.sql`
- `packages/shared/types/database.ts` (generated)

**Estimated scope:** Medium (SQL + config, requires Supabase project setup)

**Platform skills:** `/supabase-postgres-best-practices` (MANDATORY), `/supabase`

---

### Task 4: i18n configuration + 5 language files + RTL

**Description:** Set up react-i18next with shared configuration. Create translation files for all 5 languages with initial keys (common UI: buttons, navigation, errors, auth). Configure RTL detection for Arabic and Farsi.

**Acceptance criteria:**

- [ ] `packages/shared/lib/i18n.ts` configures react-i18next with fallback chain (user language → `ca`)
- [ ] `packages/shared/locales/ca.json` — Catalan translations (primary, complete)
- [ ] `packages/shared/locales/es.json` — Spanish
- [ ] `packages/shared/locales/en.json` — English
- [ ] `packages/shared/locales/ar.json` — Arabic
- [ ] `packages/shared/locales/fa.json` — Farsi
- [ ] All 5 files have identical key structure with at least: `common.*` (buttons, labels), `auth.*` (login, magic link), `nav.*` (tab names, sidebar items), `errors.*` (generic errors)
- [ ] RTL detection utility: `isRTL(language)` returns true for `ar` and `fa`
- [ ] i18n config is importable from both Expo and Next.js apps
- [ ] Missing translation key handler: in dev mode, logs a warning via shared `logger` when a translation key is used but missing from any language file. Prevents silent key drift between languages.

**Verification:**

- [ ] `bun run typecheck` passes
- [ ] Unit test: switching language changes output of `t('common.save')`
- [ ] Unit test: `isRTL('ar')` returns true, `isRTL('ca')` returns false
- [ ] Unit test: using a non-existent key triggers a dev warning (not a crash)

**Dependencies:** Task 2 (needs shared package structure)

**Files created:**

- `packages/shared/lib/i18n.ts`
- `packages/shared/lib/rtl.ts`
- `packages/shared/locales/ca.json`
- `packages/shared/locales/es.json`
- `packages/shared/locales/en.json`
- `packages/shared/locales/ar.json`
- `packages/shared/locales/fa.json`

**Estimated scope:** Medium (config + 5 translation files)

---

### Task 5: Supabase client + auth hooks (shared)

**Description:** Create the shared Supabase client and authentication hooks. Both apps will use these hooks for login, session management, and user data.

**Acceptance criteria:**

- [ ] `packages/shared/lib/supabase.ts` — creates Supabase client with environment-based URL/key
- [ ] `packages/shared/hooks/use-auth.ts` — auth hook with: `signInWithMagicLink(email)`, `signInWithPassword(email, password)`, `signOut()`, `user`, `session`, `isLoading`, `isAuthenticated`
- [ ] `packages/shared/hooks/use-profile.ts` — fetches current user's profile from `profiles` table
- [ ] Auth hook handles session refresh and persistence
- [ ] Both hooks use TanStack React Query for caching
- [ ] Error handling returns typed errors (not raw exceptions)
- [ ] `safeAsync` utility in `packages/shared/lib/safe-async.ts` — wraps async operations, returns `Result<T, Error>`

**Verification:**

- [ ] `bun run typecheck` passes
- [ ] Unit test: `signInWithMagicLink` calls Supabase `signInWithOtp`
- [ ] Unit test: `safeAsync` returns success/error variants correctly
- [ ] Unit test: `useProfile` returns profile data when authenticated

**Dependencies:** Task 3 (needs Supabase project + types), Task 2 (needs logger)

**Files created:**

- `packages/shared/lib/supabase.ts`
- `packages/shared/lib/safe-async.ts`
- `packages/shared/hooks/use-auth.ts`
- `packages/shared/hooks/use-profile.ts`

**Estimated scope:** Medium (4 files, core auth logic)

**Platform skills:** `/supabase`

---

### CHECKPOINT A: After Tasks 1-5 (Foundation)

- [ ] Monorepo builds and typechecks cleanly
- [ ] Shared package exports tokens, constants, logger, i18n, Supabase client, auth hooks
- [ ] Supabase project running with organizations + profiles tables + RLS
- [ ] All 5 translation files exist with matching key structure
- [ ] Pre-commit hooks and CI pipeline work
- [ ] `bun run typecheck && bun run test` passes

- [ ] **ADR check:** Review decisions made in Tasks 1-5. Write ADRs for any new architecture decisions. Update `docs/adr/README.md` index.

**Review with Fabian before proceeding to app scaffolds.**

---

### Task 6: Expo app scaffold + NativeWind + tab layout shell

**Description:** Initialize the Expo project inside `apps/mobile/`. Configure NativeWind with shared tokens, Expo Router with file-based routing, and create the tab navigation layout for players. Include RTL support.

**Acceptance criteria:**

- [ ] Expo SDK 55+ initialized with TypeScript template
- [ ] NativeWind configured, extending Tailwind config from shared tokens
- [ ] Expo Router configured with file-based routing
- [ ] `app/(auth)/` route group exists (placeholder screens)
- [ ] `app/(app)/(tabs)/` layout with 5 tabs: Home, Calendar, Community, Services, Profile
- [ ] Each tab has icon + label (no text-only navigation)
- [ ] Tab bar respects RTL layout direction
- [ ] `app/(app)/(tabs)/index.tsx` renders a placeholder "Home" screen with `t('nav.home')`
- [ ] All placeholder screens use translation keys (zero hardcoded strings)
- [ ] NativeWind `start`/`end` used everywhere (no `left`/`right`)
- [ ] `expo-localization` detects device language and sets initial i18n language
- [ ] MMKV storage configured (used by auth session in Task 8, dev menu cache clear in Task 13)
- [ ] Arabic/Farsi fonts bundled and configured (e.g., Noto Sans Arabic, Vazirmatn) for correct script rendering

**Verification:**

- [ ] `bunx expo start` launches without errors
- [ ] App renders on Android emulator or Expo Go
- [ ] Tab navigation works
- [ ] Switching language in i18n config changes tab labels
- [ ] RTL mode (set language to `ar`) flips layout correctly
- [ ] Arabic and Farsi text renders correctly with bundled fonts
- [ ] `bun run typecheck` passes

**Dependencies:** Task 2 (tokens), Task 4 (i18n)

**Files created:**

- `apps/mobile/app.json` / `app.config.ts`
- `apps/mobile/app/_layout.tsx`
- `apps/mobile/app/(auth)/_layout.tsx`
- `apps/mobile/app/(auth)/login.tsx` (placeholder)
- `apps/mobile/app/(app)/_layout.tsx`
- `apps/mobile/app/(app)/(tabs)/_layout.tsx`
- `apps/mobile/app/(app)/(tabs)/index.tsx`
- `apps/mobile/app/(app)/(tabs)/calendar.tsx`
- `apps/mobile/app/(app)/(tabs)/community.tsx`
- `apps/mobile/app/(app)/(tabs)/services.tsx`
- `apps/mobile/app/(app)/(tabs)/profile.tsx`
- `apps/mobile/tailwind.config.ts`
- `apps/mobile/babel.config.js`
- `apps/mobile/metro.config.js`

**Estimated scope:** Medium-Large (many files but mostly scaffolding)

**Platform skills:** `/react-native-perfection`

---

### Task 7: Next.js app scaffold + shadcn/ui + admin & entity layouts

**Description:** Initialize the Next.js project inside `apps/admin/`. Configure Tailwind with shared tokens, install shadcn/ui, and create the sidebar layout for admin and the separate entity portal layout.

**Acceptance criteria:**

- [ ] Next.js (App Router) initialized with TypeScript
- [ ] Tailwind CSS configured, extending from shared tokens
- [ ] shadcn/ui initialized with project-appropriate theme
- [ ] `app/(auth)/login/page.tsx` — placeholder login page
- [ ] `app/(admin)/layout.tsx` — admin sidebar layout with navigation items matching SPEC routes
- [ ] `app/(admin)/dashboard/page.tsx` — placeholder dashboard
- [ ] `app/(entity)/layout.tsx` — entity portal layout (separate from admin)
- [ ] `app/(entity)/dashboard/page.tsx` — placeholder entity dashboard
- [ ] Sidebar navigation uses translation keys (i18n setup for Next.js)
- [ ] RTL support: layout direction flips for Arabic/Farsi
- [ ] Responsive: sidebar collapses on mobile viewports
- [ ] Both layouts have breadcrumb navigation

**Verification:**

- [ ] `bun run dev:admin` starts Next.js dev server without errors
- [ ] Admin layout renders with sidebar at `/dashboard`
- [ ] Entity layout renders separately at entity routes
- [ ] Sidebar collapses on narrow viewport
- [ ] `bun run typecheck` passes
- [ ] `bun run build:admin` succeeds
- [ ] OpenNext build works: `bunx @opennextjs/cloudflare build` completes without errors (validates Cloudflare Workers compatibility)

**Dependencies:** Task 2 (tokens), Task 4 (i18n)

**Files created:**

- `apps/admin/app/layout.tsx` (root)
- `apps/admin/app/(auth)/login/page.tsx`
- `apps/admin/app/(admin)/layout.tsx`
- `apps/admin/app/(admin)/dashboard/page.tsx`
- `apps/admin/app/(entity)/layout.tsx`
- `apps/admin/app/(entity)/dashboard/page.tsx`
- `apps/admin/components/ui/` (shadcn components)
- `apps/admin/components/admin/sidebar.tsx`
- `apps/admin/components/entity/sidebar.tsx`
- `apps/admin/tailwind.config.ts`
- `apps/admin/next.config.js`
- `apps/admin/open-next.config.ts` (OpenNext config for Cloudflare Workers deployment)
- `apps/admin/wrangler.toml` (Cloudflare Workers config)

**Estimated scope:** Medium-Large (many files but mostly scaffolding)

**Platform skills:** `/web-perf`

---

### CHECKPOINT B: After Tasks 6-7 (App Shells)

- [ ] Both apps start and render without errors
- [ ] Mobile app shows tab navigation with 5 tabs (icons + labels)
- [ ] Admin app shows sidebar navigation
- [ ] Entity portal shows separate layout
- [ ] i18n works in both apps (switching language changes UI text)
- [ ] RTL works in both apps (Arabic/Farsi flips layout)
- [ ] `bun run typecheck` passes across entire monorepo
- [ ] Both apps import successfully from `@ramassa/shared`

- [ ] **ADR check:** Review decisions made in Tasks 6-7. Write ADRs for any new architecture decisions. Update `docs/adr/README.md` index.

**Review with Fabian before implementing auth.**

---

### Task 8: Mobile magic link login screen + session persistence

**Description:** Build the player-facing login screen in the Expo app. User enters email, receives magic link, taps it, and is authenticated. Session persists via MMKV so user stays logged in.

**Acceptance criteria:**

- [ ] `app/(auth)/login.tsx` — clean, accessible login screen with email input and "Send magic link" button
- [ ] Uses `useAuth().signInWithMagicLink(email)` from shared hooks
- [ ] Shows loading state while magic link is being sent
- [ ] Shows success message: "Check your email for the login link"
- [ ] Shows error message if email send fails (in user's language)
- [ ] Deep link handling: app receives magic link callback and completes auth
- [ ] Session stored in MMKV (configured in Task 6) — user stays logged in after app restart
- [ ] If session exists on app launch, skip login screen → navigate to `(app)/(tabs)/`
- [ ] If session expired, redirect to login screen
- [ ] Email input has proper keyboard type, autocomplete, min tap target
- [ ] All strings use translation keys

**Verification:**

- [ ] `bun run typecheck` passes
- [ ] Login screen renders correctly on Android emulator
- [ ] Can send magic link to a test email (via Supabase)
- [ ] Opening magic link on device completes authentication
- [ ] Session persists after app restart
- [ ] Component test: login screen renders, shows loading on submit

**Dependencies:** Task 5 (auth hooks), Task 6 (Expo scaffold)

**Files modified:**

- `apps/mobile/app/(auth)/login.tsx` (replace placeholder)
- `apps/mobile/app/_layout.tsx` (add auth state check + redirect)

**Files created:**

- `apps/mobile/src/lib/session-storage.ts` (MMKV session persistence)

**Estimated scope:** Small-Medium (2-3 files)

**Platform skills:** `/react-native-perfection`, `/supabase`

---

### Task 9: Admin magic link login page + session

**Description:** Build the admin/entity login page in the Next.js app. Same magic link flow as mobile, adapted for web.

**Acceptance criteria:**

- [ ] `app/(auth)/login/page.tsx` — clean login page with email input using shadcn/ui components
- [ ] Uses `useAuth().signInWithMagicLink(email)` from shared hooks
- [ ] Loading state, success message, error handling
- [ ] After auth callback, redirects to appropriate dashboard based on role:
  - `staff`/`admin` → `(admin)/dashboard`
  - `entity` → `(entity)/dashboard`
- [ ] Session persists via localStorage/cookies — user stays logged in
- [ ] Protected routes: unauthenticated users redirected to login
- [ ] All strings use translation keys
- [ ] Responsive: works on mobile and desktop viewports

**Verification:**

- [ ] `bun run build:admin` succeeds
- [ ] Login page renders, can send magic link
- [ ] Auth callback redirects to correct dashboard
- [ ] Session persists after page refresh
- [ ] Protected route redirects unauthenticated user

**Dependencies:** Task 5 (auth hooks), Task 7 (Next.js scaffold)

**Files modified:**

- `apps/admin/app/(auth)/login/page.tsx` (replace placeholder)
- `apps/admin/app/(admin)/layout.tsx` (add auth protection)
- `apps/admin/app/(entity)/layout.tsx` (add auth protection)

**Estimated scope:** Small-Medium (3 files)

**Platform skills:** `/supabase`

---

### Task 10: Admin create user account (fallback auth)

**Description:** Build the admin capability to create user accounts directly — for players without email. Admin enters name + generates internal email (`name.id@ramassa.app`) + sets password. This is the fallback auth method.

**Acceptance criteria:**

- [ ] Admin route: `app/(admin)/participants/create/page.tsx` — form to create a new participant account
- [ ] Form fields: first name, last name, role (player default), password (generated or manual)
- [ ] System generates internal email: `firstname.randomid@ramassa.app`
- [ ] Calls Supabase Admin API (via Edge Function — requires cloud-deployed Supabase project, set up in Task 3) to create auth user + profile
- [ ] Success: shows created credentials (internal email + password) for staff to share with player
- [ ] Copy-to-clipboard button for credentials
- [ ] Edge Function `supabase/functions/create-user/` handles user creation server-side (needs service role key)
- [ ] Proper error handling: duplicate email, missing fields
- [ ] Only accessible by `staff` and `admin` roles

**Verification:**

- [ ] Admin can create a user account via the form
- [ ] Created user can log in with the generated email + password
- [ ] Non-admin users cannot access this route (RLS + frontend guard)
- [ ] Edge Function handles errors gracefully

**Dependencies:** Task 9 (admin auth), Task 3 (profiles table)

**Files created:**

- `apps/admin/app/(admin)/participants/create/page.tsx`
- `supabase/functions/create-user/index.ts`

**Estimated scope:** Medium (admin page + Edge Function)

**Platform skills:** `/supabase-postgres-best-practices`, `/supabase`

---

### CHECKPOINT C: After Tasks 8-10 (Auth Complete)

- [ ] Player can log in via magic link on mobile app
- [ ] Staff can log in via magic link on admin web
- [ ] Entity user can log in via magic link and sees entity portal
- [ ] Admin can create a player account without email (fallback auth)
- [ ] Sessions persist across app/page restarts
- [ ] Role-based routing works (player → tabs, staff → admin sidebar, entity → entity portal)
- [ ] All auth errors show user-friendly messages in the user's language

- [ ] **ADR check:** Review decisions made in Tasks 8-10. Write ADRs for any new architecture decisions. Update `docs/adr/README.md` index.

**This is the critical auth checkpoint. All subsequent features depend on working auth.**

---

### Task 11: Push notification token registration (mobile)

**Description:** Register Expo push notification tokens when a player logs in on mobile. Store tokens in the `push_tokens` table.

**Acceptance criteria:**

- [ ] `push_tokens` table migration (if not in initial migration, add it)
- [ ] On successful auth, app requests push notification permission
- [ ] If granted, registers Expo push token and stores in `push_tokens` table
- [ ] Token includes platform (`android`, `ios`, `web`)
- [ ] If token already exists for this user+device, no duplicate created
- [ ] If permission denied, app continues without push (no blocking)
- [ ] Token cleanup on sign out
- [ ] Uses shared logger for all push-related events

**Verification:**

- [ ] `bun run typecheck` passes
- [ ] After login on mobile, push token appears in `push_tokens` table (check via Supabase Studio)
- [ ] No duplicate tokens for same user re-logging in
- [ ] App works normally if push permission is denied

**Dependencies:** Task 8 (mobile auth), Task 3 (database)

**Files created:**

- `apps/mobile/src/lib/push-notifications.ts`
- `supabase/migrations/00002_push_tokens.sql` (if not in initial migration)

**Estimated scope:** Small (2 files)

**Platform skills:** `/supabase`, `/react-native-perfection`

---

### Task 12: Cloudflare R2 bucket + presigned URL upload

**Description:** Set up the Cloudflare R2 bucket and create a Cloudflare Worker that generates presigned URLs for direct client-to-R2 uploads. Using a Worker (not Supabase Edge Function) because: (1) R2 binding is native in Workers — no external SDK needed, (2) presigned URL generation is faster and simpler with direct R2 access, (3) keeps all Cloudflare infra in one place. Create the shared upload utility with client-side image compression.

**Acceptance criteria:**

- [ ] R2 bucket created on Cloudflare
- [ ] Cloudflare Worker (`workers/upload-url/`) generates presigned PUT URLs for R2
- [ ] Worker validates: user is authenticated (verifies Supabase JWT), file type is allowed (image/video/document), file size within limits
- [ ] Worker uses R2 bucket binding (native, no AWS SDK needed)
- [ ] R2 CORS policy configured to allow PUT requests from mobile and admin web origins
- [ ] `packages/shared/lib/r2.ts` — upload utility: request presigned URL → compress if image → upload to R2 → return public URL
- [ ] `packages/shared/lib/image-compression.ts` — client-side image compression (max 1MB, max 1200px width)
- [ ] File size constants from shared tokens (maxImageBytes: 1MB, maxVideoBytes: 10MB)
- [ ] Upload utility works from both Expo and Next.js

**Verification:**

- [ ] Worker returns a valid presigned URL
- [ ] Client can upload a test image to R2 via presigned URL
- [ ] Image compression reduces a 4MB photo to under 1MB
- [ ] Upload fails gracefully for oversized files (returns error, doesn't crash)
- [ ] JWT validation rejects unauthenticated requests

**Dependencies:** Task 5 (Supabase client), Task 2 (constants/tokens)

**Files created:**

- `workers/upload-url/index.ts`
- `workers/upload-url/wrangler.toml`
- `packages/shared/lib/r2.ts`
- `packages/shared/lib/image-compression.ts`

**Estimated scope:** Medium (Worker + 2 shared utilities)

**Platform skills:** `/cloudflare`, `/wrangler`, `/workers-best-practices`

---

### Task 13: Developer menu scaffold (both apps)

**Description:** Create a dev-only menu accessible from settings in both apps. Shows environment info and basic controls. Only visible in development/staging builds.

**Acceptance criteria:**

- [ ] `packages/shared/components/dev-menu.tsx` — shared dev menu component (or platform-specific wrappers)
- [ ] Gated by `__DEV__` (mobile) and `process.env.NODE_ENV === 'development'` (admin)
- [ ] Shows: environment info (Supabase URL, R2 bucket, build version, current user ID/role)
- [ ] Controls: switch language (quick RTL test), clear cache (React Query + MMKV), force sign out
- [ ] Accessible from profile/settings screen in mobile app
- [ ] Accessible from settings page in admin app
- [ ] Tree-shaken from production builds (zero overhead)
- [ ] Log viewer: shows last N logger outputs with tag filtering

**Verification:**

- [ ] Dev menu appears in dev builds only
- [ ] Language switcher instantly toggles RTL/LTR
- [ ] Clear cache works without crashing
- [ ] Not visible in production build (`bunx expo export` / `bun run build:admin`)

**Dependencies:** Task 6 (mobile scaffold), Task 7 (admin scaffold), Task 2 (logger)

**Files created:**

- `packages/shared/components/dev-menu/` (component + subcomponents)
- Integration points in mobile profile screen and admin settings page

**Estimated scope:** Medium (shared component + integration in both apps)

---

### Task 14: Cloudflare deployment + E2E verification

**Description:** Deploy admin app to Cloudflare Workers (via OpenNext) and player web to Cloudflare Pages. Run full end-to-end verification of the entire Phase 1 infrastructure.

**Acceptance criteria:**

- [ ] Admin app deploys to Cloudflare Workers via OpenNext (`bunx @opennextjs/cloudflare build && bunx wrangler deploy`)
- [ ] Player web (Expo web export) deploys to Cloudflare Pages
- [ ] Both apps accessible via Cloudflare URLs
- [ ] Upload Worker (`workers/upload-url/`) deployed and accessible
- [ ] Environment variables configured on Cloudflare (Supabase URL, anon key)
- [ ] R2 bucket binding configured in Worker

**E2E Verification Checklist:**

- [ ] Mobile: app launches, shows login screen
- [ ] Mobile: magic link login works end-to-end
- [ ] Mobile: after login, tab navigation shows 5 tabs with icons + labels
- [ ] Mobile: switching to Arabic flips layout to RTL
- [ ] Mobile: push notification token registered in database
- [ ] Mobile: dev menu accessible from profile, shows env info
- [ ] Admin web: login page renders
- [ ] Admin web: magic link login works, redirects to admin dashboard
- [ ] Admin web: sidebar navigation visible with all menu items
- [ ] Admin web: can create a player account (fallback auth)
- [ ] Admin web: entity user sees entity portal layout (not admin)
- [ ] Admin web: RTL works for Arabic/Farsi
- [ ] Admin web: dev menu accessible from settings
- [ ] Player web: Expo web export loads, shows login
- [ ] R2: can upload a test image via presigned URL
- [ ] All translations: 5 languages have matching keys, no missing translations
- [ ] All builds pass: `bun run typecheck && bun run test && bun run build:admin`
- [ ] **ADR check:** Review all decisions made in Tasks 11-14. Write ADRs for any new architecture decisions. Update `docs/adr/README.md` index.

**Dependencies:** All previous tasks

**Estimated scope:** Medium (deployment config + verification)

**Platform skills:** `/cloudflare`, `/wrangler`

---

## Phases 2-9: High-Level Roadmap

Each phase will be planned in detail (like Phase 1 above) when we reach it. Below is the summary with key deliverables.

### Phase 2: Onboarding & Profiles (Sprint 1-2)

**Deliverables:** Multi-step onboarding wizard, player profile view/edit, admin participant table (shadcn data table + PostgreSQL full-text search), participant detail view, invite flow, deactivate/delete (RGPD), equipment tracking (delivery history per participant).
**Key risk:** Onboarding UX for low-literacy users. Need visual, step-by-step flow with progress indicator.

### Phase 3: CMS — Events, Announcements & Knowledge Base (Sprint 2)

**Deliverables:** Admin CRUD for announcements (with category: info/training/social/urgent)/events/knowledge base with multilingual editor + auto-translation worker (Cloudflare Worker). Scheduled publishing (`published_at`/`expires_at`) across all content types. Player home feed, calendar (grid + list), event signup, knowledge base browsing. Participant story submission flow (player submits → staff reviews/translates → publishes). Push notifications on new content.
**Key risk:** Auto-translation worker quality. Need review workflow so staff can correct translations before publishing.

### Phase 4: Attendance Tracking (Sprint 2-3)

**Deliverables:** Coach in-situ attendance screen (mobile, offline-tolerant), real-time sync via Supabase Realtime, attendance stats on dashboard, player attendance history.
**Key risk:** Offline-tolerant attendance. Must work at the football field with spotty connection.

### Phase 5a: Services Directory & Entity Portal (Sprint 3-4)

**Deliverables:** Service categories setup (8 default categories with metadata schemas). Hybrid schema services CRUD (shared columns + category-specific JSONB metadata). Service contacts table with smart reuse. Service images table (ordering + multilingual alt text for WCAG AA). Admin service management + category management. Admin entity submission review queue (approve/reject + comments with internal notes). Entity portal: full CRUD submission dashboard (submit, edit, delete, resubmit structured services). Entity smart contact autocomplete. Submission comments (entity ↔ staff + `is_internal` for staff-only notes). Player: category browsing with category-specific filters (GIN-indexed JSONB). Service detail screen. Mark interest.
**Key risk:** Largest phase by scope. Hybrid schema requires careful TypeScript typing of metadata per category. Entity submission → service approval flow has bidirectional FK that needs correct insert ordering. Category-specific filter UI must be tested across all 8 categories.

### Phase 5b: Messaging (Sprint 4)

**Deliverables:** Direct messaging with Supabase Realtime (players + entity users ↔ staff). Conversation management (admin: view all, assign to staff, filter unread). Unread message badge. Entity ↔ staff general messaging.
**Key risk:** Real-time messaging reliability. Need proper connection handling and message delivery confirmation.

### Phase 6: Community Forum & Media Sharing (Sprint 4-5)

**Deliverables:** Forum with categories, posts, replies, flagging system (auto-hide at 3 flags), moderation queue (admin), media gallery with privacy controls.
**Key risk:** Content moderation at small scale. Auto-hide threshold (3 flags) might be too aggressive or too lenient for 35-50 users.

### Phase 7: Entity Portal — Referrals & Tracking (Sprint 5)

**Deliverables:** Entity dashboard, referral submission, participant tracking, status updates, event viewing, impact stats. (Note: entity service submissions and messaging are already built in Phases 5a/5b.)
**Key risk:** Entity user adoption. Interface must be simple enough that social workers use it instead of calling/emailing.

### Phase 8: Mentoring, Feedback & Surveys (Sprint 5-6)

**Deliverables:** Mentoring request/scheduling, feedback drawer (replaces self-management groups, may evolve), notification templates, targeted push notifications, survey builder (with `published_at` scheduling) + responses + export.
**Key risk:** Survey builder complexity. Keep it simple: 4 question types max, no branching logic.

### Phase 9: Analytics, Reporting, Internal Tools & Polish (Sprint 6)

**Deliverables:** Impact dashboard, report generator, CSV/Excel export, audit log, org settings, internal documents, offline caching, accessibility audit, UI polish.
**Key risk:** Grant reporting requirements. Exports must match exactly what funders expect.

---

## Risks and Mitigations

| Risk                                 | Impact | Mitigation                                                                                                                                    |
| ------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Expo Web limitations for player web  | Medium | Player web screens are simple (feed, calendar, profile) — within Expo Web's strengths. Complex admin UI is on Next.js.                        |
| RTL bugs in NativeWind               | Medium | Test Arabic/Farsi early (Task 6). Use `start`/`end` exclusively. Run `/react-native-perfection` on every task.                                |
| Magic link deep linking on Android   | High   | Android deep links are finicky. Test on multiple Android devices in Task 8. Have password fallback ready (Task 10).                           |
| pgcrypto encryption performance      | Low    | Only 4 fields encrypted. At 50-200 users, zero performance concern.                                                                           |
| Monorepo dependency resolution       | Medium | bun workspaces are mature. Pin workspace protocol in `package.json`. Test cross-package imports early (Task 2).                               |
| Cloudflare R2 presigned URL CORS     | Medium | Configure R2 CORS policy in Task 12. Test uploads from both web origins.                                                                      |
| Client auth pending                  | Low    | Auth supports both magic link and password. When client confirms, we adjust the default — no architecture change needed.                      |
| Translation quality (auto-translate) | Medium | Staff always reviews translations before publishing. Start with Claude API, measure quality, swap to DeepL for supported languages if needed. |

## Open Questions

- [ ] **Client confirmation needed:** Do all players have email, or do some need admin-created accounts? (Architecture supports both — just need to know the default flow)
- [ ] **Self-management groups:** Client needs to clarify scope. Currently replaced by feedback drawer. May evolve in future phase.
- [ ] **Supabase Vault setup:** Encryption key for pgcrypto needs to be stored in Supabase Vault. Requires project setup — verify this works in EU region.
