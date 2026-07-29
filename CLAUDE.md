# CLAUDE.md — App Ramassa

## Project Overview

Mobile app (Expo/React Native) + web admin panel for AE Ramassa's inclusive women's football program. Connects refugee participants, staff, and social entities. Replaces WhatsApp coordination chaos. See `SPEC.md` for full specification.

## Commands

```
bun install                                    # Install dependencies
bun run mobile:start                           # Expo dev server (runs in apps/mobile)
bun run mobile:ios                             # Build + launch the iOS dev build
bun run admin:dev                              # Admin dev server (localhost:3000)
bunx eas build --platform android --profile preview  # Android build
bun test                                       # Run tests
bunx tsc --noEmit                              # Type check
bunx eslint . --fix                            # Lint
bunx prettier --write .                        # Format
bunx supabase db push                          # Apply DB migrations
bunx supabase studio                           # Local DB admin
bun run capture:flow <slug>                    # Screenshot one flow into the vault canvas
bun run capture:phase <n>                      # Re-shoot every flow a phase owns (closure gate)
```

## Tech Stack

- **Mobile**: Expo SDK 57 / React Native / Expo Router
- **Admin web**: TanStack Start (Vite, TanStack Router file routes) + shadcn/ui, deployed natively to Cloudflare Workers via `@cloudflare/vite-plugin` (ADR-016; replaced Next.js + OpenNext on 2026-07-17)
- **Backend**: Supabase (EU region Frankfurt) — PostgreSQL, Auth, Storage, Realtime, Edge Functions
- **Styling**: NativeWind (Tailwind CSS for React Native)
- **State**: TanStack React Query + MMKV
- **i18n**: react-i18next + expo-localization, 5 languages (CA default, ES, EN, AR, FA) with full RTL (ADR-006, RAPP-11); shared factory in `packages/shared/i18n`
- **Package manager**: bun (never npm/npx)

> [!warning] NEVER run `expo` from the monorepo root.
> This is a bun-workspaces monorepo; the Expo app is `apps/mobile`. Running
> `bunx expo start|run:ios` from the repo root makes Expo treat the ROOT as the
> app: it writes a stray root `app.json`, prebuilds a duplicate ~1.2 GB
> `ios/ramassa.xcodeproj`, adds `expo`/`react-native` to the root
> `package.json`, and rewrites `bun.lock`. That duplicate project has none of
> the mobile app's autolinked native modules, so the app crashes at runtime with
> `Cannot find native module 'ExpoLinking'`, and without `expo-dev-client` it
> silently falls back to **Expo Go**, which cannot run this app (MMKV / Nitro
> native modules). Always use the root scripts above, or `cd apps/mobile` first.

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

## Workflow Contract (agreed 2026-07-16, updated 2026-07-17)

