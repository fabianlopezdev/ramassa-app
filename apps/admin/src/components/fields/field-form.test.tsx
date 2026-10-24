/**
 * The field form (RAPP-650): a new field sends its name, type and privacy
 * with no places; a field whose privacy is locked keeps its level and offers
 * no Change for it.
 */
import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import { FieldForm } from './field-form';

function inputOf(view: ReturnType<typeof render>, name: string): HTMLInputElement {
  return view.container.querySelector(`[name="${name}"]`) as HTMLInputElement;
}

test('a new field is sent with its Catalan name and the privacy chosen', async () => {
  const onSave = mock(async () => undefined);
  const view = render(
    <FieldForm
      value={null}
      title="New field"
      nameLegend="Name"
      submitLabel="Save field"
      isPrivacyLocked={false}
      canStoreFiles
      onSave={onSave}
      onCancel={() => undefined}
    />,
  );
  inputOf(view, 'question-label.ca').value = 'Talla de guants';
  fireEvent.submit(view.getByTestId('field-form'));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  const [draft] = onSave.mock.calls[0] as unknown as [Record<string, unknown>];
  expect(draft).toMatchObject({
    type: 'short_text',
    label: { ca: 'Talla de guants' },
    privacy: 'personal',
    help: null,
    options: [],
  });
});

test('a field without a Catalan name is not sent', async () => {
  const onSave = mock(async () => undefined);
  const view = render(
    <FieldForm
      value={null}
      title="New field"
      nameLegend="Name"
      submitLabel="Save field"
      isPrivacyLocked={false}
      canStoreFiles
      onSave={onSave}
      onCancel={() => undefined}
    />,
  );
  fireEvent.submit(view.getByTestId('field-form'));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(onSave).not.toHaveBeenCalled();
});

test('a locked privacy keeps its level and offers no Change', () => {
  const view = render(
    <FieldForm
      value={{
        type: 'long_text',
        label: { ca: 'Al·lèrgies' },
        help: null,
        privacy: 'sensitive',
        settings: {},
        options: [],
      }}
      title="Edit field"
      nameLegend="Name"
      submitLabel="Save field"
      isPrivacyLocked
      canStoreFiles
      onSave={async () => undefined}
      onCancel={() => undefined}
    />,
  );
  expect(view.queryByTestId('question-privacy-change')).toBeNull();
  expect(view.queryByTestId('question-type-change')).toBeNull();
});
