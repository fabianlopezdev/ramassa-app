import { describe, expect, test } from 'bun:test';
import { parseIntakeCatalog } from '@ramassa/shared/intake-builder';
import {
  feedbackFixedPhoneQuestions,
  feedbackFormView,
  isFeedbackMessageScreen,
} from './feedback-form';

const FORM = '93900000-0000-4000-8000-0000000000f1';
const FIXED = '93900000-0000-4000-8000-0000000000a1';
const SECOND = '93900000-0000-4000-8000-0000000000a2';

// The dashboard's catalog: the suggestions form apart, as `intake_catalog_with_surveys` sends it.
const raw = {
  screens: [],
  overrides: [],
  presets: [],
  custom_forms: [],
  feedback_form: {
    id: FORM,
    name: { ca: 'Formulari de suggeriments' },
    filled_by: 'player',
    mandatory: 'optional',
    deadline: null,
    audience: 'all',
    repeats_each_season: false,
    kind: 'other',
    system_key: 'feedback',
    version: 1,
    published_at: null,
    is_archived: false,
    versions: [],
    screens: [
      {
        id: SECOND,
        title: { ca: 'Una mica més' },
        intro: null,
        sort_order: 1,
        texts: {},
        system_screen: null,
      },
      {
        id: FIXED,
        title: { ca: 'Nou suggeriment' },
        intro: null,
        sort_order: 0,
        texts: {},
        system_screen: 'feedback_message',
      },
    ],
  },
};

describe('the suggestions form on the board (RAPP-939)', () => {
  test('the dashboard reads it apart and the board finds it among the forms', () => {
    const catalog = parseIntakeCatalog(raw);
    expect(catalog.customForms).toEqual([]);
    const view = feedbackFormView(catalog);
    expect(view?.form.id).toBe(FORM);
    expect(view?.catalog.customForms?.map((form) => form.id)).toEqual([FORM]);
    expect(view?.form.screens.map((screen) => isFeedbackMessageScreen(screen))).toEqual([
      true,
      false,
    ]);
  });

  test('a server before it sends no form: nothing to draw', () => {
    expect(feedbackFormView(parseIntakeCatalog({ ...raw, feedback_form: undefined }))).toBeNull();
  });

  test('the fixed screen draws the type, the text and the photo, worded as her app words them', () => {
    const asked: string[] = [];
    const questions = feedbackFixedPhoneQuestions('es', (key, options) => {
      asked.push(`${String(options?.lng)}:${key}`);
      return key;
    });
    expect(questions.map((question) => [question.draft.type, question.isRequired])).toEqual([
      ['single_choice', true],
      ['long_text', true],
      ['file_upload', false],
    ]);
    expect(questions[0]?.draft.options).toHaveLength(4);
    expect(asked.every((key) => key.startsWith('es:feedback:'))).toBe(true);
  });
});
