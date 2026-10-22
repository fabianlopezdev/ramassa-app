/**
 * Moving the onboarding setup between organizations (RAPP-621): Marc designs
 * it on staging, and at launch an admin downloads it there and imports it
 * into production.
 *
 * Download: anyone who designs the onboarding saves one dated JSON file.
 * Import: admins only (settings.organization). The chosen file is read with
 * the shared schema first, so a file of another version or not an export is
 * named before anything is sent; then the database previews the import (what
 * it creates, what it warns about, what blocks it) and imports only after a
 * second click. The legal texts arrive as drafts for an admin to publish.
 */

import { Button } from '@/components/ui/button';
import { useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  onboardingSetupFileName,
  readOnboardingSetupFile,
  type OnboardingSetupDocument,
  type OnboardingSetupImportReport,
  type OnboardingSetupPreview,
  type OnboardingSetupWarning,
} from '@ramassa/shared/intake';

type Raw = Readonly<Record<string, unknown>>;

/** The counts, in the order the onboarding page shows its sections. */
const COUNT_KEYS = [
  'screens',
  'questions',
  'options',
  'builtin_screens',
  'builtin_question_overrides',
  'flow_order_steps',
  'required_questions',
  'presets',
  'document_step_explanation',
  'app_terms_versions',
  'seasons',
  'authorization_versions',
] as const;

const BLOCKER_KEYS = [
  'screens',
  'questions',
  'builtin_question_overrides',
  'builtin_screens',
  'flow_order',
  'required_questions',
  'presets',
  'document_step_explanation',
  'app_terms',
  'seasons',
  'authorization',
] as const;

const WARNING_KEYS = [
  'legal_drafts',
  'app_terms_history',
  'authorization_history',
  'attachment_links',
  'no_current_season',
] as const;

type Refusal =
  | { readonly reason: 'not_setup' }
  | { readonly reason: 'version_not_number' }
  | { readonly reason: 'unknown_version'; readonly version: unknown }
  | { readonly reason: 'damaged' }
  | { readonly reason: 'empty' };

/** The message of each refusal the file reader names. */
const REFUSAL_MESSAGE_KEYS = {
  not_setup: 'setupTransfer.notSetup',
  version_not_number: 'setupTransfer.versionNotNumber',
  unknown_version: 'setupTransfer.unknownVersion',
  damaged: 'setupTransfer.damaged',
  empty: 'setupTransfer.empty',
} as const satisfies Record<Refusal['reason'], string>;

/** `ONBOARDING_SETUP/EMPTY: ...` from the database, as its code and its sentence. */
function databaseProblem(problem: string): {
  readonly code: string | null;
  readonly sentence: string;
} {
  const match = /^ONBOARDING_SETUP\/([A-Z_]+): ([\s\S]*)$/.exec(problem);
  return match === null
    ? { code: null, sentence: problem }
    : { code: match[1]!, sentence: match[2]! };
}

type Stage =
  | { readonly kind: 'idle' }
  | { readonly kind: 'refused'; readonly refusal: Refusal }
  | { readonly kind: 'previewing' }
  | {
      readonly kind: 'preview';
      readonly raw: Raw;
      readonly document: OnboardingSetupDocument;
      readonly preview: OnboardingSetupPreview;
    }
  | { readonly kind: 'importing' }
  | { readonly kind: 'imported'; readonly report: OnboardingSetupImportReport }
  | { readonly kind: 'failed' };

export interface SetupTransferProps {
  /** settings.organization: only an admin imports. */
  readonly canImport: boolean;
  /** This admin build's commit, written in the file and compared on import. */
  readonly appCommit: string | null;
  readonly onExport: () => Promise<OnboardingSetupDocument>;
  readonly onPreview: (raw: Raw) => Promise<OnboardingSetupPreview>;
  readonly onImport: (raw: Raw) => Promise<OnboardingSetupImportReport>;
  /** Hands the browser a file to save. */
  readonly onDownload: (name: string, text: string) => void;
}

