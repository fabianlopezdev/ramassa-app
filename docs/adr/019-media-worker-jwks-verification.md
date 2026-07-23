# 019. Media Worker verifies Supabase JWTs via JWKS, reads role from the profile

**Status:** Accepted
**Date:** 2026-07-23

## Context

The presigned-upload Worker (ADR-002, RAPP-14) must answer two questions before
it signs anything: who is this caller, and are they allowed to write here. The
Worker runs outside Supabase, so it cannot use `auth.uid()` or RLS directly; it
has to establish the identity itself from the bearer token the client sends.

Supabase offers three ways to verify a token from an external server: verify
the signature locally against the project's JWKS (asymmetric ES256 keys), verify
against a shared HS256 secret, or call `GET /auth/v1/user` per request.

## Decision

- **Identity**: verify the access token locally with `jose`
  (`createRemoteJWKSet` + `jwtVerify`) against
  `<supabase>/auth/v1/.well-known/jwks.json`, checking issuer and the
  `authenticated` audience. The JWK set is cached in isolate module scope.
- **Tenant and role**: NOT taken from the token. The Worker reads the caller's
  own `profiles` row through PostgREST, forwarding the caller's token so RLS
  (ADR-009) decides whether the row is visible. `org_id` and `role` come from
  that row.
- Every identity failure (bad signature, expired, deleted profile) returns the
  same `AUTH-2`; a folder the role may not write returns `AUTH-3`.

## Alternatives Considered

- **HS256 shared secret** — rejected. Supabase advises against it: the secret
  would let the Worker mint tokens, and a leak is hard to detect. Asymmetric
  keys give the Worker verify-only power and no round trip.
- **`GET /auth/v1/user` per request** — rejected. Adds a network hop to the auth
  server on every mint, the latency the edge is meant to avoid.
- **Trusting `org_id`/`role` from a custom JWT claim** — rejected for now.
  Those claims are not in the token today, and a custom-access-token hook is not
  yet set up. Reading the RLS-protected profile is the source of truth and stays
  correct the instant a participant is deactivated, without waiting for a token
  to expire. If mint latency ever matters, promoting these to verified claims is
  a future optimization, not a correctness fix.

## Consequences

- One extra PostgREST read per mint (tenant/role). Acceptable: minting is rare
  relative to viewing, and the read is a single indexed row.
- Rotating the Supabase signing keys is safe: `jose` refetches the JWKS; per
  Supabase guidance, keep the old key valid ~20 minutes during rotation.
- The Worker needs the project's URL and publishable key (both public) and no
  Supabase secret. Only the R2 S3 credentials are secrets.
- Deactivation and deletion are honoured immediately through RLS, not on token
  expiry.
