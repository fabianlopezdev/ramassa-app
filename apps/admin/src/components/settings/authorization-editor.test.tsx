/**
 * The season authorization editor (RAPP-614): staff shape the consents and
 * the questions of a draft, one screen of its board at a time (RAPP-696), and
 * see her phone on that screen in each language, right to left for Arabic and
 * Farsi (RAPP-695). Only an admin saves it for the players, to the current
 * season or a future one (RAPP-694); once anyone signed, Desa asks Correcció
 * or Nova versió (RAPP-696).
 *
 * Typing into a controlled field does not reach React in this test DOM (no
 * admin test types text); the Playwright spec types and publishes for real.
 */
import type { AuthorizationPhoneStep } from '@/components/legal/legal-phone-content';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import {
  authorizationContentSchema,
  type AuthorizationContent,
  type AuthorizationVersion,
  type SaveKind,
} from '@ramassa/shared/authorization';
import type { Season } from '@ramassa/shared/seasons';
import { buildAuthorizationVersion } from '@ramassa/shared/testing';

// The Health screen's field picker writes through the database client; this
// test only needs to see that the screen shows it (RAPP-698).
mock.module('@/components/onboarding/screen-fields', () => ({
  ScreenFieldsSection: () => <div data-testid="screen-questions" />,
}));
const { AuthorizationEditor, cleanAuthorizationContent } = await import('./authorization-editor');

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
    isCorrection: false,
    signatureCount: 0,
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
  {
    step = 'document',
    canPublish = true,
    seasons = [NEXT, CURRENT, PAST],
  }: {
    readonly step?: AuthorizationPhoneStep;
    readonly canPublish?: boolean;
    readonly seasons?: readonly Season[];
  } = {},
) {
  const onSaveDraft = mock(async (content: AuthorizationContent) => void content);
  const onDiscardDraft = mock(async () => undefined);
  const onPublish = mock(async (seasonId: string, kind: SaveKind) =>
    seasonId === '' || kind === 'new' ? 2 : 3,
  );
  const view = render(
    <AuthorizationEditor
      step={step}
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

test('each screen edits its own fields, with her phone on that screen (RAPP-696)', () => {
  const document = renderEditor([version()]).view;
  expect(field(document, 'authorization-title')).toBeTruthy();
  expect(document.queryByTestId('authorization-consents')).toBeNull();
  expect(document.queryByTestId('phone-step-consents')).toBeNull();
  document.unmount();
  const consents = renderEditor([version()], { step: 'consents' }).view;
  expect(field(consents, 'authorization-consent-label-participation').value).toBe('Participo.');
  expect(consents.container.querySelector('#authorization-title')).toBeNull();
  const phone = consents.getByTestId('phone-screen').textContent ?? '';
  expect(phone.indexOf('Participo.')).toBeLessThan(phone.indexOf('Grups.'));
  consents.unmount();
  const reregistration = renderEditor([version()], { step: 'reregistration' }).view;
  expect(field(reregistration, 'authorization-text-reregistration_intro')).toBeTruthy();
  expect(reregistration.container.querySelector('#authorization-text-intro')).toBeNull();
});

test('in Arabic the fields and her phone read right to left (RAPP-695)', () => {
  const { view } = renderEditor([version()]);
  chooseLanguage(view, 'العربية');
  expect(view.getByTestId('phone-screen').getAttribute('dir')).toBe('rtl');
  expect(view.getByTestId('phone-screen').getAttribute('lang')).toBe('ar');
  expect(field(view, 'authorization-text-intro').getAttribute('dir')).toBe('rtl');
});

test('staff add a consent, mark it required, move it up and remove another', async () => {
  const { view, onSaveDraft } = renderEditor([version()], { step: 'consents' });
  fireEvent.click(view.getByTestId('authorization-consent-add'));
  expect(view.getByTestId('authorization-consent-consent_8')).toBeTruthy();
  fireEvent.click(field(view, 'authorization-consent-required-consent_8'));
  const ups = view.getAllByRole('button', { name: 'authorizationEditor.moveUp' });
  fireEvent.click(ups.at(-1)!);
  const phone = view.getByTestId('phone-screen').textContent ?? '';
  expect(phone.indexOf('Grups.')).toBeGreaterThan(phone.indexOf('Imatge.'));
  fireEvent.click(view.getByTestId('authorization-consent-remove-newsletter'));
  fireEvent.click(view.getByTestId('authorization-save'));
  // The new consent has no words yet: the draft is refused until it has.
  expect(view.getByRole('alert').textContent).toBe('authorizationEditor.invalid');
  expect(onSaveDraft).not.toHaveBeenCalled();
});

test('image rights never become required; the health consent stays while her health is asked', () => {
  const { view } = renderEditor([version()], { step: 'consents' });
  expect(field(view, 'authorization-consent-required-image_rights').disabled).toBe(true);
  // No health field placed in this catalog: the health consent is an ordinary consent (RAPP-698).
  expect(field(view, 'authorization-consent-required-health_data').disabled).toBe(false);
  expect(view.getByTestId('authorization-consent-remove-health_data')).toBeTruthy();
});

test('a draft saved from the Health screen carries no questions: its fields are placements (RAPP-698)', async () => {
  const { view, onSaveDraft } = renderEditor([version()], { step: 'health' });
  expect(view.getByTestId('screen-questions')).toBeTruthy();
  fireEvent.click(view.getByTestId('authorization-save'));
  await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
  const saved = onSaveDraft.mock.calls[0]![0];
  expect('questions' in saved).toBe(false);
  expect(authorizationContentSchema.safeParse(saved).success).toBe(true);
});

test('nobody signed yet: Desa saves the draft and publishes it at once; the design role has no Desa', async () => {
  const { view, onSaveDraft, onPublish } = renderEditor([draftOf(), version()]);
  fireEvent.click(view.getByTestId('authorization-publish'));
  await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
  expect(onSaveDraft).toHaveBeenCalledTimes(1);
  expect(view.queryByTestId('save-kind-dialog')).toBeNull();
  // The current season by default (RAPP-694), as a new version.
  expect(onPublish.mock.calls[0]).toEqual([CURRENT.id, 'new']);
  view.unmount();
  const design = renderEditor([draftOf(), version()], { canPublish: false });
  expect(design.view.queryByTestId('authorization-publish')).toBeNull();
  expect(design.view.getByText('authorizationEditor.publishNeedsAdmin')).toBeTruthy();
  expect(design.view.getByTestId('authorization-discard')).toBeTruthy();
});

test('once anyone signed, Desa asks: a correction keeps them covered (RAPP-696)', async () => {
  const { view, onPublish } = renderEditor([draftOf(), version({ signatureCount: 4 })]);
  fireEvent.click(view.getByTestId('authorization-publish'));
  await waitFor(() => expect(view.getByTestId('save-kind-dialog')).toBeTruthy());
  expect(onPublish).not.toHaveBeenCalled();
  expect(view.getByTestId('save-kind-correction').getAttribute('aria-checked')).toBe('true');
  fireEvent.click(view.getByTestId('save-kind-confirm'));
  await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
  expect(onPublish.mock.calls[0]).toEqual([CURRENT.id, 'correction']);
});

test('a new version is chosen in the same dialog', async () => {
  const { view, onPublish } = renderEditor([draftOf(), version({ signatureCount: 4 })]);
  fireEvent.click(view.getByTestId('authorization-publish'));
  await waitFor(() => expect(view.getByTestId('save-kind-dialog')).toBeTruthy());
  fireEvent.click(view.getByTestId('save-kind-new'));
  fireEvent.click(view.getByTestId('save-kind-confirm'));
  await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
  expect(onPublish.mock.calls[0]).toEqual([CURRENT.id, 'new']);
});

test('with no current season, the nearest future season takes the publish (RAPP-694)', async () => {
  const later: Season = { ...NEXT, id: 'season-later', name: '2100/01', startsOn: '2100-09-01' };
  const { view, onPublish } = renderEditor([draftOf()], {
    seasons: [later, { ...CURRENT, isCurrent: false }, NEXT, PAST],
  });
  fireEvent.click(view.getByTestId('authorization-publish'));
  await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
  expect(onPublish.mock.calls[0]?.[0]).toBe(NEXT.id);
});

test('with no season to take it, or nothing changed, Desa waits', () => {
  const noSeason = renderEditor([draftOf()], { seasons: [PAST] }).view;
  expect(noSeason.getByTestId('authorization-publish').hasAttribute('disabled')).toBe(true);
  noSeason.unmount();
  const unchanged = renderEditor([version()]).view;
  expect(unchanged.getByTestId('authorization-publish').hasAttribute('disabled')).toBe(true);
});

test('cleaning drops empty languages and empty wording, numbers the places, keeps the order', () => {
  const content = version().content;
  const cleaned = cleanAuthorizationContent({
    ...content,
    consents: {
      ...content.consents,
      participation: { ...content.consents.participation!, position: 40 },
    },
    texts: { intro: { ca: '  ', ar: 'مرحبا' }, health_title: { ca: '' } },
    screen_order: ['health', 'document'],
  });
  expect(cleaned.texts).toEqual({ intro: { ar: 'مرحبا' } });
  expect(cleaned.consents.participation?.position).toBe(6);
  expect(cleaned.consents.data_processing?.position).toBe(0);
  expect(cleaned.screen_order).toEqual(['health', 'document']);
});
