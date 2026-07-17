# CLAUDE.md — App Ramassa

## Project Overview

Mobile app (Expo/React Native) + web admin panel for AE Ramassa's inclusive women's football program. Connects refugee participants, staff, and social entities. Replaces WhatsApp coordination chaos. See `SPEC.md` for full specification.

## Commands

```
bun install                                    # Install dependencies
bunx expo start                                # Dev server
bunx eas build --platform android --profile preview  # Android build
bun test                                       # Run tests
bunx tsc --noEmit                              # Type check
bunx eslint . --fix                            # Lint
bunx prettier --write .                        # Format
bunx supabase db push                          # Apply DB migrations
bunx supabase studio                           # Local DB admin
```

## Tech Stack

- **Mobile**: Expo SDK 52+ / React Native / Expo Router
- **Backend**: Supabase (EU region Frankfurt) — PostgreSQL, Auth, Storage, Realtime, Edge Functions
- **Styling**: NativeWind (Tailwind CSS for React Native)
- **State**: TanStack React Query + MMKV
- **i18n**: react-i18next + expo-localization (CA, ES, EN — RTL-ready)
- **Package manager**: bun (never npm/npx)

## Code Conventions

- TypeScript strict mode everywhere
- Functional components with hooks
- `camelCase` for variables/functions, `PascalCase` for components, `snake_case` for DB columns
- `kebab-case.tsx` for component files, Expo Router conventions for route files
- RTL-ready: always `start`/`end`, never `left`/`right` in styles
- Never hardcode user-facing strings — always use i18n translation keys
- Apply RLS policies on every new database table
- Encrypt sensitive fields (document_number) via pgcrypto

## Boundaries

**Always:** translation keys for UI text, `start`/`end` styles, RLS on new tables, input validation on client + server, `bunx tsc --noEmit` before committing

**Ask first:** new dependencies, schema changes after initial migration, new user roles, external service integrations, auth flow changes

**Never:** secrets in client code, commit `.env`, public app store distribution, unencrypted document numbers, skip RGPD terms acceptance, hardcoded strings

---

## Workflow Contract (agreed 2026-07-16, supersedes conflicting rules below)

1. **The live plan is the vault, not tasks/plan.md.** Every unit of work is a vault issue (`second-brain/10-Projects/Ramassa-App/issues/`, RAPP-5..69). Work top of the dependency order; set `state:` as you go. `tasks/plan.md` is historical.
2. **Commits reference their issue.** Subject line format: `<type>(scope): <description> (RAPP-N)`. No commit without an issue ID.
3. **TDD.** Tests are written FIRST, per the issue's TDD plan. A failing test precedes the implementation.
4. **Gates before every commit**: prettier, eslint, tsc --noEmit, bun test. Enforced by lefthook + commitlint (NOT husky/lint-staged; see RAPP-5).
5. **`/react-native-perfection` runs at PHASE CLOSURE, not per task.** It is too slow per-commit. Each phase ends with a closure issue (RAPP-20, 28, 37, 40, 46, 49, 53, 56, 61, 69): full sweep -> closing commit -> cumulative Maestro QA (Android emulator primary + iOS) -> QA report on the closure issue. The per-task rule in "Development Workflow" below is superseded.
6. **Zod is the single validation source** (`packages/shared/schemas/`): forms validate for UX, server re-validates for security, external API responses are parsed, `process.env` is validated at boot.
7. **Errors are typed, never generic.** AppError taxonomy with stable codes (`AUTH/*`, `UPLOAD/*`...), `safeAsync` returning `Result<T, AppError>`, PII-redacting structured logger, Sentry on all three runtimes (mobile/admin/workers) with release = commit SHA. User-facing errors: translated + short code shown.
8. **Design tokens only** (`packages/shared/tokens/`): no magic numbers, no raw colors/radii/spacing in components. Self-descriptive long names over comments; comments only where names cannot carry the meaning.
9. **Dev DB is local Supabase (Docker)**, prod is Frankfurt. Never develop or run QA against prod. Every migration ships with RLS denial tests, seeds, factories, and RGPD-deletion coverage in the same issue.
10. **Docs at latest versions**: each issue pins versions pulled at authoring (2026-07-16); verify against current official docs at execution.
11. **Skills are preventive, not corrective (2026-07-16).** Every issue carries a "Skills to apply" section; consult those skills BEFORE writing the code they govern. Standing matrix: any mobile screen -> `/expo-router` + `/vercel-react-native-skills` + `/vercel-react-best-practices` (core React applies fully to RN, not only web) + `/vercel-composition-patterns` when designing reusable component APIs; any data fetching -> `/expo-data-fetching`; any DB work -> `/supabase-postgres-best-practices` (mandatory) + `/supabase`; any Worker -> `/wrangler` + `/workers-best-practices`; admin perf -> `/web-perf`; key player-facing flows and every phase closure -> `/critique` (UX evaluation against the low-literacy persona). RAPP-65 and the closure sweeps VERIFY; they are never the first application.
12. **Platform baseline: Expo SDK 57, React 19, React New Architecture (`newArchEnabled: true`). Never opt out.** Reanimated 4 requires it; check New-Architecture compatibility before adding any native library.
13. **Premium feel is a system (RAPP-70).** All microinteractions come from the shared primitives (PressableScale, FadeSlideIn, SuccessPop, ShakeOnError, SkeletonPulse) and the haptic vocabulary in `packages/shared`; motion timings only from motion tokens. Per-feature bar: press feedback on every touchable, entrance animation on content lists, success haptic + animation on completed primary actions, shake + warning haptic on validation errors, skeletons not spinners. Everything respects reduce-motion. No ad-hoc Animated/Reanimated code in feature screens.

