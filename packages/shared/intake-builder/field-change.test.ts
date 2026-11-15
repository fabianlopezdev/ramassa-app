import { describe, expect, test } from 'bun:test';
import { isNameField, needsChangeConfirmation, parseFieldChangePreview } from './field-change';

const raw = {
  type_from: 'country',
  type_to: 'short_text',
  privacy_from: 'personal',
  privacy_to: 'sensitive',
  answers: 12,
  converted: 12,
  not_converted: 0,
  to_encrypt: 11,
  to_decrypt: 0,
  readers_gaining: 0,
  readers_losing: 2,
  roles_gaining: [],
  roles_losing: [
    {
      role_id: '69200000-0000-4000-8000-000000000001',
      builtin_key: null,
      name: 'Equip',
      people: 1,
    },
    { role_id: null, builtin_key: null, name: null, people: 1 },
  ],
  conditions_cleared: 0,
  features: [
    { feature: 'impact.nationalities', fits_now: true, fits_after: false },
    { feature: 'participants.nationality', fits_now: true, fits_after: false },
    { feature: 'a.feature.this.build.does.not.know', fits_now: true, fits_after: false },
  ],
};

describe('parseFieldChangePreview', () => {
  test('reads the counts and the features that stop', () => {
    const preview = parseFieldChangePreview(raw);
    expect(preview.isTypeChange).toBe(true);
    expect(preview.isPrivacyChange).toBe(true);
    expect(preview.toEncrypt).toBe(11);
    expect(preview.readersLosing).toBe(2);
    expect(preview.rolesLosing).toEqual([
      {
        roleId: '69200000-0000-4000-8000-000000000001',
        builtinKey: null,
        name: 'Equip',
        people: 1,
      },
      { roleId: null, builtinKey: null, name: null, people: 1 },
    ]);
    expect(preview.rolesGaining).toEqual([]);
    expect(preview.featuresLost).toEqual(['impact.nationalities', 'participants.nationality']);
    expect(preview.featuresRegained).toEqual([]);
  });

  test('a feature that starts reading again is named apart', () => {
    const preview = parseFieldChangePreview({
      ...raw,
      type_from: 'short_text',
      type_to: 'country',
      features: [{ feature: 'impact.nationalities', fits_now: false, fits_after: true }],
    });
    expect(preview.featuresLost).toEqual([]);
    expect(preview.featuresRegained).toEqual(['impact.nationalities']);
  });

  test('refuses a shape it does not know', () => {
    expect(() => parseFieldChangePreview({ ...raw, answers: -1 })).toThrow();
  });
});

describe('needsChangeConfirmation', () => {
  const field = { type: 'short_text', privacy: 'personal', hasAnswers: true } as const;

  test('asks when an answered field changes type or privacy', () => {
    expect(needsChangeConfirmation(field, { type: 'number', privacy: 'personal' })).toBe(true);
    expect(needsChangeConfirmation(field, { type: 'short_text', privacy: 'sensitive' })).toBe(true);
  });

  test('does not ask for a rename, or a new type on a field without answers', () => {
    expect(needsChangeConfirmation(field, { type: 'short_text', privacy: 'personal' })).toBe(false);
    expect(
      needsChangeConfirmation(
        { ...field, hasAnswers: false },
        { type: 'number', privacy: 'personal' },
      ),
    ).toBe(false);
  });

  test('a new privacy level always asks, with no answers too (RAPP-692)', () => {
    expect(
      needsChangeConfirmation(
        { ...field, hasAnswers: false },
        { type: 'short_text', privacy: 'normal' },
      ),
    ).toBe(true);
  });

  test('asks when the page cannot tell whether answers exist', () => {
    expect(
      needsChangeConfirmation(
        { ...field, hasAnswers: null },
        { type: 'number', privacy: 'normal' },
      ),
    ).toBe(true);
  });
});

test('her names are the two name fields', () => {
  expect(isNameField({ systemKey: 'first_name' })).toBe(true);
  expect(isNameField({ systemKey: 'last_name' })).toBe(true);
  expect(isNameField({ systemKey: 'phone' })).toBe(false);
  expect(isNameField({ systemKey: null })).toBe(false);
});
