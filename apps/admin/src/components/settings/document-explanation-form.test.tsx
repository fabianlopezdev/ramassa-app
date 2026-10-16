/**
 * The note under the wizard's document step (RAPP-302): Catalan is required
 * once anything is written, empty languages are dropped, and all empty removes
 * the note.
 */
import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import { DocumentExplanationForm } from './document-explanation-form';

function type(view: ReturnType<typeof render>, language: string, value: string) {
  const field = view.container.querySelector<HTMLTextAreaElement>(
    `#document-explanation-${language}`,
  );
  if (field === null) throw new Error(`no ${language} field`);
  field.value = value;
}

test('saves the cleaned note, without the empty languages', async () => {
  const onSave = mock(async () => undefined);
  const view = render(<DocumentExplanationForm explanation={null} onSave={onSave} />);
  type(view, 'ca', ' Per als cursos. ');
  type(view, 'ar', 'للدورات.');
  fireEvent.submit(view.getByTestId('document-explanation-form'));
  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith({ ca: 'Per als cursos.', ar: 'للدورات.' }),
  );
});

test('another language without Catalan is not sent', async () => {
  const onSave = mock(async () => undefined);
  const view = render(<DocumentExplanationForm explanation={null} onSave={onSave} />);
  type(view, 'es', 'Para cursos.');
  fireEvent.submit(view.getByTestId('document-explanation-form'));
  await waitFor(() =>
    expect(view.getByText(/documentExplanationCatalanRequired|catalan/i)).not.toBeNull(),
  );
  expect(onSave).not.toHaveBeenCalled();
});

test('emptying every language removes the note', async () => {
  const onSave = mock(async () => undefined);
  const view = render(
    <DocumentExplanationForm explanation={{ ca: 'Per als cursos.' }} onSave={onSave} />,
  );
  type(view, 'ca', '');
  fireEvent.submit(view.getByTestId('document-explanation-form'));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(null));
});
