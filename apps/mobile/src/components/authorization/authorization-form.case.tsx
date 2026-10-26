import { readFileSync } from 'node:fs';
import { act, fireEvent, render } from '@testing-library/react';
import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import {
  authorizationContentSchema,
  type AuthorizationContent,
  type AuthorizationSigning,
} from '@ramassa/shared/authorization';
import type { CustomQuestion } from '@ramassa/shared/intake-builder';

let reachDocumentEnd: (() => void) | undefined;
const submit = mock<(signing: AuthorizationSigning) => void>(() => {});
const box = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
mock.module('react-native', () => ({
  View: box,
  Text: box,
  ScrollView: box,
  Linking: { openURL: mock(async () => {}) },
}));
mock.module('react-native-safe-area-context', () => ({ SafeAreaView: box }));
mock.module('@/components/layout/content-width', () => ({ PageWidth: box }));
mock.module('@/components/onboarding/wizard-progress', () => ({
  WizardProgress: ({ step, total, onBack }: { step: number; total: number; onBack?: () => void }) =>
    createElement(
      'nav',
      null,
      `${step}/${total}`,
      onBack ? createElement('button', { onClick: onBack }, 'Back') : null,
    ),
}));
mock.module('@/components/forms/data-icon', () => ({ BrandSymbol: () => null }));
mock.module('@/lib/continuous-corners', () => ({ continuousCorners: {} }));
mock.module('@/lib/haptics/haptics', () => ({ playHaptic: () => {} }));
mock.module('@/lib/language-font-class', () => ({ fontClassForLanguage: () => '' }));
mock.module('@/lib/onboarding-entrance', () => ({ useOnboardingEntrance: () => 'none' }));
mock.module('@/lib/use-language-font-class', async () => {
  const { createContext } = await import('react');
  return { ScreenLanguageContext: createContext(null), useLanguageFontClass: () => '' };
});
mock.module('react-i18next', () => ({
  useTranslation: () => ({ i18n: { getFixedT: () => (key: string) => key } }),
}));
mock.module('@/components/layout/form-screen', () => ({
  FormScreen: ({
    heading,
    children,
    navigation,
    bottomAction,
    scrollEnabled,
    style,
    accessibilityLanguage,
    onEndReached,
  }: {
    heading: ReactNode;
    children: ReactNode;
    navigation?: ReactNode;
    bottomAction: ReactNode;
    scrollEnabled: boolean;
    style?: { direction: string };
    accessibilityLanguage: string;
    onEndReached?: () => void;
  }) => {
    reachDocumentEnd = onEndReached;
    return createElement(
      'main',
      { 'data-testid': 'shared-form', dir: style?.direction, lang: accessibilityLanguage },
      navigation,
      createElement(
        'section',
        { 'data-testid': 'body', 'data-scroll-enabled': scrollEnabled },
        heading,
        children,
      ),
      createElement('footer', null, bottomAction),
    );
  },
}));
mock.module('@/components/auth/auth-title', () => ({
  AuthTitle: ({ title, subtitle }: { title: string; subtitle: string }) =>
    createElement('header', null, createElement('h1', null, title), subtitle),
}));
mock.module('@/components/auth/auth-submit-button', () => ({
  AuthSubmitButton: ({
    label,
    onPress,
    isLoading,
    disabled,
  }: {
    label: string;
    onPress: () => void;
    isLoading: boolean;
    disabled?: boolean;
  }) => createElement('button', { onClick: onPress, disabled: isLoading || disabled }, label),
}));
mock.module('@/components/motion/pressable-scale', () => ({
  PressableScale: ({
    children,
    onPress,
    isExpanded,
    accessibilityLabel,
  }: {
    children: ReactNode;
    onPress: () => void;
    isExpanded?: boolean;
    accessibilityLabel?: string;
  }) =>
    createElement(
      'button',
      { onClick: onPress, 'aria-expanded': isExpanded, 'aria-label': accessibilityLabel },
      children,
    ),
}));
mock.module('@/components/onboarding/option-chip', () => ({
  OptionChip: ({
    label,
    onPress,
    isSelected,
  }: {
    label: string;
    onPress: () => void;
    isSelected: boolean;
  }) => createElement('button', { onClick: onPress, 'aria-pressed': isSelected }, label),
}));
mock.module('@/components/onboarding/option-grid', () => ({ ChoiceGrid: box }));
mock.module('./consent-row', () => ({
  ConsentRow: ({
    label,
    onToggle,
    checked,
  }: {
    label: string;
    onToggle: () => void;
    checked: boolean;
  }) =>
    createElement(
      'button',
      { onClick: onToggle, role: 'checkbox', 'aria-checked': checked },
      label,
    ),
}));
mock.module('@/components/auth/auth-text-field', () => ({
  AuthTextField: ({
    label,
    value,
    onChangeText,
  }: {
    label: string;
    value: string;
    onChangeText: (text: string) => void;
  }) =>
    createElement('input', {
      'aria-label': label,
      value,
      onInput: (e: { target: { value: string } }) => onChangeText(e.target.value),
    }),
}));
mock.module('@/components/equipment/signature-pad', () => ({
  SignaturePad: ({
    onChange,
    onDrawingChange,
  }: {
    onChange: (points: number[][][]) => void;
    onDrawingChange: (active: boolean) => void;
  }) =>
    createElement(
      'button',
      {
        onPointerDown: () => onDrawingChange(true),
        onPointerUp: () => {
          onDrawingChange(false);
          onChange([
            [
              [1, 2],
              [3, 4],
            ],
          ]);
        },
      },
      'Draw signature',
    ),
}));
// The Health screen's fields (RAPP-698): the health field answers "No" with
// one tap, any other field is a text box named by its id.
mock.module('@/components/onboarding/custom-question-field', () => ({
  CustomQuestionField: ({
    question,
    value,
    onChange,
    errorMessage,
  }: {
    question: { id: string };
    value: unknown;
    onChange: (value: string) => void;
    errorMessage?: string;
  }) =>
    createElement(
      'div',
      null,
      question.id === HEALTH
        ? createElement(
            'button',
            { onClick: () => onChange('No'), 'aria-pressed': value === 'No' },
            'authorizationHealthNo',
          )
        : createElement('input', {
            'aria-label': question.id,
            value: typeof value === 'string' ? value : '',
            onInput: (e: { target: { value: string } }) => onChange(e.target.value),
          }),
      errorMessage ?? null,
    ),
}));
const HEALTH = '5eed0000-0000-4000-8045-00000000aaaa';
const question = (id: string, isRequired: boolean): CustomQuestion => ({
  id,
  type: 'short_text',
  label: { en: id },
  help: null,
  privacy: 'sensitive',
  isArchived: false,
  settings: {},
  isRequired,
  options: [],
});
const QUESTIONS = [question(HEALTH, true), question('contact', false)];
const { AuthorizationForm } = await import('./authorization-form');
// The RAPP-304 consents, as every converted version holds them (RAPP-614).
const AUTHORIZATION_CONSENTS = [
  { key: 'participation', required: true },
  { key: 'data_processing', required: true },
  { key: 'code_of_conduct', required: true },
  { key: 'health_data', required: true },
  { key: 'image_rights', required: false },
  { key: 'newsletter', required: false },
  { key: 'messaging_groups', required: false },
] as const;
const content: AuthorizationContent = {
  title: { en: 'Season authorization' },
  sections: [
    {
      key: 'participation',
      title: { en: 'Participation' },
      body: { en: 'Published participation text' },
    },
  ],
  consents: Object.fromEntries(
    AUTHORIZATION_CONSENTS.map(({ key, required }, position) => [
      key,
      { required, position, label: { en: key } },
    ]),
  ),
  texts: {},
  attachments: [],
};
const props = {
  questions: QUESTIONS,
  healthFieldId: HEALTH,
  testID: 'authorization-screen',
  content,
  seasonName: '2026/27',
  language: 'en' as const,
  isBusy: false,
  hasFailed: false,
  onSubmit: submit,
};
afterAll(() => mock.restore());
beforeEach(() => submit.mockClear());

