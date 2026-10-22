/**
 * The question builder (RAPP-307): a new screen and a new choice question send
 * what staff typed; an existing question locks its type and privacy; a
 * built-in question the app needs cannot be hidden, and the form says why.
 */
import { fireEvent, render, waitFor, within } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import { parseIntakeCatalog } from '@ramassa/shared/intake-builder';
import { QuestionBuilder, type QuestionBuilderProps } from './question-builder';

const SCREEN = '5eed0000-0000-4000-8044-000000000001';
const QUESTION = '5eed0000-0000-4000-8045-000000000002';
const catalog = parseIntakeCatalog({
  screens: [
    {
      id: SCREEN,
      title: { ca: 'Com arribes' },
      intro: null,
      after_screen: 'logistics',
      sort_order: 0,
      is_archived: false,
      questions: [
        {
          id: QUESTION,
          question_type: 'single_choice',
          label: { ca: 'Com et vas assabentar?' },
          help: null,
          privacy: 'personal',
          placements: ['wizard'],
          sort_order: 0,
          is_archived: false,
          options: [
            {
              id: '5eed0000-0000-4000-8046-000000000001',
              label: { ca: 'Entitat' },
              sort_order: 0,
              is_archived: false,
            },
            {
              id: '5eed0000-0000-4000-8046-000000000002',
              label: { ca: 'Xarxes' },
              sort_order: 1,
              is_archived: false,
            },
          ],
        },
      ],
    },
  ],
  overrides: [],
  presets: [],
});

function builder(overrides: Partial<QuestionBuilderProps> = {}) {
  const props: QuestionBuilderProps = {
    catalog,
    builtins: [
      { question: 'first_name', label: 'Nom', options: [] },
      {
        question: 'childcare_need',
        label: 'Cura dels fills',
        options: [
          { value: 'yes', label: 'Sí' },
          { value: 'no', label: 'No' },
        ],
      },
    ],
    onSaveScreen: mock(async () => undefined),
    onArchiveScreen: mock(async () => undefined),
    onReorderScreens: mock(async () => undefined),
    onSaveQuestion: mock(async () => undefined),
    onArchiveQuestion: mock(async () => undefined),
    onReorderQuestions: mock(async () => undefined),
    onSaveBuiltin: mock(async () => undefined),
    ...overrides,
  };
  return { props, view: render(<QuestionBuilder {...props} />) };
}

function input(view: ReturnType<typeof render>, name: string): HTMLInputElement {
  const element = view.container.querySelector<HTMLInputElement>(`[name="${name}"]`);
  if (element === null) throw new Error(`no ${name}`);
  return element;
}

function submit(view: ReturnType<typeof render>, testId: string) {
  const form = view.getByTestId(testId);
  fireEvent.submit(form);
}

test('a new screen is saved with its Catalan title and its step', async () => {
  const onSaveScreen = mock(async () => undefined);
  const { view } = builder({ onSaveScreen });
  fireEvent.click(view.getAllByRole('button', { name: /questions\.newScreen|New screen/ })[0]!);
  input(view, 'screen-title.ca').value = 'Família';
  input(view, 'screen-title.en').value = 'Family';
  view.container.querySelector<HTMLSelectElement>('[name="screen-after"]')!.value = 'background';
  submit(view, 'screen-form');
  await waitFor(() =>
    expect(onSaveScreen).toHaveBeenCalledWith({
      id: null,
      title: { ca: 'Família', en: 'Family' },
      intro: null,
      afterScreen: 'background',
    }),
  );
});

test('a new choice question needs two options before it is sent', async () => {
  const onSaveQuestion = mock(async () => undefined);
  const { view } = builder({ onSaveQuestion });
  fireEvent.click(view.getByRole('button', { name: /questions\.addQuestion|Add a question/ }));
  const type = view.container.querySelector<HTMLSelectElement>('[name="question-type"]')!;
  fireEvent.change(type, { target: { value: 'multiple_choice' } });
  input(view, 'question-label.ca').value = 'Qui viu amb tu?';
  input(view, 'option-new-0.ca').value = 'Fills';
  submit(view, 'question-form');
  await waitFor(() => expect(view.getByText(/questions\.optionsNeeded|two options/)).toBeTruthy());
  expect(onSaveQuestion).not.toHaveBeenCalled();

  input(view, 'option-new-1.ca').value = 'Parella';
  submit(view, 'question-form');
  await waitFor(() => expect(onSaveQuestion).toHaveBeenCalledTimes(1));
  const [draft] = onSaveQuestion.mock.calls[0] as unknown as [Record<string, unknown>];
  expect(draft.type).toBe('multiple_choice');
  expect(draft.options).toEqual([
    { id: null, label: { ca: 'Fills' } },
    { id: null, label: { ca: 'Parella' } },
  ]);
});