## Development Workflow — Skill Lifecycle

This project follows a disciplined skill-based workflow. Every new feature, vertical slice, or significant change MUST follow this lifecycle. No shortcuts.

### For a NEW FEATURE or VERTICAL SLICE

Run these skills in order. Do not skip steps. Commit after each task within a slice (not at the end).

```
New feature arrives
    │
    ├─ 1. /agent-skills:spec-driven-development
    │     Write or update the spec. Define what we're building,
    │     acceptance criteria, and success conditions.
    │     Output: updated SPEC.md or feature spec document
    │
    ├─ 2. /agent-skills:planning-and-task-breakdown
    │     Break the spec into S/M sized tasks with:
    │     - Acceptance criteria per task
    │     - Verification steps per task
    │     - Dependency ordering
    │     - Checkpoints between phases
    │     Output: implementation plan with task list
    │
    │  ┌─────────────────────────────────────────────────┐
    │  │  FOR EACH TASK in the plan, repeat steps 3-8:   │
    │  └─────────────────────────────────────────────────┘
    │
    ├─ 3. /agent-skills:incremental-implementation
    │     Build one vertical slice at a time.
    │     Each slice = schema + API + UI, working end-to-end.
    │     Never build all DB, then all API, then all UI.
    │
    ├─ 4. /agent-skills:test-driven-development
    │     Write failing test → make it pass → refactor.
    │     Run alongside step 3, not after.
    │     Coverage target: 70% (business logic, not layout).
    │
    ├─ 5a. /react-native-perfection
    │      SUPERSEDED by Workflow Contract rule 5 (2026-07-16):
    │      runs as a FULL SWEEP at each phase-closure issue, not per task.
    │      9-step pipeline: structural → a11y/i18n → setup →
    │      data fetching → composition → RN perf → React perf →
    │      adversarial verification → report.
    │
    ├─ 5b. PLATFORM SKILLS (run whichever apply to the task):
    │      /supabase-postgres-best-practices
    │        → Run when: ANY database work (migrations, RLS policies, queries,
    │          indexes, functions). Ensures PostgreSQL best practices,
    │          proper indexing, RLS correctness, encryption implementation.
    │        → THIS IS MANDATORY for all DB work. No exceptions.
    │      /supabase
    │        → Run when: Supabase client code, auth flows, Edge Functions,
    │          Realtime subscriptions, storage operations.
    │      /cloudflare
    │        → Run when: R2 uploads, Pages deployment, Workers.
    │      /wrangler
    │        → Run when: Cloudflare Workers development (auto-translation worker,
    │          image compression worker).
    │      /workers-best-practices
    │        → Run when: Writing or modifying Cloudflare Workers code.
    │      /web-perf
    │        → Run when: Admin app (Next.js) performance work.
    │      Multiple skills can apply to one task. Run ALL that are relevant.
    │
    ├─ 6. /commit
    │     Pre-commit hooks run: prettier → eslint → tsc → tests.
    │     Atomic commit: one logical change per commit.
    │     Conventional message: type(scope): description (RAPP-N)
    │     COMMIT AFTER EVERY TASK. Do not batch multiple tasks.
    │
    │  └─────── (repeat steps 3-6 for each task) ──────┘
    │
    ├─ 7. /agent-skills:code-review-and-quality
    │     Five-axis review after the full feature is complete:
    │     correctness, readability, architecture, security, performance.
    │     Run BEFORE merging to main, not after.
    │
    ├─ 8. /agent-skills:security-and-hardening
    │     CRITICAL for this project (RGPD, refugee data).
    │     OWASP checks, input validation, RLS verification,
    │     encryption of sensitive fields, auth flow audit.
    │
    ├─ 9. /agent-skills:code-simplification
    │     Review for unnecessary complexity.
    │     Can this be done in fewer lines?
    │     Are abstractions earning their weight?
    │
    ├─ 10. /agent-skills:documentation-and-adrs
    │      Document architectural decisions (ADRs).
    │      Update SPEC.md if scope changed.
    │
    └─ 11. /agent-skills:shipping-and-launch
           Pre-launch checklist, monitoring, rollback plan.
           Only for production deployments.
```