test('season starts its own 1 of 3 stepper and shows published text before any choices', () => {
  const view = render(createElement(AuthorizationForm, props));
  expect(view.getByText('1/3')).toBeTruthy();
  expect(view.queryByText('Published participation text')).toBeNull();
  expect(view.queryByRole('button', { name: 'Back' })).toBeNull();
  const action = view.getByRole('button', { name: 'continueAction' });
  expect(action.closest('footer')).toBeTruthy();
  expect(view.getByTestId('body').contains(action)).toBe(false);
  expect(view.queryAllByRole('checkbox')).toHaveLength(0);
});

function toConsentStage(view: ReturnType<typeof render>) {
  act(() => reachDocumentEnd?.());
  fireEvent.click(view.getByRole('button', { name: 'continueAction' }));
  fireEvent.click(view.getByRole('button', { name: 'authorizationHealthNo' }));
  fireEvent.click(view.getByRole('button', { name: 'continueAction' }));
}

test('medical answer and explicit consents/signature are required but optional consents stay untouched', () => {
  const view = render(createElement(AuthorizationForm, props));
  act(() => reachDocumentEnd?.());
  fireEvent.click(view.getByRole('button', { name: 'continueAction' }));
  expect(view.getByText('2/3')).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: 'continueAction' }));
  expect(view.getByText('onboarding:errorRequired')).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: 'authorizationHealthNo' }));
  expect(view.queryByText('onboarding:errorRequired') === null).toBe(true);
  fireEvent.click(view.getByRole('button', { name: 'continueAction' }));
  expect(view.getByText('3/3')).toBeTruthy();
  expect(
    view.getAllByRole('checkbox').every((node) => node.getAttribute('aria-checked') === 'false'),
  ).toBe(true);
  const action = view.getByRole('button', { name: 'authorizationSignAndEnterAction' });
  fireEvent.click(action);
  expect(submit).not.toHaveBeenCalled();
  expect(view.getByText('authorizationErrorConsents')).toBeTruthy();
  expect(view.getByText('authorizationErrorSignature')).toBeTruthy();
  for (const { key, required } of AUTHORIZATION_CONSENTS)
    if (required) fireEvent.click(view.getByRole('checkbox', { name: key }));
  expect(view.queryByText('authorizationErrorConsents') === null).toBe(true);
  fireEvent.click(view.getByRole('checkbox', { name: 'authorizationCannotDraw' }));
  expect(view.queryByText('authorizationErrorSignature') === null).toBe(true);
  fireEvent.click(action);
  expect(submit).toHaveBeenCalledTimes(1);
  expect(submit.mock.calls[0]).toEqual([
    {
      consents: {
        participation: true,
        data_processing: true,
        code_of_conduct: true,
        health_data: true,
      },
      answers: { [HEALTH]: 'No' },
      strokes: null,
      unableToDraw: true,
    },
  ]);
});

