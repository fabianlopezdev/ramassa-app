/**
 * The onboarding catalog (RAPP-307, RAPP-649): the catalog as the apps read
 * it, the fields each screen asks from its placements, answer checks, the
 * built-in guards, and what the actions send.
 */
import { describe, expect, test } from 'bun:test';
import { isAppError } from '../errors';
import {
  answerPayload,
  answerText,
  builtinLabel,
  builtinOptions,
  builtinScreenText,
  canHideBuiltin,
  canHideBuiltinScreen,
  customAnswerError,
  hiddenBuiltinQuestions,
  isScreenAnswered,
  parseIntakeCatalog,
  placedQuestions,
  profileFieldDraftSchema,
  questionOfField,
  reregistrationAsks,
  saveBuiltinScreen,
  saveIntakeScreen,
  saveWizardFlowOrder,
  wizardFlow,
  type CustomQuestion,
} from './builder';
import { fieldById } from './profile-layout';

function clientReturning(result: { data: unknown; error: unknown }) {
  const calls: unknown[] = [];
  const client = {
    rpc: (name: string, args?: unknown) => {
      calls.push(args === undefined ? [name] : [name, args]);
      return Promise.resolve(result);
    },
  };
  return { client: client as never, calls };
}

const SCREEN = '5eed0000-0000-4000-8044-000000000001';
const SECTION = '5eed0000-0000-4000-8047-000000000007';
const TRANSPORT = '5eed0000-0000-4000-8045-000000000001';
const HEARD = '5eed0000-0000-4000-8045-000000000002';
const SEASON = '5eed0000-0000-4000-8045-000000000003';
const METRO = '5eed0000-0000-4000-8045-000000000004';

const fieldRow = (
  id: string,
  type: string,
  label: Record<string, string>,
  privacy: string,
  sortOrder: number,
  options: unknown[] = [],
) => ({
  id,
  section_id: SECTION,
  kind: 'custom',
  system_key: null,
  question_type: type,
  label,
  help: null,
  privacy,
  default_required: false,
  settings: {},
  show_when_field_id: null,
  show_when_option_id: null,
  sort_order: sortOrder,
  is_archived: false,
  created_at: '2026-10-23T10:00:00Z',
  options,
});

let placementCount = 0;
const placementRow = (
  fieldId: string,
  surface: string,
  screenKey: string | null,
  sortOrder: number,
  required = false,
) => {
  placementCount += 1;
  return {
    id: `5eed0000-0000-4000-8048-${String(placementCount).padStart(12, '0')}`,
    field_id: fieldId,
    surface,
    screen_key: screenKey,
    sort_order: sortOrder,
    required,
    label_override: null,
    help_override: null,
  };
};

const raw = {
  screens: [
    {
      id: SCREEN,
      title: { ca: 'Com arribes', en: 'How you get here' },
      intro: null,
      after_screen: 'logistics',
      sort_order: 0,
      is_archived: false,
    },
  ],
  sections: [
    { id: SECTION, key: 'support', title: { ca: 'Suport' }, sort_order: 6, is_builtin: true },
  ],
  fields: [
    fieldRow(TRANSPORT, 'yes_no_maybe', { ca: 'Transport públic?' }, 'normal', 0),
    fieldRow(HEARD, 'single_choice', { ca: 'Com et vas assabentar?' }, 'normal', 1, [
      {
        id: '5eed0000-0000-4000-8046-000000000001',
        label: { ca: 'Entitat', en: 'Organization' },
        sort_order: 0,
        is_archived: false,
      },
      {
        id: '5eed0000-0000-4000-8046-000000000003',
        label: { ca: 'Cartell' },
        sort_order: 2,
        is_archived: true,
      },
    ]),
    fieldRow(SEASON, 'long_text', { ca: 'Dificultats aquesta temporada?' }, 'sensitive', 2),
    fieldRow(METRO, 'short_text', { ca: 'Parada de metro' }, 'personal', 3),
  ],
  placements: [
    placementRow(TRANSPORT, 'onboarding', SCREEN, 0),
    placementRow(HEARD, 'onboarding', SCREEN, 1),
    placementRow(SEASON, 'onboarding', SCREEN, 2),
    placementRow(TRANSPORT, 'entity_form', null, 0),
    placementRow(SEASON, 'season', null, 0, true),
  ],
  overrides: [
    {
      question: 'childcare_need',
      label: { ca: 'Necessites que et cuidem els fills?' },
      help: null,
      is_hidden: false,
      option_overrides: {
        daily: { hidden: true },
        sometimes: { label: { ca: 'De tant en tant' } },
      },
    },
    { question: 'phone', label: null, help: null, is_hidden: true, option_overrides: {} },
  ],
  presets: [
    {
      id: '5eed0000-0000-4000-8047-000000000001',
      name: 'Només talles',
      states: { clothing_size: 'ask' },
    },
  ],
};
const catalog = parseIntakeCatalog(raw);
const [transport, heard, season] = placedQuestions(catalog, SCREEN) as [
  CustomQuestion,
  CustomQuestion,
  CustomQuestion,
];

