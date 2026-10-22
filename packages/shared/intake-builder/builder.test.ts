/**
 * The staff question builder (RAPP-307): the catalog as the apps read it,
 * where each question shows, answer checks, the built-in guards, and what the
 * actions send.
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
  moved,
  parseIntakeCatalog,
  questionDraftSchema,
  referralScreens,
  saveBuiltinScreen,
  saveCustomQuestion,
  saveIntakeScreen,
  saveWizardFlowOrder,
  seasonScreens,
  wizardFlow,
  wizardScreens,
  type CustomQuestion,
} from './builder';

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
const raw = {
  screens: [
    {
      id: SCREEN,
      title: { ca: 'Com arribes', en: 'How you get here' },
      intro: null,
      after_screen: 'logistics',
      sort_order: 0,
      is_archived: false,
      questions: [
        {
          id: '5eed0000-0000-4000-8045-000000000001',
          question_type: 'yes_no_maybe',
          label: { ca: 'Transport públic?' },
          help: null,
          privacy: 'normal',
          placements: ['wizard', 'entity_form'],
          sort_order: 0,
          is_archived: false,
          options: [],
        },
        {
          id: '5eed0000-0000-4000-8045-000000000002',
          question_type: 'single_choice',
          label: { ca: 'Com et vas assabentar?' },
          help: null,
          privacy: 'normal',
          placements: ['wizard'],
          sort_order: 1,
          is_archived: false,
          options: [
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
          ],
        },
        {
          id: '5eed0000-0000-4000-8045-000000000003',
          question_type: 'long_text',
          label: { ca: 'Dificultats aquesta temporada?' },
          help: null,
          privacy: 'sensitive',
          placements: ['season'],
          sort_order: 2,
          is_archived: false,
          options: [],
        },
        {
          id: '5eed0000-0000-4000-8045-000000000004',
          question_type: 'short_text',
          label: { ca: 'Parada de metro' },
          help: null,
          privacy: 'personal',
          placements: ['staff'],
          sort_order: 3,
          is_archived: false,
          options: [],
        },
      ],
    },
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
const [transport, heard, season, metro] = catalog.screens[0]!.questions as [
  CustomQuestion,
  CustomQuestion,
  CustomQuestion,
  CustomQuestion,
];

describe('where each question shows', () => {
  test('the wizard asks her wizard and season questions, never a staff-only one', () => {
    const [screen] = wizardScreens(catalog, 'logistics');
    expect(screen?.questions.map((question) => question.id)).toEqual([
      transport.id,
      heard.id,
      season.id,
    ]);
    expect(wizardScreens(catalog, 'identity')).toEqual([]);
  });

  test('re-registration asks the season questions; the referral form its own', () => {
    expect(seasonScreens(catalog)[0]?.questions.map(({ id }) => id)).toEqual([season.id]);
    expect(referralScreens(catalog)[0]?.questions.map(({ id }) => id)).toEqual([transport.id]);
    expect(metro.placements).toEqual(['staff']);
  });

  test('a screen she answered completely is skipped', () => {
    const [screen] = referralScreens(catalog);
    expect(isScreenAnswered(screen!, {})).toBe(false);
    expect(isScreenAnswered(screen!, { [transport.id]: 'yes' })).toBe(true);
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
  test('a choice question needs two options and a Catalan label', () => {
    const base = { label: { ca: 'Qui?' }, placements: ['wizard'], type: 'single_choice' };
    expect(
      questionDraftSchema.safeParse({ ...base, options: [{ id: null, label: { ca: 'A' } }] })
        .success,
    ).toBe(false);
    expect(
      questionDraftSchema.safeParse({
        ...base,
        options: [
          { id: null, label: { ca: 'A' } },
          { id: null, label: { ca: 'B' } },
        ],
      }).success,
    ).toBe(true);
    expect(
      questionDraftSchema.safeParse({ ...base, label: { en: 'Who?' }, options: [] }).success,
    ).toBe(false);
    expect(questionDraftSchema.safeParse({ ...base, placements: [], options: [] }).success).toBe(
      false,
    );
  });

  test('a saved question sends its options in order, new ones without an id', async () => {
    const { client, calls } = clientReturning({ data: heard.id, error: null });
    await saveCustomQuestion(client, {
      id: heard.id,
      screenId: SCREEN,
      type: 'single_choice',
      label: { ca: 'Com et vas assabentar?', es: ' ' },
      help: null,
      privacy: 'normal',
      placements: ['wizard'],
      settings: {},
      options: [
        { id: '5eed0000-0000-4000-8046-000000000001', label: { ca: 'Entitat' } },
        { id: null, label: { ca: 'Una amiga' } },
      ],
    });
    expect(calls[0]).toEqual([
      'save_custom_question',
      {
        p_id: heard.id,
        p_screen_id: SCREEN,
        p_type: 'single_choice',
        p_label: { ca: 'Com et vas assabentar?' },
        p_help: null,
        p_privacy: 'normal',
        p_placements: ['wizard'],
        // The type's settings travel with it (RAPP-610); a choice has none.
        p_settings: {},
        p_options: [
          { id: '5eed0000-0000-4000-8046-000000000001', label: { ca: 'Entitat' } },
          { label: { ca: 'Una amiga' } },
        ],
      },
    ]);
  });

  test('a changed type is refused by the database in words', async () => {
    const { client } = clientReturning({
      data: null,
      error: { message: 'the type of a question never changes', code: '23514' },
    });
    const failure = await saveIntakeScreen(client, {
      id: null,
      title: { ca: 'x' },
      intro: null,
      afterScreen: 'identity',
    }).catch((error: unknown) => error);
    expect(isAppError(failure) && failure.code).toBe('VALIDATION-1');
  });

  test('reordering moves one step, and the ends stay put', () => {
    expect(moved(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moved(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moved(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
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

  test('an older server with neither gives the app its own order and wording', () => {
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