test('Back preserves medical answers, choices and the signature within the season flow', () => {
  const view = render(createElement(AuthorizationForm, props));
  toConsentStage(view);
  fireEvent.click(view.getByRole('checkbox', { name: 'participation' }));
  const pad = view.getByRole('button', { name: 'Draw signature' });
  fireEvent.pointerDown(pad);
  expect(view.getByTestId('body').getAttribute('data-scroll-enabled')).toBe('false');
  fireEvent.pointerUp(pad);
  expect(view.getByTestId('body').getAttribute('data-scroll-enabled')).toBe('true');
  fireEvent.click(view.getByRole('button', { name: 'Back' }));
  expect(view.getByText('2/3')).toBeTruthy();
  expect(
    view.getByRole('button', { name: 'authorizationHealthNo' }).getAttribute('aria-pressed'),
  ).toBe('true');
  fireEvent.click(view.getByRole('button', { name: 'Back' }));
  expect(view.getByText('1/3')).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: 'continueAction' }));
  fireEvent.click(view.getByRole('button', { name: 'continueAction' }));
  expect(view.getByRole('checkbox', { name: 'participation' }).getAttribute('aria-checked')).toBe(
    'true',
  );
  expect(view.getByRole('button', { name: 'authorizationClearSignature' })).toBeTruthy();
  expect(submit).not.toHaveBeenCalled();
});

