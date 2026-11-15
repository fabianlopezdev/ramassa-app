import { describe, expect, test } from 'bun:test';
import { LEGACY_TERMS_IDS } from '../onboarding/app-terms';
import { currentTermsStep, nextWizardScreen, wizardFlowOrder } from '../onboarding/intake';
import { parseIntakeCatalog } from './builder';
import { formWalkNext, formWalkPayload, formWalkScreens, type FormWalkDraft } from './form-walk';
import {
  appTermsForm,
  appTermsSubmission,
  herWizardFlow,
  isTermsSignScreen,
  withAppTermsForm,
} from './terms-form';

const VERSION_ID = '5eed0000-0000-4000-8772-000000000001';
const FORM_ID = '5eed0000-0000-4000-8772-000000000002';
const INTRO_ID = '5eed0000-0000-4000-8772-000000000003';
const RULES_ID = '5eed0000-0000-4000-8772-000000000004';
const SIGN_ID = '5eed0000-0000-4000-8772-000000000005';
const POINTS_ID = '5eed0000-0000-4000-8772-000000000006';
const SIGNATURE_ID = '5eed0000-0000-4000-8772-000000000007';
const ACCEPT_ID = '5eed0000-0000-4000-8772-000000000008';
const FIELD_ID = '5eed0000-0000-4000-8772-000000000009';
const OPTION_YES = '5eed0000-0000-4000-8772-000000000010';
const SECTION_ID = '5eed0000-0000-4000-8772-000000000011';

const text = (ca: string) => ({ ca });

const content = {
  title: text('Condicions'),
  body: text('Text de les condicions.'),
  intro_title: text('Abans'),
  intro: text('Llegeix-les.'),
  points: [{ title: text('Per què'), body: text('Per organitzar.') }],
  accept_label: text('He llegit i accepto les condicions'),
  media_label: text('Accepto sortir a fotos'),
  media_hint: text('Pots canviar-ho quan vulguis.'),
};

/** Her catalog from a server of RAPP-772: the terms form from the version she is shown. */
function formCatalog() {
  return parseIntakeCatalog({
    screens: [],
    overrides: [],
    presets: [],
    sections: [{ id: SECTION_ID, key: 'x', title: text('X'), sort_order: 0, is_builtin: false }],
    fields: [
      {
        id: FIELD_ID,
        section_id: SECTION_ID,
        kind: 'custom',
        system_key: null,
        question_type: 'single_choice',
        label: text('Jugues a futbol?'),
        help: null,
        privacy: 'personal',
        read_permission: null,
        default_required: false,
        settings: {},
        show_when_field_id: null,
        show_when_option_id: null,
        sort_order: 0,
        is_archived: false,
        created_at: '2026-11-01T00:00:00Z',
        options: [
          { id: OPTION_YES, key: 'yes', label: text('Sí'), sort_order: 0, is_archived: false },
        ],
      },
    ],
    placements: [],
    blocks: [],
    consents: [
      {
        id: ACCEPT_ID,
        key: 'app_terms',
        system_key: 'app_terms',
        name: text('Condicions de l’app'),
        body: content.accept_label,
        is_archived: false,
      },
    ],
    consent_placements: [],
    terms: { id: VERSION_ID, version_number: 3, content, is_draft: false, form_id: FORM_ID },
    custom_forms: [
      {
        id: FORM_ID,
        name: text('Condicions de l’app'),
        filled_by: 'player',
        mandatory: 'required_to_use_app',
        deadline: null,
        audience: 'all',
        repeats_each_season: false,
        kind: 'legal',
        system_key: 'app_terms',
        version: 3,
        published_at: '2026-11-01T00:00:00Z',
        is_archived: false,
        screens: [
          { id: INTRO_ID, title: text('Abans'), intro: null, sort_order: 0 },
          {
            id: RULES_ID,
            title: text('Normes'),
            intro: null,
            sort_order: 1,
            // Only for a player who answers yes (RAPP-715).
            show_when_field_id: FIELD_ID,
            show_when_values: [OPTION_YES],
          },
          {
            id: SIGN_ID,
            title: text('Condicions'),
            intro: null,
            sort_order: 2,
            system_screen: 'terms_sign',
          },
        ],
      },
    ],
    custom_form_placements: [
      {
        id: '5eed0000-0000-4000-8772-000000000012',
        field_id: FIELD_ID,
        screen_key: INTRO_ID,
        surface: 'custom_form',
        custom_form_id: FORM_ID,
        sort_order: 1,
        required: true,
        label_override: null,
        help_override: null,
      },
    ],
    custom_form_blocks: [
      {
        id: POINTS_ID,
        screen_key: INTRO_ID,
        surface: 'custom_form',
        custom_form_id: FORM_ID,
        kind: 'points',
        points: content.points,
        sort_order: 0,
      },
      {
        id: '5eed0000-0000-4000-8772-000000000013',
        screen_key: RULES_ID,
        surface: 'custom_form',
        custom_form_id: FORM_ID,
        kind: 'text',
        body: text('Normes.'),
        title: null,
        sort_order: 0,
      },
      {
        id: SIGNATURE_ID,
        screen_key: SIGN_ID,
        surface: 'custom_form',
        custom_form_id: FORM_ID,
        kind: 'signature',
        body: text('Signo.'),
        sort_order: 3,
      },
    ],
    custom_form_consent_placements: [
      {
        id: '5eed0000-0000-4000-8772-000000000014',
        consent_id: ACCEPT_ID,
        screen_key: SIGN_ID,
        surface: 'custom_form',
        custom_form_id: FORM_ID,
        sort_order: 1,
        required: true,
      },
    ],
  });
}

