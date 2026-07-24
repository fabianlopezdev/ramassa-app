import { describe, expect, test } from 'bun:test';
import { SUPPORTED_LANGUAGES } from '../i18n/languages';
import {
  buildOrganization,
  buildParticipant,
  buildParticipants,
  buildProfile,
  buildPushToken,
} from './factories';
import {
  PARTICIPANT_FIXTURES,
  SEED_ACCOUNT_PASSWORD,
  SEED_ORGANIZATION_ID,
  seedUserId,
  STAFF_FIXTURES,
} from './fixtures';

describe('fixtures — the roster the seed and the factories share', () => {
  test('every fixture email is a clearly fake @example.test address', () => {
    for (const fixture of [...PARTICIPANT_FIXTURES, ...STAFF_FIXTURES]) {
      expect(fixture.email.endsWith('@example.test')).toBe(true);
    }
  });

  test('the participant roster spans all five supported languages', () => {
    const languages = new Set(PARTICIPANT_FIXTURES.map((fixture) => fixture.preferredLanguage));
    for (const language of SUPPORTED_LANGUAGES) {
      expect(languages.has(language)).toBe(true);
    }
  });

  test('the RTL languages are carried by names in their own script, not transliterations', () => {
    const arabicScript = /[؀-ۿ]/;
    const rtlFixtures = PARTICIPANT_FIXTURES.filter(
      (fixture) => fixture.preferredLanguage === 'ar' || fixture.preferredLanguage === 'fa',
    );

    expect(rtlFixtures.length).toBeGreaterThan(0);
    for (const fixture of rtlFixtures) {
      expect(arabicScript.test(fixture.firstName)).toBe(true);
      expect(arabicScript.test(fixture.lastName)).toBe(true);
    }
  });

  test('the roster also carries a Cyrillic name (Ukrainian participants, no Ukrainian UI locale)', () => {
    const cyrillic = /[Ѐ-ӿ]/;
    expect(PARTICIPANT_FIXTURES.some((fixture) => cyrillic.test(fixture.firstName))).toBe(true);
  });

  test('every fixture ordinal is unique, so the derived user IDs cannot collide', () => {
    const ordinals = [...PARTICIPANT_FIXTURES, ...STAFF_FIXTURES].map((fixture) => fixture.ordinal);
    expect(new Set(ordinals).size).toBe(ordinals.length);
  });

  test('seedUserId derives a stable, seed-namespaced UUID from an ordinal', () => {
    expect(seedUserId(1)).toBe('5eed0000-0000-4000-8000-000000000001');
    expect(seedUserId(11)).toBe('5eed0000-0000-4000-8000-000000000011');
    expect(seedUserId(11)).toBe(seedUserId(11));
  });

  test('the shared dev password satisfies the app password rule', () => {
    expect(SEED_ACCOUNT_PASSWORD.length).toBeGreaterThanOrEqual(8);
  });
});

describe('buildOrganization', () => {
  test('defaults to the seeded tenant with all five languages available', () => {
    const organization = buildOrganization();

    expect(organization.id).toBe(SEED_ORGANIZATION_ID);
    expect(organization.available_languages).toEqual([...SUPPORTED_LANGUAGES]);
    expect(organization.default_language).toBe('ca');
  });

  test('overrides win over the defaults', () => {
    expect(buildOrganization({ slug: 'other-club' }).slug).toBe('other-club');
  });
});

describe('buildProfile', () => {
  test('defaults to an active player in the seeded org', () => {
    const profile = buildProfile();

    expect(profile.role).toBe('player');
    expect(profile.org_id).toBe(SEED_ORGANIZATION_ID);
    expect(profile.is_active).toBe(true);
  });

  test('builds any role through overrides', () => {
    expect(buildProfile({ role: 'staff' }).role).toBe('staff');
  });

  test('is deterministic: two calls with no overrides are identical', () => {
    expect(buildProfile()).toEqual(buildProfile());
  });
});

describe('buildParticipant', () => {
  test('defaults to the first roster fixture, name in its own script', () => {
    const participant = buildParticipant();
    const firstFixture = PARTICIPANT_FIXTURES[0]!;

    expect(participant.first_name).toBe(firstFixture.firstName);
    expect(participant.preferred_language).toBe(firstFixture.preferredLanguage);
    expect(participant.id).toBe(seedUserId(firstFixture.ordinal));
    expect(participant.role).toBe('player');
  });

  test('overrides win over the fixture', () => {
    expect(buildParticipant({ city: 'Manlleu' }).city).toBe('Manlleu');
  });
});

describe('buildParticipants', () => {
  test('walks the roster so a set of participants is multilingual by construction', () => {
    const participants = buildParticipants(6);

    expect(participants).toHaveLength(6);
    expect(new Set(participants.map((participant) => participant.id)).size).toBe(6);
    expect(
      new Set(participants.map((participant) => participant.preferred_language)).size,
    ).toBeGreaterThan(1);
  });

  test('IDs stay unique past the end of the roster', () => {
    const participants = buildParticipants(PARTICIPANT_FIXTURES.length + 3);

    expect(new Set(participants.map((participant) => participant.id)).size).toBe(
      participants.length,
    );
  });
});

describe('buildPushToken', () => {
  test('defaults to a token owned by the default participant', () => {
    expect(buildPushToken().user_id).toBe(buildParticipant().id);
  });

  test('overrides win over the defaults', () => {
    expect(buildPushToken({ platform: 'ios' }).platform).toBe('ios');
  });
});
