# Custom-scheme auth callback exposed bearer sessions

```yaml
severity: HIGH
vulnSlug: auth-bypass
title: Custom-scheme auth callback exposed bearer sessions
lineNumbers: [25, 29, 46, 47, 36]
confidence: high
triage:
  priority: P1
  exploitability: moderate
  impact: high
  reasoning: A competing app could claim the custom scheme and receive a bearer session, while an unsolicited callback could replace the local session.
revalidation:
  verdict: true-positive
  reasoning: The callback accepted bearer tokens from a custom-scheme URL and passed them to Supabase session creation without a request-bound verifier.
```

## Description

The former mobile flow requested an implicit magic link, placed access and refresh tokens in `ramassa://auth/callback`, parsed those values, and created a session. Custom schemes are not exclusive on mobile platforms, so another installed app could register the same scheme. The callback was also not bound to the browser or app instance that initiated the request.

## Recommendation

Use a request-bound flow that never transports bearer tokens through a custom scheme.

## Resolution

The app now requests a six-digit email OTP without a redirect URL and verifies it against the normalized email in `packages/shared/auth/auth-actions.ts`. The Supabase client uses PKCE in `packages/shared/lib/supabase.ts`. Mobile and admin callback handlers and routes were deleted, and Supabase no longer allow-lists the custom auth scheme. The email template presents `{{ .Token }}` rather than `{{ .ConfirmationURL }}`.

Regression coverage: `tests/auth-otp-security-contract.test.ts`, `packages/shared/auth/auth-actions.test.ts`, and `packages/shared/schemas/auth.test.ts`.
