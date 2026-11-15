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
  const view = form({ question: 'first_name', label: 'Nom' });
  expect(input(view, 'builtin-hidden').disabled).toBe(true);
  expect(view.getByText(/questions\.lock\.required|needs this answer/)).toBeTruthy();
});

test('the options are the field’s: the form sends none (RAPP-664, RAPP-665)', async () => {
  const onSave = mock(async () => undefined);
  const view = render(
    <BuiltinForm
      info={{ question: 'childcare_need', label: 'Cura dels fills' }}
      override={{
        question: 'childcare_need',
        label: null,
        help: null,
        isHidden: false,
      }}
      required={DEFAULT_REQUIRED_QUESTIONS}
      onSave={onSave}
      onCancel={() => undefined}
    />,
  );
  expect(view.container.querySelector('[name^="builtin-option-"]')).toBeNull();
  input(view, 'builtin-label.ca').value = 'Cangur';
  fireEvent.submit(view.getByTestId('builtin-form'));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  const [override] = onSave.mock.calls[0] as unknown as [Record<string, unknown>];
  expect(override.label).toEqual({ ca: 'Cangur' });
  expect(override).not.toHaveProperty('optionOverrides');
});
