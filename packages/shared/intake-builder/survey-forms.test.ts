import { describe, expect, test } from 'bun:test';
import { customFormById, customFormScreenQuestions } from './custom-forms';
import { summarizeSurveyAnswers, surveyCatalog, type MySurvey } from './survey-forms';

const FORM = '615ea500-49ab-4ef9-b623-6df8afe29429';
const SCREEN = '12d0bd6a-cf37-474d-b0ee-8ce32de4de35';
const FIELD = 'a2e3200a-ca3f-46a1-b6c2-1ee4a754d284';

// A survey's version as `my_surveys` sends it (RAPP-929).
const SURVEY: MySurvey = {
  responseId: '7d1b6f0c-9a3e-4c41-8a55-2f1f0c6b7e01',
  formId: FORM,
  version: 1,
  name: { ca: "Com ha anat l'entrenament?" },
  eventId: null,
  closesAt: null,
  askedAt: '2026-11-23T10:00:00.000Z',
  isStarted: false,
  content: {
    kind: 'survey',
    name: { ca: "Com ha anat l'entrenament?" },
    schema: 2,
    screens: [
      { id: SCREEN, title: { ca: "Valora l'entrenament" }, intro: null, sort_order: 0, texts: {} },
    ],
    placements: [
      {
        id: 'd082b792-91c9-4e3f-80b7-82c8f7fbedbf',
        field_id: FIELD,
        screen_key: SCREEN,
        sort_order: 0,
        required: true,
        label_override: null,
        help_override: null,
        field: {
          label: { ca: "Com valores l'entrenament d'avui?" },
          help: null,
          options: [],
          settings: {},
          question_type: 'rating',
        },
      },
    ],
  },
};

describe('a survey on her phone (RAPP-929)', () => {
  test('her phone walks the survey as the version she was asked, its questions included', () => {
    const catalog = surveyCatalog(
      { screens: [], overrides: [], presets: [], sections: [], fields: [], placements: [] },
      SURVEY,
    );
    const form = customFormById(catalog, FORM);
    expect(form?.kind).toBe('survey');
    const questions = customFormScreenQuestions(catalog, SCREEN);
    expect(questions.map((question) => [question.id, question.type, question.isRequired])).toEqual([
      [FIELD, 'rating', true],
    ]);
  });

  test('the results count each rating and average them', () => {
    const rows = [5, 4, 5].map((value, index) => ({
      responseId: `r${index}`,
      profileId: `p${index}`,
      displayName: null,
      memberNumber: null,
      version: 1,
      answeredAt: null,
      answers: { [FIELD]: value },
    }));
    const [summary] = summarizeSurveyAnswers([{ fieldId: FIELD, type: 'rating' }], rows);
    expect(summary?.answered).toBe(3);
    expect(summary?.counts).toEqual({ '5': 2, '4': 1 });
    expect(summary?.average).toBeCloseTo(14 / 3);
  });
});
