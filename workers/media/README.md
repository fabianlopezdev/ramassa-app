# `@ramassa/media-worker`

The Cloudflare Worker that mints short-TTL presigned R2 upload URLs (ADR-002,
RAPP-14). It authenticates the caller, authorizes the target folder, validates
the declared file, and signs one upload. In production it never touches the file
bytes; the device uploads straight to R2.

## Routes

| Method | Path               | Purpose                                            |
| ------ | ------------------ | -------------------------------------------------- |
| POST   | `/uploads/url`     | Mint an upload URL for the signed-in caller        |
| PUT    | `/local-uploads/*` | Local dev only: the loopback upload sink (ADR-020) |
| GET    | `/health`          | Liveness for the deploy runbook                    |

`POST /uploads/url` takes `{ folder, contentType, contentLength }` (validated by
`uploadUrlRequestSchema` in `@ramassa/shared/schemas`) and a
`Authorization: Bearer <supabase access token>` header. It returns
`{ uploadUrl, objectKey, expiresAt, requiredHeaders }`. The client PUTs the bytes
to `uploadUrl` with exactly `requiredHeaders`. App code never calls this
directly: it uses `uploadFile` from `@ramassa/shared/upload-client`.

## How it enforces the rules

- **Auth**: Supabase ES256 token verified locally via JWKS; tenant + role read
  from the caller's RLS-protected `profiles` row (ADR-019).
- **Type + size**: an allowlist of MIME types, capped at the compressed-image /
  video ceilings (ADR-013). Both `content-type` and `content-length` are baked
  into the SigV4 signature, so R2 rejects a PUT that sends anything else. Not a
  mint-time promise: an enforced constraint.
- **Object key**: generated server-side as
  `<orgId>/<folder>/<uploaderId>/<year>/<month>/<random>.<ext>`. The client never
  chooses a path, so cross-tenant writes and traversal are impossible.
- **Rate limiting**: 20 mints / 60 s per user (Workers rate-limit binding).
- **Errors**: typed `UPLOAD/*` / `AUTH/*` codes; the body is `{ error: { code } }`
  and the apps translate it. No untranslated strings leave the Worker.

## Local development

Local mode needs no Cloudflare credentials (ADR-020).

```bash
cp workers/media/.dev.vars.example workers/media/.dev.vars   # then set LOCAL_UPLOAD_SIGNING_SECRET
bun run --cwd workers/media dev                              # or: bun run media:dev (repo root)
```

The Worker runs against local Supabase (`bunx supabase start`) with the RAPP-18
seeds. `UPLOAD_MODE` defaults to `local`, so minted URLs loop back to the Worker
and objects land in the local R2 simulation. A ready-made round-trip check lives
in the RAPP-14 record; the acceptance path is: mint → PUT → object in R2, plus
every denial path returning its typed code.

## Deploy runbook

Preconditions (one-time):

1. **R2 buckets** (EU jurisdiction, ADR-020):
   ```bash
   bunx wrangler r2 bucket create ramassa-media-dev --jurisdiction eu
   bunx wrangler r2 bucket create ramassa-media-production --jurisdiction eu
   ```
2. **CORS** (browser PUTs from the admin origin):
   ```bash
   bun run --cwd workers/media cors:dev         # applies r2-cors.dev.json
   bun run --cwd workers/media cors:production   # applies r2-cors.production.json
   ```
   Update the origins in `r2-cors.production.json` when the admin's real domain
   lands (RAPP-15).
3. **R2 S3 credentials** (production secret). Create an R2 API token (Object Read
   & Write) scoped to the `ramassa-media-*` buckets, then:
   ```bash
   bunx wrangler secret put R2_ACCESS_KEY_ID     --env production
   bunx wrangler secret put R2_SECRET_ACCESS_KEY --env production
   bunx wrangler secret put SENTRY_DSN           --env production   # optional
   ```
4. **Production vars**: set `R2_ACCOUNT_ID`, `SUPABASE_URL`,
   `SUPABASE_PUBLISHABLE_KEY`, and `ALLOWED_ORIGINS` for the `production` env in
   `wrangler.jsonc` once the Frankfurt project and admin origin exist.

> [!note] Production runs on the **client's** Cloudflare account, not the dev
> account (decided 2026-07-23; see the vault decision + migration issue). At
> migration, create the buckets on the client's account, set the production
> `R2_ACCOUNT_ID` to that account, and issue the R2 + deploy tokens there. The
> account id is the only account-identity value in the config: the S3 endpoint
> host is derived from it (`env.ts`), EU jurisdiction is fixed policy (ADR-011).

Deploy (release = commit SHA, matching mobile/admin):

```bash
bun run --cwd workers/media deploy:production
```

Rollback (Cloudflare keeps prior Worker versions):

```bash
bunx wrangler deployments list --env production
bunx wrangler rollback [<version-id>] --env production
```

## Configuration

Non-secret settings live in `wrangler.jsonc` (`vars`, bindings, rate limits) per
environment. Secrets are never in the repo: `.dev.vars` for local (gitignored),
`wrangler secret put` for deployed environments. Regenerate the binding types
after editing `wrangler.jsonc`:

```bash
bun run --cwd workers/media types   # writes worker-configuration.d.ts (never hand-edited)
```