test('staff signing retains RTL and its own action while a pending save blocks submission', () => {
  const view = render(
    createElement(AuthorizationForm, { ...props, language: 'ar', isOtherLanguage: true }),
  );
  expect(view.getByTestId('shared-form').getAttribute('dir')).toBe('rtl');
  expect(view.getByTestId('shared-form').getAttribute('lang')).toBe('ar');
  toConsentStage(view);
  expect(view.getByRole('button', { name: 'authorizationSignAction' })).toBeTruthy();
  view.rerender(createElement(AuthorizationForm, { ...props, isBusy: true }));
  expect(
    view.getByRole('button', { name: 'authorizationSignAndEnterAction' }).hasAttribute('disabled'),
  ).toBe(true);
});

test('Continue waits for the document end and stays unlocked when returning', () => {
  const view = render(createElement(AuthorizationForm, props));
  const action = view.getByRole('button', { name: 'continueAction' });
  expect(action.hasAttribute('disabled')).toBe(true);
  expect(view.queryByText('authorizationReadToEnd')).toBeNull();
  fireEvent.click(action);
  expect(view.getByText('1/3')).toBeTruthy();
  act(() => reachDocumentEnd?.());
  expect(action.hasAttribute('disabled')).toBe(false);
  fireEvent.click(action);
  fireEvent.click(view.getByRole('button', { name: 'Back' }));
  expect(view.getByRole('button', { name: 'continueAction' }).hasAttribute('disabled')).toBe(false);
  view.rerender(createElement(AuthorizationForm, { ...props, language: 'ca' }));
  expect(view.getByRole('button', { name: 'continueAction' }).hasAttribute('disabled')).toBe(true);
});

test('published boxes start collapsed and open independently, with numbering from one', () => {
  const view = render(
    createElement(AuthorizationForm, {
      ...props,
      content: {
        ...content,
        sections: [
          { ...content.sections[0]!, title: { en: '2. Participation' } },
          {
            key: 'insurance',
            title: { en: '3. Insurance' },
            body: { en: 'Published insurance text' },
          },
        ],
      },
    }),
  );
  const header = view.getByRole('button', { name: '1. Participation' });
  const insurance = view.getByRole('button', { name: '2. Insurance' });
  expect(header.getAttribute('aria-expanded')).toBe('false');
  expect(insurance.getAttribute('aria-expanded')).toBe('false');
  expect(view.queryByText('Published participation text')).toBeNull();
  fireEvent.click(header);
  expect(header.getAttribute('aria-expanded')).toBe('true');
  expect(view.getByText('Published participation text')).toBeTruthy();
  expect(view.queryByText('Published insurance text')).toBeNull();
  fireEvent.click(header);
  expect(view.queryByText('Published participation text')).toBeNull();
});