**The inner loop is the key discipline:**

```
  Implement task → Write tests → Run platform skills → /commit
  Implement task → Write tests → Run platform skills → /commit
  Implement task → Write tests → Run platform skills → /commit
  ...
  Feature complete → Review → Security → Simplify → Merge

  "Run platform skills" means:
    Mobile code?  → /react-native-perfection
    DB work?      → /supabase-postgres-best-practices (ALWAYS)
    Supabase?     → /supabase
    Workers?      → /wrangler + /workers-best-practices
    Admin perf?   → /web-perf
    Multiple apply? → Run ALL of them.
```

Every commit is a safe rollback point. If something breaks, `git revert` the last commit — you lose at most one task's worth of work.

### For a BUG FIX

```
Bug reported
    │
    ├─ 1. /agent-skills:debugging-and-error-recovery
    │     Reproduce → localize → fix → guard
    │
    ├─ 2. /agent-skills:test-driven-development
    │     Write a test that reproduces the bug FIRST,
    │     then fix it, then verify the test passes.
    │
    ├─ 3. Run platform skills on all files touched by the fix:
    │     Mobile? → /react-native-perfection
    │     DB?     → /supabase-postgres-best-practices
    │     etc.    → Run ALL that apply
    │
    ├─ 4. /agent-skills:code-review-and-quality
    │     Review the fix before merging.
    │
    └─ 5. /commit
          fix: description of what was fixed
```

### For a REFACTOR or OPTIMIZATION