1. **The live plan is the vault, not tasks/plan.md.** Every unit of work is a vault issue (`second-brain/10-Projects/Ramassa-App/issues/`, RAPP-5..72). Work top of the dependency order; set `state:` as you go. `tasks/plan.md` is historical.
2. **Commits reference their issue.** Subject line format: `<type>(scope): <description> (RAPP-N)`. No commit without an issue ID.
3. **TDD.** Tests are written FIRST, per the issue's TDD plan. A failing test precedes the implementation.
4. **Gates before every commit**: prettier, eslint, tsc --noEmit, bun test. Enforced by lefthook + commitlint (NOT husky/lint-staged; see RAPP-5).
5. **`/react-native-perfection` runs at PHASE CLOSURE, not per task.** It is too slow per-commit. Each phase ends with a closure issue (RAPP-20, 28, 37, 40, 46, 49, 53, 56, 61, 69): full sweep -> closing commit -> cumulative Maestro QA (Android emulator primary + iOS) -> QA report on the closure issue.
6. **Zod is the single validation source** (`packages/shared/schemas/`): forms validate for UX, server re-validates for security, external API responses are parsed, `process.env` is validated at boot.
7. **Errors are typed, never generic.** AppError taxonomy with stable codes (`AUTH/*`, `UPLOAD/*`...), `safeAsync` returning `Result<T, AppError>`, PII-redacting structured logger, Sentry on all three runtimes (mobile/admin/workers) with release = commit SHA. User-facing errors: translated + short code shown.
8. **Design tokens only** (`packages/shared/tokens/`): no magic numbers, no raw colors/radii/spacing in components. Self-descriptive long names over comments; comments only where names cannot carry the meaning.
9. **Dev DB is local Supabase (Docker)**, prod is Frankfurt. Never develop or run QA against prod. Every migration ships with RLS denial tests, seeds, factories, and RGPD-deletion coverage in the same issue.
10. **Docs at latest versions**: each issue pins versions pulled at authoring; verify against current official docs at execution.
11. **Skills are preventive, not corrective (2026-07-16).** Every issue carries a "Skills to apply" section; consult those skills BEFORE writing the code they govern. The issue's list is authoritative; the Skills table below is the standing matrix behind those lists. RAPP-65 and the closure sweeps VERIFY; they are never the first application.
12. **Platform baseline: Expo SDK 57, React 19, React New Architecture (`newArchEnabled: true`). Never opt out.** Reanimated 4 requires it; check New-Architecture compatibility before adding any native library.
13. **Admin framework is TanStack Start (ADR-016, 2026-07-17) and its work is OFFICIAL-DOCS-FIRST (hard rule).** Any issue implementing TanStack Start or TanStack Router code MUST consult https://tanstack.com/start/latest and https://tanstack.com/router/latest (context7 or live fetch) at execution time, BEFORE writing the code, and verify every API against the installed version. The framework is young and moving; training-data knowledge is presumed stale. Where SPEC.md still says "Next.js" for the admin, read TanStack Start; OpenNext is deleted from the plan.
14. **Premium feel is a system (RAPP-70).** All microinteractions come from the shared primitives (PressableScale, FadeSlideIn, SuccessPop, ShakeOnError, SkeletonPulse) and the haptic vocabulary in `packages/shared`; motion timings only from motion tokens. Per-feature bar: press feedback on every touchable, entrance animation on content lists, success haptic + animation on completed primary actions, shake + warning haptic on validation errors, skeletons not spinners. Everything respects reduce-motion. No ad-hoc Animated/Reanimated code in feature screens.
15. **Only the skills below exist for this project (2026-07-17, RAPP-72).** This is the complete, issue-enforced set. Do not reach for other skills (lifecycle/process skills included) unless a vault issue adds them first.
16. **Every user-facing flow is screenshot-captured as it is built (2026-07-23, RAPP-77/78).** The as-built truth lives in one canvas, `second-brain/10-Projects/Ramassa-App/flows/Ramassa-Flows.html`; `assets/flows/` (Excalidraw) is design-time intent, and where they disagree the canvas is right. **44 flows across three surfaces**, each owned by exactly one issue: 18 player (`surface: mobile`, phone bezels, captured with Maestro), 23 staff admin and 3 entity portal (`surface: admin` / `entity`, desktop browser frames, captured with Playwright via `capture-web.mjs`). **The 18 player flows are dual-captured**: every one is shot on phone bezels (iOS/Android) AND in a desktop browser under the step's `web:` key, because the player app also ships as a responsive web export (ADR-008) whose desktop layout deliberately differs (RAPP-80), and side-by-side is how a control that is fine full-width on a phone but stretches on desktop gets caught. That is a form-factor axis on the `mobile` surface, not a fourth surface. Feature issues carry a `## Flow capture` section naming their slug, surface and graph; the 10 closure issues carry a `## Flow canvas refresh` gate. Two stages: Tier A flows (all mobile, all entity, the 7 admin flows with client or funder value) are captured at their feature issue and refreshed post-sweep at closure; Tier B admin CRUD is captured once, at closure. Browser captures run against **local seeded Supabase only** (rule 9) — the harness refuses a non-localhost origin.
17. **`/react-native-perfection`'s recommendations are APPLIED, including the ones NativeWind cannot express (decided 2026-07-26, RAPP-20).** The skill's own precedence rule says this CLAUDE.md wins on conflict; this rule spends that precedence in the skill's favour, so "our styling goes through classNames" is no longer a reason to skip a platform-polish property. `borderCurve: 'continuous'` is the worked example: NativeWind has no utility for it, so it arrives as a `style` prop.
    - The perf rule against inline style objects still holds. Such a value comes from a **hoisted shared constant**, never an object literal in JSX: `style={continuousCorners}` from `src/lib/continuous-corners.ts`, never `style={{ borderCurve: 'continuous' }}`.
    - A shared component that owns a rounded surface accepts a `style` prop and composes it, rather than each caller reaching around it.
    - Rule 8 is unchanged for everything it already covered: no raw hex, pixel value, radius or spacing outside the tokens. This exception is for platform properties that have no token and no class, not an opening for ad-hoc styling.
    - Player-facing components only. `components/dev/**` stays out, exactly as it is exempt from the i18n rule: no player ever sees it.
    - If a recommendation genuinely should not apply, that is a decision to record in the closing issue with the reason, not a judgement call to make silently.

