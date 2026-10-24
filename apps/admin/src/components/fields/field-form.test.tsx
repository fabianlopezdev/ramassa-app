/**
 * The field form (RAPP-650): a new field sends its name, type and privacy
 * with no places; a field whose privacy is locked keeps its level and offers
 * no Change for it; each type asks for its own settings (RAPP-610).
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

// Every field kind the app uses (RAPP-610).

function newField(
  type: string,
  props: { readonly canStoreFiles?: boolean; readonly withPreview?: boolean } = {},
) {
  const onSave = mock(async () => undefined);
  const view = render(
    <FieldForm
      value={null}
      title="New field"
      nameLegend="Name"
      submitLabel="Save field"
      isPrivacyLocked={false}
      canStoreFiles={props.canStoreFiles ?? false}
      withPreview={props.withPreview ?? false}
      onSave={onSave}
      onCancel={() => undefined}
    />,
  );
  fireEvent.click(view.getByTestId('question-type-change'));
  fireEvent.click(view.getByTestId(`question-type-option-${type}`));
  return { view, onSave };
}

async function savedDraft(
  view: ReturnType<typeof render>,
  onSave: ReturnType<typeof mock>,
): Promise<Record<string, unknown>> {
  fireEvent.submit(view.getByTestId('field-form'));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  return (onSave.mock.calls[0] as unknown as [Record<string, unknown>])[0];
}

test('each type says in a line what it asks', () => {
  const { view } = newField('item_list');
  expect(view.getByTestId('type-description').textContent).toMatch(
    /questions\.typeHelp\.item_list|adds items one by one/,
  );
});

test('a number field sends its range and that it is whole', async () => {
  const { view, onSave } = newField('number');
  inputOf(view, 'question-label.ca').value = 'Quants fills tens?';
  inputOf(view, 'setting-integer').checked = true;
  inputOf(view, 'setting-min').value = '0';
  inputOf(view, 'setting-max').value = '15';
  const draft = await savedDraft(view, onSave);
  expect(draft.settings).toEqual({ integer: true, min: 0, max: 15 });
  expect(draft.options).toEqual([]);
});

test('a range upside down is refused before it is sent', async () => {
  const { view, onSave } = newField('number');
  inputOf(view, 'question-label.ca').value = 'Edat';
  inputOf(view, 'setting-min').value = '9';
  inputOf(view, 'setting-max').value = '1';
  fireEvent.submit(view.getByTestId('field-form'));
  await waitFor(() =>
    expect(view.getByText(/questions\.settingsInvalid|Check the settings/)).toBeTruthy(),
  );
  expect(onSave).not.toHaveBeenCalled();
});

test('a consent sends its own text', async () => {
  const { view, onSave } = newField('consent');
  inputOf(view, 'question-label.ca').value = 'Transport';
  inputOf(view, 'setting-consent-text.ca').value = 'Accepto que em portin amb cotxe';
  const draft = await savedDraft(view, onSave);
  expect(draft.settings).toEqual({ text: { ca: 'Accepto que em portin amb cotxe' } });
});

test('a long searchable list takes options pasted one per line', async () => {
  const { view, onSave } = newField('search_choice');
  inputOf(view, 'question-label.ca').value = 'Barri';
  view.container.querySelector<HTMLTextAreaElement>('[name="options-paste"]')!.value =
    'Gràcia\nSants\n\nHorta\nSants';
  const draft = await savedDraft(view, onSave);
  expect(draft.options).toEqual([
    { id: null, label: { ca: 'Gràcia' } },
    { id: null, label: { ca: 'Sants' } },
    { id: null, label: { ca: 'Horta' } },
  ]);
});

test('a file field warns staff when this server cannot store files', () => {
  const offline = newField('file_upload');
  expect(offline.view.getByTestId('uploads-unavailable')).toBeTruthy();
  offline.view.unmount();
  const online = newField('file_upload', { canStoreFiles: true });
  expect(online.view.queryByTestId('uploads-unavailable')).toBeNull();
});

test('the preview shows her phone in each language, right to left in Arabic and Farsi', () => {
  const { view } = newField('date', { withPreview: true });
  inputOf(view, 'question-label.ca').value = 'Data d’arribada';
  fireEvent.input(inputOf(view, 'question-label.ca'));
  expect(view.getByTestId('question-preview').getAttribute('dir')).toBe('ltr');
  expect(view.getByTestId('question-preview-label').textContent).toBe('Data d’arribada');
  fireEvent.change(view.getByTestId('question-preview-language'), { target: { value: 'ar' } });
  expect(view.getByTestId('question-preview').getAttribute('dir')).toBe('rtl');
  expect(view.getByTestId('question-preview').getAttribute('lang')).toBe('ar');
  // No Arabic name written: her phone shows the Catalan, and the preview says so.
  expect(view.getByTestId('question-preview-fallback')).toBeTruthy();
  fireEvent.change(view.getByTestId('question-preview-language'), { target: { value: 'fa' } });
  expect(view.getByTestId('question-preview').getAttribute('dir')).toBe('rtl');
});
