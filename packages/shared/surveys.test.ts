import { expect, test } from 'bun:test';
import {
  aggregateSurveyResults,
  buildSurveyCsv,
  findSurveyResumeIndex,
  isSurveyOpen,
  streamSurveyCsv,
  surveyDefinitionSchema,
  surveyResponseDraftSchema,
  type SurveyQuestion,
  type SurveyResponse,
} from './surveys';

const questions = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    type: 'rating',
    prompt: { ca: 'Valoració', es: 'Valoración', en: 'Rating', ar: 'التقييم', fa: 'امتیاز' },
    options: null,
    required: true,
    sortOrder: 10,
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    type: 'multiple_choice',
    prompt: { ca: 'Tria', es: 'Elige', en: 'Choose', ar: 'اختاري', fa: 'انتخاب کنید' },
    options: [
      {
        id: 'training',
        label: {
          ca: 'Entrenament',
          es: 'Entrenamiento',
          en: 'Training',
          ar: 'التدريب',
          fa: 'تمرین',
        },
      },
      {
        id: 'support',
        label: { ca: 'Suport', es: 'Apoyo', en: 'Support', ar: 'الدعم', fa: 'پشتیبانی' },
      },
    ],
    required: true,
    sortOrder: 20,
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    type: 'yes_no',
    prompt: {
      ca: 'Tornaries?',
      es: '¿Volverías?',
      en: 'Would you return?',
      ar: 'هل ستعودين؟',
      fa: 'بازمی گردید؟',
    },
    options: null,
    required: true,
    sortOrder: 30,
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    type: 'free_text',
    prompt: { ca: 'Comentari', es: 'Comentario', en: 'Comment', ar: 'تعليق', fa: 'نظر' },
    options: null,
    required: false,
    sortOrder: 40,
  },
] as const satisfies readonly SurveyQuestion[];

const responses = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    playerId: '30000000-0000-4000-8000-000000000001',
    playerName: 'Amina',
    language: 'ar',
    answers: {
      [questions[0].id]: 5,
      [questions[1].id]: 'training',
      [questions[2].id]: true,
      [questions[3].id]: 'تجربة ممتازة',
    },
    status: 'completed',
    completedAt: '2026-08-21T10:00:00.000Z',
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    playerId: '30000000-0000-4000-8000-000000000002',
    playerName: 'Núria',
    language: 'ca',
    answers: {
      [questions[0].id]: 3,
      [questions[1].id]: 'support',
      [questions[2].id]: false,
      [questions[3].id]: '=2+2',
    },
    status: 'completed',
    completedAt: '2026-08-21T11:00:00.000Z',
  },
] as const satisfies readonly SurveyResponse[];

test('survey definitions require all five languages and type-correct options', () => {
  const parsed = surveyDefinitionSchema.parse({
    title: { ca: 'Enquesta', es: 'Encuesta', en: 'Survey', ar: 'استبيان', fa: 'نظرسنجی' },
    eventId: null,
    publishedAt: '2026-08-21T09:00:00.000Z',
    closesAt: '2026-08-22T09:00:00.000Z',
    audience: { kind: 'all' },
    questions,
  });
  expect(parsed.questions).toHaveLength(4);
  expect(
    surveyDefinitionSchema.safeParse({ ...parsed, questions: [{ ...questions[1], options: null }] })
      .success,
  ).toBe(false);
  expect(
    surveyDefinitionSchema.safeParse({
      ...parsed,
      title: { ca: 'Enquesta', es: 'Encuesta', en: 'Survey', ar: 'استبيان' },
    }).success,
  ).toBe(false);
  expect(
    surveyDefinitionSchema.safeParse({
      ...parsed,
      questions: [
        {
          ...questions[1],
          options: [questions[1].options[0], questions[1].options[0]],
        },
      ],
    }).success,
  ).toBe(false);
});

test('survey response drafts enforce every answer type and required completion', () => {
  expect(
    surveyResponseDraftSchema(questions).parse({
      answers: responses[0].answers,
      complete: true,
    }).complete,
  ).toBe(true);
  expect(
    surveyResponseDraftSchema(questions).safeParse({
      answers: { [questions[0].id]: 6, [questions[1].id]: 'unknown' },
      complete: true,
    }).success,
  ).toBe(false);
  expect(
    surveyResponseDraftSchema(questions).safeParse({
      answers: { [questions[0].id]: 4 },
      complete: false,
    }).success,
  ).toBe(true);
});

test('aggregates use completed responses and preserve free-text attribution', () => {
  const result = aggregateSurveyResults(questions, [
    ...responses,
    { ...responses[0], id: '20000000-0000-4000-8000-000000000003', status: 'in_progress' },
  ]);
  expect(result.responseCount).toBe(2);
  expect(result.byQuestion[questions[0].id]).toEqual({
    type: 'rating',
    average: 4,
    counts: { '1': 0, '2': 0, '3': 1, '4': 0, '5': 1 },
  });
  expect(result.byQuestion[questions[1].id]).toEqual({
    type: 'multiple_choice',
    counts: { support: 1, training: 1 },
  });
  expect(result.byQuestion[questions[2].id]).toEqual({
    type: 'yes_no',
    yes: 1,
    no: 1,
  });
  expect(result.byQuestion[questions[3].id]).toEqual({
    type: 'free_text',
    answers: [
      { playerId: responses[0].playerId, playerName: 'Amina', value: 'تجربة ممتازة' },
      { playerId: responses[1].playerId, playerName: 'Núria', value: '=2+2' },
    ],
  });
});

test('resume chooses the first unanswered required question and completion ends the flow', () => {
  expect(findSurveyResumeIndex(questions, { [questions[0].id]: 4 })).toBe(1);
  expect(findSurveyResumeIndex(questions, responses[0].answers)).toBe(4);
});

test('survey windows enforce publication and closing instants', () => {
  const now = new Date('2026-08-21T12:00:00.000Z');
  expect(isSurveyOpen('2026-08-21T11:00:00.000Z', '2026-08-21T13:00:00.000Z', now)).toBe(true);
  expect(isSurveyOpen('2026-08-21T13:00:00.000Z', null, now)).toBe(false);
  expect(isSurveyOpen('2026-08-21T10:00:00.000Z', '2026-08-21T12:00:00.000Z', now)).toBe(false);
});

test('CSV export carries a UTF-8 BOM, Arabic text, and neutralized formulas', () => {
  const csv = buildSurveyCsv(questions, responses);
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain('تجربة ممتازة');
  expect(csv).toContain("'=2+2");
  expect(csv).toContain('Núria');
  expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(new TextEncoder().encode(csv))).toBe(
    csv,
  );
});

test('CSV export can be encoded as a native stream without losing Arabic', async () => {
  const bytes = new Uint8Array(
    await new Response(streamSurveyCsv(questions, responses)).arrayBuffer(),
  );
  expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(new TextDecoder().decode(bytes)).toContain('تجربة ممتازة');
});