export function SetupTransfer({
  canImport,
  appCommit,
  onExport,
  onPreview,
  onImport,
  onDownload,
}: SetupTransferProps) {
  const { t } = useTranslation('settings');
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'working' | 'done' | 'failed'>(
    'idle',
  );
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [isConfirming, setIsConfirming] = useState(false);

  async function download() {
    setDownloadStatus('working');
    try {
      const document = await onExport();
      onDownload(onboardingSetupFileName(new Date()), `${JSON.stringify(document, null, 2)}\n`);
      setDownloadStatus('done');
    } catch {
      setDownloadStatus('failed');
    }
  }

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setIsConfirming(false);
    if (file === undefined) return;
    const read = readOnboardingSetupFile(await file.text());
    if (!read.ok) {
      setStage({
        kind: 'refused',
        refusal:
          read.reason === 'unknown_version'
            ? { reason: 'unknown_version', version: read.version }
            : { reason: read.reason },
      });
      return;
    }
    setStage({ kind: 'previewing' });
    try {
      const preview = await onPreview(read.raw);
      setStage({ kind: 'preview', raw: read.raw, document: read.document, preview });
    } catch {
      setStage({ kind: 'failed' });
    }
  }

  async function confirm(raw: Raw) {
    if (!isConfirming) {
      setIsConfirming(true);
      return;
    }
    setIsConfirming(false);
    setStage({ kind: 'importing' });
    try {
      setStage({ kind: 'imported', report: await onImport(raw) });
    } catch {
      setStage({ kind: 'failed' });
    }
  }

  return (
    <section
      className="flex max-w-3xl flex-col gap-4 rounded-xl border bg-card p-5"
      data-testid="setup-transfer"
      aria-labelledby="setup-transfer-title"
    >
      <div className="flex flex-col gap-1">
        <h2 id="setup-transfer-title" className="text-start text-lg font-semibold">
          {t('setupTransfer.title')}
        </h2>
        <p className="text-start text-sm text-muted-foreground">{t('setupTransfer.intro')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={downloadStatus === 'working'}
          onClick={() => void download()}
          data-testid="setup-download"
        >
          {t('setupTransfer.download')}
        </Button>
        {downloadStatus === 'done' ? (
          <p aria-live="polite" className="text-start text-sm text-muted-foreground">
            {t('setupTransfer.downloaded')}
          </p>
        ) : null}
        {downloadStatus === 'failed' ? (
          <p role="alert" className="text-start text-sm text-destructive">
            {t('setupTransfer.downloadFailed')}
          </p>
        ) : null}
      </div>

      {canImport ? (
        <div className="flex flex-col gap-3 border-t pt-4">
          <h3 className="text-start text-base font-semibold">{t('setupTransfer.importTitle')}</h3>
          <p className="text-start text-sm text-muted-foreground">
            {t('setupTransfer.importIntro')}
          </p>
          <label className="flex flex-col gap-1 text-start text-sm font-medium">
            {t('setupTransfer.chooseFile')}
            <input
              type="file"
              accept="application/json,.json"
              className="text-sm"
              onChange={(event) => void choose(event)}
              disabled={stage.kind === 'previewing' || stage.kind === 'importing'}
              data-testid="setup-import-file"
            />
          </label>

          {stage.kind === 'refused' ? (
            <p
              role="alert"
              className="text-start text-sm text-destructive"
              data-testid="setup-import-refused"
              data-reason={stage.refusal.reason}
              data-version={
                stage.refusal.reason === 'unknown_version'
                  ? String(stage.refusal.version)
                  : undefined
              }
            >
              {stage.refusal.reason === 'unknown_version'
                ? t(REFUSAL_MESSAGE_KEYS.unknown_version, {
                    version: String(stage.refusal.version),
                  })
                : t(REFUSAL_MESSAGE_KEYS[stage.refusal.reason])}
            </p>
          ) : null}
          {stage.kind === 'previewing' ? (
            <p aria-live="polite" className="text-start text-sm text-muted-foreground">
              {t('setupTransfer.previewing')}
            </p>
          ) : null}
          {stage.kind === 'failed' ? (
            <p role="alert" className="text-start text-sm text-destructive">
              {t('setupTransfer.failed')}
            </p>
          ) : null}

          {stage.kind === 'preview' ? (
            <SetupPreview
              preview={stage.preview}
              appCommit={appCommit}
              isConfirming={isConfirming}
              onConfirm={() => void confirm(stage.raw)}
              onCancel={() => {
                setIsConfirming(false);
                setStage({ kind: 'idle' });
              }}
            />
          ) : null}
          {stage.kind === 'importing' ? (
            <p aria-live="polite" className="text-start text-sm text-muted-foreground">
              {t('setupTransfer.importing')}
            </p>
          ) : null}
          {stage.kind === 'imported' ? <SetupReport report={stage.report} /> : null}
        </div>
      ) : null}
    </section>
  );
}

function Counts({ counts }: { readonly counts: Readonly<Record<string, number>> }) {
  const { t } = useTranslation('settings');
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
      {COUNT_KEYS.map((key) => (
        <div key={key} className="flex justify-between gap-2" data-testid={`setup-count-${key}`}>
          <dt className="text-start text-sm text-muted-foreground">
            {t(`setupTransfer.count.${key}`)}
          </dt>
          <dd className="text-end text-sm font-medium tabular-nums">{counts[key] ?? 0}</dd>
        </div>
      ))}
    </dl>
  );
}

