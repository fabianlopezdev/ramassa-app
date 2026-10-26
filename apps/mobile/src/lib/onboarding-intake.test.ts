/**
 * What the wizard sends (RAPP-300, RAPP-663): only new or changed answers, by
 * field, so a staff or entity answer she only confirmed keeps its source.
 */
import { describe, expect, test } from 'bun:test';
import {
  EMPTY_INTAKE_CATALOG,
  herOnboarding,
  type CustomQuestion,
  type IntakeScreen,
} from '@ramassa/shared/intake-builder';
import {
  appAnswersToSave,
  customAnswersToSave,
  draftForScenario,
  mergedCustomAnswers,
  withSelectedLanguage,
  withSignatureScreens,
  wizardDraftStep,
  wizardStepRoute,
} from './onboarding-intake';

describe('appAnswersToSave', () => {
  const stored = { date: '1999-03-04', city: 'Vic', sizes: ['M'] };

  test('an answer she only confirmed is not sent; a changed one is', () => {
    expect(
      appAnswersToSave({ date: '1999-03-04', city: 'Girona', sizes: ['M'], phone: null }, stored),
    ).toEqual({ city: 'Girona' });
  });

  test('an answer she emptied is sent as null, which removes it', () => {
    expect(appAnswersToSave({ city: null, sizes: [] }, stored)).toEqual({
      city: null,
      sizes: null,
    });
  });

  test('her "None" to the entity travels even with nothing stored', () => {
    expect(appAnswersToSave({ entity: null }, {}, new Set(['entity']))).toEqual({ entity: null });
    expect(appAnswersToSave({ entity: null }, {})).toEqual({});
  });
});

describe('staff screens in the wizard (RAPP-307)', () => {
  const choice: CustomQuestion = {
    id: 'q-choice',
    type: 'single_choice',
    label: { ca: 'Com vens?' },
    help: null,
    privacy: 'normal',
    isArchived: false,
    settings: {},
    options: [
      { id: 'o-bus', label: { ca: 'Bus' }, isArchived: false },
      { id: 'o-old', label: { ca: 'Tren' }, isArchived: true },
    ],
  };
  const note: CustomQuestion = {
    ...choice,
    id: 'q-note',
    type: 'long_text',
    label: { ca: 'Alguna cosa més?' },
    options: [],
  };
  const screen: IntakeScreen = {
    id: 's-transport',
    title: { ca: 'Com arribes als entrenaments' },
    intro: null,
    afterScreen: 'logistics',
    isArchived: false,
    questions: [choice, note],
  };

  test('a step key opens its route, a staff screen under /onboarding/custom', () => {
    expect(String(wizardStepRoute('logistics'))).toBe('/onboarding/logistics');
    expect(String(wizardStepRoute('custom:s-transport'))).toBe('/onboarding/custom/s-transport');
  });

  test('only new or changed answers are sent, so a confirmed staff answer keeps its source', () => {
    const stored = { 'q-choice': 'o-bus', 'q-note': 'Res' };
    expect(
      customAnswersToSave(screen.questions, { 'q-choice': 'o-bus', 'q-note': ' Res ' }, stored),
    ).toEqual({});
    expect(
      customAnswersToSave(screen.questions, { 'q-note': 'Vinc amb la meva filla' }, stored),
    ).toEqual({
      'q-note': 'Vinc amb la meva filla',
    });
  });

  test('an answer she emptied is sent as null, which removes it', () => {
    expect(customAnswersToSave(screen.questions, { 'q-note': '  ' }, { 'q-note': 'Res' })).toEqual({
      'q-note': null,
    });
    expect(customAnswersToSave(screen.questions, { 'q-note': '' }, {})).toEqual({});
  });

  test('a kept archived option and an unknown question are not sent', () => {
    expect(
      customAnswersToSave(screen.questions, { 'q-choice': 'o-old', 'q-gone': 'x' }, {}),
    ).toEqual({});
  });

  test('the answers she sees are the stored ones with her draft on top', () => {
    expect(mergedCustomAnswers({ a: 'stored', b: 'stored' }, { b: '' })).toEqual({
      a: 'stored',
      b: '',
    });
  });
});