```
Refactor needed
    │
    ├─ 1. /agent-skills:performance-optimization (if perf)
    │     Measure first. Only optimize what matters.
    │     Never optimize without benchmarks.
    │
    ├─ 2. /agent-skills:planning-and-task-breakdown
    │     Even refactors need a plan. Define scope.
    │
    │  ┌── FOR EACH STEP in the refactor: ──┐
    │  │                                     │
    ├─ 3. /agent-skills:incremental-implementation
    │     Refactor in small, verifiable steps.
    │
    ├─ 4. /agent-skills:test-driven-development
    │     Existing tests must keep passing.
    │     Add tests for any uncovered paths found.
    │
    ├─ 5. Run platform skills on all files touched by this step.
    │     (same rules as inner loop: mobile → /react-native-perfection,
    │      DB → /supabase-postgres-best-practices, etc.)
    │
    ├─ 6. /commit
    │     Atomic commit for each refactor step.
    │  │                                     │
    │  └─────────────────────────────────────┘
    │
    ├─ 7. /agent-skills:code-review-and-quality
    │     Review before merging.
    │
    └─ 8. /agent-skills:code-simplification
          Final simplification pass.
```

### For UI WORK

```
UI feature
    │
    ├─ 1. /agent-skills:frontend-ui-engineering
    │     Production-quality UI with accessibility.
    │     Large tap targets, high contrast, screen reader labels.
    │     CRITICAL: users have low digital literacy.
    │
    ├─ 2. Platform skills:
    │     Mobile UI? → /react-native-perfection <all-ui-files>
    │       MANDATORY. 9-step pipeline: structural → a11y/i18n →
    │       setup → data fetching → composition → RN perf →
    │       React perf → adversarial verification → report.
    │     Admin UI (Next.js)? → /web-perf
    │       Performance and best practices for the web admin panel.
    │
    ├─ 3. /agent-skills:browser-testing-with-devtools
    │     Runtime verification with Chrome DevTools MCP.
    │     Visual regression, layout checks.
    │
    ├─ 4. /commit
    │     Commit each UI component/screen separately.
    │
    └─ (then follow review steps 7-11 from new feature flow)
```

### For API / DATABASE WORK

```
API or database change
    │
    ├─ 1. /agent-skills:api-and-interface-design
    │     Stable interfaces with clear contracts.
    │     Define the contract BEFORE implementation.
    │
    ├─ 2. /agent-skills:source-driven-development
    │     Verify against Supabase/Expo official docs.
    │     Don't rely on training data — check current docs.
    │
    ├─ 3. Platform skills (MANDATORY):
    │     /supabase-postgres-best-practices
    │       → ALWAYS run for any DB work. Indexes, RLS, queries,
    │         migrations, encryption. Non-negotiable.
    │     /supabase
    │       → Run for Supabase client code, auth, Edge Functions,
    │         Realtime, storage operations.
    │     /cloudflare + /wrangler + /workers-best-practices
    │       → Run when touching R2 uploads or Cloudflare Workers.
    │
    └─ (then follow steps 3-8 from new feature flow)
```

### Context Management

When starting any session or when context gets complex:

```
/agent-skills:context-engineering
```

Load the right context at the right time. Read SPEC.md, relevant source files, and the specific phase/task you're working on. Don't flood context with the entire codebase.

### ADR Enforcement

At every **checkpoint commit** (Checkpoints A, B, C, D, etc.), before proceeding to the next phase:

1. Review all decisions made since the last checkpoint
2. For any new architecture decision (technology choice, structural decision, deliberate rejection of a simpler approach), create an ADR in `docs/adr/`
3. Update `docs/adr/README.md` index table
4. Follow the template in `docs/adr/README.md`

ADRs are NOT for code conventions (those go in CLAUDE.md) or UX principles (those go in SPEC.md). They capture _why_ we chose approach A over approach B when the choice wasn't obvious.

---

## Platform Skills Reference

These skills are MANDATORY when touching their domain. Not optional. Not "nice to have." If a skill applies, it MUST be run before committing.

