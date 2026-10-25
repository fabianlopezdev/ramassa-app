/**
 * Her page on the Fitxa layout (RAPP-653): the Fitxa's order, an archived
 * field only while it holds her answer, the current answer apart from the
 * older seasons, the level a reader lacks, and her plan's choice by field.
 */
import { expect, test } from 'bun:test';
import type {
  ParticipantCustomAnswer,
  PlanQuestion,
  PlayerPlan,
  ProfileField,
  ProfileLayout,
} from '@ramassa/shared/intake-builder';
import type { PermissionCode } from '@ramassa/shared/permissions';
import {
  answersByField,
  fieldsEditedWith,
  fitxaSections,
  missingLevel,
  planQuestionsByField,
  seasonAnswersLines,
} from './participant-fitxa';

function field(id: string, sectionId: string, overrides: Partial<ProfileField> = {}): ProfileField {
  return {
    id,
    sectionId,
    kind: 'custom',
    builtinKey: null,
    type: 'short_text',
    label: { ca: id },
    help: null,
    privacy: 'normal',
    defaultRequired: false,
    settings: {},
    sortOrder: 0,
    isArchived: false,
    createdAt: '2026-10-23T10:00:00Z',
    createdBy: null,
    createdByName: null,
    hasAnswers: null,
    options: [],
    ...overrides,
  };
}

const layout: ProfileLayout = {
  sections: [
    { id: 's1', key: 'identity', title: { ca: 'Identitat' }, isBuiltin: true },
    { id: 's2', key: 'sizes', title: { ca: 'Talles' }, isBuiltin: true },
    { id: 's3', key: 'support', title: { ca: 'Suport' }, isBuiltin: true },
  ],
  fields: [
    field('first', 's1', { kind: 'builtin', builtinKey: 'first_name' }),
    field('gloves', 's2'),
    field('old', 's2', { isArchived: true }),
    field('gone', 's3', { isArchived: true }),
  ],
  placements: [],
};

function answer(
  questionId: string,
  seasonName: string | null,
  value: ParticipantCustomAnswer['value'] = 'x',
): ParticipantCustomAnswer {
  return {
    questionId,
    seasonId: seasonName === null ? null : `season-${seasonName}`,
    seasonName,
    value,
    source: 'staff',
    answeredAt: '2026-10-20T10:00:00Z',
    answeredByName: 'Marta Puig',
  };
}

test("sections keep the Fitxa's order; an archived field shows only with her answer", () => {
  const sections = fitxaSections(layout, answersByField([answer('old', null)]));
  expect(sections.map((entry) => entry.section.key)).toEqual(['identity', 'sizes']);
  expect(sections[1]?.fields.map((each) => each.id)).toEqual(['gloves', 'old']);
});

test('the first row of a field is current, the older seasons follow', () => {
  const byField = answersByField([
    answer('gloves', '2026/27'),
    answer('gloves', '2025/26'),
    answer('first', null),
  ]);
  expect(byField.get('gloves')?.current.seasonName).toBe('2026/27');
  expect(byField.get('gloves')?.older.map((row) => row.seasonName)).toEqual(['2025/26']);
  expect(byField.get('first')?.older).toEqual([]);
});

test('a field above the reader names the level she lacks', () => {
  const sees = (codes: readonly PermissionCode[]) => (code: PermissionCode) => codes.includes(code);
  const personalOnly = sees(['participants.view', 'participants.view_personal']);
  expect(missingLevel({ privacy: 'normal' }, sees([]))).toBeNull();
  expect(missingLevel({ privacy: 'personal' }, personalOnly)).toBeNull();
  expect(missingLevel({ privacy: 'sensitive' }, personalOnly)).toBe('sensitive');
  expect(missingLevel({ privacy: 'personal' }, sees(['participants.view']))).toBe('personal');
});

test('her plan gives a choice to the fields her onboarding asks, and none to the rest', () => {
  const question = (key: string): PlanQuestion =>
    ({
      kind: key === 'first_name' ? 'builtin' : 'custom',
      key,
      question: key,
      state: 'auto',
      asking: 'asked',
      isAnswered: false,
      isRequired: false,
      canSkip: true,
    }) as unknown as PlanQuestion;
  const plan = {
    screens: [{ questions: [question('first_name'), question('gloves')] }],
    askedCount: 2,
    total: 2,
  } as unknown as PlayerPlan;
  const byField = planQuestionsByField(plan, layout.fields);
  expect([...byField.keys()]).toEqual(['first', 'gloves']);
});

// One field model on her page (RAPP-664) ---------------------------------------------------------

const documents: ProfileLayout = {
  sections: [{ id: 's1', key: 'documentation', title: { ca: 'Documentació' }, isBuiltin: true }],
  fields: [
    field('type', 's1', {
      kind: 'builtin',
      systemKey: 'document_type',
      builtinKey: 'document',
      type: 'single_choice',
      options: [
        { id: 'nie', key: 'nie', label: { ca: 'NIE' }, isArchived: false },
        { id: 'other', key: 'other', label: { ca: 'Un altre' }, isArchived: false },
        { id: 'none', key: 'none', label: { ca: 'Cap' }, isArchived: false },
      ],
    }),
    field('number', 's1', { kind: 'builtin', systemKey: 'document_number', privacy: 'sensitive' }),
    field('name', 's1', {
      kind: 'builtin',
      systemKey: 'document_name',
      showWhen: { fieldId: 'type', optionId: 'other' },
    }),
    field('kids', 's1', { type: 'yes_no', label: { ca: 'Fills' } }),
  ],
  placements: [],
};

test('a field shown on one answer shows only when that answer holds, or while it holds hers', () => {
  const shown = (rows: readonly ParticipantCustomAnswer[]) =>
    fitxaSections(documents, answersByField(rows))[0]?.fields.map((each) => each.id);
  expect(shown([answer('type', null, 'nie')])).toEqual(['type', 'number', 'kids']);
  expect(shown([answer('type', null, 'other')])).toEqual(['type', 'number', 'name', 'kids']);
  expect(shown([answer('name', null, 'Carta')])).toEqual(['type', 'number', 'name', 'kids']);
});

test('one editor changes a field with its detail and the document number with its type', () => {
  const type = documents.fields[0]!;
  const partners = fieldsEditedWith(documents, type);
  expect(partners.map((partner) => partner.field.id)).toEqual(['name', 'number']);
  const asks = (id: string, value: string | null) =>
    partners.find((partner) => partner.field.id === id)?.asksWhen(value);
  expect(asks('name', 'other')).toBe(true);
  expect(asks('name', 'nie')).toBe(false);
  expect(asks('number', 'nie')).toBe(true);
  expect(asks('number', 'none')).toBe(false);
  expect(asks('number', null)).toBe(false);
  expect(fieldsEditedWith(documents, documents.fields[3]!)).toEqual([]);
});

test('her season answers read in words, one line per season, in the Fitxa order', () => {
  const words = { yes: 'Sí', no: 'No', maybe: 'Potser', archived: 'arxivada' };
  const lines = seasonAnswersLines(
    documents,
    [
      answer('kids', '2026/27', 'yes'),
      answer('type', '2026/27', 'nie'),
      answer('type', '2025/26', 'none'),
      answer('number', null, 'X1234567L'),
    ],
    'ca',
    words,
  );
  expect(lines).toEqual([
    { seasonName: '2026/27', text: 'NIE · Fills Sí' },
    { seasonName: '2025/26', text: 'Cap' },
  ]);
});
