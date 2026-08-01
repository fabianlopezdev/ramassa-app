/**
 * Onboarding step schemas (RAPP-21), written BEFORE the implementation.
 *
 * What matters here and why:
 * - Names must accept ANY script. The roster is Arabic, Farsi and Cyrillic
 *   before it is Latin, and a "letters only" regex would reject the very people
 *   the app exists for.
 * - `none` is a first-class document answer that must never require a number.
 * - The conditional rules (NIE format only when type is nie, dependents count
 *   only when there are dependents) live in the schema, not in screen code, so
 *   the server re-validation enforces exactly what the form promised.
 * - The RPC payload mapper is tested against the SQL contract's snake_case
 *   keys, because a silently dropped field here becomes a NULL column and no
 *   type checker crosses the SQL boundary.
 */

import { describe, expect, test } from 'bun:test';
import {
  buildCompleteOnboardingPayload,
  documentationStepSchema,
  identityStepSchema,
  logisticsStepSchema,
  termsStepSchema,
} from './onboarding';

const YEARS_16_AGO = new Date(Date.now() - 16.5 * 365.25 * 24 * 3600 * 1000)
  .toISOString()
  .slice(0, 10);
const YEARS_15_AGO = new Date(Date.now() - 15 * 365.25 * 24 * 3600 * 1000)
  .toISOString()
  .slice(0, 10);

const validIdentity = {
  firstName: 'أمينة',
  lastName: 'الحسن',
  dateOfBirth: '1995-03-14',
  placeOfBirth: 'حلب',
  nationality: 'Síria',
  preferredLanguage: 'ar',
};

describe('identityStepSchema', () => {
  test('accepts a valid Arabic-script identity', () => {
    const parsed = identityStepSchema.parse(validIdentity);
    expect(parsed.firstName).toBe('أمينة');
    expect(parsed.preferredLanguage).toBe('ar');
  });

  test('accepts Cyrillic and Farsi names too', () => {
    expect(
      identityStepSchema.safeParse({ ...validIdentity, firstName: 'Оксана', lastName: 'Ковальчук' })
        .success,
    ).toBe(true);
    expect(
      identityStepSchema.safeParse({ ...validIdentity, firstName: 'زهرا', lastName: 'رضایی' })
        .success,
    ).toBe(true);
  });

  test('place of birth is REQUIRED (Fabian, 2026-07-31): empty fails', () => {
    expect(identityStepSchema.safeParse({ ...validIdentity, placeOfBirth: '' }).success).toBe(
      false,
    );
    expect(identityStepSchema.safeParse({ ...validIdentity, placeOfBirth: '  ' }).success).toBe(
      false,
    );
  });

  test('rejects an empty first name and a 101-char name', () => {
    expect(identityStepSchema.safeParse({ ...validIdentity, firstName: '  ' }).success).toBe(false);
    expect(
      identityStepSchema.safeParse({ ...validIdentity, firstName: 'x'.repeat(101) }).success,
    ).toBe(false);
  });

  test('age gate: 16 passes, 15 fails (program constraint, staff-assisted below)', () => {
    expect(
      identityStepSchema.safeParse({ ...validIdentity, dateOfBirth: YEARS_16_AGO }).success,
    ).toBe(true);
    expect(
      identityStepSchema.safeParse({ ...validIdentity, dateOfBirth: YEARS_15_AGO }).success,
    ).toBe(false);
  });

  test('rejects a language outside the five', () => {
    expect(
      identityStepSchema.safeParse({ ...validIdentity, preferredLanguage: 'fr' }).success,
    ).toBe(false);
  });
});

describe('documentationStepSchema', () => {
  test('none needs no number: the answer is complete by itself', () => {
    const parsed = documentationStepSchema.parse({ documentType: 'none' });
    expect(parsed.documentNumber).toBeUndefined();
  });

  test('nie enforces letter + 7 digits + letter, and uppercases it', () => {
    const parsed = documentationStepSchema.parse({
      documentType: 'nie',
      documentNumber: 'x1234567l',
    });
    expect(parsed.documentNumber).toBe('X1234567L');
    expect(
      documentationStepSchema.safeParse({ documentType: 'nie', documentNumber: '12345678' })
        .success,
    ).toBe(false);
  });

  test('passport and other require a number but not the NIE shape', () => {
    expect(
      documentationStepSchema.safeParse({ documentType: 'passport', documentNumber: 'P-994412' })
        .success,
    ).toBe(true);
    expect(documentationStepSchema.safeParse({ documentType: 'passport' }).success).toBe(false);
    expect(
      documentationStepSchema.safeParse({ documentType: 'other', documentNumber: '' }).success,
    ).toBe(false);
  });
});