describe('where each field is asked', () => {
  test('a screen asks the fields placed on it, in order; a team-only field is on none', () => {
    expect(placedQuestions(catalog, SCREEN).map(({ id }) => id)).toEqual([
      TRANSPORT,
      HEARD,
      SEASON,
    ]);
    expect(placedQuestions(catalog, 'identity')).toEqual([]);
    expect(catalog.screens[0]).toEqual({
      id: SCREEN,
      title: { ca: 'Com arribes', en: 'How you get here' },
      intro: null,
      afterScreen: 'logistics',
      isArchived: false,
    });
  });

  test('her page reads a field as required when a placement of hers is', () => {
    const layout = catalog.layout!;
    expect(questionOfField(layout, fieldById(layout, SEASON)!).isRequired).toBe(true);
    expect(questionOfField(layout, fieldById(layout, TRANSPORT)!).isRequired).toBe(false);
    expect(questionOfField(layout, fieldById(layout, METRO)!).isRequired).toBe(false);
  });

  test('a screen she answered completely is skipped', () => {
    const screen = { ...catalog.screens[0]!, questions: [transport] };
    expect(isScreenAnswered(screen, {})).toBe(false);
    expect(isScreenAnswered(screen, { [transport.id]: 'yes' })).toBe(true);
  });
});

describe('answers', () => {
  test('each type accepts only its own kind of value', () => {
    expect(customAnswerError(transport, 'maybe')).toBeNull();
    expect(customAnswerError(transport, 'often')).toBe('invalid');
    expect(customAnswerError(heard, '5eed0000-0000-4000-8046-000000000001')).toBeNull();
    // An archived option is not offered again.
    expect(customAnswerError(heard, '5eed0000-0000-4000-8046-000000000003')).toBe('invalid');
    expect(customAnswerError(season, 'x'.repeat(4001))).toBe('invalid');
  });

  test('an empty answer is sent as null, which removes it', () => {
    expect(answerPayload({ a: ' ', b: [], c: ' Sants ' })).toEqual({
      a: null,
      b: null,
      c: 'Sants',
    });
  });

  test('an answer that chose an archived option says so', () => {
    const words = { yes: 'Sí', no: 'No', maybe: 'Potser', archived: 'arxivada' };
    expect(answerText(heard, '5eed0000-0000-4000-8046-000000000003', 'ca', words)).toBe(
      'Cartell (arxivada)',
    );
    expect(answerText(heard, '5eed0000-0000-4000-8046-000000000001', 'en', words)).toBe(
      'Organization',
    );
    expect(answerText(transport, 'maybe', 'ca', words)).toBe('Potser');
  });
});

