# test-sign-in (staging only)

The fixed sign-in code for test accounts (RAPP-616).

The person who designs the onboarding (the "Onboarding design" role, RAPP-615) signs in as a test
player on a phone, goes through the onboarding, deletes her (RAPP-617) and starts again, many times a
day. The emailed six-digit code would go to a made-up address. So on staging, a **test account**
signs in with one fixed code instead.

A test account is a profile with `is_test_account = true`:

- a **test player**, created with the "Test player" option of the invitation form;
- a **team account** that an admin marked as a test account in Settings, Team ("Test account" box).

Real accounts never use this path. They sign in with the emailed code, on staging too.

## How it works

1. The app tries the normal `supabase.auth.verifyOtp({ email, token, type: 'email' })` first.
2. Only when that is refused, and only in a build with `EXPO_PUBLIC_TEST_SIGN_IN=true`, the app calls
   this function with the address and the code.
3. The function rate-limits the attempt: five per address, twenty per network address, and thirty in
   all, in fifteen minutes. The network address is the one the platform saw: `cf-connecting-ip` (set
   by Cloudflare in front of hosted Supabase), else the rightmost `X-Forwarded-For` entry, never the
   leftmost one, which the caller writes. It then compares the code in constant time and always looks
   the address up, so a wrong code, a real account and an unknown address do the same work and get
   the same answer.
4. It asks the Auth admin API for a sign-in link (`generateLink`, type `magiclink`) and returns only
   its hashed token: `{ "token_hash": "..." }`. The successful sign-in is written to the audit log.
5. The app trades the hash for a session with `supabase.auth.verifyOtp({ token_hash, type: 'email' })`.

Everything after sign-in is unchanged: a team account still verifies its authenticator (second
factor), and a player still meets the onboarding gate.

Sources: <https://supabase.com/docs/reference/javascript/auth-admin-generatelink>,
<https://supabase.com/docs/reference/javascript/auth-verifyotp> (`token_hash`, type `email`; the
`magiclink` type is deprecated), <https://supabase.com/docs/guides/functions/secrets>.

## Switching it on (staging only)

The function answers **404 to every request** unless both secrets exist:

| Secret                 | Value                                       |
| ---------------------- | ------------------------------------------- |
| `TEST_SIGN_IN_ENABLED` | `true`                                      |
| `TEST_SIGN_IN_CODE`    | six digits, for example a code you pick now |

On the staging project only:

```sh
supabase secrets set TEST_SIGN_IN_ENABLED=true TEST_SIGN_IN_CODE=<six digits> --project-ref <staging project ref>
supabase functions deploy test-sign-in --project-ref <staging project ref>
```

`verify_jwt` is off for this function in `supabase/config.toml`, because it is called before a session
exists.

The staging app builds also need `EXPO_PUBLIC_TEST_SIGN_IN=true`:

- web admin and player web: the GitHub `preview` environment variable `EXPO_PUBLIC_TEST_SIGN_IN`,
  which `.github/workflows/deploy.yml` hands to both builds;
- phone builds: the staging EAS build profile's `env`.

To switch it off, remove the secrets (`supabase secrets unset TEST_SIGN_IN_ENABLED TEST_SIGN_IN_CODE`).
The function returns 404 again at once.

## Production must never have it

- **Never** set `TEST_SIGN_IN_ENABLED` or `TEST_SIGN_IN_CODE` on the production project. Without them
  the function, even if deployed, answers 404 and touches nothing (`handler.test.ts` proves this).
- **Never** set `EXPO_PUBLIC_TEST_SIGN_IN` for a production build. `bun run deploy:check-env` refuses
  it when `TARGET_ENV=production` (web deploys), and the phone app's `eas-build-pre-install` hook
  (`apps/mobile/scripts/check-eas-build-env.ts`) stops any EAS build whose profile is `production`
  and carries the flag.
- A production project has no test accounts to sign in as: test players exist only on staging.

## Marking an account as a test account

- A **test player**: in the admin, Participants, New participant, tick "Test player" (it is ticked and
  locked for the design role). The flag cannot be added to a player later, so a real player never
  becomes one.
- A **team account** (for example the design role's own account): an admin with "Team management"
  opens Settings, Team, and ticks "Test account" next to the person. The change is audited
  (`team.test_account_update`). The database function is `set_team_member_test_account`.
