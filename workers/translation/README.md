# `@ramassa/translation-worker`

This Cloudflare Worker turns staff-authored content into machine translation
drafts. It never publishes content. Every suggestion starts in `draft`, keeps
the original machine text for comparison, and must be reviewed and approved by
staff before a later content workflow can publish it.

## Route

| Method | Path            | Purpose                                      |
| ------ | --------------- | -------------------------------------------- |
| POST   | `/translations` | Generate review drafts for requested locales |
| GET    | `/health`       | Liveness check                               |

The request body is `{ text, from, to }`, using the five supported language
codes: `ca`, `es`, `en`, `ar`, and `fa`. Text is limited to 10,000 characters,
targets must be unique, and the source cannot also be a target.

The caller sends a Supabase access token. The Worker verifies the JWT against
the project JWKS, loads the caller profile through RLS, allows only `staff` and
`admin`, then applies a Cloudflare rate limit keyed by organization and user.

## Providers

`TRANSLATION_PROVIDER` selects the adapter without changing app code:

- `mock`: deterministic and credential-free for local development and tests
- `deepl`: production default for all supported languages
- `claude`: Claude Haiku for all requested languages
- `hybrid`: DeepL by default, with explicitly configured fallback languages sent to Claude

DeepL now supports Catalan, Arabic, and Persian directly. The default therefore
uses one provider for all four Catalan targets. The hybrid adapter remains
available for quality experiments or future provider regressions.

Provider responses are validated before any draft is returned. Logs contain
the provider name, input and output units, target count, opaque actor IDs, and
estimated USD cost. Source text and translated text are never logged.

## Local development

Local configuration uses the deterministic mock and the dedicated port `8792`:

```bash
bun run translation:dev
```

This does not launch a mobile emulator, simulator, browser, or Supabase process.
Start local Supabase separately only when exercising real JWT authentication.

## Production setup

Set non-secret production values in `wrangler.jsonc`, then store secrets through
Wrangler:

```bash
bunx wrangler secret put DEEPL_API_KEY --env production --config workers/translation/wrangler.jsonc
bunx wrangler secret put SENTRY_DSN --env production --config workers/translation/wrangler.jsonc
```

For `claude` or `hybrid`, also set:

```bash
bunx wrangler secret put ANTHROPIC_API_KEY --env production --config workers/translation/wrangler.jsonc
```

Deploy with the commit SHA as the Sentry release:

```bash
bun run --cwd workers/translation deploy:production
```

After changing Worker bindings, regenerate the runtime declarations:

```bash
bun run --cwd workers/translation types
```

Provider references:

- [DeepL supported languages](https://developers.deepl.com/docs/getting-started/supported-languages)
- [DeepL translate API](https://developers.deepl.com/api-reference/translate/request-translation)
- [Anthropic Messages API](https://platform.claude.com/docs/en/api/messages/create)
- [Cloudflare rate limit bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
