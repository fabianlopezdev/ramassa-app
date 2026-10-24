import { act, fireEvent, render } from '@testing-library/react';
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
  ActivityIndicator: () => createElement('span', null, 'loading'),
  useWindowDimensions: () => ({ width: 402, fontScale: 1 }),
}));
// The controls the other screens use, as plain elements that record their props.
let uploadsOn = true;
const uploadPhoto = mock(async () => ({
  key: 'org/intake-answers/her/2026/10/aaaa.jpg',
  name: 'foto.jpg',
  content_type: 'image/jpeg',
  size: 2048,
}));
mock.module('@/lib/custom-answer-upload', () => ({
  answerUploadsAvailable: () => uploadsOn,
  pickAndUploadAnswerPhoto: uploadPhoto,
  pickAndUploadAnswerDocument: mock(async () => null),
}));
mock.module('@/lib/continuous-corners', () => ({ continuousCorners: {} }));
mock.module('@/components/motion/pressable-scale', () => ({
  PressableScale: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children: ReactNode;
    onPress: () => void;
    accessibilityLabel: string;
  }) => createElement('button', { onClick: onPress, 'aria-label': accessibilityLabel }, children),
}));
mock.module('@/components/forms/raised-action-button', () => ({
  RaisedActionButton: ({
    label,
    onPress,
    testID,
  }: {
    label: string;
    onPress: () => void;
    testID: string;
  }) => createElement('button', { onClick: onPress, 'data-testid': testID }, label),
}));
mock.module('@/components/authorization/consent-row', () => ({
  ConsentRow: ({
    label,
    checked,
    onToggle,
  }: {
    label: string;
    checked: boolean;
    onToggle: () => void;
  }) =>
    createElement(
      'button',
      { role: 'checkbox', 'aria-checked': checked, onClick: onToggle },
      label,
    ),
}));
mock.module('@/components/equipment/signature-pad', () => ({
  SignaturePad: ({ onChange, prompt }: { onChange: (strokes: unknown) => void; prompt: string }) =>
    createElement(
      'button',
      {
        'data-testid': 'signature-pad',
        onClick: () =>
          onChange([
            [
              [10, 20],
              [30, 40],
            ],
          ]),
      },
      prompt,
    ),
}));
mock.module('@/components/onboarding/option-search-picker', () => ({
  OptionSearchPicker: ({
    options,
    onChange,
    testID,
  }: {
    options: { id: string; label: string }[];
    onChange: (id: string) => void;
    testID: string;
  }) =>
    createElement(
      'div',
      { 'data-testid': `${testID}-picker` },
      options.map((option) =>
        createElement(
          'button',
          { key: option.id, onClick: () => onChange(option.id) },
          option.label,
        ),
      ),
    ),
}));
mock.module('@/components/profile/supporting-entities-field', () => ({
  SupportingEntitiesField: ({
    maxItems,
    inputLabel,
    onChange,
  }: {
    maxItems: number;
    inputLabel: string;
    onChange: (value: readonly string[]) => void;
  }) =>
    createElement(
      'button',
      { 'data-testid': 'list-field', 'data-max': maxItems, onClick: () => onChange(['Creu Roja']) },
      inputLabel,
    ),
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
// This test DOM does not fire React's change on a controlled input, so each
// field leaves its typing handler here, by label, for the tests to call.
const typing = new Map<string, (value: string) => void>();
mock.module('@/components/auth/auth-text-field', () => ({
  AuthTextField: ({
    label,
    value,
    onChangeText,
    keyboardType,
    errorMessage,
  }: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    keyboardType?: string;
    errorMessage?: string;
  }) => {
    typing.set(label, onChangeText);
    return createElement(
      'label',
      null,
      createElement('input', {
        'aria-label': label,
        value,
        'data-keyboard': keyboardType ?? 'default',
        onChange: (event: { target: { value: string } }) => onChangeText(event.target.value),
      }),
      errorMessage === undefined ? null : createElement('span', null, errorMessage),
    );
  },
}));
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
const { CustomQuestionField, CustomQuestionList } = await import('./custom-question-field');
const base: CustomQuestion = {
  id: 'question',
  screenId: 'screen',
  type: 'yes_no_maybe',
  label: { ca: 'Transport?' },
  help: null,
  privacy: 'normal',
  placements: ['wizard'],
  isArchived: false,
  settings: {},
  options: [],
};
let lastValue: CustomAnswerValue | undefined;
function Question({ question, errorMessage }: { question: CustomQuestion; errorMessage?: string }) {
  const [value, setValue] = useState<CustomAnswerValue | undefined>();
  return createElement(CustomQuestionField, {
    question,
    value,
    errorMessage,
    onChange: (next: CustomAnswerValue) => {
      lastValue = next;
      setValue(next);
    },
  });
}
const typed = (type: CustomQuestion['type'], settings: CustomQuestion['settings'] = {}) =>
  createElement(Question, { question: { ...base, type, settings } });
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
    return createElement(CustomQuestionList, {
      questions: [gate, detail],
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

// Every new type (RAPP-610) renders the control the app's own screens use.

test('a number opens the number keyboard and is kept as a number, in either decimal mark', () => {
  const view = render(typed('number', { integer: false }));
  const field = view.getByRole('textbox', { name: 'Transport?' });
  expect(field.getAttribute('data-keyboard')).toBe('decimal-pad');
  act(() => typing.get('Transport?')!('3,5'));
  expect(lastValue).toBe(3.5);
  const whole = render(typed('number', { integer: true }));
  expect(whole.container.querySelector('input')!.getAttribute('data-keyboard')).toBe('number-pad');
});

test('a date is asked as day, month and year, as her date of birth', () => {
  const view = render(typed('date'));
  expect(view.getByRole('textbox', { name: ca.dayLabel })).toBeTruthy();
  act(() => typing.get(ca.dayLabel)!('5'));
  act(() => typing.get(ca.monthLabel)!('2'));
  act(() => typing.get(ca.yearLabel)!('2001'));
  expect(lastValue).toBe('2001-02-05');
});

test('a phone and an email open their own keyboards', () => {
  expect(render(typed('phone')).getByRole('textbox').getAttribute('data-keyboard')).toBe(
    'phone-pad',
  );
  expect(render(typed('email')).getAllByRole('textbox').at(-1)!.getAttribute('data-keyboard')).toBe(
    'email-address',
  );
});

test('yes or no offers two chips', () => {
  const view = render(typed('yes_no'));
  expect(view.queryByRole('button', { name: ca.customMaybeOption })).toBeNull();
  fireEvent.click(view.getByRole('button', { name: ca.noOption }));
  expect(lastValue).toBe('no');
});

test('a long list opens the search picker and stores the option id', () => {
  const view = render(
    createElement(Question, {
      question: {
        ...base,
        type: 'search_choice',
        options: [
          { id: 'gracia', label: { ca: 'Gràcia' }, isArchived: false },
          { id: 'sants', label: { ca: 'Sants' }, isArchived: false },
        ],
      },
    }),
  );
  fireEvent.click(view.getByRole('button', { name: 'Sants' }));
  expect(lastValue).toBe('sants');
});

test('a list she adds to uses the supporting organizations list with its own limit', () => {
  const view = render(typed('item_list', { max_items: 4 }));
  const list = view.getByTestId('list-field');
  expect(list.getAttribute('data-max')).toBe('4');
  expect(list.textContent).toBe(ca.customListItemLabel);
  fireEvent.click(list);
  expect(lastValue).toEqual(['Creu Roja']);
});

test('one consent is a consent row with the text staff wrote', () => {
  const view = render(typed('consent', { text: { ca: 'Accepto que em portin amb cotxe' } }));
  const tick = view.getByRole('checkbox', { name: 'Accepto que em portin amb cotxe' });
  fireEvent.click(tick);
  expect(lastValue).toBe(true);
  fireEvent.click(view.getByRole('checkbox'));
  expect(lastValue).toBe(false);
});

test('a file offers a photo, and a PDF when documents are accepted; the upload becomes her answer', async () => {
  uploadsOn = true;
  const photoOnly = render(typed('file_upload', { accept: 'photo' }));
  expect(photoOnly.queryByText(ca.customChooseDocument)).toBeNull();
  const view = render(typed('file_upload', { accept: 'document' }));
  expect(view.getByText(ca.customChooseDocument)).toBeTruthy();
  fireEvent.click(view.getAllByText(ca.customChoosePhoto).at(-1)!);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(uploadPhoto).toHaveBeenCalled();
  expect((lastValue as { name: string }).name).toBe('foto.jpg');
  expect(view.getByText('foto.jpg')).toBeTruthy();
});

test('without the upload service a file question says so and offers nothing to press', () => {
  uploadsOn = false;
  const view = render(typed('file_upload', { accept: 'document' }));
  expect(view.getByText(ca.customFileUnavailable)).toBeTruthy();
  expect(view.queryByText(ca.customChoosePhoto)).toBeNull();
  uploadsOn = true;
});

test('a signature uses the authorization pad and keeps her strokes', () => {
  const view = render(typed('signature'));
  fireEvent.click(view.getByTestId('signature-pad'));
  expect(lastValue).toEqual([
    [
      [10, 20],
      [30, 40],
    ],
  ]);
  expect(view.getByRole('button', { name: ca.authorizationClearSignature })).toBeTruthy();
});

test('an answer that does not fit shows its message under the control', () => {
  const view = render(
    createElement(Question, {
      question: { ...base, type: 'phone', settings: {} },
      errorMessage: ca.errorPhoneFormat,
    }),
  );
  expect(view.getByText(ca.errorPhoneFormat)).toBeTruthy();
});
