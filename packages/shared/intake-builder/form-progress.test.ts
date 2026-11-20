import { describe, expect, test } from 'bun:test';
import { parseIntakeCatalog } from './builder';
import { customFormById } from './custom-forms';
import {
  EMPTY_CUSTOM_FORM_PROGRESS,
  fetchMyCustomFormProgress,
  fetchMyStartedCustomFormIds,
  formProgressOf,
  isSameFormProgress,
  resumedFormWalk,
  saveCustomFormProgress,
} from './form-progress';

const FORM_ID = '88600000-0000-4000-8100-000000000001';
const FIRST_SCREEN = '88600000-0000-4000-8101-000000000001';
const SECOND_SCREEN = '88600000-0000-4000-8101-000000000002';
const METRO = '88600000-0000-4000-8045-000000000001';
const DOCUMENT = '88600000-0000-4000-8045-000000000002';
const NOT_ON_THE_FORM = '88600000-0000-4000-8045-000000000003';
const SECTION_ID = '88600000-0000-4000-8047-000000000001';
const RESPONSE_ID = '88600000-0000-4000-8102-000000000001';

const field = (id: string, label: string, sortOrder: number) => ({
  id,
  section_id: SECTION_ID,
  kind: 'custom',
  system_key: null,
  question_type: 'short_text',
  label: { ca: label },
  help: null,
  privacy: 'personal',
  read_permission: null,
  default_required: false,
  settings: {},
  show_when_field_id: null,
  show_when_option_id: null,
  sort_order: sortOrder,
  is_archived: false,
  created_at: '2026-10-01T00:00:00Z',
  options: [],
});

const placement = (id: string, fieldId: string, screenId: string) => ({
  id,
  field_id: fieldId,
  surface: 'custom_form',
  screen_key: screenId,
  custom_form_id: FORM_ID,
  sort_order: 0,
  required: false,
  label_override: null,
  help_override: null,
});

const catalog = parseIntakeCatalog({
  screens: [],
  overrides: [],
  presets: [],
  sections: [
    {
      id: SECTION_ID,
      key: 'logistics',
      title: { ca: 'Logística' },
      sort_order: 0,
      is_builtin: true,
    },
  ],
  fields: [
    field(METRO, 'Parada de metro', 0),
    field(DOCUMENT, 'Número del document', 1),
    field(NOT_ON_THE_FORM, 'Una altra', 2),
  ],
  placements: [],
  blocks: [],
  consents: [],
  consent_placements: [],
  custom_forms: [
    {
      id: FORM_ID,
      name: { ca: 'Transport' },
      filled_by: 'player',
      mandatory: 'optional',
      deadline: null,
      appears: 'once',
      version: 1,
      published_at: '2026-11-01T08:00:00Z',
      is_archived: false,
      screens: [
        { id: FIRST_SCREEN, title: { ca: 'On vius' }, intro: null, sort_order: 0 },
        { id: SECOND_SCREEN, title: { ca: 'El document' }, intro: null, sort_order: 1 },
      ],
    },
  ],
  custom_form_placements: [
    placement('88600000-0000-4000-8101-000000000011', METRO, FIRST_SCREEN),
    placement('88600000-0000-4000-8101-000000000012', DOCUMENT, SECOND_SCREEN),
  ],
  custom_form_blocks: [],
  custom_form_consent_placements: [],
});
const form = customFormById(catalog, FORM_ID)!;

describe('a half-answered form (RAPP-886)', () => {
  test('keeps the answers to its fields that differ from her record, and her screen', () => {
    const saved = { [METRO]: 'Sants', [NOT_ON_THE_FORM]: 'Sí' };
    const progress = formProgressOf(
      catalog,
      form,
      saved,
      { ...saved, [DOCUMENT]: 'X1234567Z', [NOT_ON_THE_FORM]: 'No' },
      SECOND_SCREEN,
    );
    expect(progress).toEqual({ screenId: SECOND_SCREEN, answers: { [DOCUMENT]: 'X1234567Z' } });
  });

  test('on the first screen with nothing changed there is nothing to keep', () => {
    const saved = { [METRO]: 'Sants' };
    const progress = formProgressOf(catalog, form, saved, saved, FIRST_SCREEN);
    expect(isSameFormProgress(progress, EMPTY_CUSTOM_FORM_PROGRESS)).toBe(true);
  });

  test('a cleared answer is kept as cleared', () => {
    const progress = formProgressOf(
      catalog,
      form,
      { [METRO]: 'Sants' },
      { [METRO]: '' },
      FIRST_SCREEN,
    );
    expect(progress).toEqual({ screenId: null, answers: { [METRO]: '' } });
  });

  test('she resumes at the screen she left, her answers over her record', () => {
    const resumed = resumedFormWalk(
      catalog,
      form,
      { [METRO]: 'Sants', [NOT_ON_THE_FORM]: 'Sí' },
      { screenId: SECOND_SCREEN, answers: { [METRO]: 'Clot', [NOT_ON_THE_FORM]: 'No' } },
    );
    expect(resumed).toEqual({
      answers: { [METRO]: 'Clot', [NOT_ON_THE_FORM]: 'Sí' },
      screenId: SECOND_SCREEN,
    });
  });

  test('a screen no longer on the form, or nothing kept, starts at the first', () => {
    const gone = resumedFormWalk(
      catalog,
      form,
      {},
      {
        screenId: '88600000-0000-4000-8101-0000000000ff',
        answers: {},
      },
    );
    expect(gone.screenId).toBe(FIRST_SCREEN);
    expect(resumedFormWalk(catalog, form, {}, null)).toEqual({
      answers: {},
      screenId: FIRST_SCREEN,
    });
  });
});

describe('the server calls (RAPP-886)', () => {
  const clientReturning = (data: unknown, calls: unknown[][] = []) =>
    ({
      rpc: (name: string, args?: unknown) => {
        calls.push([name, args]);
        return Promise.resolve({ data, error: null });
      },
    }) as unknown as Parameters<typeof fetchMyCustomFormProgress>[0];

  test('reads her answers so far, leaving out one this build cannot read', async () => {
    const progress = await fetchMyCustomFormProgress(
      clientReturning({
        screen_id: SECOND_SCREEN,
        answers: { [METRO]: 'Clot', [DOCUMENT]: { robot: true } },
        saved_at: '2026-11-20T10:00:00Z',
      }),
      RESPONSE_ID,
    );
    expect(progress).toEqual({ screenId: SECOND_SCREEN, answers: { [METRO]: 'Clot' } });
  });

  test('no row, or one this build cannot read, starts the form again', async () => {
    expect(await fetchMyCustomFormProgress(clientReturning(null), RESPONSE_ID)).toBeNull();
    expect(
      await fetchMyCustomFormProgress(clientReturning({ screen_id: 'x' }), RESPONSE_ID),
    ).toBeNull();
  });

  test('saving on the first screen sends no screen', async () => {
    const calls: unknown[][] = [];
    await saveCustomFormProgress(clientReturning(null, calls), RESPONSE_ID, {
      screenId: null,
      answers: { [METRO]: 'Clot' },
    });
    expect(calls).toEqual([
      ['save_custom_form_progress', { p_response_id: RESPONSE_ID, p_answers: { [METRO]: 'Clot' } }],
    ]);
  });

  test('her started forms are read as ids', async () => {
    expect(await fetchMyStartedCustomFormIds(clientReturning([RESPONSE_ID]))).toEqual([
      RESPONSE_ID,
    ]);
    expect(await fetchMyStartedCustomFormIds(clientReturning(['nope']))).toEqual([]);
  });
});