test('an existing question locks its type and privacy; a removed option is left out, a new one added', async () => {
  const onSaveQuestion = mock(async () => undefined);
  const { view } = builder({ onSaveQuestion });
  const row = view.getByTestId(`builder-question-${QUESTION}`);
  fireEvent.click(within(row).getByRole('button', { name: /^(questions\.edit|Edit)$/ }));
  expect(view.container.querySelector<HTMLSelectElement>('[name="question-type"]')!.disabled).toBe(
    true,
  );
  expect(
    view.container.querySelector<HTMLSelectElement>('[name="question-privacy"]')!.disabled,
  ).toBe(true);
  input(view, 'option-remove-5eed0000-0000-4000-8046-000000000001').checked = true;
  fireEvent.click(view.getByRole('button', { name: /questions\.addOption|Add an option/ }));
  input(view, 'option-new-0.ca').value = 'Una amiga';
  submit(view, 'question-form');
  await waitFor(() => expect(onSaveQuestion).toHaveBeenCalledTimes(1));
  const [draft] = onSaveQuestion.mock.calls[0] as unknown as [Record<string, unknown>];
  expect(draft.privacy).toBe('personal');
  expect(draft.options).toEqual([
    { id: '5eed0000-0000-4000-8046-000000000002', label: { ca: 'Xarxes' } },
    { id: null, label: { ca: 'Una amiga' } },
  ]);
});

test('a question the app needs cannot be hidden, and the form says why', () => {
  const { view } = builder();
  fireEvent.click(view.getByTestId('builder-builtin-first_name').querySelector('button')!);
  expect(input(view, 'builtin-hidden').disabled).toBe(true);
  expect(view.getByText(/questions\.lock\.required|needs this answer/)).toBeTruthy();
});

test('a built-in option is relabelled or hidden, but one stays visible', async () => {
  const onSaveBuiltin = mock(async () => undefined);
  const { view } = builder({ onSaveBuiltin });
  const row = view.getByTestId('builder-builtin-childcare_need');
  fireEvent.click(row.querySelector('button')!);
  input(view, 'builtin-option-hidden-yes').checked = true;
  input(view, 'builtin-option-hidden-no').checked = true;
  submit(view, 'builtin-form');
  await waitFor(() =>
    expect(view.getByText(/questions\.oneOptionStays|one option visible/)).toBeTruthy(),
  );
  expect(onSaveBuiltin).not.toHaveBeenCalled();

  input(view, 'builtin-option-hidden-no').checked = false;
  input(view, 'builtin-option-no.ca').value = 'Ara no';
  submit(view, 'builtin-form');
  await waitFor(() => expect(onSaveBuiltin).toHaveBeenCalledTimes(1));
  const [override] = onSaveBuiltin.mock.calls[0] as unknown as [
    { optionOverrides: Record<string, unknown>; isHidden: boolean },
  ];
  expect(override.isHidden).toBe(false);
  expect(override.optionOverrides).toEqual({
    yes: { label: {}, hidden: true },
    no: { label: { ca: 'Ara no' }, hidden: false },
  });
});

// Every field kind the app uses (RAPP-610).

function newQuestionOfType(view: ReturnType<typeof render>, type: string) {
  fireEvent.click(view.getByRole('button', { name: /questions\.addQuestion|Add a question/ }));
  const select = view.container.querySelector<HTMLSelectElement>('[name="question-type"]')!;
  fireEvent.change(select, { target: { value: type } });
}

test('each type says in a line what it asks', () => {
  const { view } = builder();
  newQuestionOfType(view, 'item_list');
  expect(view.getByTestId('type-description').textContent).toMatch(
    /questions\.typeHelp\.item_list|adds items one by one/,
  );
});

