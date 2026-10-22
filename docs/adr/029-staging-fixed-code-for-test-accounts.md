# 029. A staging-only fixed sign-in code for test accounts

**Status:** Accepted
**Date:** 2026-10-21 (design decided in the RAPP-615 to RAPP-617 brief)

> Amends [ADR-022](022-account-creation-without-service-role-key.md) for one staging-only function,
> and builds on [ADR-005](005-magic-link-auth.md) (email code sign-in).

## Context

Ramassà designs its onboarding on staging before launch (RAPP-615). The person who does it signs in
as a made-up test player on a phone, goes through the onboarding, deletes her (RAPP-617) and starts
again, many times a day. The emailed six-digit code goes to an address nobody reads, and the email
rate limit would stop the work after a few rounds.

Supabase has fixed test codes for phone sign-in only. Email has no equivalent, so it has to be built
(RAPP-616). A one-time sign-in token for an existing user comes only from the Auth admin API
(`generateLink`), which needs the project's secret key. ADR-022 decided that no code path holds that
key.

## Decision

1. A Supabase Edge Function, `test-sign-in`, returns a hashed sign-in token for an active **test
   account** (`profiles.is_test_account`) when it receives the fixed code. The app trades the hash for
   a session with `verifyOtp({ token_hash, type: 'email' })`, so the second factor and the onboarding
   gate stay as they are.
2. The function answers 404 to every request unless both secrets `TEST_SIGN_IN_ENABLED=true` and
   `TEST_SIGN_IN_CODE=<six digits>` are set. Only staging sets them.
3. The app asks the function only in a build with `EXPO_PUBLIC_TEST_SIGN_IN=true`, and only after the
   normal code is refused. The deployment check refuses that flag for production.
4. Attempts are rate limited in Postgres (hashed, kept one day): per address, per network address as
   the platform saw it (`cf-connecting-ip`, else the rightmost `X-Forwarded-For` entry), and thirty in
   all per fifteen minutes, so a shared code cannot be brute-forced across addresses. The code is
   compared in constant time, the address is always looked up, a wrong code and a real account get
   the same answer, and every success is audited.
5. The function uses the secret key that the platform gives every Edge Function. No new secret is
   stored anywhere, and the key is used only behind the two staging secrets.

## Alternatives considered

- **Write the token into `auth.users` from Postgres**, as ADR-022 does for accounts. No key at all,
  but it couples to GoTrue's token hashing and expiry internals, which change between releases and are
  not a documented surface. A silent break would lock the designer out with no error to read.
- **Passwords for test accounts.** The player app has no password sign-in for players (ADR-005), and
  adding one only for staging means a second sign-in screen to maintain.
- **A separate mail catcher on staging.** Still one email per sign-in and the hosted rate limit.

## Consequences

- One function holds the secret key behind a staging switch. Production never sets the switch, and
  without it the function is inert, which `handler.test.ts` proves.
- Test accounts exist only on staging, so a production project has nobody this path could sign in.
- ADR-022's rule stands for every other path: no other function or client reads the secret key.
