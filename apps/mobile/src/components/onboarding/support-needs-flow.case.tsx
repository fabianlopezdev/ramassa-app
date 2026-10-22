import { fireEvent, render } from '@testing-library/react';
import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import { createInMemoryOnboardingDraftStore } from '@ramassa/shared/onboarding-drafts';
import { decodeSupportNeeds } from '@ramassa/shared/schemas';

const store = createInMemoryOnboardingDraftStore();
const push = mock(() => {});
const replace = mock(() => {});
const goNext = mock(() => {});
let category = 'accessibility';
let editing = false;
mock.module('@/lib/onboarding', () => ({ onboardingDraftStore: store }));
mock.module('expo-router', () => ({
  useRouter: () => ({ push, replace }),
  useLocalSearchParams: () => ({ category }),
  Redirect: () => null,
}));
mock.module('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key} ${Object.values(values).join(' ')}` : key,
  }),
}));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('react-native', () => ({
  View: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
mock.module('@/lib/haptics/haptics', () => ({ playHaptic: () => {} }));
mock.module('@/components/onboarding/wizard-validation-summary', () => ({
  WizardValidationSummary: () => null,
}));
mock.module('@/components/onboarding/field-error-text', () => ({ FieldErrorText: () => null }));
mock.module('@/lib/onboarding-intake-context', () => ({
  useWizardStep: () => ({
    // Nothing staff made required here (RAPP-611).
    isRequired: () => false,
    position: { step: 12, total: 14 },
    isEditing: editing,
    nextDraftStep: 'summary',
    goNext,
    previousDraftStep: 'participation-support',
    goBack: () => {},
  }),
}));
mock.module('@/components/onboarding/wizard-frame', () => ({
  WizardFrame: ({
    children,
    title,
    onContinue,
    onBack,
  }: {
    children: ReactNode;
    title: string;
    onContinue: () => void;
    onBack: () => void;
  }) =>
    createElement(
      'section',
      null,
      createElement('h1', null, title),
      children,
      createElement('button', { onClick: onContinue }, 'Continue'),
      createElement('button', { onClick: onBack }, 'Back'),
    ),
}));
mock.module('@/components/auth/selection-choice-card', () => ({
  SelectionChoiceCard: ({
    label,
    isSelected,
    onPress,
    accessibilityRole,
  }: {
    label: string;
    isSelected: boolean;
    onPress: () => void;
    accessibilityRole: string;
  }) =>
    createElement(
      'button',
      { role: accessibilityRole, 'aria-checked': isSelected, onClick: onPress },
      label,
    ),
}));
mock.module('@/components/forms/form-text-area', () => ({
  FormTextArea: ({
    value,
    onChangeText,
    maxLength,
  }: {
    value: string;
    onChangeText: (value: string) => void;
    maxLength: number;
  }) =>
    createElement('textarea', {
      value,
      maxLength,
      onInput: (event: { target: { value: string } }) => onChangeText(event.target.value),
    }),
}));
const { SupportNeedsStep } = await import('./support-needs-step');
const { SupportNeedDetailsStep } = await import('./support-need-details-step');
afterAll(() => mock.restore());
beforeEach(() => {
  store.clearDraft();
  push.mockClear();
  replace.mockClear();
  goNext.mockClear();
  editing = false;
  category = 'accessibility';
});

test('multiple needs share one explanation screen, preserve Back answers and finish at summary', () => {
  store.saveDraft({ currentStep: 'specific-needs', season: { childcareNeed: 'yes' } });
  let picker = render(createElement(SupportNeedsStep));
  expect(picker.getAllByRole('checkbox')).toHaveLength(6);
  expect(
    picker.getAllByRole('checkbox').every((item) => item.getAttribute('aria-checked') === 'false'),
  ).toBe(true);
  fireEvent.click(picker.getByRole('checkbox', { name: 'onboarding:supportNeedAccessibility' }));
  fireEvent.click(picker.getByRole('checkbox', { name: 'onboarding:supportNeedCommunication' }));
  fireEvent.click(picker.getByRole('button', { name: 'Continue' }));
  expect(push).toHaveBeenLastCalledWith('/onboarding/specific-needs-details/accessibility');
  picker.unmount();
  let details = render(createElement(SupportNeedDetailsStep));
  expect(details.getAllByRole('textbox')).toHaveLength(1);
  expect(details.getByRole('heading').textContent).toContain('supportNeedsCombinedQuestion');
  expect(details.getByRole('heading').textContent).toContain('supportNeedAccessibility');
  expect(details.getByRole('heading').textContent).toContain('supportNeedCommunication');
  expect((details.getByRole('textbox') as HTMLTextAreaElement).maxLength).toBe(2000);
  fireEvent.input(details.getByRole('textbox'), {
    target: { value: 'Step-free access and an interpreter' },
  });
  fireEvent.click(details.getByRole('button', { name: 'Back' }));
  expect(replace).toHaveBeenLastCalledWith('/onboarding/specific-needs?entrance=none');
  details.unmount();
  picker = render(createElement(SupportNeedsStep));
  expect(
    picker
      .getByRole('checkbox', { name: 'onboarding:supportNeedCommunication' })
      .getAttribute('aria-checked'),
  ).toBe('true');
  fireEvent.click(picker.getByRole('button', { name: 'Continue' }));
  picker.unmount();
  details = render(createElement(SupportNeedDetailsStep));
  expect((details.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
    'Step-free access and an interpreter',
  );
  push.mockClear();
  fireEvent.click(details.getByRole('button', { name: 'Continue' }));
  expect(push).not.toHaveBeenCalled();
  expect(goNext).toHaveBeenCalledTimes(1);
  expect(store.loadDraft()?.season?.childcareNeed).toBe('yes');
  expect(decodeSupportNeeds(store.loadDraft()?.season?.specificNeeds as string)?.explanation).toBe(
    'Step-free access and an interpreter',
  );
  details.unmount();
  editing = true;
  details = render(createElement(SupportNeedDetailsStep));
  fireEvent.click(details.getByRole('button', { name: 'Continue' }));
  expect(replace).toHaveBeenLastCalledWith('/onboarding/summary?entrance=none');
  details.unmount();
});

test('None clears other selections and skips the explanation screens', () => {
  const picker = render(createElement(SupportNeedsStep));
  fireEvent.click(picker.getByRole('checkbox', { name: 'onboarding:supportNeedCommunication' }));
  fireEvent.click(picker.getByRole('checkbox', { name: 'onboarding:supportNeedNone' }));
  expect(
    picker
      .getByRole('checkbox', { name: 'onboarding:supportNeedCommunication' })
      .getAttribute('aria-checked'),
  ).toBe('false');
  fireEvent.click(picker.getByRole('button', { name: 'Continue' }));
  expect(push).not.toHaveBeenCalled();
  expect(goNext).toHaveBeenCalledTimes(1);
  expect(decodeSupportNeeds(store.loadDraft()?.season?.specificNeeds as string)).toEqual({
    categories: ['none'],
    details: {},
  });
  picker.unmount();
});

test('Other opens its own explanation screen and saves the written need', () => {
  const picker = render(createElement(SupportNeedsStep));
  fireEvent.click(picker.getByRole('checkbox', { name: 'onboarding:supportNeedOther' }));
  fireEvent.click(picker.getByRole('button', { name: 'Continue' }));
  expect(push).toHaveBeenLastCalledWith('/onboarding/specific-needs-details/other');
  picker.unmount();
  category = 'other';
  const details = render(createElement(SupportNeedDetailsStep));
  fireEvent.input(details.getByRole('textbox'), { target: { value: 'Help arranging transport' } });
  fireEvent.click(details.getByRole('button', { name: 'Continue' }));
  expect(goNext).toHaveBeenCalledTimes(1);
  expect(decodeSupportNeeds(store.loadDraft()?.season?.specificNeeds as string)?.explanation).toBe(
    'Help arranging transport',
  );
  details.unmount();
});
