import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createElement, forwardRef, type ReactNode } from 'react';
import { DEFAULT_REQUIRED_QUESTIONS, questionFieldLabel } from '@ramassa/shared/intake';
import type { OnboardingDraft } from '@ramassa/shared/onboarding-drafts';
import ca from '../../../../packages/shared/i18n/locales/ca/onboarding.json';

let draft: OnboardingDraft;
let invite: string | null = null;
let removed: ReadonlySet<string> = new Set();
let required: ReadonlySet<string> = DEFAULT_REQUIRED_QUESTIONS;
const next = mock(() => {});
const back = mock(() => {});
const focused: Element[] = [];
const box = forwardRef<HTMLDivElement, { children?: ReactNode; testID?: string }>(
  ({ children, testID }, ref) => createElement('div', { ref, 'data-testid': testID }, children),
);
mock.module('react-native', () => ({
  View: box,
  Text: box,
  useWindowDimensions: () => ({ width: 402, fontScale: 1 }),
  AccessibilityInfo: {
    sendAccessibilityEvent: (node: Element, event: string) => {
      if (event === 'focus') focused.push(node);
    },
  },
}));
const translate = (key: string, values?: { label?: string }) =>
  (ca[key as keyof typeof ca] ?? key).replace('{{label}}', values?.label ?? '');
