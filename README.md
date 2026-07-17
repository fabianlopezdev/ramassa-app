# App Ramassa

Mobile app + web admin panel for AE Ramassa's inclusive women's football program. Connects refugee participants, staff, and collaborating social entities. Replaces WhatsApp coordination.

## Quick Start

```bash
bun install                    # Install all workspace dependencies
bunx expo start                # Mobile dev server
bun run dev:admin              # Admin web dev server
```

## Project Structure

```
apps/
  mobile/          Expo SDK 55+ — player mobile app + web export
  admin/           Next.js (App Router) — staff admin + entity portal
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
bunx supabase db push                                # Apply DB migrations
bunx supabase gen types typescript                   # Regenerate DB types
bunx eas build --platform android --profile preview  # Android build
```

## Tech Stack

- **Mobile:** Expo / React Native / NativeWind / Expo Router
- **Admin:** Next.js / Tailwind CSS / shadcn/ui
- **Backend:** Supabase (EU Frankfurt) — PostgreSQL, Auth, Realtime, Edge Functions
- **Media:** Cloudflare R2
- **Hosting:** Cloudflare Workers (admin via OpenNext) + Pages (player web)
- **Languages:** CA, ES, EN, AR, FA — full RTL support