function warningText(
  t: (key: string, options?: Record<string, unknown>) => string,
  warning: OnboardingSetupWarning,
): string | null {
  if (!(WARNING_KEYS as readonly string[]).includes(warning.code)) return null;
  return t(`setupTransfer.warning.${warning.code}`, {
    count: warning.count ?? 0,
    hosts: (warning.hosts ?? []).join(', '),
  });
}

function LegalPlan({ legal }: { readonly legal: OnboardingSetupPreview['legal'] }) {
  const { t } = useTranslation('settings');
  return (
    <ul className="flex list-disc flex-col gap-1 ps-5 text-start text-sm" data-testid="setup-legal">
      <li>
        {t(`setupTransfer.legal.appTerms.${legal.appTerms.source}`, {
          number: legal.appTerms.version_number ?? '',
        })}
      </li>
      <li>
        {t(`setupTransfer.legal.authorization.${legal.authorization.source}`, {
          number: legal.authorization.version_number ?? '',
          season: legal.authorization.season_name ?? '',
        })}
      </li>
    </ul>
  );
}

function SetupPreview({
  preview,
  appCommit,
  isConfirming,
  onConfirm,
  onCancel,
}: {
  readonly preview: OnboardingSetupPreview;
  readonly appCommit: string | null;
  readonly isConfirming: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation('settings');
  const warnings = preview.warnings
    .map((warning) => warningText(t, warning))
    .filter((text): text is string => text !== null);
  const commitDiffers =
    preview.appCommit !== null && appCommit !== null && preview.appCommit !== appCommit;
  const problem = preview.problem === null ? null : databaseProblem(preview.problem);
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4" data-testid="setup-import-preview">
      <h4 className="text-start text-sm font-semibold">{t('setupTransfer.previewTitle')}</h4>
      <p className="text-start text-sm text-muted-foreground">
        {t('setupTransfer.previewSource', {
          date: preview.exportedAt === null ? '' : new Date(preview.exportedAt).toLocaleString(),
          commit: preview.appCommit ?? t('setupTransfer.noCommit'),
        })}
      </p>
      <Counts counts={preview.counts} />
      <LegalPlan legal={preview.legal} />
      {commitDiffers ? (
        <p className="text-start text-sm font-medium" data-testid="setup-commit-differs">
          {t('setupTransfer.commitDiffers', { file: preview.appCommit, app: appCommit })}
        </p>
      ) : null}
      {warnings.length > 0 ? (
        <ul
          className="flex list-disc flex-col gap-1 ps-5 text-start text-sm"
          data-testid="setup-warnings"
        >
          {warnings.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      ) : null}
      {preview.blockers.length > 0 ? (
        <div role="alert" className="flex flex-col gap-1" data-testid="setup-import-blockers">
          <p className="text-start text-sm font-medium text-destructive">
            {t('setupTransfer.blockersTitle')}
          </p>
          <ul className="flex list-disc flex-col gap-1 ps-5 text-start text-sm">
            {preview.blockers.map((blocker) => (
              <li key={blocker}>
                {(BLOCKER_KEYS as readonly string[]).includes(blocker)
                  ? t(`setupTransfer.blocker.${blocker}`)
                  : blocker}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {problem !== null ? (
        <p
          role="alert"
          className="text-start text-sm text-destructive"
          data-testid="setup-import-problem"
          data-problem={problem.sentence}
        >
          {problem.code === 'EMPTY'
            ? t(REFUSAL_MESSAGE_KEYS.empty)
            : t('setupTransfer.problem', { problem: problem.sentence })}
        </p>
      ) : null}
      {isConfirming ? (
        <p role="alert" className="text-start text-sm font-medium">
          {t('setupTransfer.confirmAlert')}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {preview.canImport ? (
          <Button
            type="button"
            variant={isConfirming ? 'destructive' : 'default'}
            onClick={onConfirm}
            data-testid="setup-import-confirm"
          >
            {isConfirming ? t('setupTransfer.confirmAgain') : t('setupTransfer.confirm')}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('setupTransfer.cancel')}
        </Button>
      </div>
    </div>
  );
}

function SetupReport({ report }: { readonly report: OnboardingSetupImportReport }) {
  const { t } = useTranslation('settings');
  const mustPublish = report.legal.appTerms.imported || report.legal.authorization.imported;
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4" data-testid="setup-import-report">
      <p aria-live="polite" className="text-start text-sm font-semibold">
        {t('setupTransfer.imported')}
      </p>
      <Counts counts={report.counts} />
      <LegalPlan legal={report.legal} />
      {mustPublish ? (
        <p className="text-start text-sm font-medium" data-testid="setup-must-publish">
          {t('setupTransfer.mustPublish')}
        </p>
      ) : null}
    </div>
  );
}