describe('built-in questions', () => {
  test('the questions the app needs cannot be hidden', () => {
    expect(canHideBuiltin('first_name')).toBe(false);
    expect(canHideBuiltin('clothing_size')).toBe(false);
    expect(canHideBuiltin('phone')).toBe(true);
    expect(hiddenBuiltinQuestions(catalog)).toEqual(new Set(['phone']));
  });

  test("staff wording shows only in the language staff wrote it in; elsewhere the app's own stays", () => {
    expect(builtinLabel(catalog, 'childcare_need', 'ca')).toBe(
      'Necessites que et cuidem els fills?',
    );
    expect(builtinLabel(catalog, 'childcare_need', 'ar')).toBeNull();
  });

  test('options are relabelled or hidden, and her stored value stays visible', () => {
    const options = [
      { value: 'no', label: 'No' },
      { value: 'sometimes', label: 'A vegades' },
      { value: 'daily', label: 'Cada dia' },
    ];
    expect(
      builtinOptions(catalog, 'childcare_need', options, 'ca').map(({ label }) => label),
    ).toEqual(['No', 'De tant en tant']);
    expect(
      builtinOptions(catalog, 'childcare_need', options, 'ca', 'daily').map(({ value }) => value),
    ).toEqual(['no', 'sometimes', 'daily']);
  });
});

describe('building', () => {
  test('a choice field needs two options and a Catalan name', () => {
    const base = { label: { ca: 'Qui?' }, type: 'single_choice' };
    expect(
      profileFieldDraftSchema.safeParse({ ...base, options: [{ id: null, label: { ca: 'A' } }] })
        .success,
    ).toBe(false);
    expect(
      profileFieldDraftSchema.safeParse({
        ...base,
        options: [
          { id: null, label: { ca: 'A' } },
          { id: null, label: { ca: 'B' } },
        ],
      }).success,
    ).toBe(true);
    expect(
      profileFieldDraftSchema.safeParse({ ...base, label: { en: 'Who?' }, options: [] }).success,
    ).toBe(false);
  });

  test('a refusal from the database comes back in words', async () => {
    const { client } = clientReturning({
      data: null,
      error: { message: 'a screen needs a title in Catalan', code: '23514' },
    });
    const failure = await saveIntakeScreen(client, {
      id: null,
      title: { ca: 'x' },
      intro: null,
      afterScreen: 'identity',
    }).catch((error: unknown) => error);
    expect(isAppError(failure) && failure.code).toBe('VALIDATION-1');
  });
});

describe('the catalog carries the app terms (RAPP-613)', () => {
  test('no terms in the catalog means the bundled text', () => {
    expect(catalog.terms).toBeNull();
  });

  test('the current version is read with its number', () => {
    const text = (value: string) => ({ ca: value });
    const withTerms = parseIntakeCatalog({
      ...raw,
      terms: {
        id: '5eed0000-0000-4000-8099-000000000002',
        version_number: 2,
        content: {
          title: text('Termes'),
          body: text('Text.'),
          intro_title: text('Abans'),
          intro: text('Llegeix.'),
          points: [{ title: text('Per què'), body: text('Per organitzar.') }],
          accept_label: text('Accepto'),
          media_label: text('Fotos'),
          media_hint: text('Canvia-ho quan vulguis.'),
        },
      },
    });
    expect(withTerms.terms?.versionNumber).toBe(2);
    expect(withTerms.terms?.content.body.ca).toBe('Text.');
  });
});

