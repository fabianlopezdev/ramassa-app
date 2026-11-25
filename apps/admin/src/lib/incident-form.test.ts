import { describe, expect, test } from 'bun:test';
import { parseIntakeCatalog } from '@ramassa/shared/intake-builder';
import {
  INCIDENT_FORM,
  incidentFixedPhoneQuestions,
  isIncidentReportScreen,
} from './incident-form';
import { MENTORING_FORM } from './mentoring-form';
import { onDemandFormView } from './on-demand-form';

const FORM = '97300000-0000-4000-8000-0000000000f1';
const FIXED = '97300000-0000-4000-8000-0000000000a1';
const SECOND = '97300000-0000-4000-8000-0000000000a2';

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
    { id: SECOND, title: { ca: 'Més detalls' }, intro: null, sort_order: 1, texts: {} },
    {
      id: FIXED,
      title: { ca: 'Reportar un incident' },
      intro: null,
      sort_order: 0,
      texts: {},
      system_screen: fixedScreen,
    },
  ],
});

// The dashboard's catalog: each form apart, as `intake_catalog_with_surveys` sends them.
const raw = {
  screens: [],
  overrides: [],
  presets: [],
  custom_forms: [],
  mentoring_form: form('94000000-0000-4000-8000-0000000000f1', 'mentoring', 'mentoring_request'),
  incident_form: form(FORM, 'incident', 'incident_report'),
};

describe('the incident form on the board (RAPP-973)', () => {
  test('the dashboard reads it apart and the board finds it among the forms', () => {
    const catalog = parseIntakeCatalog(raw);
    expect(catalog.customForms).toEqual([]);
    const view = onDemandFormView(catalog, INCIDENT_FORM.key);
    expect(view?.form.id).toBe(FORM);
    expect(view?.form.screens.map((screen) => isIncidentReportScreen(screen))).toEqual([
      true,
      false,
    ]);
    // Each form reads its own: the mentoring form stays the mentoring form.
    expect(onDemandFormView(catalog, MENTORING_FORM.key)?.form.systemKey).toBe('mentoring');
  });

  test('a server before it sends no form: nothing to draw', () => {
    expect(
      onDemandFormView(parseIntakeCatalog({ ...raw, incident_form: null }), 'incident'),
    ).toBeNull();
  });

  test('the fixed screen draws what, when, where and the anonymous switch, worded as her app words them', () => {
    const asked: string[] = [];
    const questions = incidentFixedPhoneQuestions('es', (key, options) => {
      asked.push(`${String(options?.lng)}:${key}`);
      return key;
    });
    expect(questions.map((question) => [question.draft.type, question.isRequired])).toEqual([
      ['long_text', true],
      ['date', true],
      ['short_text', true],
      ['yes_no', false],
    ]);
    expect(asked.every((key) => key.startsWith('es:incidents:'))).toBe(true);
  });

  test('its pages and its name are its own', () => {
    expect([INCIDENT_FORM.boardPath, INCIDENT_FORM.screenPath, INCIDENT_FORM.nameKey]).toEqual([
      '/forms/incidents',
      '/forms/incidents/screens/$screenId',
      'nav:staff.incidentForm',
    ]);
  });
});