const validLogistics = {
  phone: '+34 600 111 222',
  address: 'Carrer Major 1, 2n',
  city: 'Vic',
  postalCode: '08500',
  referenceEntity: 'Creu Roja Osona',
  referenceContactName: 'Sílvia Bosch',
  hasDependents: true,
  numDependents: 2,
  clothingSize: 'M',
  shoeSize: '38',
};

describe('logisticsStepSchema', () => {
  test('accepts the full valid case and normalizes the phone to E.164', () => {
    const parsed = logisticsStepSchema.parse(validLogistics);
    expect(parsed.phone).toBe('+34600111222');
  });

  test('phone, address, city and postal code are all optional (some players have none)', () => {
    const parsed = logisticsStepSchema.parse({
      referenceEntity: null,
      hasDependents: false,
      clothingSize: 'S',
      shoeSize: '36',
    });
    expect(parsed.phone).toBeUndefined();
    expect(parsed.referenceEntity).toBeNull();
    expect(parsed.numDependents).toBe(0);
  });

  test('a malformed phone or postal code fails when provided', () => {
    expect(logisticsStepSchema.safeParse({ ...validLogistics, phone: 'call me' }).success).toBe(
      false,
    );
    expect(logisticsStepSchema.safeParse({ ...validLogistics, postalCode: '850' }).success).toBe(
      false,
    );
  });

  test('dependents: count is required with, and forced to 0 without', () => {
    expect(
      logisticsStepSchema.safeParse({ ...validLogistics, hasDependents: true, numDependents: 0 })
        .success,
    ).toBe(false);
    expect(
      logisticsStepSchema.safeParse({ ...validLogistics, hasDependents: true, numDependents: 16 })
        .success,
    ).toBe(false);
    const parsed = logisticsStepSchema.parse({
      ...validLogistics,
      hasDependents: false,
      numDependents: 7,
    });
    expect(parsed.numDependents).toBe(0);
  });

  test('sizes come from the fixed lists (equipment orders aggregate on them)', () => {
    expect(logisticsStepSchema.safeParse({ ...validLogistics, clothingSize: 'XM' }).success).toBe(
      false,
    );
    expect(logisticsStepSchema.safeParse({ ...validLogistics, shoeSize: '33' }).success).toBe(
      false,
    );
    expect(logisticsStepSchema.safeParse({ ...validLogistics, shoeSize: '46' }).success).toBe(true);
  });
});

describe('termsStepSchema', () => {
  test('acceptance must be literally true; media consent stays separate and optional', () => {
    const parsed = termsStepSchema.parse({ termsAccepted: true });
    expect(parsed.mediaConsent).toBe(false);
    expect(termsStepSchema.safeParse({ termsAccepted: false }).success).toBe(false);
    expect(termsStepSchema.safeParse({}).success).toBe(false);
  });
});

describe('buildCompleteOnboardingPayload', () => {
  test('maps every field to the exact snake_case keys the SQL contract reads', () => {
    const payload = buildCompleteOnboardingPayload(
      {
        identity: identityStepSchema.parse(validIdentity),
        documentation: documentationStepSchema.parse({
          documentType: 'nie',
          documentNumber: 'X1234567L',
        }),
        logistics: logisticsStepSchema.parse(validLogistics),
        terms: termsStepSchema.parse({ termsAccepted: true, mediaConsent: true }),
      },
      { termsVersion: '2026-07-01', localeShown: 'ar' },
    );

    expect(payload).toEqual({
      first_name: 'أمينة',
      last_name: 'الحسن',
      date_of_birth: '1995-03-14',
      place_of_birth: 'حلب',
      nationality: 'Síria',
      preferred_language: 'ar',
      document_type: 'nie',
      document_number: 'X1234567L',
      phone: '+34600111222',
      address: 'Carrer Major 1, 2n',
      city: 'Vic',
      postal_code: '08500',
      reference_entity: 'Creu Roja Osona',
      reference_contact_name: 'Sílvia Bosch',
      has_dependents: true,
      num_dependents: 2,
      clothing_size: 'M',
      shoe_size: '38',
      media_consent: true,
      terms_version: '2026-07-01',
      locale_shown: 'ar',
    });
  });

  test('a no-document, no-contact, no-entity completion produces a payload the RPC accepts', () => {
    const payload = buildCompleteOnboardingPayload(
      {
        identity: identityStepSchema.parse(validIdentity),
        documentation: documentationStepSchema.parse({ documentType: 'none' }),
        logistics: logisticsStepSchema.parse({
          referenceEntity: null,
          hasDependents: false,
          clothingSize: 'L',
          shoeSize: '40',
        }),
        terms: termsStepSchema.parse({ termsAccepted: true }),
      },
      { termsVersion: '2026-07-01', localeShown: 'ca' },
    );

    expect(payload.document_type).toBe('none');
    expect(payload.document_number).toBeNull();
    expect(payload.phone).toBeNull();
    expect(payload.reference_entity).toBeNull();
    expect(payload.media_consent).toBe(false);
  });
});
