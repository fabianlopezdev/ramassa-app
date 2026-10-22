/**
 * The app terms editor (RAPP-613): staff edit a draft per language and see
 * the phone's two screens in that language, right to left for Arabic and
 * Farsi; Catalan is required; only an admin publishes, after a second click.
 */
import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import type { AppTermsContent, AppTermsVersion } from '@ramassa/shared/intake';
import { buildAppTermsVersion } from '@ramassa/shared/testing';
import { AppTermsEditor } from './app-terms-editor';

function version(overrides: Partial<AppTermsVersion> = {}): AppTermsVersion {
  const row = buildAppTermsVersion();
  return {
    id: row.id,
    versionNumber: 1,
    content: row.content as unknown as AppTermsContent,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    acceptanceCount: 20,
    ...overrides,
  };
}

function renderEditor(versions: readonly AppTermsVersion[], canPublish = true) {
  const onSaveDraft = mock(async (content: AppTermsContent) => void content);
  const onDiscardDraft = mock(async () => undefined);
  const onPublish = mock(async () => 2);
  const view = render(
    <AppTermsEditor
      versions={versions}
      canPublish={canPublish}
      onSaveDraft={onSaveDraft}
      onDiscardDraft={onDiscardDraft}
      onPublish={onPublish}
    />,
  );
  return { view, onSaveDraft, onDiscardDraft, onPublish };
}

function input(view: ReturnType<typeof render>, id: string) {
  const field = view.container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`);
  if (field === null) throw new Error(`no ${id}`);
  return field;
}

// Typing into a controlled field does not reach React in this test DOM (no
// admin test types text); the Playwright spec types and publishes for real.

test('the draft starts from the current version, shown as the phone shows it', () => {
  const { view } = renderEditor([version()]);
  expect(input(view, 'app-terms-body').value).toBe('Text dels termes.');
  expect(view.getByTestId('app-terms-preview-terms').textContent).toContain('Text dels termes.');
  expect(view.getByTestId('app-terms-preview-intro').textContent).toContain(
    'Per organitzar l’activitat.',
  );
  expect(view.getByTestId('app-terms-preview-terms').getAttribute('dir')).toBe('ltr');
});

test('in Arabic the fields and the preview read right to left, and say when they show Catalan', () => {
  const { view } = renderEditor([version()]);
  fireEvent.change(input(view, 'app-terms-language'), { target: { value: 'ar' } });
  expect(view.getByTestId('app-terms-preview-terms').getAttribute('dir')).toBe('rtl');
  expect(view.getByTestId('app-terms-preview-intro').getAttribute('lang')).toBe('ar');
  expect(input(view, 'app-terms-body').getAttribute('dir')).toBe('rtl');
  expect(input(view, 'app-terms-body').value).toBe('');
  expect(view.getByTestId('app-terms-fallback')).toBeTruthy();
});

test('saving sends the draft; a draft without Catalan is not sent', async () => {
  const { view, onSaveDraft } = renderEditor([version()]);
  fireEvent.click(view.getByTestId('app-terms-save'));
  await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
  expect(onSaveDraft.mock.calls[0]?.[0].body).toEqual({ ca: 'Text dels termes.' });

  view.unmount();
  const empty = renderEditor([]);
  fireEvent.click(empty.view.getByTestId('app-terms-save'));
  expect(empty.view.getByRole('alert').textContent).toBe('appTerms.invalid');
  expect(empty.onSaveDraft).not.toHaveBeenCalled();
});

test('an admin publishes the draft after confirming', async () => {
  const draft = version({
    id: '5eed0000-0000-4000-8099-000000000009',
    versionNumber: null,
    publishedAt: null,
  });
  const { view, onPublish } = renderEditor([draft, version()]);
  fireEvent.click(view.getByTestId('app-terms-publish'));
  expect(onPublish).not.toHaveBeenCalled();
  expect(view.getByRole('alert').textContent).toBe('appTerms.publishConfirm');
  fireEvent.click(view.getByTestId('app-terms-publish'));
  await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
});

test('the design role saves drafts but has no publish button', () => {
  const draft = version({
    id: '5eed0000-0000-4000-8099-000000000009',
    versionNumber: null,
    publishedAt: null,
  });
  const { view } = renderEditor([draft, version()], false);
  expect(view.queryByTestId('app-terms-publish')).toBeNull();
  expect(view.getByText('appTerms.publishNeedsAdmin')).toBeTruthy();
  expect(view.getByTestId('app-terms-discard')).toBeTruthy();
});
