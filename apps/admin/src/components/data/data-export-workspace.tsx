import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { downloadExportCsv, downloadExportXlsx } from '@/lib/data-export-download';
import type { DataExportSearch } from '@/lib/data-export-search';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createDataExport,
  fetchAuditLogPage,
  type AuditLogPage,
  type DataExportRequest,
} from '@ramassa/shared/data-exports';

const SELECT_CLASS =
  'h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function filename(dataset: string, scope: string) {
  return `ramassa-${dataset}-${scope}-${new Date().toISOString().slice(0, 10)}`;
}

function ExportButton({
  label,
  disabled,
  onClick,
}: {
  readonly label: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  return (
    <Button type="button" disabled={disabled} onClick={onClick}>
      {label}
    </Button>
  );
}

function DefaultExportControls({
  dataset,
  startDate,
  endDate,
  busy,
  onExport,
}: {
  readonly dataset: DataExportRequest['dataset'];
  readonly startDate: string;
  readonly endDate: string;
  readonly busy: boolean;
  readonly onExport: (request: DataExportRequest) => void;
}) {
  const { t } = useTranslation('admin');
  const base = {
    dataset,
    scope: 'default' as const,
    ...(startDate === '' ? {} : { startDate }),
    ...(endDate === '' ? {} : { endDate }),
  };
  return (
    <section className="space-y-3 rounded-md border p-4">
      <h2 className="text-lg font-semibold">{t('exportDefaultTitle')}</h2>
      <p className="text-sm text-muted-foreground">{t('exportDefaultDescription')}</p>
      <div className="flex flex-wrap gap-3">
        <ExportButton
          label={t('exportCsv')}
          disabled={busy}
          onClick={() => onExport({ ...base, format: 'csv', confirmed: false })}
        />
        <ExportButton
          label={t('exportXlsx')}
          disabled={busy}
          onClick={() => onExport({ ...base, format: 'xlsx', confirmed: false })}
        />
      </div>
    </section>
  );
}

function FullExportControls({
  dataset,
  startDate,
  endDate,
  busy,
  onExport,
}: {
  readonly dataset: DataExportRequest['dataset'];
  readonly startDate: string;
  readonly endDate: string;
  readonly busy: boolean;
  readonly onExport: (request: DataExportRequest) => void;
}) {
  const { t } = useTranslation('admin');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const disabled = busy || !confirmed || reason.trim().length < 10;
  const base = {
    dataset,
    scope: 'full' as const,
    reason,
    confirmed,
    ...(startDate === '' ? {} : { startDate }),
    ...(endDate === '' ? {} : { endDate }),
  };
  return (
    <section className="space-y-3 rounded-md border border-destructive/40 p-4">
      <h2 className="text-lg font-semibold">{t('exportFullTitle')}</h2>
      <p className="text-sm text-muted-foreground">{t('exportFullDescription')}</p>
      <label className="grid gap-2 text-sm font-medium">
        {t('exportReason')}
        <Textarea
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <label className="flex min-h-12 items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          className="size-5"
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        {t('exportFullConfirm')}
      </label>
      <div className="flex flex-wrap gap-3">
        <ExportButton
          label={t('exportFullCsv')}
          disabled={disabled}
          onClick={() => onExport({ ...base, format: 'csv' })}
        />
        <ExportButton
          label={t('exportFullXlsx')}
          disabled={disabled}
          onClick={() => onExport({ ...base, format: 'xlsx' })}
        />
      </div>
    </section>
  );
}

function AuditTable({ page }: { readonly page: AuditLogPage | null }) {
  const { t } = useTranslation('admin');
  if (page === null) return <p className="text-sm text-muted-foreground">{t('auditLoading')}</p>;
  if (page.rows.length === 0)
    return <p className="text-sm text-muted-foreground">{t('auditEmpty')}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('auditWhen')}</TableHead>
          <TableHead>{t('auditActor')}</TableHead>
          <TableHead>{t('auditAction')}</TableHead>
          <TableHead>{t('auditTarget')}</TableHead>
          <TableHead>{t('auditDetails')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {page.rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
            <TableCell>{row.actor_name}</TableCell>
            <TableCell>{row.action}</TableCell>
            <TableCell>{`${row.target_type} ${row.target_id}`}</TableCell>
            <TableCell className="max-w-96 whitespace-normal break-words">
              {row.changes === null ? '' : JSON.stringify(row.changes)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function DataExportWorkspace({
  search,
  onSearchChange,
}: {
  readonly search: DataExportSearch;
  readonly onSearchChange: (search: DataExportSearch) => void;
}) {
  const { t } = useTranslation('admin');
  const [dataset, setDataset] = useState<DataExportRequest['dataset']>('participants');
  const [exportStart, setExportStart] = useState('');
  const [exportEnd, setExportEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [auditPage, setAuditPage] = useState<AuditLogPage | null>(null);
  const [auditError, setAuditError] = useState(false);
  const [draft, setDraft] = useState(search);

  useEffect(() => setDraft(search), [search]);
  useEffect(() => {
    let cancelled = false;
    setAuditPage(null);
    setAuditError(false);
    void safeAsync(() =>
      fetchAuditLogPage(supabase, {
        ...(search.actor === undefined ? {} : { actorId: search.actor }),
        ...(search.action === undefined ? {} : { action: search.action }),
        ...(search.targetType === undefined ? {} : { targetType: search.targetType }),
        ...(search.target === undefined ? {} : { targetId: search.target }),
        ...(search.start === undefined ? {} : { startDate: search.start }),
        ...(search.end === undefined ? {} : { endDate: search.end }),
        ...(search.cursorAt === undefined ? {} : { cursorCreatedAt: search.cursorAt }),
        ...(search.cursorId === undefined ? {} : { cursorId: search.cursorId }),
      }),
    ).then((result) => {
      if (cancelled) return;
      if (result.ok) setAuditPage(result.value);
      else setAuditError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [search]);

  async function exportData(request: DataExportRequest) {
    setBusy(true);
    setNotice(null);
    const result = await safeAsync(async () => {
      const exportData = await createDataExport(supabase, request);
      const name = filename(exportData.dataset, exportData.scope);
      if (exportData.format === 'csv') downloadExportCsv(exportData, name);
      else await downloadExportXlsx(exportData, name);
      return exportData;
    });
    if (result.ok) {
      const exportData = result.value;
      setNotice(t('exportComplete', { count: exportData.rows.length }));
      const refreshed = await safeAsync(() => fetchAuditLogPage(supabase, {}));
      if (refreshed.ok) setAuditPage(refreshed.value);
    } else {
      setNotice(t('exportFailed'));
    }
    setBusy(false);
  }

  function applyAuditFilters(event: FormEvent) {
    event.preventDefault();
    onSearchChange({ ...draft, cursorAt: undefined, cursorId: undefined });
  }

  return (
    <section className="flex flex-col gap-8 p-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">{t('exportTitle')}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{t('exportDescription')}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="grid gap-2 text-sm font-medium">
          {t('exportDataset')}
          <select
            className={SELECT_CLASS}
            value={dataset}
            onChange={(event) => setDataset(event.target.value as DataExportRequest['dataset'])}
          >
            <option value="participants">{t('exportParticipants')}</option>
            <option value="attendance">{t('exportAttendance')}</option>
            <option value="events">{t('exportEvents')}</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {t('filterStartDate')}
          <Input
            type="date"
            value={exportStart}
            onChange={(event) => setExportStart(event.target.value)}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {t('filterEndDate')}
          <Input
            type="date"
            value={exportEnd}
            onChange={(event) => setExportEnd(event.target.value)}
          />
        </label>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DefaultExportControls
          dataset={dataset}
          startDate={exportStart}
          endDate={exportEnd}
          busy={busy}
          onExport={(request) => void exportData(request)}
        />
        <FullExportControls
          dataset={dataset}
          startDate={exportStart}
          endDate={exportEnd}
          busy={busy}
          onExport={(request) => void exportData(request)}
        />
      </div>
      {notice === null ? null : (
        <p role="status" className="text-sm font-medium">
          {notice}
        </p>
      )}

      <section className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t('auditTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('auditRetention')}</p>
        </div>
        <form className="grid gap-3 md:grid-cols-3" onSubmit={applyAuditFilters}>
          <label className="grid gap-2 text-sm font-medium">
            {t('auditActorId')}
            <Input
              value={draft.actor ?? ''}
              onChange={(event) => setDraft({ ...draft, actor: event.target.value || undefined })}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            {t('auditAction')}
            <Input
              value={draft.action ?? ''}
              onChange={(event) => setDraft({ ...draft, action: event.target.value || undefined })}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            {t('auditTargetType')}
            <Input
              value={draft.targetType ?? ''}
              onChange={(event) =>
                setDraft({ ...draft, targetType: event.target.value || undefined })
              }
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            {t('auditTargetId')}
            <Input
              value={draft.target ?? ''}
              onChange={(event) => setDraft({ ...draft, target: event.target.value || undefined })}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            {t('filterStartDate')}
            <Input
              type="date"
              value={draft.start ?? ''}
              onChange={(event) => setDraft({ ...draft, start: event.target.value || undefined })}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            {t('filterEndDate')}
            <Input
              type="date"
              value={draft.end ?? ''}
              onChange={(event) => setDraft({ ...draft, end: event.target.value || undefined })}
            />
          </label>
          <Button type="submit" className="md:col-span-3 md:w-fit">
            {t('auditApply')}
          </Button>
        </form>
        {auditError ? (
          <p role="alert" className="text-sm text-destructive">
            {t('auditFailed')}
          </p>
        ) : (
          <AuditTable page={auditPage} />
        )}
        {auditPage?.has_more &&
        auditPage.next_cursor_created_at !== null &&
        auditPage.next_cursor_id !== null ? (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onSearchChange({
                ...search,
                cursorAt: auditPage.next_cursor_created_at ?? undefined,
                cursorId: auditPage.next_cursor_id ?? undefined,
              })
            }
          >
            {t('auditNext')}
          </Button>
        ) : null}
      </section>
    </section>
  );
}
