/**
 * The note under the wizard's document step (RAPP-302): Catalan is required
 * once anything is written, empty languages are dropped, and all empty removes
 * the note. It is written in the language picked at the top of the screen's
 * editor, one at a time (RAPP-714).
 */
import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import type { LanguageCode, LocalizedText } from '@ramassa/shared/schemas';
import { DocumentExplanationForm } from './document-explanation-form';

function type(view: ReturnType<typeof render>, language: string, value: string) {
  const field = view.container.querySelector<HTMLTextAreaElement>(
    `#document-explanation-${language}`,
  );
  if (field === null) throw new Error(`no ${language} field`);
  fireEvent.change(field, { target: { value } });
}

function form(language: LanguageCode, explanation: LocalizedText | null, onSave: never) {
  return <DocumentExplanationForm explanation={explanation} language={language} onSave={onSave} />;
}

test('shows only the language picked at the top, and keeps the others', async () => {
  const onSave = mock(async () => undefined);
  const view = render(form('ca', null, onSave as never));
  expect(view.container.querySelectorAll('textarea')).toHaveLength(1);
  type(view, 'ca', ' Per als cursos. ');
  view.rerender(form('ar', null, onSave as never));
  type(view, 'ar', 'للدورات.');
  fireEvent.submit(view.getByTestId('document-explanation-form'));
  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith({ ca: 'Per als cursos.', ar: 'للدورات.' }),
  );
});

test('another language without Catalan is not sent', async () => {
  const onSave = mock(async () => undefined);
  const view = render(form('es', null, onSave as never));
  type(view, 'es', 'Para cursos.');
  fireEvent.submit(view.getByTestId('document-explanation-form'));
  await waitFor(() =>
    expect(view.getByText(/documentExplanationCatalanRequired|catalan/i)).not.toBeNull(),
  );
  expect(onSave).not.toHaveBeenCalled();
});

test('emptying every language removes the note', async () => {
  const onSave = mock(async () => undefined);
  const view = render(form('ca', { ca: 'Per als cursos.' }, onSave as never));
  type(view, 'ca', '');
  fireEvent.submit(view.getByTestId('document-explanation-form'));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(null));
});
