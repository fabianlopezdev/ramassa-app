/**
 * One editor for every field on her page (RAPP-664): the field's own input by
 * its type, the fields that go with it asked only while they apply, and only
 * what she changed is saved.
 */
import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import type { CustomQuestion } from '@ramassa/shared/intake-builder';
import { FieldAnswerEditor } from './field-answer-editor';

function question(
  id: string,
  type: CustomQuestion['type'],
  options: CustomQuestion['options'] = [],
): CustomQuestion {
  return {
    id,
    type,
    label: { ca: id },
    help: null,
    privacy: 'personal',
    isArchived: false,
    settings: {},
    options,
  };
}

const documentType = question('type', 'single_choice', [
  { id: 'nie', label: { ca: 'NIE' }, isArchived: false },
  { id: 'none', label: { ca: 'Cap' }, isArchived: false },
]);
const documentNumber = question('number', 'short_text');

function renderDocument(onSave = mock(async () => undefined), onCancel = mock(() => undefined)) {
  const view = render(
    <FieldAnswerEditor
      question={documentType}
      value={undefined}
      partners={[
        {
          field: { id: 'number' } as never,
          question: documentNumber,
          value: undefined,
          asksWhen: (value) => typeof value === 'string' && value !== 'none',
        },
      ]}
      language="ca"
      onSave={onSave}
      onCancel={onCancel}
    />,
  );
  return { view, onSave, onCancel };
}

test('the number is asked once a document type that takes one is chosen, and saved with it', async () => {
  const { view, onSave } = renderDocument();
  const select = view.container.querySelector<HTMLSelectElement>('#fitxa-answer-type')!;
  expect(view.container.querySelector('#fitxa-answer-number')).toBeNull();

  fireEvent.change(select, { target: { value: 'nie' } });
  const number = view.container.querySelector<HTMLInputElement>('#fitxa-answer-number');
  expect(number).not.toBeNull();
  fireEvent.change(number!, { target: { value: 'X1234567L' } });

  fireEvent.submit(view.container.querySelector('form')!);
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  expect(onSave.mock.calls[0]).toEqual([{ type: 'nie', number: 'X1234567L' }] as never);
});

test('no document asks no number', async () => {
  const { view, onSave } = renderDocument();
  fireEvent.change(view.container.querySelector('#fitxa-answer-type')!, {
    target: { value: 'none' },
  });
  expect(view.container.querySelector('#fitxa-answer-number')).toBeNull();
  fireEvent.submit(view.container.querySelector('form')!);
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  expect(onSave.mock.calls[0]).toEqual([{ type: 'none' }] as never);
});

test('nothing changed closes the editor without saving', async () => {
  const { view, onSave, onCancel } = renderDocument();
  fireEvent.submit(view.container.querySelector('form')!);
  await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  expect(onSave).not.toHaveBeenCalled();
});

test('a name is never emptied', async () => {
  const onSave = mock(async () => undefined);
  const view = render(
    <FieldAnswerEditor
      question={question('first', 'short_text')}
      value="Rosa"
      isRequired
      language="ca"
      onSave={onSave}
      onCancel={() => undefined}
    />,
  );
  fireEvent.change(view.container.querySelector('#fitxa-answer-first')!, {
    target: { value: '  ' },
  });
  fireEvent.submit(view.container.querySelector('form')!);
  await waitFor(() =>
    expect(view.getByTestId('fitxa-answer-first-error').textContent).toBe(
      'onboarding:errorRequired',
    ),
  );
  expect(onSave).not.toHaveBeenCalled();
});