describe('onboarding language and navigation', () => {
  test('keeps the selected app language even when background is skipped, without losing draft answers', () => {
    const draft = {
      version: 2 as const,
      currentStep: 'summary' as const,
      account: { firstName: 'Laia', preferredLanguage: 'ca' },
      answers: { phone: '123' },
    };
    expect(withSelectedLanguage(draft, 'ar')).toEqual({
      ...draft,
      account: { firstName: 'Laia', preferredLanguage: 'ar' },
    });
    expect(draft.account.preferredLanguage).toBe('ca');
    expect(withSelectedLanguage({ version: 2, currentStep: 'identity' }, 'es').account).toEqual({
      preferredLanguage: 'es',
    });
  });
  test('back routes explicitly suppress entrance, including staff screens', () => {
    expect(wizardStepRoute('background')).toBe('/onboarding/background');
    expect(wizardStepRoute('background', 'back')).toBe('/onboarding/background?entrance=none');
    expect(wizardStepRoute('custom:transport', 'back')).toBe(
      '/onboarding/custom/transport?entrance=none',
    );
  });
});

test('the terms introduction has its own resumable route and back transition', () => {
  expect(wizardStepRoute('terms-intro')).toBe('/onboarding/terms-intro');
  expect(wizardStepRoute('terms-intro', 'back')).toBe('/onboarding/terms-intro?entrance=none');
  expect(wizardDraftStep('terms-intro')).toBe('terms-intro');
});

describe('a test player whose situation staff changed (RAPP-619)', () => {
  const draft: { currentStep: 'logistics'; scenarioStamp?: string } = {
    currentStep: 'logistics',
    scenarioStamp: '2026-10-22T10:00:00Z',
  };
  const unstamped: { currentStep: 'logistics'; scenarioStamp?: string } = {
    currentStep: 'logistics',
  };

  test('her draft from before the change is dropped', () => {
    expect(draftForScenario(draft, '2026-10-22T11:00:00Z')).toBeNull();
    expect(draftForScenario(unstamped, '2026-10-22T11:00:00Z')).toBeNull();
  });

  test('her draft from after it is kept', () => {
    expect(draftForScenario(draft, '2026-10-22T10:00:00Z')).toBe(draft);
  });

  test('a real woman has no stamp, so her draft always wins (RAPP-300)', () => {
    expect(draftForScenario(unstamped, null)).toEqual({ currentStep: 'logistics' });
    expect(draftForScenario(null, null)).toBeNull();
  });
});

describe('a screen with a signature block always shows (RAPP-690)', () => {
  const block = (id: string, screenKey: string) => ({
    id,
    surface: 'onboarding' as const,
    screenKey,
    kind: 'signature' as const,
    body: { ca: 'Accepto les normes' },
    sortOrder: 0,
  });
  const catalog = {
    ...EMPTY_INTAKE_CATALOG,
    screens: [
      {
        id: 'normes',
        title: { ca: 'Normes' },
        intro: null,
        afterScreen: 'logistics' as const,
        isArchived: false,
      },
    ],
    blocks: [block('b1', 'normes'), block('b2', 'equipment')],
  };

  test('a Ramassà screen and an app screen with only a block are planned, unanswered', () => {
    const planned = withSignatureScreens(catalog, herOnboarding(catalog));
    // In the flow order: the app screen's group, then the Ramassà screen after logistics.
    expect(planned.plan.map((screen) => [screen.id, screen.isAnswered])).toEqual([
      ['app:equipment', false],
      ['normes', false],
    ]);
    expect(planned.screens.map((screen) => screen.questions)).toEqual([[], []]);
  });

  test('without blocks her plan is as it was', () => {
    const plain = { ...catalog, blocks: [] };
    expect(withSignatureScreens(plain, herOnboarding(plain))).toEqual(herOnboarding(plain));
  });
});