mock.module('react-i18next', () => ({
  useTranslation: () => ({ t: translate }),
}));
mock.module('@/lib/haptics/haptics', () => ({ playHaptic: () => {} }));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('@/components/forms/field-appearance', () => ({
  useFormFieldAppearance: () => ({ style: {} }),
}));
mock.module('@/components/motion/pressable-scale', () => ({
  PressableScale: ({
    children,
    accessibilityLabel,
    accessibilityRole,
    isSelected,
    onPress,
  }: {
    children: ReactNode;
    accessibilityLabel: string;
    accessibilityRole: string;
    isSelected: boolean;
    onPress: () => void;
  }) =>
    createElement(
      'button',
      {
        role: accessibilityRole,
        'aria-label': accessibilityLabel,
        'aria-checked': isSelected,
        onClick: onPress,
      },
      children,
    ),
}));
mock.module('@/lib/onboarding', () => ({
  onboardingDraftStore: {
    loadDraft: () => draft,
    saveDraft: (value: OnboardingDraft) => {
      draft = value;
    },
  },
  usePendingInviteEntity: () => invite,
}));
mock.module('@/lib/onboarding-intake-context', () => ({
  useWizardIntake: () => ({ hidden: removed }),
  useBuiltinWording: () => ({
    label: (_key: string, fallback: string) => fallback,
    field: (key: Parameters<typeof questionFieldLabel>[0], fallback: string) =>
      questionFieldLabel(key, fallback, required as never, (label) =>
        translate('optionalFieldLabel', { label }),
      ),
    help: () => null,
  }),
  useWizardStep: (screen: string) => ({
    position: { step: screen === 'logistics' ? 4 : 5, total: 8 },
    shouldAsk: () => true,
    required,
    isRequired: (question: string) => required.has(question),
    nextDraftStep: screen === 'logistics' ? 'equipment' : 'season',
    previousDraftStep: screen === 'equipment' ? 'logistics' : 'documentation',
    goNext: next,
    goBack: back,
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
    onBack: () => void;
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
mock.module('@/components/onboarding/wizard-validation-summary', () => ({
  WizardValidationSummary: ({ isVisible, message }: { isVisible: boolean; message: string }) =>
    isVisible ? createElement('p', { role: 'alert' }, message) : null,
}));
mock.module('@/components/onboarding/question-help', () => ({ QuestionHelp: () => null }));
mock.module('@/components/onboarding/onboarding-question-heading', () => ({
  OnboardingQuestionHeading: ({ label, symbol }: { label: string; symbol?: unknown }) =>
    createElement('span', { 'data-has-icon': Boolean(symbol) }, label),
}));
mock.module('@/components/onboarding/option-chip', () => ({
  OptionChip: ({
    label,
    onPress,
    isSelected,
    accessibilityRole = 'button',
  }: {
    label: string;
    onPress: () => void;
    isSelected: boolean;
    accessibilityRole?: 'button' | 'radio';
  }) =>
    createElement(
      'button',
      {
        onClick: onPress,
        role: accessibilityRole,
        'aria-checked': isSelected,
        'aria-pressed': isSelected,
      },
      label,
    ),
}));
mock.module('@/components/onboarding/municipality-picker', () => ({
  MunicipalityPicker: () => null,
}));
mock.module('@/components/auth/auth-text-field', () => ({
  AuthTextField: ({
    label,
    value,
    onChangeText,
    onBlur,
  }: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    onBlur: () => void;
  }) =>
    createElement('input', {
      'aria-label': label,
      value,
      onInput: (event: { target: { value: string } }) => onChangeText(event.target.value),
      onBlur,
    }),
}));
const optional = (label: string) => translate('optionalFieldLabel', { label });
const { default: Contact } = await import('../app/(app)/onboarding/logistics');
const { default: Equipment } = await import('../app/(app)/onboarding/equipment');
afterEach(cleanup);
beforeEach(() => {
  removed = new Set();
  required = DEFAULT_REQUIRED_QUESTIONS;
  draft = { currentStep: 'logistics', logistics: { clothingSize: 'M', shoeSize: '38' } };
  invite = null;
  focused.length = 0;
  next.mockClear();
  back.mockClear();
});

test('contact has plain labels, excludes sizing, and continues while preserving saved sizes', async () => {
  const view = render(createElement(Contact));
  expect(view.queryByText(ca.clothingSizeLabel)).toBeNull();
  expect(view.queryByText(ca.shoeSizeLabel)).toBeNull();
  expect(view.container.querySelector('[data-has-icon="true"]')).toBeNull();
  fireEvent.input(view.getByRole('textbox', { name: optional(ca.phoneLabel) }), {
    target: { value: '+34600111222' },
  });
  // The organisation and dependants questions are required by default (RAPP-611).
  fireEvent.click(view.getByRole('button', { name: ca.continueAction }));
  await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
  expect(next).not.toHaveBeenCalled();
  // The organisation's No, then the dependants' No.
  const [entityNo, dependentsNo] = view.getAllByRole('radio', { name: ca.noOption });
  fireEvent.click(entityNo!);
  fireEvent.click(dependentsNo!);
  fireEvent.click(view.getByRole('button', { name: ca.continueAction }));
  await waitFor(() => expect(next).toHaveBeenCalledTimes(1));
  expect(draft.currentStep).toBe('equipment');
  expect(draft.logistics?.phone).toBe('+34600111222');
  expect(draft.logistics?.clothingSize).toBe('M');
});

test('equipment requires sizes, preserves contact, and Back saves without validation', async () => {
  draft = {
    currentStep: 'equipment',
    logistics: { phone: '+34600111222', referenceEntity: null, hasDependents: false },
  };
  const view = render(createElement(Equipment));
  expect(view.queryByText(ca.hasDependentsLabel)).toBeNull();
  expect(view.container.querySelector('[data-has-icon="true"]')).toBeNull();
  fireEvent.click(view.getByRole('button', { name: ca.continueAction }));
  await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
  expect(next).not.toHaveBeenCalled();
  fireEvent.click(view.getByRole('button', { name: 'M' }));
  fireEvent.click(view.getByRole('button', { name: '38' }));
  fireEvent.click(view.getByRole('button', { name: ca.continueAction }));
  await waitFor(() => expect(next).toHaveBeenCalledTimes(1));
  expect(draft.logistics?.phone).toBe('+34600111222');
  expect(draft.logistics?.shoeSize).toBe('38');
  fireEvent.click(view.getByRole('button', { name: 'Back' }));
  expect(back).toHaveBeenCalledTimes(1);
  expect(draft.currentStep).toBe('logistics');
});

test('organisation starts unanswered, Yes reveals fields, and No removes stale details', async () => {
  const view = render(createElement(Contact));
  expect(view.getAllByRole('radio', { name: ca.yesOption })[0]!.getAttribute('aria-checked')).toBe(
    'false',
  );
  expect(view.getAllByRole('radio', { name: ca.noOption })[0]!.getAttribute('aria-checked')).toBe(
    'false',
  );
  expect(view.queryByRole('textbox', { name: ca.referenceEntityPlaceholder })).toBeNull();
  expect(view.queryByRole('textbox', { name: optional(ca.referenceContactNameLabel) })).toBeNull();
  fireEvent.click(view.getAllByRole('radio', { name: ca.yesOption })[0]!);
  fireEvent.click(view.getByRole('button', { name: ca.continueAction }));
  await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
  expect(next).not.toHaveBeenCalled();
  fireEvent.input(view.getByRole('textbox', { name: ca.referenceEntityPlaceholder }), {
    target: { value: 'Creu Roja' },
  });
  fireEvent.input(view.getByRole('textbox', { name: optional(ca.referenceContactNameLabel) }), {
    target: { value: 'Maria' },
  });
  fireEvent.click(view.getAllByRole('radio', { name: ca.noOption })[0]!);
  expect(view.queryByRole('textbox', { name: ca.referenceEntityPlaceholder })).toBeNull();
  fireEvent.click(view.getAllByRole('radio', { name: ca.noOption })[1]!);
  fireEvent.click(view.getByRole('button', { name: ca.continueAction }));
  await waitFor(() => expect(next).toHaveBeenCalledTimes(1));
  expect(draft.logistics?.referenceEntity).toBeNull();
  expect(draft.logistics?.referenceContactName).toBe('');
  view.unmount();
  const reopened = render(createElement(Contact));
  expect(
    reopened.getAllByRole('radio', { name: ca.noOption })[0]!.getAttribute('aria-checked'),
  ).toBe('true');
});

test('a contact question staff removed stays hidden after Yes (RAPP-618)', () => {
  removed = new Set(['reference_contact_name']);
  const view = render(createElement(Contact));
  fireEvent.click(view.getAllByRole('radio', { name: ca.yesOption })[0]!);
  expect(view.getByRole('textbox', { name: ca.referenceEntityPlaceholder })).toBeTruthy();
  expect(view.queryByRole('textbox', { name: optional(ca.referenceContactNameLabel) })).toBeNull();
});

test('suggested organisations do not answer the question; Yes reveals the retained suggestion', () => {
  draft.logistics = { ...draft.logistics, referenceEntity: 'CEAR', referenceContactName: 'Maria' };
  const view = render(createElement(Contact));
  expect(view.getAllByRole('radio', { name: ca.yesOption })[0]!.getAttribute('aria-checked')).toBe(
    'false',
  );
  expect(view.getAllByRole('radio', { name: ca.noOption })[0]!.getAttribute('aria-checked')).toBe(
    'false',
  );
  expect(view.queryByRole('textbox', { name: ca.referenceEntityPlaceholder }) === null).toBe(true);
  fireEvent.click(view.getAllByRole('radio', { name: ca.yesOption })[0]!);
  expect(
    (view.getByRole('textbox', { name: ca.referenceEntityPlaceholder }) as HTMLInputElement).value,
  ).toBe('CEAR');
  view.unmount();
  draft.logistics = { clothingSize: 'M', shoeSize: '38' };
  invite = 'Creu Roja';
  const invited = render(createElement(Contact));
  expect(
    invited.getAllByRole('radio', { name: ca.yesOption })[0]!.getAttribute('aria-checked'),
  ).toBe('false');
  expect(invited.queryByRole('textbox', { name: ca.referenceEntityPlaceholder }) === null).toBe(
    true,
  );
  fireEvent.click(invited.getAllByRole('radio', { name: ca.yesOption })[0]!);
  expect(
    (invited.getByRole('textbox', { name: ca.referenceEntityPlaceholder }) as HTMLInputElement)
      .value,
  ).toBe('Creu Roja');
  fireEvent.click(invited.getAllByRole('radio', { name: ca.noOption })[0]!);
  fireEvent.click(invited.getByRole('button', { name: 'Back' }));
  invited.unmount();
  const resumed = render(createElement(Contact));
  expect(
    resumed.getAllByRole('radio', { name: ca.noOption })[0]!.getAttribute('aria-checked'),
  ).toBe('true');
  expect(resumed.queryByRole('textbox', { name: ca.referenceEntityPlaceholder })).toBeNull();
});

test('an unfinished Yes answer survives Back without being mistaken for No', () => {
  const view = render(createElement(Contact));
  fireEvent.click(view.getAllByRole('radio', { name: ca.yesOption })[0]!);
  fireEvent.click(view.getByRole('button', { name: 'Back' }));
  view.unmount();
  const resumed = render(createElement(Contact));
  expect(
    resumed.getAllByRole('radio', { name: ca.yesOption })[0]!.getAttribute('aria-checked'),
  ).toBe('true');
  expect(
    (resumed.getByRole('textbox', { name: ca.referenceEntityPlaceholder }) as HTMLInputElement)
      .value,
  ).toBe('');
});

test('equipment grid keeps every size selectable, including the final incomplete row', () => {
  const view = render(createElement(Equipment));
  fireEvent.click(view.getByRole('button', { name: 'XXL' }));
  fireEvent.click(view.getByRole('button', { name: '46' }));
  fireEvent.click(view.getByRole('button', { name: 'Back' }));
  expect(draft.logistics?.clothingSize).toBe('XXL');
  expect(draft.logistics?.shoeSize).toBe('46');
});

const { optionGridColumnCount } = await import('../components/onboarding/option-grid');
test('size grids keep three equal columns when they fit and reduce columns for narrow or large text', () => {
  expect(optionGridColumnCount(356, 1)).toBe(3);
  expect(optionGridColumnCount(272, 1)).toBe(2);
  expect(optionGridColumnCount(356, 2)).toBe(2);
  expect(optionGridColumnCount(356, 3)).toBe(1);
});

for (const Component of [Contact, Equipment]) {
  test(`${Component.name} preserves answers saved by later screens when returning Back`, () => {
    const view = render(createElement(Component));
    draft = {
      ...draft,
      season: { specificNeeds: 'Newer saved answer' },
      logistics: { ...draft.logistics, clothingSize: 'XXL', shoeSize: '46', phone: '+34600123456' },
    };
    fireEvent.click(view.getByRole('button', { name: 'Back' }));
    expect(draft.season?.specificNeeds).toBe('Newer saved answer');
    if (Component === Contact) {
      expect(draft.logistics?.clothingSize).toBe('XXL');
      expect(draft.logistics?.shoeSize).toBe('46');
    } else {
      expect(draft.logistics?.phone).toBe('+34600123456');
    }
  });
}

test('dependants and the organisation made optional by staff can stay unanswered (RAPP-611)', async () => {
  required = new Set(['first_name', 'last_name']);
  const view = render(createElement(Contact));
  fireEvent.click(view.getByRole('button', { name: ca.continueAction }));
  await waitFor(() => expect(next).toHaveBeenCalledTimes(1));
  expect(draft.logistics?.hasDependents).toBeNull();
});

test('a blocked Continue marks the missing dependants answer and moves focus to it (pending fix 20)', async () => {
  const view = render(createElement(Contact));
  fireEvent.click(view.getAllByRole('radio', { name: ca.noOption })[0]!);
  fireEvent.click(view.getByRole('button', { name: ca.continueAction }));
  await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
  const group = view.getByTestId('question-dependents');
  expect(group.textContent).toContain(ca.errorRequired);
  expect(view.getByTestId('question-reference_entity').textContent).not.toContain(ca.errorRequired);
  await waitFor(() => expect(group.contains(focused.at(-1) ?? null)).toBe(true));
  expect(focused.at(-1)?.textContent).toBe(ca.errorRequired);
  expect(next).not.toHaveBeenCalled();
});

test('the first missing answer gets the focus when several are missing', async () => {
  const view = render(createElement(Contact));
  fireEvent.click(view.getByRole('button', { name: ca.continueAction }));
  await waitFor(() => expect(focused.length).toBe(1));
  expect(view.getByTestId('question-reference_entity').contains(focused[0]!)).toBe(true);
  expect(view.getByTestId('question-dependents').textContent).toContain(ca.errorRequired);
});

test('the sizes say which one is missing, and say optional once staff make them so (pending fixes 20, 21)', async () => {
  draft = { currentStep: 'equipment', logistics: {} };
  const view = render(createElement(Equipment));
  expect(view.getByText(ca.clothingSizeLabel)).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: 'M' }));
  fireEvent.click(view.getByRole('button', { name: ca.continueAction }));
  await waitFor(() =>
    expect(view.getByTestId('question-shoe_size').contains(focused.at(-1) ?? null)).toBe(true),
  );
  expect(view.getByTestId('question-shoe_size').textContent).toContain(ca.errorRequired);
  expect(view.getByTestId('question-clothing_size').textContent).not.toContain(ca.errorRequired);
  view.unmount();
  required = new Set(['first_name', 'last_name', 'reference_entity', 'dependents']);
  const optionalSizes = render(createElement(Equipment));
  expect(optionalSizes.getByText(optional(ca.clothingSizeLabel))).toBeTruthy();
  expect(optionalSizes.getByText(optional(ca.shoeSizeLabel))).toBeTruthy();
});

test('the phone label follows the required list (pending fix 21)', () => {
  const view = render(createElement(Contact));
  expect(view.getByRole('textbox', { name: optional(ca.phoneLabel) })).toBeTruthy();
  view.unmount();
  required = new Set([...DEFAULT_REQUIRED_QUESTIONS, 'phone']);
  const phoneRequired = render(createElement(Contact));
  expect(phoneRequired.getByRole('textbox', { name: ca.phoneLabel })).toBeTruthy();
  expect(ca.phoneLabel).not.toContain('(');
});
