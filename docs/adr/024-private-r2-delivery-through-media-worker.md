# 024. Private R2 delivery through the media Worker

**Status:** Accepted
**Date:** 2026-08-05

## Context

The upload contract created in ADR-002 and ADR-020 stores an R2 object key in Postgres. An object key is not a browser-readable URL, and R2 buckets are private by default. Announcement and knowledge images therefore could be uploaded but not displayed by the player or admin apps.

Media belongs to one organization and can include participant information. Delivery must preserve the tenant boundary established by ADR-010 and must not expose the bucket publicly.

## Decision

The existing media Worker exposes `GET /objects/<object-key>`. It verifies the caller's Supabase access token and reads the caller's organization through the same JWKS and RLS-protected profile path selected in ADR-019. It only reads keys under that organization prefix.

The Worker streams `R2ObjectBody.body` directly to the client, applies the stored HTTP metadata, and returns the R2 ETag. Responses use `Cache-Control: private, max-age=3600` and `X-Content-Type-Options: nosniff`. Cross-organization keys, malformed keys, and absent objects all return the same empty 404 response.

Native and Expo web images send the access token in the Expo Image source headers and use the object key as a stable disk-cache key. Admin browser previews fetch the object with the same authorization header and render a temporary browser blob URL. Tokens never appear in media URLs or cache keys.

This follows the Cloudflare R2 Workers API for `get()`, streaming bodies, `writeHttpMetadata()`, and `httpEtag`: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/

It follows Cloudflare's guidance to stream large bodies and avoid buffering: https://developers.cloudflare.com/workers/best-practices/workers-best-practices/

It uses Expo Image's documented source headers and cache key support: https://docs.expo.dev/versions/latest/sdk/image/

## Alternatives Considered

### Public R2 bucket

Rejected. Cloudflare documents that public bucket access exposes object content directly. That route would bypass app authentication and organization isolation: https://developers.cloudflare.com/r2/buckets/public-buckets/

### Presigned GET URLs

Rejected. R2 supports temporary presigned GET URLs, but authorization would live in a URL that can reach logs and history. Expiry would also fight the app's offline image cache and require an additional mint request before every uncached image: https://developers.cloudflare.com/r2/api/s3/presigned-urls/

### Proxy through Supabase or the admin server

Rejected. The media Worker already owns the R2 binding and the verified identity boundary. A second proxy would duplicate authorization logic, secrets, and streaming behavior.

## Consequences

- The R2 bucket remains private.
- Local Worker storage and production R2 use the same authenticated read URL.
- Every uncached image read reaches the Worker for authentication.
- The access token remains in a request header and does not enter URLs or cache keys.
- Web deployments must allow the player and admin origins through Worker CORS.