| Skill                               | Trigger                                                                     | What it does                                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `/react-native-perfection`          | Any `.tsx`/`.ts` in `apps/mobile/`                                          | 9-step RN pipeline: structure, a11y, i18n, perf, composition, adversarial check. Per contract rule 5: PHASE-CLOSURE sweep, not per task |
| `/expo-router`                      | Mobile navigation, routes, layouts, tabs, modals, headers                   | File-based routing, native Stack, NativeTabs, Link previews. (Replaces the retired `building-native-ui`)                                |
| `/expo-project-structure`           | Scaffolding the app (RAPP-7) only                                           | Folder layout for a NEW Expo app. Never use to restructure an existing app                                                              |
| `/expo-tailwind-setup`              | NativeWind/Tailwind setup + styling config                                  | Tailwind v4 + react-native-css + NativeWind v5. **See RAPP-7: prescribes preview/nightly deps — version decision required before use**  |
| `/expo-data-fetching`               | ANY network request, React Query, caching, offline                          | Fetch/RQ/SWR patterns, error handling, offline support, Router data loaders. (Replaces `native-data-fetching`)                          |
| `/expo-ui`, `/expo-native-ui`       | Native UI components (SwiftUI/Jetpack Compose bridges)                      | Consider for premium native feel; evaluate against RAPP-70 primitives                                                                   |
| `/eas-app-stores`                   | Release builds, submission, versioning (RAPP-68)                            | eas.json profiles, build/submit, TestFlight. (Replaces `expo-deployment`)                                                               |
| `/eas-workflows`                    | EAS CI/CD YAML, if used alongside GitHub Actions                            | `.eas/workflows/` pipelines                                                                                                             |
| `/expo-dev-client`                  | If a native module forces a dev client                                      | Build/distribute dev clients locally or via TestFlight                                                                                  |
| `/expo-upgrade`                     | Future SDK upgrades (post-launch)                                           | SDK upgrade paths, dependency fixes. (Replaces `upgrading-expo`)                                                                        |
| `/supabase-postgres-best-practices` | ANY database work: migrations, RLS, queries, indexes, functions, encryption | PostgreSQL best practices, indexing, RLS correctness, query optimization                                                                |
| `/supabase`                         | Supabase client code, auth flows, Edge Functions, Realtime, storage         | Supabase SDK best practices, auth patterns, real-time subscriptions                                                                     |
| `/cloudflare`                       | R2 uploads, Pages config, Workers, general CF infra                         | Cloudflare platform best practices                                                                                                      |
| `/wrangler`                         | Cloudflare Workers development (translation worker, image compression)      | Wrangler CLI and Workers development patterns                                                                                           |
| `/workers-best-practices`           | Writing or modifying Cloudflare Workers code                                | Workers runtime best practices, performance, error handling                                                                             |
| `/web-perf`                         | Admin app (Next.js) performance, bundle size, loading                       | Web performance optimization, Core Web Vitals                                                                                           |

**Rule: when in doubt, run the skill.** Running an unnecessary skill wastes 2 minutes. Missing a necessary one can introduce bugs that take hours to find.

**Multiple skills per task is normal.** A database migration + Edge Function + mobile UI update = `/supabase-postgres-best-practices` + `/supabase` + `/react-native-perfection`. Run all three.

---

## Git Workflow

### Branching Strategy: Trunk-Based Development

```
main ──●──●──●──●──●──●──  (always deployable)
        ╲      ╱  ╲    ╱
         ●──●─╱    ●──╱    ← short-lived feature branches (1-3 days max)
```

- Branch from `main`, merge back within 1-3 days
- Delete branches after merge
- Branch naming: `feature/task-creation`, `fix/duplicate-events`, `chore/update-deps`

### Commit Convention

```
<type>(<scope>): <short description> (RAPP-N)

<optional body explaining WHY, not what>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`. Scope required. The vault issue ID `(RAPP-N)` is REQUIRED in the subject (enforced by commitlint); after committing, append the SHA to the issue's `commits:` and update its `state:`.

### Atomic Commits

Each commit does ONE logical thing. Each successful increment gets its own commit.
Target ~100 lines per commit. Over ~300 lines → consider splitting.

```
Work pattern:
  Implement slice → Test → Verify → Commit → Next slice
```

### Pre-Commit Flow (Automated via lefthook + commitlint; per RAPP-5, supersedes the husky config below)

