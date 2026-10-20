import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import type { OnboardingDraft } from '@ramassa/shared/onboarding-drafts';
import ca from '../../../../packages/shared/i18n/locales/ca/onboarding.json';

let draft: OnboardingDraft;
let editing = false;
const push = mock(() => undefined);
const replace = mock(() => undefined);
const goNext = mock(() => undefined);
const Box = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
mock.module('react-native', () => ({
  Text: Box,
  View: Box,
  useWindowDimensions: () => ({ fontScale: 1 }),
}));
mock.module('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ca[key as keyof typeof ca] ?? key,
    i18n: { resolvedLanguage: 'ca' },
  }),
}));
mock.module('expo-router', () => ({
  useRouter: () => ({ push, replace }),
  Redirect: ({ href }: { href: string }) => createElement('div', null, href),
}));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('@/lib/continuous-corners', () => ({ continuousCorners: {} }));
mock.module('@/lib/haptics/haptics', () => ({ playHaptic: () => undefined }));
mock.module('@/lib/onboarding', () => ({
  onboardingDraftStore: {
    loadDraft: () => draft,
    saveDraft: (value: OnboardingDraft) => {
      draft = value;
    },
  },
}));
mock.module('@/lib/onboarding-intake-context', () => ({
  useWizardStep: () => ({
    position: { step: 3, total: 8 },
    isEditing: editing,
    nextDraftStep: editing ? 'summary' : 'logistics',
    previousDraftStep: 'background',
    goNext,
    goBack: () => undefined,
  }),
  useWizardIntake: () => ({ documentExplanation: null }),
  useBuiltinWording: () => ({
    label: (_key: string, fallback: string) => fallback,
    help: () => null,
    options: (_key: string, options: unknown) => options,
  }),
}));
mock.module('@/components/onboarding/wizard-frame', () => ({
  WizardFrame: ({
    title,
    children,
    onContinue,
    onBack,
    continueLabel,
  }: {
    title: string;
    children: ReactNode;
    onContinue: () => void;
    onBack?: () => void;
    continueLabel: string;
  }) =>
    createElement(
      'main',
      null,
      createElement('h1', null, title),
      children,
      createElement('button', { onClick: onContinue }, continueLabel),
      createElement('button', { onClick: onBack }, 'Back'),
    ),
}));
mock.module('@/components/onboarding/question-help', () => ({ QuestionHelp: () => null }));
mock.module('@/components/onboarding/wizard-validation-summary', () => ({
  WizardValidationSummary: ({ isVisible, message }: { isVisible: boolean; message: string }) =>
    isVisible ? createElement('p', { role: 'alert' }, message) : null,
}));
mock.module('@/components/auth/selection-choice-card', () => ({
  SelectionChoiceCard: ({
    label,
    isSelected,
    onPress,
  }: {
    label: string;
    isSelected: boolean;
    onPress: () => void;
  }) =>
    createElement(
      'button',
      { role: 'radio', 'aria-label': label, 'aria-checked': isSelected, onClick: onPress },
      label,
    ),
}));
mock.module('@/components/auth/auth-text-field', () => ({
  AuthTextField: ({
    label,
    value,
    onChangeText,
    onBlur,
    errorMessage,
  }: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    onBlur: () => void;
    errorMessage?: string;
  }) =>
    createElement(
      'label',
      null,
      label,
      createElement('input', {
        'aria-label': label,
        value,
        onInput: (event: { target: { value: string } }) => onChangeText(event.target.value),
        onBlur,
      }),
      errorMessage ? createElement('span', null, errorMessage) : null,
    ),
}));
const { default: Choice } = await import('../app/(app)/onboarding/documentation');
const { default: Details } = await import('../app/(app)/onboarding/documentation-details');
afterEach(cleanup);
beforeEach(() => {
  draft = { currentStep: 'documentation' };
  editing = false;
  push.mockClear();
  replace.mockClear();
  goNext.mockClear();
});

test('selection stays on choice until Continue; passport then opens only its number page', () => {
  const view = render(createElement(Choice));
  fireEvent.click(view.getByRole('radio', { name: ca.documentTypePassport }));
  expect(push).not.toHaveBeenCalled();
  expect(view.queryByRole('textbox')).toBeNull();
  fireEvent.click(view.getByRole('button', { name: ca.continueAction }));
  expect(push).toHaveBeenCalledWith('/onboarding/documentation-details');
  expect(draft.currentStep).toBe('documentation-details');
  view.unmount();
  const details = render(createElement(Details));
  expect(details.getByRole('heading').textContent).toBe(ca.documentPassportNumberTitle);
  expect(details.getAllByRole('textbox')).toHaveLength(1);
});

test.each([
  ['documentTypeNone', 'none'],
  ['documentSkipAction', undefined],
] as const)('%s bypasses details and clears any old document', (label, type) => {
  draft.documentation = { documentType: 'other', documentName: 'Permit', documentNumber: 'P123' };
  const view = render(createElement(Choice));
  fireEvent.click(view.getByRole('radio', { name: ca[label] }));
  fireEvent.click(view.getByRole('button', { name: ca.continueAction }));
  expect(draft.documentation).toEqual(type ? { documentType: type } : {});
  expect(goNext).toHaveBeenCalledTimes(1);
  expect(push).not.toHaveBeenCalled();
});

test('an empty choice explains how to proceed', () => {
  const view = render(createElement(Choice));
  fireEvent.click(view.getByRole('button', { name: ca.continueAction }));
  expect(view.getByRole('alert').textContent).toBe(ca.documentChooseError);
  expect(goNext).not.toHaveBeenCalled();
});

test('Other requires its name and number with the same number label as passport', async () => {
  draft.documentation = { documentType: 'other' };
  const view = render(createElement(Details));
  expect(view.getAllByRole('textbox')).toHaveLength(2);
  fireEvent.click(view.getByRole('button', { name: ca.continueAction }));
  await waitFor(() => expect(view.getByText(ca.documentNameRequired)).toBeTruthy());
  expect(goNext).not.toHaveBeenCalled();
  fireEvent.input(view.getByRole('textbox', { name: ca.documentNameLabel }), {
    target: { value: 'Residence permit' },
  });
  fireEvent.click(view.getByRole('button', { name: ca.continueAction }));
  await waitFor(() => expect(view.getByText(ca.documentNumberRequired)).toBeTruthy());
  expect(goNext).not.toHaveBeenCalled();
  fireEvent.input(view.getByRole('textbox', { name: ca.documentNumberLabel }), {
    target: { value: 'P123' },
  });
  fireEvent.click(view.getByRole('button', { name: ca.continueAction }));
  await waitFor(() => expect(goNext).toHaveBeenCalledTimes(1));
  expect(draft.documentation?.documentName).toBe('Residence permit');
  expect(draft.documentation?.documentNumber).toBe('P123');
  expect(draft.currentStep).toBe('logistics');
});

test('editing opens details by replacement, so Continue returns to review', () => {
  editing = true;
  const view = render(createElement(Choice));
  fireEvent.click(view.getByRole('radio', { name: ca.documentTypeNie }));
  fireEvent.click(view.getByRole('button', { name: ca.continueAction }));
  expect(replace).toHaveBeenCalledWith('/onboarding/documentation-details?edit=1');
  view.unmount();
  const details = render(createElement(Details));
  fireEvent.click(details.getByRole('button', { name: 'Back' }));
  expect(replace).toHaveBeenLastCalledWith('/onboarding/documentation?entrance=none&edit=1');
});