describe('built-in screens staff edit and arrange (RAPP-612)', () => {
  const arranged = parseIntakeCatalog({
    ...raw,
    builtin_screens: [
      {
        screen: 'summary',
        texts: { title: { ca: 'Revisa-ho tot', ar: '' }, continue_label: { en: 'All good' } },
        is_hidden: false,
      },
      { screen: 'documentation', texts: {}, is_hidden: true },
      // Required questions: a stored hide never takes effect.
      { screen: 'logistics', texts: {}, is_hidden: true },
      // A screen this build does not know is dropped.
      { screen: 'a-newer-screen', texts: {}, is_hidden: false },
    ],
    flow_order: ['season', `custom:${SCREEN}`, 'identity', 'not-a-step'],
  });

  test('a catalog with neither gives the app its own order and wording', () => {
    expect(catalog.screenSettings).toEqual([]);
    expect(wizardFlow(catalog)).toEqual({ order: [], hiddenScreens: new Set() });
  });

  test('the stored order keeps built-in and staff steps, and drops what is not a step', () => {
    expect(wizardFlow(arranged).order).toEqual(['season', `custom:${SCREEN}`, 'identity']);
  });

  test('a screen hides only when none of its questions is required', () => {
    expect(canHideBuiltinScreen('documentation')).toBe(true);
    expect(canHideBuiltinScreen('season')).toBe(true);
    expect(canHideBuiltinScreen('identity')).toBe(false);
    expect(canHideBuiltinScreen('background')).toBe(false);
    expect(canHideBuiltinScreen('logistics')).toBe(false);
    expect(canHideBuiltinScreen('equipment')).toBe(false);
    expect(wizardFlow(arranged).hiddenScreens).toEqual(new Set(['documentation']));
  });

  test('the questions of a hidden screen are never asked, on the phone and in the staff preview', () => {
    expect(hiddenBuiltinQuestions(arranged).has('document')).toBe(true);
    expect(hiddenBuiltinQuestions(arranged).has('reference_entity')).toBe(false);
  });

  test("staff wording shows in the language they wrote it in; elsewhere the app's own text", () => {
    expect(builtinScreenText(arranged, 'summary', 'title', 'ca')).toBe('Revisa-ho tot');
    expect(builtinScreenText(arranged, 'summary', 'title', 'ar')).toBeNull();
    expect(builtinScreenText(arranged, 'summary', 'title', 'es')).toBeNull();
    expect(builtinScreenText(arranged, 'summary', 'continue_label', 'en')).toBe('All good');
    expect(builtinScreenText(arranged, 'identity', 'title', 'ca')).toBeNull();
  });

  test('saving a screen sends only the fields it may have, with empty languages dropped', async () => {
    const { client, calls } = clientReturning({ data: null, error: null });
    await saveBuiltinScreen(client, {
      screen: 'terms',
      texts: { title: { ca: 'No' }, help: { ca: ' Ajuda ', es: '  ' }, decline_label: {} },
      isHidden: false,
    });
    expect(calls).toEqual([
      [
        'save_builtin_screen',
        { p_screen: 'terms', p_texts: { help: { ca: 'Ajuda' } }, p_is_hidden: false },
      ],
    ]);
  });

  test('saving the flow sends every movable step in order', async () => {
    const { client, calls } = clientReturning({ data: null, error: null });
    await saveWizardFlowOrder(client, ['season', 'custom:abc', 'identity']);
    expect(calls).toEqual([
      ['save_intake_flow_order', { p_order: ['season', 'custom:abc', 'identity'] }],
    ]);
  });
});

describe('re-registration follows the hide rule of her wizard (RAPP-612)', () => {
  const hiding = (builtinScreens: unknown[], overrides: unknown[] = []) =>
    parseIntakeCatalog({ screens: [], overrides, presets: [], builtin_screens: builtinScreens });

  test('a hidden season screen removes its question from re-registration too', () => {
    const asks = reregistrationAsks(hiding([{ screen: 'season', texts: {}, is_hidden: true }]));
    expect(asks('applicant_status')).toBe(false);
    expect(asks('supporting_entities')).toBe(true);
    expect(asks('childcare_need')).toBe(true);
  });

  test('a hidden question is hidden in both; with nothing hidden she is asked all four', () => {
    const asks = reregistrationAsks(
      hiding(
        [],
        [
          {
            question: 'specific_needs',
            label: null,
            help: null,
            is_hidden: true,
            option_overrides: {},
          },
        ],
      ),
    );
    expect(asks('specific_needs')).toBe(false);
    const all = reregistrationAsks(hiding([]));
    for (const question of [
      'applicant_status',
      'supporting_entities',
      'childcare_need',
      'specific_needs',
    ] as const)
      expect(all(question)).toBe(true);
  });
});
