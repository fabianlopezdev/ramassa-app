# App Ramassa

Mobile app + web admin panel for AE Ramassa's inclusive women's football program. Connects refugee participants, staff, and collaborating social entities. Replaces WhatsApp coordination.

## Quick Start

```bash
bun install                    # Install all workspace dependencies
bunx expo start                # Mobile dev server
bun run dev:admin              # Admin web dev server
```

## Local Development (Supabase)

All database work runs against a **local Supabase stack** (Docker), never against
production (ADR-011: no free-tier pausing, no testing on prod). Requires Docker.

```bash
bunx supabase start            # Boot the local stack (Postgres, Auth, Studio, …)
bun run db:reset               # Apply all migrations + seed.sql on a clean DB
bun run db:test                # Run the pgTAP RLS + encryption suite
bun run db:types               # Regenerate packages/shared/types/database.ts
```

Copy `.env.example` to `.env` and fill it with the values `bunx supabase start`
prints (`API URL`, publishable key as the anon key, secret key as the service role
key). `.env` is gitignored.

**Field encryption (ADR-004).** Sensitive PII columns (`address`, `postal_code`,
`phone`, `document_number`) are stored as encrypted `bytea` via `pgp_sym_encrypt`.
The symmetric key lives in **Supabase Vault** (secret name `app_encryption_key`),
never in code or this repo. Read/write only through `public.encrypt_field()` /
`public.decrypt_field()`. Locally the key is seeded by `supabase/seed.sql` with a
throwaway dev value; in production it is created once in the prod project's Vault,
out of band.

**Standing rules:** every schema change is a migration file (never a Studio /
dashboard edit), and `bun run db:types` is re-run after every migration and the
result committed.

### Production project (manual, one-time)

