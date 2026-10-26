/**
 * The season authorization editor (RAPP-614): staff shape the consents and
 * the questions of a draft and see her phone's phases in each language, right
 * to left for Arabic and Farsi, in the screen editor's phone (RAPP-695); only an admin publishes, after a second click,
 * to the current season or a future one (RAPP-694).
 *
 * Typing into a controlled field does not reach React in this test DOM (no
 * admin test types text); the Playwright spec types and publishes for real.
 */
import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import {
  authorizationContentSchema,
  type AuthorizationContent,
  type AuthorizationVersion,
} from '@ramassa/shared/authorization';
import type { Season } from '@ramassa/shared/seasons';
import { buildAuthorizationVersion } from '@ramassa/shared/testing';
import { AuthorizationEditor, cleanAuthorizationContent } from './authorization-editor';

const CURRENT: Season = {
  id: '5eed0000-0000-4000-8040-000000000001',
  name: '2026/27',
  startsOn: '2026-09-01',
  isCurrent: true,
};
const NEXT: Season = {
  id: 'season-next',
  name: '2099/00',
  startsOn: '2099-09-01',
  isCurrent: false,
};
const PAST: Season = {
  id: 'season-past',
  name: '2025/26',
  startsOn: '2025-09-01',
  isCurrent: false,
};

function version(overrides: Partial<AuthorizationVersion> = {}): AuthorizationVersion {
  const row = buildAuthorizationVersion();
  return {
    id: row.id,
    seasonId: CURRENT.id,
    seasonName: '2026/27',
    versionNumber: 1,
    content: authorizationContentSchema.parse(row.content),
    publishedAt: '2026-09-01T09:00:00Z',
    isCurrent: true,
    updatedAt: '2026-09-01T09:00:00Z',
    ...overrides,
  };
}

const draftOf = (content?: AuthorizationContent) =>
  version({
    id: '5eed0000-0000-4000-8041-000000000099',
    seasonId: null,
    seasonName: null,
    versionNumber: null,
    publishedAt: null,
    isCurrent: false,
    ...(content === undefined ? {} : { content }),
  });