Every commit automatically runs these checks. If ANY step fails, the commit is blocked until all errors are resolved.

```
Developer runs /commit or git commit
    │
    ├─ 1. Prettier (format)
    │     bunx prettier --write --check staged files
    │     Auto-fixes formatting. Re-stages fixed files.
    │
    ├─ 2. ESLint (lint)
    │     bunx eslint --fix staged .ts/.tsx files
    │     Auto-fixes what it can. Fails on remaining errors.
    │
    ├─ 3. TypeScript (type check)
    │     bunx tsc --noEmit
    │     Zero type errors allowed. Fix before proceeding.
    │
    ├─ 4. Tests (affected)
    │     bun test --findRelatedTests staged files
    │     Only tests related to changed files. Must pass.
    │
    └─ 5. Commit
          Only after ALL checks pass.
          Conventional commit message: type: description
```

**Configuration (set up in RAPP-5):** `lefthook.yml` at repo root runs prettier check, eslint, `tsc --noEmit`, and `bun test` on staged workspaces as pre-commit; commitlint as commit-msg hook enforces conventional format + `(RAPP-N)`. See RAPP-5 in the vault for the acceptance tests (all four gate rejections verified).

### Change Summaries

After any modification, provide:

```
CHANGES MADE:
- src/routes/events.ts: Added validation to POST endpoint

THINGS I DIDN'T TOUCH (intentionally):
- src/routes/attendance.ts: Similar gap but out of scope

POTENTIAL CONCERNS:
- Added strict validation — rejects extra fields. Confirm desired.
```

---

## CI/CD Pipeline

### GitHub Actions — Runs on Every PR and Push to Main

```
Pull Request Opened / Push to main
    │
    ├─ 1. Lint          bunx eslint .
    ├─ 2. Format check  bunx prettier --check .
    ├─ 3. Type check    bunx tsc --noEmit
    ├─ 4. Unit tests    bun test --coverage
    ├─ 5. Build         bunx expo export --platform web
    ├─ 6. Security      bun audit (check for vulnerable deps)
    │
    All run in PARALLEL for speed.
    ALL must pass before merge is allowed.
```

**Pipeline file:** `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bunx eslint .
      - run: bunx prettier --check .

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bunx tsc --noEmit

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun test --coverage

  build:
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test]
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bunx expo export --platform web
```

### Branch Protection Rules (configure on GitHub)

- Require PR reviews: at least 1 approval before merge
- Require status checks: CI must pass before merge
- No force-pushes to main
- No direct pushes to main (all changes via PR)

### EAS Build Pipeline (for mobile releases)

```yaml
# .github/workflows/eas-build.yml
name: EAS Build

on:
  push:
    tags: ['v*'] # Triggered by version tags

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: bun install --frozen-lockfile
      - run: eas build --platform android --profile production --non-interactive
```

### Dependency Management

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
```

---

## Quality Gates

Before ANY merge or deployment:

1. `bunx eslint .` — zero lint errors
2. `bunx prettier --check .` — consistent formatting
3. `bunx tsc --noEmit` — zero type errors
4. `bun test` — all tests pass
5. CI pipeline green — all parallel jobs pass
6. Security review for any code touching user data, auth, or sensitive fields
7. i18n check: no hardcoded strings in components
8. RTL check: no `left`/`right` in styles (use `start`/`end`)
9. RLS check: every new table has row-level security policies
10. RGPD check: sensitive data encrypted, deletion flow works

---

## Project-Specific Reminders

- **Users have very low digital literacy** — every UI decision should favor simplicity and visual clarity
- **Most users are on Android** — test Android first, always
- **Catalan is mandatory** for the grant — never skip CA translations
- **Closed-access distribution** — app is NOT public on app stores. Invite-link based access.
- **White-label architecture** — every table has `org_id`. Every query filters by org. Every style uses theme variables.
- **RGPD with sensitive population** — refugee women's personal data. Treat security as non-negotiable.
