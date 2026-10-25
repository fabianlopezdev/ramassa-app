/**
 * Every field kind the app uses, as a builder question type (RAPP-610): the
 * settings staff give each type, the one answer schema the phone, the admin
 * and the database share, how an answer reads, and the scenario tool's sample.
 */
import { describe, expect, test } from 'bun:test';
import {
  answerText,
  customAnswerError,
  isEmptyAnswer,
  profileFieldDraftSchema,
  type CustomQuestion,
} from './builder';
import {
  CUSTOM_ANSWER_FILE_FOLDER,
  CUSTOM_QUESTION_TYPES,
  customAnswerSchema,
  internationalPhone,
  isOptionType,
  normalizeCustomAnswerInput,
  parseQuestionSettings,
  questionSettingsSchema,
  sampleCustomAnswer,
  uploadsAvailable,
} from './question-types';

const ORG = '5eed0000-0000-4000-8000-000000000000';
const HER = '5eed0000-0000-4000-8000-000000000096';
const OPTION_A = '5eed0000-0000-4000-8046-00000000000a';
const OPTION_B = '5eed0000-0000-4000-8046-00000000000b';
const ARCHIVED = '5eed0000-0000-4000-8046-00000000000c';

function question(
  type: CustomQuestion['type'],
  settings: CustomQuestion['settings'] = {},
): CustomQuestion {
  return {
    id: '5eed0000-0000-4000-8045-0000000000aa',
    type,
    label: { ca: 'Pregunta' },
    help: null,
    privacy: 'personal',
    isArchived: false,
    settings,
    options: isOptionType(type)
      ? [
          { id: OPTION_A, label: { ca: 'Primera' }, isArchived: false },
          { id: OPTION_B, label: { ca: 'Segona' }, isArchived: false },
          { id: ARCHIVED, label: { ca: 'Antiga' }, isArchived: true },
        ]
      : [],
  };
}

const isoDaysAgo = (years: number, days = 0) => {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
};

const fileKey = `${ORG}/${CUSTOM_ANSWER_FILE_FOLDER}/${HER}/2026/10/${'a'.repeat(32)}.pdf`;
const strokes: [number, number][][] = [
  [
    [10, 20],
    [30, 40],
  ],
];

describe('the types', () => {
  test('the builder offers every field kind the app uses, the five first ones unchanged', () => {
    expect(CUSTOM_QUESTION_TYPES).toEqual([
      'short_text',
      'long_text',
      'yes_no_maybe',
      'single_choice',
      'multiple_choice',
      'number',
      'date',
      'yes_no',
      'phone',
      'email',
      'search_choice',
      'item_list',
      'consent',
      'file_upload',
      'signature',
      'country',
      'municipality',
    ]);
  });

  test('a file question warns staff when this app has no upload service', () => {
    expect(uploadsAvailable(undefined)).toBe(false);
    expect(uploadsAvailable('')).toBe(false);
    expect(uploadsAvailable('https://media.example.test')).toBe(true);
  });
});

