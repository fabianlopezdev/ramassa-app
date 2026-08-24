# 005. Email OTP auth + password fallback

**Status:** Accepted
**Date:** 2026-04-09

## Context

Players have varying digital literacy. Some may not have email addresses. The project owner explicitly wants zero messaging costs for auth.

## Decision

- **Primary:** Six-digit email OTP (Supabase Auth `signInWithOtp` followed by `verifyOtp`). Free, no SMS costs. The email address is repeated during verification so the code is bound to the intended account. Native and web clients use PKCE and never receive bearer sessions through a custom-scheme URL.
- **Fallback:** Admin-created accounts with an internal address (`firstname.<id>@ramassa.invalid`) + password. For players without personal email. Credentials shared in person by staff.

> **Amended 2026-08-01 (RAPP-25).** The address was originally specced as
> `@ramassa.app`. It is a LOGIN IDENTIFIER, never a mailbox: the woman it
> belongs to has no email, which is the whole reason the account exists. A real
> domain would mean any automatic mail Supabase sends (recovery, email change, a
> resend added in a later phase) could one day be delivered to whoever holds
> that mailbox. That could expose a participant's account to a stranger
> and could collide with a real address created on that domain later. `.invalid`
> is reserved by RFC 2606 so it can never resolve, anywhere, ever. The format is
> otherwise unchanged, and the address is GENERATED server-side, so staff never
> type a domain and cannot get it wrong.

> **Amended 2026-08-11 (RAPP-101).** Native mobile sessions are persisted in an
> encrypted MMKV instance named `ramassa.auth.v1`. A separate encrypted instance,
> `ramassa.private.v1`, holds onboarding drafts, offline messaging and attendance
> outboxes, and the user-scoped React Query cache. Keeping auth separate gives it
> an independent failure lifecycle: if its key is missing, malformed, or cannot
> decrypt the store sentinel, only the auth store is discarded and the user is
> signed out.
>
> Each instance has its own 24-byte cryptographically random key, base64 encoded
> to exactly 32 ASCII characters for MMKV AES-256. The keys are stored by Expo
> SecureStore with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, backed by iOS Keychain or
> Android Keystore. Language, haptics, device ID, and push bookkeeping remain in
> the default plaintext MMKV instance because they are low sensitivity.
>
> The first upgraded launch deliberately removes legacy Supabase session keys,
> onboarding drafts, outboxes, and query cache entries from the old default
> instance. This causes one planned sign-in reset. The legacy file is replaced
> so its removed records are not readable from the live app data directory, but
> this is not claimed as forensic erasure of previously allocated filesystem
> blocks. Android app backup is disabled and explicit
> Android 11 and Android 12 rules exclude app data from cloud backup and
> device-to-device transfer. Browser storage used by the Expo web build is not
> covered by this native device-storage decision.

## Alternatives Considered

- **Email magic links:** rejected after the security review. A native custom-scheme callback can expose a bearer session to another app that claims the scheme. Email OTP preserves passwordless access without putting a session in a callback URL.
- **SMS OTP:** rejected. $15-20/month for about 50 users. Ongoing cost with no benefit over email OTP.
- **WhatsApp auth:** rejected. API costs and dependency on the Meta platform.
- **Passkeys:** rejected. Too new and inconsistently supported on low-end Android devices.
- **PIN-based:** rejected. No standard Supabase implementation, so it requires a custom auth layer.
- **Password-only:** rejected. It requires every user to remember a password, which is poor UX for users with low digital literacy.

## Consequences

- Zero auth cost (Supabase email sending is included)
- Email OTP works across mobile and web without a deep link or auth callback route
- Fallback requires admin to create accounts manually and share credentials in person
- Admin needs a "create user" screen. **Superseded by ADR-022 (2026-08-01):** it
  runs as a SECURITY DEFINER Postgres function, not an Edge Function, so no
  service-role key exists in this system at all.
