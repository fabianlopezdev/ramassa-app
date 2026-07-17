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
workers/           Cloudflare Workers (R2 uploads, auto-translation)
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
