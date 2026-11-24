import { describe, expect, test } from 'bun:test';
import { parseIntakeCatalog } from '@ramassa/shared/intake-builder';
import { FEEDBACK_FORM } from './feedback-form';
import {
  isMentoringRequestScreen,
  MENTORING_FORM,
  mentoringFixedPhoneQuestions,
} from './mentoring-form';
import { onDemandFormView } from './on-demand-form';

const FORM = '94000000-0000-4000-8000-0000000000f1';
const FIXED = '94000000-0000-4000-8000-0000000000a1';
const SECOND = '94000000-0000-4000-8000-0000000000a2';

const form = (id: string, systemKey: string, fixedScreen: string) => ({
  id,
  name: { ca: 'Formulari' },
  filled_by: 'player',
  mandatory: 'optional',
  deadline: null,
  audience: 'all',
  repeats_each_season: false,
  kind: 'other',
  system_key: systemKey,
  version: 1,
  published_at: null,
  is_archived: false,
  versions: [],
  screens: [
    { id: SECOND, title: { ca: 'Una mica més' }, intro: null, sort_order: 1, texts: {} },
    {
      id: FIXED,
      title: { ca: 'Nova sol·licitud' },
      intro: null,
      sort_order: 0,
      texts: {},
      system_screen: fixedScreen,
    },
  ],
});

// The dashboard's catalog: both forms apart, as `intake_catalog_with_surveys` sends them.
const raw = {
  screens: [],
  overrides: [],
  presets: [],
  custom_forms: [],
  feedback_form: form('93900000-0000-4000-8000-0000000000f1', 'feedback', 'feedback_message'),
  mentoring_form: form(FORM, 'mentoring', 'mentoring_request'),
};

describe('the mentoring form on the board (RAPP-940)', () => {
  test('the dashboard reads it apart and the board finds it among the forms', () => {
    const catalog = parseIntakeCatalog(raw);
    expect(catalog.customForms).toEqual([]);
    const view = onDemandFormView(catalog, MENTORING_FORM.key);
    expect(view?.form.id).toBe(FORM);
    expect(view?.catalog.customForms?.map((each) => each.id)).toEqual([FORM]);
    expect(view?.form.screens.map((screen) => isMentoringRequestScreen(screen))).toEqual([
      true,
      false,
    ]);
    // Each form reads its own: the suggestions form stays the suggestions form.
    expect(onDemandFormView(catalog, FEEDBACK_FORM.key)?.form.systemKey).toBe('feedback');
  });

  test('a server before it sends no form: nothing to draw', () => {
    expect(
      onDemandFormView(parseIntakeCatalog({ ...raw, mentoring_form: null }), 'mentoring'),
    ).toBeNull();
  });

  test('the fixed screen draws the topic, the detail and the preferred date and time, worded as her app words them', () => {
    const asked: string[] = [];
    const questions = mentoringFixedPhoneQuestions('es', (key, options) => {
      asked.push(`${String(options?.lng)}:${key}`);
      return key;
    });
    expect(questions.map((question) => [question.draft.type, question.isRequired])).toEqual([
      ['single_choice', true],
      ['long_text', false],
      ['short_text', false],
      ['short_text', false],
    ]);
    expect(questions[0]?.draft.options).toHaveLength(7);
    expect(asked.every((key) => key.startsWith('es:mentoring:'))).toBe(true);
  });

  test('its pages and its name are its own', () => {
    expect([MENTORING_FORM.boardPath, MENTORING_FORM.screenPath, MENTORING_FORM.nameKey]).toEqual([
      '/forms/mentoring',
      '/forms/mentoring/screens/$screenId',
      'nav:staff.mentoringForm',
    ]);
  });
});