## Skills — the enforced set (standing matrix)

The authoritative list per unit of work is the issue's "Skills to apply" section. This table is the matrix those lists are drawn from. Consult a skill BEFORE writing the code it governs.

| Skill                                 | Trigger                                                                     | Notes                                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Official TanStack docs (hard rule 13) | ANY TanStack Start / TanStack Router code                                   | https://tanstack.com/start/latest + https://tanstack.com/router/latest, at execution, before coding   |
| `/expo-router`                        | Mobile navigation, routes, layouts, tabs, modals, headers                   | File-based routing, native Stack, NativeTabs, Link previews                                           |
| `/vercel-react-native-skills`         | Any mobile screen: RN perf, lists, re-renders, animations, native APIs      | Runs with every mobile screen issue                                                                   |
| `/vercel-react-best-practices`        | Any React code (mobile AND admin)                                           | Core React practices; applies fully to RN; ignore Next.js-specific guidance (admin is TanStack Start) |
| `/vercel-composition-patterns`        | Designing any reusable component API (tables, forms, editors)               |                                                                                                       |
| `/expo-data-fetching`                 | ANY network request, React Query, caching, offline                          |                                                                                                       |
| `/supabase-postgres-best-practices`   | ANY database work: migrations, RLS, queries, indexes, functions, encryption | MANDATORY for all DB work, no exceptions                                                              |
| `/supabase`                           | Supabase client code, auth flows, Edge Functions, Realtime, storage         |                                                                                                       |
| `/cloudflare`                         | R2 uploads, Pages config, Workers, general CF infra                         |                                                                                                       |
| `/wrangler`                           | Cloudflare Workers development (translation worker, image compression)      |                                                                                                       |
| `/workers-best-practices`             | Writing or modifying Cloudflare Workers code                                |                                                                                                       |
| `/web-perf`                           | Admin app (TanStack Start) performance, bundle size, loading                |                                                                                                       |
| `/dataviz`                            | Any chart, graph, stat tile, or dashboard visualization in the admin        | Added 2026-07-17 (RAPP-72) for the dashboard-heavy admin screens (RAPP-39, RAPP-62)                   |
| `/critique`                           | Key player-facing flows and every phase closure                             | UX evaluation against the low-literacy persona                                                        |
| `/react-native-perfection`            | PHASE-CLOSURE sweeps only (contract rule 5)                                 | 9-step RN pipeline: structure, a11y, i18n, perf, composition, adversarial check                       |
| `/expo-project-structure`             | Scaffolding the mobile app (RAPP-7) only                                    | Never use to restructure an existing app                                                              |
| `/expo-tailwind-setup`                | NativeWind/Tailwind setup (RAPP-7) only                                     | See RAPP-7: prescribes preview/nightly deps — version decision required before use                    |
| `/deepsec-security-audit`             | Security audit (RAPP-67) only                                               |                                                                                                       |
| `/eas-app-stores`                     | Release builds, submission, versioning (RAPP-68) only                       |                                                                                                       |

**Rule: when in doubt, run the skill.** Running an unnecessary skill wastes 2 minutes. Missing a necessary one can introduce bugs that take hours to find.

