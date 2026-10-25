/**
 * The profile edit contract (RAPP-22). Two things are under test here, and the
 * second one matters more than it looks:
 *
 *   1. The payload mapper hits the exact snake_case keys
 *      `public.update_own_profile(jsonb)` reads. No type checker crosses the
 *      SQL boundary, so a mistyped key becomes a silently NULLed column.
 *   2. The edit rules do not DRIFT from intake. The same woman's NIE must be
 *      judged by the same rule whether she typed it during onboarding or fixed
 *      a typo six months later, otherwise "valid" quietly means two different
 *      things in one product.
 */

import { describe, expect, test } from 'bun:test';
import { systemFieldIndexFromCatalog } from '../intake-builder/field-answers';
import {
  systemFieldFixtureId,
  systemFieldsCatalogFixture,
  systemOptionFixtureId,
} from '../testing/system-fields';
import {
  documentationFields,
  documentationStepSchema,
  identityStepSchema,
  logisticsFields,
} from './onboarding';
import {
  profileEditSchema,
  profileEditWithoutSensitiveSchema,
  profileFormOf,
  profileUpdateOf,
} from './profile';

const validEdit = {
  firstName: 'Amina',
  lastName: 'Al-Hassan',
  dateOfBirth: '1995-03-14',
  placeOfBirth: 'حلب',
  nationality: 'Síria',
  preferredLanguage: 'ar' as const,
  documentType: 'nie' as const,
  documentNumber: 'X1234567L',
  phone: '+34600111222',
  address: 'Carrer Major 1',
  city: 'Vic',
  postalCode: '08500',
  referenceEntity: 'Creu Roja Osona',
  // Absent, not null: the intake fields use `optional()`, and `profileFormOf`
  // leaves an answer nobody gave absent.
  referenceContactName: undefined,
  hasDependents: false,
  numDependents: 0,
  clothingSize: 'M' as const,
  shoeSize: '38',
  mediaConsent: false,
};

describe('profileEditSchema', () => {
  test('accepts a profile that intake would have accepted', () => {
    expect(profileEditSchema.safeParse(validEdit).success).toBe(true);
  });

  test('rejects a malformed NIE with the SAME rule intake uses', () => {
    const badNie = { ...validEdit, documentNumber: 'nope' };
    expect(profileEditSchema.safeParse(badNie).success).toBe(false);
    // The proof that it is the same rule, not a lookalike: intake rejects it too.
    expect(
      documentationStepSchema.safeParse({ documentType: 'nie', documentNumber: 'nope' }).success,
    ).toBe(false);
  });

  test('rejects someone under the intake age gate, so editing cannot bypass it', () => {
    const tooYoung = { ...validEdit, dateOfBirth: `${new Date().getUTCFullYear() - 10}-01-01` };
    expect(profileEditSchema.safeParse(tooYoung).success).toBe(false);
  });

  test('a place of birth left empty is unknown; a given one is checked as in intake (RAPP-611)', () => {
    // Staff choose whether it is required; her registration and re-registration
    // enforce that list. An edit checks every value it is given.
    expect(profileEditSchema.safeParse({ ...validEdit, placeOfBirth: '' }).success).toBe(true);
    expect(
      profileEditSchema.safeParse({ ...validEdit, placeOfBirth: 'x'.repeat(201) }).success,
    ).toBe(false);
  });

  test('her names stay required in every edit', () => {
    expect(profileEditSchema.safeParse({ ...validEdit, firstName: ' ' }).success).toBe(false);
  });

  test('having no document is still a first-class answer', () => {
    const noDocument = { ...validEdit, documentType: 'none' as const, documentNumber: undefined };
    expect(profileEditSchema.safeParse(noDocument).success).toBe(true);
  });

  /**
   * The anti-drift assertion. The edit schema is BUILT from the intake step
   * schemas rather than re-declared, so this checks the thing that would break
   * if someone "just added a field" to one side: every field intake validates
   * is still validated on edit.
   */
  test('validates every field the intake steps validate, none dropped', () => {
    const intakeFields = new Set([
      ...Object.keys(identityStepSchema.shape),
      ...Object.keys(documentationFields.shape),
      ...Object.keys(logisticsFields.shape),
    ]);
    const editFields = new Set(Object.keys(profileEditSchema.shape));
    const missing = [...intakeFields].filter((field) => !editFields.has(field));
    expect(missing).toEqual([]);
  });
});