describe('settings per type', () => {
  test('a number is whole or decimal, with an optional range in order', () => {
    expect(questionSettingsSchema('number').safeParse({ integer: true }).success).toBe(true);
    expect(
      questionSettingsSchema('number').safeParse({ integer: false, min: 0.5, max: 10 }).success,
    ).toBe(true);
    expect(
      questionSettingsSchema('number').safeParse({ integer: true, min: 5, max: 1 }).success,
    ).toBe(false);
    expect(questionSettingsSchema('number').safeParse({}).success).toBe(false);
  });

  test('a date may set an age range in whole years', () => {
    expect(questionSettingsSchema('date').safeParse({}).success).toBe(true);
    expect(questionSettingsSchema('date').safeParse({ min_age: 16, max_age: 99 }).success).toBe(
      true,
    );
    expect(questionSettingsSchema('date').safeParse({ min_age: 30, max_age: 20 }).success).toBe(
      false,
    );
    expect(questionSettingsSchema('date').safeParse({ min_age: 1.5 }).success).toBe(false);
  });

  test('a list caps its items; a consent has its own Catalan text; a file what it accepts', () => {
    expect(questionSettingsSchema('item_list').safeParse({ max_items: 10 }).success).toBe(true);
    expect(questionSettingsSchema('item_list').safeParse({ max_items: 0 }).success).toBe(false);
    expect(
      questionSettingsSchema('consent').safeParse({ text: { ca: 'Accepto', en: 'I agree' } })
        .success,
    ).toBe(true);
    expect(questionSettingsSchema('consent').safeParse({ text: { en: 'I agree' } }).success).toBe(
      false,
    );
    expect(questionSettingsSchema('file_upload').safeParse({ accept: 'photo' }).success).toBe(true);
    expect(questionSettingsSchema('file_upload').safeParse({ accept: 'video' }).success).toBe(
      false,
    );
  });

  test('types without settings take none', () => {
    expect(questionSettingsSchema('email').safeParse({}).success).toBe(true);
    expect(questionSettingsSchema('email').safeParse({ min: 1 }).success).toBe(false);
  });

  test('settings the app cannot read fall back to the safe defaults', () => {
    expect(parseQuestionSettings('number', { integer: 'yes' })).toEqual({ integer: false });
    expect(parseQuestionSettings('file_upload', null)).toEqual({ accept: 'document' });
    expect(parseQuestionSettings('item_list', {})).toEqual({ max_items: 20 });
  });

  test('the draft schema checks the settings of the type', () => {
    const base = { label: { ca: 'Pregunta' }, options: [] };
    expect(
      profileFieldDraftSchema.safeParse({ ...base, type: 'number', settings: { integer: true } })
        .success,
    ).toBe(true);
    expect(
      profileFieldDraftSchema.safeParse({ ...base, type: 'number', settings: { min: 'a' } })
        .success,
    ).toBe(false);
    expect(
      profileFieldDraftSchema.safeParse({
        ...base,
        type: 'search_choice',
        settings: {},
        options: [{ id: null, label: { ca: 'A' } }],
      }).success,
    ).toBe(false);
  });
});

describe('one answer schema per type', () => {
  const cases: readonly [string, CustomQuestion, unknown, boolean][] = [
    ['a whole number', question('number', { integer: true, min: 0, max: 15 }), 3, true],
    ['a decimal where whole is asked', question('number', { integer: true }), 2.5, false],
    ['a decimal', question('number', { integer: false }), 2.5, true],
    ['below the minimum', question('number', { integer: true, min: 1 }), 0, false],
    ['above the maximum', question('number', { integer: false, max: 10 }), 10.5, false],
    ['a number as text', question('number', { integer: false }), '3', false],
    ['a calendar date', question('date'), '2001-02-28', true],
    ['an impossible date', question('date'), '2001-02-30', false],
    ['a date in another shape', question('date'), '28/02/2001', false],
    ['old enough', question('date', { min_age: 16 }), isoDaysAgo(16, 1), true],
    ['too young', question('date', { min_age: 16 }), isoDaysAgo(15), false],
    ['too old', question('date', { max_age: 30 }), isoDaysAgo(31, 1), false],
    ['yes', question('yes_no'), 'yes', true],
    ['maybe is not a yes or no', question('yes_no'), 'maybe', false],
    ['an international phone', question('phone'), '+34600111222', true],
    ['a phone without its country', question('phone'), '600111222', false],
    ['an email', question('email'), 'ana@example.org', true],
    ['an email without a domain', question('email'), 'ana@example', false],
    ['an email with a space', question('email'), 'an a@example.org', false],
    ['a listed choice', question('search_choice'), OPTION_B, true],
    ['an archived choice', question('search_choice'), ARCHIVED, false],
    ['a list', question('item_list', { max_items: 3 }), ['Creu Roja', 'Càritas'], true],
    ['a list with a repeated item', question('item_list', { max_items: 3 }), ['A', 'A'], false],
    ['a list too long', question('item_list', { max_items: 1 }), ['A', 'B'], false],
    ['an empty item', question('item_list', { max_items: 3 }), ['A', ' '], false],
    ['a ticked consent', question('consent', { text: { ca: 'Accepto' } }), true, true],
    ['an unticked consent', question('consent', { text: { ca: 'Accepto' } }), false, false],
    [
      'her file',
      question('file_upload', { accept: 'document' }),
      { key: fileKey, name: 'informe.pdf', content_type: 'application/pdf', size: 2048 },
      true,
    ],
    [
      'a PDF where a photo is asked',
      question('file_upload', { accept: 'photo' }),
      { key: fileKey, name: 'informe.pdf', content_type: 'application/pdf', size: 2048 },
      false,
    ],
    [
      'a file stored elsewhere',
      question('file_upload', { accept: 'document' }),
      {
        key: fileKey.replace(CUSTOM_ANSWER_FILE_FOLDER, 'gallery'),
        name: 'a.pdf',
        content_type: 'application/pdf',
        size: 1,
      },
      false,
    ],
    ['a country by its canonical name', question('country'), 'Síria', true],
    ['a country in another language', question('country'), 'Syria', false],
    ['a municipality of Catalonia', question('municipality'), 'Vic', true],
    ['a place that is not a municipality', question('municipality'), 'Madrid', false],
    ['a drawn signature', question('signature'), strokes, true],
    ['a signature off the pad', question('signature'), [[[10, 2000]]], false],
  ];
  for (const [name, asked, value, valid] of cases) {
    test(`${name}: ${valid ? 'accepted' : 'refused'}`, () => {
      expect(customAnswerSchema(asked).safeParse(value).success).toBe(valid);
      // An empty value (an unticked consent) clears the answer instead.
      expect(customAnswerError(asked, value as never)).toBe(
        valid || isEmptyAnswer(value as never) ? null : 'invalid',
      );
    });
  }

  test('a phone, an email and a list are tidied before they are checked', () => {
    expect(normalizeCustomAnswerInput(question('phone'), '+34 600 11-12-22')).toBe('+34600111222');
    expect(normalizeCustomAnswerInput(question('email'), '  Ana@Example.ORG ')).toBe(
      'ana@example.org',
    );
    expect(normalizeCustomAnswerInput(question('item_list'), [' Creu Roja ', 'Càritas'])).toEqual([
      'Creu Roja',
      'Càritas',
    ]);
  });

  test('an unticked consent, no file and no signature are empty answers', () => {
    expect(isEmptyAnswer(false)).toBe(true);
    expect(isEmptyAnswer(true)).toBe(false);
    expect(isEmptyAnswer(0)).toBe(false);
  });
});