**Multiple skills per task is normal.** A database migration + Edge Function + mobile UI update = `/supabase-postgres-best-practices` + `/supabase` + the mobile-screen set. Run all that apply.

## Flow capture — how the harness works, and what bit us

Contract rule 16 says every user-facing flow is screenshot-captured. `bun run capture:flow <slug>`
does the whole thing: boots the device, runs the flow, curates the shots into the vault, upserts the
canvas. `bun run capture:phase <n>` does that for every flow a phase owns, which is the closure gate.

**The moving parts**

| Path                             | What it is                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `flows/flows.json`               | Every flow in the product: slug, owning phase, surface, client-facing title. Also the device names, the app id and the ports. |
| `flows/<slug>.manifest.json`     | Authored once by the issue that builds the screens: the steps, the graph, the notes. The expensive part of a capture.         |
| `maestro/flows/<slug>.yaml`      | The phone flow. One file per flow, both languages.                                                                            |
| `maestro/web/<slug>.web.json`    | The browser flow, run through the flow-shots web harness.                                                                     |
| `scripts/capture-flow.ts`        | The harness. Pure decisions live in `scripts/flow-capture/`; `tests/flow-capture.test.ts` covers them.                        |
| `maestro/shots/`, `.flow-shots/` | Scratch. Gitignored — the curated copies live in the vault.                                                                   |

**A player flow means three passes.** A bare `capture:flow` on a `mobile` flow runs iOS, Android AND
the browser, because the player app also ships as a web export whose desktop layout differs
(rule 16). `--platform ios|android|both|web` narrows it. Admin and entity flows are browser-only.

**Never hardcode a screen name in a flow.** A flow declares the text it drives the UI by as
`{{namespace:key}}` in its own `env:` block (or in the browser spec), and the harness resolves it
against `packages/shared/i18n/locales/<locale>/`. That is what lets one flow file capture both the
Catalan pass and the Arabic RTL pass, and it means a renamed translation key breaks the capture
loudly instead of silently matching nothing.

**Gotchas that cost a cycle here (in addition to everything in `~/.claude/skills/flow-shots/MAESTRO.md`):**

1. **A development build does not start with `launchApp`.** It lands on the launcher's "searching
   for development servers" screen. Open it with
   `openLink: <scheme>://expo-development-client/?url=<percent-encoded metro url>`. With the URL
   passed explicitly, `clearState` is safe (it wipes the stored Metro URL, which no longer matters).
2. **The development client shows a one-time explainer sheet for its own menu** after a state clear,
   a second or two AFTER the app has rendered — so it lands on top of the first thing the flow tries
   to tap. Dismiss it with an optional `Continue` tap before interacting.
3. **The app follows the SIMULATOR's locale, not Catalan**, until a language is persisted. A capture
   that does not pin the language through the dev menu will happily produce an English "Catalan"
   pass on an English machine. Pin it, then relaunch: React Native applies a layout-direction flip
   on the next start only, so the RTL pass is only honest after a real restart.
4. **`expo export --platform web` must be run with `--clear`.** `EXPO_PUBLIC_*` values are inlined at
   transform time and Metro caches the transform by file content, not by env, so a warm cache
   happily bakes the backend URL a PREVIOUS export saw. It produced a bundle pointing at a
   placeholder host while `.env` said localhost, and the only symptom was a login failing as
   "wrong password".
5. **Browser captures need Playwright in this repo** (`bun add -d playwright`, `bunx playwright
install chromium`); the flow-shots skill deliberately does not ship browser binaries.
6. **A flow's own `env:` block WINS over `maestro -e`.** Passing overrides on the command line
   silently runs the file's defaults instead, and the failure reads as a selector that stopped
   matching rather than a variable that was ignored. The harness therefore rewrites that block and
   runs a resolved copy of the flow out of `.flow-shots/`.
7. **`scrollUntilVisible` is not usable on the Android emulator here.** It repeatedly reached the
   target row, left it plainly on screen, and still reported it as not found, with and without
   `visibilityPercentage` / `centerElement`. Use a bounded `repeat` + `notVisible` swipe loop, which
   re-checks with the same matcher the tap uses.
