/**
 * Shared test fixtures and factories (RAPP-18). Import from
 * `@ramassa/shared/testing` in unit tests instead of hand-writing row literals.
 *
 * This module is TEST-ONLY. It is exported from the shared package so both apps
 * and the root test suite can reach it, but nothing under `apps/*` or
 * `workers/*` should import it at runtime: it describes fake people who exist
 * only in a local `supabase db reset` database.
 */

export * from './factories';
export * from './fixtures';
