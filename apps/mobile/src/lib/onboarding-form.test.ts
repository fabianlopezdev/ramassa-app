/**
 * The wizard's form-side schemas (RAPP-21): the date composition and the
 * string-to-number seams, which are exactly the places a form silently mangles
 * data. The shared step schemas have their own suite; these tests only cover
 * what THIS module adds on top.
 */

import { describe, expect, test } from 'bun:test';
import { composeIsoBirthDate, identityFormSchema, logisticsFormSchema } from './onboarding-form';

const identityBase = {
  firstName: 'أمينة',
  lastName: 'الحسن',
  nationality: 'Síria',
  preferredLanguage: 'ar' as const,
};

describe('identityFormSchema', () => {
  test('composes single-digit day and month into a valid ISO date', () => {
    expect(composeIsoBirthDate('4', '3', '1995')).toBe('1995-03-04');
    const parsed = identityFormSchema.parse({
      ...identityBase,
      day: '4',
      month: '3',
      year: '1995',
    });
    expect(parsed.dateOfBirth).toBe('1995-03-04');
  });

  test('an impossible date fails on the year field, not somewhere invisible', () => {
    const result = identityFormSchema.safeParse({
      ...identityBase,
      day: '99',
      month: '99',
      year: '1995',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'year')).toBe(true);
    }
  });

  test('the shared age gate applies through the pipe', () => {
    const thisYear = new Date().getUTCFullYear();
    const result = identityFormSchema.safeParse({
      ...identityBase,
      day: '01',
      month: '01',
      year: String(thisYear - 10),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === 'too young')).toBe(true);
    }
  });
});

describe('logisticsFormSchema', () => {
  test('a TextInput count string becomes the number the shared schema judges', () => {
    const parsed = logisticsFormSchema.parse({
      referenceEntity: 'Creu Roja Osona',
      hasDependents: true,
      numDependents: '2',
      clothingSize: 'M',
      shoeSize: '38',
    });
    expect(parsed.numDependents).toBe(2);
  });

  test('an empty entity string reads as the explicit None, matching the chip', () => {
    const parsed = logisticsFormSchema.parse({
      referenceEntity: '',
      hasDependents: false,
      clothingSize: 'S',
      shoeSize: '36',
    });
    expect(parsed.referenceEntity).toBeNull();
  });

  test('a non-numeric count fails instead of becoming NaN dependents', () => {
    const result = logisticsFormSchema.safeParse({
      referenceEntity: null,
      hasDependents: true,
      numDependents: 'two',
      clothingSize: 'M',
      shoeSize: '38',
    });
    expect(result.success).toBe(false);
  });
});
