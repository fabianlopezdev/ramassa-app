/**
 * The app terms editor (RAPP-613): staff edit a draft per language, one screen
 * of its board at a time (RAPP-696), and see that screen on her phone in that
 * language (RAPP-695), right to left for Arabic and Farsi; Catalan is
 * required; only an admin saves it for the players, and once anyone accepted,
 * Desa asks Correcció or Nova versió (RAPP-696).
 */
import type { TermsPhoneStep } from '@/components/legal/legal-phone-content';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import type { SaveKind } from '@ramassa/shared/authorization';
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
    isCorrection: false,
    ...overrides,
  };
}

function renderEditor(
  versions: readonly AppTermsVersion[],
  { step = 'terms', canPublish = true }: { step?: TermsPhoneStep; canPublish?: boolean } = {},
) {
  const onSaveDraft = mock(async (content: AppTermsContent) => void content);
  const onDiscardDraft = mock(async () => undefined);
  const onPublish = mock(async (kind: SaveKind) => (kind === 'new' ? 2 : 3));
  const view = render(
    <AppTermsEditor
      step={step}
      versions={versions}
      canPublish={canPublish}
      onSaveDraft={onSaveDraft}
      onDiscardDraft={onDiscardDraft}
      onPublish={onPublish}
    />,
  );
  return { view, onSaveDraft, onDiscardDraft, onPublish };
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

const draft = (overrides: Partial<AppTermsVersion> = {}) =>
  version({
    id: '5eed0000-0000-4000-8099-000000000009',
    versionNumber: null,
    publishedAt: null,
    acceptanceCount: 0,
    ...overrides,
  });

// Typing into a controlled field does not reach React in this test DOM (no
// admin test types text); the Playwright spec types and publishes for real.

test('each screen edits its own fields, shown as her phone shows it (RAPP-696)', () => {
  const terms = renderEditor([version()]).view;
  expect(input(terms, 'app-terms-body').value).toBe('Text dels termes.');
  expect(terms.getByTestId('phone-screen').textContent).toContain('Text dels termes.');
  expect(terms.getByTestId('phone-screen').getAttribute('dir')).toBe('ltr');
  expect(terms.container.querySelector('#app-terms-point-title-0')).toBeNull();
  terms.unmount();
  const intro = renderEditor([version()], { step: 'terms-intro' }).view;
  expect(intro.getByTestId('phone-screen').textContent).toContain('Per organitzar l’activitat.');
  expect(input(intro, 'app-terms-point-title-0')).toBeTruthy();
  expect(intro.container.querySelector('#app-terms-body')).toBeNull();
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
  // Nothing changed: nothing to save (RAPP-751).
  expect((view.getByTestId('app-terms-save') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(input(view, 'app-terms-body'), { target: { value: 'Text nou dels termes.' } });
  fireEvent.click(view.getByTestId('app-terms-save'));
  await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
  expect(onSaveDraft.mock.calls[0]?.[0].body).toEqual({ ca: 'Text nou dels termes.' });

  view.unmount();
  const empty = renderEditor([]);
  chooseLanguage(empty.view, 'Español');
  fireEvent.change(input(empty.view, 'app-terms-body'), {
    target: { value: 'Solo en castellano.' },
  });
  fireEvent.click(empty.view.getByTestId('app-terms-save'));
  expect(empty.view.getByRole('alert').textContent).toBe('appTerms.invalid');
  expect(empty.onSaveDraft).not.toHaveBeenCalled();
});

test('nobody accepted yet: Desa publishes at once as a new version', async () => {
  const { view, onPublish } = renderEditor([draft(), version({ acceptanceCount: 0 })]);
  fireEvent.click(view.getByTestId('app-terms-publish'));
  await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
  expect(onPublish.mock.calls[0]).toEqual(['new']);
  expect(view.queryByTestId('save-kind-dialog')).toBeNull();
});

test('once anyone accepted, Desa asks Correcció or Nova versió (RAPP-696)', async () => {
  const { view, onPublish } = renderEditor([draft(), version()]);
  fireEvent.click(view.getByTestId('app-terms-publish'));
  await waitFor(() => expect(view.getByTestId('save-kind-dialog')).toBeTruthy());
  expect(onPublish).not.toHaveBeenCalled();
  fireEvent.click(view.getByTestId('save-kind-confirm'));
  await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
  expect(onPublish.mock.calls[0]).toEqual(['correction']);
});

test('the design role saves drafts but has no Desa', () => {
  const { view } = renderEditor([draft(), version()], { canPublish: false });
  expect(view.queryByTestId('app-terms-publish')).toBeNull();
  expect(view.getByText('appTerms.publishNeedsAdmin')).toBeTruthy();
  expect(view.getByTestId('app-terms-discard')).toBeTruthy();
});