describe('the terms form at the end of her Onboarding (RAPP-772)', () => {
  test('her wizard ends with the summary, then the terms screens her answers open', () => {
    const catalog = formCatalog();
    const flow = herWizardFlow(catalog);
    const order = wizardFlowOrder([], flow);
    expect(order.slice(-4)).toEqual([
      'summary',
      `terms:${INTRO_ID}`,
      `terms:${RULES_ID}`,
      `terms:${SIGN_ID}`,
    ]);
    // The rules screen opens only for a yes.
    expect(nextWizardScreen(`terms:${INTRO_ID}`, new Set(), [], flow, {})).toBe(`terms:${SIGN_ID}`);
    expect(
      nextWizardScreen(`terms:${INTRO_ID}`, new Set(), [], flow, { [FIELD_ID]: OPTION_YES }),
    ).toBe(`terms:${RULES_ID}`);
    expect(nextWizardScreen('summary', new Set(), [], flow, {})).toBe(`terms:${INTRO_ID}`);
  });

  test('a draft saved at the old terms screens resumes at the first and the last terms screen', () => {
    const flow = herWizardFlow(formCatalog());
    expect(currentTermsStep('terms-intro', flow)).toBe(`terms:${INTRO_ID}`);
    expect(currentTermsStep('terms', flow)).toBe(`terms:${SIGN_ID}`);
    expect(currentTermsStep('summary', flow)).toBe('summary');
    // Without a terms form, the old screens stay.
    expect(currentTermsStep('terms', { order: [], hiddenScreens: new Set() })).toBe('terms');
  });

  test('the walk sends the screens she saw: her answers, her ticks and her signatures', () => {
    const catalog = formCatalog();
    const form = appTermsForm(catalog);
    if (form === undefined) throw new Error('no terms form');
    const answers = { [FIELD_ID]: OPTION_YES };
    const screens = formWalkScreens(catalog, form, answers);
    expect(screens.map((screen) => screen.id)).toEqual([INTRO_ID, RULES_ID, SIGN_ID]);
    expect(formWalkNext(catalog, form, INTRO_ID, {})?.id).toBe(SIGN_ID);
    expect(isTermsSignScreen(screens[2] ?? {})).toBe(true);
    const draft = {
      answers,
      signatures: { [SIGNATURE_ID]: 'unable_to_draw' as const },
      consents: { app_terms: true },
    };
    expect(formWalkPayload(catalog, screens, draft, 'es')).toEqual({
      answers: { [FIELD_ID]: OPTION_YES },
      signatures: { [SIGNATURE_ID]: { unable_to_draw: true, language: 'ca' } },
      consents: { app_terms: true },
      language: 'es',
    });
    expect(
      appTermsSubmission({
        catalog,
        terms: catalog.terms!,
        screens,
        draft,
        language: 'es',
        device: 'ios 27',
      }),
    ).toEqual({
      kind: 'form',
      signing: {
        version_id: VERSION_ID,
        language: 'es',
        answers: { [FIELD_ID]: OPTION_YES },
        consents: { app_terms: true },
        signatures: { [SIGNATURE_ID]: { unable_to_draw: true, language: 'ca' } },
        device: 'ios 27',
      },
      acceptance: {
        answers: { [FIELD_ID]: OPTION_YES },
        consents: { app_terms: true },
        signatures: { [SIGNATURE_ID]: { unable_to_draw: true, language: 'ca' } },
        device: 'ios 27',
      },
    });
  });

  test('an older server: the old content reads as the same form and sends the old acceptance', () => {
    const catalog = withAppTermsForm(
      parseIntakeCatalog({
        screens: [],
        overrides: [],
        presets: [],
        terms: { id: VERSION_ID, version_number: 2, content },
      }),
    );
    const form = appTermsForm(catalog);
    expect(form?.screens.map((screen) => screen.systemScreen ?? null)).toEqual([
      null,
      'terms_sign',
    ]);
    expect(herWizardFlow(catalog).termsSteps?.map((step) => step.key)).toEqual([
      `terms:${LEGACY_TERMS_IDS.introScreen}`,
      `terms:${LEGACY_TERMS_IDS.signScreen}`,
    ]);
    const screens = form === undefined ? [] : formWalkScreens(catalog, form, {});
    const draft: FormWalkDraft = {
      answers: {},
      signatures: {
        [LEGACY_TERMS_IDS.signatureBlock]: [
          [
            [1, 2],
            [3, 4],
          ],
        ],
      },
      consents: { app_terms: true, image_rights: true },
    };
    expect(
      appTermsSubmission({
        catalog,
        terms: catalog.terms!,
        screens,
        draft,
        language: 'es',
        device: 'ios 27',
      }),
    ).toEqual({
      kind: 'legacy',
      termsVersion: '2',
      localeShown: 'ca',
      mediaConsent: true,
      signing: {
        terms_accepted: true,
        media_consent: true,
        signature: [
          [
            [1, 2],
            [3, 4],
          ],
        ],
        unable_to_draw: false,
        device: 'ios 27',
      },
    });
    // Without her acceptance nothing is sent.
    expect(
      appTermsSubmission({
        catalog,
        terms: catalog.terms!,
        screens,
        draft: { ...draft, consents: {} },
        language: 'es',
        device: 'ios 27',
      }),
    ).toBeNull();
  });

  test('terms this build cannot read give no terms: her phone asks her to try again', () => {
    const catalog = parseIntakeCatalog({
      screens: [],
      overrides: [],
      presets: [],
      terms: { id: VERSION_ID, version_number: 2, content: { title: 'not localized' } },
    });
    expect(catalog.terms).toBeNull();
    expect(withAppTermsForm(catalog)).toBe(catalog);
  });
});
