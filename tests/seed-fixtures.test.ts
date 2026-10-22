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
  INVITED_ACCOUNT_EMAIL,
  ONBOARDING_ACCOUNT_EMAIL,
  ONBOARDING_DESIGNER_EMAIL,
  ONBOARDING_DESIGNER_ID,
  ONBOARDING_DESIGNER_NAME,
  PARTICIPANT_FIXTURES,
  SEED_ACCOUNT_PASSWORD,
  SEED_ORGANIZATION_ID,
  SEED_USER_ID_PREFIX,
  seedUserId,
  STAFF_FIXTURES,
  TEST_PLAYER_EMAIL,
  TEST_PLAYER_ID,
  TEST_PLAYER_NAME,
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
  // Both reserved domains: the fixture one, and the unroutable one the product
  // generates for a participant with no inbox (RAPP-25).
  const seededEmails = new Set(seedSql.match(/[\w.+-]+@[\w.-]+\.(?:test|invalid)\b/g) ?? []);
  // The onboarding drive account is auth-only ON PURPOSE: no profile, so the
  // wizard gate fires for it. It is part of the seed contract, not roster drift.
  // The invited account (RAPP-300) has a not-joined profile, outside the roster.
  const expected = [
    ...allFixtures.map((fixture) => fixture.email),
    ONBOARDING_ACCOUNT_EMAIL,
    INVITED_ACCOUNT_EMAIL,
    // The onboarding design sandbox (RAPP-615), outside the roster too.
    ONBOARDING_DESIGNER_EMAIL,
    TEST_PLAYER_EMAIL,
  ];
  expect([...seededEmails].sort()).toEqual(expected.sort());
});

/**
 * `@example.test` is the fixture domain (RFC 2606): a seeded account can never
 * reach a real mailbox. A real address in a seed is an RGPD incident waiting
 * for a `db reset` on the wrong machine.
 */
test('seed.sql contains no email address outside the reserved fixture domain', () => {
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

test('the seed carries field-ready attendance rows in every visible status', () => {
  expect(seedSql).toContain('insert into public.attendance');
  expect(seedSql).toContain("'present'");
  expect(seedSql).toContain("'absent'");
  expect(seedSql).toContain("'excused'");
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

test('the seed has the onboarding design sandbox: a designer and a test player (RAPP-615)', () => {
  for (const id of [ONBOARDING_DESIGNER_ID, TEST_PLAYER_ID]) expect(seedSql).toContain(id);
  expect(seedSql).toContain(
    `'staff', '${ONBOARDING_DESIGNER_NAME.firstName}', '${ONBOARDING_DESIGNER_NAME.lastName}', 'ca', true`,
  );
  expect(seedSql).toContain(
    `'invited', '${TEST_PLAYER_NAME.firstName}', '${TEST_PLAYER_NAME.lastName}', 'ca', true`,
  );
  expect(seedSql).toContain("preset.builtin_key = 'onboarding_design'");
});