describe('profileEditWithoutSensitiveSchema', () => {
  const withoutSensitive = {
    ...validEdit,
    documentNumber: undefined,
    phone: undefined,
    address: undefined,
    postalCode: undefined,
  };

  test('a staff form with no sensitive fields does not ask for the document number', () => {
    expect(profileEditSchema.safeParse(withoutSensitive).success).toBe(false);
    expect(profileEditWithoutSensitiveSchema.safeParse(withoutSensitive).success).toBe(true);
  });

  test('keeps every other rule, such as the age gate', () => {
    expect(
      profileEditWithoutSensitiveSchema.safeParse({ ...withoutSensitive, placeOfBirth: '' })
        .success,
    ).toBe(true);
    expect(
      profileEditWithoutSensitiveSchema.safeParse({
        ...withoutSensitive,
        dateOfBirth: '2020-01-01',
      }).success,
    ).toBe(false);
  });
});

describe('her record by field (RAPP-663)', () => {
  const fields = systemFieldIndexFromCatalog(systemFieldsCatalogFixture());
  const record = {
    id: '5eed0000-0000-4000-8000-000000000001',
    first_name: 'Amina',
    last_name: 'Al-Hassan',
    preferred_language: 'ar',
    avatar_url: null,
    media_consent: true,
    terms_accepted_at: null,
    season_number: 2,
    answers: {
      [systemFieldFixtureId('date_of_birth')]: '1995-03-14',
      [systemFieldFixtureId('document_type')]: systemOptionFixtureId('document_type', 'nie'),
      [systemFieldFixtureId('document_number')]: 'X1234567L',
      [systemFieldFixtureId('has_dependents')]: systemOptionFixtureId('has_dependents', 'yes'),
      [systemFieldFixtureId('num_dependents')]: 2,
      [systemFieldFixtureId('reference_entity')]: 'Creu Roja Osona',
    },
    fields,
  };

  test('her answers read into the edit form; an answer nobody gave stays absent', () => {
    const form = profileFormOf(record);
    expect(form).toMatchObject({
      firstName: 'Amina',
      dateOfBirth: '1995-03-14',
      documentType: 'nie',
      documentNumber: 'X1234567L',
      hasDependents: true,
      numDependents: 2,
      referenceEntity: 'Creu Roja Osona',
      seasonNumber: 2,
      mediaConsent: true,
      clothingSize: '',
    });
    expect(form.phone).toBeUndefined();
    expect(profileEditSchema.safeParse(form).success).toBe(true);
  });

  test('a saved edit sends every answer by field with the shared rules', () => {
    const edit = profileEditSchema.parse({
      ...profileFormOf(record),
      documentType: 'none',
      hasDependents: false,
      phone: '+34 600 111 222',
    });
    const update = profileUpdateOf(fields, edit);
    expect(update).toMatchObject({
      first_name: 'Amina',
      preferred_language: 'ar',
      media_consent: true,
      season_number: 2,
    });
    expect(update.answers).toMatchObject({
      [systemFieldFixtureId('document_type')]: systemOptionFixtureId('document_type', 'none'),
      // No number without a document, no count without dependants.
      [systemFieldFixtureId('document_number')]: null,
      [systemFieldFixtureId('has_dependents')]: systemOptionFixtureId('has_dependents', 'no'),
      [systemFieldFixtureId('num_dependents')]: null,
      [systemFieldFixtureId('phone')]: '+34600111222',
      [systemFieldFixtureId('date_of_birth')]: '1995-03-14',
    });
  });

  test('carries NO key the participant is not allowed to change', () => {
    const update = profileUpdateOf(fields, profileEditSchema.parse(validEdit)) as unknown as Record<
      string,
      unknown
    >;
    for (const forbidden of ['role', 'org_id', 'terms_accepted_at', 'is_active', 'id']) {
      expect(update).not.toHaveProperty(forbidden);
    }
  });

  test('an empty document stays empty: it never becomes "I have none" (RAPP-302)', () => {
    const form = profileFormOf({ ...record, answers: {} });
    expect(form.documentType).toBeUndefined();
    const update = profileUpdateOf(
      fields,
      profileEditSchema.parse({
        ...form,
        nationality: 'Síria',
        dateOfBirth: '1995-03-14',
        placeOfBirth: 'Alep',
      }),
    );
    expect(update.answers).toMatchObject({
      [systemFieldFixtureId('document_type')]: null,
      [systemFieldFixtureId('document_number')]: null,
    });
  });
});