const translatedSeed = readFileSync(`${import.meta.dir}/../../../../../supabase/seed.sql`, 'utf8');
const translatedContent = authorizationContentSchema.parse(
  JSON.parse(translatedSeed.match(/\$auth\$([\s\S]*?)\$auth\$/)?.[1] ?? 'null'),
);
for (const language of ['ca', 'es', 'en', 'ar', 'fa'] as const) {
  test(`published document and consent choices render in ${language}`, () => {
    const view = render(
      createElement(AuthorizationForm, {
        ...props,
        language,
        content: translatedContent,
        isOtherLanguage: true,
      }),
    );
    expect(view.getByRole('heading', { name: translatedContent.title[language] })).toBeTruthy();
    const medical = translatedContent.sections[0]!;
    const medicalHeader = view.getByRole('button', { name: medical.title[language] });
    expect(medicalHeader.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(medicalHeader);
    expect(view.getByText(medical.body[language]!.replace(/\s+/gu, ' ').trim())).toBeTruthy();
    toConsentStage(view);
    for (const consent of Object.values(translatedContent.consents)) {
      expect(view.getByRole('checkbox', { name: consent.label[language] })).toBeTruthy();
    }
    if (language === 'ar' || language === 'fa') {
      expect(view.getByTestId('shared-form').getAttribute('dir')).toBe('rtl');
    }
  });
}

test('her saved answers are filled in, and she adds the ones she knows (RAPP-698)', () => {
  const view = render(
    createElement(AuthorizationForm, { ...props, initialAnswers: { [HEALTH]: 'No' } }),
  );
  act(() => reachDocumentEnd?.());
  fireEvent.click(view.getByRole('button', { name: 'continueAction' }));
  expect(
    view.getByRole('button', { name: 'authorizationHealthNo' }).getAttribute('aria-pressed'),
  ).toBe('true');
  fireEvent.input(view.getByRole('textbox', { name: 'contact' }), {
    target: { value: 'Maria' },
  });
  fireEvent.click(view.getByRole('button', { name: 'continueAction' }));
  for (const { key, required } of AUTHORIZATION_CONSENTS)
    if (required) fireEvent.click(view.getByRole('checkbox', { name: key }));
  fireEvent.click(view.getByRole('checkbox', { name: 'authorizationCannotDraw' }));
  fireEvent.click(view.getByRole('button', { name: 'authorizationSignAndEnterAction' }));
  expect(submit).toHaveBeenCalledTimes(1);
  expect(submit.mock.calls[0]?.[0].answers).toEqual({ [HEALTH]: 'No', contact: 'Maria' });
});

// RAPP-614: everything comes from the version ---------------------------------------------------

test('a consent staff added shows in its place and, required, blocks signing until ticked', () => {
  const view = render(
    createElement(AuthorizationForm, {
      ...props,
      content: {
        ...content,
        consents: {
          ...content.consents,
          team_photos: { required: true, position: 7, label: { en: 'Team photos' } },
          participation: { ...content.consents.participation!, position: 8 },
        },
      },
    }),
  );
  toConsentStage(view);
  const labels = view.getAllByRole('checkbox').map((node) => node.textContent);
  expect(labels.slice(-3)).toEqual(['Team photos', 'participation', 'authorizationCannotDraw']);
  for (const { key, required } of AUTHORIZATION_CONSENTS)
    if (required) fireEvent.click(view.getByRole('checkbox', { name: key }));
  fireEvent.click(view.getByRole('checkbox', { name: 'authorizationCannotDraw' }));
  fireEvent.click(view.getByRole('button', { name: 'authorizationSignAndEnterAction' }));
  expect(submit).not.toHaveBeenCalled();
  expect(view.getByText('authorizationErrorConsents')).toBeTruthy();
  fireEvent.click(view.getByRole('checkbox', { name: 'Team photos' }));
  fireEvent.click(view.getByRole('button', { name: 'authorizationSignAndEnterAction' }));
  expect(submit).toHaveBeenCalledTimes(1);
});

test('with no field on the Health screen the form has two phases', () => {
  const view = render(createElement(AuthorizationForm, { ...props, questions: [] }));
  expect(view.getByText('1/2')).toBeTruthy();
  act(() => reachDocumentEnd?.());
  fireEvent.click(view.getByRole('button', { name: 'continueAction' }));
  expect(view.getByText('2/2')).toBeTruthy();
  expect(view.queryByRole('button', { name: 'authorizationHealthNo' })).toBeNull();
  for (const { key, required } of AUTHORIZATION_CONSENTS)
    if (required) fireEvent.click(view.getByRole('checkbox', { name: key }));
  fireEvent.click(view.getByRole('checkbox', { name: 'authorizationCannotDraw' }));
  fireEvent.click(view.getByRole('button', { name: 'authorizationSignAndEnterAction' }));
  expect(submit.mock.calls[0]?.[0].answers).toEqual({});
  fireEvent.click(view.getByRole('button', { name: 'Back' }));
  expect(view.getByText('1/2')).toBeTruthy();
});

test('the health screen comes first when the version orders it so (RAPP-696)', () => {
  const view = render(
    createElement(AuthorizationForm, {
      ...props,
      content: { ...content, screen_order: ['health', 'document'] },
    }),
  );
  expect(view.getByText('1/3')).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: 'authorizationHealthNo' }));
  fireEvent.click(view.getByRole('button', { name: 'continueAction' }));
  expect(view.getByText('2/3')).toBeTruthy();
  expect(view.queryByRole('button', { name: 'authorizationHealthNo' })).toBeNull();
  act(() => reachDocumentEnd?.());
  fireEvent.click(view.getByRole('button', { name: 'continueAction' }));
  expect(view.getByText('3/3')).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: 'Back' }));
  fireEvent.click(view.getByRole('button', { name: 'Back' }));
  expect(view.getByText('1/3')).toBeTruthy();
});