function renderEditor(
  versions: readonly AuthorizationVersion[],
  canPublish = true,
  seasons: readonly Season[] = [NEXT, CURRENT, PAST],
) {
  const onSaveDraft = mock(async (content: AuthorizationContent) => void content);
  const onDiscardDraft = mock(async () => undefined);
  const onPublish = mock(async (seasonId: string) => (seasonId === '' ? 0 : 2));
  const view = render(
    <AuthorizationEditor
      versions={versions}
      seasons={seasons}
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

function field(view: ReturnType<typeof render>, id: string) {
  const element = view.container.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
  if (element === null) throw new Error(`no ${id}`);
  return element;
}

test('the draft starts from the current version, its consents in order, on her phone too', () => {
  const { view } = renderEditor([version()]);
  expect(field(view, 'authorization-consent-label-participation').value).toBe('Participo.');
  const phone = phoneOn(view, 'consents').textContent ?? '';
  expect(phone.indexOf('Participo.')).toBeLessThan(phone.indexOf('Grups.'));
  expect(view.getByTestId('phone-step-health')).toBeTruthy();
  expect(view.getByTestId('phone-step-reregistration')).toBeTruthy();
});

test('in Arabic the fields and her phone read right to left (RAPP-695)', () => {
  const { view } = renderEditor([version()]);
  chooseLanguage(view, 'العربية');
  expect(view.getByTestId('phone-screen').getAttribute('dir')).toBe('rtl');
  expect(view.getByTestId('phone-screen').getAttribute('lang')).toBe('ar');
  expect(field(view, 'authorization-text-intro').getAttribute('dir')).toBe('rtl');
});

test('editing a field turns her phone to the screen that shows it (RAPP-695)', () => {
  const { view } = renderEditor([version()]);
  expect(view.getByTestId('phone-step-document').getAttribute('data-state')).toBe('active');
  fireEvent.focusIn(field(view, 'authorization-consent-label-participation'));
  expect(view.getByTestId('phone-step-consents').getAttribute('data-state')).toBe('active');
  fireEvent.focusIn(field(view, 'authorization-text-reregistration_intro'));
  expect(view.getByTestId('phone-step-reregistration').getAttribute('data-state')).toBe('active');
});

test('staff add a consent, mark it required, move it up and remove another', async () => {
  const { view, onSaveDraft } = renderEditor([version()]);
  fireEvent.click(view.getByTestId('authorization-consent-add'));
  expect(view.getByTestId('authorization-consent-consent_8')).toBeTruthy();
  fireEvent.click(field(view, 'authorization-consent-required-consent_8'));
  const ups = view.getAllByRole('button', { name: 'authorizationEditor.moveUp' });
  fireEvent.click(ups.at(-1)!);
  const phone = phoneOn(view, 'consents').textContent ?? '';
  expect(phone.indexOf('Grups.')).toBeGreaterThan(phone.indexOf('Imatge.'));
  fireEvent.click(view.getByTestId('authorization-consent-remove-newsletter'));
  fireEvent.click(view.getByTestId('authorization-save'));
  // The new consent has no words yet: the draft is refused until it has.
  expect(view.getByRole('alert').textContent).toBe('authorizationEditor.invalid');
  expect(onSaveDraft).not.toHaveBeenCalled();
});

test('image rights never become required, and the health consent is required with its question', () => {
  const { view } = renderEditor([version()]);
  expect(field(view, 'authorization-consent-required-image_rights').disabled).toBe(true);
  expect(field(view, 'authorization-consent-required-health_data').disabled).toBe(true);
  expect(view.queryByTestId('authorization-consent-remove-health_data')).toBeNull();
});

test('a question stops being asked only when optional, and the middle phase hides with both', async () => {
  const { view, onSaveDraft } = renderEditor([version()]);
  expect(field(view, 'authorization-health-asked').disabled).toBe(true);
  fireEvent.click(field(view, 'authorization-health-required'));
  expect(field(view, 'authorization-health-asked').disabled).toBe(false);
  fireEvent.click(field(view, 'authorization-health-asked'));
  fireEvent.click(field(view, 'authorization-emergency-asked'));
  expect(view.queryByTestId('phone-step-health')).toBeNull();
  fireEvent.click(view.getByTestId('authorization-save'));
  await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
  const saved = onSaveDraft.mock.calls[0]![0];
  expect(saved.questions.health).toMatchObject({ asked: false, required: false });
  expect(saved.questions.emergency_contact.asked).toBe(false);
  expect(authorizationContentSchema.safeParse(saved).success).toBe(true);
});

test('the emergency contact takes a privacy level', async () => {
  const { view, onSaveDraft } = renderEditor([version()]);
  fireEvent.change(field(view, 'authorization-emergency-privacy'), {
    target: { value: 'sensitive' },
  });
  fireEvent.click(field(view, 'authorization-emergency-required'));
  fireEvent.click(view.getByTestId('authorization-save'));
  await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
  expect(onSaveDraft.mock.calls[0]![0].questions.emergency_contact).toMatchObject({
    asked: true,
    required: true,
    privacy: 'sensitive',
  });
});

test('an admin publishes the draft after confirming; the design role cannot', async () => {
  const { view, onPublish } = renderEditor([draftOf(), version()]);
  expect(view.getByTestId('authorization-draft-row')).toBeTruthy();
  fireEvent.click(view.getByTestId('authorization-publish'));
  expect(onPublish).not.toHaveBeenCalled();
  fireEvent.click(view.getByTestId('authorization-publish'));
  await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
  // The current season by default (RAPP-694).
  expect(onPublish.mock.calls[0]?.[0]).toBe(CURRENT.id);
  view.unmount();
  const design = renderEditor([draftOf(), version()], false);
  expect(design.view.queryByTestId('authorization-publish')).toBeNull();
  expect(design.view.getByText('authorizationEditor.publishNeedsAdmin')).toBeTruthy();
  expect(design.view.getByTestId('authorization-discard')).toBeTruthy();
});

test('with no current season, the nearest future season takes the publish (RAPP-694)', async () => {
  const later: Season = { ...NEXT, id: 'season-later', name: '2100/01', startsOn: '2100-09-01' };
  const { view, onPublish } = renderEditor([draftOf()], true, [
    later,
    { ...CURRENT, isCurrent: false },
    NEXT,
    PAST,
  ]);
  fireEvent.click(view.getByTestId('authorization-publish'));
  expect(view.getByRole('alert').textContent).toBe('authorizationPublishConfirmFuture');
  fireEvent.click(view.getByTestId('authorization-publish'));
  await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
  expect(onPublish.mock.calls[0]?.[0]).toBe(NEXT.id);
});

test('with no season to take it, publishing waits', () => {
  const { view } = renderEditor([draftOf()], true, [PAST]);
  expect(view.getByTestId('authorization-publish').hasAttribute('disabled')).toBe(true);
});

test('the published versions are grouped by season, the current season marked (RAPP-694)', () => {
  const { view } = renderEditor([
    draftOf(),
    version({
      id: 'next-1',
      seasonId: NEXT.id,
      seasonName: NEXT.name,
      versionNumber: 1,
      isCurrent: false,
    }),
    version(),
  ]);
  const next = view.getByTestId(`authorization-season-${NEXT.id}`);
  const current = view.getByTestId(`authorization-season-${CURRENT.id}`);
  expect(next.textContent).toContain('2099/00');
  expect(next.textContent).not.toContain('authorizationCurrentSeasonBadge');
  expect(current.textContent).toContain('authorizationCurrentSeasonBadge');
});

test('cleaning drops empty languages and empty wording, and numbers the places', () => {
  const content = version().content;
  const cleaned = cleanAuthorizationContent({
    ...content,
    consents: {
      ...content.consents,
      participation: { ...content.consents.participation!, position: 40 },
    },
    texts: { intro: { ca: '  ', ar: 'مرحبا' }, health_title: { ca: '' } },
  });
  expect(cleaned.texts).toEqual({ intro: { ar: 'مرحبا' } });
  expect(cleaned.consents.participation?.position).toBe(6);
  expect(cleaned.consents.data_processing?.position).toBe(0);
});

test('a draft says that only test players see it (RAPP-619)', () => {
  const withDraft = renderEditor([draftOf(), version()]).view;
  expect(withDraft.getByTestId('authorization-draft-note')).toBeTruthy();
  withDraft.unmount();
  expect(renderEditor([version()]).view.queryByTestId('authorization-draft-note')).toBeNull();
});

test('the editor is headed as the screen editor heads a screen, its place in her onboarding', () => {
  const { view } = renderEditor([version()]);
  expect(
    view.getByRole('heading', { level: 2, name: 'onboardingBoard.authorization' }),
  ).toBeTruthy();
  expect(view.getByText('onboardingBoard.stepOf')).toBeTruthy();
});
