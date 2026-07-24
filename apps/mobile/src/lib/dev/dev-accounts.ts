/**
 * The dev menu's account roster (RAPP-19), DERIVED from the seed fixtures.
 *
 * This app has no "premium" flag to toggle: the thing a developer needs to
 * switch is the ROLE, and role lives in `profiles.role`, resolved from the
 * session by the AuthProvider. There is no honest way to fake that client-side,
 * so the switcher signs in for real with the seeded password. That is also why
 * it is deterministic: `supabase db reset` rebuilds exactly these accounts.
 *
 * Nothing here re-lists a person. The names, emails, languages and ordinals all
 * come from `@ramassa/shared/testing`, which `tests/seed-fixtures.test.ts`
 * already pins against `supabase/seed.sql`. A second copy of the roster would
 * drift the first time someone edits the SQL, so the roster is computed.
 *
 * This module is dev-only. It reaches it into the bundle only through a
 * `__DEV__`-guarded require (see `src/app/dev-menu.tsx` and
 * `tests/dev-menu-production-gate.test.ts`), so neither the fixture roster nor
 * the seed password ever reaches a release build.
 */

import { getLanguageFontFamilyKey, SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n';
import type { AppRole } from '@ramassa/shared/schemas';
import {
  PARTICIPANT_FIXTURES,
  SEED_ACCOUNT_PASSWORD,
  seedUserId,
  STAFF_FIXTURES,
  type PersonFixture,
  type StaffFixture,
} from '@ramassa/shared/testing';

export interface DevAccount {
  readonly userId: string;
  readonly email: string;
  readonly password: string;
  /** The person's real name, in their own script. Never transliterated. */
  readonly displayName: string;
  readonly role: AppRole;
  readonly language: (typeof SUPPORTED_LANGUAGES)[number];
  /** Which bundled font family renders `displayName` without tofu boxes. */
  readonly fontFamilyKey: ReturnType<typeof getLanguageFontFamilyKey>;
  readonly origin: string;
  readonly city: string;
  /** For entity contacts, the organization they refer participants from. */
  readonly referenceEntity?: string;
}

function toDevAccount(fixture: PersonFixture, role: AppRole): DevAccount {
  return {
    userId: seedUserId(fixture.ordinal),
    email: fixture.email,
    password: SEED_ACCOUNT_PASSWORD,
    displayName: `${fixture.firstName} ${fixture.lastName}`,
    role,
    language: fixture.preferredLanguage,
    fontFamilyKey: getLanguageFontFamilyKey(fixture.preferredLanguage),
    origin: fixture.nationality,
    city: fixture.city,
  };
}

function toStaffDevAccount(fixture: StaffFixture): DevAccount {
  const account = toDevAccount(fixture, fixture.role);
  return fixture.referenceEntity === undefined
    ? account
    : { ...account, referenceEntity: fixture.referenceEntity };
}

/**
 * One participant per supported language, in the canonical language order, so
 * the switcher's short list exercises Arabic, Farsi, Cyrillic and Latin scripts
 * without listing all twenty people. A language nobody in the seed speaks is
 * skipped rather than filled with a stand-in.
 */
export function pickOneParticipantPerLanguage(
  fixtures: readonly PersonFixture[],
): readonly PersonFixture[] {
  return SUPPORTED_LANGUAGES.map((language) =>
    fixtures.find((fixture) => fixture.preferredLanguage === language),
  ).filter((fixture): fixture is PersonFixture => fixture !== undefined);
}

/** Admin, staff, and the two social-entity contacts. */
export const DEV_STAFF_ACCOUNTS: readonly DevAccount[] = STAFF_FIXTURES.map(toStaffDevAccount);

/** Every seeded participant. All are players; the fixtures carry no role field. */
export const DEV_ALL_PLAYER_ACCOUNTS: readonly DevAccount[] = PARTICIPANT_FIXTURES.map((fixture) =>
  toDevAccount(fixture, 'player'),
);

/** The five-script short list the switcher shows before "show all". */
export const DEV_PLAYER_ACCOUNTS: readonly DevAccount[] = pickOneParticipantPerLanguage(
  PARTICIPANT_FIXTURES,
).map((fixture) => toDevAccount(fixture, 'player'));