test('a number question sends its range and that it is whole', async () => {
  const onSaveQuestion = mock(async () => undefined);
  const { view } = builder({ onSaveQuestion });
  newQuestionOfType(view, 'number');
  input(view, 'question-label.ca').value = 'Quants fills tens?';
  input(view, 'setting-integer').checked = true;
  input(view, 'setting-min').value = '0';
  input(view, 'setting-max').value = '15';
  submit(view, 'question-form');
  await waitFor(() => expect(onSaveQuestion).toHaveBeenCalledTimes(1));
  const [draft] = onSaveQuestion.mock.calls[0] as unknown as [Record<string, unknown>];
  expect(draft.settings).toEqual({ integer: true, min: 0, max: 15 });
  expect(draft.options).toEqual([]);
});

test('a range upside down is refused before it is sent', async () => {
  const onSaveQuestion = mock(async () => undefined);
  const { view } = builder({ onSaveQuestion });
  newQuestionOfType(view, 'number');
  input(view, 'question-label.ca').value = 'Edat';
  input(view, 'setting-min').value = '9';
  input(view, 'setting-max').value = '1';
  submit(view, 'question-form');
  await waitFor(() =>
    expect(view.getByText(/questions\.settingsInvalid|Check the settings/)).toBeTruthy(),
  );
  expect(onSaveQuestion).not.toHaveBeenCalled();
});

test('a consent sends its own text; a signature is asked of her only', async () => {
  const onSaveQuestion = mock(async () => undefined);
  const { view } = builder({ onSaveQuestion });
  newQuestionOfType(view, 'consent');
  input(view, 'question-label.ca').value = 'Transport';
  input(view, 'setting-consent-text.ca').value = 'Accepto que em portin amb cotxe';
  submit(view, 'question-form');
  await waitFor(() => expect(onSaveQuestion).toHaveBeenCalledTimes(1));
  const [draft] = onSaveQuestion.mock.calls[0] as unknown as [Record<string, unknown>];
  expect(draft.settings).toEqual({ text: { ca: 'Accepto que em portin amb cotxe' } });

  // Saved, the form closed: a new one for the signature.
  newQuestionOfType(view, 'signature');
  expect(input(view, 'question-placement-staff').disabled).toBe(true);
  expect(input(view, 'question-placement-entity_form').disabled).toBe(true);
  expect(input(view, 'question-placement-wizard').disabled).toBe(false);
});

test('a long searchable list takes options pasted one per line', async () => {
  const onSaveQuestion = mock(async () => undefined);
  const { view } = builder({ onSaveQuestion });
  newQuestionOfType(view, 'search_choice');
  input(view, 'question-label.ca').value = 'Barri';
  view.container.querySelector<HTMLTextAreaElement>('[name="options-paste"]')!.value =
    'Gràcia\nSants\n\nHorta\nSants';
  submit(view, 'question-form');
  await waitFor(() => expect(onSaveQuestion).toHaveBeenCalledTimes(1));
  const [draft] = onSaveQuestion.mock.calls[0] as unknown as [Record<string, unknown>];
  expect(draft.options).toEqual([
    { id: null, label: { ca: 'Gràcia' } },
    { id: null, label: { ca: 'Sants' } },
    { id: null, label: { ca: 'Horta' } },
  ]);
});

test('a file question warns staff when this server cannot store files', () => {
  const offline = builder();
  newQuestionOfType(offline.view, 'file_upload');
  expect(offline.view.getByTestId('uploads-unavailable')).toBeTruthy();
  offline.view.unmount();
  const online = builder({ canStoreFiles: true });
  newQuestionOfType(online.view, 'file_upload');
  expect(online.view.queryByTestId('uploads-unavailable')).toBeNull();
});

test('the preview shows her phone in each language, right to left in Arabic and Farsi', () => {
  const { view } = builder();
  newQuestionOfType(view, 'date');
  input(view, 'question-label.ca').value = 'Data d’arribada';
  fireEvent.input(input(view, 'question-label.ca'));
  const preview = view.getByTestId('question-preview');
  expect(preview.getAttribute('dir')).toBe('ltr');
  expect(view.getByTestId('question-preview-label').textContent).toBe('Data d’arribada');
  fireEvent.change(view.getByTestId('question-preview-language'), { target: { value: 'ar' } });
  expect(view.getByTestId('question-preview').getAttribute('dir')).toBe('rtl');
  expect(view.getByTestId('question-preview').getAttribute('lang')).toBe('ar');
  // No Arabic label written: her phone shows the Catalan, and the preview says so.
  expect(view.getByTestId('question-preview-fallback')).toBeTruthy();
  fireEvent.change(view.getByTestId('question-preview-language'), { target: { value: 'fa' } });
  expect(view.getByTestId('question-preview').getAttribute('dir')).toBe('rtl');
});