describe('each answer reads well', () => {
  const words = {
    yes: 'Sí',
    no: 'No',
    maybe: 'Potser',
    archived: 'arxivada',
    signed: 'Signat',
  };
  test('dates, numbers and lists in her language; consent with its time', () => {
    expect(answerText(question('date'), '2001-02-28', 'ca', words)).toBe('28/2/2001');
    expect(answerText(question('number', { integer: false }), 1234.5, 'ca', words)).toBe('1234,5');
    expect(answerText(question('item_list', { max_items: 5 }), ['A', 'B'], 'ca', words)).toBe(
      'A, B',
    );
    expect(answerText(question('yes_no'), 'no', 'ca', words)).toBe('No');
    expect(answerText(question('search_choice'), OPTION_A, 'ca', words)).toBe('Primera');
    expect(
      answerText(question('consent', { text: { ca: 'Accepto' } }), true, 'ca', words, {
        answeredAt: '2026-10-21T08:30:00Z',
      }),
    ).toMatch(/^Sí \(21\/10\/26,? 10:30\)$/);
  });

  test('a signature says signed and a file its name; neither shows its raw data', () => {
    expect(answerText(question('signature'), strokes, 'en', words)).toBe('Signat');
    expect(
      answerText(
        question('file_upload', { accept: 'document' }),
        { key: fileKey, name: 'informe.pdf', content_type: 'application/pdf', size: 1 },
        'en',
        words,
      ),
    ).toBe('informe.pdf');
  });
});

describe('the scenario tool fills every type with a valid sample', () => {
  for (const type of CUSTOM_QUESTION_TYPES) {
    test(type, () => {
      const settings =
        type === 'number'
          ? { integer: true, min: 2, max: 4 }
          : type === 'date'
            ? { min_age: 18, max_age: 40 }
            : type === 'item_list'
              ? { max_items: 1 }
              : type === 'consent'
                ? { text: { ca: 'Accepto' } }
                : type === 'file_upload'
                  ? { accept: 'photo' }
                  : {};
      const asked = question(type, settings as CustomQuestion['settings']);
      const sample = sampleCustomAnswer(asked, 'ar', { orgId: ORG, profileId: HER });
      expect(customAnswerError(asked, sample)).toBeNull();
    });
  }
});

test('a phone takes its international form: +34 before a local Spanish number (RAPP-663)', () => {
  expect(internationalPhone('612 345 678')).toBe('+34612345678');
  expect(internationalPhone('93-000-54-99')).toBe('+34930005499');
  expect(internationalPhone('0034 612 345 678')).toBe('+34612345678');
  expect(internationalPhone('+212 6 12 34 56 78')).toBe('+212612345678');
  // Not a Spanish number: left as typed, for the check to refuse.
  expect(internationalPhone('12345')).toBe('12345');
});
