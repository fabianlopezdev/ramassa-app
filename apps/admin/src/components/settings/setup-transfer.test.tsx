/**
 * Moving the onboarding setup (RAPP-621): anyone who designs the onboarding
 * downloads it; only an admin imports, after reading a preview and confirming
 * twice. A file that is not an export, or of another version, is named before
 * anything reaches the database.
 */
import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import type { OnboardingSetupImportReport, OnboardingSetupPreview } from '@ramassa/shared/intake';
import { buildAppTermsVersion, buildAuthorizationVersion } from '@ramassa/shared/testing';
import { SetupTransfer } from './setup-transfer';

const FILE = {
  format: 'ramassa.onboarding-setup',
  schema_version: 1,
  app_commit: 'abc1234',
  exported_at: '2026-10-22T10:00:00+00:00',
  screens: [],
  builtin_question_overrides: [],
  builtin_screens: [],
  flow_order: null,
  required_questions: [],
  presets: [],
  document_step_explanation: null,
  app_terms: {
    published: [
      {
        version_number: 1,
        published_at: '2026-10-01T10:00:00+00:00',
        content: buildAppTermsVersion().content,
      },
    ],
    draft: null,
  },
  seasons: [],
  authorization: { published: [], draft: { content: buildAuthorizationVersion().content } },
};

const PREVIEW: OnboardingSetupPreview = {
  canImport: true,
  blockers: [],
  problem: null,
  appCommit: 'abc1234',
  exportedAt: '2026-10-22T10:00:00+00:00',
  counts: { screens: 3, questions: 12 },
  warnings: [
    { code: 'legal_drafts' },
    { code: 'attachment_links', hosts: ['staging.example.org'] },
  ],
  legal: {
    appTerms: { source: 'bundled', imported: false },
    authorization: { source: 'draft', version_number: null, imported: true },
  },
};

const REPORT: OnboardingSetupImportReport = {
  counts: { screens: 3, questions: 12 },
  legal: PREVIEW.legal,
  warnings: PREVIEW.warnings,
};

function renderTransfer(
  canImport = true,
  preview: OnboardingSetupPreview = PREVIEW,
  appCommit: string | null = 'abc1234',
) {
  const onExport = mock(async () => FILE as never);
  const onPreview = mock(async (raw: Readonly<Record<string, unknown>>) => (void raw, preview));
  const onImport = mock(async (raw: Readonly<Record<string, unknown>>) => (void raw, REPORT));
  const onDownload = mock((name: string, text: string) => void [name, text]);
  const view = render(
    <SetupTransfer
      canImport={canImport}
      appCommit={appCommit}
      onExport={onExport}
      onPreview={onPreview}
      onImport={onImport}
      onDownload={onDownload}
    />,
  );
  return { view, onExport, onPreview, onImport, onDownload };
}

function choose(view: ReturnType<typeof render>, text: string) {
  const input = view.getByTestId('setup-import-file') as HTMLInputElement;
  const file = new File([text], 'setup.json', { type: 'application/json' });
  fireEvent.change(input, { target: { files: [file] } });
}

test('download saves one dated file with the export', async () => {
  const { view, onExport, onDownload } = renderTransfer();
  fireEvent.click(view.getByTestId('setup-download'));
  await waitFor(() => expect(onDownload).toHaveBeenCalledTimes(1));
  expect(onExport).toHaveBeenCalledTimes(1);
  const [name, text] = onDownload.mock.calls[0]!;
  expect(name).toMatch(/^ramassa-onboarding-setup-\d{4}-\d{2}-\d{2}\.json$/);
  expect(JSON.parse(text).schema_version).toBe(1);
});

test('the design role downloads but has no import', () => {
  const { view } = renderTransfer(false);
  expect(view.getByTestId('setup-download')).toBeTruthy();
  expect(view.queryByTestId('setup-import-file')).toBeNull();
});

test('a file of another version is named and never sent', async () => {
  const { view, onPreview } = renderTransfer();
  choose(view, JSON.stringify({ ...FILE, schema_version: 7 }));
  await waitFor(() => expect(view.getByTestId('setup-import-refused')).toBeTruthy());
  expect(view.getByTestId('setup-import-refused').getAttribute('data-version')).toBe('7');
  expect(onPreview).not.toHaveBeenCalled();
});

test('a file that is not an export is refused', async () => {
  const { view, onPreview } = renderTransfer();
  choose(view, 'hello');
  await waitFor(() => expect(view.getByTestId('setup-import-refused')).toBeTruthy());
  expect(onPreview).not.toHaveBeenCalled();
});

test('the preview shows counts and warnings, then the import needs a second click', async () => {
  const { view, onPreview, onImport } = renderTransfer();
  choose(view, JSON.stringify(FILE));
  await waitFor(() => expect(view.getByTestId('setup-import-preview')).toBeTruthy());
  // The file as read goes to the database.
  expect(onPreview.mock.calls[0]?.[0]).toEqual(FILE);
  const preview = view.getByTestId('setup-import-preview');
  expect(view.getByTestId('setup-count-questions').textContent).toContain('12');
  expect(preview.querySelectorAll('[data-testid="setup-warnings"] li')).toHaveLength(2);
  fireEvent.click(view.getByTestId('setup-import-confirm'));
  expect(onImport).not.toHaveBeenCalled();
  fireEvent.click(view.getByTestId('setup-import-confirm'));
  await waitFor(() => expect(view.getByTestId('setup-import-report')).toBeTruthy());
  expect(onImport).toHaveBeenCalledTimes(1);
});

test('an organization that already has a setup cannot import', async () => {
  const { view } = renderTransfer(true, {
    ...PREVIEW,
    canImport: false,
    blockers: ['screens', 'app_terms'],
  });
  choose(view, JSON.stringify(FILE));
  await waitFor(() => expect(view.getByTestId('setup-import-blockers')).toBeTruthy());
  expect(view.queryByTestId('setup-import-confirm')).toBeNull();
});

test('a file from another app version is flagged', async () => {
  const { view } = renderTransfer(true, PREVIEW, 'def5678');
  choose(view, JSON.stringify(FILE));
  await waitFor(() => expect(view.getByTestId('setup-commit-differs')).toBeTruthy());
});
