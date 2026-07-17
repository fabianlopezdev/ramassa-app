# 003. OpenNext for admin hosting on Cloudflare Workers

**Status:** Accepted
**Date:** 2026-04-09

## Context

The Next.js admin app needs to be hosted on Cloudflare to keep all infrastructure in one provider (Cloudflare + Supabase only). Cloudflare has two approaches for Next.js hosting.

## Decision

Use `@opennextjs/cloudflare` (OpenNext) to deploy the Next.js admin app to Cloudflare Workers with full Node.js runtime support.

## Alternatives Considered

- **`@cloudflare/next-on-pages`** — rejected. Deprecated by Cloudflare, known production issues, limited Node.js API support. Cloudflare's own documentation recommends OpenNext instead.
- **Vercel** — rejected. Hobby plan prohibits commercial use. Pro plan ($20/month) adds unnecessary cost. Adds a third provider to manage.

## Consequences

- Full Node.js runtime available (no edge runtime limitations)
- Requires `open-next.config.ts` and `wrangler.toml` in admin app
- Deploy via `bunx @opennextjs/cloudflare build && bunx wrangler deploy`
- Must validate OpenNext build during scaffold (Task 7)