8. **A swipe loop stops the instant a sliver is on screen**, which parks the target 40px tall on the
   bottom edge under the navigation bar, where a tap does not reach it and the flow then waits out
   its timeout on an action that never happened. Follow the loop with one smaller settle swipe.
9. **Never let a swipe fling.** A `repeat while notVisible` exits on the FIRST sampled frame that
   matches, and during a fling that is a frame the scroll has already moved past: the loop "found"
   the target, the momentum carried the list to its bottom, and the very next command found
   nothing. The same drift makes a tap land on the wrong control, because Maestro resolves an
   element's bounds and dispatches the touch as two separate steps, and a wrapped button row moves
   a whole row between them. That is how a tap on `ca (ltr)` reported COMPLETED and selected `fa`,
   which looked exactly like an RTL bug and was not one. Swipe roughly a fifth of the screen with
   an explicit `duration: 900`, and settle with `waitForAnimationToEnd` before any tap or assert.
10. **Scrolling to something is one-way.** Reaching a row deep in a long list leaves the confirmation
    that lives in the section header far above the fold, and nothing scrolls back on its own once the
    swipes are drags. A flow that taps deep and then asserts near the top has to scroll back
    deliberately.
11. **Anything a flow needs to verify must be in the accessibility tree.** A selected state shown
    only as a background colour is invisible to Maestro and to a screen reader alike, so the suite
    could tap a language and had no way to check WHICH one it selected. `DevButton` carries
    `accessibilityState.selected` for exactly this.
12. **The dev menu opens at the top and is ten sections long.** Wait on the FIRST section
    (`Environment`) to know it opened; waiting on a lower one fails on a menu that opened perfectly.
13. **A dev client will happily run ANOTHER app's bundle.** It fetches JS from whatever server the
    deep link names, and this machine runs several Metros. The failure is a native assertion inside
    an unrelated library at `Running "main"` (here `jsi::Value::getString` in `libworklets`), never
    "wrong bundle". The harness now identifies Metro by the `scheme` in its Expo manifest and steps
    over servers that belong to other apps; if a dev build aborts on startup, check what is actually
    listening on the port before reading any app code.
14. **The status bar is frozen before every phone pass** (`simctl status_bar override` on iOS, system
    UI demo mode on Android) so a re-capture differs only where the app differs. Without it every shot
    carries a live clock and battery reading and no two runs are comparable.
15. **Selector shapes differ per platform.** iOS exposes a row's accessibility label; Android exposes
    the text nodes inside it. Match on the substring both carry (the email address, not
    "Sign in as <address>").

**Known gap:** on Android the development client draws a floating tools button over the app, so it
appears in the top corner of every Android frame. iOS is clean. Tracked as its own issue; do not put
an Android frame in front of the client until that is fixed.

**Client-safe by construction.** Manifest titles, descriptions, step labels, edge labels and notes
are read by the client and by funders: no issue IDs, no wikilinks, no vault paths. The harness
refuses to build a canvas from a manifest that leaks one, and `tests/flow-capture.test.ts` checks
every committed manifest. Captures also refuse to run against a non-private backend (rule 9).

## ADR Enforcement

At every phase closure (and any time a decision is made mid-phase):

1. Review all decisions made since the last closure
2. For any new architecture decision (technology choice, structural decision, deliberate rejection of a simpler approach), create an ADR in `docs/adr/`
3. Update `docs/adr/README.md` index table
4. Follow the template in `docs/adr/README.md`

ADRs are NOT for code conventions (those go in CLAUDE.md) or UX principles (those go in SPEC.md). They capture _why_ we chose approach A over approach B when the choice wasn't obvious.

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

### Pre-Commit Gates (lefthook + commitlint, set up in RAPP-5)

`lefthook.yml` at repo root runs prettier check, eslint, `tsc --noEmit`, and `bun test` on staged files as pre-commit; commitlint as commit-msg hook enforces conventional format + required scope + `(RAPP-N)` at the end of the subject. If ANY gate fails, the commit is blocked. See RAPP-5 in the vault for the acceptance tests (all four gate rejections verified).

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
