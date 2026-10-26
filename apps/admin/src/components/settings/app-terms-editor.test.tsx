/**
 * The app terms editor (RAPP-613): staff edit a draft per language and see
 * the phone's two screens in that language, in the screen editor's phone
 * (RAPP-695), right to left for Arabic and
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

/** The phone's text, on the screen picked above it (RAPP-695). */
function phoneOn(view: ReturnType<typeof render>, step: string) {
  fireEvent.mouseDown(view.getByTestId(`phone-step-${step}`));
  return view.getByTestId('phone-screen');
}

function chooseLanguage(view: ReturnType<typeof render>, name: string) {
  const group = view.getByTestId('editor-language');
  const item = group.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`);
  if (item === null) throw new Error(`no ${name}`);
  fireEvent.click(item);
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
  expect(view.getByTestId('phone-screen').textContent).toContain('Text dels termes.');
  expect(view.getByTestId('phone-screen').getAttribute('dir')).toBe('ltr');
  expect(phoneOn(view, 'terms-intro').textContent).toContain('Per organitzar l’activitat.');
});

test('in Arabic the fields and her phone read right to left, the phone in Catalan', () => {
  const { view } = renderEditor([version()]);
  chooseLanguage(view, 'العربية');
  expect(view.getByTestId('phone-screen').getAttribute('dir')).toBe('rtl');
  expect(view.getByTestId('phone-screen').getAttribute('lang')).toBe('ar');
  expect(view.getByTestId('phone-screen').textContent).toContain('Text dels termes.');
  expect(input(view, 'app-terms-body').getAttribute('dir')).toBe('rtl');
  expect(input(view, 'app-terms-body').value).toBe('');
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

test('a draft says that only test players see it (RAPP-619)', () => {
  const draft = version({
    id: '5eed0000-0000-4000-8099-000000000099',
    versionNumber: null,
    publishedAt: null,
    acceptanceCount: 0,
  });
  expect(renderEditor([draft, version()]).view.getByTestId('app-terms-draft-note')).toBeTruthy();
});

test('without a draft there is no draft note', () => {
  expect(renderEditor([version()]).view.queryByTestId('app-terms-draft-note')).toBeNull();
});

test('the heading names the screen on her phone and follows its tab (RAPP-695)', () => {
  const { view } = renderEditor([version()]);
  expect(view.getByRole('heading', { level: 2 }).textContent).toBe(
    'builtinScreens.screenName.terms',
  );
  phoneOn(view, 'terms-intro');
  expect(view.getByRole('heading', { level: 2 }).textContent).toBe(
    'builtinScreens.screenName.terms-intro',
  );
});
