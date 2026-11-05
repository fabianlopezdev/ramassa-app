import { describe, expect, test } from 'bun:test';
import { parseIntakeCatalog } from './builder';
import {
  customFormById,
  customFormScreenBlocks,
  customFormScreenConsents,
  customFormScreenQuestions,
  isBlockingForm,
  parseCustomForms,
} from './custom-forms';
import { placementsOnSurface } from './profile-layout';

const FORM_ID = '5eed0000-0000-4000-8100-000000000001';
const SCREEN_ID = '5eed0000-0000-4000-8101-000000000001';
const FIELD_ID = '5eed0000-0000-4000-8045-000000000001';
const SECTION_ID = '5eed0000-0000-4000-8047-000000000001';
const CONSENT_ID = '5eed0000-0000-4000-8099-000000000001';

const catalogRow = {
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
    {
      id: FIELD_ID,
      section_id: SECTION_ID,
      kind: 'custom',
      system_key: null,
      question_type: 'short_text',
      label: { ca: 'Parada de metro' },
      help: null,
      privacy: 'personal',
      read_permission: null,
      default_required: false,
      settings: {},
      show_when_field_id: null,
      show_when_option_id: null,
      sort_order: 0,
      is_archived: false,
      created_at: '2026-10-01T00:00:00Z',
      options: [],
    },
  ],
  placements: [],
  blocks: [],
  consents: [
    {
      id: CONSENT_ID,
      key: 'fotos_de_partit',
      system_key: null,
      name: { ca: 'Fotos' },
      body: { ca: 'Accepto les fotos.' },
      is_archived: false,
    },
  ],
  consent_placements: [],
  custom_forms: [
    {
      id: FORM_ID,
      name: { ca: 'Transport' },
      filled_by: 'player',
      mandatory: 'required_from_date',
      deadline: '2026-11-01',
      appears: 'once',
      version: 2,
      published_at: '2026-10-01T08:00:00Z',
      is_archived: false,
      screens: [{ id: SCREEN_ID, title: { ca: 'Transport' }, intro: null, sort_order: 0 }],
    },
    // A form a newer server knows how to send and this build does not: left out.
    { id: FORM_ID, filled_by: 'robot' },
  ],
  custom_form_placements: [
    {
      id: '5eed0000-0000-4000-8101-000000000011',
      field_id: FIELD_ID,
      surface: 'custom_form',
      screen_key: SCREEN_ID,
      custom_form_id: FORM_ID,
      sort_order: 0,
      required: true,
      label_override: { ca: 'On agafes el metro?' },
      help_override: null,
    },
  ],
  custom_form_blocks: [
    {
      id: '5eed0000-0000-4000-8101-000000000021',
      surface: 'custom_form',
      screen_key: SCREEN_ID,
      custom_form_id: FORM_ID,
      kind: 'signature',
      body: { ca: 'Signo' },
      sort_order: 1,
    },
  ],
  custom_form_consent_placements: [
    {
      id: '5eed0000-0000-4000-8101-000000000031',
      consent_id: CONSENT_ID,
      surface: 'custom_form',
      screen_key: SCREEN_ID,
      custom_form_id: FORM_ID,
      sort_order: 2,
      required: false,
    },
  ],
};

describe('forms the team creates (RAPP-700)', () => {
  test('the catalog reads the forms and puts their rows with the others', () => {
    const catalog = parseIntakeCatalog(catalogRow);
    expect(catalog.customForms).toHaveLength(1);
    const form = customFormById(catalog, FORM_ID);
    expect(form?.version).toBe(2);
    expect(form?.screens.map((screen) => screen.id)).toEqual([SCREEN_ID]);
    expect(placementsOnSurface(catalog.layout!, 'custom_form', SCREEN_ID)[0]?.customFormId).toBe(
      FORM_ID,
    );
  });

  test('a screen asks its fields worded as placed, its blocks and its consents', () => {
    const catalog = parseIntakeCatalog(catalogRow);
    const [question] = customFormScreenQuestions(catalog, SCREEN_ID);
    expect(question?.label.ca).toBe('On agafes el metro?');
    expect(question?.isRequired).toBe(true);
    expect(customFormScreenBlocks(catalog, SCREEN_ID)).toHaveLength(1);
    expect(customFormScreenConsents(catalog, SCREEN_ID).map((consent) => consent.key)).toEqual([
      'fotos_de_partit',
    ]);
  });

  test('an older server sends no forms: the catalog reads as before', () => {
    const { custom_forms: _forms, custom_form_placements: _placements, ...older } = catalogRow;
    const catalog = parseIntakeCatalog(older);
    expect(catalog.customForms).toEqual([]);
    expect(catalog.layout?.placements).toEqual([]);
  });

  test('a form keeps her from the app when required, or from its date', () => {
    expect(isBlockingForm({ mandatory: 'optional', deadline: null })).toBe(false);
    expect(isBlockingForm({ mandatory: 'required_to_use_app', deadline: null })).toBe(true);
    expect(
      isBlockingForm({ mandatory: 'required_from_date', deadline: '2026-11-01' }, '2026-10-31'),
    ).toBe(false);
    expect(
      isBlockingForm({ mandatory: 'required_from_date', deadline: '2026-11-01' }, '2026-11-01'),
    ).toBe(true);
  });

  // Ids as `private.stable_uuid` builds them for the seeded organization (RAPP-773):
  // a md5 with version 5 and the RFC variant, which z.uuid() accepts.
  test('both legal forms of the app are read, with their stable screen ids', () => {
    const systemForm = (id: string, systemKey: string, screenIds: readonly string[]) => ({
      id,
      name: { ca: systemKey },
      filled_by: 'player',
      mandatory: 'required_to_use_app',
      deadline: null,
      audience: 'all',
      repeats_each_season: systemKey === 'season_authorization',
      kind: 'legal',
      system_key: systemKey,
      version: 1,
      published_at: '2026-09-01T07:00:00+00:00',
      is_archived: false,
      screens: screenIds.map((screenId, index) => ({
        id: screenId,
        title: { ca: `Pantalla ${index + 1}` },
        intro: null,
        sort_order: index,
        texts: {},
      })),
    });
    const forms = parseCustomForms([
      systemForm('d9d59810-aeac-4214-8e00-f74202c7f065', 'app_terms', [
        'e943103f-4325-5d8f-8bcd-5b70f463d791',
        '19519363-5c28-54b0-a328-04f4769a37c8',
      ]),
      systemForm('83fb6e9a-ef68-46a4-bf92-2917f0f4aa5f', 'season_authorization', [
        '6e4796cc-458f-5158-992e-078d263160cf',
        '8786863e-632b-56a1-8adc-9d13bcfb1d5c',
        '5be9f46c-dac0-5211-a1ce-3eb9e8bd08a4',
        '5b9dabf8-7757-5aad-b66c-4554b1e056f4',
        '09e655f0-55f8-5fd0-a380-d7960fc50b1b',
      ]),
    ]);
    expect(forms.map((form) => form.systemKey)).toEqual(['app_terms', 'season_authorization']);
    expect(forms.map((form) => form.screens.length)).toEqual([2, 5]);
  });

  test('a row this build cannot read is left out', () => {
    expect(parseCustomForms([{ id: 'nope' }])).toEqual([]);
    expect(parseCustomForms(undefined)).toEqual([]);
  });
});
