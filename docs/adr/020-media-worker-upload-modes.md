# 020. Media Worker has two upload modes; buckets are EU-jurisdiction

**Status:** Accepted
**Date:** 2026-07-23

## Context

Presigned R2 URLs point at R2's S3 API endpoint. `wrangler dev` does not
emulate that endpoint: locally there is an R2 _binding_, not an S3 _host_. So a
URL that is presigned for real R2 cannot be uploaded to on a developer's
machine, and every later upload feature would need real Cloudflare R2
credentials on every machine just to run or QA it, and the local Maestro capture
flows (workflow contract rule 16) could not run at all.

Separately, the app serves refugee women's personal data and is bound to keep it
in the EU (ADR-011 put Supabase in Frankfurt). Media is personal data too.

## Decision

- The Worker has an `UPLOAD_MODE` per environment:
  - **`r2-presigned`** (production): mint a real SigV4 presigned PUT to R2's EU
    S3 endpoint, with `content-type` AND `content-length` signed (`allHeaders`)
    so R2 enforces the type and size, not just the Worker.
  - **`local`** (dev/preview): mint a loopback URL served by the Worker itself,
    HMAC-signed over the same fields (key, type, size, expiry) and enforced the
    same way, storing the bytes in the local R2 binding. The client code path is
    byte-for-byte identical in both modes.
- The `local` route only exists while `UPLOAD_MODE` is `local`; production is
  pinned to `r2-presigned` in `wrangler.jsonc`, so the loopback sink is
  unreachable there (asserted by test).
- Both R2 buckets (`ramassa-media-dev`, `ramassa-media-production`) are created
  with **EU jurisdiction**, so objects are stored only in the EU.

## Alternatives Considered

- **Real R2 credentials for local dev** — rejected. Puts a live secret on every
  machine and in CI, and bills/pollutes a shared bucket from local runs.
- **A separate mock server for local uploads** — rejected. A second process to
  run and keep in sync; folding it into the Worker keeps one code path and one
  thing to start.
- **Default-jurisdiction buckets** — rejected. Objects could be stored outside
  the EU, contradicting ADR-011 and the RGPD constraint.

## Consequences

- Upload features are fully developable and testable offline; local Maestro
  captures work against the local R2 simulation with RAPP-18 seeds.
- The presign endpoint is configuration (`R2_S3_ENDPOINT`), because the EU
  jurisdiction host is `https://<account>.eu.r2.cloudflarestorage.com`, not the
  default host.
- One HMAC signing secret exists in local/preview
  (`LOCAL_UPLOAD_SIGNING_SECRET`); it never leaves the dev environment and is
  meaningless in production, which uses the R2 keys instead.
- EU jurisdiction buckets cannot be moved to another jurisdiction later without
  recreating and migrating them.
