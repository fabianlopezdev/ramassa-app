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
  fitxaSections,
  missingLevel,
  planQuestionsByField,
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

function answer(questionId: string, seasonName: string | null): ParticipantCustomAnswer {
  return {
    questionId,
    seasonId: seasonName === null ? null : `season-${seasonName}`,
    seasonName,
    value: 'x',
    source: 'staff',
    answeredAt: '2026-10-20T10:00:00Z',
    answeredByName: 'Marta Puig',
  };
}

test("sections keep the Fitxa's order; an archived field shows only with her answer", () => {
  const sections = fitxaSections(layout, new Set(['old']));
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