test('staff wording shows in her language; a language they left empty shows the app text', () => {
  const worded: AuthorizationContent = {
    ...content,
    texts: {
      intro: { en: 'Read it for {{season}}.' },
      health_title: { en: 'Your health' },
      sign_and_enter_label: { en: 'Sign and play' },
      cannot_draw_label: { en: 'I sign with ticks' },
    },
  };
  const view = render(createElement(AuthorizationForm, { ...props, content: worded }));
  expect(view.getByText('Read it for 2026/27.')).toBeTruthy();
  act(() => reachDocumentEnd?.());
  fireEvent.click(view.getByRole('button', { name: 'continueAction' }));
  expect(view.getByRole('heading', { name: 'Your health' })).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: 'authorizationHealthNo' }));
  fireEvent.click(view.getByRole('button', { name: 'continueAction' }));
  expect(view.getByRole('button', { name: 'Sign and play' })).toBeTruthy();
  expect(view.getByRole('checkbox', { name: 'I sign with ticks' })).toBeTruthy();
  view.unmount();
  const arabic = render(
    createElement(AuthorizationForm, { ...props, content: worded, language: 'ar' }),
  );
  expect(arabic.getByText('authorizationIntro')).toBeTruthy();
});

test('a required field of the Health screen asks for an answer before the consents', () => {
  const view = render(
    createElement(AuthorizationForm, {
      ...props,
      questions: [question(HEALTH, true), question('contact', true)],
    }),
  );
  act(() => reachDocumentEnd?.());
  fireEvent.click(view.getByRole('button', { name: 'continueAction' }));
  fireEvent.click(view.getByRole('button', { name: 'authorizationHealthNo' }));
  fireEvent.click(view.getByRole('button', { name: 'continueAction' }));
  expect(view.getByText('onboarding:errorRequired')).toBeTruthy();
  expect(view.getByText('2/3')).toBeTruthy();
});

test('an optional health answer given asks for the health data consent', () => {
  const view = render(
    createElement(AuthorizationForm, {
      ...props,
      content: {
        ...content,
        consents: {
          ...content.consents,
          health_data: { ...content.consents.health_data!, required: false },
        },
      },
      questions: [question(HEALTH, false)],
    }),
  );
  act(() => reachDocumentEnd?.());
  fireEvent.click(view.getByRole('button', { name: 'continueAction' }));
  fireEvent.click(view.getByRole('button', { name: 'authorizationHealthNo' }));
  fireEvent.click(view.getByRole('button', { name: 'continueAction' }));
  for (const key of ['participation', 'data_processing', 'code_of_conduct'])
    fireEvent.click(view.getByRole('checkbox', { name: key }));
  fireEvent.click(view.getByRole('checkbox', { name: 'authorizationCannotDraw' }));
  fireEvent.click(view.getByRole('button', { name: 'authorizationSignAndEnterAction' }));
  expect(submit).not.toHaveBeenCalled();
  expect(view.getByText('authorizationErrorHealthConsent')).toBeTruthy();
  fireEvent.click(view.getByRole('checkbox', { name: 'health_data' }));
  fireEvent.click(view.getByRole('button', { name: 'authorizationSignAndEnterAction' }));
  expect(submit).toHaveBeenCalledTimes(1);
});
