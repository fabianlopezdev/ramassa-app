import { fireEvent, render } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import { createElement, useState, type ReactNode } from 'react';
import type { CustomAnswerValue, CustomQuestion } from '@ramassa/shared/intake-builder';
import ca from '../../../../../packages/shared/i18n/locales/ca/onboarding.json';

const box = ({
  children,
  className,
  testID,
}: {
  children?: ReactNode;
  className?: string;
  testID?: string;
}) => createElement('div', { className, 'data-testid': testID }, children);
mock.module('react-native', () => ({
  View: box,
  Text: box,
  useWindowDimensions: () => ({ width: 402, fontScale: 1 }),
}));
mock.module('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ca[key.replace('onboarding:', '') as keyof typeof ca] ?? key,
  }),
}));
mock.module('@ramassa/shared/i18n', () => ({ useLanguage: () => ({ language: 'ca' }) }));
mock.module('@/lib/use-language-font-class', () => ({ useLanguageFontClass: () => '' }));
mock.module('@/components/onboarding/option-chip', () => ({
  OptionChip: ({
    label,
    isSelected,
    onPress,
    testID,
  }: {
    label: string;
    isSelected: boolean;
    onPress: () => void;
    testID: string;
  }) =>
    createElement(
      'button',
      { 'data-testid': testID, 'aria-pressed': isSelected, onClick: onPress },
      label,
    ),
}));
mock.module('@/components/auth/auth-text-field', () => ({ AuthTextField: () => null }));
mock.module('@/components/forms/form-text-area', () => ({
  FormTextArea: ({
    label,
    value,
    onChangeText,
    maxLength,
  }: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    maxLength: number;
  }) =>
    createElement('textarea', {
      'aria-label': label,
      value,
      maxLength,
      onChange: (event: { target: { value: string } }) => onChangeText(event.target.value),
    }),
}));
const { CustomQuestionField, CustomQuestionSections } = await import('./custom-question-field');
const base: CustomQuestion = {
  id: 'question',
  screenId: 'screen',
  type: 'yes_no_maybe',
  label: { ca: 'Transport?' },
  help: null,
  privacy: 'normal',
  placements: ['wizard'],
  isArchived: false,
  options: [],
};
function Question({ question }: { question: CustomQuestion }) {
  const [value, setValue] = useState<CustomAnswerValue | undefined>();
  return createElement(CustomQuestionField, { question, value, onChange: setValue });
}
test('Yes/No/Maybe fill three equal cells and remain optional single choices', () => {
  const view = render(createElement(Question, { question: base }));
  const yes = view.getByRole('button', { name: ca.yesOption });
  expect(yes.parentElement?.className).toBe('flex-1');
  expect(yes.parentElement?.parentElement?.children.length).toBe(3);
  fireEvent.click(yes);
  expect(yes.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(view.getByRole('button', { name: ca.customMaybeOption }));
  expect(yes.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(view.getByRole('button', { name: ca.customMaybeOption }));
  expect(
    view.getByRole('button', { name: ca.customMaybeOption }).getAttribute('aria-pressed'),
  ).toBe('false');
});
test('two discovery choices fill equal cells and preserve stable option IDs', () => {
  const view = render(
    createElement(Question, {
      question: {
        ...base,
        type: 'single_choice',
        options: [
          { id: 'entity', label: { ca: 'Una entitat' }, isArchived: false },
          { id: 'social', label: { ca: 'Xarxes socials' }, isArchived: false },
        ],
      },
    }),
  );
  const first = view.getByTestId('custom-option-entity');
  expect(first.parentElement?.className).toBe('flex-1');
  expect(first.parentElement?.parentElement?.children.length).toBe(2);
  fireEvent.click(first);
  expect(first.getAttribute('aria-pressed')).toBe('true');
});

test('conditional participation begins unanswered, reveals details for Yes, and clears them for No', () => {
  const gate: CustomQuestion = {
    ...base,
    type: 'single_choice',
    options: [
      { id: 'yes', label: { ca: 'Sí' }, isArchived: false },
      { id: 'no', label: { ca: 'No' }, isArchived: false },
    ],
  };
  const detail: CustomQuestion = {
    ...base,
    id: 'details',
    type: 'long_text',
    label: { ca: 'Què et dificulta venir?' },
    showWhen: { questionId: gate.id, optionId: 'yes' },
  };
  function Section() {
    const [answers, setAnswers] = useState<Record<string, CustomAnswerValue>>({});
    return createElement(CustomQuestionSections, {
      screens: [
        {
          id: 'screen',
          title: { ca: 'Participació' },
          intro: null,
          afterScreen: 'logistics',
          isArchived: false,
          questions: [gate, detail],
        },
      ],
      answers,
      onChange: (id, value) => setAnswers((current) => ({ ...current, [id]: value })),
    });
  }
  const view = render(createElement(Section));
  expect(view.queryByRole('textbox') === null).toBe(true);
  expect(view.getByRole('button', { name: 'Sí' }).getAttribute('aria-pressed')).toBe('false');
  expect(view.getByRole('button', { name: 'No' }).getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(view.getByRole('button', { name: 'Sí' }));
  const area = view.getByRole('textbox') as HTMLTextAreaElement;
  expect(area.maxLength).toBe(4000);
  fireEvent.change(area, { target: { value: 'Horari de feina.' } });
  expect(area.value).toBe('Horari de feina.');
  fireEvent.click(view.getByRole('button', { name: 'No' }));
  expect(view.queryByRole('textbox') === null).toBe(true);
  fireEvent.click(view.getByRole('button', { name: 'Sí' }));
  expect((view.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
});
