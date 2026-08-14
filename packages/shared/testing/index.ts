/**
 * Shared test fixtures and factories (RAPP-18). Import from
 * `@ramassa/shared/testing` in unit tests instead of hand-writing row literals.
 *
 * This module is TEST-ONLY. It is exported from the shared package so both apps
 * and the root test suite can reach it, but nothing under `apps/*` or
 * `workers/*` should import it at runtime: it describes fake people who exist
 * only in a local `supabase db reset` database.
 *
 * ONE exception, the one `fixtures.ts` already anticipates when it says the
 * roster exists so "tests, the dev menu, and Maestro flows" agree: the mobile
 * developer menu's account switcher (RAPP-19) imports it to build its roster.
 * That import is reached only through a `__DEV__`-guarded `require`, so Metro
 * folds it away and neither the roster nor `SEED_ACCOUNT_PASSWORD` reaches a
 * release bundle. `tests/dev-menu-production-gate.test.ts` asserts the shape and
 * `scripts/verify-dev-menu-excluded.sh` proves it against a real export. Any
 * OTHER runtime import from an app is still a bug.
 */

export * from './factories';
export * from './fixtures';
export * from './referral-factories';
