/**
 * The wizard's form-side schemas (RAPP-21): the date composition and the
 * string-to-number seams, which are exactly the places a form silently mangles
 * data. The shared step schemas have their own suite; these tests only cover
 * what THIS module adds on top.
 */

import { describe, expect, setSystemTime, test } from 'bun:test';
import {
  composeIsoBirthDate,
  contactFormSchema,
  identityFormSchema,
  identityFormSchemaFor,
  identityNameFormSchema,
  logisticsFormSchema,
  logisticsFormSchemaFor,
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
  test.each([
    ['٤', '٣', '١٩٩٥'],
    ['۴', '۳', '۱۹۹۵'],
    ['4', '۳', '١٩٩٥'],
  ])('accepts localized decimal date parts %s/%s/%s', (day, month, year) => {
    expect(composeIsoBirthDate(day, month, year)).toBe('1995-03-04');
    expect(identityFormSchema.parse({ ...identityBase, day, month, year }).dateOfBirth).toBe(
      '1995-03-04',
    );
  });

  test.each([
    ['٩٠', '١٣', '١٦٦٦'],
    ['۹۰', '۱۳', '۱۶۶۶'],
  ])('keeps strict date ranges for localized digits %s/%s/%s', (day, month, year) => {
    const result = identityFormSchema.safeParse({ ...identityBase, day, month, year });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: ['year'], message: 'too old' }),
      );
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: ['month'], message: 'invalid date' }),
      );
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: ['day'], message: 'invalid date' }),
      );
    }
  });

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
  test.each(['٢', '۲'])('accepts a localized dependent count %s', (numDependents) => {
    const input = {
      referenceEntity: null,
      hasDependents: true,
      numDependents,
      clothingSize: 'M',
      shoeSize: '38',
    };
    expect(logisticsFormSchema.parse(input).numDependents).toBe(2);
    expect(contactFormSchema.parse(input).numDependents).toBe(2);
  });

  test.each(['١٦', '۱۶'])('keeps the dependent count limit for localized %s', (numDependents) => {
    const input = {
      referenceEntity: null,
      hasDependents: true,
      numDependents,
      clothingSize: 'M',
      shoeSize: '38',
    };
    expect(logisticsFormSchema.safeParse(input).success).toBe(false);
    expect(contactFormSchema.safeParse(input).success).toBe(false);
  });

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

  test('the No chip is the explicit None; an empty entity with no choice is no answer (RAPP-611)', () => {
    const answered = logisticsFormSchema.parse({
      referenceEntity: '',
      hasReferenceEntity: false,
      hasDependents: false,
      clothingSize: 'S',
      shoeSize: '36',
    });
    expect(answered.referenceEntity).toBeNull();
    const unanswered = {
      referenceEntity: '',
      hasDependents: false,
      clothingSize: 'S',
      shoeSize: '36',
    };
    // Required by default: refused until she chooses.
    expect(logisticsFormSchema.safeParse(unanswered).success).toBe(false);
    // Made optional by staff: no answer, never "None".
    const optional = logisticsFormSchemaFor(new Set(['first_name', 'last_name']));
    expect(optional.parse(unanswered).referenceEntity).toBeUndefined();
  });

  test('sizes and dependants left out are unknown when staff made them optional (RAPP-611)', () => {
    const optional = logisticsFormSchemaFor(new Set(['first_name', 'last_name']));
    const parsed = optional.parse({ referenceEntity: null });
    expect(parsed.clothingSize).toBeUndefined();
    expect(parsed.shoeSize).toBeUndefined();
    expect(parsed.hasDependents).toBeUndefined();
    expect(parsed.numDependents).toBe(0);
    // A size given is still checked.
    expect(optional.safeParse({ referenceEntity: null, shoeSize: '99' }).success).toBe(false);
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

describe('identity with a required list staff chose (RAPP-611)', () => {
  const namesOnly = identityFormSchemaFor(new Set(['first_name', 'last_name']));

  test('an optional birth date left empty, and an optional place, are no answer', () => {
    const parsed = namesOnly.parse({
      firstName: 'Amina',
      lastName: 'Diallo',
      day: '',
      month: '',
      year: '',
      placeOfBirth: '',
      preferredLanguage: 'ca',
    });
    expect(parsed.dateOfBirth).toBeUndefined();
    expect(parsed.placeOfBirth).toBeUndefined();
    expect(parsed.nationality).toBeUndefined();
  });

  test('a birth date she starts is still checked whole', () => {
    const result = namesOnly.safeParse({
      firstName: 'Amina',
      lastName: 'Diallo',
      day: '4',
      month: '',
      year: '1999',
      preferredLanguage: 'ca',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['month']);
  });

  test('her names stay required whatever the list', () => {
    expect(
      identityFormSchemaFor(new Set()).safeParse({
        firstName: ' ',
        lastName: 'Diallo',
        preferredLanguage: 'ca',
      }).success,
    ).toBe(false);
  });

  test('by default her place of birth is required', () => {
    const result = identityFormSchema.safeParse({
      ...identityBase,
      day: '4',
      month: '3',
      year: '1999',
      placeOfBirth: '',
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.map((issue) => issue.path[0])).toContain('placeOfBirth');
  });
});
