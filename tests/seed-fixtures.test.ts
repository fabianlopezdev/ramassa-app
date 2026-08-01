/**
 * Keeps `supabase/seed.sql` and the shared test factories describing the SAME
 * people (RAPP-18). The factories are useless as fixtures if a test builds
 * "Amina" while the local database holds someone else: assertions written
 * against one would quietly stop describing the other.
 *
 * SQL cannot import the TypeScript roster, so this test is the seam that keeps
 * the two copies honest. It reads the seed file as text and checks that every
 * roster identity is actually in it, and that the seed contains no address
 * outside the reserved `@example.test` domain (no real participant data ever
 * reaches a seed file — RGPD, SPEC § sensitive population).
 */

import { expect, test } from 'bun:test';
import { buildProfileFromFixture } from '../packages/shared/testing/factories';
import {
  ONBOARDING_ACCOUNT_EMAIL,
  PARTICIPANT_FIXTURES,
  SEED_ACCOUNT_PASSWORD,
  SEED_ORGANIZATION_ID,
  SEED_USER_ID_PREFIX,
  seedUserId,
  STAFF_FIXTURES,
} from '../packages/shared/testing/fixtures';

const seedSql = await Bun.file(new URL('../supabase/seed.sql', import.meta.url)).text();

const allFixtures = [...PARTICIPANT_FIXTURES, ...STAFF_FIXTURES];

test('every fixture identity in the shared roster is present in seed.sql', () => {
  for (const fixture of allFixtures) {
    expect(seedSql).toContain(fixture.email);
    expect(seedSql).toContain(fixture.firstName);
    expect(seedSql).toContain(fixture.lastName);
  }
});

test('seed.sql seeds exactly the roster: no extra accounts, none missing', () => {
  const seededEmails = new Set(seedSql.match(/[\w.+-]+@[\w.-]+\.test\b/g) ?? []);
  // The onboarding drive account is auth-only ON PURPOSE: no profile, so the
  // wizard gate fires for it. It is part of the seed contract, not roster drift.
  const expected = [...allFixtures.map((fixture) => fixture.email), ONBOARDING_ACCOUNT_EMAIL];
  expect([...seededEmails].sort()).toEqual(expected.sort());
});

test('seed.sql contains no email address outside the reserved fake domain', () => {
  const emails = seedSql.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? [];
  expect(emails.length).toBeGreaterThan(0);
  for (const email of emails) {
    expect(email.endsWith('@example.test')).toBe(true);
  }
});

test('the seed and the factories derive user IDs from the same namespace', () => {
  expect(seedSql).toContain(SEED_ORGANIZATION_ID);
  // Neither side lists the UUIDs: the seed pads the ordinal in SQL, the factories
  // pad it in TypeScript. What has to match is the namespace they pad into.
  expect(seedSql).toContain(SEED_USER_ID_PREFIX);
  expect(seedUserId(PARTICIPANT_FIXTURES[0]!.ordinal)).toStartWith(SEED_USER_ID_PREFIX);
});

test('the shared dev password is the one seed.sql actually hashes', () => {
  expect(seedSql).toContain(SEED_ACCOUNT_PASSWORD);
});

/**
 * Place of birth is DERIVED on both sides (RAPP-24): the seed maps a
 * nationality to a birthplace in SQL, the factories map it in TypeScript, and
 * two participants keep a NULL because profiles created before the field was
 * required carry one.
 *
 * It is checked here because a drift is invisible until the staff edit form
 * refuses to save a seeded participant: the form re-validates the intake rule,
 * so a roster of NULLs makes every record uneditable and nothing says why.
 */
test('the seed and the factories agree on where each participant was born', () => {
  for (const fixture of PARTICIPANT_FIXTURES) {
    const built = buildProfileFromFixture(fixture);
    if (built.place_of_birth === null) continue;
    expect(seedSql).toContain(built.place_of_birth);
  }
});

test('most seeded participants have a birthplace, and a couple deliberately do not', () => {
  const places = PARTICIPANT_FIXTURES.map(
    (fixture) => buildProfileFromFixture(fixture).place_of_birth,
  );
  expect(places.filter((place) => place === null).length).toBeGreaterThan(0);
  expect(places.filter((place) => place !== null).length).toBeGreaterThan(places.length / 2);
});