The production Supabase project is **EU Frankfurt** (`eu-central-1`) on the Pro
plan for RGPD data residency (ADR-011); its monthly cost is Ramassà-side per the
sponsorship framing. Provision it in the Supabase dashboard, then `supabase link`
it, create the `app_encryption_key` Vault secret, and `supabase db push` the
migrations. (Not automated: it needs the account owner's login and billing.)

## Project Structure

```
apps/
  mobile/          Expo SDK 55+ — player mobile app + web export
  admin/           TanStack Start (Vite, file routes) — staff admin + entity portal
packages/
  shared/          Types, hooks, i18n, Supabase client, design tokens
supabase/
  migrations/      SQL migration files
  functions/       Supabase Edge Functions
workers/
  media/           Presigned R2 upload Worker (RAPP-14) — see workers/media/README.md
tasks/             Implementation plans and task lists
docs/adr/          Architecture Decision Records
```

## Documentation

| Document                       | Purpose                                                  |
| ------------------------------ | -------------------------------------------------------- |
| [SPEC.md](SPEC.md)             | Product requirements, schema, UX, tech stack             |
| [CLAUDE.md](CLAUDE.md)         | Development workflow, conventions, skill enforcement     |
| [tasks/plan.md](tasks/plan.md) | Current phase implementation plan (detailed)             |
| [tasks/todo.md](tasks/todo.md) | Current phase task checklist with dependencies           |
| [docs/adr/](docs/adr/)         | Architecture Decision Records — why we built it this way |

## Key Commands

```bash
bun install                                          # Install dependencies
bunx expo start                                      # Mobile dev server
bun run dev:admin                                    # Admin dev server
bun test                                             # Run tests
bunx tsc --noEmit                                    # Type check
bunx eslint . --fix                                  # Lint
bunx prettier --write .                              # Format
bun run db:reset                                     # Local: apply migrations + seed
bun run db:test                                      # Local: pgTAP RLS + crypto tests
bun run db:types                                     # Regenerate DB types (after every migration)
bunx supabase db push                                # Prod: apply migrations to the linked project
bunx eas build --platform android --profile preview  # Android build
```

## Tech Stack

- **Mobile:** Expo / React Native / NativeWind / Expo Router
- **Admin:** TanStack Start / TanStack Router / Tailwind CSS / shadcn/ui (ADR-016)
- **Backend:** Supabase (EU Frankfurt) — PostgreSQL, Auth, Realtime, Edge Functions
- **Media:** Cloudflare R2
- **Hosting:** Cloudflare Workers (admin, native via `@cloudflare/vite-plugin`) + Pages (player web)
- **Languages:** CA, ES, EN, AR, FA — full RTL support

## Deployment (RAPP-15)

Two front-end surfaces deploy to Cloudflare, native (no adapter): the **admin**
(TanStack Start) to **Workers** via `@cloudflare/vite-plugin` (ADR-016), and the
**player web** (Expo Web SPA, ADR-008) to **Pages**. The media Worker
(`workers/media`) has its own runbook in `workers/media/README.md`.

Two environments (RAPP-10): **preview** deploys automatically once CI is green on
`main`; **production** is a manual promote. Default `workers.dev` / `pages.dev`
URLs for now; a real domain is a later decision with Marc.

Live URLs (preview):

- Admin: `https://ramassa-admin-preview.<subdomain>.workers.dev`
- Player web: `https://ramassa-player-web.pages.dev`

### Build-time env (important)

Both web builds read Supabase config through `import.meta.env.EXPO_PUBLIC_*`,
which Vite/Expo **bake in at build time** (RAPP-9 / RAPP-13). So the values must
be present when you run the build, not as runtime Worker vars. Only the **public**
anon/publishable key is ever embedded; the service role key is server-only and
never enters a web build. Until the production Supabase project exists (RAPP-11),
pass placeholder values, the apps boot with no live backend.

### Manual deploy

```bash
# Admin → Workers
CLOUDFLARE_ENV=preview \
  EXPO_PUBLIC_SUPABASE_URL=<url> EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon> \
  bun run --cwd apps/admin deploy:preview        # or deploy:production

# Player web → Pages
EXPO_PUBLIC_SUPABASE_URL=<url> EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon> \
  bun run --cwd apps/mobile web:export
bunx wrangler pages deploy dist --project-name ramassa-player-web \
  --branch preview --commit-dirty=true          # --branch main for production
# (run the pages deploy from apps/mobile)
```

### Rollback

```bash
# Admin (Workers) — build the target env once so wrangler has the resolved config
cd apps/admin && CLOUDFLARE_ENV=preview bunx vite build
bunx wrangler versions list -c dist/server/wrangler.json
bunx wrangler rollback <version-id> -c dist/server/wrangler.json

# Player web (Pages) — promote a previous deployment from the dashboard, or
bunx wrangler pages deployment list --project-name ramassa-player-web
```

### CI (`.github/workflows/deploy.yml`)

On a green CI run on `main`, the preview environment deploys automatically;
production is `workflow_dispatch` (Actions → Deploy → Run workflow → production).
It needs these **repository secrets** (Settings → Secrets and variables → Actions):

| Secret                          | Purpose                                                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`          | Account-scoped: Workers Scripts:Edit, Cloudflare Pages:Edit, Account Settings:Read (CI deploys admin + player web only, so no R2 permission needed) |
| `CLOUDFLARE_ACCOUNT_ID`         | `c636c0649634aedd544d6a827b862d5a`                                                                                                                  |
| `EXPO_PUBLIC_SUPABASE_URL`      | baked into both builds (placeholder until RAPP-11 prod)                                                                                             |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | public anon/publishable key                                                                                                                         |
| `SENTRY_AUTH_TOKEN`             | optional; enables admin source-map upload                                                                                                           |

Create the API token in the Cloudflare dashboard (Manage Account → API Tokens);
Claude cannot create tokens or set repository secrets, so this step is manual.

## Push notifications (RAPP-17)

Registration plumbing only: the app obtains an Expo push token after login and
stores it in `push_tokens`, keyed to the profile and the device. **Sending**
(targeting, templates, auto-translation) is Phase 3/8 and is not built yet.

How it behaves:

- On entering the signed-in area the app shows a **translated rationale first**,
  then the OS prompt only if she accepts (SPEC UX rule: never a bare system
  dialog). Declining is a real choice: the OS is never asked, so iOS's single
  allotted prompt stays unspent, and the app is fully usable without push.
- The token is re-checked on every app start and re-written only when it rotated.
- One row per user per device (`unique (user_id, device_id)`), so a rotated token
  updates in place instead of leaving an undeliverable duplicate.
- Sign-out deletes this device's row _before_ ending the session (the delete is
  RLS-scoped to `auth.uid()`), so the next person to sign in on the same device
  does not inherit the previous user's notifications.

### Blocked: link the project to EAS (manual, one-time)

`getExpoPushTokenAsync` **requires an EAS projectId** (SDK 49+), and this project
is not linked yet: there is no `extra.eas.projectId` and no `eas.json`. Until
someone runs `eas init` under the Fabulous Apps Expo account, the app degrades
gracefully (`skip: missing-project-id`) and simply never registers a token.
Claude cannot create the EAS project, so this step is manual.

```bash
# from apps/mobile, signed in to the right Expo account
bunx eas init
```

### Manual end-to-end proof (needs a physical device)

Push **cannot** be received on the iOS Simulator (Apple does not support it); an
Android emulator can, with FCM credentials. So this check needs real hardware and
must be done by hand after the EAS link exists:

1. Run a dev build on a physical device and sign in.
2. Accept the rationale, then the OS prompt.
3. Confirm the row landed: `select user_id, platform, device_id, updated_at from push_tokens;`
4. Copy the token and send a test push from the Expo tool: https://expo.dev/notifications
5. Verify it arrives with the app **foregrounded** and again **backgrounded**.
6. Sign out, and confirm the row is gone.
