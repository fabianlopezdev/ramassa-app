/**
 * The wording of an app question (RAPP-307): a question the app needs cannot
 * be hidden, and the form says why; an option is relabelled or hidden, but one
 * always stays visible.
 */
import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import { DEFAULT_REQUIRED_QUESTIONS } from '@ramassa/shared/intake';
import { BuiltinForm, type BuiltinQuestionInfo } from './builtin-question-form';

function input(view: ReturnType<typeof render>, name: string): HTMLInputElement {
  const element = view.container.querySelector<HTMLInputElement>(`[name="${name}"]`);
  if (element === null) throw new Error(`no ${name}`);
  return element;
}

function form(info: BuiltinQuestionInfo, onSave = mock(async () => undefined)) {
  return render(
    <BuiltinForm
      info={info}
      override={undefined}
      required={DEFAULT_REQUIRED_QUESTIONS}
      onSave={onSave}
      onCancel={() => undefined}
    />,
  );
}

test('a question the app needs cannot be hidden, and the form says why', () => {
  const view = form({ question: 'first_name', label: 'Nom', options: [] });
  expect(input(view, 'builtin-hidden').disabled).toBe(true);
  expect(view.getByText(/questions\.lock\.required|needs this answer/)).toBeTruthy();
});

test('a built-in option is relabelled or hidden, but one stays visible', async () => {
  const onSave = mock(async () => undefined);
  const view = form(
    {
      question: 'childcare_need',
      label: 'Cura dels fills',
      options: [
        { value: 'yes', label: 'Sí' },
        { value: 'no', label: 'No' },
      ],
    },
    onSave,
  );
  input(view, 'builtin-option-hidden-yes').checked = true;
  input(view, 'builtin-option-hidden-no').checked = true;
  fireEvent.submit(view.getByTestId('builtin-form'));
  await waitFor(() =>
    expect(view.getByText(/questions\.oneOptionStays|one option visible/)).toBeTruthy(),
  );
  expect(onSave).not.toHaveBeenCalled();

  input(view, 'builtin-option-hidden-no').checked = false;
  input(view, 'builtin-option-no.ca').value = 'Ara no';
  fireEvent.submit(view.getByTestId('builtin-form'));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  const [override] = onSave.mock.calls[0] as unknown as [
    { optionOverrides: Record<string, unknown>; isHidden: boolean },
  ];
  expect(override.isHidden).toBe(false);
  expect(override.optionOverrides).toEqual({
    yes: { label: {}, hidden: true },
    no: { label: { ca: 'Ara no' }, hidden: false },
  });
});
