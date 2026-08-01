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
import {
  documentationFields,
  documentationStepSchema,
  identityStepSchema,
  logisticsFields,
} from './onboarding';
import {
  buildUpdateOwnProfilePayload,
  profileEditSchema,
  profileFromRow,
  type ProfileRow,
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
  // Absent, not null: the intake fields use `optional()`, and `profileFromRow`
  // is what turns a NULL column into an absent form value.
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

  test('keeps place of birth required, exactly as intake does', () => {
    const withoutPlace = { ...validEdit, placeOfBirth: '' };
    expect(profileEditSchema.safeParse(withoutPlace).success).toBe(false);
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

describe('buildUpdateOwnProfilePayload', () => {
  test('maps every field to the snake_case key the RPC reads', () => {
    const parsed = profileEditSchema.parse(validEdit);
    expect(buildUpdateOwnProfilePayload(parsed)).toEqual({
      first_name: 'Amina',
      last_name: 'Al-Hassan',
      date_of_birth: '1995-03-14',
      place_of_birth: 'حلب',
      nationality: 'Síria',
      preferred_language: 'ar',
      document_type: 'nie',
      document_number: 'X1234567L',
      phone: '+34600111222',
      address: 'Carrer Major 1',
      city: 'Vic',
      postal_code: '08500',
      reference_entity: 'Creu Roja Osona',
      reference_contact_name: null,
      has_dependents: false,
      num_dependents: 0,
      clothing_size: 'M',
      shoe_size: '38',
      media_consent: false,
    });
  });

  test('carries NO key the participant is not allowed to change', () => {
    const parsed = profileEditSchema.parse(validEdit);
    const payload = buildUpdateOwnProfilePayload(parsed) as Record<string, unknown>;
    for (const forbidden of ['role', 'org_id', 'terms_accepted_at', 'is_active', 'id']) {
      expect(payload).not.toHaveProperty(forbidden);
    }
  });
});

describe('profileFromRow', () => {
  const row: ProfileRow = {
    id: '5eed0000-0000-4000-8000-000000000001',
    first_name: 'Amina',
    last_name: 'Al-Hassan',
    date_of_birth: '1995-03-14',
    place_of_birth: 'حلب',
    nationality: 'Síria',
    preferred_language: 'ar',
    document_type: 'nie',
    document_number: 'X1234567L',
    phone: '+34600111222',
    address: 'Carrer Major 1',
    city: 'Vic',
    postal_code: '08500',
    reference_entity: 'Creu Roja Osona',
    reference_contact_name: null,
    has_dependents: false,
    num_dependents: 0,
    clothing_size: 'M',
    shoe_size: '38',
    avatar_url: null,
    media_consent: false,
    terms_accepted_at: '2026-07-31T10:00:00Z',
  };

  test('turns a decrypted row into a form the edit schema accepts', () => {
    const form = profileFromRow(row);
    expect(profileEditSchema.safeParse(form).success).toBe(true);
    expect(form.placeOfBirth).toBe('حلب');
  });

  test('a row whose optional fields are null still parses, rather than blocking the edit', () => {
    const sparse: ProfileRow = {
      ...row,
      document_type: 'none',
      document_number: null,
      phone: null,
      address: null,
      city: null,
      postal_code: null,
      reference_entity: null,
      clothing_size: null,
      shoe_size: null,
    };
    expect(profileEditSchema.safeParse(profileFromRow(sparse)).success).toBe(true);
  });
});
