/**
 * Staff completing the record of a woman who has not joined yet (RAPP-300).
 * Only what somebody answered is shown, only the names are required, and only
 * the fields staff changed are sent: each one sent becomes a staff answer, so
 * an untouched default must never travel.
 */
import { describe, expect, test } from 'bun:test';
import type { IntakeQuestion } from '../onboarding/intake';
import {
  buildProfilePrefillPayload,
  fetchParticipantAnsweredQuestions,
  prefillFromRow,
  profilePrefillSchema,
  type PrefillRow,
} from './participant-prefill';

const row: PrefillRow = {
  first_name: 'Mariam',
  last_name: 'Keita',
  date_of_birth: '1999-03-14',
  place_of_birth: null,
  nationality: 'Mali',
  preferred_language: 'ca',
  document_type: null,
  document_number: null,
  phone: null,
  address: null,
  city: null,
  postal_code: null,
  reference_entity: 'Creu Roja Osona',
  reference_contact_name: null,
  has_dependents: false,
  num_dependents: 0,
  clothing_size: 'M',
  shoe_size: null,
};

const answered = (...questions: IntakeQuestion[]) => new Set<IntakeQuestion>(questions);

describe('prefillFromRow', () => {
  test('shows what somebody answered and leaves the rest empty, defaults included', () => {
    const values = prefillFromRow(
      row,
      answered('first_name', 'last_name', 'date_of_birth', 'nationality', 'clothing_size'),
    );
    expect(values).toMatchObject({
      firstName: 'Mariam',
      lastName: 'Keita',
      dateOfBirth: '1999-03-14',
      nationality: 'Mali',
      clothingSize: 'M',
    });
    expect(values.preferredLanguage).toBeUndefined();
    expect(values.hasDependents).toBeUndefined();
    expect(values.shoeSize).toBeUndefined();
  });

  test('the names always show, because the invitation set them', () => {
    expect(prefillFromRow(row, answered())).toMatchObject({
      firstName: 'Mariam',
      lastName: 'Keita',
    });
  });
});

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

describe('buildProfilePrefillPayload', () => {
  const values = {
    firstName: 'Mariam',
    lastName: 'Keita',
    nationality: 'Guinea',
    preferredLanguage: 'ca' as const,
    hasDependents: true,
    numDependents: 2,
    documentType: 'none' as const,
    clothingSize: 'L' as const,
  };

  test('sends only the fields staff changed', () => {
    expect(buildProfilePrefillPayload(values, new Set(['nationality', 'clothingSize']))).toEqual({
      nationality: 'Guinea',
      clothing_size: 'L',
    });
  });

  test('two-field questions travel whole', () => {
    expect(buildProfilePrefillPayload(values, new Set(['numDependents']))).toEqual({
      has_dependents: true,
      num_dependents: 2,
    });
    expect(buildProfilePrefillPayload(values, new Set(['documentType']))).toEqual({
      document_type: 'none',
      document_number: null,
    });
  });

  test('a field emptied by staff is sent empty, so the database clears it', () => {
    expect(
      buildProfilePrefillPayload({ ...values, nationality: undefined }, new Set(['nationality'])),
    ).toEqual({ nationality: null });
  });
});

describe('fetchParticipantAnsweredQuestions', () => {
  test('reads her answered questions as a set', async () => {
    const calls: unknown[] = [];
    const client = {
      from: (table: string) => ({
        select: (columns: string) => ({
          eq: (column: string, value: string) => {
            calls.push([table, columns, column, value]);
            return Promise.resolve({ data: [{ question: 'nationality' }], error: null });
          },
        }),
      }),
    };
    const result = await fetchParticipantAnsweredQuestions(client as never, 'p1');
    expect(result).toEqual(new Set(['nationality']));
    expect(calls).toEqual([['profile_answers', 'question', 'profile_id', 'p1']]);
  });

  test('a failed read is a typed DB-1 error', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
        }),
      }),
    };
    await expect(fetchParticipantAnsweredQuestions(client as never, 'p1')).rejects.toMatchObject({
      code: 'DB-1',
    });
  });
});
