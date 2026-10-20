/**
 * The wizard's form-side schemas (RAPP-21): the date composition and the
 * string-to-number seams, which are exactly the places a form silently mangles
 * data. The shared step schemas have their own suite; these tests only cover
 * what THIS module adds on top.
 */

import { describe, expect, setSystemTime, test } from 'bun:test';
import {
  composeIsoBirthDate,
  identityFormSchema,
  identityNameFormSchema,
  logisticsFormSchema,
} from './onboarding-form';

const identityBase = {
  firstName: 'أمينة',
  lastName: 'الحسن',
  placeOfBirth: 'حلب',
  nationality: 'Síria',
  preferredLanguage: 'ar' as const,
};

describe('identityNameFormSchema', () => {
  test('the welcome step accepts names without asking the background questions', () => {
    expect(
      identityNameFormSchema.parse({
        firstName: 'أمينة',
        lastName: 'الحسن',
      }),
    ).toEqual({
      firstName: 'أمينة',
      lastName: 'الحسن',
    });
  });
});

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

  test('impossible day and month values identify their own fields', () => {
    const result = identityFormSchema.safeParse({
      ...identityBase,
      day: '99',
      month: '99',
      year: '1995',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'day')).toBe(true);
      expect(result.error.issues.some((issue) => issue.path[0] === 'month')).toBe(true);
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

describe('birth date field feedback', () => {
  test.each([
    ['90', '1', '1995', 'day', 'invalid date'],
    ['1', '13', '1995', 'month', 'invalid date'],
    ['1', '1', '1666', 'year', 'too old'],
    ['31', '4', '1995', 'day', 'day not in month'],
    ['29', '2', '1995', 'day', 'day not in month'],
    ['', '1', '1995', 'day', 'required'],
    ['1', '', '1995', 'month', 'required'],
    ['1', '1', '', 'year', 'required'],
    ['1', '1', '95', 'year', 'invalid date'],
  ])('rejects %s/%s/%s with actionable field feedback', (day, month, year, path, message) => {
    const result = identityFormSchema.safeParse({ ...identityBase, day, month, year });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: [path], message }),
      );
    }
  });
});

test('independent day, month and year mistakes are all identified', () => {
  const result = identityFormSchema.safeParse({
    ...identityBase,
    day: '90',
    month: '13',
    year: '1666',
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    for (const path of ['day', 'month', 'year']) {
      expect(result.error.issues.some((issue) => issue.path[0] === path)).toBe(true);
    }
  }
});

test('a wrong month never incorrectly marks a valid day or year', () => {
  const result = identityFormSchema.safeParse({
    ...identityBase,
    day: '12',
    month: '13',
    year: '1995',
  });
  expect(result.success).toBe(false);
  if (!result.success) expect(result.error.issues.map((issue) => issue.path)).toEqual([['month']]);
});

test('a future date identifies the first part that makes it future', () => {
  setSystemTime(new Date('2026-10-20T12:00:00Z'));
  try {
    for (const [day, month, year, field] of [
      ['1', '1', '2027', 'year'],
      ['1', '11', '2026', 'month'],
      ['21', '10', '2026', 'day'],
    ]) {
      const result = identityFormSchema.safeParse({ ...identityBase, day, month, year });
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues).toContainEqual(
          expect.objectContaining({ path: [field], message: 'future date' }),
        );
    }
  } finally {
    setSystemTime();
  }
});
