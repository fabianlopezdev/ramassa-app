/**
 * Staff completing the record of a woman who has not joined yet (RAPP-300).
 * Only what somebody answered is shown, only the names are required, and only
 * the fields staff changed are sent: each one sent becomes a staff answer, so
 * an untouched default must never travel.
 */
import { describe, expect, test } from 'bun:test';
import { systemFieldIndexFromCatalog } from '../intake-builder/field-answers';
import type { IntakeQuestion } from '../onboarding/intake';
import {
  systemFieldFixtureId,
  systemFieldsCatalogFixture,
  systemOptionFixtureId,
} from '../testing/system-fields';
import {
  fetchParticipantAnsweredQuestions,
  prefillFormOf,
  prefillUpdateOf,
  profilePrefillSchema,
} from './participant-prefill';

describe('profilePrefillSchema', () => {
  test('only the names are required', () => {
    expect(profilePrefillSchema.safeParse({ firstName: 'Mariam', lastName: 'Keita' }).success).toBe(
      true,
    );
    expect(profilePrefillSchema.safeParse({ firstName: 'Mariam', lastName: '' }).success).toBe(
      false,
    );
  });

  test('a value that is given still has to be valid', () => {
    expect(
      profilePrefillSchema.safeParse({
        firstName: 'Mariam',
        lastName: 'Keita',
        documentType: 'nie',
        documentNumber: '1234',
      }).success,
    ).toBe(false);
    expect(
      profilePrefillSchema.safeParse({
        firstName: 'Mariam',
        lastName: 'Keita',
        hasDependents: true,
        numDependents: 0,
      }).success,
    ).toBe(false);
  });
});

describe('fetchParticipantAnsweredQuestions', () => {
  test('reads her answered questions as a set, from her answers', async () => {
    const calls: unknown[] = [];
    const client = {
      rpc: (name: string, args: unknown) => {
        calls.push([name, args]);
        return Promise.resolve({ data: ['nationality'], error: null });
      },
    };
    const result = await fetchParticipantAnsweredQuestions(client as never, 'p1');
    expect(result).toEqual(new Set(['nationality']));
    expect(calls).toEqual([['participant_answered_questions', { p_profile_id: 'p1' }]]);
  });

  test('a failed read is a typed DB-1 error', async () => {
    const client = {
      rpc: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
    };
    await expect(fetchParticipantAnsweredQuestions(client as never, 'p1')).rejects.toMatchObject({
      code: 'DB-1',
    });
  });
});

describe('by field (RAPP-663)', () => {
  const fields = systemFieldIndexFromCatalog(systemFieldsCatalogFixture());
  const record = {
    id: '5eed0000-0000-4000-8000-000000000001',
    first_name: 'Mariam',
    last_name: 'Keita',
    preferred_language: 'ca',
    avatar_url: null,
    media_consent: false,
    terms_accepted_at: null,
    season_number: 1,
    answers: {
      [systemFieldFixtureId('date_of_birth')]: '1999-03-14',
      [systemFieldFixtureId('reference_entity')]: 'Creu Roja Osona',
    },
    fields,
  };

  test('only what somebody answered shows; a setting only when it was answered', () => {
    const form = prefillFormOf(record, new Set<IntakeQuestion>(['first_name', 'season_number']));
    expect(form).toEqual({
      firstName: 'Mariam',
      lastName: 'Keita',
      dateOfBirth: '1999-03-14',
      referenceEntity: 'Creu Roja Osona',
      preferredLanguage: undefined,
      seasonNumber: 1,
      supportingEntities: [],
    });
  });

  test('only the changed fields travel, with their partners, as answers by field', () => {
    const values = profilePrefillSchema.parse({
      firstName: 'Mariam',
      lastName: 'Keita',
      documentType: 'passport',
      documentNumber: 'p123',
      hasDependents: false,
      numDependents: 2,
      city: 'Vic',
    });
    expect(
      prefillUpdateOf(fields, values, new Set(['documentType', 'hasDependents', 'lastName'])),
    ).toEqual({
      last_name: 'Keita',
      answers: {
        [systemFieldFixtureId('document_type')]: systemOptionFixtureId('document_type', 'passport'),
        [systemFieldFixtureId('document_number')]: 'P123',
        [systemFieldFixtureId('has_dependents')]: systemOptionFixtureId('has_dependents', 'no'),
        // No count without dependants.
        [systemFieldFixtureId('num_dependents')]: null,
      },
    });
    expect(prefillUpdateOf(fields, values, new Set())).toEqual({ answers: {} });
  });
});
