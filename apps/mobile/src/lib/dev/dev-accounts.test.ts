import { describe, expect, test } from 'bun:test';
import { SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n';
import {
  PARTICIPANT_FIXTURES,
  SEED_ACCESS_CODE,
  SEED_ACCOUNT_PASSWORD,
  STAFF_FIXTURES,
} from '@ramassa/shared/testing';
import {
  DEV_ALL_PLAYER_ACCOUNTS,
  DEV_PLAYER_ACCOUNTS,
  DEV_STAFF_ACCOUNTS,
  pickOneParticipantPerLanguage,
} from './dev-accounts';

const allAccounts = [...DEV_STAFF_ACCOUNTS, ...DEV_ALL_PLAYER_ACCOUNTS];

describe('the dev roster is derived from the seed fixtures, never re-listed', () => {
  test('every staff account comes from STAFF_FIXTURES', () => {
    const seededEmails = new Set(STAFF_FIXTURES.map((fixture) => fixture.email));
    for (const account of DEV_STAFF_ACCOUNTS) {
      expect(seededEmails.has(account.email)).toBe(true);
    }
  });

  test('every player account comes from PARTICIPANT_FIXTURES', () => {
    const seededEmails = new Set(PARTICIPANT_FIXTURES.map((fixture) => fixture.email));
    for (const account of DEV_ALL_PLAYER_ACCOUNTS) {
      expect(seededEmails.has(account.email)).toBe(true);
    }
  });

  test('the roster covers every seeded account, so a new fixture cannot be forgotten', () => {
    expect(allAccounts).toHaveLength(STAFF_FIXTURES.length + PARTICIPANT_FIXTURES.length);
  });

  test('user ids match the ordinal-derived seed ids', () => {
    const laia = DEV_STAFF_ACCOUNTS.find((account) => account.email === 'laia.ferrer@example.test');
    expect(laia?.userId).toBe('5eed0000-0000-4000-8000-000000000001');
  });
});

describe('roles', () => {
  test('the four app roles are all reachable from the switcher', () => {
    const roles = new Set(allAccounts.map((account) => account.role));
    expect(roles).toEqual(new Set(['admin', 'staff', 'entity', 'player']));
  });

  test('participants are players; the seed fixtures carry no role for them', () => {
    for (const account of DEV_ALL_PLAYER_ACCOUNTS) {
      expect(account.role).toBe('player');
    }
  });
});

describe('development credentials', () => {
  test('the admin-created participant signs in with the seeded access code', () => {
    const fixture = PARTICIPANT_FIXTURES.find((participant) => participant.accessCode);
    const account = DEV_ALL_PLAYER_ACCOUNTS.find(
      (participant) => participant.email === fixture?.email,
    );

    expect(fixture?.accessCode).toBe(SEED_ACCESS_CODE);
    expect(account?.password).toBe(SEED_ACCESS_CODE);
  });

  test('all remaining accounts keep the shared development password', () => {
    const accessCodeEmail = PARTICIPANT_FIXTURES.find(
      (participant) => participant.accessCode,
    )?.email;
    const passwordAccounts = allAccounts.filter((account) => account.email !== accessCodeEmail);

    expect(passwordAccounts.length).toBeGreaterThan(0);
    for (const account of passwordAccounts) {
      expect(account.password).toBe(SEED_ACCOUNT_PASSWORD);
    }
  });
});

describe('script coverage: the point of the switcher is proving fonts and mirroring', () => {
  test('the shortlist offers one player per supported language', () => {
    expect(DEV_PLAYER_ACCOUNTS.map((account) => account.language)).toEqual([
      ...SUPPORTED_LANGUAGES,
    ]);
  });

  test('the Arabic and Farsi players are the ones RAPP-20 asks to spot check', () => {
    const byLanguage = new Map(
      DEV_PLAYER_ACCOUNTS.map((account) => [account.language, account.email]),
    );
    expect(byLanguage.get('ar')).toBe('amina.alhassan@example.test');
    expect(byLanguage.get('fa')).toBe('zahra.rezaei@example.test');
  });

  test('names are carried in their own script, never transliterated', () => {
    const amina = DEV_PLAYER_ACCOUNTS.find((account) => account.language === 'ar');
    expect(amina?.displayName).toBe('أمينة الحسن');
  });

  test('each account carries the font family key that renders its script', () => {
    const fontKeyByLanguage = Object.fromEntries(
      allAccounts.map((account) => [account.language, account.fontFamilyKey]),
    );
    expect(fontKeyByLanguage.ar).toBe('arabic');
    expect(fontKeyByLanguage.fa).toBe('farsi');
    expect(fontKeyByLanguage.ca).toBe('sans');
  });

  test('a Cyrillic name is reachable, so the Latin font is exercised beyond ASCII', () => {
    const cyrillicNames = DEV_ALL_PLAYER_ACCOUNTS.filter((account) =>
      /[Ѐ-ӿ]/.test(account.displayName),
    );
    expect(cyrillicNames.length).toBeGreaterThan(0);
  });
});

describe('pickOneParticipantPerLanguage', () => {
  test('returns the first participant of each language, in supported-language order', () => {
    const picked = pickOneParticipantPerLanguage([
      { ...PARTICIPANT_FIXTURES[1]!, preferredLanguage: 'es' },
      { ...PARTICIPANT_FIXTURES[0]!, preferredLanguage: 'ca' },
      { ...PARTICIPANT_FIXTURES[2]!, preferredLanguage: 'es' },
    ]);
    expect(picked.map((fixture) => fixture.preferredLanguage)).toEqual(['ca', 'es']);
    expect(picked[1]?.email).toBe(PARTICIPANT_FIXTURES[1]?.email);
  });

  test('skips a language no participant speaks rather than inventing one', () => {
    const picked = pickOneParticipantPerLanguage([
      { ...PARTICIPANT_FIXTURES[0]!, preferredLanguage: 'fa' },
    ]);
    expect(picked.map((fixture) => fixture.preferredLanguage)).toEqual(['fa']);
  });
});

describe('no duplicates', () => {
  test('emails are unique across the whole roster', () => {
    const emails = allAccounts.map((account) => account.email);
    expect(new Set(emails).size).toBe(emails.length);
  });

  test('the shortlist is a subset of the full player list', () => {
    const allEmails = new Set(DEV_ALL_PLAYER_ACCOUNTS.map((account) => account.email));
    for (const account of DEV_PLAYER_ACCOUNTS) {
      expect(allEmails.has(account.email)).toBe(true);
    }
  });
});
